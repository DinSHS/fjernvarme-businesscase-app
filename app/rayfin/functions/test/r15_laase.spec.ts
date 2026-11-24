// @vitest-environment node
//-----------------------------------------------------------------------
// Runde 15, anden rettelsesrunde, fund I — Fabric-udgavens applåse kræver et gyldigt svar.
//
// `Number(r.recordset[0]?.rc)` gav `NaN` for en manglende række, og `NaN < 0` er falsk: en lås uden svar blev læst
// som tildelt. Nu er der ét tjek (`db.ts › applockTildelt`) for alle tre transaktionsejede låse — kvote, bestilling
// og arkivets kørselslås: svaret skal være en række med et helt, ikke-negativt tal.
//
// SQL'en kan ikke køres uden for Fabric; testen beviser, hvad svaret fører til, ikke ventetiden i SQL Server.
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { behandlBestilling } from "../src/bestilling";
import { applockTildelt, låsBestilling, låsKvote } from "../src/db";

const B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
type Rækker = Record<string, unknown>[];

/** En forespørgsel, der svarer på `sp_getapplock` med de givne rækker pr. ressource-rum og optager alt. */
function stub(lås: (rum: string) => Rækker) {
    const log: string[] = [];
    const req = () => {
        const input: Record<string, unknown> = {};
        const r = {
            input(navn: string, _type: unknown, værdi?: unknown) { input[navn] = værdi === undefined ? _type : værdi; return r; },
            async query(q: string) {
                if (/sp_getapplock/.test(q)) {
                    const rum = String(input.res).split(":")[0];
                    log.push(`lås ${rum}`);
                    return { recordset: lås(rum) };
                }
                const m = /^\s*(SELECT|INSERT INTO|DELETE FROM|UPDATE)[\s\S]*?dbo\.(\w+)/.exec(q);
                log.push(m ? `${m[1].split(" ")[0]} ${m[2]}` : q.trim().slice(0, 30));
                if (/FROM dbo\.Bestillings/.test(q)) return { recordset: [{ id: B, scenarie_id: "s", bestilt_af: "a@b.dk", bestilt: new Date("2026-11-23T10:00:00Z") }] };
                return { recordset: [] };
            },
        };
        return r;
    };
    return { req: req as never, log };
}

const UGYLDIGE: [string, Rækker][] = [
    ["ingen række", []],
    ["en række uden rc", [{}]],
    ["rc er null", [{ rc: null }]],
    ["rc er tekst", [{ rc: "x" }]],
    ["rc er ikke et helt tal", [{ rc: 0.5 }]],
    ["timeout", [{ rc: -1 }]],
    ["annulleret", [{ rc: -2 }]],
    ["deadlock-offer", [{ rc: -3 }]],
    ["fejl", [{ rc: -999 }]],
    // Tredje rettelsesrunde, P3-4: en uventet POSITIV kode er heller ikke en lås. Før gik 2 igennem her (tjekket var
    // "helt og ikke-negativt"), mens den lokale udgave kastede (`betroet_lager.applock`: kun 0 og 1) — de to porte
    // tolkede samme svar forskelligt. Ingen dokumenteret vej giver 2; netop derfor er det ikke en tildelt lås.
    ["en uventet positiv kode", [{ rc: 2 }]],
    ["en stor positiv kode", [{ rc: 999 }]],
    ["rc er sand", [{ rc: true }]],
];

describe("fund I: ét tjek af sp_getapplock's svar", () => {
    it.each(UGYLDIGE)("%s er ikke en lås", (_navn, rækker) => {
        // Før rettelsen: en manglende række gav Number(undefined) = NaN, og NaN < 0 er falsk — låsen talte som tildelt.
        expect(() => applockTildelt(rækker, "kvotelåsen")).toThrow(/Kunne ikke få kvotelåsen \(sp_getapplock = /);
    });
    it("0 (tildelt) og 1 (tildelt efter ventetid) går videre", () => {
        expect(() => applockTildelt([{ rc: 0 }], "kvotelåsen")).not.toThrow();
        expect(() => applockTildelt([{ rc: 1 }], "kvotelåsen")).not.toThrow();
    });
    it("kvotelåsen og bestillingens lås kaster, når svaret mangler", async () => {
        await expect(låsKvote(stub(() => []).req, "A@B.dk")).rejects.toThrow("Kunne ikke få kvotelåsen (sp_getapplock = intet svar).");
        await expect(låsBestilling(stub(() => []).req, B)).rejects.toThrow("Kunne ikke få bestillingens lås (sp_getapplock = intet svar).");
    });
    it("mangler kvotelåsens svar midt i en bestilling, læses køen ikke, og intet skrives", async () => {
        const s = stub((rum) => (rum === "fjv_kvote" ? [] : [{ rc: 0 }]));
        await expect(behandlBestilling(s.req, B)).rejects.toThrow(/kvotelåsen/);
        expect(s.log).toEqual(["lås fjv_bestilling", "SELECT Koersels", "SELECT Bestillings", "lås fjv_kvote"]);
    });
    it("arkivets kørselslås bruger samme tjek — ingen egen sammenligning med 0 i kilden", () => {
        for (const fil of ["../src/function_app.ts", "../src/db.ts", "../src/bestilling.ts"]) {
            const kode = readFileSync(new URL(fil, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
            const låse = kode.match(/sp_getapplock[^;]*@LockOwner = N'Transaction'/g) ?? [];
            const tjek = kode.match(/applockTildelt\(/g) ?? [];
            if (fil === "../src/db.ts") expect(tjek.length - 1).toBe(låse.length);      // minus selve definitionen
            else expect(tjek.length).toBe(låse.length);
            // Tolkningen af svaret står ét sted: i hjælperen selv — og dér som de to gyldige værdier (P3-4), ikke som
            // "ikke-negativt": ingen `rc < 0` nogen steder.
            expect((kode.match(/rc\)?\s*<\s*0/g) ?? []).length).toBe(0);
            expect((kode.match(/rc !== 0 && rc !== 1/g) ?? []).length).toBe(fil === "../src/db.ts" ? 1 : 0);
        }
    });
});
