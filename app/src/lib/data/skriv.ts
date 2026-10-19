//-----------------------------------------------------------------------
// Skrivninger — den ENESTE vej fra UI'et til databasen (KONTRAKT v2 §3.0, §6).
//
// Klienten må kun oprette en anmodning/bestilling i sit EGET navn (DAB-
// policy på e-mail) og kalde en Function, der gør resten som app-ejeren i én
// SQL-transaktion. Værker, parametre, revisionslog og kørsler kan klienten
// slet ikke skrive — mutationerne findes ikke i GraphQL-skemaet.
//
// Scenarier og deres ændringer skrives direkte (klient-CRUD), men oprettelse
// kræver også her egen e-mail.
//-----------------------------------------------------------------------

import { hentDataKilde } from "@/backend/data";
import { KildeFejl } from "./kilde";
import { MAKS, MAKS_TIDSSERIE_BYTES, MAKS_VAERKSARK_BYTES, RESERVEREDE_KODER } from "../../../rayfin/data/fjv.constants";
import type { Scenarie } from "../../../rayfin/data/Scenarie";
import type { ScenarieAendring } from "../../../rayfin/data/ScenarieAendring";
import type { AppFunctionsSchema } from "../../../rayfin/functions/src/types";

type Ud<F extends keyof AppFunctionsSchema> = AppFunctionsSchema[F]["output"];

/** Den del af klienten skriv.ts bruger — strukturelt, så den kan erstattes i tests. */
export interface SkriveKilde {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, { create(input: any): Promise<any>; update(where: any, data: any): Promise<any>; delete(where: any): Promise<any> }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    functions: Record<string, { invoke(input?: any, opts?: any): Promise<any> }>;
}

let kilde: () => SkriveKilde = () => hentDataKilde() as unknown as SkriveKilde;
export function sætSkriveKilde(k: (() => SkriveKilde) | null): void {
    kilde = k ?? (() => hentDataKilde() as unknown as SkriveKilde);
}

/** En skrivning der blev afvist af reglerne — teksten er til brugeren. */
export class Afvist extends Error {
    constructor(besked: string) { super(besked); this.name = "Afvist"; }
}

/**
 * Oversætter backendens tekniske afvisninger til dansk. DAB (rayfin) svarer med engelske tekster; rest-serveren med en
 * fejlkode + dansk besked (KildeFejl). Begge bliver den SAMME `Afvist`, så siderne ikke ser forskel — `unik` giver netop
 * "samme nøgle", som `bestilKoersel` genkender. Andre fejl gives videre uændret.
 */
export function oversætFejl(e: unknown): Error {
    if (e instanceof KildeFejl) {
        if (e.kode === "unik") return new Afvist("Findes allerede (samme nøgle).");
        if (e.kode === "policy") return new Afvist(e.message || "Serveren afviste rækken: du kan kun oprette i dit eget navn.");
        if (e.kode === "ikke_tilladt") return new Afvist(e.message || "Den ændring må appen ikke lave direkte — den skal gå gennem en anmodning.");
        if (e.kode === "ugyldig") return new Afvist(e.message);
        // findes_ikke/teknisk/netvaerk er fejl, ikke afvisninger (API.md › Fejl).
        return e;
    }
    const besked = e instanceof Error ? e.message : String(e);
    if (/Could not insert row with given values/i.test(besked)) {
        return new Afvist("Databasen afviste rækken: du kan kun oprette i dit eget navn, og sessionens e-mail passede ikke. Genindlæs appen.");
    }
    if (/same unique value already exists/i.test(besked)) return new Afvist("Findes allerede (samme nøgle).");
    if (/does not exist on the type `Mutation`/i.test(besked)) return new Afvist("Den ændring må appen ikke lave direkte — den skal gå gennem en anmodning.");
    return e instanceof Error ? e : new Error(besked);
}

async function kald<F extends keyof AppFunctionsSchema>(navn: F, input: AppFunctionsSchema[F]["input"]): Promise<Ud<F>> {
    try {
        return await kilde().functions[navn].invoke(input, { timeoutMs: 120_000 });
    } catch (e) {
        throw oversætFejl(e);
    }
}

async function opret<T>(entitet: string, række: Record<string, unknown>): Promise<T> {
    try {
        return (await kilde().data[entitet].create(række)) as T;
    } catch (e) {
        throw oversætFejl(e);
    }
}

function kræv(bruger: string | undefined): string {
    if (!bruger) throw new Afvist("Ingen bruger i sessionen — kan ikke gemme uden at kunne spore hvem.");
    return bruger;
}

// ------------------------------------------------------------------ værker

export interface Parameterændring { sti: string; handling: "opret" | "ret" | "slet"; ny_json?: string | null }

function tjekLængde(aendringer_json: string): void {
    if (aendringer_json.length > MAKS.json) {
        throw new Afvist(
            `For mange ændringer i én gem (${aendringer_json.length} af højst ${MAKS.json} tegn). Gem i flere omgange.`,
        );
    }
}

/**
 * Gemmer ændringer i et værk: opretter en Aendringsanmodning og lader
 * `udfoerAendring` udføre den i én transaktion (tjek revision, ret blade,
 * skriv revisionslog, øg revision). Ved konflikt returneres `afvist` med en
 * forklaring — intet er så ændret.
 */
export async function gemVaerksaendringer(
    vaerk: { id: string; revision: number }, ændringer: readonly Parameterændring[], bruger: string | undefined,
): Promise<Ud<"udfoerAendring">> {
    if (ændringer.length === 0) throw new Afvist("Der er ingen ændringer at gemme.");
    const set = new Set<string>();
    for (const æ of ændringer) {
        if (set.has(æ.sti)) throw new Afvist(`"${æ.sti}" er ændret to gange — fjern den ene.`);
        set.add(æ.sti);
        if (æ.ny_json && æ.ny_json.length > MAKS.json) throw new Afvist(`Værdien for ${æ.sti} er for lang (højst ${MAKS.json} tegn).`);
    }
    const aendringer_json = JSON.stringify(ændringer.map((æ) => ({ sti: æ.sti, handling: æ.handling, ...(æ.handling === "slet" ? {} : { ny_json: æ.ny_json }) })));
    tjekLængde(aendringer_json);
    const a = await opret<{ id: string }>("Aendringsanmodning", {
        vaerk_id: vaerk.id, forventet_revision: vaerk.revision, aendringer_json,
        anmodet_af: kræv(bruger), anmodet: new Date(), status: "ny",
    });
    return kald("udfoerAendring", { anmodningId: a.id });
}

/** Kopierer et værk til et nyt (kilde `app`, revision 1). */
export async function kopierVaerk(
    fra: { id: string; revision: number }, ny_kode: string, navn: string, bruger: string | undefined, beskrivelse?: string,
): Promise<Ud<"udfoerAendring">> {
    if (!/^[a-z0-9_]+$/.test(ny_kode) || ny_kode.length > MAKS.kode) {
        throw new Afvist("Koden må kun indeholde små bogstaver, cifre og _ (højst 60 tegn).");
    }
    if (RESERVEREDE_KODER.includes(ny_kode)) throw new Afvist(`Koden "${ny_kode}" er reserveret af appen — vælg en anden.`);
    const a = await opret<{ id: string }>("Aendringsanmodning", {
        vaerk_id: fra.id, forventet_revision: fra.revision,
        aendringer_json: JSON.stringify([{ handling: "kopier_vaerk", ny_kode, navn, ...(beskrivelse ? { beskrivelse } : {}) }]),
        anmodet_af: kræv(bruger), anmodet: new Date(), status: "ny",
    });
    return kald("udfoerAendring", { anmodningId: a.id });
}

/**
 * Ét blad i et nyt værk — samme felter som VaerkParameter og som `viden/nyt_vaerk_skabelon.json`, så skabelonens
 * blade kan gives direkte (ekstra felter som `obligatorisk`/`trin` sendes ikke). Værdien er JSON-kodet.
 */
export interface NytVaerkBlad { sti: string; vaerdi_json: string; bekraeft?: boolean; kommentar?: string | null }

/** Et nyt værks anmodninger har intet kildeværk; vaerk_id er påkrævet i entiteten og sættes til nil-uuid'et. */
const INTET_VAERK = "00000000-0000-0000-0000-000000000000";

/**
 * Deler bladene i `opret_vaerk_del`-anmodninger, der hver holder sig under `MAKS.json` tegn. Grådigt i
 * rækkefølge, så værkets orden bevares. Eksporteret for testen.
 */
export function delNytVaerk(udkast: string, blade: readonly NytVaerkBlad[]): string[] {
    const tekst = (nr: number, af: number, bs: readonly object[]) =>
        JSON.stringify([{ handling: "opret_vaerk_del", udkast, nr, af, blade: bs }]);
    type Del = { sti: string; ny_json: string; bekraeft?: boolean; kommentar?: string };
    const grupper: Del[][] = [[]];
    for (const b of blade) {
        // Trådformatet bruger ny_json, som de øvrige anmodninger.
        const rent = { sti: b.sti, ny_json: b.vaerdi_json, ...(b.bekraeft ? { bekraeft: true } : {}), ...(b.kommentar ? { kommentar: b.kommentar } : {}) };
        // 99/99 som pladsholder: det endelige nr/af har højst to cifre (højst 50 dele i backend).
        if (tekst(99, 99, [rent]).length > MAKS.json) throw new Afvist(`Bladet ${b.sti} er for stort til at sende (værdi + kommentar over ca. ${MAKS.json - 150} tegn).`);
        const sidste = grupper[grupper.length - 1];
        if (sidste.length && tekst(99, 99, [...sidste, rent]).length > MAKS.json) grupper.push([rent]);
        else sidste.push(rent);
    }
    if (grupper.length > 50) throw new Afvist(`Værket er for stort til at oprette (${grupper.length} dele af højst 50).`);
    return grupper.map((g, i) => tekst(i + 1, grupper.length, g));
}

/**
 * Opretter et værk fra bunden (kilde `app`, revision 1) ud fra en fuld bladliste. Bladlisten er typisk
 * 15–19 KB og overstiger Aendringsanmodningens 4000 tegn, så den sendes som N dele med samme udkast-id og til
 * sidst én `opret_vaerk`-anmodning, som `udfoerAendring` udfører i ÉN transaktion (alle dele eller intet).
 * Fejler oprettelsen af en del undervejs, kastes fejlen; de allerede sendte dele udføres aldrig alene og er
 * harmløse. Se app/AGENTS.md › "Nyt værk fra bunden".
 */
export async function opretVaerk(
    ny_kode: string, navn: string, blade: readonly NytVaerkBlad[], bruger: string | undefined, beskrivelse?: string,
): Promise<Ud<"udfoerAendring">> {
    if (!/^[a-z0-9_]+$/.test(ny_kode) || ny_kode.length > MAKS.kode) {
        throw new Afvist("Koden må kun indeholde små bogstaver, cifre og _ (højst 60 tegn).");
    }
    if (RESERVEREDE_KODER.includes(ny_kode)) throw new Afvist(`Koden "${ny_kode}" er reserveret af appen — vælg en anden.`);
    if (!navn.trim() || navn.length > MAKS.navn) throw new Afvist(`Værket skal have et navn (højst ${MAKS.navn} tegn).`);
    if (blade.length === 0) throw new Afvist("Værket har ingen parametre.");
    const set = new Set<string>();
    for (const b of blade) {
        if (set.has(b.sti)) throw new Afvist(`"${b.sti}" står to gange.`);
        set.add(b.sti);
    }
    const af = kræv(bruger);
    const udkast = crypto.randomUUID();
    const dele = delNytVaerk(udkast, blade);
    for (const aendringer_json of dele) {
        await opret("Aendringsanmodning", {
            vaerk_id: INTET_VAERK, forventet_revision: 0, aendringer_json, anmodet_af: af, anmodet: new Date(), status: "ny",
        });
    }
    const slut = JSON.stringify([{ handling: "opret_vaerk", udkast, dele: dele.length, ny_kode, navn: navn.trim(), ...(beskrivelse ? { beskrivelse } : {}) }]);
    tjekLængde(slut);
    const a = await opret<{ id: string }>("Aendringsanmodning", {
        vaerk_id: INTET_VAERK, forventet_revision: 0, aendringer_json: slut, anmodet_af: af, anmodet: new Date(), status: "ny",
    });
    return kald("udfoerAendring", { anmodningId: a.id });
}

// ------------------------------------------------------------------ kørsler

/**
 * Bestiller en kørsel af et scenarie. `klientNoegle` gør det idempotent: et
 * dobbeltklik eller et genforsøg med samme nøgle giver samme bestilling
 * (unik i databasen). Generér én nøgle pr. brugerhandling, ikke pr. forsøg.
 */
export async function bestilKoersel(
    scenarieId: string, bruger: string | undefined, klientNoegle: string = crypto.randomUUID(),
): Promise<Ud<"startBestilling">> {
    let b: { id: string };
    try {
        b = await opret<{ id: string }>("Bestilling", {
            scenarie_id: scenarieId, klient_noegle: klientNoegle, bestilt_af: kræv(bruger), bestilt: new Date(),
        });
    } catch (e) {
        if (e instanceof Afvist && /samme nøgle/.test(e.message)) {
            throw new Afvist("Bestillingen er allerede sendt — se kørselslisten.");
        }
        throw e;
    }
    return kald("startBestilling", { bestillingId: b.id });
}

export const annullerKoersel = (koerselId: string) => kald("annullerKoersel", { koerselId });

/** Afstemmer kørsler mod jobstatus og starter en arbejder ved behov (KONTRAKT §6). Kaldes ved appstart og "Opdatér". */
export const afstem = () => kald("afstem", {} as AppFunctionsSchema["afstem"]["input"]);

// ------------------------------------------------------------------ betroede læsninger

/**
 * Værkets oprindelige YAML (med kommentarer) fra lakehouset — kun til visning. Kalderen giver værkets
 * id; Function'en slår koden op selv. `ok: false` + `fejl` når der ingen kildefil er (kopierede værker).
 */
export const hentKildeYaml = (vaerkId: string) => kald("hentKildeYaml", { vaerkId });

/**
 * En gyldig tidsseries værdier: `start` (UTC, timens start) + `oploesning` + `vaerdier` (null i huller). Højst
 * 120.000 timer pr. svar; en længere serie giver `ok: false` + `positioner` — hent da et `vindue` (ISO, UTC).
 */
export const hentTidsserie = (tidsserieId: string, vindue: { fra?: string; til?: string } = {}) =>
    kald("hentTidsserie", { tidsserieId, fra: vindue.fra ?? "", til: vindue.til ?? "" });

/** DMI-temperatur rå fra df-data (samme dataversion som motoren): `{ ok, data_commit, tider (hour_utc), vaerdier }`. */
export const hentDmiTemperatur = (omraade: string, fra: string, til: string, kolonne = "temp_mean_past1h") =>
    kald("hentDmiTemperatur", { omraade, fra, til, kolonne });

// ------------------------------------------------------------------ tidsserier og værksark (KONTRAKT §6d)

/** sha256 (hex) af en tekst som UTF-8 — samme som backendens `sha256Hex`, så indholdet bindes til anmodningen. */
export async function sha256Hex(tekst: string): Promise<string> {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tekst));
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Filgrænserne er fælles for side, skrivehjælper og Function — se fjv.constants.ts (K5-F13). */
export { MAKS_TIDSSERIE_BYTES, MAKS_VAERKSARK_BYTES } from "../../../rayfin/data/fjv.constants";
const INGEN_VAERK = "00000000-0000-0000-0000-000000000000";

/** Brugerens valg ved upload — data_krav.json: tidszone, tidsstempel og enhed vælges AKTIVT (ingen forvalg). */
export interface Tidsserievalg {
    rolle: "varmelast" | "solprofil";
    /** Står tidsstemplet i filen for timens start eller slut? (repoets `--timeslut`) */
    tidsstempel: "start" | "slut";
    /** Kildens tidszone for tidsstempler UDEN offset: `UTC` eller `Europe/Copenhagen`. */
    tidszone: "UTC" | "Europe/Copenhagen";
    /** Kildens enhed: `MW`, `kW`, `MWh` eller `kWh` (de to sidste pr. interval). */
    enhed: "MW" | "kW" | "MWh" | "kWh";
    /** Værdikolonnen, når filen har flere talkolonner (ellers tolkerens valg, se info-fundet `flere_kolonner`). */
    kolonne?: string | null;
    /** Visningsnavn (standard: filnavnet). */
    navn?: string;
}

/** Bytes -> base64 i bidder (String.fromCharCode på 1 MB på én gang sprænger kaldstakken). */
export function tilBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

/**
 * Uploader en tidsserie (CSV) til et værk. Filens RÅ bytes sendes som base64, så backendens tolker selv kan
 * genkende Windows-1252 (data_krav.json › inputformat.kodning). Anmodning i brugerens navn med base64-tekstens
 * sha256 -> `uploadTidsserie`, der validerer med den fælles tolker, gemmer den normaliserede fil og rækken.
 * Svar `{ ok, status: "gyldig"|"afvist", svar, tidsserie_id, validering_json }`. En gyldig serie er IKKE aktiv —
 * aktivér den med `aktiverTidsserie`.
 */
export async function uploadTidsserie(
    vaerkId: string, fil: { navn: string; bytes: Uint8Array }, valg: Tidsserievalg, bruger: string | undefined,
): Promise<Ud<"uploadTidsserie">> {
    if (fil.bytes.byteLength === 0) throw new Afvist("Filen er tom.");
    if (fil.bytes.byteLength > MAKS_TIDSSERIE_BYTES) {
        throw new Afvist(`Filen er for stor (${Math.round(fil.bytes.byteLength / 1000)} kB; højst ${MAKS_TIDSSERIE_BYTES / 1000} kB). Send timeværdier i stedet for kvarterværdier, eller del filen op.`);
    }
    if (fil.navn.length > MAKS.filnavn) throw new Afvist(`Filnavnet er for langt (højst ${MAKS.filnavn} tegn).`);
    const base64 = tilBase64(fil.bytes);
    const a = await opret<{ id: string }>("Aendringsanmodning", {
        vaerk_id: vaerkId, forventet_revision: 0, anmodet_af: kræv(bruger), anmodet: new Date(), status: "ny",
        aendringer_json: JSON.stringify([{
            handling: "upload_tidsserie", rolle: valg.rolle, navn: (valg.navn ?? "").trim() || fil.navn, filnavn: fil.navn,
            tidsstempel: valg.tidsstempel, tidszone: valg.tidszone, enhed: valg.enhed, kolonne: valg.kolonne ?? null,
            sha256: await sha256Hex(base64),
        }]),
    });
    return kald("uploadTidsserie", { anmodningId: a.id, indholdBase64: base64 });
}

/** Gør en gyldig tidsserie til værkets aktive i sin rolle (de andre i rollen slås fra) — eller inaktiv. */
export async function aktiverTidsserie(
    vaerkId: string, tidsserieId: string, aktiv: boolean, bruger: string | undefined,
): Promise<Ud<"udfoerAendring">> {
    const a = await opret<{ id: string }>("Aendringsanmodning", {
        vaerk_id: vaerkId, forventet_revision: 0, anmodet_af: kræv(bruger), anmodet: new Date(), status: "ny",
        aendringer_json: JSON.stringify([{ handling: "aktiver_tidsserie", tidsserie_id: tidsserieId, aktiv }]),
    });
    return kald("udfoerAendring", { anmodningId: a.id });
}

/**
 * Uploader et værksark (`vaerksdata_skabelon.xlsx`) som base64. Backend gemmer filen, opretter en
 * Vaerksarkimport (`koe`) og starter importnotebooken; følg den med `useVaerksarkimport(import_id)`.
 */
export async function uploadVaerksark(
    fil: { navn: string; base64: string }, bruger: string | undefined, valg: { timeslut?: boolean | null } = {},
): Promise<Ud<"uploadVaerksark">> {
    if (!fil.base64) throw new Afvist("Filen er tom.");
    if ((fil.base64.length * 3) / 4 > MAKS_VAERKSARK_BYTES) throw new Afvist(`Værksarket er for stort (højst ${MAKS_VAERKSARK_BYTES / 1000} kB).`);
    if (!/\.xlsx$/i.test(fil.navn)) throw new Afvist("Værksarket skal være en .xlsx-fil (vaerksdata_skabelon.xlsx).");
    const a = await opret<{ id: string }>("Aendringsanmodning", {
        vaerk_id: INGEN_VAERK, forventet_revision: 0, anmodet_af: kræv(bruger), anmodet: new Date(), status: "ny",
        aendringer_json: JSON.stringify([{ handling: "upload_vaerksark", filnavn: fil.navn, timeslut: valg.timeslut ?? null, sha256: await sha256Hex(fil.base64) }]),
    });
    return kald("uploadVaerksark", { anmodningId: a.id, indholdBase64: fil.base64 });
}

// ------------------------------------------------------------------ scenarier (klient-CRUD)

export type ScenarieFelter = Omit<Scenarie, "id" | "oprettet_af" | "oprettet" | "arkiveret">;

export async function opretScenarie(felter: ScenarieFelter, bruger: string | undefined): Promise<Scenarie> {
    return opret<Scenarie>("Scenarie", { ...felter, arkiveret: false, oprettet_af: kræv(bruger), oprettet: new Date() });
}

export async function opdaterScenarie(id: string, felter: Partial<Omit<ScenarieFelter, "vaerk_id">> & { arkiveret?: boolean }): Promise<Scenarie> {
    try {
        return (await kilde().data.Scenarie.update({ id }, felter)) as Scenarie;
    } catch (e) {
        throw oversætFejl(e);
    }
}

export type ÆndringUdkast = Pick<ScenarieAendring, "type" | "sti"> & { vaerdi_json?: string | null };

/** Nøglen to ændringer ikke må dele (samme sti; til/fra-navn og set-sti er forskellige rum). */
export function ændringsnøgle(æ: ÆndringUdkast): string {
    return æ.type === "set" ? `set:${æ.sti}` : `til/fra:${æ.sti}`;
}

/**
 * Gemmer scenariets ændringsliste: sletter fjernede, retter ændrede, opretter
 * nye. Rækkefølgen bliver listens. Dubletter afvises her OG i startBestilling.
 */
export async function gemScenarieAendringer(
    scenarieId: string, eksisterende: readonly ScenarieAendring[], nye: readonly ÆndringUdkast[],
): Promise<void> {
    const set = new Set<string>();
    for (const æ of nye) {
        const n = ændringsnøgle(æ);
        if (set.has(n)) throw new Afvist(`"${æ.sti}" står to gange i scenariet — fjern den ene.`);
        set.add(n);
        if (æ.type === "set" && !æ.vaerdi_json) throw new Afvist(`"${æ.sti}" mangler en værdi.`);
    }
    const api = kilde().data.ScenarieAendring;
    const gamle = new Map(eksisterende.map((e) => [ændringsnøgle(e), e]));
    try {
        for (const e of eksisterende) if (!set.has(ændringsnøgle(e))) await api.delete({ id: e.id });
        for (const [i, æ] of nye.entries()) {
            const g = gamle.get(ændringsnøgle(æ));
            const vaerdi_json = æ.type === "set" ? æ.vaerdi_json ?? null : null;
            if (!g) await api.create({ scenarie_id: scenarieId, type: æ.type, sti: æ.sti, vaerdi_json, raekkefoelge: i + 1 });
            // `type` skal med: enable og disable på samme navn har samme nøgle (fv-scenarie fandt, at et skift ellers
            // blev gemt tavst som det gamle).
            else if (g.type !== æ.type || g.vaerdi_json !== vaerdi_json || g.raekkefoelge !== i + 1) {
                await api.update({ id: g.id }, { type: æ.type, vaerdi_json, raekkefoelge: i + 1 });
            }
        }
    } catch (e) {
        throw oversætFejl(e);
    }
}
