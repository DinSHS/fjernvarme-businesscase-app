"""azsql: sqlcmd får tokenet fra os, ikke fra sin egen 10-s ``az``-kørsel (orkestratorens fund 18:35).

Live-beviset står i rapporten: med en ``az`` forsinket 15 s fejler det gamle ``ryd_tidsserier.py``
med *"AzureCLICredential: exit status 1"*, det nye lykkes. Her testes mekanikken uden netværk med
en falsk ``az`` og en falsk ``sqlcmd`` (begge .cmd), derfor kun på Windows - hvor fejlen findes.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent))
import azsql  # noqa: E402

SVAR = {"accessToken": "eyJhbGciOi.eyJhdWQiOi-_x.c2ln", "expiresOn": "2026-10-16 19:40:00.000000",
        "expires_on": 1792179600, "tokenType": "Bearer", "tenant": "t", "subscription": "s"}


@unittest.skipUnless(os.name == "nt", "skimmet er en .cmd; fejlen findes kun på Windows")
class TestAzSql(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.taeller = self.tmp / "az_kald.txt"

    def falsk_az(self, svar: str | None = None, fejl: str | None = None) -> str:
        p = self.tmp / "rigtig" / "az.cmd"
        p.parent.mkdir(exist_ok=True)
        if fejl:
            krop = f"@echo {fejl} 1>&2\r\n@exit /b 1\r\n"
        else:
            (self.tmp / "svar.json").write_text(svar or json.dumps(SVAR), encoding="ascii")
            krop = f'@echo x>>"{self.taeller}"\r\n@type "{self.tmp / "svar.json"}"\r\n'
        p.write_bytes(krop.encode("ascii"))
        return str(p)

    def test_svaret_er_az_json_paa_en_linje(self):
        linje = azsql.hent_az_svar(self.falsk_az(json.dumps(SVAR, indent=2)))
        self.assertNotIn("\n", linje)
        self.assertEqual(json.loads(linje), SVAR)

    def test_az_fejl_vises_med_az_egen_tekst(self):
        with self.assertRaises(azsql.AzFejl) as f:
            azsql.hent_az_svar(self.falsk_az(fejl="AADSTS50076 run az login --scope"))
        self.assertIn("AADSTS50076", str(f.exception))

    def test_tegn_cmd_ville_tolke_afvises(self):
        with self.assertRaises(azsql.AzFejl):
            azsql.hent_az_svar(self.falsk_az(json.dumps({**SVAR, "accessToken": "a&b"})))

    def test_skimmet_svarer_straks_uanset_argumenter(self):
        linje = json.dumps(SVAR, separators=(",", ":"))
        mappe = azsql.skim_mappe()
        try:
            t0 = time.time()
            # Sådan kalder go-sqlcmd's AzureCLICredential az: cmd /c, cwd = SYSTEMROOT.
            r = subprocess.run(["cmd.exe", "/c", "az account get-access-token --output json --resource "
                                + azsql.RESSOURCE + " --tenant x"], capture_output=True, text=True,
                               cwd=os.environ.get("SYSTEMROOT"), env=azsql.sqlcmd_miljoe(linje, mappe))
            self.assertLess(time.time() - t0, 5)
            self.assertEqual(json.loads(r.stdout), SVAR)
        finally:
            import shutil
            shutil.rmtree(mappe, ignore_errors=True)

    def test_sqlcmd_bruger_skimmet_og_mappen_ryddes(self):
        falsk_sqlcmd = self.tmp / "sqlcmd.cmd"
        falsk_sqlcmd.write_bytes(b"@call az account get-access-token --output json --resource x\r\n")
        foer = set(Path(tempfile.gettempdir()).glob("fjv_azskim_*"))
        r = azsql.koer_sqlcmd("srv", "db", "SELECT 1", az=self.falsk_az(), sqlcmd=str(falsk_sqlcmd))
        self.assertEqual(json.loads(r.stdout), SVAR, "sqlcmd skal se netop det hentede svar")
        self.assertEqual(self.taeller.read_text().count("x"), 1, "den rigtige az kaldes kun af os, én gang")
        self.assertEqual(set(Path(tempfile.gettempdir()).glob("fjv_azskim_*")), foer, "skim-mappen skal væk")


if __name__ == "__main__":
    unittest.main()
