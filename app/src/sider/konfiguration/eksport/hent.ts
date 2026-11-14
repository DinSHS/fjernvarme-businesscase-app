//-----------------------------------------------------------------------
// Det, eksporten skal bruge fra datalaget (runde 12): værkets blade, dets
// AKTIVE tidsserier (det, en kørsel bruger) og modelrepoets skabelon.
// Begge udgaver: læsningen går gennem fundamentets datalag, og arket bygges
// i browseren — intet Fabric-job.
//-----------------------------------------------------------------------

import { læs } from "@/lib/data/laes";
import { hentTidsserie } from "@/lib/data/skriv";
import type { Eksportkilde, Tidsseriekilde } from "./kort";

export interface Vaerkhoved { id: string; kode: string; navn: string; revision: number }

/** Værkets blade + aktive tidsserier. To aktive i samme rolle er en fejl i databasen og siges højt. */
export async function hentEksportkilde(v: Vaerkhoved): Promise<Eksportkilde> {
    const blade = await læs("VaerkParameter", { filter: { vaerk_id: { eq: v.id } }, sortering: { raekkefoelge: "asc" } });
    const serier = await læs("Tidsserie", { filter: { vaerk_id: { eq: v.id } } });
    const aktiv = async (rolle: "varmelast" | "solprofil"): Promise<Tidsseriekilde | null> => {
        const a = serier.filter((t) => t.rolle === rolle && t.aktiv && t.status === "gyldig");
        if (a.length > 1) throw new Error(`Værket har ${a.length} aktive ${rolle}-serier — gør én aktiv under Tidsserier, før arket eksporteres.`);
        if (!a.length) return null;
        const d = await hentTidsserie(a[0].id);
        if (!d.ok || !d.start || !d.vaerdier) throw new Error(`${rolle}en "${a[0].navn}" kunne ikke hentes: ${d.fejl ?? "ukendt fejl"}`);
        const startMs = Date.parse(/[zZ]$/.test(d.start) ? d.start : `${d.start}Z`);
        return { id: a[0].id, navn: a[0].navn, sha256: a[0].sha256 ?? null, serie: { startMs, oploesning: d.oploesning === "15min" ? "15min" : "1h", værdier: d.vaerdier } };
    };
    return {
        vaerk: { id: v.id, kode: v.kode, navn: v.navn, revision: v.revision },
        blade: blade.map((b) => ({ sti: b.sti, vaerdi_json: b.vaerdi_json, raekkefoelge: b.raekkefoelge })),
        varmelast: await aktiv("varmelast"),
        solprofil: await aktiv("solprofil"),
    };
}

/** Modelrepoets vaerksdata_skabelon.xlsx ved pinnen — en separat fil i bundtet, hentet først når den skal bruges. */
export async function hentSkabelon(): Promise<Uint8Array> {
    const { default: url } = await import("./vaerksdata_skabelon.xlsx?url");
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Skabelonen kunne ikke hentes (HTTP ${r.status}).`);
    return new Uint8Array(await r.arrayBuffer());
}
