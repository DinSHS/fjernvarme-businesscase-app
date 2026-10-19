"""Fabrik til fv-port's ``logik/tests/test_tjenester.py``: de samme forløbstests mod ``SqlBetroetLager`` (sqlite).

    cd community
    FJV_BETROET_LAGER=sql_fabrik:fabrik PYTHONPATH=tests python -m unittest fjernvarme_app.logik.tests.test_tjenester

Ud over protokollen kræver testene ``indsaet(tabel, raekke)``, ``raekker(tabel, **filter)`` og ``en(tabel, id)``
(seed og eftersyn med Rayfins tabelnavne). Seed-rækker er ofte delvise (kun de felter, testen handler om); de
NOT NULL-kolonner, der mangler, får en neutral værdi her, så den rigtige database kan tage imod dem. Det rører
ikke det, der testes: forløbene læser kun de kolonner, de selv har brug for.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

import hjaelp as H
from fjernvarme_app.betroet_lager import SqlBetroetLager, er_unikbrud
from fjernvarme_app.typer import nu, ny_uuid


def _neutral(k):
    return {"uuid": ny_uuid(), "text": "x" * max(1, k.min or 1), "set": k.saet[0] if k.saet else "x", "int": 0,
            "decimal": 0, "boolean": False, "datetime": nu()}[k.type]


class SqlTestLager(SqlBetroetLager):
    def __init__(self):
        self.app = H.ny_app()
        super().__init__(self.app.db)
        self._info = {t.tabel: t for t in self.app.skema.tabeller.values()}

    def nu(self):
        return nu()

    def indsaet(self, tabel: str, raekke: dict) -> dict:
        from fjernvarme_app.logik.lager import UnikBrud
        info = self._info[tabel]
        r = dict(raekke)
        r.setdefault("id", ny_uuid())
        for k in info.kolonner:
            if r.get(k.navn) is None and not k.nullable:
                r[k.navn] = _neutral(k)
        try:
            with self.db.skriv() as cn:
                cn.execute(self.db.t(tabel).insert().values(**r))
        except IntegrityError as e:
            if er_unikbrud(e):
                raise UnikBrud(str(e.orig)) from None
            raise
        return self.en(tabel, r["id"])

    def opdater(self, tabel: str, id: str, **felter) -> None:
        t = self.db.t(tabel)
        with self.db.skriv() as cn:
            cn.execute(t.update().where(t.c.id == id.lower()).values(**felter))

    def raekker(self, tabel: str, **filter_) -> list[dict]:
        t = self.db.t(tabel)
        q = select(t)
        for k, v in filter_.items():
            q = q.where(t.c[k].is_(None) if v is None else t.c[k] == (v.lower() if isinstance(v, str) and
                                                                         k.endswith("id") else v))
        # Indsættelsesrækkefølge (som hukommelsesudgaven): testene bygger {sti: værdi} af rækkerne, og SQL har ellers
        # ingen defineret rækkefølge (målt: KoerselInputs kom i indeksets orden, så kilde=vaerk "vandt").
        from sqlalchemy import literal_column
        q = q.order_by(literal_column("rowid"))
        with self.db.laes() as cn:
            return [dict(x._mapping) for x in cn.execute(q).fetchall()]

    def en(self, tabel: str, id: str) -> dict | None:
        """En LEVENDE række: testene retter seed-data ved at mutere svaret (``en(...)["arkiveret"] = True``),
        som hukommelsesudgaven tillader; her skrives en sådan mutation igennem til databasen."""
        rk = self.raekker(tabel, id=id)
        return _Levende(self, tabel, rk[0]) if rk else None


class _Levende(dict):
    def __init__(self, lager, tabel, r):
        super().__init__(r)
        self._l, self._t = lager, tabel

    def __setitem__(self, k, v):
        super().__setitem__(k, v)
        t = self._l.db.t(self._t)
        with self._l.db.skriv() as cn:
            cn.execute(t.update().where(t.c.id == self["id"]).values(**{k: v}))


def fabrik():
    return SqlTestLager()
