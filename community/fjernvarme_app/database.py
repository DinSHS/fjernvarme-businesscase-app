"""Databasen: SQLAlchemy Core over sqlite (standard), postgresql eller mssql.

Tabellerne bygges ved kørsel fra ``skema/skema.json`` (``skema.py``) — der er ingen håndskrevet kopi.

Transaktioner
-------------
* ``laes()`` — en forbindelse til læsning.
* ``skriv()`` — én transaktion. På sqlite åbnes den med ``BEGIN IMMEDIATE``: skrivelåsen tages ved start,
  så "læs → tjek → skriv" ikke kan blandes med en anden skriver (det er sqlite's svar på
  ``UPDLOCK, HOLDLOCK``). På postgresql/mssql låses de læste rækker med ``laas_raekke`` (``FOR UPDATE`` /
  ``WITH (UPDLOCK, HOLDLOCK)``, se ``laas_for``), og serverens betroede skrivninger går desuden én ad gangen i processen
  (``betroet_mutex``) — appen er én server; arbejderen er en anden proces og rører kun Koersel*/Motor/import
  med betingede UPDATEs.
* WAL og ``busy_timeout`` på sqlite, så server og arbejder-proces kan arbejde samtidig.
"""

from __future__ import annotations

import threading
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, event, func, select, text
from sqlalchemy.engine import Engine

#: Serverens betroede skrivninger, én ad gangen (se modulets docstring).
betroet_mutex = threading.RLock()


def sqlite_url(sti: Path) -> str:
    return "sqlite:///" + str(Path(sti).resolve()).replace("\\", "/")


def lav_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        e = create_engine(url, connect_args={"timeout": 60, "check_same_thread": False})

        @event.listens_for(e, "connect")
        def _forbind(dbapi_cn, _rec):
            # pysqlite's egen transaktionsstyring slås fra; vi udsender selv BEGIN (SQLAlchemy-opskriften).
            dbapi_cn.isolation_level = None
            cur = dbapi_cn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=60000")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        @event.listens_for(e, "begin")
        def _begin(cn):
            cn.exec_driver_sql("BEGIN IMMEDIATE" if cn.info.get("skriv") else "BEGIN")

        return e
    return create_engine(url, pool_pre_ping=True)


class Database:
    """Motor + tabeller. ``t("Koersel")`` og ``t("Koersels")`` giver samme tabel."""

    def __init__(self, url: str, skema):
        self.url = url
        self.engine = lav_engine(url)
        self.skema = skema
        self.md: MetaData = skema.metadata
        self.entiteter = skema.entiteter            # Entitet -> SQL-tabelnavn
        self.skemaversion = skema.version

    @property
    def dialekt(self) -> str:
        return self.engine.dialect.name

    def t(self, navn: str) -> Table:
        tn = self.entiteter.get(navn, navn)
        if tn not in self.md.tables:
            raise KeyError(f"ukendt tabel/entitet {navn!r}")
        return self.md.tables[tn]

    @contextmanager
    def laes(self):
        with self.engine.connect() as cn:
            yield cn

    @contextmanager
    def skriv(self):
        with self.engine.connect() as cn:
            # NB: ``cn.info`` følger den POOLEDE DBAPI-forbindelse. Flaget skal ryddes igen, ellers åbner en senere
            # læsning på samme forbindelse med BEGIN IMMEDIATE og tager skrivelåsen (målt: valider-db låste sig selv).
            cn.info["skriv"] = True
            try:
                with cn.begin():
                    yield cn
            finally:
                cn.info.pop("skriv", None)

    def laas_raekke(self, q):
        """Lås de læste rækker til transaktionens slutning — se ``laas_for``."""
        return laas_for(q, self.dialekt)

    # -------------------------------------------------- skema
    def tabeller_findes(self) -> list[str]:
        from sqlalchemy import inspect
        return sorted(inspect(self.engine).get_table_names())

    def opret(self) -> bool:
        """En tom database får skemaet med fv-skemas DDL (samme script som SKEMA.md's "bring your own SQL").

        Findes tabellerne allerede, røres intet (returnerer False); versionen kontrolleres af ``kontroller``."""
        from . import skema as S
        fundne = set(self.tabeller_findes())
        if fundne & set(self.md.tables):
            return False
        script = S.ddl(self.dialekt)
        raw = self.engine.raw_connection()
        try:
            if self.dialekt == "sqlite":
                raw.driver_connection.executescript(script)
            else:
                cur = raw.cursor()
                for stmt in _saetninger(script):
                    cur.execute(stmt)
                raw.commit()
        finally:
            raw.close()
        return True

    def gemt_version(self) -> int | None:
        try:
            with self.laes() as cn:
                return cn.execute(select(func.max(self.t("_skema").c.version))).scalar()
        except Exception:
            return None

    def kontroller(self) -> None:
        """Databasens skemaversion skal være serverens; en anden version er en fejl, ikke et forsøg."""
        v = self.gemt_version()
        if v is None:
            raise RuntimeError("databasen har ingen _skema-tabel - den er ikke oprettet med skema/ddl/*.sql "
                               "(eller er ikke en fjernvarme-database). Se SKEMA.md.")
        if v != self.skemaversion:
            raise RuntimeError(f"databasen har skemaversion {v}, serveren kræver {self.skemaversion}. "
                               "Kør migrationerne i skema/migrationer/ (SKEMA.md).")

    def ping(self) -> bool:
        with self.laes() as cn:
            cn.execute(text("SELECT 1"))
        return True


MSSQL_LAAS = "WITH (UPDLOCK, HOLDLOCK)"


def laas_for(q, dialekt: str):
    """``q`` med låsen, Fabric-handlerne bruger (``WITH (UPDLOCK, HOLDLOCK)``), pr. dialekt (K6-F7):

    * **mssql:** tabelhintet på HVER tabel i FROM. SQLAlchemy's ``with_for_update()`` kompilerer til INGENTING på
      mssql (målt) — derfor hintet.
    * **postgresql:** ``FOR UPDATE``. PostgreSQL har intet HOLDLOCK (ingen lås på rækker, der ikke findes); den
      unikke nøgle er værnet mod en samtidig indsættelse, og forløbene læser bruddet som ``UnikBrud``.
    * **sqlite:** intet — ``BEGIN IMMEDIATE`` har taget skrivelåsen for hele databasen.

    En låst AGGREGAT-forespørgsel (``count(*) … FOR UPDATE``) afvises med en fejl: PostgreSQL tillader den ikke, og den
    låser ikke det, man tror. Læs rækkerne låst og tæl dem i Python."""
    from sqlalchemy.sql.functions import FunctionElement
    for c in q.selected_columns:
        if isinstance(getattr(c, "element", c), FunctionElement):
            raise ValueError("en låst forespørgsel må ikke være et aggregat (læs rækkerne låst, og tæl dem)")
    if dialekt == "sqlite":
        return q
    for t in q.get_final_froms():
        q = q.with_hint(t, MSSQL_LAAS, "mssql")
    return q if dialekt == "mssql" else q.with_for_update()


def _saetninger(script: str) -> list[str]:
    """DDL-scriptet delt i sætninger (det har ingen semikolon i strenge eller kommentarer efter ;)."""
    ud, buf = [], []
    for linje in script.splitlines():
        if linje.strip().startswith("--") and not buf:
            continue
        buf.append(linje)
        if linje.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip().rstrip(";").strip()
            if stmt:
                ud.append(stmt)
            buf = []
    return ud
