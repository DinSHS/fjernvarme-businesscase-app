//-----------------------------------------------------------------------
// Emnerne i Information-området: ét pr. side. De nummererede tekster kommer fra viden/information/*.md og
// listes i viden/emner.json (skrevet af _byg/kopier-indhold.mjs ud fra fv-ekspert's `information_sider`), så et
// nyt emne dukker op uden kodeændring. Hvilken gruppe og rækkefølge et emne har, bestemmes her; et ukendt emne
// havner i "Øvrige emner" — emner.spec.ts fejler, så det ikke sker ubemærket.
//-----------------------------------------------------------------------

import { useEffect, useState } from "react";
import { rutehref } from "@/lib/rute";
import { hentTekst } from "../dokumentation/tekster";

/** Link til et emne (og evt. et anker i det): `#/information/<emne>#<anker>`. */
export const emneHref = (id: string, anker?: string) => rutehref("information", anker ? `${id}#${anker}` : id);

export interface Emne {
    id: string;
    titel: string;
    gruppe: string;
    /** Bundtet tekst under dokumentation/indhold/. */
    fil: string;
}

export const EMNE_GRUPPER = ["Metoden", "Balancemarkedet", "Værket og tallene", "Opslag", "Øvrige emner"] as const;

/** Rækkefølge og gruppe — id'et er filnavnet uden nummer (`11_fabric_og_kapacitet.md` -> `fabric-og-kapacitet`). */
const PLAN: readonly { gruppe: (typeof EMNE_GRUPPER)[number]; ider: readonly string[] }[] = [
    { gruppe: "Metoden", ider: ["hvad-er-modellen", "varmebalance-og-unit-commitment", "el-spot-tarif-afgift", "differensmetoden", "solvergab"] },
    { gruppe: "Balancemarkedet", ider: ["balancemarkedet", "spor-a-og-b", "budstrategi"] },
    { gruppe: "Værket og tallene", ider: ["varmelast-og-nettab", "tanken", "data", "referencetal", "datadaekning", "fabric-og-kapacitet"] },
];

/** Emner uden nummereret fil: ordlisten og begrænsningerne. Titlen i navigationen er kortere end tekstens egen. */
const OPSLAG: readonly Emne[] = [
    { id: "ordliste", titel: "Ordliste", gruppe: "Opslag", fil: "viden/ordliste.md" },
    { id: "begraensninger", titel: "Kendte begrænsninger", gruppe: "Opslag", fil: "viden/begraensninger.md" },
];

export interface EmneManifest { model_commit: string; emner: { nr: number; id: string; fil: string; titel: string }[] }

export function byggEmner(m: EmneManifest): Emne[] {
    const nummererede = [...m.emner].sort((a, b) => a.nr - b.nr);
    const ud: Emne[] = [];
    for (const p of PLAN) {
        for (const id of p.ider) {
            const e = nummererede.find((x) => x.id === id);
            if (e) ud.push({ id, titel: e.titel, gruppe: p.gruppe, fil: `viden/${e.fil}` });
        }
    }
    const kendte = new Set(PLAN.flatMap((p) => p.ider));
    for (const e of nummererede) if (!kendte.has(e.id)) ud.push({ id: e.id, titel: e.titel, gruppe: "Øvrige emner", fil: `viden/${e.fil}` });
    // Opslag står til sidst, men før "Øvrige emner" skal ikke ændre rækkefølgen af nye emner: de står efter opslagene.
    const øvrige = ud.filter((e) => e.gruppe === "Øvrige emner");
    return [...ud.filter((e) => e.gruppe !== "Øvrige emner"), ...OPSLAG, ...øvrige];
}

export function emneFraId(emner: readonly Emne[], id: string | undefined): Emne | undefined {
    return emner.find((e) => e.id === id);
}

export function gruppeInddelt(emner: readonly Emne[]): { gruppe: string; emner: Emne[] }[] {
    return EMNE_GRUPPER.map((g) => ({ gruppe: g, emner: emner.filter((e) => e.gruppe === g) })).filter((g) => g.emner.length > 0);
}

export interface EmneTilstand { emner?: Emne[]; fejl?: Error }

/** Emnerne, indlæst fra manifestet. `{}` = under indlæsning. */
export function useEmner(): EmneTilstand {
    const [svar, setSvar] = useState<EmneTilstand>({});
    useEffect(() => {
        let annulleret = false;
        hentTekst("viden/emner.json").then(
            (rå) => { if (!annulleret) setSvar({ emner: byggEmner(JSON.parse(rå) as EmneManifest) }); },
            (fejl: unknown) => { if (!annulleret) setSvar({ fejl: fejl instanceof Error ? fejl : new Error(String(fejl)) }); },
        );
        return () => { annulleret = true; };
    }, []);
    return svar;
}
