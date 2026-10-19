"""Testoprydning af tidsserier og værksark-importer — KØRER LOKALT, aldrig i en notebook.

Komplement til ``app/scripts/ryd_testdata.py`` (fv-app), der ikke kender ``Tidsseries`` og
``Vaerksarkimports``. Samme regler: kun en uforanderlig liste af uuid'er fra kommandolinjen,
aldrig noget udvalgt på navn; uden ``--udfoer`` rulles alt tilbage. Kræver ``az login`` og
go-sqlcmd.

    python ryd_tidsserier.py --server <fqdn> --database <navn> \\
        --tidsserie <id> [--tidsserie <id> ...] --import <id> [--import <id> ...] [--udfoer]

Kør ``ryd_testdata.py`` FØRST (kørsler, scenarier, værk): en tidsserie, som stadig er frosset
i en kørsels input, slettes ikke, for så ville kørslen pege på en række, der ikke findes.
Filerne i lakehouset (``Files/fjv/tidsserier/<værk>/``, ``Files/fjv/uploads/<id>.xlsx``)
fjernes ikke her.
"""
import argparse
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from azsql import AzFejl, koer_sqlcmd  # noqa: E402  (go-sqlcmd's 10-s grænse på az, se azsql.py)
UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def liste(ids):
    for i in ids:
        if not UUID.match(i):
            sys.exit(f"ikke et uuid: {i}")
    return ",".join(f"'{i}'" for i in ids) or "NULL"


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--server", required=True)
    a.add_argument("--database", required=True)
    a.add_argument("--tidsserie", action="append", default=[])
    a.add_argument("--import", dest="importer", action="append", default=[])
    a.add_argument("--udfoer", action="store_true")
    x = a.parse_args()
    t, i = liste(x.tidsserie), liste(x.importer)
    # LIKE på id'et i vaerdi_json: et uuid er entydigt nok til et værn, og et falsk positivt
    # fund stopper bare oprydningen.
    frosset = " OR ".join(f"vaerdi_json LIKE '%{v}%'" for v in x.tidsserie) or "1 = 0"
    sql = f"""
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
IF EXISTS (SELECT 1 FROM dbo.Vaerksarkimports WHERE id IN ({i}) AND status IN ('koe','koerer'))
    THROW 50001, 'En af importerne er i koe/koerer - vent til den er afsluttet.', 1;
IF EXISTS (SELECT 1 FROM dbo.KoerselInputs WITH (UPDLOCK, HOLDLOCK)
           WHERE sti LIKE '[_]koersel.tidsserie.%' AND ({frosset}))
    THROW 50002, 'En af tidsserierne er frosset i en koersels input - slet koerslerne foerst (ryd_testdata.py).', 1;
SELECT (SELECT COUNT(*) FROM dbo.Tidsseries WHERE id IN ({t})) AS tidsserier,
       (SELECT COUNT(*) FROM dbo.Vaerksarkimports WHERE id IN ({i})) AS importer;
DELETE FROM dbo.Vaerksarkimports WHERE id IN ({i});
DELETE FROM dbo.Tidsseries WHERE id IN ({t});
{"COMMIT;" if x.udfoer else "ROLLBACK; PRINT 'Proevekoersel - intet slettet (brug --udfoer).';"}
SELECT (SELECT COUNT(*) FROM dbo.Tidsseries WHERE id IN ({t})) AS tidsserier_tilbage,
       (SELECT COUNT(*) FROM dbo.Vaerksarkimports WHERE id IN ({i})) AS importer_tilbage;
"""
    try:
        r = koer_sqlcmd(x.server, x.database, sql)
    except AzFejl as e:
        sys.exit(f"intet token: {e}")
    print(r.stdout)
    print(r.stderr, file=sys.stderr)
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
