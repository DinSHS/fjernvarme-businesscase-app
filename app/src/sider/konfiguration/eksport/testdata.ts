//-----------------------------------------------------------------------
// KUN TIL TESTS (runde 12): Andeby som eksportkilde — bladene fra
// modelspejlet (modelrepoets cases/andeby.yaml ved pinnen) og den aktive
// solprofil fra repoets egen fil (testvektoren solar_andeby_dmi_karup.csv,
// samme bytes som modelrepoets data/). Ingen værksdata ud over Andeby.
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODELSPEJL } from "@/lib/modelspejl.data";
import type { Eksportkilde, Serie } from "./kort";

export const SKABELON_FIL = resolve(import.meta.dirname, "vaerksdata_skabelon.xlsx");
export const skabelon = () => new Uint8Array(readFileSync(SKABELON_FIL));

export const ANDEBY_ID = "6e84c3a2-0000-4000-8000-000000000001";

export function andebySol(): Serie {
    const rk = readFileSync(resolve(import.meta.dirname, "../../../../rayfin/functions/test/vektorer/solar_andeby_dmi_karup.csv"), "utf8").trim().split("\n").slice(1);
    const pkt = rk.map((r) => { const [t, v] = r.split(","); return [Date.parse(t), Number(v)] as const; });
    const start = pkt[0][0];
    const værdier: (number | null)[] = new Array((pkt[pkt.length - 1][0] - start) / 3_600_000 + 1).fill(null);
    for (const [ms, v] of pkt) værdier[(ms - start) / 3_600_000] = v;
    return { startMs: start, oploesning: "1h", værdier };
}

/** Andeby ved revision `revision`; `ret` ændrer blade (sti -> vaerdi_json). */
export function andeby(revision = 1, ret: Record<string, string> = {}): Eksportkilde {
    const c = MODELSPEJL.cases.andeby;
    const blade = Object.entries(c.blade).map(([sti, [vaerdi_json, linje]]) => ({ sti, vaerdi_json: ret[sti] ?? vaerdi_json, raekkefoelge: linje }));
    return {
        vaerk: { id: ANDEBY_ID, kode: "andeby", navn: "Andeby — fiktivt referenceværk", revision },
        blade,
        varmelast: null,
        solprofil: { id: "sol-1", navn: "Repo: solprofil", sha256: null, serie: andebySol() },
    };
}
