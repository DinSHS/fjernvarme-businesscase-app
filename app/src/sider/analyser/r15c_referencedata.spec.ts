// Tredje rettelsesrunde i runde 15 (fundet under P2-4): Analysers kopi af README-referencerne var forældet.
//
// Information › Referencetal læser `viden/referencetal.json`; Analysers kørselsliste læser den GENEREREDE kopi
// `README_REFERENCER_JSON` (sammensaetning.data.ts, af `_byg/byg_sammensaetning.py`). Anden rettelsesrunde (fund F)
// gav de to Andeby-referencer deres egen solprofil (`solprofil_sha256`) i referencetal.json, men kopien blev ikke
// bygget igen. De to visninger brugte derfor samme regel (`kvalificer`) på hver sin reference: en Andeby-kørsel med
// casens egen solprofil frosset som tidsserie var en måling i Information og "kørt på et andet grundlag" i Analyser.
// Testen binder kopien til kilden, så den ikke kan blive forældet igen uden at fejle.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { laesReferencer } from "../information/referencer";
import { README_REFERENCER_JSON } from "./sammensaetning.data";

const KILDE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../viden/referencetal.json");

describe("Analysers README-referencer er de samme som Informations", () => {
    it("den genererede kopi læses til præcis de referencer, viden/referencetal.json giver", () => {
        expect(laesReferencer(README_REFERENCER_JSON)).toEqual(laesReferencer(readFileSync(KILDE, "utf-8")));
    });
    it("de to Andeby-referencer bærer casens egen solprofil — også i Analyser", () => {
        const med = laesReferencer(README_REFERENCER_JSON).filter((r) => r.solprofilSha256);
        expect(med.map((r) => r.id).sort()).toEqual(["andeby_helaar_bal", "andeby_helaar_spot"]);
    });
});
