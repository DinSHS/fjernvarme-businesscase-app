//-----------------------------------------------------------------------
// Upload af et værksark: er det et ark, appen har eksporteret, og hvad er
// ændret? (runde 12). Afgøres i browseren, før noget sendes:
//
//   * ingen markering, eller værket findes ikke her  -> nyt værk (som før)
//   * arket er i et ældre format (før appens faner)    -> eksportér igen (runde 14)
//   * værkets revision != arkets                      -> konflikt: eksportér igen
//   * en ny eksport af revisionen != arkets hash      -> lavet af en anden udgave
//                                                        af eksporten: eksportér igen
//   * ingen forskel mod basis                          -> intet at gemme
//   * kun felter, der ikke gemmes (K11 F5)             -> intet at gemme, og hvorfor
//   * ellers                                           -> revision N+1 (med diff)
//
// Basis er appens nye eksport af værkets nuværende revision. Den sendes med
// uploaden, så importen kan køre modelscriptet på begge og gemme forskellen.
//-----------------------------------------------------------------------

import { eksporter, MARKOER_FORMAT } from "./eksporter";
import { genkend, læsArkmodel, sammenlign, type Forskel, type Ændring } from "./genkend";
import { hentEksportkilde, hentSkabelon, type Vaerkhoved } from "./hent";
import type { Eksportkilde } from "./kort";
import { slug } from "./slug";
import { læsCeller } from "./xlsx";

/** `arkKode` = koden, et nyt værk fra arket får (modelscriptets slug af 'værkets navn' i Priser). */
export type Uploadanalyse = (
    | { art: "nyt"; grund?: string }
    | { art: "konflikt"; vaerk: Vaerkhoved; arkRevision: number }
    | { art: "anden_eksport"; vaerk: Vaerkhoved; /** Arket er i et ældre format (før appens egne faner). */ ældre?: boolean }
    | { art: "ingen_aendringer"; vaerk: Vaerkhoved; ikkeGemt?: Ændring[] }
    | { art: "revision"; vaerk: Vaerkhoved; forskel: Forskel; basis: Uint8Array }
) & { arkKode?: string };

export interface Hentere {
    kilde: (v: Vaerkhoved) => Promise<Eksportkilde>;
    skabelon: () => Promise<Uint8Array>;
}

const STANDARD: Hentere = { kilde: hentEksportkilde, skabelon: hentSkabelon };

export async function analyserUpload(bytes: Uint8Array, vaerker: readonly Vaerkhoved[], h: Hentere = STANDARD): Promise<Uploadanalyse> {
    let g;
    try { g = genkend(bytes); } catch { return { art: "nyt" }; }
    const navn = g.model.poster.get("værkets navn") ?? g.model.poster.get("Værkets navn");
    const arkKode = navn === undefined ? undefined : slug(String(navn)) || undefined;
    const ud = (a: Uploadanalyse): Uploadanalyse => (arkKode ? { ...a, arkKode } : a);
    const m = g.markering;
    if (!m) return ud({ art: "nyt" });
    const v = vaerker.find((x) => x.id.toLowerCase() === m.vaerk_id);
    if (!v) return ud({ art: "nyt", grund: `Arket er eksporteret fra værket "${m.vaerk_kode}" (revision ${m.revision}), som ikke findes her. Det uploades som et nyt værk.` });
    // Runde 14: et ark i format 2 (uden appens faner) kan ikke sammenlignes med en ny eksport; siges klart.
    if (m.format !== MARKOER_FORMAT) return ud({ art: "anden_eksport", vaerk: v, ældre: true });
    if (v.revision !== m.revision) return ud({ art: "konflikt", vaerk: v, arkRevision: m.revision });
    const basis = await eksporter(await h.kilde(v), await h.skabelon());
    if (basis.markering.sha256 !== m.sha256) return ud({ art: "anden_eksport", vaerk: v });
    const forskel = sammenlign(læsArkmodel(læsCeller(basis.bytes)), g.model);
    if (forskel.tom) return ud({ art: "ingen_aendringer", vaerk: v });
    if (!forskel.gemmes) return ud({ art: "ingen_aendringer", vaerk: v, ikkeGemt: forskel.felter });
    return ud({ art: "revision", vaerk: v, forskel, basis: basis.bytes });
}
