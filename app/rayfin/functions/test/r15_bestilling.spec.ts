// @vitest-environment node
//-----------------------------------------------------------------------
// Kodegennemgangen af runde 15, fund 1–3 — Fabric-udgavens startBestilling.
//
// Fund 1 (P1): startBestilling læste bestillingen uden lås og slettede en AFVIST bestilling i en ny forbindelse
// efter rollback. To kald om samme bestilling kunne derfor ende med en kørsel uden sin Bestilling-række.
// Fund 2 (P2): bestillings-id'et kommer fra kalderen, og funktionen kender ikke kalderens identitet — enhver
// appbruger kunne få en andens afviste bestilling slettet.
// Fund 3 (P2): en teknisk fejl blev svaret som en afvisning; klienten arkiverede sit scenarie på den.
//
// SQL'en kan ikke køres uden for Fabric. Forløbet testes derfor mod en optagende stub (som motor.spec.ts): den
// beviser rækkefølgen af udsagn og hvad der skrives — ikke isolationen, som er SQL Servers (sp_getapplock,
// transaktionsejet; samme mønster som den målte kvotelås). Det står i rapporten for rettelserne.
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { behandlBestilling } from "../src/bestilling";

const B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const vektor = (JSON.parse(readFileSync(new URL("../../../../skema/vektorer/byg_frosset_input.json", import.meta.url), "utf8")) as {
    tilfaelde: { navn: string; input: { params: { sti: string; vaerdi_json: string }[]; pins: { model_commit: string; data_commit: string } } }[];
}).tilfaelde.find((t) => t.navn === "pins")!.input;

type Rækker = Record<string, unknown>[];
interface Verden { koersel?: Rækker; bestilling?: Rækker; iKoe?: number; lås?: number; aendringer?: Rækker }

/** Stub af transaktionens forespørgsler: hvert udsagn optages, og svaret vælges ud fra SQL-teksten. */
function stub(v: Verden = {}) {
    const log: { sql: string; input: Record<string, unknown> }[] = [];
    const svar = (q: string): Rækker => {
        if (/sp_getapplock/.test(q)) return [{ rc: v.lås ?? 0 }];
        if (/SELECT id, status FROM dbo\.Koersels WHERE bestilling_id/.test(q)) return v.koersel ?? [];
        if (/FROM dbo\.Bestillings/.test(q)) return v.bestilling ?? [{ id: B.toUpperCase(), scenarie_id: "s", bestilt_af: "a@b.dk", bestilt: new Date("2026-11-23T10:00:00Z") }];
        if (/FROM dbo\.Scenaries/.test(q)) return [{ id: "s", vaerk_id: "v", arkiveret: false, periode_start: null, periode_slut: null, med_balancering: false, balancing_method: null, mip_rel_gap: null, mip_abs_gap: null, tidsgraense_s: null, ekstra_flag: null, heat_csv: null }];
        if (/FROM dbo\.Vaerks/.test(q)) return [{ id: "v", revision: 4, arkiveret: false }];
        if (/COUNT\(\*\) AS n FROM dbo\.Koersels/.test(q)) return [{ n: v.iKoe ?? 0 }];
        if (/FROM dbo\.VaerkParameters/.test(q)) return vektor.params;
        if (/FROM dbo\.ScenarieAendrings/.test(q)) return v.aendringer ?? [];
        if (/FROM dbo\.Motors/.test(q)) return [vektor.pins];
        if (/FROM dbo\.Tidsseries/.test(q)) return [];
        return [];
    };
    const req = () => {
        const input: Record<string, unknown> = {};
        const r = {
            input(navn: string, _type: unknown, værdi?: unknown) { input[navn] = værdi === undefined ? _type : værdi; return r; },
            async query(q: string) { log.push({ sql: q, input }); return { recordset: svar(q), rowsAffected: [1] }; },
        };
        return r;
    };
    const hvad = () => log.map(({ sql, input }) => {
        if (/sp_getapplock/.test(sql)) return `lås ${String(input.res).split(":")[0]}`;
        const m = /^\s*(SELECT|INSERT INTO|DELETE FROM|UPDATE)[\s\S]*?dbo\.(\w+)/.exec(sql);
        return m ? `${m[1].split(" ")[0]} ${m[2]}` : sql.trim().slice(0, 30);
    });
    return { req: req as never, log, hvad };
}

describe("fund 1: én lås pr. bestilling, taget før bestillingen læses", () => {
    it("låsen er transaktionens første udsagn — transaktionsejet, eksklusiv, på netop denne bestilling", async () => {
        const s = stub();
        await behandlBestilling(s.req, B.toUpperCase());
        expect(s.log[0].sql).toMatch(/sp_getapplock @Resource = @res, @LockMode = N'Exclusive', @LockOwner = N'Transaction'/);
        expect(s.log[0].input.res).toBe(`fjv_bestilling:${B}`);          // små bogstaver: DAB og mssql skriver id'et forskelligt
        // Før rettelsen: bestillingen blev læst først, uden lås, og kvotelåsen var den eneste.
        expect(s.hvad().slice(0, 4)).toEqual(["lås fjv_bestilling", "SELECT Koersels", "SELECT Bestillings", "lås fjv_kvote"]);
    });
    it("kørslen indsættes sidst, under samme lås, med bestillingens id og værkets revision", async () => {
        const s = stub();
        const ud = await behandlBestilling(s.req, B);
        expect(ud.art).toBe("ny");
        const hvad = s.hvad();
        expect(hvad.filter((x) => x.startsWith("INSERT"))).toEqual(["INSERT Koersels", "INSERT KoerselInputs"]);
        expect(hvad.indexOf("INSERT Koersels")).toBe(hvad.length - 2);
        const ind = s.log[hvad.indexOf("INSERT Koersels")].input;
        expect([ind.b, ind.rev, ind.af, ind.mc]).toEqual([B.toUpperCase(), 4, "a@b.dk", vektor.pins.model_commit]);
    });
    it("findes kørslen allerede, da låsen blev fri: svar med den — reglerne spørges ikke igen (kvoten kunne ellers afvise en bestilling, der kører)", async () => {
        const s = stub({ koersel: [{ id: "K1", status: "koe" }], iKoe: 3 });
        expect(await behandlBestilling(s.req, B)).toEqual({ art: "findes", koersel_id: "k1", status: "koe" });
        expect(s.hvad()).toEqual(["lås fjv_bestilling", "SELECT Koersels"]);
    });
    it("kan låsen ikke fås, er det en teknisk fejl — og intet er læst eller skrevet", async () => {
        const s = stub({ lås: -1 });
        await expect(behandlBestilling(s.req, B)).rejects.toThrow("Kunne ikke få bestillingens lås (sp_getapplock = -1).");
        expect(s.hvad()).toEqual(["lås fjv_bestilling"]);
    });
});

describe("fund 2: uden en verificeret kalder slettes ingen bestilling i Fabric-udgaven", () => {
    it("kvoteafvisning: afvist, intet skrevet, intet slettet", async () => {
        const s = stub({ iKoe: 3 });
        expect(await behandlBestilling(s.req, B)).toEqual({ art: "afvist", tekst: "Du har allerede 3 kørsler i kø; højst 3 ad gangen. Vent til en er færdig, eller annullér en." });
        expect(s.hvad().filter((x) => !x.startsWith("SELECT") && !x.startsWith("lås"))).toEqual([]);
    });
    it("regelbrud i scenariet (bygFrossetInput): afvist, intet skrevet, intet slettet", async () => {
        const s = stub({ aendringer: [{ type: "set", sti: "prices.findes_ikke.value", vaerdi_json: "1.0", raekkefoelge: 1 }] });
        const ud = await behandlBestilling(s.req, B);
        expect(ud.art === "afvist" && ud.tekst).toContain("som ikke findes i værket");
        expect(s.hvad().filter((x) => !x.startsWith("SELECT") && !x.startsWith("lås"))).toEqual([]);
    });
    it("bestillingen findes ikke: afvist", async () => {
        expect(await behandlBestilling(stub({ bestilling: [] }).req, B)).toEqual({ art: "afvist", tekst: "Bestillingen findes ikke." });
    });
    it("kilden: ingen DELETE mod Bestillings, og svaret 'ryddet' gives aldrig herfra", () => {
        for (const fil of ["../src/function_app.ts", "../src/bestilling.ts"]) {
            const kode = readFileSync(new URL(fil, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
            expect(kode).not.toMatch(/DELETE FROM dbo\.Bestillings/);
            expect(kode).not.toMatch(/ryddet:\s*true/);
        }
    });
});

describe("fund 3: svaret skelner en endelig afvisning fra en teknisk fejl", () => {
    const kode = readFileSync(new URL("../src/function_app.ts", import.meta.url), "utf8");
    const handler = kode.slice(kode.indexOf("'startBestilling'"), kode.indexOf("// ------------------------------------------------------------------ nyt værk fra bunden"));
    it("en teknisk fejl svares med teknisk: true — aldrig som en ren afvisning", () => {
        // Før rettelsen: `return { ok: false, afvist: tekniskFejl('startBestilling', e) };` — klienten kunne ikke se forskel.
        const tekniske = [...handler.matchAll(/return \{[^}]*tekniskFejl\('startBestilling', e\)[^}]*\}/g)].map((m) => m[0]);
        expect(tekniske.length).toBe(1);
        expect(tekniske[0]).toMatch(/teknisk: true/);
    });
    it("en afvisning fra reglerne svares uden 'teknisk' og uden 'ryddet' (bestillingen står)", () => {
        expect(handler).toContain("if (udfald.art === 'afvist') return { ok: false, afvist: udfald.tekst };");
    });
    it("handleren læser ikke selv bestillingen: hele forløbet går gennem behandlBestilling under låsen", () => {
        expect(handler).toMatch(/iTransaktion\(pool, \(req\) => behandlBestilling\(req, bestillingId\)\)/);
        expect(handler).not.toMatch(/dbo\.Bestillings/);
    });
});
