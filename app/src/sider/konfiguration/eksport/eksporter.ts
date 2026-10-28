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
//-----------------------------------------------------------------------

import { MODELSPEJL } from "@/lib/modelspejl.data";
import { Arbejdsbog, excelSerie } from "./xlsx";
import { planlæg, type Celle, type Eksportkilde, type Eksportplan } from "./kort";

/** Excels grænse for tekst i én celle. */
const MAKS_CELLETEKST = 32_767;

export const MARKOER_ARK = "_app";
export const MARKOER_FORMAT = "fjv-vaerksark-eksport/2";

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
    return JSON.stringify({ format: MARKOER_FORMAT, grundlag, afvigelser: plan.afvigelser, struktur: [plan.træpillerRække, plan.braendselKolonne, plan.solvarmeArk], celler });
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
    const wb = new Arbejdsbog(skabelon);
    if (plan.træpillerRække) wb.regneark("Priser").indsætRækker(11, 1);
    if (plan.braendselKolonne) wb.regneark("Anlaeg").sikrKolonnebredde(14, 14);
    if (plan.solvarmeArk) wb.tilføjArk("Solvarme", "Timedata");
    for (const c of plan.celler) {
        const a = wb.regneark(c.ark);
        if (c.formel) a.sætFormel(c.ref, c.formel, c.v as number | string, c.stil);
        else a.sæt(c.ref, DATO_KOLONNE(c) ? excelSerie(c.v as number) : c.v, c.stil);
    }
    const grundlag = await sha256Bytes(grundlagstekst(k));
    const sha = await sha256Bytes(indholdstekst(plan, grundlag));
    const markering: Markering = {
        format: MARKOER_FORMAT, vaerk_id: k.vaerk.id.toLowerCase(), vaerk_kode: k.vaerk.kode, revision: k.vaerk.revision,
        sha256: sha, grundlag, afvigelser: plan.afvigelser, model_commit: MODELSPEJL.model_commit, eksporteret: nu.toISOString(),
    };
    const afvigelser = JSON.stringify(markering.afvigelser);
    if (afvigelser.length > MAKS_CELLETEKST) throw new Error(`Værket kan ikke eksporteres til værksarket: ${markering.afvigelser.length} felter kan ikke stå i arket — for mange til markeringen.`);
    const m = wb.tilføjArk(MARKOER_ARK, "Vejledning", true);
    const rækker: [string, string | number][] = [
        ["format", markering.format], ["vaerk_id", markering.vaerk_id], ["vaerk_kode", markering.vaerk_kode],
        ["revision", markering.revision], ["sha256", markering.sha256], ["grundlag", markering.grundlag],
        ["afvigelser", afvigelser], ["model_commit", markering.model_commit ?? ""],
        ["eksporteret", markering.eksporteret ?? ""],
        ["forklaring", "Arket er eksporteret af appen. Lad dette skjulte ark stå: det fortæller appen, hvilket værk og hvilken revision arket kom fra, så en genupload kan gemmes som en ny revision af værket."],
    ];
    rækker.forEach(([nøgle, v], idx) => { m.sæt(`A${idx + 1}`, nøgle); m.sæt(`B${idx + 1}`, v); });
    return { bytes: wb.bytes(), filnavn: filnavnFor(k.vaerk.kode, k.vaerk.revision), plan, markering };
}

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
    let afvigelser: unknown;
    try { afvigelser = JSON.parse(String(kv.get("afvigelser") ?? "[]")); } catch { return null; }
    if (format !== MARKOER_FORMAT || !/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(rev) || !/^[0-9a-f]{64}$/.test(sha) || !/^[0-9a-f]{64}$/.test(grundlag)) return null;
    if (!Array.isArray(afvigelser) || !afvigelser.every((x) => typeof x === "string")) return null;
    return {
        format, vaerk_id: id, vaerk_kode: String(kv.get("vaerk_kode") ?? ""), revision: rev, sha256: sha, grundlag, afvigelser,
        model_commit: String(kv.get("model_commit") ?? ""), eksporteret: String(kv.get("eksporteret") ?? ""),
    };
}
