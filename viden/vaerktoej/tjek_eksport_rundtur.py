"""Rundturs-beviset for eksporten af et værk til værksark (runde 12, fv-ui).

Appens eksport (``app/src/sider/konfiguration/eksport``) udfylder modelrepoets ``vaerksdata_skabelon.xlsx``; importen
kører modelrepoets ``scripts/vaerksark_til_yaml.py`` UÆNDRET. Beviset kører netop det script på hver eksport.

For hvert værk i appens katalog (modelspejlets 7 cases, Andeby med) ved den pinnede commit:

  [1] eksport   appens eksport af værket (blade + aktive tidsserier, som repo-importen registrerer dem) laves af appens
                egen kode (vitest-generatoren ``rundtur.gen.spec.ts``).
  [0] slug     ``fjv.revision.slug`` (importens navnekort) = scriptets egen ``slug()`` på svære navne (K11 F1).
  [2] script    ``vaerksark_til_yaml.py`` på arket, som importen kører det (``fjv.vaerksark.koer_script`` +
                ``konverter_output``): exit 0, og arket med og uden den skjulte markering ``_app`` giver PRÆCIS samme
                case og tidsserier (scriptet ignorerer markeringen — beviset er resultatligheden, ikke loggen).
  [3] forudsigelse  eksportens forudsigelse (``plan.forventet``) = scriptets blade, felt for felt og typestrengt.
  [4] tab       værkets blade mod scriptets (scriptets objektnavne ført tilbage som importen gør): hver forskel står
                på eksportens liste "ikke med i arket", og listen har intet, der ikke er en forskel. Aldrig tavst tab.
                Afvigelserne i markeringen er netop listens ikke-artefakter (K11 F4).
  [5] tidsserier  den målte serie i arket kommer tilbage værdi for værdi; den normaliserede fil er byte for byte
                den gemte (inden for arkets periode). Begge mængdeforskelle i tidsaksen klassificeres (K11 F6): timer,
                scriptet tilføjer, skal være præcis eksportens ``udfyldes`` (tid og værdi); timer, det fjerner, skal
                ligge uden for arket.
  [6] revision  genupload uden ændringer (arket = basis) giver INGEN ændringer; værket bygget efter revisionen er
                identisk med før, og ``run_case`` giver samme objektiv (``--koer``).
  [7] modprøver  én ændret celle i arket ændrer præcis det forventede felt (og intet andet) i revisionen; en
                tidsserierettelse er revision 2 med log (K11 F2); konflikt, ark fra et andet værk og en basis, der ikke
                er værkets eksport, afvises med intet gemt (K11 F4); kun årsproduktionen ændret gemmer intet og siger
                hvorfor (K11 F5).

Ud over katalogets værker prøves tre varianter (K11): ``andeby_navne`` (halmkedlen hedder ``halm__kedel``, som
scriptet normaliserer), ``andeby_hul`` (solprofilen med et dagtimehul og to tomme nattetimer i vinduets ende) og
``billund_idag_maalt_hul`` (den målte varmelast med et hul).

    python viden/vaerktoej/tjek_eksport_rundtur.py [--koer] [--ud <mappe>] [kode ...]

Kræver et Python med modellens pakker (pandas, numpy, openpyxl, PyYAML; ``--koer`` også linopy/highspy og df-data)
og modelrepoet ved pinnen (søstermappe, FJV_MODELREPO eller FJV_MODELMAPPE). Node/npm til generatoren.
Exit 0 når alt holder; 1 ellers. Skriver kun i ``--ud`` (standard ``_lokal/rundtur``, git-ignoreret).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
HER = Path(__file__).resolve().parent
ROD = HER.parents[1]
sys.path.insert(0, str(ROD / "fabric"))
sys.path.insert(0, str(HER))

import yaml  # noqa: E402

import byg_modelspejl as BM  # noqa: E402
from fjv import datakrav as DK  # noqa: E402
from fjv import konstanter as K  # noqa: E402
from fjv import revision as REV  # noqa: E402
from fjv import vaerksark as VS  # noqa: E402
from fjv.flad import flad  # noqa: E402
from fjv.importer import _meta, kode_af  # noqa: E402
from fjv.tidsserie_db import repo_tidsserier  # noqa: E402

fejl: list[str] = []
linjer: list[str] = []


def meld(tekst: str) -> None:
    fejl.append(tekst)
    print(f"  FEJL {tekst}", flush=True)


def vaerks_id(kode: str) -> str:
    h = hashlib.sha256(kode.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-8{h[17:20]}-{h[20:32]}"


def serie_af(normaliseret: bytes) -> dict:
    """Normaliseret fil (time,mw; UTC; huller udeladt) -> tæt serie som hentTidsserie giver den."""
    from datetime import datetime, timezone
    rk = normaliseret.decode("utf-8").strip().split("\n")[1:]
    pkt = [(int(datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() * 1000), float(v))
           for t, v in (r.split(",") for r in rk)]
    start = pkt[0][0]
    vaerdier: list = [None] * ((pkt[-1][0] - start) // 3_600_000 + 1)
    for ms, v in pkt:
        vaerdier[(ms - start) // 3_600_000] = v
    return {"startMs": start, "oploesning": "1h", "værdier": vaerdier}


def forbered(kilde: "BM.Kilde", ud: Path, koder: list[str]) -> dict:
    """input.json pr. værk: bladene og de AKTIVE tidsserier, som fjv_importer_vaerker registrerer dem."""
    readme = kilde.tekst("README.md")
    alle = {}
    for fil in kilde.filer("cases"):
        if not fil.endswith(".yaml") or fil.startswith("heat_load_params"):
            continue
        kode = kode_af(fil)
        if koder and kode not in koder:
            continue
        tekst = kilde.tekst(f"cases/{fil}")
        params = flad(tekst)
        case = yaml.safe_load(tekst) or {}
        navn, _ = _meta(tekst, kode)
        serier = {"varmelast": None, "solprofil": None}
        normaliseret = {}
        repo = repo_tidsserier(tekst, params, fil, readme)
        for t in repo:
            if not t["aktiv"]:
                continue
            res = DK.valider(kilde.bytes(f"data/{t['fil']}").decode("utf-8"), t["rolle"], tidszone="UTC",
                             tidsstempel="start", vaerk=case)
            if res.status != "gyldig":
                raise SystemExit(f"{kode}: repoets {t['fil']} er ikke gyldig ({res.validering.get('fejl')})")
            serier[t["rolle"]] = {"id": vaerks_id(kode + t["rolle"]), "sha256": res.sha256, "serie": serie_af(res.data)}
            normaliseret[t["rolle"]] = res.data
        mappe = ud / kode
        mappe.mkdir(parents=True, exist_ok=True)
        for gammel in mappe.iterdir():
            if gammel.is_file():
                gammel.unlink()
        inp = {"vaerk": {"id": vaerks_id(kode), "kode": kode, "navn": navn, "revision": 1},
               "blade": [{"sti": p.sti, "vaerdi_json": p.vaerdi_json, "raekkefoelge": p.raekkefoelge} for p in params],
               **serier}
        (mappe / "input.json").write_text(json.dumps(inp, ensure_ascii=False), encoding="utf-8")
        alle[kode] = {"blade": {p.sti: p.vaerdi_json for p in params}, "case": case, "tekst": tekst, "normaliseret": normaliseret}
        # Ingen katalogcase har en AKTIV målt varmelast (repoets er registreret inaktiv). For at prøve Timedata
        # (byte for byte) laves en variant af billund_idag, hvor casens egen målte varmelast er aktiv — som når en
        # bruger aktiverer den under Tidsserier.
        vl = next((t for t in repo if t["rolle"] == "varmelast"), None)
        if kode == "billund_idag" and vl and (not koder or f"{kode}_maalt" in koder or kode in koder):
            res = DK.valider(kilde.bytes(f"data/{vl['fil']}").decode("utf-8"), "varmelast", tidszone="UTC",
                             tidsstempel="start", vaerk=case)
            vkode = f"{kode}_maalt"
            m = ud / vkode
            m.mkdir(parents=True, exist_ok=True)
            for gammel in m.iterdir():
                if gammel.is_file():
                    gammel.unlink()
            vinp = {**inp, "vaerk": {**inp["vaerk"], "id": vaerks_id(vkode), "kode": vkode},
                    "varmelast": {"id": vaerks_id(vkode + "varmelast"), "sha256": res.sha256, "serie": serie_af(res.data)}}
            (m / "input.json").write_text(json.dumps(vinp, ensure_ascii=False), encoding="utf-8")
            alle[vkode] = {**alle[kode], "normaliseret": {**normaliseret, "varmelast": res.data}}
            # K11 F6: samme målte varmelast med et hul (scriptet beholder det som et hul).
            hkode = f"{vkode}_hul"
            if not koder or hkode in koder:
                hul = _uden_timer(res.data, {"2025-11-15T08:00:00Z"})
                alle[hkode] = variant(ud, hkode, vinp, alle[vkode], "varmelast", hul)
        if kode == "andeby":
            # K11 F1: halmkedlen med et navn, scriptets slug() ændrer.
            nkode = "andeby_navne"
            if not koder or nkode in koder:
                nblade = [{**b, "sti": b["sti"].replace("units.halmkedel.", "units.halm__kedel.")} for b in inp["blade"]]
                ninp = {**inp, "vaerk": {**inp["vaerk"], "id": vaerks_id(nkode), "kode": nkode}, "blade": nblade}
                _skriv(ud, nkode, ninp)
                alle[nkode] = {**alle[kode], "blade": {b["sti"]: b["vaerdi_json"] for b in nblade}}
            # K11 F6: et dagtimehul (Codex' 24/10/2025 kl. 10 UTC) og to tomme nattetimer i vinduets ende.
            hkode = "andeby_hul"
            if (not koder or hkode in koder) and "solprofil" in normaliseret:
                hul = _uden_timer(normaliseret["solprofil"], {"2025-10-24T10:00:00Z", "2026-06-30T22:00:00Z", "2026-06-30T23:00:00Z"})
                alle[hkode] = variant(ud, hkode, inp, alle[kode], "solprofil", hul)
    return alle


def _skriv(ud: Path, kode: str, inp: dict) -> None:
    m = ud / kode
    m.mkdir(parents=True, exist_ok=True)
    for gammel in m.iterdir():
        if gammel.is_file():
            gammel.unlink()
    (m / "input.json").write_text(json.dumps(inp, ensure_ascii=False), encoding="utf-8")


def _uden_timer(normaliseret: bytes, timer: set) -> bytes:
    """Den gemte normaliserede fil med ``timer`` udeladt — formatet har huller som udeladte timer (tidsserie.ts).
    (Validering af en kilde med et hul er ikke vejen hertil: oraklet udfylder selv små huller i en solprofil.)"""
    rk = normaliseret.decode("utf-8").strip().split("\n")
    ud = [rk[0]] + [r for r in rk[1:] if r.split(",")[0] not in timer]
    if len(ud) != len(rk) - len(timer):
        raise SystemExit(f"rundturens hul-variant: timerne {sorted(timer)} findes ikke alle i serien")
    return ("\n".join(ud) + "\n").encode("utf-8")


def variant(ud: Path, kode: str, inp: dict, v: dict, rolle: str, data: bytes) -> dict:
    """En variant af et værk, hvis aktive serie i ``rolle`` er den gemte normaliserede fil ``data``."""
    _skriv(ud, kode, {**inp, "vaerk": {**inp["vaerk"], "id": vaerks_id(kode), "kode": kode},
                      rolle: {"id": vaerks_id(kode + rolle), "sha256": hashlib.sha256(data).hexdigest(), "serie": serie_af(data)}})
    return {**v, "normaliseret": {**v["normaliseret"], rolle: data}}


def generer(ud: Path) -> None:
    """Appens egen eksportkode (vitest-generatoren) skriver eksport.xlsx, uden_app.xlsx og plan.json."""
    miljoe = {**os.environ, "FJV_RUNDTUR": str(ud.resolve())}
    r = subprocess.run("npx vitest run src/sider/konfiguration/eksport/rundtur.gen.spec.ts", cwd=ROD / "app", shell=True,
                       env=miljoe, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print((r.stdout or "")[-3000:], (r.stderr or "")[-2000:])
        raise SystemExit("generatoren (vitest) fejlede")


def konverter(model: Path, ark: Path, arbejde: Path):
    """Som importen: scriptet uændret (cwd = modelrepoet), output i en midlertidig mappe; blade + tidsserier."""
    shutil.rmtree(arbejde, ignore_errors=True)
    arbejde.mkdir(parents=True)
    kopi = arbejde / "ark.xlsx"
    shutil.copyfile(ark, kopi)
    rc, log = VS.koer_script(model, sys.executable, kopi, arbejde / "ud", False)
    if rc != 0:
        return None, log
    tz = VS.kildens_tidszone(model, sys.executable, kopi)
    sol_tz = VS.kildens_tidszone(model, sys.executable, kopi, "Solvarme")
    k = VS.konverter_output(arbejde / "ud", tz, False, sol_tz)
    return k, log


class _Rapport:
    def __init__(self):
        self.trinliste = []

    def trin(self, navn, data=None):
        self.trinliste.append((navn, data))

    def advar(self, tekst):
        self.trinliste.append(("advarsel", tekst))

    def fejl(self, e):
        self.trinliste.append(("fejl", repr(e)))


def koer_revision(model: Path, kode: str, v: dict, ark: Path, basis: Path, arbejde: Path, *, revision_i_db: int = 1,
                  maal: str | None = None):
    """Genupload som revision gennem importens egen kode (``fjv.vaerksark.importer_revision`` + et ImportLager):
    værket og dets aktive serier i et hukommelseslager, arket + basis som uploads, modelscriptet på begge.
    ``maal`` = et ANDET værks id (samme blade og serier), som anmodningen fejlagtigt gælder (K11 F4)."""
    import base64
    import uuid
    from datetime import datetime, timezone

    from fjv import lager_minne as LM
    from fjv.tidsserie_db import gem_tidsseriefil

    shutil.rmtree(arbejde, ignore_errors=True)
    files = arbejde / "files"
    db = LM.MinneDb()
    lager = LM.MinneImportLager(db)
    vid = maal or vaerks_id(kode)
    db.vaerker[vid] = {"id": vid, "kode": kode, "navn": kode, "revision": revision_i_db, "arkiveret": False,
                       "parametre": [{"sti": s_, "vaerdi_json": j} for s_, j in v["blade"].items()]}
    for rolle, data in v["normaliseret"].items():
        sha = hashlib.sha256(data).hexdigest()
        tid = str(uuid.uuid4())
        db.tidsserier[tid] = {"id": tid, "vaerk_id": vid, "rolle": rolle, "sti": gem_tidsseriefil(kode, data, sha, str(files)),
                              "sha256": sha, "kilde": "repo", "status": "gyldig", "aktiv": True}
    iid = str(uuid.uuid4())
    up = files / "fjv" / "uploads"
    up.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ark, up / f"{iid}.xlsx")
    shutil.copyfile(basis, up / f"{iid}_basis.xlsx")
    db.anmodninger[iid] = {"vaerk_id": vid, "forventet_revision": 1, "aendringer_json": json.dumps([{
        "handling": "upload_vaerksark", "filnavn": ark.name, "sha256": "0" * 64,
        "basis_sha256": hashlib.sha256(base64.b64encode(basis.read_bytes())).hexdigest()}])}
    imp = {"id": iid, "filnavn": ark.name, "sti": f"Files/fjv/uploads/{iid}.xlsx", "uploadet_af": "rundtur@example.org"}
    db.importer[iid] = {**imp, "status": "koerer", "uploadet": datetime.now(timezone.utc)}
    k, log = konverter(model, ark, arbejde / "ark")
    if k is None:
        return db, vid, {"fejl": VS.fejl_fra_log(log, 1)}
    rev = lager.revision_for(iid)
    try:
        res = VS.importer_revision(lager, imp, rev, k, model, sys.executable, up / f"{iid}.xlsx", arbejde / "imp", False,
                                   log, _Rapport(), str(files))
    except VS.ArkFejl as e:
        return db, vid, {"fejl": str(e)}
    return db, vid, res


def rediger(eksport: Path, ud: Path, ret) -> Path:
    """En kopi af arket med én ændring (openpyxl, som et regneark gemmer det)."""
    import openpyxl
    wb = openpyxl.load_workbook(eksport)
    ret(wb)
    wb.save(ud)
    return ud


def _iso(ms: int) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def blade_af(k) -> dict:
    return {p.sti: p.vaerdi_json for p in k.params}


def serier_af(k) -> dict:
    return {t["rolle"]: t["res"] for t in k.tidsserier}


MODPROEVE_VAERKER = ("andeby", "billund_idag", "billund_idag_maalt", "andeby_navne")


def navnekort(blade: dict, script: dict) -> dict:
    """Scriptets objektnavne -> værkets, som importen fører dem tilbage (``fjv.revision.objektkort``)."""
    return REV.objektkort(blade, script, script)


def modproever(model: Path, kode: str, v: dict, plan: dict, eksport: Path, tmp: Path) -> list[str]:
    """Én ændret celle i arket -> præcis det forventede felt i revisionen; konflikt -> intet gemt."""
    forventet = plan["forventet"]
    kort = navnekort(v["blade"], forventet)
    # Enheden med D&V, i værkets navn (arket bærer værkets navn; scriptet læser sit eget).
    enhed = kort[("units", next(s_.split(".")[1] for s_ in forventet if s_.startswith("units.") and s_.endswith(".var_om")))]
    ud = []

    def proeve(navn, ret, stier: set, serie: str | None = None):
        ark = rediger(eksport, tmp / f"{navn}.xlsx", ret)
        db, vid, res = koer_revision(model, kode, v, ark, eksport, tmp / f"mod_{navn}")
        if "fejl" in res:
            meld(f"{kode} [7] {navn}: {res['fejl']}")
            return
        log = db.vaerker[vid].get("log", [])
        aendret = {x["sti"] for x in log}
        # K11 F2: en tidsserierettelse er en revision med sin egen logrække.
        forventet_log = stier | ({f"tidsserie.{serie}"} if serie else set())
        if aendret != forventet_log:
            meld(f"{kode} [7] {navn}: forventede {sorted(forventet_log)}, revisionen ændrede {sorted(aendret)}")
        if forventet_log and res["revision"] != 2:
            meld(f"{kode} [7] {navn}: revisionen blev {res['revision']}, ikke 2")
        if any(x["aendret_af"] != "rundtur@example.org" for x in log):
            meld(f"{kode} [7] {navn}: revisionsloggen er ikke i uploaderens navn")
        if set(res["tidsserier"]) != ({serie} if serie else set()):
            meld(f"{kode} [7] {navn}: tidsserier {res['tidsserier']}, forventet {serie}")
        ud.append(f"{navn}: {', '.join(sorted(forventet_log))}")

    def var_om(wb):
        ws = wb["Anlaeg"]
        r = next(i for i in range(5, 24) if ws.cell(i, 1).value == enhed)
        ws.cell(r, 8).value = float(ws.cell(r, 8).value or 0) + 1.5
    proeve("dv", var_om, {f"units.{enhed}.var_om"})

    pris = next(n for n in ("straw", "natural_gas", "flis", "waste_heat") if f"prices.{n}.value" in forventet)
    raekke = {"natural_gas": 6, "straw": 7, "flis": 8, "waste_heat": 9}[pris]

    def pris_op(wb):
        ws = wb["Priser"]
        ws.cell(raekke, 2).value = float(ws.cell(raekke, 2).value) + 10
    proeve("pris", pris_op, {f"prices.{pris}.value"})

    if "solprofil" in v["normaliseret"] and any(x["rolle"] == "solprofil" and x["med"] for x in plan["serier"]):
        def sol(wb):
            ws = wb["Solvarme"]
            r = max(range(6, ws.max_row + 1), key=lambda i: ws.cell(i, 2).value or 0)
            ws.cell(r, 2).value = float(ws.cell(r, 2).value) + 0.5
        proeve("solvarme", sol, set(), "solprofil")

    if "varmelast" in v["normaliseret"] and any(x["rolle"] == "varmelast" and x["med"] for x in plan["serier"]):
        def time_(wb):
            ws = wb["Timedata"]
            r = next(i for i in range(1000, ws.max_row + 1) if ws.cell(i, 2).value is not None)
            ws.cell(r, 2).value = float(ws.cell(r, 2).value) + 1.25
        proeve("timedata", time_, set(), "varmelast")

    # Afvisninger: intet må gemmes. Samtidighed (værket er ændret siden eksporten), ark fra et andet værk end det,
    # anmodningen gælder (K11 F4), og det rettede ark sendt som sin egen basis (K11 F4, Codex' forfalskede basis).
    for navn, ark, basis, kw, tekst in (
            ("konflikt", tmp / "dv.xlsx", eksport, {"revision_i_db": 2}, "er ændret, siden arket blev eksporteret"),
            ("andet værk", tmp / "dv.xlsx", eksport, {"maal": vaerks_id(kode + "_andet")}, "eksporteret fra et andet værk"),
            ("forfalsket basis", tmp / "dv.xlsx", tmp / "dv.xlsx", {}, "basis er ikke værkets eksport")):
        db, vid, res = koer_revision(model, kode, v, ark, basis, tmp / f"afvist_{navn.replace(' ', '_')}", **kw)
        if "fejl" not in res or tekst not in res["fejl"]:
            meld(f"{kode} [7] {navn}: forventede afvisning ({tekst}), fik {res}")
        elif db.vaerker[vid].get("log") or db.vaerker[vid]["revision"] != kw.get("revision_i_db", 1):
            meld(f"{kode} [7] {navn}: værket blev ændret trods afvisningen")
        else:
            ud.append(f"{navn}: afvist, intet gemt")

    # K11 F5: kun årsproduktionen (Timedata!B3) ændret, på et værk uden målt varmelast -> intet gemt, og loggen siger hvorfor.
    if not any(x["rolle"] == "varmelast" and x["med"] for x in plan["serier"]):
        def b3(wb):
            ws = wb["Timedata"]
            ws["B3"].value = float(ws["B3"].value) * 1.2
        ark = rediger(eksport, tmp / "b3.xlsx", b3)
        db, vid, res = koer_revision(model, kode, v, ark, eksport, tmp / "mod_b3")
        if "fejl" in res:
            meld(f"{kode} [7] årsproduktion: {res['fejl']}")
        elif res["revision"] is not None or db.vaerker[vid].get("log") or not res["ikke_gemt"] \
                or not res["log"].startswith("Ingen ændringer, der kan gemmes"):
            meld(f"{kode} [7] årsproduktion: forventede intet gemt med forklaring, fik {res}")
        else:
            ud.append("årsproduktion: intet gemt, siges i loggen")
    return ud


def koer_case(model: Path, kode: str, foer: dict, efter: dict, arbejde: Path, o) -> list:
    """run_case på værket før og efter revisionen (appens bestillingsvej, som bevis_app_vej.py) — samme objektiv."""
    from fjv import modelkoersel as MK  # noqa: F401
    from fjv.byg_case import byg, raekker_fra_vaerk
    from fjv.flad import Parameter
    objektiv = []
    for navn, blade in (("foer", foer), ("efter", efter)):
        d = arbejde / navn
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True)
        params = [Parameter(s_, j, s_.split(".")[0], None, None, False, i) for i, (s_, j) in enumerate(blade.items())]
        scen = {"periode_start": o.start, "periode_slut": o.slut, "med_balancering": False, "heat_csv": None,
                "model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA}
        plan = byg(raekker_fra_vaerk(params, [], scen), heat_csv_rod=model / "data")
        (d / "case.yaml").write_text(plan.case_yaml, encoding="utf-8")
        argv = [sys.executable, str(ROD / "fabric" / "fjv" / "model_wrapper.py"), str(model), str((d / "case.yaml").resolve()),
                *plan.cli, "--df-data-cache", str(o.df_data), "--out-dir", str(d.resolve())]
        rr = subprocess.run(argv, cwd=model, env={**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"},
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
        if rr.returncode != 0:
            meld(f"{kode} [6] run_case ({navn}) fejlede: {(rr.stderr or rr.stdout)[-400:]}")
            return objektiv
        m = json.loads(next(d.glob("*_manifest.json")).read_text(encoding="utf-8"))
        objektiv.append(m["noegletal"]["objektiv_dkk"])
    if len(objektiv) == 2 and objektiv[0] != objektiv[1]:
        meld(f"{kode} [6] run_case: objektiv før {objektiv[0]} og efter revisionen {objektiv[1]}")
    return objektiv


SVAERE_NAVNE = ("halm__kedel", "_halm_", "Ærø Fjernvarme A/S", "Tårs Halmværk", "Brønderslev Østerby", "__Café__",
                "vp_luft_vand", "a\u2014b", "Kedel 2 (ny)")


def slug_paritet(model: Path) -> None:
    """[0] importens slug() (fjv.revision) = scriptets egen, kaldt i modelrepoets Python-modul."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("_vaerksark_til_yaml", model / "scripts" / "vaerksark_til_yaml.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    for n in SVAERE_NAVNE:
        if REV.slug(n) != m.slug(n):
            meld(f"[0] slug({n!r}): importen {REV.slug(n)!r}, scriptet {m.slug(n)!r}")
    print(f"[0] slug: {len(SVAERE_NAVNE)} navne som scriptet", flush=True)


def main(argv: list[str]) -> int:
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("--ud", type=Path, default=ROD / "_lokal" / "rundtur")
    a.add_argument("--koer", action="store_true", help="kør også run_case på værket før og efter revisionen")
    a.add_argument("--start", default="2026-03-10")
    a.add_argument("--slut", default="2026-03-11")
    a.add_argument("--df-data", type=Path, default=Path(os.environ["FJV_DFDATA"]) if os.environ.get("FJV_DFDATA") else None,
                   help="df-data-klonen run_case bruger (standard FJV_DFDATA, ellers appens pin hentet til _lokal/files)")
    a.add_argument("koder", nargs="*")
    o = a.parse_args(argv)
    kilde = BM.Kilde.find()
    if kilde is None:
        print(f"FEJL: modelrepoet ved {K.MODEL_COMMIT[:7]} findes ikke (søstermappe, FJV_MODELREPO eller FJV_MODELMAPPE)")
        return 2
    model = kilde.repo or kilde.mappe
    if o.koer and o.df_data is None:
        # Appens egen vej til df-data ved pinnen (zip + .git-markør, som arbejderen), cachet i _lokal/.
        from fjv import runtime as RT
        o.df_data, _ = RT.sikr_dfdata(files=str(ROD / "_lokal" / "files"))
        print(f"df-data {K.DF_DATA_SHA[:7]}: {o.df_data}", flush=True)
    try:
        import openpyxl  # noqa: F401
        import pandas  # noqa: F401
    except ImportError as e:
        print(f"FEJL: dette Python mangler modellens pakker ({e}); brug et Python med modelrepoets requirements.txt")
        return 2
    ud = o.ud.resolve()
    ud.mkdir(parents=True, exist_ok=True)
    print(f"rundtur: modelrepo {kilde.beskriv()} · ud {ud}", flush=True)
    slug_paritet(model)
    vaerker = forbered(kilde, ud, o.koder)
    generer(ud)
    tmp = Path(tempfile.gettempdir()) / "fjv_rundtur"
    resultat = {}
    for kode, v in vaerker.items():
        print(f"{kode}:", flush=True)
        plan = json.loads((ud / kode / "plan.json").read_text(encoding="utf-8"))
        if "fejl" in plan:
            meld(f"{kode}: eksporten nægtede: {plan['fejl']}")
            continue
        r = {"ikke_med": len(plan["ikkeMed"]), "serier": plan["serier"]}
        # [2] scriptet, med og uden markeringen
        k, log = konverter(model, ud / kode / "eksport.xlsx", tmp / kode / "med")
        if k is None:
            meld(f"{kode} [2]: scriptet afviste eksporten: {VS.fejl_fra_log(log, 1)}")
            continue
        k2, log2 = konverter(model, ud / kode / "uden_app.xlsx", tmp / kode / "uden")
        if k2 is None or blade_af(k2) != blade_af(k) or {r_: s.sha256 for r_, s in serier_af(k2).items()} != {r_: s.sha256 for r_, s in serier_af(k).items()}:
            meld(f"{kode} [2]: markeringen _app ændrer scriptets resultat")
        # (K11: loggen søges ikke for "_app" — det ramte stinavne. Beviset er resultatligheden ovenfor.)
        script = blade_af(k)
        # [3] forudsigelsen
        forventet = plan["forventet"]
        for sti in sorted(set(script) | set(forventet)):
            if script.get(sti) != forventet.get(sti):
                meld(f"{kode} [3]: forudsigelsen siger {sti} = {forventet.get(sti)}, scriptet {script.get(sti)}")
        # [4] tab: hver forskel værk <-> script står på listen, og listen har kun forskelle
        blade = v["blade"]
        try:
            script_v = REV.oversaet(script, navnekort(blade, script))
        except REV.RevisionsFejl as e:
            meld(f"{kode} [4]: scriptets navne kan ikke føres tilbage til værket: {e}")
            continue
        forskel = {sti for sti in set(blade) | set(script_v) if blade.get(sti) != script_v.get(sti)}
        listet = {t["sti"] for t in plan["ikkeMed"]}
        if plan.get("afvigelser") != sorted(x for x in listet if not REV.er_artefakt(x)):
            meld(f"{kode} [4]: markeringens afvigelser er ikke listens ikke-artefakter")
        if plan["markering"].get("afvigelser") != plan.get("afvigelser"):
            meld(f"{kode} [4]: markeringen bærer andre afvigelser end planen")
        for sti in sorted(forskel - listet):
            meld(f"{kode} [4]: TAVST TAB {sti}: værk {blade.get(sti)} -> script {script_v.get(sti)}")
        for sti in sorted(listet - forskel):
            meld(f"{kode} [4]: listen siger {sti} er tabt, men scriptet giver værkets værdi")
        # [5] tidsserier
        for rolle, data in v["normaliseret"].items():
            s = serier_af(k).get(rolle)
            if s is None:
                if any(x["rolle"] == rolle and x["med"] for x in plan["serier"]):
                    meld(f"{kode} [5]: {rolle} er i arket, men scriptet gav ingen")
                continue
            gemt = {ln.split(",")[0]: ln for ln in data.decode().strip().split("\n")[1:]}
            ny = {ln.split(",")[0]: ln for ln in s.data.decode().strip().split("\n")[1:]}
            afvig = [t for t in ny if t in gemt and gemt[t] != ny[t]]
            # Modelscriptet skriver solprofilen med %.6f: en gemt værdi med flere decimaler kommer tilbage afrundet.
            # Det er ikke et tavst tab, når eksporten oplyser præcis de timer (planens ``afrundes``).
            afrundet = [t for t in afvig if float(ny[t].split(",")[1]) == float(f"{float(gemt[t].split(',')[1]):.6f}")]
            oplyst = next((a["n"] for a in plan.get("afrundes", []) if a["rolle"] == rolle), 0)
            if len(afrundet) != oplyst:
                meld(f"{kode} [5]: {rolle}: scriptet afrunder {len(afrundet)} timer til 6 decimaler, eksporten oplyser {oplyst}")
            afvig = [t for t in afvig if t not in afrundet]
            if afvig:
                meld(f"{kode} [5]: {rolle}: {len(afvig)} timer ikke byte for byte (fx {ny[afvig[0]]} mod {gemt.get(afvig[0])})")
            if afrundet:
                r[f"{rolle}_afrundet"] = len(afrundet)
            # K11 F6: timer, scriptet TILFØJER, skal være præcis eksportens udfyldes (tid og værdien med 6 decimaler) ...
            udfyldt = {_iso(u["ms"]): u["v"] for u in plan.get("udfyldes", []) if u["rolle"] == rolle}
            tilfoejet = sorted(set(ny) - set(gemt))
            for t in tilfoejet:
                if t not in udfyldt:
                    meld(f"{kode} [5]: {rolle}: scriptet tilføjer {ny[t]}, som eksporten ikke oplyser")
                elif float(ny[t].split(",")[1]) != float(f"{udfyldt[t]:.6f}"):
                    meld(f"{kode} [5]: {rolle}: scriptet udfylder {ny[t]}, eksporten siger {udfyldt[t]:.6f}")
            for t in sorted(set(udfyldt) - set(ny)):
                meld(f"{kode} [5]: {rolle}: eksporten siger, at scriptet udfylder {t}, men det gør det ikke")
            # ... og timer, det FJERNER, skal ligge uden for arket (før første eller efter sidste time i det).
            fjernet = sorted(set(gemt) - set(ny))
            inde = [t for t in fjernet if ny and min(ny) <= t <= max(ny)]
            if inde:
                meld(f"{kode} [5]: {rolle}: {len(inde)} gemte timer inde i arkets periode mangler (fx {inde[0]})")
            r[f"{rolle}_timer"] = len(ny)
            r[f"{rolle}_uden_for_arket"] = len(fjernet)
            if tilfoejet:
                r[f"{rolle}_udfyldt"] = {t: ny[t].split(",")[1] for t in tilfoejet}
        # [6] revision uden ændringer: arket = basis -> intet gemt, værket uændret
        eksport = ud / kode / "eksport.xlsx"
        db, vid, res = koer_revision(model, kode, v, eksport, eksport, tmp / kode / "rev0")
        if "fejl" in res:
            meld(f"{kode} [6]: genupload uden ændringer fejlede: {res['fejl']}")
        else:
            efter = {b["sti"]: b["vaerdi_json"] for b in db.vaerker[vid]["parametre"]}
            if res["revision"] is not None or res["aendringer"] or res["tidsserier"] or efter != blade:
                meld(f"{kode} [6]: genupload uden ændringer ændrede værket: {res}")
            elif not res["log"].startswith("Ingen ændringer"):
                meld(f"{kode} [6]: loggen siger ikke 'Ingen ændringer': {res['log'][:120]}")
            r["revision_uden_aendringer"] = "intet gemt"
            if o.koer:
                r["objektiv"] = koer_case(model, kode, v["blade"], efter, tmp / kode / "koer", o)
        # [7] modprøver: én celle -> præcis det felt (på tre værker, der tilsammen dækker solvarme, balancemarked/flad
        # tarif og målt varmelast — hver modprøve kører scriptet to gange)
        if kode in MODPROEVE_VAERKER or (o.koder and kode in o.koder):
            r["modproever"] = modproever(model, kode, v, plan, eksport, tmp / kode)
        resultat[kode] = r
        print(f"  ok: {len(script)} blade fra scriptet, {r['ikke_med']} på listen 'ikke med i arket'", flush=True)
    (ud / "resultat.json").write_text(json.dumps(resultat, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"RUNDTUR {'OK' if not fejl else 'FEJLER'}: {len(resultat)} værker, {len(fejl)} fejl", flush=True)
    return 0 if not fejl else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
