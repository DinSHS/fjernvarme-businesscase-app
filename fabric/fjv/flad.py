"""Case-YAML <-> blade (KONTRAKT v2 §3.2).

``flad(tekst)`` gør en case-YAML til en liste af ``Parameter`` — én pr. blad —
og ``afflad(params)`` bygger dict'en igen. Rundturen er bevist med **type-streng**
lighed (``ligner_strengt``): ``1 == 1.0`` og ``True == 1`` er sande i Python,
men en værdi der kommer tilbage som float i stedet for int, er en anden
YAML — og ``config.py`` validerer typer.

Formatet (afgrænset efter K1-F16):

* Værdier er YAML's JSON-kompatible delmængde med strengenøgler uden punktum.
* Dicts rekurseres; skalarer **og lister** er blade (også lister af dicts som
  ``cop_curve.points``). En **tom dict** er bladet ``{}``.
* Ankre/aliases udfoldes til uafhængige værdier. Afvises med stien i fejlen:
  cykliske aliases, merge-nøgler (``<<``), dublerede nøgler, ikke-strengenøgler,
  nøgler med ``.`` eller tomme nøgler, datoobjekter, NaN/±Inf og andre
  ikke-JSON-typer.
* ``kommentar``: kommentarblokken lige over nøglen (stopper ved tom linje eller
  kode) + kommentaren på selve linjen. For et blad over flere linjer (en liste)
  samles kommentarerne på de følgende linjer med punktets indeks: ``[1] COP 2.91``.
* ``bekraeft``: bladet, dets kommentar eller en overliggende sektions kommentar
  (kommentarblokken over en dict-nøgle) bærer ``[BEKRÆFT``, ``[TBC`` eller
  ``(BEKRÆFT``. Parentesformen er med, fordi Billund-filerne skriver
  sektionsoverskriften ``PRISER OG AFGIFTER (BEKRÆFT: kopieret fra H2 2025 …)``
  i netop den betydning.
* ``raekkefoelge``: nøglens linjenummer (1-baseret) i kildefilen.

Fladeren fejler **højlydt** frem for at gætte: en stille omfortolkning af en
værdi er netop den fejl, en revisionsspor-tabel ikke kan opdage bagefter.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import asdict, dataclass

import yaml

MAX_STI = 400
MAX_VAERDI = 4000
MAX_KOMMENTAR = 2000
OBJEKT_SEKTIONER = ("units", "storage", "prices")
_MARKOER = re.compile(r"[\[(](BEKRÆFT|TBC)\b", re.IGNORECASE)
_MERGE_TAG = "tag:yaml.org,2002:merge"


class FladFejl(ValueError):
    """Casen kan ikke repræsenteres tabsfrit. Beskeden nævner stien."""


@dataclass
class Parameter:
    sti: str
    vaerdi_json: str
    sektion: str
    objekt: str | None
    kommentar: str | None
    bekraeft: bool
    raekkefoelge: int

    def dict(self) -> dict:
        return asdict(self)


# ------------------------------------------------------------------ JSON

def til_json(v, sti: str = "?") -> str:
    """Kompakt, deterministisk JSON. Afviser alt uden for JSON-delmængden."""
    _tjek_json(v, sti, set())
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _tjek_json(v, sti: str, stak: set) -> None:
    if v is None or isinstance(v, (bool, str)):
        return
    if isinstance(v, int):
        return
    if isinstance(v, float):
        if not math.isfinite(v):
            raise FladFejl(f"{sti}: {v} er ikke en endelig JSON-værdi")
        return
    if isinstance(v, (list, dict)):
        if id(v) in stak:
            raise FladFejl(f"{sti}: cyklisk alias")
        stak.add(id(v))
        if isinstance(v, list):
            for i, x in enumerate(v):
                _tjek_json(x, f"{sti}[{i}]", stak)
        else:
            for k, x in v.items():
                if not isinstance(k, str):
                    raise FladFejl(f"{sti}: nøglen {k!r} er ikke en streng")
                _tjek_json(x, f"{sti}.{k}", stak)
        stak.discard(id(v))
        return
    raise FladFejl(f"{sti}: typen {type(v).__name__} ({v!r}) er ikke JSON-kompatibel "
                   "(sæt fx en dato i anførselstegn)")


# ------------------------------------------------------------------ kommentarer

def _kommentar_paa_linje(linje: str) -> str | None:
    """Tekst efter et ``#`` uden for anførselstegn, eller None."""
    i_enkelt = i_dobbelt = False
    for i, c in enumerate(linje):
        if c == "'" and not i_dobbelt:
            i_enkelt = not i_enkelt
        elif c == '"' and not i_enkelt and (i == 0 or linje[i - 1] != "\\"):
            i_dobbelt = not i_dobbelt
        elif c == "#" and not i_enkelt and not i_dobbelt and (i == 0 or linje[i - 1] in " \t"):
            return linje[i + 1:].strip()
    return None


def _blok_over(linjer: list[str], idx: int) -> list[str]:
    """Sammenhængende kommentarlinjer lige over linje ``idx`` (0-baseret)."""
    ud: list[str] = []
    j = idx - 1
    while j >= 0:
        s = linjer[j].strip()
        if not s.startswith("#"):
            break
        tekst = s.lstrip("#").strip()
        # Rene skillelinjer (# ----, # ====) bærer ingen mening for brugeren.
        if tekst and not re.fullmatch(r"[-=_*~ ]+", tekst):
            ud.append(tekst)
        j -= 1
    return list(reversed(ud))


# ------------------------------------------------------------------ fladning

def flad(tekst: str) -> list[Parameter]:
    """Flad en case-YAML til blade. Rejser ``FladFejl`` med stien ved alt tvivlsomt."""
    try:
        rod = yaml.compose(tekst, Loader=yaml.SafeLoader)
    except yaml.YAMLError as fejl:
        raise FladFejl(f"ugyldig YAML: {fejl}") from fejl
    if rod is None:
        raise FladFejl("tom YAML")
    if not isinstance(rod, yaml.MappingNode):
        raise FladFejl("roden skal være en mapping")
    linjer = tekst.splitlines()
    konstr = yaml.constructor.SafeConstructor()
    ud: list[Parameter] = []

    def valider_graf(node, sti, stak):
        """Hele nodegrafen under et blad FØR konstruktion (K2-F11).

        SafeConstructor overskriver en dubleret nøgle i en mapping inde i en liste
        tavst (``[{x: 1, x: 2}]`` -> ``[{x: 2}]``), så dubletten skal fanges på
        noderne. Samme regler som for flade nøgler: strenge, ikke tomme, intet punktum.
        """
        if id(node) in stak:
            raise FladFejl(f"{sti}: cyklisk alias")
        stak = stak | {id(node)}
        if isinstance(node, yaml.SequenceNode):
            for i, x in enumerate(node.value):
                valider_graf(x, f"{sti}[{i}]", stak)
        elif isinstance(node, yaml.MappingNode):
            set_ = set()
            for kn, vn in node.value:
                if kn.tag == _MERGE_TAG:
                    raise FladFejl(f"{sti}: merge-nøgle '<<' understøttes ikke")
                if not isinstance(kn, yaml.ScalarNode) or kn.tag != "tag:yaml.org,2002:str":
                    raise FladFejl(f"{sti}: nøglen {getattr(kn, 'value', kn)!r} er ikke en streng")
                if not kn.value or "." in kn.value:
                    raise FladFejl(f"{sti}.{kn.value}: nøgler må ikke være tomme eller indeholde '.'")
                if kn.value in set_:
                    raise FladFejl(f"{sti}.{kn.value}: nøglen står to gange")
                set_.add(kn.value)
                valider_graf(vn, f"{sti}.{kn.value}", stak)

    def vaerdi(node, sti):
        valider_graf(node, sti, set())
        try:
            v = konstr.construct_object(node, deep=True)
        except yaml.YAMLError as fejl:
            raise FladFejl(f"{sti}: {fejl}") from fejl
        return til_json(v, sti)

    def kommentar_for(knude_k, knude_v) -> str | None:
        l0 = knude_k.start_mark.line
        dele = _blok_over(linjer, l0)
        inline = _kommentar_paa_linje(linjer[l0]) if l0 < len(linjer) else None
        if inline:
            dele.append(inline)
        # Blad over flere linjer: kommentarer pr. listepunkt med indeks.
        # end_mark i kolonne 0 peger på starten af NÆSTE linje (næste nøgle);
        # den linje hører ikke til bladet. En blokskalar (| eller >) er tekst,
        # ikke kode - et '#' i den er ikke en kommentar.
        slut = knude_v.end_mark.line - (1 if knude_v.end_mark.column == 0 else 0)
        blokskalar = isinstance(knude_v, yaml.ScalarNode) and knude_v.style in ("|", ">")
        # Kun for BLADE: en dict-nøgles linjer er dens børns linjer, og et
        # [BEKRÆFT] på ét blad ville ellers smitte hele sektionen (målt: 132 af
        # Andebys units-blade blev markeret af et par inline-markører).
        sektion = isinstance(knude_v, yaml.MappingNode) and bool(knude_v.value)
        if slut > l0 and not blokskalar and not sektion:
            punkt_linje = {}
            if isinstance(knude_v, yaml.SequenceNode):
                for i, p in enumerate(knude_v.value):
                    punkt_linje.setdefault(p.start_mark.line, i)
            for ln in range(l0 + 1, min(slut + 1, len(linjer))):
                k = _kommentar_paa_linje(linjer[ln])
                if not k or linjer[ln].strip().startswith("#"):
                    continue
                if ln in punkt_linje:
                    dele.append(f"[{punkt_linje[ln]}] {k}")
                else:
                    dele.append(k)
        return "\n".join(dele) if dele else None

    def gaa(node, sti_dele: list[str], arvet: bool, stak: set):
        if id(node) in stak:
            raise FladFejl(f"{'.'.join(sti_dele)}: cyklisk alias")
        stak = stak | {id(node)}
        set_noegler: set[str] = set()
        for kn, vn in node.value:
            if kn.tag == _MERGE_TAG:
                raise FladFejl(f"{'.'.join(sti_dele) or '<rod>'}: merge-nøgle '<<' "
                               "understøttes ikke - skriv værdierne ud")
            if not isinstance(kn, yaml.ScalarNode) or kn.tag != "tag:yaml.org,2002:str":
                raise FladFejl(f"{'.'.join(sti_dele) or '<rod>'}: nøglen "
                               f"{getattr(kn, 'value', kn)!r} er ikke en streng")
            k = kn.value
            sti = ".".join(sti_dele + [k])
            if not k or "." in k:
                raise FladFejl(f"{sti}: nøgler må ikke være tomme eller indeholde '.'")
            if k in set_noegler:
                raise FladFejl(f"{sti}: nøglen står to gange")
            set_noegler.add(k)
            if len(sti) > MAX_STI:
                raise FladFejl(f"{sti[:80]}…: stien er over {MAX_STI} tegn")
            kom = kommentar_for(kn, vn)
            markeret = arvet or bool(kom and _MARKOER.search(kom))
            if isinstance(vn, yaml.MappingNode) and vn.value:
                gaa(vn, sti_dele + [k], markeret, stak)
                continue
            vj = vaerdi(vn, sti)
            if len(vj) > MAX_VAERDI:
                raise FladFejl(f"{sti}: værdien er {len(vj)} tegn (maks {MAX_VAERDI})")
            if kom and len(kom) > MAX_KOMMENTAR:
                # Ikke tavs: markeret og henvist til kildefilen, som gemmes uændret.
                kom = kom[:MAX_KOMMENTAR - 40] + " ... [afkortet, se kilde.yaml]"
            if isinstance(vn, yaml.ScalarNode) and vn.value and _MARKOER.search(str(vn.value)):
                markeret = True
            dele = sti_dele + [k]
            ud.append(Parameter(
                sti=sti, vaerdi_json=vj, sektion=dele[0],
                objekt=dele[1] if len(dele) > 2 and dele[0] in OBJEKT_SEKTIONER else None,
                kommentar=kom, bekraeft=markeret, raekkefoelge=kn.start_mark.line + 1))

    gaa(rod, [], False, set())
    return ud


# ------------------------------------------------------------------ affladning

def afflad(params) -> dict:
    """Byg dict'en igen. Accepterer ``Parameter`` eller dicts med ``sti``/``vaerdi_json``.

    Rækkefølgen følger ``raekkefoelge`` når den findes (kildefilens orden), ellers
    listens orden. Et blad og et dybere blad på samme sti er en konflikt.
    """
    rækker = [p.dict() if isinstance(p, Parameter) else dict(p) for p in params]
    if all("raekkefoelge" in r and r["raekkefoelge"] is not None for r in rækker):
        rækker.sort(key=lambda r: r["raekkefoelge"])
    ud: dict = {}
    set_stier: set[str] = set()
    for r in rækker:
        sti = r["sti"]
        if sti in set_stier:
            raise FladFejl(f"{sti}: stien står to gange")
        set_stier.add(sti)
        dele = sti.split(".")
        d = ud
        for i, k in enumerate(dele[:-1]):
            nxt = d.setdefault(k, {})
            if not isinstance(nxt, dict) or (".".join(dele[:i + 1]) in set_stier):
                raise FladFejl(f"{sti}: {'.'.join(dele[:i + 1])} er allerede et blad")
            d = nxt
        if dele[-1] in d:
            raise FladFejl(f"{sti}: er allerede en sektion")
        d[dele[-1]] = json.loads(r["vaerdi_json"])
    return ud


def ligner_strengt(a, b, sti: str = "") -> str | None:
    """None hvis a og b er ens med typer (int ≠ float ≠ bool); ellers første forskel."""
    if type(a) is not type(b):
        return f"{sti or '<rod>'}: {type(a).__name__} {a!r} mod {type(b).__name__} {b!r}"
    if isinstance(a, dict):
        if list(a) != list(b):
            return f"{sti or '<rod>'}: nøgler {list(a)} mod {list(b)}"
        for k in a:
            f = ligner_strengt(a[k], b[k], f"{sti}.{k}" if sti else k)
            if f:
                return f
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{sti}: længde {len(a)} mod {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            f = ligner_strengt(x, y, f"{sti}[{i}]")
            if f:
                return f
        return None
    if isinstance(a, float) and math.isnan(a) and math.isnan(b):
        return None
    return None if a == b else f"{sti}: {a!r} mod {b!r}"
