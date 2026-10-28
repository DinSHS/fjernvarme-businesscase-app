//-----------------------------------------------------------------------
// Arkivets regneark (runde 13): tabellerne <-> ark, og manifestet der gør genimporten tabsfri.
//
// Hvert tabelark: række 1 = danske overskrifter (fed, frosset), række 2 = de tekniske feltnavne (skjult; det er
// den, genimporten læser), data fra række 3. Kolonnerne er databasens felter i skemaets rækkefølge, med to slags
// AFLEDTE kolonner, som kun er der for mennesker og genberegnes ved genimport. Deres tekniske navn er entydigt kodet
// med et præfiks, som et feltnavn aldrig har (`~dk:<felt>`, `~json:<nøgle>` — nøglen må selv indeholde `~` og `:`),
// og genimporten kræver PRÆCIS de afledte kolonner, skriveren ville lave af de samme rækker (K10-F8):
//   * tid: "<felt> (dansk tid)" som Excel-dato ved siden af "<felt> (UTC)" som ISO-tekst. Excels serietal har
//     ingen tidszone, så det er ISO-teksten, der er data; den danske dato er vægur i Europe/Copenhagen.
//   * Timer: værdierne i vaerdier_json foldet ud i hver sin kolonne (tal som tal).
// En tabel, der ikke kan være i ét ark (Excel: 1.048.576 rækker), deles i "Timer", "Timer (2)" … — aldrig afkortet.
// Det skjulte ark `_manifest` har formatet, skemaversionen, app-versionen og pr. tabel ark, rækketal og sha256.
//-----------------------------------------------------------------------

import {
    ArkivAfvisning, ARKIV_FORMAT, ARKIV_FORMATVERSION, arkivSha, kolonner as skemaKolonner, SKEMAVERSION, tabelSha,
    type ImportTabel, type Kanonisk, type Kolonne,
} from "../../../rayfin/functions/src/arkiv";
import { EXCEL_MAKS_RÆKKER, læsXlsx, skrivXlsx, type Ark, type Celle, type Læst, type LæstArk } from "./xlsx";

/** Arkivets tabeller: de genimporterede, værksloggen (kun til orientering) og referencerne (værker, revisioner, tidsserier). */
export const ARKIV_TABELLER = [
    "Scenarie", "ScenarieAendring", "Bestilling", "Koersel", "KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime",
    "Aendringslog", "VaerkRef", "Vaerksrevision", "TidsserieRef",
] as const;
export type ArkivTabel = (typeof ARKIV_TABELLER)[number];

export const ARK_NAVN: Record<ArkivTabel, string> = {
    Scenarie: "Scenarier", ScenarieAendring: "Ændringer", Bestilling: "Bestillinger", Koersel: "Kørsler", KoerselInput: "Input",
    KoerselNoegletal: "Nøgletal", KoerselMaaned: "Måneder", KoerselTime: "Timer", Aendringslog: "Værksændringer",
    VaerkRef: "Værker", Vaerksrevision: "Værksrevisioner", TidsserieRef: "Tidsserier",
};

const REF_KOLONNER: Record<"VaerkRef" | "Vaerksrevision" | "TidsserieRef", Kolonne[]> = {
    VaerkRef: [
        { navn: "id", type: "uuid", nullable: false }, { navn: "kode", type: "text", nullable: false }, { navn: "navn", type: "text", nullable: false },
        { navn: "revision", type: "int", nullable: false }, { navn: "kilde", type: "text", nullable: false },
    ],
    Vaerksrevision: [
        { navn: "vaerk_id", type: "uuid", nullable: false }, { navn: "revision", type: "int", nullable: false },
        { navn: "parametre_sha256", type: "text", nullable: false },
    ],
    TidsserieRef: [
        { navn: "id", type: "uuid", nullable: false }, { navn: "vaerk_id", type: "uuid", nullable: false }, { navn: "rolle", type: "text", nullable: false },
        { navn: "navn", type: "text", nullable: false }, { navn: "filnavn", type: "text", nullable: false }, { navn: "sha256", type: "text", nullable: true },
        { navn: "status", type: "text", nullable: false }, { navn: "uploadet", type: "datetime", nullable: false },
    ],
};

export function arkivKolonner(t: ArkivTabel): readonly Kolonne[] {
    return t === "VaerkRef" || t === "Vaerksrevision" || t === "TidsserieRef" ? REF_KOLONNER[t] : skemaKolonner(t as ImportTabel | "Aendringslog");
}

const ETIKET: Record<string, string> = {
    id: "Id", vaerk_id: "Værk (id)", navn: "Navn", beskrivelse: "Beskrivelse", reference_scenarie_id: "Referencescenarie (id)",
    periode_start: "Periode fra", periode_slut: "Periode til", med_balancering: "Med balancering", balancing_method: "Balanceringsmetode",
    mip_rel_gap: "Relativt gab", mip_abs_gap: "Absolut gab (kr.)", tidsgraense_s: "Tidsgrænse (s)", ekstra_flag: "Ekstra flag", heat_csv: "Varmelast-CSV",
    arkiveret: "Arkiveret", oprettet_af: "Oprettet af", oprettet: "Oprettet", scenarie_id: "Scenarie (id)", type: "Type", sti: "Sti",
    vaerdi_json: "Værdi (JSON)", raekkefoelge: "Rækkefølge", klient_noegle: "Klientnøgle", bestilt_af: "Bestilt af", bestilt: "Bestilt",
    bestilling_id: "Bestilling (id)", vaerk_revision: "Værksrevision", input_hash: "Input-hash (sha256)", status: "Status", fase: "Fase",
    modtaget: "Modtaget", startet: "Startet", afsluttet: "Afsluttet", hjerteslag: "Hjerteslag", annuller_anmodet: "Annullering bedt om",
    forsoeg: "Forsøg", arbejder_id: "Arbejder", fabric_job_id: "Fabric-job (udgået)", kilde: "Kilde", model_commit: "Modelcommit",
    data_commit: "Datacommit", miljoe_json: "Miljø (JSON)", case_sti: "Case-sti", output_sti: "Output-sti", output_stem: "Outputnavn",
    oploesning: "Opløsning", interval_min: "Interval (min)", antal_interval_model: "Intervaller i modellen", antal_interval_csv: "Rækker i timefilen",
    solve_status: "Solverstatus", er_milp: "MILP", objektiv_dkk: "Objektiv (kr.)", oensket_rel_gap: "Ønsket relativt gab",
    oensket_abs_gap: "Ønsket absolut gab (kr.)", opnaaet_gap: "Opnået gab", best_bound: "Bedste grænse (kr.)", loesetid_s: "Løsetid (s)",
    fejlbesked: "Fejlbesked", manifest_json: "Manifest (JSON)", koersel_id: "Kørsel (id)", gruppe: "Gruppe", objekt: "Objekt",
    marked: "Marked", noegle: "Nøgle", vaerdi: "Værdi", enhed: "Enhed", maaned: "Måned", tid: "Interval start",
    varmelast_mw: "Varmelast (MW)", spotpris: "Spotpris (kr./MWh)", t_ude: "Udetemperatur (°C)", vaerdier_json: "Øvrige værdier (JSON)",
    revision: "Revision", handling: "Handling", gammel_json: "Gammel værdi (JSON)", ny_json: "Ny værdi (JSON)", aendret_af: "Ændret af",
    tidspunkt: "Tidspunkt", anmodning_id: "Anmodning (id)", kode: "Værkskode", parametre_sha256: "Parametrenes sha256",
    rolle: "Rolle", filnavn: "Filnavn", sha256: "sha256", uploadet: "Uploadet",
};

const etiket = (navn: string) => ETIKET[navn] ?? navn;

// ------------------------------------------------------------------ tid

const KBH = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Vægur i Europe/Copenhagen for et UTC-tidspunkt (som Date.UTC-komponenter). */
export function danskVægur(iso: string): { år: number; måned: number; dag: number; time: number; minut: number; sekund: number; ms: number } {
    const t = Date.parse(iso);
    const p = Object.fromEntries(KBH.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return { år: Number(p.year), måned: Number(p.month), dag: Number(p.day), time: Number(p.hour), minut: Number(p.minute), sekund: Number(p.second), ms: t % 1000 };
}

/** Excel-serietal (1900-systemet) for vægurets dato og tid i Danmark. */
export function danskExcelSerie(iso: string): number {
    const v = danskVægur(iso);
    return Date.UTC(v.år, v.måned - 1, v.dag, v.time, v.minut, v.sekund, v.ms) / 86_400_000 + 25569;
}

// ------------------------------------------------------------------ indhold

export interface ArkivMeta {
    titel: string;
    eksporteret: string;            // ISO, UTC
    eksporteret_af: string;
    app_version: string;
    app_commit: string;
    /** Appens pin af modelrepoet, og hvad installationens arbejder (Motor-rækken) brugte ved eksporten. */
    model_commit: string;
    motor_model_commit: string | null;
    motor_data_commit: string | null;
    scenarier: string[];
    /** Kørsler, der ikke er med (ikke afsluttede), med grund. */
    udeladt: { id: string; scenarie_id: string; status: string }[];
}

export interface ArkivIndhold {
    tabeller: Record<ArkivTabel, Kanonisk[][]>;
    meta: ArkivMeta;
}

export interface TabelManifest { ark: string[]; raekker: number; sha256: string }

export interface Manifest {
    format: string; formatversion: number; skemaversion: number; meta: ArkivMeta;
    tabeller: Record<ArkivTabel, TabelManifest>;
    arkiv_sha256: string;
}

export function tomtIndhold(meta: ArkivMeta): ArkivIndhold {
    return { tabeller: Object.fromEntries(ARKIV_TABELLER.map((t) => [t, []])) as unknown as Record<ArkivTabel, Kanonisk[][]>, meta };
}

export function tabelshas(i: ArkivIndhold): Record<ArkivTabel, string> {
    return Object.fromEntries(ARKIV_TABELLER.map((t) => [t, tabelSha(i.tabeller[t])])) as Record<ArkivTabel, string>;
}

// ------------------------------------------------------------------ skrivning

interface Kolonnespec { teknisk: string; etiket: string; bredde: number; værdi: (r: readonly Kanonisk[]) => Celle }

/** Præfikserne for afledte kolonner i række 2. Et feltnavn er [a-z_]+, så det kan aldrig begynde med "~". */
export const AFLEDT_DK = "~dk:";
export const AFLEDT_JSON = "~json:";

function kolonnespecs(t: ArkivTabel, rækker: readonly (readonly Kanonisk[])[]): Kolonnespec[] {
    const ks = arkivKolonner(t);
    const ud: Kolonnespec[] = [];
    ks.forEach((k, i) => {
        if (k.type === "datetime") {
            ud.push({ teknisk: `${AFLEDT_DK}${k.navn}`, etiket: `${etiket(k.navn)} (dansk tid)`, bredde: 19, værdi: (r) => (r[i] === null ? null : { dato: danskExcelSerie(r[i] as string) }) });
            ud.push({ teknisk: k.navn, etiket: `${etiket(k.navn)} (UTC)`, bredde: 25, værdi: (r) => r[i] });
        } else {
            const bred = k.type === "uuid" ? 37 : k.navn.endsWith("_json") ? 40 : k.type === "text" ? 22 : 14;
            ud.push({ teknisk: k.navn, etiket: etiket(k.navn), bredde: bred, værdi: (r) => r[i] });
        }
    });
    if (t === "KoerselTime") {
        const j = ks.findIndex((k) => k.navn === "vaerdier_json");
        for (const nøgle of udfoldedeNøgler(rækker.map((r) => r[j] as string))) {
            ud.push({ teknisk: `${AFLEDT_JSON}${nøgle}`, etiket: nøgle, bredde: 14, værdi: (r) => udfold(r[j] as string, nøgle) });
        }
    }
    return ud;
}

/** Nøglerne i vaerdier_json i den rækkefølge, de først optræder. */
function udfoldedeNøgler(jsons: readonly string[]): string[] {
    const set = new Set<string>();
    for (const s of jsons) for (const k of Object.keys(JSON.parse(s) as object)) set.add(k);
    return [...set];
}

function udfold(json: string, nøgle: string): Celle {
    const v = (JSON.parse(json) as Record<string, unknown>)[nøgle];
    if (v === undefined || v === null) return null;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
    return JSON.stringify(v);
}

export interface Skrivevalg {
    /** Dataræk pr. ark (test af opdelingen); standard = Excels grænse minus de to overskriftsrækker. */
    maksDatarækker?: number;
}

export function bygManifest(i: ArkivIndhold, arknavne: Record<ArkivTabel, string[]>): Manifest {
    const shas = tabelshas(i);
    return {
        format: ARKIV_FORMAT, formatversion: ARKIV_FORMATVERSION, skemaversion: SKEMAVERSION, meta: i.meta,
        tabeller: Object.fromEntries(ARKIV_TABELLER.map((t) => [t, { ark: arknavne[t], raekker: i.tabeller[t].length, sha256: shas[t] }])) as Record<ArkivTabel, TabelManifest>,
        arkiv_sha256: arkivSha(shas),
    };
}

/** Arkivet som én .xlsx. */
export function bygArkivBog(i: ArkivIndhold, valg: Skrivevalg = {}): { bytes: Uint8Array; manifest: Manifest } {
    const maks = valg.maksDatarækker ?? EXCEL_MAKS_RÆKKER - 2;
    const tabelark: Ark[] = [];
    const arknavne = {} as Record<ArkivTabel, string[]>;
    for (const t of ARKIV_TABELLER) {
        const rækker = i.tabeller[t];
        const dele: (readonly Kanonisk[])[][] = [];
        for (let a = 0; a < Math.max(1, rækker.length); a += maks) dele.push(rækker.slice(a, a + maks));
        arknavne[t] = dele.map((_, d) => (d === 0 ? ARK_NAVN[t] : `${ARK_NAVN[t]} (${d + 1})`));
        dele.forEach((del, d) => {
            const specs = kolonnespecs(t, del);
            tabelark.push({
                navn: arknavne[t][d],
                rækker: [specs.map((s) => s.etiket), specs.map((s) => s.teknisk), ...del.map((r) => specs.map((s) => s.værdi(r)))],
                skjulteRækker: [2], fedeRækker: [1], frys: 2, bredder: specs.map((s) => s.bredde),
            });
        });
    }
    const manifest = bygManifest(i, arknavne);
    const ark: Ark[] = [læsMigArk(i, manifest), ...tabelark, manifestArk(manifest)];
    return { bytes: skrivXlsx(ark, { titel: i.meta.titel, skrivebeskyttetAnbefalet: true }), manifest };
}

const danskTid = (iso: string) => {
    const v = danskVægur(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(v.dag)}-${p(v.måned)}-${v.år} kl. ${p(v.time)}:${p(v.minut)} (dansk tid; ${iso} UTC)`;
};

function læsMigArk(i: ArkivIndhold, m: Manifest): Ark {
    const { meta } = i;
    const n = (t: ArkivTabel) => i.tabeller[t].length.toLocaleString("da-DK");
    const r: Celle[][] = [
        [meta.titel],
        [],
        ["Hvad er det?", "Et arkiv (backup) af scenarier og kørsler fra appen Fjernvarme Businesscase: scenariernes definition, bestillingerne og hver kørsels frosne input og resultater (nøgletal, måneder og timer), præcis som de står i databasen."],
        ["Brug", "Gem filen som historik, eller flyt historikken til en anden installation: Scenarier › Backup og flytning › Importér arkiv. Værkerne er IKKE med — upload værksarket først (Konfiguration); arkivet henviser til værkerne med kode, revision og en sha256 af parametrene."],
        ["Ret ikke i arket", "Arket er en backup, ikke et redigeringsformat. Hver tabel har en sha256 i det skjulte ark _manifest; genimporten afviser et arkiv, hvor et tal eller en tekst er ændret. Åbn filen skrivebeskyttet, og gem den ikke fra Excel (Excel kan omskrive tal og tekst). Vil du ændre et scenarie, så gør det i appen."],
        ["Tid", "Databasen gemmer tid i UTC. Hver tidskolonne står to gange: \"(dansk tid)\" er en Excel-dato i vægur Europe/Copenhagen (Excel-datoer har ingen tidszone) og \"(UTC)\" er tidspunktet som ISO-tekst — det er den, genimporten læser."],
        ["Tal", "Tal arkiveres med dobbelt præcision (ca. 15–17 betydende cifre) — som appen læser dem fra databasen. Regnemotoren skriver selv tal med dobbelt præcision, så for dens tal er der intet tab. Databasens DECIMAL-kolonner kan rumme flere cifre; har en værdi flere (fx skrevet udefra med SQL), er den allerede afrundet til dobbelt præcision, når appen læser den, og arkivet gemmer den afrundede værdi. Tomme celler er tomme værdier (ikke 0)."],
        [],
        ["Indhold", `${n("Scenarie")} scenarier, ${n("Koersel")} kørsler, ${n("KoerselTime")} timerækker, ${n("KoerselNoegletal")} nøgletal, ${n("KoerselMaaned")} månedsrækker, ${n("KoerselInput")} inputrækker.`],
        ["Eksporteret", danskTid(meta.eksporteret)],
        ["Eksporteret af", meta.eksporteret_af],
        ["App-version", `${meta.app_version} (commit ${meta.app_commit})`],
        ["Skemaversion", String(SKEMAVERSION)],
        ["Modellens pin (appen)", `modelrepo skj-1964/fjernvarme-businesscase @ ${meta.model_commit}`],
        ["Regnemotoren ved eksport", meta.motor_model_commit ? `modelrepo @ ${meta.motor_model_commit}; datarepo @ ${meta.motor_data_commit ?? "ukendt"}` : "ukendt (ingen motorrække)"],
        ["Hver kørsel", "bærer sin egen modelcommit og datacommit (ark Kørsler) — det er dem, resultaterne er regnet med."],
        ["Arkivets sha256", m.arkiv_sha256],
    ];
    if (meta.udeladt.length) {
        r.push([], ["Ikke med", `${meta.udeladt.length} kørsel(er) var ikke afsluttede og er udeladt (en importeret kørsel i kø ville blive kørt igen): ${meta.udeladt.map((u) => `${u.id} (${u.status})`).join(", ")}`]);
    }
    r.push([], ["Arkene", ""]);
    for (const t of ARKIV_TABELLER) {
        const forklaring: Record<ArkivTabel, string> = {
            Scenarie: "scenarierne (værk, periode, gab, tidsgrænse, reference)", ScenarieAendring: "scenariernes ændringer i forhold til værket",
            Bestilling: "bestillingerne bag kørslerne", Koersel: "kørslerne: status, pins, objektiv, gab, løsetid",
            KoerselInput: "det frosne input pr. kørsel (det, der blev kørt)", KoerselNoegletal: "nøgletal pr. kørsel", KoerselMaaned: "månedsværdier pr. kørsel (dansk måned; 'periode' = hele kørslen)",
            KoerselTime: "dispatch pr. interval (varmelast, spotpris, udetemperatur og de øvrige kolonner foldet ud)",
            Aendringslog: "værkernes ændringslog — kun til orientering; den importeres ikke", VaerkRef: "værkerne, kørslerne bygger på (henvisning)",
            Vaerksrevision: "parametrenes sha256 pr. værksrevision, en kørsel bygger på", TidsserieRef: "værkernes tidsserier (henvisning via sha256)",
        };
        r.push([m.tabeller[t].ark.join(", "), `${forklaring[t]} — ${m.tabeller[t].raekker.toLocaleString("da-DK")} rækker`]);
    }
    r.push([], ["Kredit", "Resultaterne er beregnet med den åbne model skj-1964/fjernvarme-businesscase (MIT) ved den commit, hver kørsel angiver. Appen er en brugerflade til modellen."]);
    return { navn: "Læs mig", rækker: r, titelRækker: [1], bredder: [26, 120], ombrydKolonner: [2], fedeRækker: [] };
}

function manifestArk(m: Manifest): Ark {
    const r: Celle[][] = [["nøgle", "værdi"],
        ["format", m.format], ["formatversion", m.formatversion], ["skemaversion", m.skemaversion], ["arkiv_sha256", m.arkiv_sha256],
        ["meta", JSON.stringify(m.meta)]];
    for (const t of ARKIV_TABELLER) r.push([`tabel:${t}`, JSON.stringify(m.tabeller[t])]);
    return { navn: "_manifest", rækker: r, skjult: true, fedeRækker: [1] };
}

// ------------------------------------------------------------------ læsning

const afvis = (s: string): never => { throw new ArkivAfvisning(s); };

function læsManifest(ark: LæstArk | undefined): Manifest {
    if (!ark) afvis("Filen er ikke et arkiv fra appen (arket _manifest mangler).");
    const kv = new Map<string, Læst>();
    for (const [nr, r] of ark!.celler) if (nr > 1 && typeof r.get(1) === "string") kv.set(r.get(1) as string, r.get(2) as Læst);
    if (kv.get("format") !== ARKIV_FORMAT) afvis("Filen er ikke et arkiv fra appen (forkert format).");
    if (kv.get("formatversion") !== ARKIV_FORMATVERSION) afvis(`Arkivet har formatversion ${String(kv.get("formatversion"))}; appen læser version ${ARKIV_FORMATVERSION}.`);
    if (kv.get("skemaversion") !== SKEMAVERSION) afvis(`Arkivet er lavet med skemaversion ${String(kv.get("skemaversion"))}; databasen her har version ${SKEMAVERSION}. Opdatér appen, eller eksportér igen fra en installation med samme version.`);
    const json = <T,>(k: string): T => {
        try { return JSON.parse(String(kv.get(k))) as T; } catch { return afvis(`_manifest: ${k} er beskadiget.`); }
    };
    return {
        format: ARKIV_FORMAT, formatversion: ARKIV_FORMATVERSION, skemaversion: SKEMAVERSION, meta: json<ArkivMeta>("meta"),
        tabeller: Object.fromEntries(ARKIV_TABELLER.map((t) => [t, json<TabelManifest>(`tabel:${t}`)])) as Record<ArkivTabel, TabelManifest>,
        arkiv_sha256: String(kv.get("arkiv_sha256")),
    };
}

/** Én kanonisk værdi fra en celle (typen skal passe; tal skrevet som tekst er en rettelse, ikke et tal). */
function fraCelle(k: Kolonne, v: Læst | undefined, hvor: string): Kanonisk {
    if (v === undefined) return null;
    const forkert = () => afvis(`${hvor}: ${k.navn} har en værdi af forkert type — arket er rettet eller beskadiget.`);
    switch (k.type) {
        case "int": case "decimal": return typeof v === "number" ? v : forkert();
        case "boolean": return typeof v === "boolean" ? v : forkert();
        default: return typeof v === "string" ? v : forkert();
    }
}

const SERIE_TOLERANCE = 5e-9;      // ~0,4 ms: en Excel-dato skrevet og læst igen er ens; en rettet dato er ikke

function læsTabel(t: ArkivTabel, ark: LæstArk[], m: TabelManifest): Kanonisk[][] {
    const ks = arkivKolonner(t);
    const ud: Kanonisk[][] = [];
    for (const a of ark) {
        const navne = a.celler.get(2);
        if (!navne) afvis(`Arket ${a.navn}: rækken med feltnavne (række 2) mangler.`);
        const plads = new Map<string, number>();
        for (const [kol, v] of navne!) {
            if (typeof v !== "string") continue;
            if (plads.has(v)) afvis(`Arket ${a.navn}: kolonnen ${v} står to gange.`);
            plads.set(v, kol);
        }
        for (const k of ks) if (!plads.has(k.navn)) afvis(`Arket ${a.navn}: kolonnen ${k.navn} mangler.`);
        const sidste = Math.max(2, ...a.celler.keys());
        const rækker: { r: Kanonisk[]; celler: Map<number, Læst>; hvor: string }[] = [];
        for (let nr = 3; nr <= sidste; nr++) {
            const celler = a.celler.get(nr) ?? new Map<number, Læst>();
            const hvor = `${a.navn} række ${nr}`;
            rækker.push({ r: ks.map((k) => fraCelle(k, celler.get(plads.get(k.navn)!), hvor)), celler, hvor });
        }
        // Præcis de kolonner, skriveren laver af netop disse rækker — hverken flere eller færre (K10-F8).
        const specs = kolonnespecs(t, rækker.map((x) => x.r));
        const forventet = specs.map((x) => x.teknisk);
        const mangler = forventet.filter((n) => !plads.has(n));
        if (mangler.length) afvis(`Arket ${a.navn}: kolonnen ${mangler[0]} mangler — arket er rettet.`);
        const ekstra = [...plads.keys()].filter((n) => !forventet.includes(n));
        if (ekstra.length) afvis(`Arket ${a.navn}: ukendte kolonner ${ekstra.join(", ")} — arket er rettet.`);
        for (const { r, celler, hvor } of rækker) {
            // Afledte kolonner skal være præcis det, de er afledt af — ellers er de rettet.
            for (const spec of specs) {
                if (!spec.teknisk.startsWith("~")) continue;
                const v = celler.get(plads.get(spec.teknisk)!);
                const skal = spec.værdi(r);
                if (spec.teknisk.startsWith(AFLEDT_DK)) {
                    const fv = skal === null ? undefined : (skal as { dato: number }).dato;
                    const ok = fv === undefined ? v === undefined : typeof v === "number" && Math.abs(v - fv) < SERIE_TOLERANCE;
                    if (!ok) afvis(`${hvor}: "${spec.etiket}" passer ikke med UTC-tidspunktet — arket er rettet.`);
                } else if ((skal ?? undefined) !== v) {
                    afvis(`${hvor}: kolonnen ${spec.etiket} passer ikke med "Øvrige værdier (JSON)" — arket er rettet.`);
                }
            }
            ud.push(r);
        }
    }
    if (ud.length !== m.raekker) afvis(`${ARK_NAVN[t]}: arket har ${ud.length} rækker, manifestet ${m.raekker} — arket er rettet eller beskadiget.`);
    // Et tomt ark har ingen rækker; arket for en tom tabel skrives alligevel (med overskrifter).
    return ud;
}

export interface LæstArkiv { indhold: ArkivIndhold; manifest: Manifest }

/**
 * Læser og VERIFICERER et arkiv: format- og skemaversion, alle ark til stede, rækketal og sha256 pr. tabel, arkivets
 * samlede sha256, og at de afledte kolonner passer. Kaster ArkivAfvisning med en dansk tekst ved enhver afvigelse.
 */
export function læsArkivBog(bytes: Uint8Array): LæstArkiv {
    const ark = læsXlsx(bytes);
    const efterNavn = new Map(ark.map((a) => [a.navn, a]));
    const manifest = læsManifest(efterNavn.get("_manifest"));
    const tabeller = {} as Record<ArkivTabel, Kanonisk[][]>;
    for (const t of ARKIV_TABELLER) {
        const m = manifest.tabeller[t];
        if (!m || !Array.isArray(m.ark) || !m.ark.length) afvis(`_manifest: ${ARK_NAVN[t]} mangler.`);
        const mine = m.ark.map((n) => efterNavn.get(n) ?? afvis(`Arket ${n} mangler.`));
        const andre = ark.filter((a) => a.navn !== ARK_NAVN[t] && a.navn.startsWith(`${ARK_NAVN[t]} (`) && !m.ark.includes(a.navn));
        if (andre.length) afvis(`Arket ${andre[0].navn} står ikke i manifestet.`);
        tabeller[t] = læsTabel(t, mine, m);
        const sha = tabelSha(tabeller[t]);
        if (sha !== m.sha256) afvis(`${ARK_NAVN[t]}: indholdet passer ikke med manifestets sha256 — arket er rettet eller beskadiget. Brug en uændret kopi af arkivet.`);
    }
    const indhold: ArkivIndhold = { tabeller, meta: manifest.meta };
    if (arkivSha(tabelshas(indhold)) !== manifest.arkiv_sha256) afvis("Arkivets samlede sha256 passer ikke — manifestet er rettet.");
    return { indhold, manifest };
}
