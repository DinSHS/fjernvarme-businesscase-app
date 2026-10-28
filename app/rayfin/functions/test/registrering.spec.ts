// @vitest-environment node
//-----------------------------------------------------------------------
// K2-F1 / KONTRAKT §6c: alt der er registreret med udf.func, kan kaldes af ENHVER bruger med
// adgang til appen. Derfor en lukket liste over tilladte funktioner, og ingen test-/oprydnings-
// funktioner. Fejlede før rettelsen (rydProberaekker og seedProbevaerk var registreret).
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const kilde = readFileSync(new URL("../src/function_app.ts", import.meta.url), "utf8");
const metadata = JSON.parse(readFileSync(new URL("../runtimemetadata.json", import.meta.url), "utf8")) as {
    functions: { functionName: string }[];
};

const TILLADTE = ["startBestilling", "udfoerAendring", "afstem", "annullerKoersel", "hentKildeYaml", "skemaInfo",
    // KONTRAKT §6d (v2.3): værkets tidsserier og værksark.
    "uploadTidsserie", "hentTidsserie", "uploadVaerksark", "hentDmiTemperatur",
    // Runde 13: arkivets genimport (scenarier + historiske kørsler; skriver kun nye rækker, aldrig over eksisterende).
    "importerArkiv",
    // Runde 13b (K10-F4): rækketal til eksportens fuldstændighedstjek — kun læsning (COUNT).
    "arkivTal"].sort();

describe("registrerede Functions", () => {
    const iKilde = [...kilde.matchAll(/udf\.func\(\s*'(\w+)'/g)].map((m) => m[1]).sort();

    it("er præcis den tilladte liste — i kilden", () => {
        expect(iKilde).toEqual(TILLADTE);
    });
    it("er præcis den tilladte liste — i den genererede runtime-metadata (det der deployes)", () => {
        expect(metadata.functions.map((f) => f.functionName).sort()).toEqual(TILLADTE);
    });
    it("indeholder ingen test-, seed- eller oprydningsfunktion", () => {
        for (const navn of [...iKilde, ...metadata.functions.map((f) => f.functionName)]) {
            expect(navn).not.toMatch(/ryd|seed|probe|test|slet|delete/i);
        }
    });
    it("indeholder ingen DELETE mod andre tabeller end resultat-/inputtabeller i betroet kode", () => {
        // Tilladte DELETE: VaerkParameters (udfoerAendring 'slet'). Alt andet er en ny slettevej og skal begrundes.
        const deletes = [...kilde.matchAll(/DELETE FROM dbo\.(\w+)/g)].map((m) => m[1]);
        expect([...new Set(deletes)].sort()).toEqual(["VaerkParameters"]);
    });
});
