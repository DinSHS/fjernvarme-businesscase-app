"""byg.py — generér de afledte filer fra skema.json.

    python skema/byg.py          skriv ddl/<dialekt>.sql og versioner/<version>.json (hvis den mangler)
    python skema/byg.py --tjek   skriv intet; exit 1 hvis en afledt fil ikke svarer til skema.json

versioner/<n>.json er skemaets strukturelle fingeraftryk ved version n og skrives KUN første gang.
Ændrer du strukturen uden at hæve "version" i skema.json, fejler --tjek (og testen) — det er meningen:
en strukturændring kræver en ny version og en migration (migrationer/README.md).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(errors="replace")
HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER))

import fjv_skema as S  # noqa: E402


#: Kolonnefelter, som TS-siden (arkivets validering, runde 13) har brug for.
_TS_FELTER = ("navn", "type", "nullable", "max", "min", "vaerdier", "moenster", "precision", "scale", "pk", "unik")


def ts_skema(skema: dict) -> str:
    """app/rayfin/functions/src/skema.data.ts: tabellerne og kolonnerne som TS-konstant (browser + Function)."""
    j = lambda v: json.dumps(v, ensure_ascii=False)  # noqa: E731
    L = ["// GENERERET af skema/byg.py fra skema/skema.json — ret ikke her.",
         "// Bruges af arkivet (arkiv.ts) til at validere rækker i browseren og i Function importerArkiv.", "",
         f"export const SKEMAVERSION = {skema['version']};", "", "export const SKEMA_TABELLER = {"]
    for t in skema["tabeller"]:
        L.append(f'    {t["entitet"]}: {{ tabel: {j(t["tabel"])}, kolonner: [')
        L += [f"        {j({k: c[k] for k in _TS_FELTER if k in c})}," for c in t["kolonner"]]
        L.append("    ] },")
    return "\n".join(L + ["} as const;", ""])


def afledte(skema: dict) -> dict[Path, str]:
    ud = {HER / "ddl" / f"{d}.sql": S.ddl(d, skema) for d in S.DIALEKTER}
    ud[HER.parent / "app" / "rayfin" / "functions" / "src" / "skema.data.ts"] = ts_skema(skema)
    # Én migration pr. versionstrin, afledt af de fastfrosne strukturer (aldrig håndskrevet SQL).
    for n in range(2, skema["version"] + 1):
        fra = json.loads((HER / "versioner" / f"{n - 1}.json").read_text(encoding="utf-8"))
        vsti = HER / "versioner" / f"{n}.json"
        til = json.loads(vsti.read_text(encoding="utf-8")) if vsti.exists() else S.struktur(skema)
        for d in S.DIALEKTER:
            ud[HER / "migrationer" / f"{n:04d}.{d}.sql"] = S.migration(fra, til, d)
    return ud


def versionsfil(skema: dict) -> tuple[Path, str]:
    return HER / "versioner" / f"{skema['version']}.json", json.dumps(S.struktur(skema), ensure_ascii=False, indent=1) + "\n"


def main(argv: list[str]) -> int:
    tjek = "--tjek" in argv
    skema = S.laes()
    fejl = []
    for sti, tekst in afledte(skema).items():
        # Linjeskift normaliseres: en checkout med core.autocrlf giver CRLF, og det er ikke en ændring af indholdet.
        nu = sti.read_bytes().decode("utf-8").replace("\r\n", "\n") if sti.exists() else None
        if nu == tekst:
            continue
        if tjek:
            fejl.append(f"{sti.relative_to(HER.parent)} svarer ikke til skema.json - kør python skema/byg.py")
        else:
            sti.parent.mkdir(parents=True, exist_ok=True)
            sti.write_bytes(tekst.encode("utf-8"))
            print(f"skrevet {sti.relative_to(HER.parent)}")
    vsti, vtekst = versionsfil(skema)
    if not vsti.exists():
        if tjek:
            fejl.append(f"{vsti.relative_to(HER)} mangler - kør python skema/byg.py")
        else:
            vsti.parent.mkdir(parents=True, exist_ok=True)
            vsti.write_bytes(vtekst.encode("utf-8"))
            print(f"skrevet {vsti.relative_to(HER)} (fastfrosset)")
    elif json.loads(vsti.read_text(encoding="utf-8")) != json.loads(vtekst):
        fejl.append(
            f"strukturen er ændret, men version er stadig {skema['version']} ({vsti.relative_to(HER)} er fastfrosset). "
            "Hæv version i skema.json og skriv en migration (migrationer/README.md)."
        )
    for f in fejl:
        print("FEJL:", f)
    if not fejl:
        print(f"skema version {skema['version']}: {len(skema['tabeller'])} tabeller, "
              f"{sum(len(t['kolonner']) for t in skema['tabeller'])} kolonner - afledte filer er i takt")
    return 1 if fejl else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
