//-----------------------------------------------------------------------
// KUN TIL TESTS: værkerne fra databasens øjebliksbillede (7 fra modelrepoet + dem oprettet i appen)
// (skaermbilleder/harness/fixtures.json, hentet af fv-app med
// `node skaermbilleder/hent_fixtures.mjs <tokenfil>`). Rækkerne er rå fra
// DAB, så de normaliseres her som hooks'ene ville gøre.
//-----------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const FIXTURE_FIL = resolve(import.meta.dirname, "../../../skaermbilleder/harness/fixtures.json");

export interface FixtureBlad {
    vaerk_id: string; sti: string; vaerdi_json: string; sektion: string; objekt: string | null;
    kommentar: string | null; bekraeft: boolean; raekkefoelge: number;
}

export interface Fixture {
    vaerker: { id: string; kode: string; navn: string; revision: number; kilde: string }[];
    blade: Map<string, FixtureBlad[]>;
    koersler: { id: string; vaerk_id: string; vaerk_revision: number; status: string }[];
    input: { koersel_id: string; sti: string; vaerdi_json: string; kilde: "vaerk" | "aendring" | "scenarie" }[];
}

const tekst = (v: unknown) => (typeof v === "boolean" ? String(v) : (v as string));

export function læsFixture(): Fixture {
    if (!existsSync(FIXTURE_FIL)) {
        throw new Error(`Mangler ${FIXTURE_FIL} — hent den med: node skaermbilleder/hent_fixtures.mjs <tokenfil>`);
    }
    const d = JSON.parse(readFileSync(FIXTURE_FIL, "utf8"));
    const blade = new Map<string, FixtureBlad[]>();
    for (const p of d.VaerkParameter) {
        const b: FixtureBlad = { ...p, vaerk_id: p.vaerk_id.toLowerCase(), vaerdi_json: tekst(p.vaerdi_json), bekraeft: !!p.bekraeft };
        blade.set(b.vaerk_id, [...(blade.get(b.vaerk_id) ?? []), b]);
    }
    for (const l of blade.values()) l.sort((a, b) => a.raekkefoelge - b.raekkefoelge);
    return {
        vaerker: d.Vaerk.map((v: { id: string }) => ({ ...v, id: v.id.toLowerCase() })),
        blade,
        koersler: d.Koersel.map((k: { id: string; vaerk_id: string }) => ({ ...k, id: k.id.toLowerCase(), vaerk_id: k.vaerk_id.toLowerCase() })),
        input: d.KoerselInput.map((r: { koersel_id: string; vaerdi_json: unknown }) => ({ ...r, koersel_id: r.koersel_id.toLowerCase(), vaerdi_json: tekst(r.vaerdi_json) })),
    };
}
