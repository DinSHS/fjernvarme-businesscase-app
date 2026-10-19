//-----------------------------------------------------------------------
// React-hooks over databasen — den API sideagenterne bygger på (se AGENTS.md).
//
// Hver hook: { data, fejl, indlæser, genindlæs }. Data er normaliseret og
// komplet (pagineret). En hook med et tomt id (undefined) henter ingenting.
// Ingen hook poller — undtagen useKoerselStatus, og kun efter §6-reglen.
//-----------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FjvSchema } from "../../../rayfin/data/schema";
import { berigFejl } from "@/backend/fejl";
import { læs, læsÉn } from "./laes";
import { POLL_MS, erAktiv } from "./koersel-status";
import { useOpdateringsVersion } from "./opdatering";
import { hentDmiTemperatur, hentKildeYaml, hentTidsserie } from "./skriv";
import { MOTOR_ID } from "../../../rayfin/data/fjv.constants";

export interface Hentet<T> {
    /** Seneste svar for denne nøgle. Under en genindlæsning vises det forrige svar, til det nye er der. */
    data: T | undefined;
    fejl: Error | undefined;
    indlæser: boolean;
    genindlæs: () => void;
}

interface Svar<T> { stempel: string; data?: T; fejl?: Error }

/**
 * Generisk: henter med `hent` når `nøgle` ændres, når der trykkes "Opdatér"
 * (`opdaterAlt`), eller når `genindlæs()` kaldes; `nøgle = null` = hent ikke.
 * Et svar der kommer efter, at nøglen er skiftet, kasseres.
 */
export function useHent<T>(nøgle: string | null, hent: () => Promise<T>): Hentet<T> {
    const version = useOpdateringsVersion();
    const [runde, setRunde] = useState(0);
    const [svar, setSvar] = useState<Svar<T> & { nøgle: string | null }>({ stempel: "", nøgle: null });
    const hentRef = useRef(hent);
    useEffect(() => { hentRef.current = hent; });

    const stempel = `${nøgle}|${version}|${runde}`;
    useEffect(() => {
        if (nøgle === null) return;
        let annulleret = false;
        hentRef.current().then(
            (data) => { if (!annulleret) setSvar({ stempel, nøgle, data }); },
            async (e) => { const fejl = await berigFejl(e); if (!annulleret) setSvar({ stempel, nøgle, fejl }); },
        );
        return () => { annulleret = true; };
    }, [nøgle, stempel]);

    const genindlæs = useCallback(() => setRunde((r) => r + 1), []);
    const sammeNøgle = nøgle !== null && svar.nøgle === nøgle;
    return {
        data: sammeNøgle ? svar.data : undefined,
        fejl: sammeNøgle && svar.stempel === stempel ? svar.fejl : undefined,
        indlæser: nøgle !== null && svar.stempel !== stempel,
        genindlæs,
    };
}

type R<E extends keyof FjvSchema> = FjvSchema[E];

// ------------------------------------------------------------------ værker

export function useVaerker(medArkiverede = false): Hentet<R<"Vaerk">[]> {
    return useHent(`vaerker:${medArkiverede}`, () =>
        læs("Vaerk", { filter: medArkiverede ? undefined : { arkiveret: { eq: false } }, sortering: { navn: "asc" } }));
}

export function useVaerk(id: string | undefined): Hentet<R<"Vaerk"> | null> {
    return useHent(id ? `vaerk:${id}` : null, () => læsÉn("Vaerk", id!));
}

/** Alle værkets blade, i kildefilens rækkefølge. */
export function useVaerkParametre(vaerkId: string | undefined): Hentet<R<"VaerkParameter">[]> {
    return useHent(vaerkId ? `parametre:${vaerkId}` : null, () =>
        læs("VaerkParameter", { filter: { vaerk_id: { eq: vaerkId } }, sortering: { raekkefoelge: "asc" } }));
}

/** Revisionsloggen, nyeste først. */
export function useAendringslog(vaerkId: string | undefined): Hentet<R<"Aendringslog">[]> {
    return useHent(vaerkId ? `log:${vaerkId}` : null, () =>
        læs("Aendringslog", { filter: { vaerk_id: { eq: vaerkId } }, sortering: { tidspunkt: "desc" } }));
}

export function useAendringsanmodninger(vaerkId: string | undefined): Hentet<R<"Aendringsanmodning">[]> {
    return useHent(vaerkId ? `anmodninger:${vaerkId}` : null, () =>
        læs("Aendringsanmodning", { filter: { vaerk_id: { eq: vaerkId } }, sortering: { anmodet: "desc" } }));
}

/** Værkets oprindelige YAML fra lakehouset (via Function). `data.ok === false` + `data.fejl` hvis den ikke findes. */
export function useKildeYaml(vaerkId: string | undefined) {
    return useHent(vaerkId ? `kildeyaml:${vaerkId}` : null, () => hentKildeYaml(vaerkId!));
}

// ------------------------------------------------------------------ tidsserier og værksark (KONTRAKT §6d)

/**
 * Værkets tidsserier (alle statusser), nyeste upload først. `rolle` filtrerer. Højst én er `aktiv` pr. rolle —
 * håndhævet af backend, men læsevejen skal TÅLE to (vis det, som `Afdelingsstamdata`-mønstret).
 */
export function useTidsserier(vaerkId: string | null | undefined, rolle?: "varmelast" | "solprofil"): Hentet<R<"Tidsserie">[]> {
    return useHent(vaerkId ? `tidsserier:${vaerkId}:${rolle ?? "alle"}` : null, () => læs("Tidsserie", {
        filter: { and: [{ vaerk_id: { eq: vaerkId } }, ...(rolle ? [{ rolle: { eq: rolle } }] : [])] },
        sortering: { uploadet: "desc" },
    }));
}

/**
 * Tidsserier efter id (fx de frosne `_koersel.tidsserie.<rolle>.id` i et sæt kørsler). Tom liste = intet kald.
 * En slettet række mangler bare i svaret — vis da det frosne sha256. (fv-analyse2, ønske 2.)
 */
export function useTidsserierEfterId(ider: readonly string[]): Hentet<R<"Tidsserie">[]> {
    const ids = [...new Set(ider)].sort();
    return useHent(ids.length ? `tidsserier-id:${ids.join(",")}` : null, async () => {
        const ud: R<"Tidsserie">[] = [];
        for (const del of iBidder(ids)) ud.push(...await læs("Tidsserie", { filter: { or: del.map((id) => ({ id: { eq: id } })) } }));
        return ud;
    });
}

export function useTidsserie(id: string | null | undefined): Hentet<R<"Tidsserie"> | null> {
    return useHent(id ? `tidsserie:${id}` : null, () => læsÉn("Tidsserie", id!));
}

/** En GYLDIG tidsseries værdier (Function `hentTidsserie`): `{ ok, start, oploesning, vaerdier }`, null i huller. */
export function useTidsseriedata(id: string | null | undefined, vindue: { fra?: string; til?: string } = {}) {
    return useHent(id ? `tidsseriedata:${id}:${vindue.fra ?? ""}:${vindue.til ?? ""}` : null, () => hentTidsserie(id!, vindue));
}

/** DMI-temperatur (rå, hour_utc) for et område og en periode (ÅÅÅÅ-MM-DD, højst 366 døgn) — til målt mod syntetisk. */
export function useDmiTemperatur(omraade: string | null | undefined, fra: string | null | undefined, til: string | null | undefined, kolonne = "temp_mean_past1h") {
    return useHent(omraade && fra && til ? `dmi:${omraade}:${fra}:${til}:${kolonne}` : null, () => hentDmiTemperatur(omraade!, fra!, til!, kolonne));
}

/** Værksark-importer, nyeste først. */
export function useVaerksarkimporter(): Hentet<R<"Vaerksarkimport">[]> {
    return useHent("vaerksarkimporter", () => læs("Vaerksarkimport", { sortering: { uploadet: "desc" } }));
}

export function useVaerksarkimport(id: string | null | undefined): Hentet<R<"Vaerksarkimport"> | null> {
    return useHent(id ? `vaerksarkimport:${id}` : null, () => læsÉn("Vaerksarkimport", id!));
}

// ------------------------------------------------------------------ scenarier

export function useScenarier(vaerkId?: string, medArkiverede = false): Hentet<R<"Scenarie">[]> {
    return useHent(`scenarier:${vaerkId ?? "alle"}:${medArkiverede}`, () => {
        const og = [
            ...(vaerkId ? [{ vaerk_id: { eq: vaerkId } }] : []),
            ...(medArkiverede ? [] : [{ arkiveret: { eq: false } }]),
        ];
        return læs("Scenarie", { filter: og.length ? { and: og } : undefined, sortering: { oprettet: "desc" } });
    });
}

export function useScenarie(id: string | undefined): Hentet<R<"Scenarie"> | null> {
    return useHent(id ? `scenarie:${id}` : null, () => læsÉn("Scenarie", id!));
}

export function useScenarieAendringer(scenarieId: string | undefined): Hentet<R<"ScenarieAendring">[]> {
    return useHent(scenarieId ? `scenarieaendringer:${scenarieId}` : null, () =>
        læs("ScenarieAendring", { filter: { scenarie_id: { eq: scenarieId } }, sortering: { raekkefoelge: "asc" } }));
}

/** Deler en id-liste i bidder, så et OR-filter ikke bliver uendeligt langt. */
function iBidder<T>(xs: readonly T[], n = 50): T[][] {
    const ud: T[][] = [];
    for (let i = 0; i < xs.length; i += n) ud.push(xs.slice(i, i + n));
    return ud;
}

/** Ændringerne for flere scenarier i ét (pagineret) kald pr. 50 id'er. Rækkefølge: raekkefoelge. */
export function useScenarieAendringerFor(scenarieIds: readonly string[] | undefined): Hentet<R<"ScenarieAendring">[]> {
    const ids = scenarieIds ? [...new Set(scenarieIds)].sort() : undefined;
    return useHent(ids ? `scenarieaendringer-for:${ids.join(",")}` : null, async () => {
        const ud: R<"ScenarieAendring">[] = [];
        for (const del of iBidder(ids!)) {
            ud.push(...await læs("ScenarieAendring", { filter: { or: del.map((id) => ({ scenarie_id: { eq: id } })) }, sortering: { raekkefoelge: "asc" } }));
        }
        return ud;
    });
}

/**
 * Alle scenarie-ændringer på et værk (også arkiverede scenarier), parret med deres scenarie — fx til at
 * advare, før en enhed fjernes, som et scenarie stadig slår til/fra eller sætter værdier på.
 */
export function useScenarieAendringerForVaerk(vaerkId: string | undefined): Hentet<{ scenarie: R<"Scenarie">; aendring: R<"ScenarieAendring"> }[]> {
    return useHent(vaerkId ? `scenarieaendringer-vaerk:${vaerkId}` : null, async () => {
        const scenarier = await læs("Scenarie", { filter: { vaerk_id: { eq: vaerkId } } });
        const efterId = new Map(scenarier.map((s) => [s.id, s]));
        const ud: { scenarie: R<"Scenarie">; aendring: R<"ScenarieAendring"> }[] = [];
        for (const del of iBidder(scenarier.map((s) => s.id))) {
            for (const a of await læs("ScenarieAendring", { filter: { or: del.map((id) => ({ scenarie_id: { eq: id } })) } })) {
                const s = efterId.get(a.scenarie_id);
                if (s) ud.push({ scenarie: s, aendring: a });
            }
        }
        return ud;
    });
}

export interface Objekttal { enheder: number; enhederTil: number; lagre: number; lagreTil: number }

/** Ren optælling af enheder/lagre ud fra blade (testet). En enhed uden `enabled`-blad tæller som slået til. */
export function tælObjekter(blade: readonly Pick<R<"VaerkParameter">, "vaerk_id" | "sektion" | "objekt" | "sti" | "vaerdi_json">[]): Map<string, Objekttal> {
    const objekter = new Map<string, Map<string, { sektion: string; til: boolean }>>();
    for (const b of blade) {
        if ((b.sektion !== "units" && b.sektion !== "storage") || !b.objekt) continue;
        const pr = objekter.get(b.vaerk_id) ?? objekter.set(b.vaerk_id, new Map()).get(b.vaerk_id)!;
        const nøgle = `${b.sektion}:${b.objekt}`;
        const o = pr.get(nøgle) ?? pr.set(nøgle, { sektion: b.sektion, til: true }).get(nøgle)!;
        if (b.sti === `${b.sektion}.${b.objekt}.enabled`) o.til = b.vaerdi_json.trim() !== "false";
    }
    const ud = new Map<string, Objekttal>();
    for (const [v, pr] of objekter) {
        const t: Objekttal = { enheder: 0, enhederTil: 0, lagre: 0, lagreTil: 0 };
        for (const o of pr.values()) {
            if (o.sektion === "units") { t.enheder++; if (o.til) t.enhederTil++; } else { t.lagre++; if (o.til) t.lagreTil++; }
        }
        ud.set(v, t);
    }
    return ud;
}

/** Enheder og lagre pr. værk (til/i alt) for alle værker — ét pagineret kald over units/storage-bladene. */
export function useObjekttal(): Hentet<Map<string, Objekttal>> {
    return useHent("objekttal", async () => tælObjekter(await læs("VaerkParameter", {
        filter: { or: [{ sektion: { eq: "units" } }, { sektion: { eq: "storage" } }] },
    })));
}

// ------------------------------------------------------------------ kørsler

export interface KørselsFilter { vaerkId?: string; scenarieId?: string; status?: string[] }

/** Kørsler, nyeste bestilling først. `null` = hent ikke (fx når der ingen reference er). */
export function useKoersler(filter: KørselsFilter | null = {}): Hentet<R<"Koersel">[]> {
    const f = filter ?? {};
    const nøgle = filter === null ? null : `koersler:${f.vaerkId ?? ""}:${f.scenarieId ?? ""}:${(f.status ?? []).join(",")}`;
    return useHent(nøgle, () => {
        const og = [
            ...(f.vaerkId ? [{ vaerk_id: { eq: f.vaerkId } }] : []),
            ...(f.scenarieId ? [{ scenarie_id: { eq: f.scenarieId } }] : []),
            ...(f.status?.length ? [{ or: f.status.map((s) => ({ status: { eq: s } })) }] : []),
        ];
        return læs("Koersel", { filter: og.length ? { and: og } : undefined, sortering: { bestilt: "desc" } });
    });
}

/**
 * Regnemotorens tilstand (KONTRAKT §6c): de model-/data-pins en NY kørsel vil få frosset, og hvornår et
 * arbejderjob sidst blev startet. `null` før motoren har registreret sig.
 */
export function useMotor(): Hentet<R<"Motor"> | null> {
    return useHent("motor", () => læsÉn("Motor", MOTOR_ID));
}

export function useKoersel(id: string | undefined): Hentet<R<"Koersel"> | null> {
    return useHent(id ? `koersel:${id}` : null, () => læsÉn("Koersel", id!));
}

/** Det frosne input for én kørsel. */
export function useKoerselInput(koerselId: string | undefined): Hentet<R<"KoerselInput">[]> {
    return useHent(koerselId ? `input:${koerselId}` : null, () =>
        læs("KoerselInput", { filter: { koersel_id: { eq: koerselId } }, sortering: { sti: "asc" } }));
}

export function useNoegletal(koerselId: string | undefined): Hentet<R<"KoerselNoegletal">[]> {
    return useHent(koerselId ? `noegletal:${koerselId}` : null, () =>
        læs("KoerselNoegletal", { filter: { koersel_id: { eq: koerselId } } }));
}

/** Månedsrækker inkl. `periode`-rækken (brug den til totaler — summér aldrig viste celler). */
export function useMaaneder(koerselId: string | undefined): Hentet<R<"KoerselMaaned">[]> {
    return useHent(koerselId ? `maaneder:${koerselId}` : null, () =>
        læs("KoerselMaaned", { filter: { koersel_id: { eq: koerselId } }, sortering: { maaned: "asc" } }));
}

/**
 * Intervaldispatch i et vindue [fra, til). ALTID med vindue (KONTRAKT §3.10) —
 * hooken nægter et vindue over 31 døgn, så ingen side kommer til at hente et helt år.
 */
export const MAKS_VINDUE_DOEGN = 31;
export function useTimer(koerselId: string | undefined, fra: Date | undefined, til: Date | undefined): Hentet<R<"KoerselTime">[]> {
    const gyldigt = !!(koerselId && fra && til && til > fra);
    const nøgle = gyldigt ? `timer:${koerselId}:${fra!.toISOString()}:${til!.toISOString()}` : null;
    return useHent(nøgle, async () => {
        if ((til!.getTime() - fra!.getTime()) / 86_400_000 > MAKS_VINDUE_DOEGN) {
            throw new Error(`Tidsvinduet er for langt (højst ${MAKS_VINDUE_DOEGN} døgn ad gangen).`);
        }
        return læs("KoerselTime", {
            filter: { and: [{ koersel_id: { eq: koerselId } }, { tid: { gte: fra } }, { tid: { lt: til } }] },
            sortering: { tid: "asc" },
            sidestørrelse: 1000,
        });
    });
}

// ------------------------------------------------------------------ statusopdatering

const abonnérSynlighed = (l: () => void) => {
    document.addEventListener("visibilitychange", l);
    return () => document.removeEventListener("visibilitychange", l);
};

function useFaneSynlig(): boolean {
    return useSyncExternalStore(abonnérSynlighed, () => document.visibilityState === "visible", () => true);
}

/**
 * Holder de viste kørsler opdaterede efter §6: genlæser KUN de aktive rækker,
 * højst hvert 20. sekund, kun mens fanen er synlig. Når ingen er aktive,
 * stopper den helt. Returnerer kørslerne med de friske rækker flettet ind.
 */
export function useKoerselStatus(koersler: readonly R<"Koersel">[] | undefined): R<"Koersel">[] {
    const [friske, setFriske] = useState<Map<string, R<"Koersel">>>(new Map());
    const synlig = useFaneSynlig();

    const flettet = useMemo(() => (koersler ?? []).map((k) => friske.get(k.id) ?? k), [koersler, friske]);
    const aktive = useMemo(() => flettet.filter((k) => erAktiv(k.status)).map((k) => k.id), [flettet]);
    const aktivNøgle = aktive.join(",");

    useEffect(() => {
        if (!synlig || !aktivNøgle) return;
        const ids = aktivNøgle.split(",");
        // setInterval med POLL_MS ER 20-sekunders-loftet; skalPolle (koersel-status.ts) beskriver reglen og er testet.
        const tik = window.setInterval(async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const rækker = await læs("Koersel", { filter: { or: ids.map((id) => ({ id: { eq: id } })) } });
                setFriske((m) => { const n = new Map(m); for (const r of rækker) n.set(r.id, r); return n; });
            } catch { /* næste tik prøver igen; fejlen vises ikke som et sidebrud */ }
        }, POLL_MS);
        return () => window.clearInterval(tik);
    }, [synlig, aktivNøgle]);

    return flettet;
}
