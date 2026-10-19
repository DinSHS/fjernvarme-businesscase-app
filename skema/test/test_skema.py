"""Tests for skema/ — kun standardbiblioteket.

    python -m unittest discover -s skema/test -t skema        (fra produktmappen)

* skema.json er gyldigt, de afledte filer er i takt, og strukturen er fastfrosset pr. version
* sqlite-DDL'en KØRES og opfører sig som ddl_tilfaelde.json siger (samme tilfælde som postgresql.test.mjs)
* tjek_raekke / tjek_data (valider-db's regler)
* den MÅLTE Fabric-database (maalt/*.json) har præcis skemaets Rayfin-typer, nullability, unikke og CHECKs
"""

from __future__ import annotations

import copy
import json
import re
import sqlite3
import sys
import unittest
from decimal import Decimal
from pathlib import Path

HER = Path(__file__).resolve().parent
ROD = HER.parent
sys.path.insert(0, str(ROD))

import byg  # noqa: E402
import fjv_skema as S  # noqa: E402

SKEMA = S.laes()
TILFAELDE = json.loads((HER / "ddl_tilfaelde.json").read_text(encoding="utf-8"))
NYT_ID = "f0f0f0f0-0000-4000-8000-000000000001"


def sqlite_vaerdi(v):
    return int(v) if isinstance(v, bool) else v


def sqlite_db() -> sqlite3.Connection:
    cn = sqlite3.connect(":memory:", isolation_level=None)
    cn.executescript((ROD / "ddl" / "sqlite.sql").read_text(encoding="utf-8"))
    return cn


def indsaet(cn: sqlite3.Connection, entitet: str, raekke: dict) -> None:
    tb = S.tabel(SKEMA, entitet)["tabel"]
    cols = list(raekke)
    cn.execute(f'INSERT INTO "{tb}" ({", ".join(chr(34) + c + chr(34) for c in cols)}) VALUES ({", ".join("?" for _ in cols)})',
               [sqlite_vaerdi(raekke[c]) for c in cols])


def forventet(t: dict, dialekt: str) -> str:
    f = t["forventet"]
    return f if isinstance(f, str) else f[dialekt]


class Skemaet(unittest.TestCase):
    def test_gyldigt_og_15_tabeller(self):
        self.assertEqual(len(SKEMA["tabeller"]), 15)
        self.assertEqual(SKEMA["version"], 1)

    def test_afledte_filer_er_i_takt(self):
        self.assertEqual(byg.main(["--tjek"]), 0)

    def test_fastfrosset_struktur_kraever_ny_version(self):
        kopi = copy.deepcopy(SKEMA)
        S.tabel(kopi, "Vaerk")["kolonner"][1]["max"] = 61
        frossen = json.loads((ROD / "versioner" / "1.json").read_text(encoding="utf-8"))
        self.assertEqual(frossen, json.loads(json.dumps(S.struktur(SKEMA))))
        self.assertNotEqual(frossen, json.loads(json.dumps(S.struktur(kopi))))

    def test_beskrivelser_er_ikke_struktur(self):
        kopi = copy.deepcopy(SKEMA)
        S.tabel(kopi, "Vaerk")["kolonner"][1]["beskrivelse"] = "anden tekst"
        self.assertEqual(S.struktur(SKEMA), S.struktur(kopi))

    def test_validering_fanger_text_uden_max(self):
        kopi = copy.deepcopy(SKEMA)
        del S.tabel(kopi, "Vaerk")["kolonner"][1]["max"]
        with self.assertRaisesRegex(S.SkemaFejl, "Vaerk.kode: text kræver max"):
            S.valider_skema(kopi)

    def test_validering_fanger_ikke_ascii_kolonne(self):
        kopi = copy.deepcopy(SKEMA)
        S.tabel(kopi, "Vaerk")["kolonner"][2]["navn"] = "område"
        with self.assertRaisesRegex(S.SkemaFejl, "ASCII"):
            S.valider_skema(kopi)

    def test_validering_fanger_ref_til_ukendt(self):
        kopi = copy.deepcopy(SKEMA)
        S.tabel(kopi, "Koersel")["kolonner"][1]["ref"] = "Bestillingen"
        with self.assertRaisesRegex(S.SkemaFejl, "ukendt entitet"):
            S.valider_skema(kopi)

    def test_ddl_er_deterministisk_og_lf(self):
        for d in S.DIALEKTER:
            a, b = S.ddl(d), S.ddl(d)
            self.assertEqual(a, b)
            self.assertNotIn("\r", a)

    def test_hver_tabel_og_kolonne_staar_i_hver_dialekt(self):
        for d in S.DIALEKTER:
            tekst = (ROD / "ddl" / f"{d}.sql").read_text(encoding="utf-8")
            q = (lambda n: f"[{n}]") if d == "mssql" else (lambda n: f'"{n}"')
            for t in SKEMA["tabeller"]:
                blok = tekst.split(f"CREATE TABLE {q(t['tabel'])} (", 1)[1].split("\n);", 1)[0]
                for k in t["kolonner"]:
                    self.assertIn(f"    {q(k['navn'])} {S.ddl_type(SKEMA, k, d)}", blok, f"{d} {t['tabel']}.{k['navn']}")
                self.assertEqual(blok.count("("), blok.count(")"), f"{d} {t['tabel']}: parenteser")


class SqliteDDL(unittest.TestCase):
    """sqlite-DDL'en køres; samme tilfælde som postgresql.test.mjs."""

    @classmethod
    def setUpClass(cls):
        cls.cn = sqlite_db()
        cls.cn.execute("BEGIN")
        for e, r in TILFAELDE["gyldige"].items():
            indsaet(cls.cn, e, r)
        cls.cn.execute("COMMIT")

    @classmethod
    def tearDownClass(cls):
        cls.cn.close()

    def test_kolonner_som_skemaet(self):
        for t in SKEMA["tabeller"]:
            info = self.cn.execute(f'PRAGMA table_info("{t["tabel"]}")').fetchall()
            self.assertEqual([r[1] for r in info], [k["navn"] for k in t["kolonner"]], t["tabel"])
            for r, k in zip(info, t["kolonner"]):
                self.assertEqual(r[2], S.ddl_type(SKEMA, k, "sqlite"), f"{t['tabel']}.{k['navn']}")
                self.assertEqual(bool(r[3]), not k["nullable"], f"{t['tabel']}.{k['navn']} NOT NULL")

    def test_skemaversion(self):
        self.assertEqual(self.cn.execute('SELECT MAX(version) FROM "_skema"').fetchone()[0], SKEMA["version"])

    def test_gyldige_raekker_er_ogsaa_gyldige_for_valider_db(self):
        data = {e: [r] for e, r in TILFAELDE["gyldige"].items()}
        self.assertEqual(S.tjek_data(data), [])

    def test_tilfaelde(self):
        for t in TILFAELDE["tilfaelde"]:
            with self.subTest(t["navn"]):
                r = dict(TILFAELDE["gyldige"][t["entitet"]])
                r["id"] = NYT_ID
                if t["saet"] or t["forventet"] != "ok":
                    r.update(t["saet"])
                self.cn.execute("BEGIN")
                try:
                    indsaet(self.cn, t["entitet"], r)
                    faktisk = "ok"
                except sqlite3.IntegrityError:
                    faktisk = "afvist"
                finally:
                    self.cn.execute("ROLLBACK")
                self.assertEqual(faktisk, forventet(t, "sqlite"), t["navn"])

    def test_tilfaeldene_daekker_hver_invariant_med_ddl(self):
        navne = " ".join(t["navn"] for t in TILFAELDE["tilfaelde"])
        for t in SKEMA["tabeller"]:
            for i in t["invarianter"]:
                if i.get("ddl"):
                    self.assertTrue(any(t2["entitet"] == t["entitet"] and t2["forventet"] == "afvist" and "invariant" in t2["navn"]
                                        for t2 in TILFAELDE["tilfaelde"]), f"{t['entitet']}.{i['navn']} mangler et negativt tilfælde: {navne[:0]}")


class Migrationer(unittest.TestCase):
    """En v1-database med data løftes til en tænkt v2 og skal derefter være som en frisk v2."""

    def v2(self):
        til = copy.deepcopy(S.struktur(SKEMA))
        til["version"] = 2
        S.tabel(til, "Koersel")["kolonner"].append({"navn": "prioritet", "type": "set", "vaerdier": ["lav", "hoej"], "nullable": True})
        S.tabel(til, "Koersel")["kolonner"].append({"navn": "noter_af", "type": "text", "max": 200, "min": 1, "nullable": True})
        til["tabeller"].append({
            "entitet": "Kommentar", "tabel": "Kommentars", "klient": {"read": True, "create": True, "update": False, "delete": False},
            "kolonner": [{"navn": "id", "type": "uuid", "nullable": False, "pk": True},
                         {"navn": "koersel_id", "type": "uuid", "nullable": False, "ref": "Koersel"},
                         {"navn": "tekst", "type": "text", "max": 2000, "min": 1, "nullable": False}],
            "invarianter": [{"navn": "en_pr_koersel", "type": "unik", "kolonner": ["koersel_id"], "ddl": True}],
        })
        S.valider_skema(til)
        return til

    def skema_af(self, cn):
        ud = {}
        for (navn,) in cn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            ud[navn] = cn.execute(f'PRAGMA table_info("{navn}")').fetchall()
        idx = sorted(cn.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"))
        return ud, idx

    def test_v1_til_v2_i_sqlite(self):
        fra, til = S.struktur(SKEMA), self.v2()
        cn = sqlite_db()
        for e, r in TILFAELDE["gyldige"].items():
            indsaet(cn, e, r)
        cn.executescript(S.migration(fra, til, "sqlite"))
        frisk = sqlite3.connect(":memory:")
        frisk.executescript(S.ddl("sqlite", til))
        self.assertEqual(self.skema_af(cn), self.skema_af(frisk))
        self.assertEqual(cn.execute('SELECT MAX(version) FROM "_skema"').fetchone()[0], 2)
        self.assertEqual(cn.execute('SELECT COUNT(*) FROM "Koersels" WHERE "prioritet" IS NULL').fetchone()[0], 1)  # data overlevede
        with self.assertRaises(sqlite3.IntegrityError):  # den nye kolonnes CHECK virker efter ALTER
            cn.execute('UPDATE "Koersels" SET "prioritet" = \'mellem\'')
        with self.assertRaises(sqlite3.IntegrityError):
            cn.execute('UPDATE "Koersels" SET "noter_af" = \' \'')
        cn.close()
        frisk.close()

    def test_migration_til_alle_dialekter_er_additiv_sql(self):
        for d in S.DIALEKTER:
            sql = S.migration(S.struktur(SKEMA), self.v2(), d)
            self.assertNotRegex(sql, r"\b(DROP|DELETE|UPDATE)\b", d)
            self.assertIn("Kommentars", sql)

    def test_ikke_additive_aendringer_afvises(self):
        fra = S.struktur(SKEMA)
        tilfaelde = {
            "fjernet kolonne": lambda t: S.tabel(t, "Vaerk")["kolonner"].pop(3),
            "ændret max": lambda t: S.tabel(t, "Vaerk")["kolonner"][1].update(max=80),
            "ny sæt-værdi": lambda t: S.tabel(t, "Koersel")["kolonner"][6]["vaerdier"].append("pause"),
            "ny NOT NULL-kolonne": lambda t: S.tabel(t, "Vaerk")["kolonner"].append({"navn": "x", "type": "int", "nullable": False}),
            "fjernet tabel": lambda t: t["tabeller"].pop(),
            "ændret invariant": lambda t: S.tabel(t, "KoerselTime")["invarianter"][0].update(ddl=False),
        }
        for navn, aendr in tilfaelde.items():
            with self.subTest(navn):
                til = copy.deepcopy(fra)
                til["version"] = 2
                aendr(til)
                with self.assertRaises(S.IkkeAdditiv):
                    S.migration(fra, til, "sqlite")

    def test_springer_ikke_versioner_over(self):
        til = copy.deepcopy(S.struktur(SKEMA))
        til["version"] = 3
        with self.assertRaisesRegex(S.SkemaFejl, "ét trin"):
            S.migration(S.struktur(SKEMA), til, "sqlite")


class Raekkeregler(unittest.TestCase):
    def koder(self, entitet, raekke):
        return {(f["kolonne"], f["kode"]) for f in S.tjek_raekke(entitet, raekke)}

    def test_gyldige_raekker(self):
        for e, r in TILFAELDE["gyldige"].items():
            self.assertEqual(S.tjek_raekke(e, r), [], e)

    def test_utf16_laengde(self):
        self.assertEqual(S.utf16_laengde("æøå"), 3)
        self.assertEqual(S.utf16_laengde("\U0001F600"), 2)  # som nvarchar og JS .length
        r = dict(TILFAELDE["gyldige"]["Vaerk"], kode="a" * 59 + "\U0001F600")
        self.assertIn(("kode", "for_lang"), self.koder("Vaerk", r))  # len() ville sige 60 = OK

    def test_min_taeller_ikke_afsluttende_mellemrum(self):
        self.assertIn(("navn", "for_kort"), self.koder("Vaerk", dict(TILFAELDE["gyldige"]["Vaerk"], navn="  ")))
        self.assertNotIn(("navn", "for_kort"), self.koder("Vaerk", dict(TILFAELDE["gyldige"]["Vaerk"], navn=" a")))

    def test_json_som_js(self):
        self.assertFalse(S.gyldig_json("NaN"))
        self.assertFalse(S.gyldig_json("[1, Infinity]"))
        self.assertTrue(S.gyldig_json("[1.0, null]"))
        r = dict(TILFAELDE["gyldige"]["VaerkParameter"], vaerdi_json="NaN")
        self.assertIn(("vaerdi_json", "json"), self.koder("VaerkParameter", r))

    def test_typer(self):
        g = TILFAELDE["gyldige"]
        self.assertIn(("id", "uuid"), self.koder("Tidsserie", dict(g["Tidsserie"], id=g["Tidsserie"]["id"].upper())))
        self.assertIn(("status", "saet"), self.koder("Koersel", dict(g["Koersel"], status="KOE")))
        self.assertIn(("revision", "int"), self.koder("Vaerk", dict(g["Vaerk"], revision=True)))
        self.assertIn(("revision", "int"), self.koder("Vaerk", dict(g["Vaerk"], revision=2**31)))
        self.assertIn(("objektiv_dkk", "decimal_for_stor"), self.koder("Koersel", dict(g["Koersel"], objektiv_dkk=Decimal("1e24"))))
        self.assertNotIn(("objektiv_dkk", "decimal_for_stor"), self.koder("Koersel", dict(g["Koersel"], objektiv_dkk=Decimal("-" + "9" * 24 + ".9999"))))
        self.assertIn(("objektiv_dkk", "decimal"), self.koder("Koersel", dict(g["Koersel"], objektiv_dkk=float("nan"))))
        self.assertIn(("oprettet", "tid"), self.koder("Vaerk", dict(g["Vaerk"], oprettet="2026-10-16 06:00:00")))
        self.assertIn(("kode", "moenster"), self.koder("Vaerk", dict(g["Vaerk"], kode="Andeby")))
        self.assertIn(("maaned", "moenster"), self.koder("KoerselMaaned", dict(g["KoerselMaaned"], maaned="2026-13")))
        self.assertIn(("navn", "mangler"), self.koder("Vaerk", dict(g["Vaerk"], navn=None)))
        self.assertIn(("ukendt", "ukendt_kolonne"), self.koder("Vaerk", dict(g["Vaerk"], ukendt=1)))


class Tvaersregler(unittest.TestCase):
    def data(self):
        return {e: [dict(r)] for e, r in TILFAELDE["gyldige"].items()}

    def koder(self, data):
        return {(f["entitet"], f["kode"]) for f in S.tjek_data(data)}

    def test_reference_og_undtagelse(self):
        d = self.data()
        d["Koersel"][0]["scenarie_id"] = NYT_ID
        self.assertIn(("Koersel", "reference"), self.koder(d))
        d = self.data()
        d["Aendringsanmodning"][0]["vaerk_id"] = SKEMA["konstanter"]["NIL_UUID"]  # opret_vaerk: intet kildeværk
        self.assertEqual(S.tjek_data(d), [])

    def test_naturlig_noegle_med_null_som_vaerdi(self):
        d = self.data()
        d["KoerselNoegletal"].append(dict(d["KoerselNoegletal"][0], id=NYT_ID))  # objekt og marked er NULL i begge
        self.assertIn(("KoerselNoegletal", "dublet"), self.koder(d))

    def test_filtreret_invariant(self):
        d = self.data()
        d["Tidsserie"].append(dict(d["Tidsserie"][0], id=NYT_ID, aktiv=False))
        self.assertEqual(S.tjek_data(d), [])
        d["Tidsserie"][1]["aktiv"] = 1  # sqlite-formen tæller også
        self.assertIn(("Tidsserie", "dublet"), self.koder(d))

    def test_motor_fast_id(self):
        d = self.data()
        d["Motor"][0]["id"] = NYT_ID
        self.assertIn(("Motor", "fast_id"), self.koder(d))

    def test_scenarieaendring_dublet_kun_i_valider_db(self):
        d = self.data()
        d["ScenarieAendring"].append(dict(d["ScenarieAendring"][0], id=NYT_ID))
        self.assertIn(("ScenarieAendring", "dublet"), self.koder(d))

    def test_delvist_udtraek_siges_hoejt(self):
        d = self.data()
        del d["Bestilling"]
        f = S.tjek_data(d)
        self.assertIn(("Bestilling", "ikke_tjekket"), {(x["entitet"], x["kode"]) for x in f})
        self.assertFalse(any(x["kode"] == "reference" for x in f))  # referencer TIL Bestilling springes over, ikke fejlmeldes


class MaaltFabric(unittest.TestCase):
    """Den målte Fabric-database (Function skemaInfo, 06:25 UTC) mod skemaets Rayfin-profil (mssql)."""

    @classmethod
    def setUpClass(cls):
        filer = sorted((ROD / "maalt").glob("fabric_*.json"))
        cls.maalt = json.loads(filer[-1].read_text(encoding="utf-8"))
        cls.tab = {t["tabel"]: t for t in SKEMA["tabeller"]}

    # Tilføjet efter målingen 06:25 (KONTRAKT §6c/§6d, runde 3). Ikke målt, fordi az login er udløbet og
    # Function-vejen kræver et token, jeg ikke må hente; de er dækket af Rayfin-oraklet (rayfin.test.mjs).
    IKKE_MAALT_TABELLER = {"Motors", "Tidsseries", "Vaerksarkimports"}
    IKKE_MAALT_KOLONNER = {("Scenaries", "reference_scenarie_id"), ("Koersels", "modtaget")}

    def fysisk(self, d):
        if d["type"] in ("nvarchar", "varchar"):
            return f"NVARCHAR({d['laengde']})" if d["type"] == "nvarchar" else f"VARCHAR({d['laengde']})"
        if d["type"] == "decimal":
            return f"DECIMAL({d['praecision']},{d['skala']})"
        return {"uniqueidentifier": "UNIQUEIDENTIFIER", "int": "INT", "bit": "BIT", "datetime2": "DATETIME2"}[d["type"]]

    def test_maalte_tabeller_og_huller_er_kendte(self):
        self.assertEqual(set(self.maalt["kolonner"]) | self.IKKE_MAALT_TABELLER, set(self.tab))
        mangler = set()
        for tb, t in self.tab.items():
            if tb in self.IKKE_MAALT_TABELLER:
                continue
            for k in t["kolonner"]:
                if k["navn"] not in self.maalt["kolonner"][tb]:
                    mangler.add((tb, k["navn"]))
            for c in self.maalt["kolonner"][tb]:
                self.assertIn(c, [k["navn"] for k in t["kolonner"]], f"{tb}.{c} findes i databasen, ikke i skemaet")
        self.assertEqual(mangler, self.IKKE_MAALT_KOLONNER)

    def test_typer_og_nullability(self):
        for tb, kols in self.maalt["kolonner"].items():
            for k in self.tab[tb]["kolonner"]:
                if k["navn"] not in kols:
                    continue
                with self.subTest(f"{tb}.{k['navn']}"):
                    self.assertEqual(self.fysisk(kols[k["navn"]]), S.rayfin_type(SKEMA, k, "mssql"))
                    self.assertEqual(kols[k["navn"]]["nullable"], k["nullable"])

    def test_unikke(self):
        maalt = {(u["tabel"], tuple(u["kolonner"]), u["art"]) for u in self.maalt["unikke"] if u["tabel"] in self.tab}
        forventet = set()
        for tb in self.maalt["kolonner"]:
            forventet.add((tb, ("id",), "PK"))
            for k in self.tab[tb]["kolonner"]:
                if k.get("unik"):
                    forventet.add((tb, (k["navn"],), "UNIQUE"))
        self.assertEqual(maalt, forventet)

    def test_checks(self):
        """SQL Server gemmer `x IN ('a','b')` som `([x]='b' OR [x]='a')` og `LEN([x]) >= 1` som `(len([x])>=(1))`."""
        maalt = set()
        for c in self.maalt["checks"]:
            u = c["udtryk"]
            m = re.fullmatch(r"\(len\(\[(\w+)\]\)>=\((\d+)\)\)", u)
            if m:
                maalt.add((c["tabel"], m.group(1), "min", m.group(2)))
                continue
            led = re.findall(r"\[(\w+)\]='([^']*)'", u)
            self.assertTrue(led, u)
            maalt.add((c["tabel"], led[0][0], "set", tuple(sorted(v for _, v in led))))
        forventet = set()
        for tb in self.maalt["kolonner"]:
            for k in self.tab[tb]["kolonner"]:
                if k["type"] == "set":
                    forventet.add((tb, k["navn"], "set", tuple(sorted(k["vaerdier"]))))
                elif k["type"] == "text" and k.get("min"):
                    forventet.add((tb, k["navn"], "min", str(k["min"])))
        self.assertEqual(maalt, forventet)


if __name__ == "__main__":
    unittest.main()
