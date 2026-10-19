//-----------------------------------------------------------------------
// Entiteterne læst som TEKST (decorators må hverken browser- eller testkæden
// importere som værdi). Håndhæver husets Rayfin-regler og at felter.ts
// matcher entiteterne felt for felt.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { FELTER } from "../felter";

const kilder = import.meta.glob("../../../../rayfin/data/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const entiteter = Object.entries(kilder).filter(([f]) => !/(schema|constants)\.ts$/.test(f));
const navn = (fil: string) => fil.split("/").pop()!.replace(".ts", "");

/** Felter pr. decorator-type, læst af kildeteksten. */
function felter(kilde: string): { navn: string; decorator: string; optional: boolean }[] {
    return [...kilde.matchAll(/^\s*@(\w+)\(([^)]*)\)\s+(\w+)([!?]):/gmu)].map((m) => ({
        decorator: m[1], navn: m[3], optional: m[4] === "?",
    }));
}

describe("entiteterne", () => {
    it("alle 15 fra kontrakt v2.3 findes og står i schema.ts", () => {
        expect(entiteter.map(([f]) => navn(f)).sort()).toEqual([
            "Aendringsanmodning", "Aendringslog", "Bestilling", "Koersel", "KoerselInput", "KoerselMaaned",
            "KoerselNoegletal", "KoerselTime", "Motor", "Scenarie", "ScenarieAendring", "Tidsserie", "Vaerk",
            "VaerkParameter", "Vaerksarkimport",
        ]);
        const schema = Object.entries(kilder).find(([f]) => f.endsWith("schema.ts"))![1];
        for (const [f] of entiteter) expect(schema).toContain(`${navn(f)}: ${navn(f)};`);
    });

    // Et @text() uden max bliver NVARCHAR(MAX) -> DAB kan ikke bygge sit GraphQL-skema.
    it.each(entiteter)("%s: hvert @text() har max", (_f, kilde) => {
        const tekster = kilde.match(/@text\([^)]*\)/g) ?? [];
        expect(tekster.length).toBeGreaterThan(0);
        for (const t of tekster) expect(t, t).toMatch(/max:/);
    });

    it.each(entiteter)("%s: feltnavne er ASCII (GraphQL tillader kun [_A-Za-z0-9])", (_f, kilde) => {
        const fs = felter(kilde);
        expect(fs.length).toBeGreaterThan(3);
        for (const f of fs) expect(f.navn).toMatch(/^[_A-Za-z0-9]+$/);
    });

    it.each(entiteter)("%s: har eksplicitte rettigheder (ingen '*')", (_f, kilde) => {
        expect(kilde).toMatch(/@authenticated\(/);
        expect(kilde).not.toMatch(/@authenticated\('\*'\)/);
    });

    it.each(entiteter)("%s: felter.ts kender præcis entitetens felter", (fil, kilde) => {
        const e = navn(fil) as keyof typeof FELTER;
        const fs = felter(kilde);
        const sæt = FELTER[e];
        expect([...sæt.alle].sort()).toEqual(fs.map((f) => f.navn).sort());
        const tekst = fs.filter((f) => f.decorator === "text" || f.decorator === "set").map((f) => f.navn).sort();
        const dato = fs.filter((f) => f.decorator === "date").map((f) => f.navn).sort();
        const tal = fs.filter((f) => f.decorator === "int" || f.decorator === "decimal").map((f) => f.navn).sort();
        expect([...sæt.tekst].sort()).toEqual(tekst);
        expect([...sæt.dato].sort()).toEqual(dato);
        expect([...sæt.tal].sort()).toEqual(tal);
    });
});

describe("rettigheder efter KONTRAKT v2 §3.0", () => {
    const k = Object.fromEntries(entiteter.map(([f, s]) => [navn(f), s]));
    it.each(["Vaerk", "VaerkParameter", "Aendringslog", "KoerselInput", "Koersel", "KoerselNoegletal", "KoerselMaaned", "KoerselTime", "Motor", "Tidsserie", "Vaerksarkimport"])(
        "%s er kun read for klienten", (e) => {
            const roller = k[e].match(/@authenticated\([^)]*\)/g) ?? [];
            expect(roller).toEqual(["@authenticated('read')"]);
        });
    it.each([["Bestilling", "bestilt_af"], ["Aendringsanmodning", "anmodet_af"], ["Scenarie", "oprettet_af"]])(
        "%s: create kræver egen e-mail i %s", (e, felt) => {
            expect(k[e]).toContain(`@authenticated<${e}>('create', { policy: (claims, item) => claims.email.eq(item.${felt})`);
        });
    it("K2-F10: Aendringsanmodning kan kun oprettes med status 'ny' (status/svar skrives af backend)", () => {
        expect(k.Aendringsanmodning).toContain(".and(item.status.eq('ny'))");
    });
    it("§6c: Motor findes og er kun read for klienten", () => {
        expect(k.Motor.match(/@authenticated\([^)]*\)/g)).toEqual(["@authenticated('read')"]);
    });
    it("Bestilling og Aendringsanmodning kan ikke opdateres eller slettes af klienten", () => {
        for (const e of ["Bestilling", "Aendringsanmodning"]) expect(k[e]).not.toMatch(/'update'|'delete'|'\*'/);
    });
});
