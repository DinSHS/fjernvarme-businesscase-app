"""Beviset: appens bestillingsvej giver samme kørsel som ``run_case.py`` direkte på modelrepoet.

For hver case i modelrepoets ``cases/`` (ikke ``heat_load_params_*``) køres samme korte vindue to gange med
modelrepoets egen kommando for casen (``fjv.modelkoersel.standard``: casens "KØRES MED"-kommentar eller README's
tabel; uden kommando: appens egen antagelse, uden balancemarked og med syntetisk varmelast):

  A) direkte:  python run_case.py cases/<fil> --data-source github [flag] --start … --end … --out-dir …
  B) appen:    casen som blade (fjv.flad) -> frosset input (fjv.byg_case.raekker_fra_vaerk, som startBestilling)
               -> case.yaml + argv (fjv.byg_case.byg) -> fabric/fjv/model_wrapper.py, som fjv.koersel kører den

og der sammenlignes: modellens FULDE objektiv, ``_hourly.csv`` og ``_kpi.csv`` byte for byte. Én kørsel ad gangen.

Objektivet er modellens eget, uafrundede tal: attributten ``objective_value`` i ``<stem>_dispatch.nc``, som
``run_case.py`` skriver for begge veje (``run_case.py:733``, ``src/solve.py:216``). Manifestets ``objektiv_dkk`` er
afrundet til hele kroner (``src/manifest.py:208``) og bruges kun til udskriften: 866.567,51 og 866.568,49 kr. står
begge som 866.568 dér (efterprøvningen af rettelserne i runde 15, fund H). De to filer sammenlignes på hele deres
SHA-256 (før: de første 16 hextegn).

En case BESTÅR, når — og kun når — alle tre er ens (``bestaaet``). A er modelrepoets EGEN casefil, B appens (skrevet
fra bladene). Med to eller flere lagre er fordelingen mellem dem ikke entydig (runde 15, den uafhængige test
18. november 2026): solveren kan vælge en anden fordeling for de to filer med samme objektiv og samlede lager. Afviger
timefilerne, er casen en ``FORSKEL`` — og beviset skriver en DIAGNOSE ved siden af (``lagersum.py``): om det kun er
fordelingen mellem lagrene, og om samlet niveau, netto, opladning og afladning er ens. Diagnosen giver aldrig en
bestået case. (Runde 15 lod en sådan case bestå som ``ENS*``; kodegennemgangen, fund 7, viste, at reglen kunne skjule
ændrede resultater. Ingen målt case har udløst den.)

    python viden/vaerktoej/bevis_app_vej.py --model <modelrepo> [--ud <mappe>] [case.yaml …]

``--model`` er en klon af modelrepoet med den pinnede commit tjekket ud (``MODEL_COMMIT`` i fabric/fjv/konstanter.py)
og modellens pakker installeret i det Python, der kører scriptet (``pip install -r <modelrepo>/requirements.txt``).
Begge veje bruger samme df-data-klon (``<modelrepo>/data/df-data``; run_case.py kloner den første gang), så
sammenligningen gælder uanset dens commit — men tallene i CHANGELOG/TROFASTHED er målt med ``DF_DATA_SHA``.
Windows: hold ``--ud`` kort (fx ``C:\\fjvb``); modellens filnavne er lange, og grænsen er 260 tegn pr. sti.
Exit 0, når alle cases er ens; 1 ellers. Kun standardbibliotek + PyYAML og xarray (begge fra modellens pakker;
xarray læser ``_dispatch.nc``).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
ROD = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROD / "fabric"))
from fjv import konstanter as K, modelkoersel as MK  # noqa: E402
from fjv.byg_case import byg, raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lagersum  # noqa: E402


def _sha(p: Path) -> str:
    """Hele SHA-256 af filens bytes (fund H: før de første 16 hextegn, 64 af 256 bit)."""
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _objektiv_fuldt(ud: Path) -> float:
    """Modellens uafrundede objektiv: ``objective_value`` på resultatet, som ``run_case.py`` gemmer i
    ``<stem>_dispatch.nc``. Kaster, hvis filen eller attributten mangler — beviset falder ikke tilbage til manifestets
    hele kroner."""
    import xarray as xr                      # modellens pakke; importeres først her, så --help virker uden
    with xr.open_dataset(next(ud.glob("*_dispatch.nc"))) as ds:
        return float(ds.attrs["objective_value"])


def _resultat(ud: Path) -> dict:
    m = json.loads(next(ud.glob("*_manifest.json")).read_text(encoding="utf-8"))
    return {"objektiv": m["noegletal"]["objektiv_dkk"],          # hele kroner — kun til udskriften
            "objektiv_fuldt": _objektiv_fuldt(ud),
            "hourly": _sha(next(ud.glob("*_hourly.csv"))), "kpi": _sha(next(ud.glob("*_kpi.csv")))}


def bestaaet(a: dict, b: dict) -> bool:
    """Beståelseskravet for én case: modellens fulde objektiv er det samme tal (en endelig double, ikke et afrundet),
    og ``_hourly.csv`` og ``_kpi.csv`` er ens byte for byte — sammenlignet på hele SHA-256 (``_resultat``). Intet andet
    består: ikke en timefil, der "kun" afviger i fordelingen mellem lagre (kodegennemgangen af runde 15, fund 7;
    diagnosen står i ``lagersum.py``), og ikke to objektiver, der blot afrunder til samme krone (efterprøvningen,
    fund H). Uden et fuldt, endeligt objektiv på begge sider består casen ikke."""
    fulde = [x.get("objektiv_fuldt") for x in (a, b)]
    if not all(isinstance(f, float) and math.isfinite(f) for f in fulde):
        return False
    return a == b


def _git_head(mappe: Path) -> str | None:
    r = subprocess.run(["git", "-C", str(mappe), "rev-parse", "HEAD"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def _df_data_sha(mappe: Path) -> str | None:
    """df-data-mappens commit: arbejderens markør (en udpakket zip ved en SHA), ellers klonens HEAD.

    Runde 15: for en udpakket zip inde i en modelklon svarede ``git rev-parse HEAD`` med MODELrepoets HEAD (git går op
    til nærmeste repo), og beviset skrev "df-data 939228a" om en mappe ved 106b9fc. En mappe uden egen ``.git/HEAD`` er
    ikke en klon og spørges ikke."""
    markoer = mappe / K.KOMPLET_MARKOER
    if markoer.is_file():
        try:
            return json.loads(markoer.read_text(encoding="utf-8"))["sha"]
        except (ValueError, KeyError):
            return None
    return _git_head(mappe) if (mappe / ".git" / "HEAD").is_file() else None


def diagnosticer(a_ud: Path, b_ud: Path) -> dict:
    """Diagnosen af to FORSKELLIGE timefiler (``lagersum.py``) — eller, hvis den ikke kan laves, hvorfor.

    Tredje rettelsesrunde i runde 15, P3-3: diagnosen kaster aldrig. Casen er allerede en FORSKEL, når den kaldes
    (``bestaaet`` sammenligner filernes bytes); diagnosen læser dem som TEKST, og en timefil med fx en ugyldig
    UTF-8-byte gav ``UnicodeDecodeError`` uden for fejlgrenen — programmet stoppede før de næste cases og før
    ``resultat.json``. Nu står fejlen i casens række (``fejl`` med navnet på den side, hvis fil ikke kunne læses), og
    ``ens_paa_sum`` findes ikke: en fejlet diagnose tæller aldrig som "kun fordelingen mellem lagre"."""
    tekster = []
    for side, ud in (("den direkte kørsels timefil", a_ud), ("appens timefil", b_ud)):
        try:
            tekster.append(next(ud.glob("*_hourly.csv")).read_text(encoding="utf-8"))
        except (OSError, UnicodeError, StopIteration) as e:
            fejl = f"{side} kunne ikke læses som tekst: {type(e).__name__}: {e}"[:600]
            return {"fejl": fejl, "tekst": f"diagnosen kunne ikke laves: {fejl}"}
    try:
        ls = lagersum.sammenlign(*tekster)
        return {**{k: ls[k] for k in ("ens_paa_sum", "sum", "lagre", "maks_pr_lager_mwh", "forskelle")},
                "tekst": lagersum.diagnose(ls)}
    except Exception as e:                                        # noqa: BLE001 — diagnosen er ikke dommen; den må ikke vælte rapporten
        fejl = f"{type(e).__name__}: {e}"[:600]
        return {"fejl": fejl, "tekst": f"diagnosen kunne ikke laves: {fejl}"}


def main(argv: list[str]) -> int:
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("--model", type=Path, default=os.environ.get("FJV_MODELMAPPE") or ROD.parent / "fjernvarme-businesscase",
                   help="modelrepoet ved den pinnede commit (standard: FJV_MODELMAPPE eller søstermappen)")
    a.add_argument("--ud", type=Path, default=ROD / "_lokal" / "bevis", help="uddata (git-ignoreret; hold stien kort)")
    a.add_argument("--start", default="2026-03-10")
    a.add_argument("--slut", default="2026-03-11")
    a.add_argument("--uden-committjek", action="store_true",
                   help="godtag en modelmappe, der ikke er en git-klon ved pinnen (fx en udpakket zip); skriver en advarsel")
    a.add_argument("cases", nargs="*", help="casefiler i modelrepoets cases/ (standard: alle)")
    o = a.parse_args(argv)
    M = o.model.resolve()
    if not (M / "run_case.py").is_file():
        print(f"FEJL: {M} er ikke modelrepoet (run_case.py mangler). Giv --model.")
        return 2
    head = _git_head(M)
    if head != K.MODEL_COMMIT and o.uden_committjek:
        print(f"ADVARSEL: modelmappen er ikke en git-klon ved {K.MODEL_COMMIT[:7]} (HEAD {(head or '-')[:7]}); "
              "du står selv inde for, at indholdet er den pinnede commit")
    elif head != K.MODEL_COMMIT:
        print(f"FEJL: modelrepoet står på {(head or 'ingen git-commit')[:16]}, appen er pinnet til {K.MODEL_COMMIT[:7]}: "
              f"git -C {M} checkout {K.MODEL_COMMIT[:7]}  (eller --uden-committjek for en udpakket zip)")
        return 2
    df = _df_data_sha(M / "data" / "df-data")
    print(f"modelrepo {M} @ {(head or 'ukendt (ikke git)')[:7]} · df-data "
          f"{(df or 'hentes af første kørsel')[:7]} (appens pin {K.DF_DATA_SHA[:7]}) · vindue {o.start}..{o.slut}")
    if df and df != K.DF_DATA_SHA:
        print("  bemærk: df-data er ikke appens pin; begge veje bruger samme klon, så sammenligningen gælder stadig")

    readme = (M / "README.md").read_text(encoding="utf-8")
    cases = o.cases or sorted(p.name for p in (M / "cases").glob("*.yaml") if not p.name.startswith("heat_load_params"))
    miljoe = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    alle = []
    for fil in cases:
        tekst = (M / "cases" / fil).read_text(encoding="utf-8")
        st = MK.standard(MK.kommandoer(fil, tekst, readme))
        bal, heat = bool(st and st["med_balancering"]), (st or {}).get("heat_csv")
        navn = fil.removesuffix(".yaml")
        a_ud, b_ud = o.ud / navn / "direkte", o.ud / navn / "app"
        for d in (a_ud, b_ud):
            d.mkdir(parents=True, exist_ok=True)
            for gammel in d.iterdir():
                if gammel.is_file():
                    gammel.unlink()
        # A) direkte, med modelrepoets egne flag
        argv_a = [sys.executable, "run_case.py", f"cases/{fil}", "--data-source", "github"]
        if bal:
            argv_a.append("--with-balancing")
        if heat:
            argv_a += ["--heat-csv", f"data/{heat}"]
        argv_a += ["--start", o.start, "--end", o.slut, "--out-dir", str(a_ud.resolve())]
        t0 = time.time()
        ra = subprocess.run(argv_a, cwd=M, env=miljoe, capture_output=True, text=True, encoding="utf-8", errors="replace")
        ta = time.time() - t0
        # B) appens vej: frosset input -> case.yaml + argv -> wrapperen
        scen = {"periode_start": o.start, "periode_slut": o.slut, "med_balancering": bal, "heat_csv": heat,
                "model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA}
        plan = byg(raekker_fra_vaerk(flad(tekst), [], scen), heat_csv_rod=M / "data")
        (b_ud / "case.yaml").write_text(plan.case_yaml, encoding="utf-8")
        argv_b = [sys.executable, str(ROD / "fabric" / "fjv" / "model_wrapper.py"), str(M), str((b_ud / "case.yaml").resolve()),
                  *plan.cli, "--df-data-cache", str(M / "data" / "df-data"), "--out-dir", str(b_ud.resolve())]
        t0 = time.time()
        rb = subprocess.run(argv_b, cwd=M, env=miljoe, capture_output=True, text=True, encoding="utf-8", errors="replace")
        tb = time.time() - t0
        post = {"case": fil, "kommando": (st or {}).get("kilde") or "egen antagelse (ingen kommando i modelrepoet)",
                "argv_direkte": argv_a[2:-2], "argv_app": plan.cli, "sek": [round(ta), round(tb)]}
        A = B = None
        if ra.returncode == 0 and rb.returncode == 0:
            try:
                A, B = _resultat(a_ud), _resultat(b_ud)
            except Exception as e:                                # noqa: BLE001 — en ulæselig resultatfil er en FORSKEL
                post.update(ens=False, fejl=[f"resultatet kunne ikke læses: {type(e).__name__}: {e}"[-600:], ""])
        if A is not None and B is not None:
            post.update(direkte=A, app=B, ens=bestaaet(A, B))
            if A["hourly"] != B["hourly"]:
                # Diagnose, ikke dom: hvad består forskellen i timefilerne af? Casen er en FORSKEL uanset svaret.
                post.update(diagnose=diagnosticer(a_ud, b_ud))
        elif "fejl" not in post:
            post.update(ens=False, fejl=[(ra.stderr or ra.stdout)[-600:], (rb.stderr or rb.stdout)[-600:]])
        alle.append(post)
        kr = lambda x: f"{x:>12,.0f}".replace(",", ".")  # noqa: E731  (dansk tusindtalsskilletegn)
        obj = f"{kr(post['direkte']['objektiv'])} / {kr(post['app']['objektiv'])}" if "direkte" in post else "fejl".rjust(27)
        maerke = "ENS " if post["ens"] else "FORSKEL"
        print(f"{maerke} {fil:<34} {obj} kr.  ({post['kommando']}; {post['sek'][0]}+{post['sek'][1]} s)",
              flush=True)
        if "direkte" in post and post["direkte"]["objektiv_fuldt"] != post["app"]["objektiv_fuldt"]:
            # Også når udskriften ovenfor viser samme hele krone: det er det fulde tal, der sammenlignes.
            print(f"     objektivet afviger uafrundet: {post['direkte']['objektiv_fuldt']!r} mod {post['app']['objektiv_fuldt']!r} kr.")
        if post.get("diagnose"):
            print(f"     diagnose (ikke bestået): {post['diagnose']['tekst']}")
        if "fejl" in post:
            print("   ", post["fejl"][0].strip().splitlines()[-1:] or "", post["fejl"][1].strip().splitlines()[-1:] or "")
    (o.ud / "resultat.json").write_text(json.dumps(alle, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(1 for p in alle if p["ens"])
    kun_fordeling = sum(1 for p in alle if not p["ens"] and (p.get("diagnose") or {}).get("ens_paa_sum"))
    print(f"{n} af {len(alle)} cases ens (modellens fulde objektiv; _hourly.csv og _kpi.csv byte for byte)"
          + (f"; {kun_fordeling} af forskellene er ifølge diagnosen kun fordelingen mellem lagre — de består ikke" if kun_fordeling else "")
          + f" · detaljer: {o.ud / 'resultat.json'}")
    return 0 if n == len(alle) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
