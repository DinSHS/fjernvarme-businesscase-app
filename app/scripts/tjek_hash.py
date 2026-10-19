"""Efterregner Koersel.input_hash i Python -- referenceimplementering for notebooken.

DEFINITION (KONTRAKT v2 par. 3.6, skal vaere identisk med rayfin/functions/src/logik.ts inputHash):
    raekker = sorteret liste af [kilde, sti, vaerdi_json] (alle strenge), leksikografisk
    tekst   = json.dumps(raekker, ensure_ascii=False, separators=(",", ":"))
    hash    = sha256(tekst.encode("utf-8")).hexdigest()

Brug:  python scripts/tjek_hash.py <fil.json>   (filen skrives af `node scripts/probe.mjs <token> e2e`)
"""
import hashlib
import json
import sys

sys.stdout.reconfigure(errors="replace")


def input_hash(raekker):
    tupler = sorted([r["kilde"], r["sti"], r["vaerdi_json"]] for r in raekker)
    tekst = json.dumps(tupler, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


if __name__ == "__main__":
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    beregnet = input_hash(data["rækker"])
    print("gemt:     ", data["hash"])
    print("beregnet: ", beregnet)
    print("ENS" if beregnet == data["hash"] else "FORSKELLIG")
    sys.exit(0 if beregnet == data["hash"] else 1)
