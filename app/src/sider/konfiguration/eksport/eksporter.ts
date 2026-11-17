//-----------------------------------------------------------------------
// Eksportér et værk som udfyldt værksark (runde 12): modelrepoets skabelon
// + planen fra kort.ts + et skjult ark `_app` med værks-id, revision og
// sha256 af det eksporterede indhold. scripts/vaerksark_til_yaml.py læser
// arkene ved navn og ser aldrig `_app` (rundturs-testen beviser det).
//
// Format 2 (Codex K11 F4): markeringen bærer også GRUNDLAGET — sha256 af
// værkets blade og aktive seriers sha256, som eksporten så dem — og de
// erklærede AFVIGELSER (stier, skabelonen ikke kan bære). Importen regner
// grundlaget fra databasen i sin transaktion og kræver, at basis er værkets
// eksport bortset fra netop afvigelserne (fjv.revision). Klientens hash
// alene beviser intet om oprindelsen.
//
// Format 3 (runde 14): arket bærer appens egne faner (lag.ts: Start og
// drift, Balancemarked, Øvrige felter), som importen lægger oven på
// modelscriptets læsning, og markeringen en tabel af SKRIVEMÅDER ("former"):
// sti -> værkets vaerdi_json, hvor kun tallets form er forskellig fra det,
// et regneark giver tilbage (96 mod 96.0). Et ark i format 2 genkendes
// stadig; som revision afvises det med en klar besked (eksportér igen).
//-----------------------------------------------------------------------

import { MODELSPEJL } from "@/lib/modelspejl.data";
import { Arbejdsbog, excelSerie } from "./xlsx";
import { planlæg, type Celle, type Eksportkilde, type Eksportplan } from "./kort";
import { planlægLag } from "./lag";

/** Excels grænse for tekst i én celle. */
const MAKS_CELLETEKST = 32_767;

export const MARKOER_ARK = "_app";
export const MARKOER_FORMAT = "fjv-vaerksark-eksport/3";
/** Formatet før appens egne faner (runde 12–13): genkendes, men kan ikke gemmes som revision. */
export const MARKOER_FORMAT_FOER = "fjv-vaerksark-eksport/2";

export interface Markering {
    format: string;
    vaerk_id: string;
    vaerk_kode: string;
    revision: number;
    sha256: string;
    /** sha256 af værkets tilstand ved eksporten (``grundlag``). */
    grundlag: string;
    /** Stier, hvor modelscriptets læsning af arket ikke er værket (planens `afvigelser`). */
    afvigelser: string[];
    /** Format 3: skrivemåder (sti -> vaerdi_json), se filens hoved. Tom i et ark i format 2. */
    former: Record<string, string>;
    model_commit?: string;
    eksporteret?: string;
}

export interface Eksport {
    bytes: Uint8Array;
    filnavn: string;
    plan: Eksportplan;
    markering: Markering;
}

/** Ark og rækker, der bærer tidsstempler (skrives som Excel-datoer). */
const DATO_KOLONNE = (c: Celle) => (c.ark === "Timedata" || c.ark === "Solvarme") && /^A\d+$/.test(c.ref) && Number(c.ref.slice(1)) >= 6 && typeof c.v === "number";

/**
 * Indholdet, sha256 dækker: alle skrevne celler (ark, ref, værdi) i en fast rækkefølge + de strukturelle valg.
 * Samme værk ved samme revision giver samme indhold — en ny eksport af den aktuelle revision kan derfor bruges
 * som arkets udgangspunkt (basis) ved genupload, og en anden udgave af eksporten giver en anden hash.
 */
export function indholdstekst(plan: Eksportplan, grundlag: string): string {
    const celler = plan.celler.map((c) => [c.ark, c.ref, c.v, c.formel ?? null] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    const former = Object.entries(plan.former).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return JSON.stringify({ format: MARKOER_FORMAT, grundlag, afvigelser: plan.afvigelser, former, struktur: [plan.træpillerRække, plan.braendselKolonne, plan.solvarmeArk], celler });
}

/**
 * Grundlagets tekst: værkets blade [sti, vaerdi_json] sorteret på stien + de aktive seriers sha256 i fast
 * rolleorden. SAMME definition som ``grundlag()`` i fabric/fjv/revision.py (json.dumps med
 * ``ensure_ascii=False, separators=(",", ":")`` = JSON.stringify) — en vektor binder dem.
 */
export function grundlagstekst(k: Pick<Eksportkilde, "blade" | "varmelast" | "solprofil">): string {
    const blade = k.blade.map((b) => [b.sti, b.vaerdi_json] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return JSON.stringify({ b: blade, s: [["solprofil", k.solprofil?.sha256 ?? null], ["varmelast", k.varmelast?.sha256 ?? null]] });
}

export async function sha256Bytes(tekst: string): Promise<string> {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tekst));
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const filnavnFor = (kode: string, revision: number) => `${kode}_rev${revision}.xlsx`;

/**
 * Bygger arket. `skabelon` er modelrepoets vaerksdata_skabelon.xlsx ved pinnen (bytes); `nu` er
 * eksporttidspunktet (kun til visning i `_app`, ikke i hashen). Kaster, hvis planen nægter.
 */
export async function eksporter(k: Eksportkilde, skabelon: Uint8Array, nu = new Date()): Promise<Eksport> {
    const plan = planlæg(k);
    if (plan.nægter.length) throw new Error(`Værket kan ikke eksporteres til værksarket: ${plan.nægter.join(" ")}`);
    const wb = byg(plan, skabelon);
    const grundlag = await sha256Bytes(grundlagstekst(k));
    const sha = await sha256Bytes(indholdstekst(plan, grundlag));
    const markering: Markering = {
        format: MARKOER_FORMAT, vaerk_id: k.vaerk.id.toLowerCase(), vaerk_kode: k.vaerk.kode, revision: k.vaerk.revision,
        sha256: sha, grundlag, afvigelser: plan.afvigelser, former: plan.former, model_commit: MODELSPEJL.model_commit, eksporteret: nu.toISOString(),
    };
    const afvigelser = JSON.stringify(markering.afvigelser);
    if (afvigelser.length > MAKS_CELLETEKST) throw new Error(`Værket kan ikke eksporteres til værksarket: ${markering.afvigelser.length} felter kan ikke stå i arket — for mange til markeringen.`);
    const former = JSON.stringify(markering.former);
    if (former.length > MAKS_CELLETEKST) throw new Error(`Værket kan ikke eksporteres til værksarket: ${Object.keys(markering.former).length} tal har en skrivemåde, et regneark ikke bevarer — for mange til markeringen.`);
    const m = wb.tilføjArk(MARKOER_ARK, "Vejledning", true);
    const rækker: [string, string | number][] = [
        ["format", markering.format], ["vaerk_id", markering.vaerk_id], ["vaerk_kode", markering.vaerk_kode],
        ["revision", markering.revision], ["sha256", markering.sha256], ["grundlag", markering.grundlag],
        ["afvigelser", afvigelser], ["former", former], ["model_commit", markering.model_commit ?? ""],
        ["eksporteret", markering.eksporteret ?? ""],
        ["forklaring", "Arket er eksporteret af appen. Lad dette skjulte ark stå: det fortæller appen, hvilket værk og hvilken revision arket kom fra, så en genupload kan gemmes som en ny revision af værket."],
    ];
    rækker.forEach(([nøgle, v], idx) => { m.sæt(`A${idx + 1}`, nøgle); m.sæt(`B${idx + 1}`, v); });
    return { bytes: wb.bytes(), filnavn: filnavnFor(k.vaerk.kode, k.vaerk.revision), plan, markering };
}

/**
 * Arbejdsbogen med planens celler: modelrepoets skabelon, appens faner (Læs først forrest, de tre andre efter
 * modelrepoets) — samme stilarter, egne kolonner, dropdowns og frosne overskrifter.
 */
function byg(plan: Pick<Eksportplan, "træpillerRække" | "braendselKolonne" | "solvarmeArk" | "lagfaner" | "celler">, skabelon: Uint8Array): Arbejdsbog {
    const wb = new Arbejdsbog(skabelon);
    // Læs først tilføjes, før noget ark åbnes til ændring (den fravælger det ark, der var valgt).
    for (const f of plan.lagfaner) if (f.først) wb.tilføjArk(f.navn, "Timedata", false, true).opsæt(f);
    if (plan.træpillerRække) wb.regneark("Priser").indsætRækker(11, 1);
    if (plan.braendselKolonne) wb.regneark("Anlaeg").sikrKolonnebredde(14, 14);
    if (plan.solvarmeArk) wb.tilføjArk("Solvarme", "Timedata");
    for (const f of plan.lagfaner) if (!f.først) wb.tilføjArk(f.navn, "Timedata").opsæt(f);
    for (const c of plan.celler) {
        const a = wb.regneark(c.ark);
        if (c.formel) a.sætFormel(c.ref, c.formel, c.v as number | string, c.stil);
        else a.sæt(c.ref, DATO_KOLONNE(c) ? excelSerie(c.v as number) : c.v, c.stil);
    }
    return wb;
}

/**
 * Den tomme skabelon med appens faner (lead's beslutning 3, brugertesten F3): modelrepoets egen skabelon uændret
 * (med dens eksempelrækker) + Læs først, Start og drift, Balancemarked og Øvrige felter med tomme, gule rækker. Ingen
 * markering: arket hører ikke til et værk og bliver et nyt værk ved upload.
 */
export function tomSkabelon(skabelon: Uint8Array): Uint8Array {
    const lag = planlægLag({ vaerk: null, værk: new Map(), script: new Map(), enheder: [], tanke: [] });
    return byg({ træpillerRække: false, braendselKolonne: false, solvarmeArk: false, lagfaner: lag.faner, celler: lag.celler }, skabelon).bytes();
}

export const TOM_SKABELON_FILNAVN = "vaerksdata_skabelon_med_appens_faner.xlsx";

/** Markeringen fra et uploadet arks celler (`_app`), eller null. */
export function læsMarkering(celler: Map<string, Map<string, number | string>>): Markering | null {
    const a = celler.get(MARKOER_ARK);
    if (!a) return null;
    const kv = new Map<string, number | string>();
    for (let r = 1; r <= 40; r++) {
        const k = a.get(`A${r}`);
        if (typeof k === "string") kv.set(k, a.get(`B${r}`) ?? "");
    }
    const format = String(kv.get("format") ?? "");
    const id = String(kv.get("vaerk_id") ?? "").toLowerCase();
    const rev = Number(kv.get("revision"));
    const sha = String(kv.get("sha256") ?? "").toLowerCase();
    const grundlag = String(kv.get("grundlag") ?? "").toLowerCase();
    let afvigelser: unknown, former: unknown;
    try { afvigelser = JSON.parse(String(kv.get("afvigelser") ?? "[]")); former = JSON.parse(String(kv.get("former") || "{}")); } catch { return null; }
    // Format 2 genkendes også (runde 14): analysen afviser det som revision med en klar besked i stedet for tavst
    // at behandle arket som et nyt værk, når værket findes.
    if ((format !== MARKOER_FORMAT && format !== MARKOER_FORMAT_FOER) || !/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(rev) || !/^[0-9a-f]{64}$/.test(sha) || !/^[0-9a-f]{64}$/.test(grundlag)) return null;
    if (!Array.isArray(afvigelser) || !afvigelser.every((x) => typeof x === "string")) return null;
    const erFormer = (x: unknown): x is Record<string, string> => !!x && typeof x === "object" && !Array.isArray(x) && Object.values(x).every((v) => typeof v === "string");
    return {
        format, vaerk_id: id, vaerk_kode: String(kv.get("vaerk_kode") ?? ""), revision: rev, sha256: sha, grundlag, afvigelser,
        former: erFormer(former) ? former : {},
        model_commit: String(kv.get("model_commit") ?? ""), eksporteret: String(kv.get("eksporteret") ?? ""),
    };
}
