//-----------------------------------------------------------------------
// Listen "ikke med i arket" (runde 12): gruppering og etiketter. Ren logik.
//-----------------------------------------------------------------------

import { findFelt } from "../katalog";

/** Sektion/objekt for en sti (fx "Enhed fliskedel", "Balancemarked"), til grupperingen af listen. */
export function gruppe(sti: string): string {
    const [s, o] = sti.split(".");
    const navn: Record<string, string> = {
        units: "Enhed", storage: "Tank", prices: "Pris", electricity: "El og tarif", balancing: "Balancemarked",
        grid: "Nettilslutning", investment: "Investering", heat_load_params: "Varmelastens parametre", meta: "Beskrivelse",
        time: "Tidsvindue", solver: "Solver", data: "Data",
    };
    return ["units", "storage", "prices"].includes(s) && o ? `${navn[s]} ${o}` : navn[s] ?? s;
}

export function tabEtiket(sti: string): string {
    const p = findFelt(sti);
    const rest = sti.split(".").slice(["units", "storage", "prices"].includes(sti.split(".")[0]) ? 2 : 1).join(".");
    return p ? `${p.etiket}` : rest || sti;
}
