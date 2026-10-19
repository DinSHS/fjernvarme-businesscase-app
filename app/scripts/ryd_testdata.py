"""Testoprydning — KØRER LOKALT med udviklerens egen identitet, ALDRIG som Function (K2-F1).

Sletter præcis de angivne værker/kørsler/scenarier (en uforanderlig liste af id'er på kommandolinjen),
aldrig noget udvalgt på navn eller nøgle, som en bruger selv kan skrive. Kræver `az login` og go-sqlcmd
(`--authentication-method ActiveDirectoryAzCli`). Uden --udfoer vises kun hvad der ville blive slettet.

    python scripts/ryd_testdata.py --server <fqdn> --database <navn> --koersel <id> [--koersel <id> ...]
                                   [--scenarie <id> ...] [--vaerk <id> ...] [--udfoer]

Server og database står i app/docs/db_skema.md / rapporter/fv-app.md (skrives ikke ind her, så scriptet
ikke peger på et bestemt miljø).
"""
import argparse
import re
import subprocess
import sys

sys.stdout.reconfigure(errors="replace")
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
    a.add_argument("--koersel", action="append", default=[])
    a.add_argument("--scenarie", action="append", default=[])
    a.add_argument("--vaerk", action="append", default=[])
    a.add_argument("--udfoer", action="store_true")
    x = a.parse_args()
    k, s, v = liste(x.koersel), liste(x.scenarie), liste(x.vaerk)
    sql = f"""
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @k TABLE (id uniqueidentifier);
INSERT INTO @k SELECT id FROM dbo.Koersels WHERE id IN ({k}) OR scenarie_id IN ({s}) OR vaerk_id IN ({v});
IF EXISTS (SELECT 1 FROM dbo.Koersels WHERE id IN (SELECT id FROM @k) AND status IN ('startet','koerer','indlaeser'))
    THROW 50001, 'En af kørslerne er aktiv — annullér og vent først.', 1;
DELETE FROM dbo.KoerselInputs WHERE koersel_id IN (SELECT id FROM @k);
DELETE FROM dbo.KoerselNoegletals WHERE koersel_id IN (SELECT id FROM @k);
DELETE FROM dbo.KoerselMaaneds WHERE koersel_id IN (SELECT id FROM @k);
DELETE FROM dbo.KoerselTimes WHERE koersel_id IN (SELECT id FROM @k);
DELETE FROM dbo.Bestillings WHERE id IN (SELECT bestilling_id FROM dbo.Koersels WHERE id IN (SELECT id FROM @k)) OR scenarie_id IN ({s});
DELETE FROM dbo.Koersels WHERE id IN (SELECT id FROM @k);
DELETE FROM dbo.ScenarieAendrings WHERE scenarie_id IN ({s});
DELETE FROM dbo.Scenaries WHERE id IN ({s});
DELETE FROM dbo.Aendringsanmodnings WHERE vaerk_id IN ({v});
DELETE FROM dbo.Aendringslogs WHERE vaerk_id IN ({v});
DELETE FROM dbo.VaerkParameters WHERE vaerk_id IN ({v});
DELETE FROM dbo.Vaerks WHERE id IN ({v});
SELECT (SELECT COUNT(*) FROM @k) AS koersler;
{"COMMIT;" if x.udfoer else "ROLLBACK; PRINT 'Prøvekørsel — intet slettet (brug --udfoer).';"}
"""
    r = subprocess.run(["sqlcmd", "-S", x.server, "-d", x.database, "--authentication-method", "ActiveDirectoryAzCli",
                        "-y", "0", "-b", "-Q", sql], capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(r.stdout)
    print(r.stderr, file=sys.stderr)
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
