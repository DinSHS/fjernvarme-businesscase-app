//-----------------------------------------------------------------------
// Modelrepoets solprofiler, hvis hash i appens normaliserede form er MÅLT (tredje rettelsesrunde i runde 15, P2-4).
//
// En Andeby-kørsel kan have sin solprofil på to måder, som er SAMME fil:
//   * enheden læser casens egen profilsti (`units.solvarme.production_profile_path: data/solar_andeby_dmi_karup.csv`)
//     — alle kørsler fra før runde 15;
//   * samme fil er registreret som værkets tidsserie ved importen (fabric/fjv/tidsserie_db.py ›
//     registrer_repo_tidsserier) og frosset som `_koersel.tidsserie.solprofil = {id, sha256}`.
// Sammenligningen holdt "værkets egen profil" op mod en seriehash og kunne ikke afgøre parret. De to er samme kilde,
// når den frosne STI og kørslens MODELVERSION beviser det: filen er den samme git-blob ved de oplyste versioner, og
// dens hash i normaliseret form er målt (viden/referencetal.json › solprofil_sti, solprofil_sha256,
// solprofil_model_commits; fabric/tests/test_tidsserier.py holder alle tre op mod modelrepoet).
//
// Tallene står kun ét sted: i viden/referencetal.json, som `sammensaetning.data.ts` er genereret af.
//-----------------------------------------------------------------------

import { README_REFERENCER_JSON } from "./sammensaetning.data";

interface RepoProfil { sti: string; sha256: string; model_commits: readonly string[] }

let _profiler: RepoProfil[] | undefined;
function profiler(): RepoProfil[] {
    if (_profiler) return _profiler;
    const ud: RepoProfil[] = [];
    try {
        const rå = JSON.parse(README_REFERENCER_JSON) as { grupper?: { referencer?: { solprofil_sti?: unknown; solprofil_sha256?: unknown; solprofil_model_commits?: unknown }[] }[] };
        for (const g of rå.grupper ?? []) {
            for (const r of g.referencer ?? []) {
                const commits = Array.isArray(r.solprofil_model_commits) ? r.solprofil_model_commits.filter((c): c is string => typeof c === "string" && /^[0-9a-f]{40}$/.test(c)) : [];
                if (typeof r.solprofil_sti !== "string" || typeof r.solprofil_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(r.solprofil_sha256) || commits.length === 0) continue;
                ud.push({ sti: r.solprofil_sti, sha256: r.solprofil_sha256, model_commits: commits });
            }
        }
    } catch { /* ulæselig data: ingen profil er kendt, og dommen forbliver "kan ikke afgøres" */ }
    return (_profiler = ud);
}

/**
 * Den målte hash (normaliseret form) af modelrepoets profilfil `sti` ved modelversionen `model_commit` — eller `null`,
 * når filen ikke er målt ved netop den version. Siger to referencer noget forskelligt om samme fil og version, er
 * intet bevist (`null`).
 */
export function kendtRepoProfil(sti: string, model_commit: string | null | undefined): string | null {
    const m = model_commit?.trim().toLowerCase();
    if (!m) return null;
    const fundet = new Set(profiler().filter((p) => p.sti === sti && p.model_commits.includes(m)).map((p) => p.sha256.toLowerCase()));
    return fundet.size === 1 ? [...fundet][0] : null;
}
