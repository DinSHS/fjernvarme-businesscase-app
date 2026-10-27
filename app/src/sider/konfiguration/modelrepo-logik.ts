//-----------------------------------------------------------------------
// Logikken bag kortet "Modelrepoet" og feltkilderne (runde 8, fv-trofast). Ren, testet (modelrepo.spec.ts).
//-----------------------------------------------------------------------

import { createContext } from "react";
import { afdrift, harAfdrift, koerselskilde, SPEJL_COMMIT, spejlcase, type Afdrift } from "@/lib/modelspejl";

export { afdrift, harAfdrift };
export const kort = (s: string | null | undefined) => (s ?? "").slice(0, 7);

/** Feltets værdikilde i modelrepoet: "cases/andeby.yaml:184 @ eef950a" — eller at værket afviger fra den. */
export function vaerdikilde(rod: string, sti: string, vaerdi_json: string): string | undefined {
    const c = spejlcase(rod);
    const b = c?.blade[sti];
    if (!c || !b) return undefined;
    return b[0] === vaerdi_json ? `Værdien: ${c.fil}:${b[1]} @ ${kort(SPEJL_COMMIT)}`
        : `Modelrepoet har ${b[0]} (${c.fil}:${b[1]} @ ${kort(SPEJL_COMMIT)}); værket afviger`;
}

/** Leveres af værkssiden; FeltListe viser kilden under hvert felt. */
export const VaerdikildeKontekst = createContext<(sti: string, vaerdi_json: string) => string | undefined>(() => undefined);

/** Budskabet for kortet — rent, testet. */
export function modelrepoBudskab(vaerk: { kode: string; kilde: string; revision: number; repo_commit?: string | null }, a: Afdrift | undefined, rod: string): string {
    const c = spejlcase(rod);
    if (vaerk.kilde !== "repo" || !c) {
        return c ? `Kopi af ${c.fil}; værdierne er værkets egne. ${koerselskilde(rod)}` : koerselskilde(rod);
    }
    // K8 F3: en lighedserklæring kræver en gennemført sammenligning; uden den siges det.
    if (!a) return `Værket kunne ikke sammenlignes med ${c.fil} @ ${kort(SPEJL_COMMIT)} (værdierne er ikke hentet). ${koerselskilde(rod)}`;
    const antal = a.afviger.length + a.mangler.length + a.ekstra.length;
    if (vaerk.revision > 1) {
        return `Værket er rettet i appen (revision ${vaerk.revision}): ${antal === 0 ? `alle felter er stadig ens med ${c.fil} @ ${kort(SPEJL_COMMIT)}`
            : `${antal} ${antal === 1 ? "felt afviger" : "felter afviger"} fra ${c.fil} @ ${kort(SPEJL_COMMIT)}`}; rettelser beskyttes mod genimport, `
            + `se revisionsloggen. ${koerselskilde(rod)}`;
    }
    if (!harAfdrift(a)) {
        const gl = a.gammelCommit ? ` (importeret ved ${kort(vaerk.repo_commit)}; værdierne er de samme)` : "";
        return `Værket er ${c.fil} ved den pinnede modelversion ${kort(SPEJL_COMMIT)}, felt for felt${gl}. ${koerselskilde(rod)}`;
    }
    const dele = [
        a.gammelCommit ? `importeret ved ${kort(vaerk.repo_commit)}, men appen kører modelversion ${kort(SPEJL_COMMIT)}` : undefined,
        a.afviger.length ? `${a.afviger.length} ${a.afviger.length === 1 ? "felt afviger" : "felter afviger"} fra ${c.fil} @ ${kort(SPEJL_COMMIT)}` : undefined,
        a.mangler.length ? `${a.mangler.length} mangler` : undefined,
        a.ekstra.length ? `${a.ekstra.length} findes ikke længere i casen` : undefined,
    ].filter(Boolean);
    return `Værket følger ikke modelrepoet: ${dele.join("; ")}. Genimportér værkerne (Fabric: notebooken fjv_importer_vaerker; lokal udgave: --demo).`;
}

