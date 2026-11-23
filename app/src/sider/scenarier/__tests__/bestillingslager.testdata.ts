// Databasen i det små til testene af bestillingsforløbet (tredje rettelsesrunde i runde 15, P2-1 og P2-2).
//
// Som den rigtige: `Bestilling.klient_noegle` er unik, `Koersel.bestilling_id` er unik (højst én kørsel pr.
// bestilling), og `startBestilling` er idempotent på bestillingen. Kørslen FRYSER scenariets indhold, som det er, når
// `startBestilling` første gang når serveren — det er det, P2-1 handler om. `svar(nr, kørsel)` bestemmer, hvad
// KLIENTEN får at se for kald nr. `nr`; kørslen er da allerede committet, præcis som når svaret går tabt på vejen hjem.
import { KildeFejl } from "@/lib/data/kilde";
import { sætSkriveKilde, type SkriveKilde } from "@/lib/data/skriv";

export type Svar = Record<string, unknown>;

export interface Lager {
    bestillinger: { id: string; scenarie_id: string; klient_noegle: string; bestilt_af: string }[];
    scenarier: string[];
    /** bestilling -> kørsel */
    kørsler: Map<string, string>;
    /** kørsel -> det indhold, scenariet havde, da kørslen blev frosset */
    frosset: Map<string, string>;
    /** Scenariets indhold lige nu (testen "redigerer" ved at sætte det). */
    indhold: { nu: string };
    /** Antal opslag på Bestilling (klientnøglen). */
    opslag: { antal: number };
}

export function lager(
    svar: (nr: number, kørsel: string) => Svar | Error,
    valg: {
        /** Fejler opslag nr. `nr` på klientnøglen teknisk (P2-2: et kort netværksudfald) — eller svarer det `"tomt"`? */
        opslagFejler?: (nr: number) => Error | "tomt" | undefined;
        /** Kaster `startBestilling` kald nr. `nr` — FØR serveren har rørt noget? */
        kaldFejlerFør?: (nr: number) => Error | undefined;
    } = {},
): Lager {
    const l: Lager = { bestillinger: [], scenarier: [], kørsler: new Map(), frosset: new Map(), indhold: { nu: "A" }, opslag: { antal: 0 } };
    let kald = 0;
    const ingen = async () => ({});
    const spørg = <T,>(rækker: () => T[], tæl?: () => Error | "tomt" | undefined) => () => {
        let filter: Record<string, { eq: string }> = {};
        const q = {
            where(f: typeof filter) { filter = f; return q; }, orderBy() { return q; }, first() { return q; }, after() { return q; },
            async executePaginated() {
                const fejl = tæl?.();
                if (fejl === "tomt") return { items: [], hasNextPage: false };
                if (fejl) throw fejl;
                const items = rækker().filter((r) => Object.entries(filter).every(([k, v]) => (r as Record<string, unknown>)[k] === v.eq));
                return { items, hasNextPage: false };
            },
        };
        return q;
    };
    const kilde: SkriveKilde = {
        data: {
            Scenarie: { create: async () => { l.scenarier.push(`s${l.scenarier.length + 1}`); return { id: l.scenarier.at(-1) }; }, update: ingen, delete: ingen },
            Bestilling: {
                create: async (r: { scenarie_id: string; klient_noegle: string; bestilt_af: string }) => {
                    if (l.bestillinger.some((b) => b.klient_noegle === r.klient_noegle)) throw new KildeFejl("unik", "Findes allerede (samme nøgle).", 409);
                    const b = { id: `b${l.bestillinger.length + 1}`, scenarie_id: r.scenarie_id, klient_noegle: r.klient_noegle, bestilt_af: r.bestilt_af };
                    l.bestillinger.push(b);
                    return b;
                },
                update: ingen, delete: ingen,
                select: spørg(() => l.bestillinger, () => { l.opslag.antal += 1; return valg.opslagFejler?.(l.opslag.antal); }),
            },
            Koersel: {
                create: ingen, update: ingen, delete: ingen,
                select: spørg(() => [...l.kørsler].map(([bestilling_id, id]) => ({ id, bestilling_id }))),
            },
        } as unknown as SkriveKilde["data"],
        functions: {
            startBestilling: {
                invoke: async (i: { bestillingId: string }) => {
                    kald += 1;
                    const før = valg.kaldFejlerFør?.(kald);
                    if (før) throw før;
                    if (!l.kørsler.has(i.bestillingId)) {                                              // committet
                        const k = `k${l.kørsler.size + 1}`;
                        l.kørsler.set(i.bestillingId, k);
                        l.frosset.set(k, l.indhold.nu);
                    }
                    const s = svar(kald, l.kørsler.get(i.bestillingId)!);
                    if (s instanceof Error) throw s;
                    return s;
                },
            },
        } as unknown as SkriveKilde["functions"],
    };
    sætSkriveKilde(() => kilde);
    return l;
}

export const ok = (kørsel: string): Svar => ({ ok: true, koersel_id: kørsel, status: "koe", ny: true, arbejder: { startet: true, grund: "" } });
export const TABT = new Error("Failed to fetch");
export const TEKNISK: Svar = { ok: false, afvist: "Teknisk fejl i startBestilling: forbindelsen døde", teknisk: true };
export const UAFKLARET = /Vi ved ikke, om .* blev bestilt — prøv igen/;
