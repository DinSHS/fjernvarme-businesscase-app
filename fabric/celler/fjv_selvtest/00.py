# Kører FØR selvtesten (01.py). Med probe="db" måles kun databaseadgangen,
# og 01.py springes over.
import importlib, json
from pathlib import Path as _P


def _db_konfig():
    """Databasebindingen (server, database) staar i lakehouset: Files/fjv/konfig/db.json (skrives af `deploy.py db`)."""
    from fjv import konstanter as _K
    return json.loads((_P(_K.FILES) / _K.REL_KONFIG / "db.json").read_text(encoding="utf-8"))



if probe.startswith("genpubliser:"):
    # Vedligehold: udtræk færdige kørsler igen efter et nyt måleregister (ingen omregning).
    from fjv.db import Db, genpubliser
    from fjv.rapport import Rapport
    PR = Rapport("fjv_selvtest")
    db = Db(_db_konfig())
    ider = [x.strip().lower() for x in probe[len("genpubliser:"):].split(",") if x.strip()]
    PR["genpubliceret"] = []
    for kid in ider:
        try:
            PR["genpubliceret"].append({"koersel_id": kid, "antal": genpubliser(db, kid)})
        except Exception as e:
            PR["genpubliceret"].append({"koersel_id": kid, "fejl": f"{type(e).__name__}: {e}"[:300]})
    PR["ok"] = not any("fejl" in x for x in PR["genpubliceret"])
    PR.trin("genpubliser", PR["genpubliceret"])
    probe = "db-slut"

if probe.startswith("arkiver_test:"):
    # Testkørsler fra §6c-livetesten: eksplicitte id'er OG scenarienavnet "Test 6c" -
    # begge skal passe, så værktøjet ikke kan skjule en rigtig kørsel.
    from fjv.db import Db
    from fjv.rapport import Rapport
    PR = Rapport("fjv_selvtest")
    db = Db(_db_konfig())
    ider = [x.strip().lower() for x in probe[len("arkiver_test:"):].split(",") if x.strip()]
    PR["arkiveret"] = []
    for kid in ider:
        r = db.alle(
            "UPDATE s SET arkiveret = 1 OUTPUT CAST(inserted.id AS nvarchar(36)) scenarie_id "
            "FROM dbo.Scenaries s JOIN dbo.Koersels k ON k.scenarie_id = s.id "
            "WHERE k.id = ? AND k.kilde = 'notebook' AND s.navn LIKE N'Test 6c%' "
            "AND k.status IN ('fejl','annulleret','faerdig')", kid)
        PR["arkiveret"].append({"koersel_id": kid, "scenarier": [x["scenarie_id"] for x in r]})
    PR["ok"] = True
    PR.trin("arkiver_test", PR["arkiveret"])
    probe = "db-slut"

if probe.startswith("arkiver:"):
    # Vedligehold: arkivér scenarierne for de NAVNGIVNE kørsler - kun notebook-kørsler i
    # fejl/annulleret, så en tastefejl aldrig kan skjule en færdig kørsel i Analyser.
    from fjv.db import Db
    from fjv.rapport import Rapport
    PR = Rapport("fjv_selvtest")
    db = Db(_db_konfig())
    ider = [x.strip().lower() for x in probe[len("arkiver:"):].split(",") if x.strip()]
    PR["arkiveret"] = []
    for kid in ider:
        r = db.alle(
            "UPDATE s SET arkiveret = 1 OUTPUT CAST(inserted.id AS nvarchar(36)) scenarie_id "
            "FROM dbo.Scenaries s JOIN dbo.Koersels k ON k.scenarie_id = s.id "
            "WHERE k.id = ? AND k.kilde = 'notebook' AND k.status IN ('fejl','annulleret')", kid)
        PR["arkiveret"].append({"koersel_id": kid, "scenarier": [x["scenarie_id"] for x in r]})
    PR["ok"] = True
    PR.trin("arkiver", PR["arkiveret"])
    probe = "db-slut"

if probe == "annuller":
    # Testhjælp for §6: gør det samme som appens annullerKoersel på en aktiv kørsel.
    from fjv.db import Db
    from fjv.rapport import Rapport
    PR = Rapport("fjv_selvtest")
    db = Db(_db_konfig())
    PR["annulleret"] = [r["id"] for r in db.alle(
        "UPDATE dbo.Koersels SET annuller_anmodet=SYSUTCDATETIME() "
        "OUTPUT CAST(inserted.id AS nvarchar(36)) id "
        "WHERE status IN ('koerer','indlaeser') AND kilde='notebook' AND annuller_anmodet IS NULL")]
    PR["ok"] = True
    PR.trin("annuller", PR["annulleret"])
    probe = "db-slut"

if probe == "db":
    from fjv import konstanter as K
    from fjv.rapport import Rapport
    _B = _db_konfig()
    K_SERVER, K_DB = _B["server"], _B["database"]
    PR = Rapport("fjv_selvtest")
    ud = {}
    for navn in ("pyodbc", "mssql_python", "pymssql", "notebookutils", "sqlalchemy"):
        try:
            m = importlib.import_module(navn)
            ud[navn] = getattr(m, "__version__", "ok")
        except Exception as e:
            ud[navn] = f"MANGLER ({type(e).__name__})"
    try:
        import pyodbc
        ud["odbc_drivere"] = pyodbc.drivers()
    except Exception as e:
        ud["odbc_drivere"] = str(e)
    tokens = {}
    try:
        import notebookutils
        for aud in ("https://database.windows.net/", "https://database.windows.net/.default",
                    "sql", "pbi"):
            try:
                t = notebookutils.credentials.getToken(aud)
                tokens[aud] = f"ok ({len(t)} tegn)"
            except Exception as e:
                tokens[aud] = f"{type(e).__name__}: {str(e)[:200]}"
        try:
            c = notebookutils.data.connect_to_artifact(
                "fjernvarme-businesscase", notebookutils.runtime.context["currentWorkspaceId"],
                "SQLDatabase")
            ud["connect_to_artifact"] = {"type": type(c).__name__,
                                         "metoder": [m for m in dir(c) if not m.startswith("_")][:60]}
            try:
                df = c.query("SELECT SUSER_SNAME() AS login, (SELECT COUNT(*) FROM dbo.Koersels) AS n")
                ud["connect_to_artifact_query"] = str(df)[:500]
            except Exception as e:
                ud["connect_to_artifact_query"] = f"{type(e).__name__}: {str(e)[:300]}"
        except Exception as e:
            ud["connect_to_artifact"] = f"{type(e).__name__}: {str(e)[:300]}"
    except Exception as e:
        tokens["notebookutils"] = f"{type(e).__name__}: {e}"
    ud["tokens"] = tokens
    # pyodbc med Entra-token (SQL_COPT_SS_ACCESS_TOKEN = 1256)
    try:
        import pyodbc, struct, notebookutils
        tok = notebookutils.credentials.getToken("https://database.windows.net/").encode("utf-16-le")
        st = struct.pack(f"<I{len(tok)}s", len(tok), tok)
        drv = [d for d in pyodbc.drivers() if "SQL Server" in d][-1]
        cs = (f"Driver={{{drv}}};Server=tcp:{K_SERVER};Database={K_DB};"
              "Encrypt=yes;TrustServerCertificate=no;Connection Timeout=60")
        cn = pyodbc.connect(cs, attrs_before={1256: st}, autocommit=False)
        cur = cn.cursor()
        cur.execute("SELECT SUSER_SNAME(), IS_ROLEMEMBER('db_owner'), (SELECT COUNT(*) FROM dbo.Koersels), @@VERSION")
        ud["pyodbc"] = [str(x) for x in cur.fetchone()]
        cn.rollback(); cn.close()
    except Exception as e:
        ud["pyodbc"] = f"{type(e).__name__}: {str(e)[:500]}"
    # --- diagnose: køen, blokeringer og en tør gennemgang af ventende kørsler ---
    try:
        import time as _t
        from fjv.db import Db, laes_input, LOG
        from fjv.byg_case import byg as _byg, input_hash as _ih
        from fjv import runtime as _R
        db = Db({"server": K_SERVER, "database": K_DB})
        ud["koersler"] = [{k: str(v) for k, v in r.items()} for r in db.alle(
            "SELECT CAST(id AS nvarchar(36)) id, status, kilde, arbejder_id, fase, hjerteslag, "
            "bestilt, startet, afsluttet, annuller_anmodet, objektiv_dkk "
            "FROM dbo.Koersels ORDER BY bestilt")]
        ud["blokeringer"] = [{k: str(v) for k, v in r.items()} for r in db.alle(
            "SELECT session_id, blocking_session_id, wait_type, wait_time, command "
            "FROM sys.dm_exec_requests WHERE blocking_session_id <> 0")]
        ud["toer"] = []
        for k in ud["koersler"]:
            if k["status"] not in ("koe", "startet", "koerer"):
                continue
            t0 = _t.time(); rk, meta = laes_input(db, k["id"]); t1 = _t.time()
            d = {"id": k["id"], "raekker": len(rk), "laes_s": round(t1 - t0, 2),
                 "hash_ok": _ih(rk) == meta["input_hash"]}
            try:
                plan = _byg(rk); d["byg_s"] = round(_t.time() - t1, 2)
                d["cli"] = plan.cli; d["model_commit"] = plan.model_commit
                d["data_commit"] = plan.data_commit
            except Exception as e:
                d["byg_fejl"] = f"{type(e).__name__}: {e}"[:300]
            ud["toer"].append(d)
        t0 = _t.time(); _R.sikr_model(); _R.sikr_dfdata(); ud["sikr_s"] = round(_t.time() - t0, 2)
        # Publicerede resultater pr. færdig kørsel (antal + stikprøve af Koersel-felter)
        ud["publiceret"] = [{k: str(v) for k, v in r.items()} for r in db.alle(
            "SELECT CAST(k.id AS nvarchar(36)) id, k.status, k.objektiv_dkk, k.opnaaet_gap, "
            "k.best_bound, k.loesetid_s, k.oensket_rel_gap, k.oensket_abs_gap, k.oploesning, "
            "k.interval_min, k.antal_interval_model, k.antal_interval_csv, k.model_commit, "
            "k.data_commit, k.output_sti, k.solve_status, k.er_milp, k.forsoeg, k.startet, "
            "k.afsluttet, k.fabric_job_id, LEN(k.miljoe_json) miljoe_len, "
            "(SELECT COUNT(*) FROM dbo.KoerselNoegletals n WHERE n.koersel_id=k.id) n_nt, "
            "(SELECT COUNT(*) FROM dbo.KoerselMaaneds m WHERE m.koersel_id=k.id) n_md, "
            "(SELECT COUNT(*) FROM dbo.KoerselTimes t WHERE t.koersel_id=k.id) n_t, "
            "(SELECT MIN(tid) FROM dbo.KoerselTimes t WHERE t.koersel_id=k.id) t_min, "
            "(SELECT MAX(tid) FROM dbo.KoerselTimes t WHERE t.koersel_id=k.id) t_max, "
            "(SELECT vaerdi FROM dbo.KoerselMaaneds m WHERE m.koersel_id=k.id AND m.maaned='periode' "
            "AND m.objekt='halmkedel' AND m.noegle='produktion_gwh') halm_gwh "
            "FROM dbo.Koersels k WHERE k.status='faerdig' ORDER BY k.afsluttet")]
        # Låsens tilstand set udefra (§6c): 'NoLock' = ingen arbejder holder den.
        r = db.en("SELECT APPLOCK_TEST('public', 'fjv_solver', 'Exclusive', 'Session')")
        ud["fjv_solver_fri"] = bool(r and r[0] == 1)
        ud["scenarier"] = [{k: str(v) for k, v in x.items()} for x in db.alle(
            "SELECT LEFT(navn, 40) navn, arkiveret, COUNT(*) n FROM dbo.Scenaries "
            "GROUP BY LEFT(navn, 40), arkiveret ORDER BY 1")]
        # (Probe-tilstanden er LÆS-KUN: den skrivetest, der lå her under fejlsøgningen
        # 2026-10-16 07:0x, overskrev fase på kørende rækker og er fjernet.)
        ud["db_log"] = LOG[-30:]
    except Exception as e:
        import traceback as _tb
        ud["diagnose_fejl"] = _tb.format_exc()[-2000:]
    PR["probe_db"] = ud
    PR["ok"] = True
    PR.trin("probe_db", ud)
    print(json.dumps(ud, indent=1, default=str)[:5000])
