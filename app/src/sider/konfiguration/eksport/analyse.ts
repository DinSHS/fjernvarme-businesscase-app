//-----------------------------------------------------------------------
// Upload af et værksark: er det et ark, appen har eksporteret, og hvad er
// ændret? (runde 12). Afgøres i browseren, før noget sendes:
//
//   * ingen markering, eller værket findes ikke her  -> nyt værk (som før)
//   * værkets revision != arkets                      -> konflikt: eksportér igen
//   * en ny eksport af revisionen != arkets hash      -> lavet af en anden udgave
//                                                        af eksporten: eksportér igen
//   * ingen forskel mod basis                          -> intet at gemme
//   * ellers                                           -> revision N+1 (med diff)
//
// Basis er appens nye eksport af værkets nuværende revision. Den sendes med
// uploaden, så importen kan køre modelscriptet på begge og gemme forskellen.
//-----------------------------------------------------------------------

import { eksporter } from "./eksporter";
import { genkend, læsArkmodel, sammenlign, type Forskel } from "./genkend";
import { hentEksportkilde, hentSkabelon, type Vaerkhoved } from "./hent";
import type { Eksportkilde } from "./kort";
import { læsCeller } from "./xlsx";

export type Uploadanalyse =
    | { art: "nyt"; grund?: string }
    | { art: "konflikt"; vaerk: Vaerkhoved; arkRevision: number }
    | { art: "anden_eksport"; vaerk: Vaerkhoved }
    | { art: "ingen_aendringer"; vaerk: Vaerkhoved }
    | { art: "revision"; vaerk: Vaerkhoved; forskel: Forskel; basis: Uint8Array };

export interface Hentere {
    kilde: (v: Vaerkhoved) => Promise<Eksportkilde>;
    skabelon: () => Promise<Uint8Array>;
}

const STANDARD: Hentere = { kilde: hentEksportkilde, skabelon: hentSkabelon };

export async function analyserUpload(bytes: Uint8Array, vaerker: readonly Vaerkhoved[], h: Hentere = STANDARD): Promise<Uploadanalyse> {
    let g;
    try { g = genkend(bytes); } catch { return { art: "nyt" }; }
    const m = g.markering;
    if (!m) return { art: "nyt" };
    const v = vaerker.find((x) => x.id.toLowerCase() === m.vaerk_id);
    if (!v) return { art: "nyt", grund: `Arket er eksporteret fra værket "${m.vaerk_kode}" (revision ${m.revision}), som ikke findes her. Det uploades som et nyt værk.` };
    if (v.revision !== m.revision) return { art: "konflikt", vaerk: v, arkRevision: m.revision };
    const basis = await eksporter(await h.kilde(v), await h.skabelon());
    if (basis.markering.sha256 !== m.sha256) return { art: "anden_eksport", vaerk: v };
    const forskel = sammenlign(læsArkmodel(læsCeller(basis.bytes)), g.model);
    if (forskel.tom) return { art: "ingen_aendringer", vaerk: v };
    return { art: "revision", vaerk: v, forskel, basis: basis.bytes };
}
