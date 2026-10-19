"""``fjernvarme_app valider-db`` — tjek en database, der (måske) er skrevet udefra med SQL, mod skemaet.

Tre lag, alle fund i én liste (``niveau`` fejl/advarsel, ``entitet``, ``id``, ``kolonne``, ``kode``, ``besked``):

1. **Struktur**: skemaversion (``_skema``), hver tabel og kolonne findes; ekstra kolonner er en advarsel.
2. **Rækker**: typer, længder (UTF-16), sæt, mønstre, gyldig JSON i ``*_json`` — ``fjv_skema.tjek_raekke``.
3. **På tværs**: primærnøgler, unikke kolonner og invarianter (fx højst én aktiv tidsserie pr. værk og rolle),
   referencer og Motor-rækkens faste id — ``fjv_skema.tjek_data``.

Rækkerne læses RÅ (uden serverens typekonvertering), så en tekst i forkert form opdages i stedet for at blive
"rettet" ved læsning. Undtagelse: mssql returnerer uuid med store bogstaver af natur; de sænkes før tjekket.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from . import skema as S


def _fund(niveau, entitet, kolonne, kode, besked, id_=None) -> dict:
    return {"niveau": niveau, "entitet": entitet, "id": id_, "kolonne": kolonne, "kode": kode, "besked": besked}


def valider(app) -> list[dict]:
    fs = S.fjv_skema()
    raa = app.skema.raa
    db = app.db
    ud: list[dict] = []
    ins = inspect(db.engine)
    tabeller = set(ins.get_table_names())
    if fs.SKEMA_TABEL not in tabeller:
        ud.append(_fund("fejl", fs.SKEMA_TABEL, None, "skemaversion",
                        "Tabellen _skema mangler (databasen er ikke oprettet med skema/ddl/*.sql)."))
    else:
        v = db.gemt_version()
        if v != raa["version"]:
            ud.append(_fund("fejl", fs.SKEMA_TABEL, "version", "skemaversion",
                            f"Databasen har skemaversion {v}, skemaet er version {raa['version']}."))
    data: dict[str, list[dict]] = {}
    q = db.engine.dialect.identifier_preparer
    with db.engine.connect() as cn:
        for t in raa["tabeller"]:
            e, tb = t["entitet"], t["tabel"]
            if tb not in tabeller:
                ud.append(_fund("fejl", e, None, "tabel_mangler", f"Tabellen {tb} findes ikke."))
                continue
            findes = {c["name"] for c in ins.get_columns(tb)}
            kol = [k["navn"] for k in t["kolonner"]]
            for k in kol:
                if k not in findes:
                    ud.append(_fund("fejl", e, k, "kolonne_mangler", f"Kolonnen {tb}.{k} findes ikke."))
            for k in sorted(findes - set(kol)):
                ud.append(_fund("advarsel", e, k, "ekstra_kolonne",
                                f"Kolonnen {tb}.{k} er ikke i skemaet (appen bruger den ikke)."))
            laes = [k for k in kol if k in findes]
            if not laes:
                continue
            sql = f"SELECT {', '.join(q.quote(k) for k in laes)} FROM {q.quote(tb)}"
            uuid_kol = {k["navn"] for k in t["kolonner"] if k["type"] == "uuid"}
            rk = []
            for r in cn.execute(text(sql)).mappings():
                d = dict(r)
                if db.dialekt != "sqlite":
                    for k in uuid_kol:
                        if d.get(k) is not None:
                            d[k] = str(d[k]).lower()
                rk.append(d)
            data[e] = rk
    ud += fs.tjek_data(data, raa)
    ud += kalenderfund(raa, data)
    return ud


def kalenderfund(raa: dict, data: dict[str, list[dict]]) -> list[dict]:
    """Datetime-tekst skal være en RIGTIG UTC-tid, ikke kun have formen (K6-F8): ``2026-99-99T25:61:61.000Z`` passer
    til mønsteret i ``fjv_skema.tjek_raekke`` men kan ikke eksistere; heller ikke 30. februar, 29. februar i et
    ikke-skudår eller kl. 24:00. (Drivere for postgresql/mssql giver ``datetime``-objekter, som altid er gyldige.)"""
    from datetime import datetime
    ud = []
    for t in raa["tabeller"]:
        tid_kol = [k["navn"] for k in t["kolonner"] if k["type"] == "datetime"]
        for r in data.get(t["entitet"], []):
            for k in tid_kol:
                v = r.get(k)
                if not isinstance(v, str):
                    continue
                try:
                    datetime.strptime(v, "%Y-%m-%dT%H:%M:%S.%fZ")
                except ValueError:
                    ud.append(_fund("fejl", t["entitet"], k, "tid_kalender",
                                    f"{k} = {v[:40]!r} er ikke et gyldigt UTC-tidspunkt (dato eller klokkeslæt findes ikke).",
                                    r.get("id")))
    return ud


def tekst(fund: list[dict]) -> str:
    fejl = [f for f in fund if f["niveau"] == "fejl"]
    adv = [f for f in fund if f["niveau"] != "fejl"]
    linjer = [f"{len(fejl)} fejl, {len(adv)} advarsler."]
    for f in fejl[:200] + adv[:50]:
        hvor = (f"{f['entitet']}" + (f".{f['kolonne']}" if f.get("kolonne") else "")
                + (f" [{f['id']}]" if f.get("id") else ""))
        linjer.append(f"  {f['niveau'].upper():8} {f['kode']:18} {hvor}: {f['besked']}")
    if len(fejl) > 200:
        linjer.append(f"  ... og {len(fejl) - 200} fejl mere (brug --json)")
    return "\n".join(linjer)
