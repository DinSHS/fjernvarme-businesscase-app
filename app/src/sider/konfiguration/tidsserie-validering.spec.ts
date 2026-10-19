// Browserens forhåndstjek = fv-data's orakel (viden/vaerktoej/valider_tidsserie.py), vektor for vektor:
// samme status, samme fund (kode, niveau og besked ordret), samme normaliserede fil (sha256) og samme tal.
// Vektorerne skrives af _byg/byg_datakrav.py (alle fv-data's fixtures, modelrepoets fire filer, sommertid/vintertid).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import vektorer from "./orakel-vektorer.json";
import { DATAKRAV } from "./datakrav.data";
import { fsum, talTekst, valider, type Valg } from "./tidsserie-validering";
import { analyser } from "./tidsserie-analyse";
import { fraPunkter } from "./serie";

interface Sag {
    navn: string; rolle: string; valg: Valg; status: string; fund: { niveau: string; kode: string; besked: string }[];
    sha256: string | null; normaliseret: string | null; validering: Record<string, unknown>;
    tekst?: string; base64?: string; generer?: { start: string; n: number; vaerdi: string };
}
const V = vektorer as unknown as { sha256_data_krav: string; sager: Sag[] };

function input(s: Sag): string | Uint8Array {
    if (s.tekst !== undefined) return s.tekst;
    if (s.base64 !== undefined) return new Uint8Array(Buffer.from(s.base64, "base64"));
    const g = s.generer!;
    const t0 = Date.parse(`${g.start}T00:00:00Z`);
    let ud = "";
    for (let i = 0; i < g.n; i++) ud += `${new Date(t0 + i * 3_600_000).toISOString().slice(0, 19).replace("T", " ")},${g.vaerdi}\n`;
    return ud;
}

const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const KRAV = resolve(import.meta.dirname, "../../../../viden/data_krav.json");

describe("datagrundlaget er det nuværende data_krav.json", () => {
    it("datakrav.data.ts og orakel-vektorerne er genereret af den data_krav.json, der ligger i viden/ nu", () => {
        const nu = createHash("sha256").update(readFileSync(KRAV)).digest("hex");
        expect(DATAKRAV.sha256_data_krav, "kør _byg/byg_datakrav.py igen").toBe(nu);
        expect(V.sha256_data_krav, "kør _byg/byg_datakrav.py igen").toBe(nu);
    });
    it("vektorerne dækker hver upload-regel i data_krav.json", () => {
        const udløst = new Set(V.sager.flatMap((s) => s.fund.map((f) => f.kode)));
        const upload = Object.entries(DATAKRAV.regler).filter(([, r]) => r.hvornaar === "upload").map(([k]) => k);
        expect(upload.filter((k) => !udløst.has(k))).toEqual([]);
    });
});

describe("browserens tjek = oraklet", () => {
    for (const s of V.sager) {
        it(`${s.navn}: ${s.status}${s.fund.length ? ` (${s.fund.map((f) => f.kode).join(", ")})` : ""}`, () => {
            const r = valider(input(s), s.rolle, s.valg);
            expect(r.validering.fund).toEqual(s.fund);
            expect(r.status).toBe(s.status);
            expect(r.normaliseret === null ? null : sha(r.normaliseret)).toBe(s.sha256);
            if (s.normaliseret !== null) expect(r.normaliseret).toBe(s.normaliseret);
            for (const [k, v] of Object.entries(s.validering)) {
                if (v === null || v === undefined) continue;
                expect(r.validering[k], k).toEqual(v);
            }
        });
    }
});

describe("analysen regner som oraklet på repoets filer", () => {
    for (const s of V.sager.filter((x) => x.navn.startsWith("repo_"))) {
        it(`${s.navn}: benyttelsestid, energi og spids = validering_json`, () => {
            const r = valider(input(s), s.rolle, s.valg);
            const a = analyser(fraPunkter(r.punkter)!);
            expect(Math.round(a.benyttelsestid!)).toBe(s.validering.benyttelsestid_t);
            expect(a.mwh).toBeCloseTo(s.validering.sum_mwh as number, 6);
            expect(a.maks).toBe(s.validering.max);
        });
    }
});

describe("hjælpere", () => {
    it("talTekst = oraklets tal_tekst-testvektorer (data_krav.json)", () => {
        const krav = JSON.parse(readFileSync(KRAV, "utf-8")) as { tidsserier: { normaliseret_fil: { tal_tekst_testvektorer: [number, string][] } } };
        for (const [x, forv] of krav.tidsserier.normaliseret_fil.tal_tekst_testvektorer) expect(talTekst(x)).toBe(forv);
        expect(talTekst(1e-7)).toBe("0.0000001");
        expect(talTekst(1.25e21)).toBe("1250000000000000000000");
    });
    it("fsum er korrekt afrundet som Pythons math.fsum", () => {
        expect(fsum([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).toBe(1);
        expect(fsum([1e100, 1, -1e100])).toBe(1);
        expect(fsum([])).toBe(0);
    });
});
