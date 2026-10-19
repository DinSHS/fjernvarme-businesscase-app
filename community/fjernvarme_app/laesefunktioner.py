"""``skemaInfo`` — læs-kun diagnose af databasens faktiske tabeller/kolonner (samme svarform som
``function_app.ts``). De øvrige læse-funktioner (``hentKildeYaml``, ``hentDmiTemperatur``, ``hentTidsserie``) er
fv-port's forløb i ``logik.tjenester``.
"""

from __future__ import annotations

from sqlalchemy import inspect


def skema_info(app) -> dict:
    """Læs-kun diagnose af databasens faktiske tabeller/kolonner (samme form som Fabric-udgaven)."""
    ins = inspect(app.db.engine)
    kolonner, unikke = [], []
    for tn in sorted(ins.get_table_names()):
        for c in ins.get_columns(tn):
            typ = c["type"]
            kolonner.append({"tabel": tn, "kolonne": c["name"], "type": str(typ).lower(),
                             "laengde": getattr(typ, "length", None), "praecision": getattr(typ, "precision", None),
                             "skala": getattr(typ, "scale", None), "nullable": bool(c.get("nullable", True))})
        pk = ins.get_pk_constraint(tn).get("constrained_columns") or []
        if pk:
            unikke.append(f"{tn}({','.join(pk)}) PK")
        for u in ins.get_unique_constraints(tn):
            unikke.append(f"{tn}({','.join(u['column_names'])}) UNIQUE")
        for i in ins.get_indexes(tn):
            if i.get("unique"):
                unikke.append(f"{tn}({','.join(i['column_names'])}) UNIQUE")
    checks = []
    for tn in sorted(ins.get_table_names()):
        try:
            for c in ins.get_check_constraints(tn):
                checks.append(f"{tn}: {c.get('sqltext')}")
        except NotImplementedError:
            pass
    return {"login": f"{app.db.dialekt}:{app.bruger}", "kolonner": kolonner, "unikke": unikke, "checks": checks}
