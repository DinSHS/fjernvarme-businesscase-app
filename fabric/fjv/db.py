"""Appens Fabric SQL-database fra en Python-notebook (KONTRAKT v2 §3, §5.3, §6).

Forbindelse (målt 2026-10-16 i en jobkørsel): ``pyodbc`` + "ODBC Driver 18 for
SQL Server" findes i runtime, og ``notebookutils.credentials.getToken(
"https://database.windows.net/")`` giver et token for den identitet, der kører
notebooken (her app-ejeren, ``db_owner``). Tokenet gives som
``SQL_COPT_SS_ACCESS_TOKEN`` (1256). Almindelige operationer åbner en ny
forbindelse hver gang; kun låsen og hjerteslaget deler den dedikerede forbindelse.

Skrivninger følger KONTRAKT §6c (v2.2, har forrang over §6):

* **Global eksklusion = SQL-applock ``fjv_solver``** (session-ejet, timeout 0) på en
  dedikeret forbindelse, holdt hele jobbets levetid (``SolverLaas``). Ingen lås ->
  arbejderen afslutter uden at røre nogen række. Statusfelter og hjerteslag er kun
  visning; en død arbejder er en kørsel i ``koerer``/``indlaeser``, mens låsen er fri.
* **Statusskift er betingede UPDATEs** (``WHERE id=? AND status=? AND
  arbejder_id=?``). 0 påvirkede rækker = en anden kom først -> ``Afbrudt``.
* **Ejerskabstab stopper solveren** (status ≠ koerer/indlaeser, arbejder_id ≠ mig,
  også ved ``fejl``, eller låsen kan ikke bekræftes). ``annuller_anmodet`` stopper
  også solveren; så sætter arbejderen selv ``annulleret`` og går videre.
* **Publicering er én transaktion**: lås kørselsrækken, kontrollér ejerskab, slet og
  indsæt resultatrækker, kontrollér antal og naturlige nøgler, sæt ``faerdig`` — commit.

Talværdier sendes som tekst med fast antal decimaler gennem ``OPENJSON``: JSON-tal
i eksponentform (``1e-06``) kan ikke konverteres til ``decimal`` af SQL Server,
og Rayfin har ingen float-kolonner — skalaen afrunder alligevel.
"""

from __future__ import annotations

import json
import struct
import threading  # noqa: F401  (SolverLaas)
import time
import uuid

from . import konstanter as K
from .byg_case import InputFejl, byg, input_hash, raekker_fra_vaerk

DRIVER = "ODBC Driver 18 for SQL Server"
_TID_FELTER = {"startet", "afsluttet", "hjerteslag"}
#: Koersels-kolonner arbejderen må sætte (alt andet afvises — ingen SQL fra data).
KOERSEL_FELTER = {
    "fase", "fejlbesked", "model_commit", "data_commit", "miljoe_json", "case_sti",
    "output_sti", "output_stem", "oploesning", "interval_min", "antal_interval_model",
    "antal_interval_csv", "solve_status", "er_milp", "objektiv_dkk", "oensket_rel_gap",
    "oensket_abs_gap", "opnaaet_gap", "best_bound", "loesetid_s", "manifest_json",
    "fabric_job_id", *_TID_FELTER,
}
_MAX_TEKST = {"fase": 200, "fejlbesked": 4000, "miljoe_json": 4000, "case_sti": 400,
              "output_sti": 400, "output_stem": 400, "oploesning": 10, "solve_status": 60,
              "manifest_json": 4000, "model_commit": 40, "data_commit": 40,
              "fabric_job_id": 100}
_BID = 1000                                   # rækker pr. OPENJSON-indsættelse


from .koersel import Afbrudt  # noqa: E402  (én klasse: koer_en skal genkende den)


def _token_struct() -> bytes:
    import notebookutils  # type: ignore
    tok = notebookutils.credentials.getToken("https://database.windows.net/").encode("utf-16-le")
    return struct.pack(f"<I{len(tok)}s", len(tok), tok)


#: Hver databaseoperation: (op, ms, forsøg, fejl). Lægges i kørselsrapporten, så en
#: forbindelse der hænger eller genforsøges, kan ses udefra (jobs-API'et viser intet).
LOG: list = []


def _log_op(op: str, t0: float, forsoeg: int, fejl=None):
    LOG.append({"op": op[:80], "ms": round((time.time() - t0) * 1000),
                "forsoeg": forsoeg, "fejl": None if fejl is None else str(fejl)[:300]})
    del LOG[:-200]


class Db:
    def __init__(self, konfig: dict):
        self.server = konfig["server"]
        self.database = konfig["database"]

    def forbind(self, autocommit: bool = False, forsoeg: int = 6):
        """Ny forbindelse. Genforsøg: en Fabric SQL-database, der sover, vågner
        ved første forbindelse og svarer imens med 40613/timeout."""
        import pyodbc  # type: ignore
        # Pooling SKAL være slået fra (målt 2026-10-16): en poolet forbindelse, der
        # sidst kørte med autocommit OFF, kommer retur i transaktionstilstand, selv om
        # connect(autocommit=True) beder om det modsatte - pyodbc sætter kun
        # attributten eksplicit for OFF. Næste UPDATE blev så aldrig committet, og
        # dens rækkelås i en tomgangsforbindelse blokerede alle senere skrivninger
        # på kørslen (fase "I kø" stod fast, hjerteslag frøs, timeout efter 120 s).
        pyodbc.pooling = False
        cs = (f"Driver={{{DRIVER}}};Server=tcp:{self.server};Database={self.database};"
              "Encrypt=yes;TrustServerCertificate=no;Connection Timeout=60")
        sidste = None
        t0 = time.time()
        for i in range(forsoeg):
            try:
                cn = pyodbc.connect(cs, attrs_before={1256: _token_struct()},
                                    autocommit=autocommit, timeout=60)
                cn.autocommit = autocommit        # eksplicit, også for True (se ovenfor)
                cn.timeout = 120                  # sekunder pr. forespørgsel
                _log_op("forbind", t0, i + 1)
                return cn
            except pyodbc.Error as fejl:
                sidste = fejl
                _log_op("forbind-fejl", t0, i + 1, fejl)
                time.sleep(min(60, 5 * 2 ** i))
        raise RuntimeError(f"kunne ikke forbinde til databasen: {sidste}")

    def en(self, sql: str, *params):
        cn = self.forbind(autocommit=True)
        try:
            cur = cn.cursor()
            cur.execute(sql, *params)
            try:
                return cur.fetchone()
            except Exception:
                return None
        finally:
            cn.close()

    def alle(self, sql: str, *params) -> list:
        cn = self.forbind(autocommit=True)
        try:
            cur = cn.cursor()
            cur.execute(sql, *params)
            kol = [d[0] for d in cur.description]
            return [dict(zip(kol, r)) for r in cur.fetchall()]
        finally:
            cn.close()

    def opdater(self, sql: str, *params) -> int:
        cn = self.forbind(autocommit=True)
        t0 = time.time()
        try:
            cur = cn.cursor()
            cur.execute(sql, *params)
            n = cur.rowcount
            _log_op(f"{sql[:50]} -> {n}", t0, 1)
            return n
        except Exception as fejl:
            _log_op(sql[:60], t0, 1, fejl)
            raise
        finally:
            cn.close()


def _tekst(navn: str, v):
    if v is None or navn not in _MAX_TEKST:
        return v
    s = str(v)
    if len(s) > _MAX_TEKST[navn]:
        if navn in ("fejlbesked", "fase"):
            return s[:_MAX_TEKST[navn] - 3] + "..."
        raise ValueError(f"{navn} er {len(s)} tegn (maks {_MAX_TEKST[navn]})")
    return s


def _set_klausul(felter: dict) -> tuple[list[str], list]:
    dele, params = [], []
    for k, v in felter.items():
        if k not in KOERSEL_FELTER:
            raise ValueError(f"ukendt Koersels-felt {k!r}")
        if k in _TID_FELTER:
            dele.append(f"{k}=SYSUTCDATETIME()")
        else:
            dele.append(f"{k}=?")
            params.append(_tekst(k, v))
    return dele, params


# ------------------------------------------------------------------ global lås (§6c)

class SolverLaas:
    """Global eksklusion efter KONTRAKT §6c: SQL-applock ``fjv_solver``, ejet af SESSIONEN.

    Låsen tages på en dedikeret forbindelse med ``@LockTimeout=0`` og holdes hele
    jobbets levetid. Dør processen (eller forbindelsen), frigiver SQL Server låsen
    selv — derfor er "kørsel i koerer/indlaeser, mens låsen er fri" præcis
    definitionen af en død arbejder, uden at gætte ud fra hjerteslag.

    Hjerteslagstråden bruger SAMME forbindelse (så den aldrig er inaktiv);
    adgangen serialiseres med en mutex, fordi en pyodbc-forbindelse ikke må deles
    mellem tråde samtidig. Kan forbindelsen ikke længere bekræfte låsen, betragtes
    ejerskabet som tabt, og solveren stoppes (fejl i den sikre retning).
    """

    RESSOURCE = "fjv_solver"
    #: Vagtens interval og låseforbindelsens forespørgsels-timeout (K3-N1). Sammen med
    #: procesvagtens 2 s giver de den gamle arbejders maksimale stopforsinkelse efter
    #: et tabt låse-forbindelse: VAGT_S + TIMEOUT_S + 2 = 17 s.
    VAGT_S = 5.0
    TIMEOUT_S = 10

    def __init__(self, db: "Db"):
        import threading
        self.db = db
        self.cn = None
        self._mutex = threading.Lock()
        self.tabt = threading.Event()              # sat ÉN gang, aldrig nulstillet
        self._ved_tab: list = []
        self._vagt = None

    def tag(self) -> bool:
        cn = self.db.forbind(autocommit=True)
        cur = cn.cursor()
        cur.execute("SET NOCOUNT ON; DECLARE @r int; EXEC @r = sp_getapplock @Resource=?, "
                    "@LockMode='Exclusive', @LockOwner='Session', @LockTimeout=0; SELECT @r",
                    self.RESSOURCE)
        r = cur.fetchone()[0]
        if r < 0:
            cn.close()
            return False
        try:
            cn.timeout = self.TIMEOUT_S             # et dødt TCP-led må ikke hænge i 120 s
        except Exception:
            pass
        self.cn = cn
        return True

    def ved_tab(self, funktion) -> None:
        """Tilmeld en stop-funktion (fx procesvagtens stop-event). Kaldes straks, hvis låsen allerede er tabt."""
        self._ved_tab.append(funktion)
        if self.tabt.is_set():
            funktion()

    def afmeld(self, funktion) -> None:
        try:
            self._ved_tab.remove(funktion)
        except ValueError:
            pass

    def _marker_tabt(self) -> None:
        if self.tabt.is_set():
            return
        self.tabt.set()
        for f in list(self._ved_tab):
            try:
                f()
            except Exception:
                pass

    def start_vagt(self, interval_s: float | None = None) -> None:
        """Vagt-tråd: bekræft låsen hvert ``VAGT_S`` sekund; ved første fejl -> stop straks.

        Det er hele pointen med K3-N1: et tabt sessions-led frigiver låsen på
        serveren, mens solveren regner videre her. Vagten venter ikke på næste
        hjerteslag (op til 60 s) - den dræber solveren inden for VAGT_S + TIMEOUT_S.
        """
        import threading
        interval = self.VAGT_S if interval_s is None else interval_s

        def loop():
            while not self.tabt.wait(interval):
                if self.cn is None:
                    return                        # frigivet med vilje
                if not self.holdt():
                    self._marker_tabt()
                    return

        self._vagt = threading.Thread(target=loop, daemon=True)
        self._vagt.start()

    def udfoer(self, sql: str, *params, hent: bool = False):
        if self.cn is None:
            raise RuntimeError("fjv_solver-låsens forbindelse er lukket")
        try:
            with self._mutex:
                cur = self.cn.cursor()
                cur.execute(sql, *params)
                return cur.fetchone() if hent else cur.rowcount
        except Exception:
            # En fejl på låsens forbindelse = sessionen (og dermed låsen) kan være væk.
            # Fang den straks og stop solveren; vent ikke på næste hjerteslag (K3-N1).
            self._marker_tabt()
            raise

    def holdt(self) -> bool:
        if self.cn is None or self.tabt.is_set():
            return False
        try:
            r = self.udfoer("SELECT APPLOCK_MODE('public', ?, 'Session')", self.RESSOURCE,
                            hent=True)
        except Exception:
            return False
        if not (bool(r) and r[0] == "Exclusive"):
            self._marker_tabt()
            return False
        return True

    def frigiv(self):
        if self.cn is None:
            return
        self._ved_tab.clear()                      # en villet frigivelse er ikke et tab
        try:
            self.udfoer("EXEC sp_releaseapplock @Resource=?, @LockOwner='Session'", self.RESSOURCE)
        except Exception:
            pass
        try:
            self.cn.close()
        finally:
            self.cn = None


# ------------------------------------------------------------------ lageret

class SqlLager:
    """``Lager`` for ``koersel.koer_en`` mod ``dbo.Koersels`` (§6c).

    To slags stop, holdt adskilt:

    * ``annulleret`` — ``annuller_anmodet`` er sat (samarbejdende annullering): solveren
      dræbes, og arbejderen sætter SELV ``annulleret`` og går videre i køen.
    * ``tabt`` — rækken er ikke længere vores (status ∉ {koerer, indlaeser},
      ``arbejder_id`` ≠ mig, også ved ``fejl``), eller låsen kan ikke bekræftes:
      solveren dræbes, og intet skrives.
    """

    def __init__(self, db: Db, koersel_id: str, arbejder_id: str,
                 laas: SolverLaas | None = None):
        self.db, self.id, self.mig, self.laas = db, koersel_id, arbejder_id, laas
        self._annulleret = False
        self._tabt = False
        self.faerdig_i_publicering = True     # publicer() sætter selv 'faerdig' (§6c)

    def log(self) -> list:
        return LOG[-15:]

    def skift(self, fra: str, til: str, **felter) -> bool:
        dele, params = _set_klausul(felter)
        dele.insert(0, "status=?")
        params.insert(0, til)
        ekstra = "" if til in ("fejl", "annulleret") else " AND annuller_anmodet IS NULL"
        n = self.db.opdater(
            f"UPDATE dbo.Koersels SET {', '.join(dele)} "
            f"WHERE id=? AND status=? AND arbejder_id=?{ekstra}",
            *params, self.id, fra, self.mig)
        return n == 1

    def saet(self, **felter):
        if not felter:
            return
        dele, params = _set_klausul(felter)
        self.db.opdater(f"UPDATE dbo.Koersels SET {', '.join(dele)} WHERE id=? AND "
                        "arbejder_id=? AND status IN ('koerer','indlaeser')",
                        *params, self.id, self.mig)

    def _vurder(self, r) -> None:
        if r is None:
            self._tabt = True
            return
        status, anmodet, arbejder = r[0], r[1], (r[2] or "")
        if anmodet is not None or status == "annulleret":
            self._annulleret = True
        if status not in ("koerer", "indlaeser") or arbejder != self.mig:
            self._tabt = True

    def hjerteslag(self):
        """Fra hjerteslagstråden: på låsens forbindelse, så den aldrig er inaktiv."""
        sql_slag = ("UPDATE dbo.Koersels SET hjerteslag=SYSUTCDATETIME() WHERE id=? "
                    "AND arbejder_id=? AND status IN ('koerer','indlaeser')")
        sql_laes = "SELECT status, annuller_anmodet, arbejder_id FROM dbo.Koersels WHERE id=?"
        if self.laas is None:
            self.db.opdater(sql_slag, self.id, self.mig)
            self._vurder(self.db.en(sql_laes, self.id))
            return
        try:
            self.laas.udfoer(sql_slag, self.id, self.mig)
            self._vurder(self.laas.udfoer(sql_laes, self.id, hent=True))
            if not self.laas.holdt():
                self._tabt = True
        except Exception:
            self._tabt = True              # kan ikke bekræfte ejerskab -> stop

    def tidsserie_sti(self, tidsserie_id: str) -> str | None:
        """Lakehouse-stien til en tidsserie (§6d) - kun en genvej; hashen kontrolleres af kalderen."""
        if not _har_kolonne(self.db, "Tidsseries", "sti"):
            return None
        r = self.db.en("SELECT sti FROM dbo.Tidsseries WHERE id=?", tidsserie_id)
        return r[0] if r and r[0] else None

    def er_annulleret(self) -> bool:
        """Kontrolpunkt i hovedtråden: True = stop (annulleret ELLER ejerskab tabt)."""
        self._vurder(self.db.en("SELECT status, annuller_anmodet, arbejder_id "
                                "FROM dbo.Koersels WHERE id=?", self.id))
        if self.laas is not None and not self.laas.holdt():
            self._tabt = True
        return self._annulleret or self._tabt

    @property
    def annulleret(self) -> bool:
        return self._annulleret

    @property
    def tabt(self) -> bool:
        # Tabt låse-forbindelse er tabt ejerskab, også mellem hjerteslagene (K3-N1).
        return self._tabt or (self.laas is not None and self.laas.tabt.is_set())

    @property
    def stop(self) -> bool:
        return self._annulleret or self.tabt

    def annuller_selv(self) -> bool:
        """Arbejderen har selv stoppet på ``annuller_anmodet`` — det ER den bekræftede stop."""
        for fra in ("koerer", "indlaeser"):
            if self.skift(fra, "annulleret", afsluttet="nu",
                          fase="Annulleret efter anmodning"):
                return True
        return False

    def publicer(self, noegletal, maaneder, timer, slutfelter: dict | None = None) -> dict:
        """Resultatrækker, ``faerdig`` OG slutmetadata i én transaktion (§6c, K2-F6, K3-N9)."""
        cn = self.db.forbind(autocommit=False)
        try:
            cur = cn.cursor()
            cur.execute("SELECT status, arbejder_id, annuller_anmodet FROM dbo.Koersels "
                        "WITH (UPDLOCK, HOLDLOCK) WHERE id=?", self.id)
            r = cur.fetchone()
            if r is None or r[0] != "indlaeser" or r[1] != self.mig or r[2] is not None:
                raise Afbrudt(f"kørslen er ikke længere vores at publicere: {tuple(r) if r else None}")
            for t in ("KoerselNoegletals", "KoerselMaaneds", "KoerselTimes"):
                cur.execute(f"DELETE FROM dbo.{t} WHERE koersel_id=?", self.id)
            _indsaet(cur, "KoerselNoegletals", self.id, noegletal, NOEGLETAL_KOL)
            _indsaet(cur, "KoerselMaaneds", self.id, maaneder, MAANED_KOL)
            _indsaet(cur, "KoerselTimes", self.id, timer, TIME_KOL)
            antal = {}
            for t, forventet, noegle in (
                    ("KoerselNoegletals", len(noegletal), "gruppe, objekt, marked, noegle"),
                    ("KoerselMaaneds", len(maaneder), "maaned, objekt, noegle"),
                    ("KoerselTimes", len(timer), "tid")):
                cur.execute(f"SELECT COUNT(*) FROM dbo.{t} WHERE koersel_id=?", self.id)
                n = cur.fetchone()[0]
                cur.execute(f"SELECT COUNT(*) FROM (SELECT 1 x FROM dbo.{t} WHERE koersel_id=? "
                            f"GROUP BY {noegle} HAVING COUNT(*) > 1) d", self.id)
                dub = cur.fetchone()[0]
                if n != forventet or dub:
                    raise RuntimeError(f"{t}: {n} rækker (forventet {forventet}), {dub} dubletter")
                antal[t] = n
            dele, params = _set_klausul(dict(slutfelter or {}))
            ekstra = "".join(", " + d for d in dele)
            cur.execute("UPDATE dbo.Koersels SET status='faerdig', afsluttet=SYSUTCDATETIME(), "
                        f"fase=N'Færdig'{ekstra} WHERE id=? AND status='indlaeser' AND "
                        "arbejder_id=? AND annuller_anmodet IS NULL", *params, self.id, self.mig)
            if cur.rowcount != 1:
                raise Afbrudt("statusskiftet til faerdig ramte ikke rækken - publicerer intet")
            cn.commit()
            return antal
        except Exception:
            cn.rollback()
            raise
        finally:
            cn.close()


def _f(x, dec: int):
    """Tal -> tekst med fast antal decimaler (ingen eksponent), None bevares."""
    if x is None:
        return None
    return f"{float(x):.{dec}f}"


#: (json-nøgle, kolonne, SQL-type, konvertering)
NOEGLETAL_KOL = [("g", "gruppe", "nvarchar(60)", str), ("o", "objekt", "nvarchar(120)", None),
                 ("m", "marked", "nvarchar(20)", None), ("n", "noegle", "nvarchar(120)", str),
                 ("v", "vaerdi", "decimal(28,10)", 10), ("e", "enhed", "nvarchar(40)", None)]
MAANED_KOL = [("a", "maaned", "nvarchar(7)", str), ("o", "objekt", "nvarchar(120)", None),
              ("n", "noegle", "nvarchar(120)", str), ("v", "vaerdi", "decimal(28,10)", 10)]
TIME_KOL = [("t", "tid", "datetime2", "tid"), ("l", "varmelast_mw", "decimal(18,6)", 6),
            ("s", "spotpris", "decimal(18,6)", 6), ("u", "t_ude", "decimal(18,6)", 6),
            ("j", "vaerdier_json", "nvarchar(4000)", str)]
_FELT = {"KoerselNoegletals": {"g": "gruppe", "o": "objekt", "m": "marked", "n": "noegle",
                               "v": "vaerdi", "e": "enhed"},
         "KoerselMaaneds": {"a": "maaned", "o": "objekt", "n": "noegle", "v": "vaerdi"},
         "KoerselTimes": {"t": "tid", "l": "varmelast_mw", "s": "spotpris", "u": "t_ude",
                          "j": "vaerdier_json"}}


def _indsaet(cur, tabel: str, koersel_id: str, raekker: list[dict], kol) -> None:
    navne = _FELT[tabel]
    with_ = ", ".join(f"{k} {typ} '$.{j}'" for j, k, typ, _ in kol)
    sql = (f"INSERT INTO dbo.{tabel} (id, koersel_id, {', '.join(k for _, k, _, _ in kol)}) "
           f"SELECT NEWID(), ?, {', '.join('j.' + k for _, k, _, _ in kol)} "
           f"FROM OPENJSON(?) WITH ({with_}) j")
    for i in range(0, len(raekker), _BID):
        bid = []
        for r in raekker[i:i + _BID]:
            o = {}
            for j, k, typ, konv in kol:
                v = r.get(navne[j])
                if konv == "tid":
                    v = v.rstrip("Z") if v else v
                elif isinstance(konv, int):
                    v = _f(v, konv)
                elif konv is str and v is not None:
                    v = str(v)
                o[j] = v
            bid.append(o)
        cur.execute(sql, koersel_id, json.dumps(bid, ensure_ascii=False, separators=(",", ":")))


# ------------------------------------------------------------------ køen (§6c: kun under låsen)

_KOLONNE_CACHE: dict[str, bool] = {}


def _har_kolonne(db: Db, tabel: str, kolonne: str) -> bool:
    k = f"{tabel}.{kolonne}"
    if k not in _KOLONNE_CACHE:
        r = db.en("SELECT COL_LENGTH(?, ?)", f"dbo.{tabel}", kolonne)
        _KOLONNE_CACHE[k] = bool(r and r[0])
    return _KOLONNE_CACHE[k]


def _koe_orden(db: Db) -> str:
    """FIFO på server-tid ``modtaget`` (§6c); ``bestilt`` kun til fv-app har kolonnen."""
    return "modtaget, id" if _har_kolonne(db, "Koersels", "modtaget") else "bestilt, id"


#: SET-delen af overtagelsen. ``startet`` (gammel reservation) behandles som ``koe``,
#: men skrives aldrig af arbejderen.
_OVERTAG_SET = ("status='koerer', arbejder_id=?, hjerteslag=SYSUTCDATETIME(), "
                "startet=SYSUTCDATETIME(), forsoeg=forsoeg+1")


def overtag_bestemt(db: Db, koersel_id: str, mig: str, laas: SolverLaas) -> bool:
    if not laas.holdt():
        raise RuntimeError("overtagelse uden fjv_solver-låsen er ikke tilladt (§6c)")
    n = db.opdater(f"UPDATE dbo.Koersels SET {_OVERTAG_SET} WHERE id=? "
                   "AND status IN ('koe','startet') AND annuller_anmodet IS NULL", mig, koersel_id)
    return n == 1


#: Hvorfor overtag_naeste ikke tog noget (seneste først i rapporten).
GRUND: list[str] = []


def overtag_naeste(db: Db, mig: str, laas: SolverLaas) -> str | None:
    """Ældste ``koe`` efter ``modtaget`` — kun under ``fjv_solver``-låsen."""
    if not laas.holdt():
        GRUND.append("fjv_solver-låsen er ikke længere vores")
        return None
    rk = db.alle(
        f";WITH n AS (SELECT TOP 1 * FROM dbo.Koersels WITH (UPDLOCK, READPAST, ROWLOCK) "
        f"WHERE status IN ('koe','startet') AND annuller_anmodet IS NULL "
        f"ORDER BY {_koe_orden(db)}) "
        f"UPDATE n SET {_OVERTAG_SET} OUTPUT CAST(inserted.id AS nvarchar(36)) id", mig)
    if not rk:
        GRUND.append("køen er tom")
        return None
    # Små bogstaver: CAST(uniqueidentifier) giver STORE, appens GraphQL små, og
    # kørslens mappe i lakehouset skal hedde det samme set fra begge sider.
    return rk[0]["id"].lower()


#: Overtagelsesperiode (K3-N1): så længe en anden kørsel har et hjerteslag yngre end
#: dette, kan dens arbejder stadig leve - fx efter et tabt sessions-led, hvor låsen er
#: fri, men solveren endnu ikke dræbt. Den gamle arbejders maksimale stopforsinkelse
#: regnet fra sidste vellykkede hjerteslag: hjerteslag-interval (60 s) + låsevagt
#: (VAGT_S 5 + TIMEOUT_S 10) + procesvagt (2 s) = 77 s. 300 s giver margin og er
#: samme grænse som appens afstem-værn (5 min).
OVERTAGELSE_S = 300


def friske_fremmede(db: Db, mig: str) -> list[dict]:
    """Andre arbejderes aktive kørsler med hjerteslag yngre end overtagelsesperioden."""
    return db.alle(
        "SELECT CAST(id AS nvarchar(36)) id, arbejder_id, "
        "DATEDIFF(second, COALESCE(hjerteslag, startet), SYSUTCDATETIME()) alder_s "
        "FROM dbo.Koersels WHERE status IN ('koerer','indlaeser') "
        "AND ISNULL(arbejder_id, '') <> ? "
        "AND COALESCE(hjerteslag, startet) >= DATEADD(second, -?, SYSUTCDATETIME())",
        mig, OVERTAGELSE_S)


def vent_overtagelse(db: Db, mig: str, laas: SolverLaas, rap=None, pause_s: float = 15.0,
                     maks_s: float | None = None) -> bool:
    """Under låsen: vent, til ingen anden kørsel har et friskt hjerteslag (K3-N1).

    Låsen holdes imens, så ingen tredje arbejder kan starte. True = fri bane;
    False = gav op (låsen tabt eller ventetiden overskredet) - start da intet.
    """
    import time as _t
    maks = OVERTAGELSE_S + 60 if maks_s is None else maks_s
    t0 = _t.time()
    while True:
        if not laas.holdt():
            return False
        friske = friske_fremmede(db, mig)
        if not friske:
            return True
        if rap is not None:
            rap.trin("venter_overtagelse", [{"id": f["id"][:8], "alder_s": f["alder_s"]}
                                            for f in friske])
        if _t.time() - t0 >= maks:
            return False
        _t.sleep(pause_s)


def ryd_doede(db: Db, mig: str, laas: SolverLaas) -> list[str]:
    """Under låsen: andre ``koerer``/``indlaeser`` UDEN friskt hjerteslag er døde -> ``fejl``.

    Låsen alene beviser ikke døden (K3-N1: et tabt sessions-led frigiver låsen,
    mens solveren regner videre); derfor kræves også et hjerteslag ældre end
    overtagelsesperioden. Én betinget UPDATE på status, arbejder_id og alder.
    """
    if not laas.holdt():
        return []
    rk = db.alle(
        "UPDATE dbo.Koersels SET status='fejl', afsluttet=SYSUTCDATETIME(), fase=N'Fejl', "
        "fejlbesked=N'Arbejderen stoppede uden at afslutte kørslen (fx fordi jobbet blev "
        "stoppet eller kapaciteten sat på pause). Bestil kørslen igen.' "
        "OUTPUT CAST(inserted.id AS nvarchar(36)) id "
        "WHERE status IN ('koerer','indlaeser') AND ISNULL(arbejder_id, '') <> ? "
        "AND COALESCE(hjerteslag, startet) < DATEADD(second, -?, SYSUTCDATETIME())",
        mig, OVERTAGELSE_S)
    return [r["id"].lower() for r in rk]


def laes_input(db: Db, koersel_id: str) -> tuple[list[dict], dict]:
    k = db.alle("SELECT CAST(id AS nvarchar(36)) id, input_hash, status, vaerk_revision, "
                "CAST(vaerk_id AS nvarchar(36)) vaerk_id FROM dbo.Koersels WHERE id=?", koersel_id)
    if not k:
        raise RuntimeError(f"kørslen {koersel_id} findes ikke")
    raekker = db.alle("SELECT kilde, sti, vaerdi_json FROM dbo.KoerselInputs WHERE koersel_id=?",
                      koersel_id)
    return raekker, k[0]


# ------------------------------------------------------------------ genpublicering

def genpubliser(db: Db, koersel_id: str) -> dict:
    """Udtræk resultaterne igen fra kørslens gemte output og erstat rækkerne.

    Til når måleregisteret er udvidet: kørslen regnes ikke om. Kun ``faerdig``-kørsler;
    status røres ikke. Slet + indsæt + kontrol af antal og naturlige nøgler i én
    transaktion, med rækken låst (UPDLOCK, HOLDLOCK) og status kontrolleret under låsen.
    """
    from pathlib import Path
    from . import resultater as RES

    kid = koersel_id.lower()
    mappe = Path(K.FILES) / K.REL_KOERSLER / kid
    out = RES.Output(mappe)
    reg = RES.register()
    log = (mappe / "log.txt").read_text(encoding="utf-8", errors="replace")
    felter = RES.koersel_felter(out, RES.parse_highs(log))
    nt, mn, tm = RES.noegletal(out, reg), RES.maaneder(out, reg), RES.timer(out, reg)
    cn = db.forbind(autocommit=False)
    try:
        cur = cn.cursor()
        cur.execute("SELECT status FROM dbo.Koersels WITH (UPDLOCK, HOLDLOCK) WHERE id=?", kid)
        r = cur.fetchone()
        if r is None or r[0] != "faerdig":
            raise RuntimeError(f"{kid}: kun færdige kørsler genpubliceres (status {r[0] if r else None})")
        for t in ("KoerselNoegletals", "KoerselMaaneds", "KoerselTimes"):
            cur.execute(f"DELETE FROM dbo.{t} WHERE koersel_id=?", kid)
        _indsaet(cur, "KoerselNoegletals", kid, nt, NOEGLETAL_KOL)
        _indsaet(cur, "KoerselMaaneds", kid, mn, MAANED_KOL)
        _indsaet(cur, "KoerselTimes", kid, tm, TIME_KOL)
        antal = {}
        for t, forventet in (("KoerselNoegletals", len(nt)), ("KoerselMaaneds", len(mn)),
                             ("KoerselTimes", len(tm))):
            cur.execute(f"SELECT COUNT(*) FROM dbo.{t} WHERE koersel_id=?", kid)
            n = cur.fetchone()[0]
            if n != forventet:
                raise RuntimeError(f"{t}: {n} rækker, forventet {forventet}")
            antal[t] = n
        cur.execute("UPDATE dbo.Koersels SET manifest_json=?, antal_interval_csv=? WHERE id=? "
                    "AND status='faerdig'", felter["manifest_json"], len(tm), kid)
        cn.commit()
        return antal
    except Exception:
        cn.rollback()
        raise
    finally:
        cn.close()


# ------------------------------------------------------------------ Motor (§6c)

#: Den ene Motor-række (fv-app, rapporter/fv-app.md 08:46: MOTOR_ID) - i konstanter, så deploy.py kan skrive den uden yaml.
MOTOR_ID = K.MOTOR_ID


def motor_pins(db: Db) -> dict:
    """Pins fra ``Motor``-rækken, hvis tabellen findes; ellers de pinnede konstanter."""
    if _har_kolonne(db, "Motors", "data_commit"):
        r = db.en("SELECT model_commit, data_commit FROM dbo.Motors WHERE id=?", MOTOR_ID)
        if r and r[0] and r[1]:
            return {"model_commit": r[0], "data_commit": r[1], "kilde": "Motor"}
    return {"model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA, "kilde": "konstanter"}


def skriv_motor_pins(db: Db, model_commit: str, data_commit: str) -> bool:
    """Arbejder/importør skriver de pins, den bruger, til ``Motor`` (opretter rækken, hvis den mangler)."""
    if not _har_kolonne(db, "Motors", "data_commit"):
        return False
    for sha in (model_commit, data_commit):
        if len(sha or "") != 40:
            raise ValueError(f"Motor-pins skal være fulde 40-tegns SHA'er, fik {sha!r}")
    n = db.opdater(
        "IF NOT EXISTS (SELECT 1 FROM dbo.Motors WHERE id=?) "
        "INSERT INTO dbo.Motors (id, aendret) VALUES (?, SYSUTCDATETIME()); "
        "UPDATE dbo.Motors SET model_commit=?, data_commit=?, aendret=SYSUTCDATETIME() WHERE id=?",
        MOTOR_ID, MOTOR_ID, model_commit, data_commit, MOTOR_ID)
    return n != 0


# ------------------------------------------------------------------ tidsserier (§6d)

def oploes_tidsserier(cur, vaerk_id: str, valg: dict | None, heat_csv: str | None,
                      har_tabel: bool) -> dict:
    """Hvilke tidsserier en kørsel bruger - samme regel som appens ``startBestilling``.

    ``valg[rolle]``: ``""``/udeladt = værkets aktive (hvis nogen), ``"syntetisk"``
    (kun varmelast), eller et tidsserie-id. Et eksplicit ``heat_csv`` (repo-fil) er
    også et valg af varmelast, så den aktive varmelast fryses da ikke. Rækkerne læses
    med ``HOLDLOCK`` i bestillingens transaktion. To aktive for samme rolle er en fejl,
    der vises - ikke et tilfældigt valg.
    """
    valg = dict(valg or {})
    ud: dict = {}
    for rolle in ("varmelast", "solprofil"):
        v = (valg.get(rolle) or "").strip().lower()
        if rolle == "varmelast" and v == "syntetisk":
            ud[rolle] = "syntetisk"
            continue
        if rolle == "varmelast" and heat_csv:
            if v:
                raise InputFejl("varmelasten er valgt både som repo-fil (heat_csv) og som tidsserie")
            continue
        if not har_tabel:
            if v:
                raise InputFejl("databasen har endnu ingen Tidsserie-tabel")
            continue
        if v:
            cur.execute("SELECT CAST(id AS nvarchar(36)), sha256, status, rolle, "
                        "CAST(vaerk_id AS nvarchar(36)) FROM dbo.Tidsseries WITH (HOLDLOCK) "
                        "WHERE id=?", v)
            r = cur.fetchone()
            if not r:
                raise InputFejl(f"tidsserien {v} findes ikke")
            if r[4].lower() != vaerk_id.lower() or r[3] != rolle:
                raise InputFejl(f"tidsserien {v} er ikke værkets {rolle}")
            if r[2] != "gyldig" or not r[1]:
                raise InputFejl(f"tidsserien {v} er ikke gyldig (status {r[2]})")
            ud[rolle] = {"id": r[0].lower(), "sha256": r[1]}
            continue
        cur.execute("SELECT CAST(id AS nvarchar(36)), sha256 FROM dbo.Tidsseries WITH (HOLDLOCK) "
                    "WHERE vaerk_id=? AND rolle=? AND aktiv=1 AND status='gyldig'", vaerk_id, rolle)
        aktive = cur.fetchall()
        if len(aktive) > 1:
            raise InputFejl(f"værket har {len(aktive)} aktive {rolle}-tidsserier - højst én må være aktiv")
        if aktive and aktive[0][1]:
            ud[rolle] = {"id": aktive[0][0].lower(), "sha256": aktive[0][1]}
    return ud


# ------------------------------------------------------------------ manuel vej

def opret_manuel(db: Db, vaerk_kode: str, scenarie_navn: str, aendringer: list,
                 scenarie: dict) -> str:
    """Scenarie + Bestilling + Koersel(koe) + KoerselInput i én transaktion (kilde=notebook).

    Samme låse som appens bestilling (§6c): værk og parametre med UPDLOCK/HOLDLOCK,
    og model/data-SHA'erne fryses i det hashbeskyttede input.
    """
    kode = vaerk_kode.strip().lower()
    pins = motor_pins(db)
    scen = dict(scenarie)
    scen.setdefault("model_commit", pins["model_commit"])
    if not scen.get("data_commit"):
        scen["data_commit"] = pins["data_commit"]
    modtaget = _har_kolonne(db, "Koersels", "modtaget")
    har_ts = _har_kolonne(db, "Tidsseries", "sha256")
    cn = db.forbind(autocommit=False)
    try:
        cur = cn.cursor()
        cur.execute("SELECT CAST(id AS nvarchar(36)), revision FROM dbo.Vaerks "
                    "WITH (UPDLOCK, HOLDLOCK) WHERE kode=? AND arkiveret=0", kode)
        v = cur.fetchone()
        if not v:
            raise InputFejl(f"intet aktivt værk med koden {kode!r} - kør fjv_importer_vaerker")
        vaerk_id, revision = v[0], v[1]
        cur.execute("SELECT sti, vaerdi_json, raekkefoelge FROM dbo.VaerkParameters "
                    "WITH (HOLDLOCK) WHERE vaerk_id=?", vaerk_id)
        params = [{"sti": a, "vaerdi_json": b, "raekkefoelge": c} for a, b, c in cur.fetchall()]
        scen["tidsserier"] = oploes_tidsserier(cur, vaerk_id, scen.get("tidsserie_valg"),
                                               scen.get("heat_csv"), har_ts)
        raekker = raekker_fra_vaerk(params, aendringer, scen)
        byg(raekker)                                  # afvis ugyldigt input FØR noget skrives
        h = input_hash(raekker)
        cur.execute("SELECT SUSER_SNAME()")
        hvem = cur.fetchone()[0][:200]
        sid, bid, kid = (str(uuid.uuid4()).lower() for _ in range(3))
        navn = (scenarie_navn or f"Notebook {time.strftime('%Y-%m-%d %H:%M')} UTC")[:200]
        cur.execute(
            "INSERT INTO dbo.Scenaries (id, vaerk_id, navn, beskrivelse, periode_start, "
            "periode_slut, med_balancering, balancing_method, mip_rel_gap, mip_abs_gap, "
            "tidsgraense_s, ekstra_flag, heat_csv, arkiveret, oprettet_af, oprettet) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,SYSUTCDATETIME())",
            sid, vaerk_id, navn, "Oprettet af fjv_koer_scenarie (manuel kørsel).",
            scen.get("periode_start"), scen.get("periode_slut"),
            1 if scen.get("med_balancering") else 0, scen.get("balancing_method"),
            scen.get("mip_rel_gap"), scen.get("mip_abs_gap"),
            None if scen.get("tidsgraense_s") is None else int(scen["tidsgraense_s"]),
            scen.get("ekstra_flag"), scen.get("heat_csv"), hvem)
        # Et eksplicit tidsseriervalg står i scenariet som appens form (§6d):
        # set _tidsserie.<rolle> = "<id>" | "syntetisk". Det er visning; det frosne
        # input ovenfor er allerede opløst.
        visning = list(aendringer) + [
            {"type": "set", "sti": f"_tidsserie.{rolle}", "vaerdi_json": json.dumps(v.strip().lower())}
            for rolle, v in sorted((scen.get("tidsserie_valg") or {}).items()) if (v or "").strip()]
        for i, a in enumerate(visning):
            cur.execute("INSERT INTO dbo.ScenarieAendrings (id, scenarie_id, type, sti, "
                        "vaerdi_json, raekkefoelge) VALUES (NEWID(),?,?,?,?,?)",
                        sid, a["type"], a["sti"], a.get("vaerdi_json"), i)
        cur.execute("INSERT INTO dbo.Bestillings (id, scenarie_id, klient_noegle, bestilt_af, "
                    "bestilt) VALUES (?,?,?,?,SYSUTCDATETIME())", bid, sid, f"nb-{kid}", hvem)
        cur.execute(
            "INSERT INTO dbo.Koersels (id, bestilling_id, scenarie_id, vaerk_id, vaerk_revision, "
            "input_hash, status, bestilt_af, bestilt, forsoeg, kilde, oensket_rel_gap, "
            "oensket_abs_gap) VALUES (?,?,?,?,?,?,'koe',?,SYSUTCDATETIME(),0,'notebook',?,?)",
            kid, bid, sid, vaerk_id, revision, h, hvem,
            scen.get("mip_rel_gap"), scen.get("mip_abs_gap"))
        if modtaget:
            cur.execute("UPDATE dbo.Koersels SET modtaget=SYSUTCDATETIME() WHERE id=?", kid)
        cur.execute(
            "INSERT INTO dbo.KoerselInputs (id, koersel_id, kilde, sti, vaerdi_json) "
            "SELECT NEWID(), ?, j.kilde, j.sti, j.vaerdi_json FROM OPENJSON(?) WITH "
            "(kilde nvarchar(8) '$.kilde', sti nvarchar(400) '$.sti', "
            "vaerdi_json nvarchar(4000) '$.vaerdi_json') j",
            kid, json.dumps([{k: r[k] for k in ("kilde", "sti", "vaerdi_json")} for r in raekker],
                            ensure_ascii=False))
        cn.commit()
        return kid
    except Exception:
        cn.rollback()
        raise
    finally:
        cn.close()


# ------------------------------------------------------------------ arbejderen

from .arbejder import MAX_KOERSLER_PR_JOB, arbejd  # noqa: E402


def _aktivitet_id() -> str | None:
    """Notebookkørslens ``activityId`` - til ``arbejder_id``.

    Målt 2026-10-16: i en jobkørsel er ``currentRunId``/``rootRunId`` tomme, og
    job-instansens id (fra jobs-API'ets ``Location``) findes ikke i konteksten.
    """
    try:
        import notebookutils  # type: ignore
        ctx = notebookutils.runtime.context
        v = ctx.get("activityId") if hasattr(ctx, "get") else None
        return str(v)[:90] if v else None
    except Exception:
        return None


def koer_notebook(konfig: dict, RAP, *, koersel_id: str = "", vaerk_kode: str = "",
                  scenarie_navn: str = "", aendringer=(), scenarie: dict | None = None,
                  batch: list | None = None, test_doed_efter_s: float = 0) -> dict:
    """Notebookens indgang (§6c). Returnerer et resumé.

    1. Nye kørsler oprettes i køen (manuel vej / ``batch``) — det kræver ikke låsen.
    2. Tag ``fjv_solver``-låsen (session, timeout 0). Optaget -> stop uden at røre
       nogen række: den aktive arbejder tager også de nyoprettede.
    3. Under låsen: ryd døde kørsler, tag ``koersel_id`` hvis givet, derefter køen FIFO.
    4. Frigiv låsen.
    """
    db = Db(konfig)
    aktivitet = _aktivitet_id()
    mig = f"nb:{aktivitet or uuid.uuid4()}"[:100]
    try:
        import notebookutils  # type: ignore
        RAP["runtime_kontekst"] = {k: str(v)[:120] for k, v in
                                   dict(notebookutils.runtime.context).items()}
    except Exception:
        pass
    tilstand = {"arbejder_id": mig, "koersler": [], "ok": True}
    RAP.trin("arbejder", {"arbejder_id": mig})
    # Operatørens eksplicitte df-data-valg (parameteren data_commit) gælder kun de kørsler, dette job
    # selv opretter - aldrig en anden bestilling i køen (koersel.pin_afvigelse, runde 7c).
    tilladt_data: dict = {}

    if batch:
        tilstand["batch"] = []
        for post in sorted(batch, key=lambda p: p.get("koer_raekkefoelge") or 0):
            try:
                kid = opret_manuel(db, post["vaerk_kode"], post.get("navn") or post.get("id", ""),
                                   list(post.get("aendringer") or []), post.get("scenarie") or {})
                if (post.get("scenarie") or {}).get("data_commit"):
                    tilladt_data[kid] = post["scenarie"]["data_commit"]
                tilstand["batch"].append({"id": post.get("id"), "koersel_id": kid})
            except InputFejl as e:
                # Én ugyldig post må ikke stoppe resten; den står i rapporten.
                tilstand["batch"].append({"id": post.get("id"), "fejl": str(e)})
                RAP.advar(f"{post.get('id')}: {e}")
        RAP.trin("batch_oprettet", tilstand["batch"])
    if vaerk_kode:
        kid = opret_manuel(db, vaerk_kode, scenarie_navn, list(aendringer), scenarie or {})
        if (scenarie or {}).get("data_commit"):
            tilladt_data[kid] = scenarie["data_commit"]
        tilstand["oprettet"] = kid
        RAP.trin("oprettet", {"koersel_id": kid, "vaerk_kode": vaerk_kode})

    # Selve løkken er databaseuafhængig (fjv/arbejder.py); her er kun Fabric-bindingen.
    return arbejd(SqlKoe(db), RAP, mig=mig, tilstand=tilstand, koersel_id=koersel_id,
                  oprettede=bool(vaerk_kode or batch), test_doed_efter_s=test_doed_efter_s,
                  maks=MAX_KOERSLER_PR_JOB, tilladt_data=tilladt_data)


class SqlKoe:
    """``lager.KoeLager`` mod appens Fabric SQL-database.

    Hver metode kalder modulets funktion ved navn på kaldstidspunktet, så Fabric-
    adfærden er præcis den samme som før ``fjv/arbejder.py`` blev skilt ud."""

    def __init__(self, db: Db):
        self.db = db

    def laas(self) -> SolverLaas:
        return SolverLaas(self.db)

    def vent_overtagelse(self, mig: str, laas, rap=None) -> bool:
        return vent_overtagelse(self.db, mig, laas, rap)

    def ryd_doede(self, mig: str, laas) -> list:
        return ryd_doede(self.db, mig, laas)

    def overtag_bestemt(self, koersel_id: str, mig: str, laas) -> bool:
        return overtag_bestemt(self.db, koersel_id, mig, laas)

    def overtag_naeste(self, mig: str, laas) -> str | None:
        return overtag_naeste(self.db, mig, laas)

    def grund(self) -> str:
        return GRUND[-1] if GRUND else ""

    def laes_input(self, koersel_id: str):
        return laes_input(self.db, koersel_id)

    def koersel_lager(self, koersel_id: str, mig: str, laas) -> SqlLager:
        return SqlLager(self.db, koersel_id, mig, laas)

    def skriv_motor_pins(self, model_commit: str, data_commit: str) -> bool:
        return skriv_motor_pins(self.db, model_commit, data_commit)
