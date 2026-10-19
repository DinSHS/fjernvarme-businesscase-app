"""SQL-spor af Fabric-arbejderne - beviset for, at lager-grænsefladen ikke ændrer adfærd.

    python tests/spor.py <rod>        # rod = mappen, der indeholder pakken fjv/

Kører ``db.koer_notebook`` og ``vaerksark.koer_notebook`` fra ``<rod>`` mod en instrumenteret
forbindelsesstub og skriver hver SQL-sætning (whitespace normaliseret) + parametre som JSON.
``tests/data/sql_spor.json`` er sporet fra koden FØR lager-grænsefladen (commit 3d144d5);
``tests/test_lager.py`` kræver, at den nuværende kode giver præcis samme spor. Scriptet ligger
uden for ``fjv/`` og importerer intet fra testpakken, så det kan køres mod en gammel kopi.

Ændres Fabric-adfærden MED VILJE (fx en ny SQL-sætning eller en ny pin), genereres filen
igen fra den nye kode, og ændringen i sporet hører med i committen og rapporten:

    _lokal/.venv/Scripts/python -I tests/spor.py . > tests/data/sql_spor.json
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

KOERSEL_A = "aaaaaaaa-0000-4000-8000-000000000001"
KOERSEL_B = "bbbbbbbb-0000-4000-8000-000000000002"
IMPORT_A = "cccccccc-0000-4000-8000-000000000003"
IMPORT_B = "dddddddd-0000-4000-8000-000000000004"
MIG = "nb:spor"


class Cur:
    def __init__(self, cn):
        self.cn, self.rowcount, self._rk, self.description = cn, -1, [], None

    def execute(self, sql, *params):
        self.cn.log.append([" ".join(sql.split()), [str(p) for p in params]])
        svar = self.cn.svar(" ".join(sql.split()), params) or {}
        self._rk = list(svar.get("rk", []))
        self.rowcount = svar.get("n", len(self._rk))
        kol = svar.get("kol")
        self.description = [(k,) for k in kol] if kol else None
        return self

    def fetchone(self):
        return self._rk.pop(0) if self._rk else None

    def fetchall(self):
        ud, self._rk = self._rk, []
        return ud


class Cn:
    def __init__(self, svar, log, autocommit):
        self.svar, self.log, self.autocommit, self.timeout = svar, log, autocommit, 0

    def cursor(self):
        self.log.append(["CURSOR", [str(self.autocommit)]])
        return Cur(self)

    def commit(self):
        self.log.append(["COMMIT", []])

    def rollback(self):
        self.log.append(["ROLLBACK", []])

    def close(self):
        self.log.append(["CLOSE", []])


def _stubdb(DB, svar, log):
    class StubDb(DB.Db):
        def __init__(self, konfig):
            pass

        def forbind(self, autocommit=False, forsoeg=1):
            log.append(["FORBIND", [str(autocommit)]])
            return Cn(svar, log, autocommit)
    return StubDb


def _koersel_svar(laas_fri: bool):
    koe = [KOERSEL_B]

    def svar(sql, p):
        if "sp_getapplock" in sql:
            return {"rk": [(0 if laas_fri else -1,)]}
        if "APPLOCK_MODE" in sql:
            return {"rk": [("Exclusive",)]}
        if "COL_LENGTH" in sql:
            return {"rk": [(1,)]}
        if "DATEDIFF(second" in sql:
            return {"kol": ["id", "arbejder_id", "alder_s"], "rk": []}
        if "SET status='fejl'" in sql and "OUTPUT" in sql:
            return {"kol": ["id"], "rk": [("EEEEEEEE-0000-4000-8000-00000000000E",)]}
        if sql.startswith("UPDATE dbo.Koersels SET status='koerer'"):
            return {"n": 1}
        if "UPDATE n SET status='koerer'" in sql:
            return {"kol": ["id"], "rk": [(koe.pop(0).upper(),)] if koe else []}
        if "FROM dbo.Koersels WHERE id=?" in sql and "input_hash" in sql:
            return {"kol": ["id", "input_hash", "status", "vaerk_revision", "vaerk_id"],
                    "rk": [(p[0], "h" * 64, "koerer", 1, "ffffffff-0000-4000-8000-00000000000f")]}
        if "FROM dbo.KoerselInputs" in sql:
            return {"kol": ["kilde", "sti", "vaerdi_json"], "rk": [("vaerk", "time.resolution", '"1h"')]}
        if "SELECT status, annuller_anmodet, arbejder_id" in sql:
            return {"rk": [("koerer", None, MIG)]}
        if "SELECT status, arbejder_id, annuller_anmodet" in sql:
            return {"rk": [("indlaeser", MIG, None)]}
        if sql.startswith("SELECT COUNT(*) FROM dbo.KoerselNoegletals"):
            return {"rk": [(1,)]}
        if sql.startswith("SELECT COUNT(*) FROM (SELECT 1"):
            return {"rk": [(0,)]}
        if sql.startswith("SELECT COUNT(*)"):
            return {"rk": [(0,)]}
        if "FROM dbo.Tidsseries WHERE id=?" in sql:
            return {"rk": [("Files/fjv/tidsserier/x/y.csv",)]}
        if sql.startswith("UPDATE") or sql.startswith("IF NOT EXISTS"):
            return {"n": 1}
        return {}
    return svar


def _falsk_koer_en(raekker, kid, lager, rap, *, forventet_hash=None, **_):
    """Bruger hver lager-metode, ``koer_en`` bruger, i den rækkefølge den gør."""
    if lager.er_annulleret():
        raise RuntimeError("uventet")
    lager.saet(fase="Kontrollerer input")
    lager.hjerteslag()
    lager.tidsserie_sti("11111111-0000-4000-8000-000000000011")
    lager.saet(model_commit="m" * 40, data_commit="d" * 40, startet="nu")
    if kid == KOERSEL_B:                         # anden kørsel: modelfejl
        lager.skift("koerer", "fejl", fejlbesked="Modellen er uløselig", afsluttet="nu")
        return {"koersel_id": kid, "status": "fejl", "fejlbesked": "Modellen er uløselig"}
    lager.skift("koerer", "indlaeser")
    lager.publicer([{"gruppe": "g", "objekt": None, "marked": None, "noegle": "n", "vaerdi": 1.5,
                     "enhed": "DKK"}], [], [], slutfelter={"objektiv_dkk": 1.5, "fase": "x"})
    return {"koersel_id": kid, "status": "faerdig", "objektiv_dkk": 1.5}


def spor_arbejder(laas_fri: bool) -> list:
    from fjv import db as DB
    from fjv import koersel as KS
    from fjv.rapport import Rapport
    log: list = []
    DB.Db = _stubdb(DB, _koersel_svar(laas_fri), log)
    DB._aktivitet_id = lambda: "spor"
    DB.SolverLaas.VAGT_S = 3600.0               # vagt-tråden må ikke skyde ind i sporet
    DB._KOLONNE_CACHE.clear()
    del DB.GRUND[:]
    KS.koer_en = _falsk_koer_en
    rap = Rapport("spor", sti=str(Path(tempfile.mkdtemp()) / "r.json"))
    t = DB.koer_notebook({}, rap, koersel_id=KOERSEL_A)
    return [{"tilstand": t, "trin": [[x["navn"], x["vaerdi"]] for x in rap.data["trin"]],
             "advarsler": rap.data["advarsler"]}] + log


def _import_svar():
    koe = [IMPORT_B]

    def svar(sql, p):
        if "COL_LENGTH" in sql:
            return {"rk": [(1,)]}
        if "UPDATE n SET status='koerer'" in sql:
            if "id=?" in sql:
                return {"kol": ["id", "filnavn", "sti", "uploadet_af", "timeslut"],
                        "rk": [(p[0].upper(), "a.xlsx", "Files/fjv/uploads/findes_ikke.xlsx", "x", 0)]}
            if not koe:
                return {"kol": ["id"], "rk": []}
            return {"kol": ["id", "filnavn", "sti", "uploadet_af", "timeslut"],
                    "rk": [(koe.pop(0).upper(), "b.xlsx", None, "y", 1)]}
        if "FROM dbo.Motors" in sql:
            return {"rk": [("m" * 40, "d" * 40)]}
        if sql.startswith("UPDATE"):
            return {"n": 1}
        return {}
    return svar


def spor_import() -> list:
    from fjv import db as DB
    from fjv import vaerksark as VS
    from fjv.rapport import Rapport
    log: list = []
    DB.Db = _stubdb(DB, _import_svar(), log)
    DB._KOLONNE_CACHE.clear()
    VS.maal_loft = lambda: {"platform": "spor"}
    rap = Rapport("spor", sti=str(Path(tempfile.mkdtemp()) / "r.json"))
    t = VS.koer_notebook({}, rap, import_id=IMPORT_A.upper())
    for i in t["importer"]:
        i["sekunder"] = "<s>"                    # tid, ikke adfærd
    # Fejlbeskeden nævner den lokale arbejdsmappe ikke; trin "fejl" er deterministisk.
    return [{"tilstand": t, "trin": [[x["navn"], x["vaerdi"]] for x in rap.data["trin"]],
             "advarsler": rap.data["advarsler"]}] + log


def main(rod: str) -> None:
    sys.stdout.reconfigure(errors="replace", encoding="utf-8")
    files = tempfile.mkdtemp(prefix="fjv_spor_")
    os.environ["FJV_FILES"] = files
    sys.path.insert(0, str(Path(rod).resolve()))
    import contextlib
    import io
    with contextlib.redirect_stdout(io.StringIO()):          # Rapport.trin printer
        ud = {"arbejder_laas_fri": spor_arbejder(True), "arbejder_laas_optaget": spor_arbejder(False),
              "import": spor_import()}
    tekst = json.dumps(ud, ensure_ascii=False, indent=1, default=str, sort_keys=True)
    print(tekst.replace(files.replace("\\", "/"), "<FILES>").replace(files, "<FILES>"))


if __name__ == "__main__":
    main(sys.argv[1])
