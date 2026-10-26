if probe not in ("db", "db-slut"):
    import json, os, re, tempfile, time, xml.etree.ElementTree as ET
    from pathlib import Path

    from fjv import konstanter as K, runtime as R
    from fjv.rapport import Rapport

    RAP = Rapport("fjv_selvtest")
    try:
        RAP["kodeaftryk"] = R.kodeaftryk(_MOTOR_LOKAL / "fjv")
        RAP["runtime"] = R.maal_runtime()
        RAP.trin("runtime", RAP["runtime"])

        model_sha = (model_commit or K.MODEL_COMMIT).strip()
        data_sha = (data_commit or K.DF_DATA_SHA).strip()
        kode_lh, kode_info = R.sikr_model(model_sha)
        RAP.trin("modelkode", kode_info)
        df_lh, df_info = R.sikr_dfdata(data_sha)
        RAP.trin("df-data", df_info)

        arbejde = Path(tempfile.gettempdir()) / "fjv_selvtest"
        kode = R.lokal_kodekopi(kode_lh, arbejde / "kode", dfdata=df_lh, git_init=True)
        log = []
        py = R.byg_miljoe(kode / "requirements.txt", Path(tempfile.gettempdir()) / "fjv_venv", log)
        RAP["miljoe"] = log
        RAP["pakker"] = R.pakkeversioner(py, ["linopy", "highspy", "xarray", "pandas",
                                              "numpy", "scipy", "netCDF4", "PyYAML",
                                              "matplotlib", "pytest"])
        RAP.trin("miljoe", {"python": py, "pakker": RAP["pakker"]})

        # --- modelrepoets pytest-suite (F4) -----------------------------------
        junit = arbejde / "junit.xml"
        rc = R.koer_proces([py, "-m", "pytest", "-q", "-p", "no:cacheprovider",
                            f"--junitxml={junit}"], kode, arbejde / "pytest.log", 1800)
        hale = (arbejde / "pytest.log").read_text(encoding="utf-8", errors="replace")
        tal = {"rc": rc}
        if junit.exists():
            rod = ET.parse(junit).getroot()
            suiter = [rod] if rod.tag == "testsuite" else list(rod.iter("testsuite"))
            for felt in ("tests", "failures", "errors", "skipped"):
                tal[felt] = sum(int(s.get(felt, 0)) for s in suiter)
            tal["bestaaet"] = tal["tests"] - tal["failures"] - tal["errors"] - tal["skipped"]
            tal["fejlede"] = [f"{c.get('classname')}::{c.get('name')}"
                              for c in rod.iter("testcase")
                              if c.find("failure") is not None or c.find("error") is not None]
            tal["sprunget_over"] = sorted({(c.find("skipped").get("message") or "")[:200]
                                           for c in rod.iter("testcase")
                                           if c.find("skipped") is not None})
        tal["opsummering"] = hale.strip().splitlines()[-1] if hale.strip() else ""
        RAP["pytest"] = tal
        RAP.trin("pytest", {k: v for k, v in tal.items() if k not in ("sprunget_over",)})

        # --- røgtest: --dummy (ingen netværk, sekunder) -----------------------
        # billund_sporA, som repoets doc/WORKFLOW_LOKAL.md bruger. andeby --dummy
        # kan ikke køre ved b49aeb0 eller eef950a: dummy-data hæfter ikke solvarmens
        # production_profile på (ValueError i build_model) - målt lokalt.
        ud = arbejde / "roeg"
        ud.mkdir(parents=True, exist_ok=True)
        rc2 = R.koer_proces([py, "run_case.py", "cases/billund_sporA.yaml", "--dummy",
                             "--out-dir", str(ud)], kode, ud / "log.txt", 900)
        manif = sorted(ud.glob("*_manifest.json"))
        roeg = {"rc": rc2, "manifest": manif[0].name if manif else None}
        if manif:
            m = json.loads(manif[0].read_text(encoding="utf-8"))
            roeg["objektiv_dkk"] = m["noegletal"]["objektiv_dkk"]
            roeg["solve_status"] = m["sporbarhed"]["solve_status"]
        else:
            roeg["log_hale"] = (ud / "log.txt").read_text(encoding="utf-8")[-2000:]
        RAP["roegtest"] = roeg
        RAP.trin("roegtest", roeg)

        RAP["ok"] = (rc == 0 and tal.get("failures", 1) == 0 and tal.get("errors", 1) == 0
                     and rc2 == 0 and bool(manif))
    except Exception as fejl:
        RAP.fejl(fejl)
    finally:
        RAP.skriv()

    print(json.dumps({k: RAP.data.get(k) for k in ("ok", "pytest", "roegtest", "undtagelse")},
                     ensure_ascii=False, indent=1, default=str)[:4000])
    if not RAP["ok"]:
        raise RuntimeError("fjv_selvtest fejlede - se Files/_run/fjv_selvtest.json")
