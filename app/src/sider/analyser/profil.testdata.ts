// Testdata: en frossen sammenligningsprofil, der er direkte sammenlignelig med sig selv.
//
// Efterprøvningen af rettelserne i runde 15, fund E: ALLE kort på sammenligningssiden spørger dommen
// (beregn.ts › sammenlignelighedsDom), før de viser et ΔRef eller farver det. Ældre korttests gav kortene en pakke
// uden profil; de får her den profil, to kørsler af samme værk, periode og grundlag har.
import type { Profil } from "./beregn";

export const SAMMENLIGNELIG: Profil = {
    vaerk_id: "v", vaerk_navn: "Andeby", vaerk_revision: 1, periode_start: "2026-01-05", periode_slut: "2026-01-16",
    periode_fra: "2026-01-05T00:00:00.000Z", periode_til: "2026-01-16T23:00:00.000Z", oploesning: "1h",
    data_commit: "106b9fce9a2e3610090b1a542559024056449b88", model_commit: "939228aa048563c8498382a79d207c8b03fbda57",
    rel_gap: 0.0002, abs_gap: 100, med_balancering: false, miljoe: null,
    varmelast: { art: "standard", valg: "ukendt" }, solprofil: { art: "standard", valg: "arvet" },
};
