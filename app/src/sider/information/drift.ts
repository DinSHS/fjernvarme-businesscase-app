//-----------------------------------------------------------------------
// Driftsforhold: prøvekapacitetens udløb og hvilke versioner af kode og data kørslerne er regnet med.
// Ren logik — ingen React.
//-----------------------------------------------------------------------

import type { FjvSchema } from "../../../rayfin/data/schema";
import { dageMellem } from "./tal";

type Koersel = FjvSchema["Koersel"];

/** FTL64 Trial startede 2026-10-08 og udløber ca. 2026-12-07 (KONTRAKT §2) — "ca.": datoen er ikke bekræftet af administratoren. */
export const KAPACITET = {
    navn: "FTL64 Trial",
    start: new Date("2026-10-08T00:00:00Z"),
    udloeb: new Date("2026-12-07T00:00:00Z"),
} as const;

export function dageTilUdloeb(nu: Date): number {
    return dageMellem(nu, KAPACITET.udloeb);
}

/** "Prøvekapaciteten udløber om 52 dage (omkring 7. december 2026)." / "…er udløbet …". */
export function udloebsTekst(nu: Date): string {
    const d = dageTilUdloeb(nu);
    if (d > 1) return `Prøvekapaciteten udløber om ${d} dage (omkring 7. december 2026).`;
    if (d === 1) return "Prøvekapaciteten udløber i morgen (omkring 7. december 2026).";
    if (d === 0) return "Prøvekapaciteten udløber i dag (omkring 7. december 2026).";
    return `Prøvekapaciteten udløb for ${-d} ${d === -1 ? "dag" : "dage"} siden (omkring 7. december 2026) — nye kørsler kan ikke regnes, før workspacet er flyttet til en betalt kapacitet.`;
}

export interface Version { model: string; data: string; antal: number; seneste: Date | undefined }

const kort = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "ukendt");
export { kort as kortSha };

/** Kørsler grupperet på (modelcommit, df-data-commit) — kun kørsler, der kom så langt, at de gemte versionerne. */
export function versioner(koersler: readonly Koersel[]): Version[] {
    const m = new Map<string, Version>();
    for (const k of koersler) {
        if (!k.model_commit && !k.data_commit) continue;
        const nøgle = `${k.model_commit ?? ""}|${k.data_commit ?? ""}`;
        const v = m.get(nøgle) ?? { model: k.model_commit ?? "", data: k.data_commit ?? "", antal: 0, seneste: undefined };
        v.antal++;
        const t = k.afsluttet ?? k.bestilt;
        if (t && (!v.seneste || new Date(t) > v.seneste)) v.seneste = new Date(t);
        m.set(nøgle, v);
    }
    return [...m.values()].sort((a, b) => (b.seneste?.getTime() ?? 0) - (a.seneste?.getTime() ?? 0));
}

/** Hvor mange kørsler regner nu (højst én ad gangen), og hvor mange venter? */
export function koeoversigt(koersler: readonly Koersel[]): { regner: number; venter: number } {
    const regner = koersler.filter((k) => k.status === "startet" || k.status === "koerer" || k.status === "indlaeser").length;
    const venter = koersler.filter((k) => k.status === "koe").length;
    return { regner, venter };
}
