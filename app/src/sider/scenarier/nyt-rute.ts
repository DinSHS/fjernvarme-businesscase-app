//-----------------------------------------------------------------------
// Ruten til "Nyt scenarie fra et spørgsmål" — også for links fra andre områder:
//
//   #/scenarier/nyt/<værkskode>/<knap-id>/<periode>
//
// <periode> er en af:
//   helaar | vinter | sommer   et af knapper.json's faste vinduer (fundet på navnet, ikke på indekset)
//   vaerk                      værkets egen time-blok
//   ÅÅÅÅ-MM-DD_ÅÅÅÅ-MM-DD      egne datoer (inklusive)
// Mangler segmentet, er standarden vintervinduet (som før). Et ukendt segment
// afvises synligt og falder tilbage til standarden (K4-F8).
//
// Brug `nytScenarieHref` til at bygge linket, så formen kun står ét sted.
//-----------------------------------------------------------------------

import { rutehref } from "@/lib/rute";
import { FASTE_VINDUER } from "./viden.data";

export type Periodevalg = { type: "vindue"; i: number } | { type: "vaerk" } | { type: "egen"; start: string; slut: string };

export type PeriodeId = "helaar" | "vinter" | "sommer" | "vaerk" | `${string}_${string}`;

/** De faste vinduer findes på navnet, så en ny rækkefølge i knapper.json ikke flytter linkene. */
const VINDUE_NAVN: Record<string, RegExp> = { helaar: /^Rullende år/, vinter: /^Vintervindue/, sommer: /^Sommervindue/ };

function vindue(id: keyof typeof VINDUE_NAVN): number {
    return FASTE_VINDUER.findIndex((v) => VINDUE_NAVN[id].test(v.navn));
}

const STANDARD: Periodevalg = { type: "vindue", i: Math.max(0, vindue("vinter")) };

function gyldigDato(s: string): boolean {
    const t = Date.parse(`${s}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Periodesegmentet fra ruten -> periodevalget på siden. */
export function periodeFraRute(seg: string | undefined): { valg: Periodevalg; ugyldig?: string } {
    if (!seg) return { valg: STANDARD };
    if (seg === "vaerk") return { valg: { type: "vaerk" } };
    if (seg in VINDUE_NAVN) {
        const i = vindue(seg);
        if (i >= 0) return { valg: { type: "vindue", i } };
        return { valg: STANDARD, ugyldig: `Vinduet "${seg}" findes ikke i knapper.json; vintervinduet er valgt i stedet.` };
    }
    const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(seg);
    if (m && gyldigDato(m[1]) && gyldigDato(m[2]) && m[1] <= m[2]) return { valg: { type: "egen", start: m[1], slut: m[2] } };
    return { valg: STANDARD, ugyldig: `Linket angav perioden "${seg}", som ikke kan læses; vintervinduet er valgt i stedet.` };
}

/** Periodevalget -> scenariets periodefelter (ISO-datoer; null = værkets egen periode). */
export function periodeFelter(p: Periodevalg): { start: string | null; slut: string | null } {
    if (p.type === "vindue") return { start: FASTE_VINDUER[p.i].periode_start, slut: FASTE_VINDUER[p.i].periode_slut };
    if (p.type === "egen") return { start: p.start || null, slut: p.slut || null };
    return { start: null, slut: null };
}

/** `#/scenarier/nyt/<værk>[/<knap>[/<periode>]]` — fx "Bestil helårskørsel": nytScenarieHref(kode, knap, "helaar"). */
export function nytScenarieHref(vaerkKode: string, knap?: string, periode?: PeriodeId): string {
    return rutehref("scenarier", "nyt", vaerkKode, ...(knap ? [knap] : periode ? ["-"] : []), ...(periode ? [periode] : []));
}
