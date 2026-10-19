import json, uuid
from pathlib import Path

from fjv import konstanter as K, runtime as R
from fjv.byg_case import raekker_fra_vaerk
from fjv.flad import flad
from fjv.koersel import Afbrudt, IngenLager, koer_en
from fjv.rapport import Rapport

RAP = Rapport("fjv_koer_scenarie")
RAP["kodeaftryk"] = R.kodeaftryk(_MOTOR_LOKAL / "fjv")
DB_KONFIG = Path(K.FILES) / K.REL_KONFIG / "db.json"


def _tal(s):
    s = (str(s) if s is not None else "").strip()
    return float(s) if s else None


def _scenarie_fra_parametre():
    return {"periode_start": start or None, "periode_slut": slut or None,
            "med_balancering": bool(med_balancering),
            "balancing_method": balancing_method or None,
            "mip_rel_gap": _tal(mip_rel_gap), "mip_abs_gap": _tal(mip_abs_gap),
            "tidsgraense_s": _tal(tidsgraense_s), "data_commit": data_commit or None,
            "heat_csv": heat_csv or None, "ekstra_flag": ekstra_flag or None,
            "tidsserie_valg": {"varmelast": tidsserie_varmelast or "",
                               "solprofil": tidsserie_solprofil or ""}}


def _batch():
    """batch_json: inline JSON eller en sti i lakehouset ("Files/..."). Tom = ingen batch."""
    tekst = (batch_json or "").strip()
    if not tekst:
        return None
    if tekst.startswith("Files/"):
        tekst = (Path(K.FILES).parent / tekst).read_text(encoding="utf-8")
    d = json.loads(tekst)
    return d["koersler"] if isinstance(d, dict) else d


def _repo_vaerk(kode: str):
    """Værket fra modelrepoets casefil (vejen uden database)."""
    mappe, _ = R.sikr_model(K.MODEL_COMMIT)
    for f in sorted((mappe / "cases").iterdir()):
        if f.suffix == ".yaml" and not f.name.startswith("heat_load_params") \
                and f.stem.lower() == kode.lower():
            return f, flad(f.read_text(encoding="utf-8"))
    raise ValueError(f"intet værk med koden {kode!r} i cases/")


try:
    RAP["parametre"] = {"koersel_id": koersel_id, "vaerk_kode": vaerk_kode,
                        "scenarie": _scenarie_fra_parametre(), "aendringer": aendringer_json}
    if DB_KONFIG.exists():
        from fjv import db as DB
        RAP["tilstand"] = DB.koer_notebook(json.loads(DB_KONFIG.read_text(encoding="utf-8")),
                                           RAP, koersel_id=koersel_id, vaerk_kode=vaerk_kode,
                                           scenarie_navn=scenarie_navn,
                                           aendringer=json.loads(aendringer_json or "[]"),
                                           scenarie=_scenarie_fra_parametre(),
                                           batch=_batch(),
                                           test_doed_efter_s=float(test_doed_efter_s or 0))
        RAP["ok"] = RAP["tilstand"].get("ok", False)
    else:
        # Ingen database endnu: manuel kørsel direkte fra repoets casefil.
        if not vaerk_kode:
            raise ValueError("ingen database konfigureret (Files/fjv/konfig/db.json) "
                             "- angiv vaerk_kode for en manuel kørsel")
        RAP.advar("ingen database: resultaterne ligger kun i lakehouset")
        fil, params = _repo_vaerk(vaerk_kode)
        _sc = _scenarie_fra_parametre()
        _sc["model_commit"] = K.MODEL_COMMIT              # frys pins i inputtet (§6c)
        _sc["data_commit"] = _sc.get("data_commit") or K.DF_DATA_SHA
        raekker = raekker_fra_vaerk(params, json.loads(aendringer_json or "[]"), _sc)
        kid = koersel_id or str(uuid.uuid4())
        RAP.trin("koersel", {"id": kid, "vaerk_fil": fil.name, "raekker": len(raekker)})
        resume = koer_en(raekker, kid, IngenLager(), RAP)
        RAP["ok"] = resume.get("status") == "faerdig"
except Afbrudt as e:
    RAP.advar(f"afbrudt: {e}")
    RAP["ok"] = True              # en anden arbejder har kørslen; det er ikke en fejl
except Exception as fejl:
    RAP.fejl(fejl)
finally:
    RAP.skriv()
    # Flere arbejderjobs kan køre samtidig (den ene får låsen, de andre afslutter);
    # den fælles fil ovenfor overskrives af den sidste. Hver arbejder gemmer derfor
    # også sin egen kopi, så "optaget"-jobs kan efterprøves bagefter.
    try:
        _mig = ((RAP.data.get("tilstand") or {}).get("arbejder_id") or "ukendt").replace(":", "_")
        _p = Path(K.FILES) / K.REL_RUN / "arbejdere" / f"{_mig}.json"
        _p.parent.mkdir(parents=True, exist_ok=True)
        _p.write_text(json.dumps(RAP.data, ensure_ascii=False, indent=1, default=str),
                      encoding="utf-8")
    except Exception as _e:
        print("kunne ikke skrive arbejderens egen rapport:", _e)

print(json.dumps({k: RAP.data.get(k) for k in ("ok", "koersel", "undtagelse", "advarsler")},
                 ensure_ascii=False, indent=1, default=str)[:6000])
if not RAP["ok"]:
    raise RuntimeError("fjv_koer_scenarie fejlede - se Files/_run/fjv_koer_scenarie.json")
