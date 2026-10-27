"""Beviset: appens bestillingsvej giver samme kørsel som ``run_case.py`` direkte på modelrepoet.

For hver case i modelrepoets ``cases/`` (ikke ``heat_load_params_*``) køres samme korte vindue to gange med
modelrepoets egen kommando for casen (``fjv.modelkoersel.standard``: casens "KØRES MED"-kommentar eller README's
tabel; uden kommando: appens egen antagelse, uden balancemarked og med syntetisk varmelast):

  A) direkte:  python run_case.py cases/<fil> --data-source github [flag] --start … --end … --out-dir …
  B) appen:    casen som blade (fjv.flad) -> frosset input (fjv.byg_case.raekker_fra_vaerk, som startBestilling)
               -> case.yaml + argv (fjv.byg_case.byg) -> fabric/fjv/model_wrapper.py, som fjv.koersel kører den

og der sammenlignes: manifestets objektiv, ``_hourly.csv`` og ``_kpi.csv`` byte for byte. Én kørsel ad gangen.

    python viden/vaerktoej/bevis_app_vej.py --model <modelrepo> [--ud <mappe>] [case.yaml …]

``--model`` er en klon af modelrepoet med den pinnede commit tjekket ud (``MODEL_COMMIT`` i fabric/fjv/konstanter.py)
og modellens pakker installeret i det Python, der kører scriptet (``pip install -r <modelrepo>/requirements.txt``).
Begge veje bruger samme df-data-klon (``<modelrepo>/data/df-data``; run_case.py kloner den første gang), så
sammenligningen gælder uanset dens commit — men tallene i CHANGELOG/TROFASTHED er målt med ``DF_DATA_SHA``.
Windows: hold ``--ud`` kort (fx ``C:\\fjvb``); modellens filnavne er lange, og grænsen er 260 tegn pr. sti.
Exit 0, når alle cases er ens; 1 ellers. Kun standardbibliotek + PyYAML (fra modellens pakker).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
ROD = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROD / "fabric"))
from fjv import konstanter as K, modelkoersel as MK  # noqa: E402
from fjv.byg_case import byg, raekker_fra_vaerk  # noqa: E402
from fjv.flad import flad  # noqa: E402


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def _resultat(ud: Path) -> dict:
    m = json.loads(next(ud.glob("*_manifest.json")).read_text(encoding="utf-8"))
    return {"objektiv": m["noegletal"]["objektiv_dkk"], "hourly": _sha(next(ud.glob("*_hourly.csv"))),
            "kpi": _sha(next(ud.glob("*_kpi.csv")))}


def _git_head(mappe: Path) -> str | None:
    r = subprocess.run(["git", "-C", str(mappe), "rev-parse", "HEAD"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def main(argv: list[str]) -> int:
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("--model", type=Path, default=os.environ.get("FJV_MODELMAPPE") or ROD.parent / "fjernvarme-businesscase",
                   help="modelrepoet ved den pinnede commit (standard: FJV_MODELMAPPE eller søstermappen)")
    a.add_argument("--ud", type=Path, default=ROD / "_lokal" / "bevis", help="uddata (git-ignoreret; hold stien kort)")
    a.add_argument("--start", default="2026-03-10")
    a.add_argument("--slut", default="2026-03-11")
    a.add_argument("--uden-committjek", action="store_true",
                   help="godtag en modelmappe, der ikke er en git-klon ved pinnen (fx en udpakket zip); skriver en advarsel")
    a.add_argument("cases", nargs="*", help="casefiler i modelrepoets cases/ (standard: alle)")
    o = a.parse_args(argv)
    M = o.model.resolve()
    if not (M / "run_case.py").is_file():
        print(f"FEJL: {M} er ikke modelrepoet (run_case.py mangler). Giv --model.")
        return 2
    head = _git_head(M)
    if head != K.MODEL_COMMIT and o.uden_committjek:
        print(f"ADVARSEL: modelmappen er ikke en git-klon ved {K.MODEL_COMMIT[:7]} (HEAD {(head or '-')[:7]}); "
              "du står selv inde for, at indholdet er den pinnede commit")
    elif head != K.MODEL_COMMIT:
        print(f"FEJL: modelrepoet står på {(head or 'ingen git-commit')[:16]}, appen er pinnet til {K.MODEL_COMMIT[:7]}: "
              f"git -C {M} checkout {K.MODEL_COMMIT[:7]}  (eller --uden-committjek for en udpakket zip)")
        return 2
    df = _git_head(M / "data" / "df-data")
    print(f"modelrepo {M} @ {(head or 'ukendt (ikke git)')[:7]} · df-data "
          f"{(df or 'hentes af første kørsel')[:7]} (appens pin {K.DF_DATA_SHA[:7]}) · vindue {o.start}..{o.slut}")
    if df and df != K.DF_DATA_SHA:
        print("  bemærk: df-data er ikke appens pin; begge veje bruger samme klon, så sammenligningen gælder stadig")

    readme = (M / "README.md").read_text(encoding="utf-8")
    cases = o.cases or sorted(p.name for p in (M / "cases").glob("*.yaml") if not p.name.startswith("heat_load_params"))
    miljoe = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    alle = []
    for fil in cases:
        tekst = (M / "cases" / fil).read_text(encoding="utf-8")
        st = MK.standard(MK.kommandoer(fil, tekst, readme))
        bal, heat = bool(st and st["med_balancering"]), (st or {}).get("heat_csv")
        navn = fil.removesuffix(".yaml")
        a_ud, b_ud = o.ud / navn / "direkte", o.ud / navn / "app"
        for d in (a_ud, b_ud):
            d.mkdir(parents=True, exist_ok=True)
            for gammel in d.iterdir():
                if gammel.is_file():
                    gammel.unlink()
        # A) direkte, med modelrepoets egne flag
        argv_a = [sys.executable, "run_case.py", f"cases/{fil}", "--data-source", "github"]
        if bal:
            argv_a.append("--with-balancing")
        if heat:
            argv_a += ["--heat-csv", f"data/{heat}"]
        argv_a += ["--start", o.start, "--end", o.slut, "--out-dir", str(a_ud.resolve())]
        t0 = time.time()
        ra = subprocess.run(argv_a, cwd=M, env=miljoe, capture_output=True, text=True, encoding="utf-8", errors="replace")
        ta = time.time() - t0
        # B) appens vej: frosset input -> case.yaml + argv -> wrapperen
        scen = {"periode_start": o.start, "periode_slut": o.slut, "med_balancering": bal, "heat_csv": heat,
                "model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA}
        plan = byg(raekker_fra_vaerk(flad(tekst), [], scen), heat_csv_rod=M / "data")
        (b_ud / "case.yaml").write_text(plan.case_yaml, encoding="utf-8")
        argv_b = [sys.executable, str(ROD / "fabric" / "fjv" / "model_wrapper.py"), str(M), str((b_ud / "case.yaml").resolve()),
                  *plan.cli, "--df-data-cache", str(M / "data" / "df-data"), "--out-dir", str(b_ud.resolve())]
        t0 = time.time()
        rb = subprocess.run(argv_b, cwd=M, env=miljoe, capture_output=True, text=True, encoding="utf-8", errors="replace")
        tb = time.time() - t0
        post = {"case": fil, "kommando": (st or {}).get("kilde") or "egen antagelse (ingen kommando i modelrepoet)",
                "argv_direkte": argv_a[2:-2], "argv_app": plan.cli, "sek": [round(ta), round(tb)]}
        if ra.returncode == 0 and rb.returncode == 0:
            A, B = _resultat(a_ud), _resultat(b_ud)
            post.update(direkte=A, app=B, ens=A == B)
        else:
            post.update(ens=False, fejl=[(ra.stderr or ra.stdout)[-600:], (rb.stderr or rb.stdout)[-600:]])
        alle.append(post)
        kr = lambda x: f"{x:>12,.0f}".replace(",", ".")  # noqa: E731  (dansk tusindtalsskilletegn)
        obj = f"{kr(post['direkte']['objektiv'])} / {kr(post['app']['objektiv'])}" if "direkte" in post else "fejl".rjust(27)
        print(f"{'ENS ' if post['ens'] else 'FORSKEL'} {fil:<34} {obj} kr.  ({post['kommando']}; {post['sek'][0]}+{post['sek'][1]} s)",
              flush=True)
        if "fejl" in post:
            print("   ", post["fejl"][0].strip().splitlines()[-1:] or "", post["fejl"][1].strip().splitlines()[-1:] or "")
    (o.ud / "resultat.json").write_text(json.dumps(alle, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(1 for p in alle if p["ens"])
    print(f"{n} af {len(alle)} cases ens (objektiv, _hourly.csv og _kpi.csv byte for byte) · detaljer: {o.ud / 'resultat.json'}")
    return 0 if n == len(alle) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
