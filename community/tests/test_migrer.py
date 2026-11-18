"""Runde 14b: skemaversion 2 (KoerselTimeDel) - en lokal database fra version 1 løftes med ``migrer``.

Serveren starter kun på sin egen skemaversion (``Database.kontroller``). En driftsperson med SQLite på Windows har
sjældent ``sqlite3`` ved hånden, så kommandoen ``python -m fjernvarme_app migrer`` kører de genererede migrationer
(skema/migrationer, kun tilføjelser) i én transaktion pr. trin og tager en kopi af en SQLite-database først.
"""

from __future__ import annotations

import io
import json
import sqlite3
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import hjaelp as H
from fjernvarme_app import cli
from fjernvarme_app import skema as S
from fjernvarme_app.database import Database, sqlite_url

V1 = json.loads((S.skema_mappe() / "versioner" / "1.json").read_text(encoding="utf-8")) \
    if (S.skema_mappe() / "versioner" / "1.json").is_file() else None
TILFAELDE = json.loads((H.HER.parent.parent / "skema/test/ddl_tilfaelde.json").read_text(encoding="utf-8"))


def v1_database(mappe: Path) -> Path:
    """En SQLite-database, som version 1's DDL laver den, med én gyldig række i hver tabel."""
    mappe.mkdir(parents=True, exist_ok=True)
    sti = mappe / "fjernvarme.db"
    cn = sqlite3.connect(sti)
    cn.executescript(S.fjv_skema().ddl("sqlite", V1))
    navne = {t["entitet"]: t["tabel"] for t in V1["tabeller"]}
    for e, r in TILFAELDE["gyldige"].items():
        if e in navne:
            cn.execute(f'INSERT INTO "{navne[e]}" ({", ".join(chr(34) + c + chr(34) for c in r)}) '
                       f'VALUES ({", ".join("?" for _ in r)})', [int(v) if isinstance(v, bool) else v for v in r.values()])
    cn.commit()
    cn.close()
    return sti


@unittest.skipIf(V1 is None, "skema/versioner/1.json findes kun i repoet")
class TestMigrer(unittest.TestCase):
    def setUp(self):
        self.mappe = H.ROD / f"migrer_{self._testMethodName}"
        self.db = v1_database(self.mappe)

    def koer(self, *argv) -> tuple[int, str]:
        ud = io.StringIO()
        with redirect_stdout(ud):
            rc = cli.main(["--data", str(self.mappe), *argv])
        return rc, ud.getvalue()

    def test_serveren_afviser_version_1_og_siger_hvad_man_goer(self):
        db = Database(sqlite_url(self.db), S.laes())
        with self.assertRaisesRegex(RuntimeError, r"skemaversion 1, serveren kræver 2.*fjernvarme_app migrer"):
            db.kontroller()

    def test_migrer_tager_en_kopi_og_loefter_til_version_2_uden_at_tabe_data(self):
        rc, ud = self.koer("migrer")
        self.assertEqual(rc, 0, ud)
        self.assertIn("1 -> 2", ud)
        kopi = self.mappe / "fjernvarme.db.skemaversion1.kopi"
        self.assertTrue(kopi.is_file(), ud)
        self.assertEqual(sqlite3.connect(kopi).execute('SELECT MAX(version) FROM "_skema"').fetchone()[0], 1)

        db = Database(sqlite_url(self.db), S.laes())
        db.kontroller()                                        # serveren starter nu
        cn = sqlite3.connect(self.db)
        self.assertEqual(cn.execute('SELECT COUNT(*) FROM "KoerselTimes"').fetchone()[0], 1)    # data overlevede
        self.assertEqual(cn.execute('SELECT COUNT(*) FROM "KoerselTimeDels"').fetchone()[0], 0)
        # Strukturelt som en frisk version 2-database (samme tabeller, kolonner og indeks).
        frisk = sqlite3.connect(":memory:")
        frisk.executescript(S.ddl("sqlite"))
        skema_af = lambda c: (sorted(c.execute("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")))  # noqa: E731
        self.assertEqual(skema_af(cn), skema_af(frisk))
        cn.close()

        rc, ud = self.koer("migrer")                           # igen: intet at gøre
        self.assertEqual(rc, 0)
        self.assertIn("allerede skemaversion 2", ud)

    def test_en_database_fra_en_nyere_version_roeres_ikke(self):
        cn = sqlite3.connect(self.db)
        cn.execute('INSERT INTO "_skema" ("version") VALUES (99)')
        cn.commit()
        cn.close()
        rc, _ = self.koer("migrer")
        self.assertEqual(rc, 2)
        self.assertFalse((self.mappe / "fjernvarme.db.skemaversion99.kopi").exists())


if __name__ == "__main__":
    unittest.main()
