//-----------------------------------------------------------------------
// Genimport af et arkiv (runde 13): forhåndsvisning først, så skrivning i dele gennem den betroede vej.
//
// 1. `læsArkivfil` verificerer filen (bog.ts: manifest, rækketal, sha256 pr. tabel; en .zip også filernes sha256).
// 2. `planlæg` sammenligner arkivet med databasen HER og siger pr. scenarie og kørsel, hvad der sker:
//    opret · genoptag (en tidligere afbrudt import) · findes (samme indhold — springes over) · konflikt (samme id,
//    andet indhold — vises, skrives ikke) · afvist (med grund: værk, værksrevision eller tidsserie mangler …).
//    Værker og tidsserier eksporteres ikke; de findes her via id, ellers via værkskode og tidsseriens sha256, og
//    scenariets/kørslens værks-id (og en tidsserie valgt i scenariet) skrives om til dem, der findes her.
// 3. `importér` sender planens rækker som dele (arkiv.ts delOp) til Function `importerArkiv`, der skriver hver del i
//    én transaktion og først skriver en kørsel, når dens rækker er komplette. Afbrydes importen, viser næste
//    forhåndsvisning "genoptag", og kun de manglende rækker sendes.
//
// Et scenarie, der allerede findes, røres ikke — heller ikke dets ændringer (scenariet er levende; at genskabe en
// slettet ændring ville ændre det). Kun kørsler og bestillinger tilføjes til det.
//-----------------------------------------------------------------------

import {
    AFSLUTTEDE_STATUS, ArkivAfvisning, delOp, delTekst, frosneTidsserier, importAnmodningJson, kolonnenavne, KOERSEL_BOERN,
    sammenlign, sha256Bytes, sha256Tekst, vaerkRevisioner, vaerkSha, type Børnetal, type ImportTabel, type Importsvar, type Kanonisk,
} from "../../../rayfin/functions/src/arkiv";
import { læs, læsÉn } from "@/lib/data/laes";
import { importerArkivDel } from "@/lib/data/skriv";
import { læsArkivBog, type LæstArkiv } from "./bog";
import { SAMLING_FORMAT, type SamlingsManifest } from "./eksport";
import { erZip, læsZip } from "./xlsx";

export interface Arkivfil { filnavn: string; arkiv: LæstArkiv }

/** En .xlsx eller en .zip fra "Eksportér arkiv". Kaster ArkivAfvisning ved enhver afvigelse — intet er skrevet. */
export function læsArkivfil(bytes: Uint8Array, filnavn: string): Arkivfil[] {
    if (!erZip(bytes)) throw new ArkivAfvisning("Filen er hverken en .xlsx eller en .zip.");
    const filer = læsZip(bytes);
    if (!filer["manifest.json"]) {
        if (!filer["xl/workbook.xml"]) throw new ArkivAfvisning("Zip-filen har intet manifest.json — er den lavet med \"Eksportér arkiv\"?");
        return [{ filnavn, arkiv: læsArkivBog(bytes) }];
    }
    let m: SamlingsManifest;
    try { m = JSON.parse(new TextDecoder().decode(filer["manifest.json"])); } catch { throw new ArkivAfvisning("manifest.json er beskadiget."); }
    if (m.format !== SAMLING_FORMAT || m.version !== 1) throw new ArkivAfvisning("manifest.json har ikke arkivets format.");
    const listede = new Set(m.filer.map((f) => f.navn));
    const ekstra = Object.keys(filer).filter((n) => n !== "manifest.json" && !listede.has(n));
    if (ekstra.length) throw new ArkivAfvisning(`Zip-filen har filer, manifestet ikke kender: ${ekstra.join(", ")}.`);
    return m.filer.map((f) => {
        const b = filer[f.navn];
        if (!b) throw new ArkivAfvisning(`Filen ${f.navn} mangler i zip-filen.`);
        if (sha256Bytes(b) !== f.sha256) throw new ArkivAfvisning(`Filen ${f.navn} er ændret eller beskadiget (sha256 passer ikke med manifest.json).`);
        const arkiv = læsArkivBog(b);
        if (arkiv.manifest.arkiv_sha256 !== f.arkiv_sha256) throw new ArkivAfvisning(`Filen ${f.navn} passer ikke med manifest.json.`);
        return { filnavn: f.navn, arkiv };
    });
}

// ------------------------------------------------------------------ planen

export type Udfaldstype = "opret" | "genoptag" | "findes" | "konflikt" | "afvist";

export interface Planpost {
    slags: "scenarie" | "koersel";
    id: string;
    navn: string;
    vaerk: string;
    udfald: Udfaldstype;
    grund?: string;
    /** Rækker, der skrives (kørsel: alle dens rækker inkl. timer). */
    rækker: number;
}

interface Skrivetrin {
    tabel: ImportTabel;
    rækker: Kanonisk[][];
    forventet?: Record<string, Børnetal>;
    tekst: string;
}

export interface Plan {
    filnavn: string;
    arkiv: LæstArkiv;
    poster: Planpost[];
    trin: Skrivetrin[];
}

const kol = (t: ImportTabel, navn: string) => kolonnenavne(t).indexOf(navn);
const v = (t: ImportTabel, r: readonly Kanonisk[], navn: string) => r[kol(t, navn)];
const medFelt = (t: ImportTabel, r: readonly Kanonisk[], navn: string, x: Kanonisk) => { const k = [...r]; k[kol(t, navn)] = x; return k; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Sammenligner arkivet med databasen her. Læser kun — intet skrives. */
export async function planlæg(fil: Arkivfil): Promise<Plan> {
    const { tabeller } = fil.arkiv.indhold;
    const poster: Planpost[] = [];
    const trin: Skrivetrin[] = [];

    // Værker: samme id, ellers samme kode.
    const målVaerker = await læs("Vaerk");
    const vaerkMap = new Map<string, { id: string; kode: string; revisioner: Map<string, number[]>; serier: { id: string; sha256: string | null; status: string }[] }>();
    const vaerkKode = new Map<string, string>();
    for (const [id, kode, navn] of tabeller.VaerkRef as [string, string, string][]) {
        vaerkKode.set(id, `${kode} (${navn})`);
        const mål = målVaerker.find((x) => x.id === id) ?? målVaerker.find((x) => x.kode === kode);
        if (!mål) continue;
        const blade = await læs("VaerkParameter", { filter: { vaerk_id: { eq: mål.id } } });
        const log = await læs("Aendringslog", { filter: { vaerk_id: { eq: mål.id } } });
        const serier = await læs("Tidsserie", { filter: { vaerk_id: { eq: mål.id } } });
        vaerkMap.set(id, {
            id: mål.id, kode: mål.kode,
            revisioner: vaerkRevisioner(mål.revision, blade, log.map((l) => ({ revision: l.revision, sti: l.sti, handling: l.handling, gammel_json: l.gammel_json ?? null, ny_json: l.ny_json ?? null }))),
            serier: serier.map((s) => ({ id: s.id, sha256: s.sha256 ?? null, status: s.status })),
        });
    }
    const arkivSerier = new Map((tabeller.TidsserieRef as [string, string, string, string, string, string | null][]).map((r) => [r[0], { rolle: r[2], sha256: r[5] }]));
    const ikkeFundetVaerk = (vid: string) => `Værket ${vaerkKode.get(vid) ?? vid} findes ikke her. Upload værksarket for det først (Konfiguration › Upload værksark), og importér arkivet igen.`;

    // Scenarier.
    const arkivScen = new Map(tabeller.Scenarie.map((r) => [r[0] as string, r]));
    const scenarieUdfald = new Map<string, Udfaldstype>();
    const nyeScen: Kanonisk[][] = [];
    const nyeÆndr: Kanonisk[][] = [];
    // Referencer først (topologisk), så et scenaries reference er afgjort, før scenariet selv er det.
    const orden: string[] = [];
    const besøgt = new Set<string>();
    const besøg = (sid: string) => {
        if (besøgt.has(sid)) return;
        besøgt.add(sid);
        const ref = v("Scenarie", arkivScen.get(sid)!, "reference_scenarie_id") as string | null;
        if (ref && arkivScen.has(ref)) besøg(ref);
        orden.push(sid);
    };
    for (const sid of arkivScen.keys()) besøg(sid);
    for (const sid of orden) {
        const s = arkivScen.get(sid)!;
        const vid = v("Scenarie", s, "vaerk_id") as string;
        const post: Planpost = { slags: "scenarie", id: sid, navn: String(v("Scenarie", s, "navn")), vaerk: vaerkKode.get(vid) ?? vid, udfald: "opret", rækker: 0 };
        poster.push(post);
        const afvis = (grund: string) => { post.udfald = "afvist"; post.grund = grund; scenarieUdfald.set(sid, "afvist"); };
        const mål = vaerkMap.get(vid);
        if (!mål) { afvis(ikkeFundetVaerk(vid)); continue; }
        const ref = v("Scenarie", s, "reference_scenarie_id") as string | null;
        if (ref && scenarieUdfald.get(ref) === "afvist") { afvis("Referencescenariet kan ikke importeres."); continue; }
        if (ref && !arkivScen.has(ref) && !(await læsÉn("Scenarie", ref))) { afvis(`Referencescenariet ${ref} er hverken i arkivet eller her.`); continue; }
        const mappet = medFelt("Scenarie", s, "vaerk_id", mål.id);
        // Ændringerne, med en valgt tidsserie skrevet om til den her (samme sha256).
        const ændringer: Kanonisk[][] = [];
        let fejl: string | null = null;
        for (const a of tabeller.ScenarieAendring.filter((r) => v("ScenarieAendring", r, "scenarie_id") === sid)) {
            const sti = String(v("ScenarieAendring", a, "sti"));
            const vj = v("ScenarieAendring", a, "vaerdi_json") as string | null;
            if (!sti.startsWith("_tidsserie.") || !vj) { ændringer.push(a); continue; }
            const valgt = JSON.parse(vj) as unknown;
            if (typeof valgt !== "string" || !UUID.test(valgt)) { ændringer.push(a); continue; }
            if (mål.serier.some((x) => x.id === valgt)) { ændringer.push(a); continue; }
            const sha = arkivSerier.get(valgt)?.sha256;
            const her = sha ? mål.serier.find((x) => x.sha256 === sha && x.status === "gyldig") : undefined;
            if (!her) { fejl = `Scenariet bruger en tidsserie (${sti.slice("_tidsserie.".length)}), som ikke findes her${sha ? ` (sha256 ${sha.slice(0, 12)}…)` : ""}. Upload den først.`; break; }
            ændringer.push(medFelt("ScenarieAendring", a, "vaerdi_json", JSON.stringify(her.id)));
        }
        if (fejl) { afvis(fejl); continue; }
        const findes = await læsÉn("Scenarie", sid);
        if (findes) {
            const c = sammenlign("Scenarie", mappet, findes as unknown as Record<string, unknown>);
            post.udfald = c.udfald === "ens" ? "findes" : "konflikt";
            if (c.udfald === "konflikt") post.grund = `Scenariet findes her med andet indhold (${c.kolonner.join(", ")}). Det røres ikke; kørslerne importeres til det.`;
            scenarieUdfald.set(sid, post.udfald);
            continue;
        }
        nyeScen.push(mappet);
        nyeÆndr.push(...ændringer);
        post.rækker = 1 + ændringer.length;
        scenarieUdfald.set(sid, "opret");
    }
    if (nyeScen.length) trin.push({ tabel: "Scenarie", rækker: nyeScen, tekst: "scenarier" });
    if (nyeÆndr.length) trin.push({ tabel: "ScenarieAendring", rækker: nyeÆndr, tekst: "scenariernes ændringer" });

    // Kørsler (og deres bestillinger).
    const nyeBest: Kanonisk[][] = [];
    const kørselsTrin: Skrivetrin[] = [];
    const arkivBest = new Map(tabeller.Bestilling.map((r) => [r[0] as string, r]));
    for (const k of tabeller.Koersel) {
        const id = k[0] as string;
        const sid = v("Koersel", k, "scenarie_id") as string;
        const vid = v("Koersel", k, "vaerk_id") as string;
        const scen = arkivScen.get(sid);
        const navn = `${scen ? String(v("Scenarie", scen, "navn")) : sid} · ${String(v("Koersel", k, "bestilt")).slice(0, 16).replace("T", " ")} UTC`;
        const post: Planpost = { slags: "koersel", id, navn, vaerk: vaerkKode.get(vid) ?? vid, udfald: "opret", rækker: 0 };
        poster.push(post);
        const afvis = (grund: string) => { post.udfald = "afvist"; post.grund = grund; };
        if (scenarieUdfald.get(sid) === "afvist" || !scenarieUdfald.has(sid)) { afvis("Scenariet kan ikke importeres."); continue; }
        if (!(AFSLUTTEDE_STATUS as readonly string[]).includes(String(v("Koersel", k, "status")))) { afvis("Kørslen er ikke afsluttet."); continue; }
        const mål = vaerkMap.get(vid);
        if (!mål) { afvis(ikkeFundetVaerk(vid)); continue; }
        const børn = Object.fromEntries(KOERSEL_BOERN.map((b) => [b, tabeller[b].filter((r) => v(b, r, "koersel_id") === id)])) as Record<(typeof KOERSEL_BOERN)[number], Kanonisk[][]>;
        const input = børn.KoerselInput.map((r) => ({ kilde: String(v("KoerselInput", r, "kilde")), sti: String(v("KoerselInput", r, "sti")), vaerdi_json: String(v("KoerselInput", r, "vaerdi_json")) }));
        const sha = vaerkSha(input.filter((r) => r.kilde === "vaerk"));
        const revs = mål.revisioner.get(sha) ?? [];
        const rev = Number(v("Koersel", k, "vaerk_revision"));
        if (!revs.length) {
            afvis(`Kørslen bygger på revision ${rev} af værket ${post.vaerk}, men værket her har aldrig haft de parametre (sha256 ${sha.slice(0, 12)}…). Upload værksarket for den revision først.`);
            continue;
        }
        const manglendeSerie = frosneTidsserier(input).find((t) => !mål.serier.some((x) => x.sha256 === t.sha256 && x.status === "gyldig"));
        if (manglendeSerie) { afvis(`Kørslen bygger på tidsserien (${manglendeSerie.rolle}) med sha256 ${manglendeSerie.sha256.slice(0, 12)}…, som ikke findes her. Upload den først.`); continue; }
        const mappet = medFelt("Koersel", medFelt("Koersel", k, "vaerk_id", mål.id), "vaerk_revision", mål.id === vid && revs.includes(rev) ? rev : Math.max(...revs));
        const findes = await læsÉn("Koersel", id);
        if (findes) {
            const c = sammenlign("Koersel", mappet, findes as unknown as Record<string, unknown>);
            post.udfald = c.udfald === "ens" ? "findes" : "konflikt";
            if (c.udfald === "konflikt") post.grund = `Kørslen findes her med andet indhold (${c.kolonner.join(", ")}). Intet overskrives.`;
            continue;
        }
        const bid = v("Koersel", k, "bestilling_id") as string;
        const b = arkivBest.get(bid);
        if (!b) { afvis("Bestillingen mangler i arkivet."); continue; }
        const bHer = await læsÉn("Bestilling", bid);
        if (bHer && sammenlign("Bestilling", b, bHer as unknown as Record<string, unknown>).udfald === "konflikt") { afvis("Bestillingen findes her med andet indhold."); continue; }
        if (!bHer) nyeBest.push(b);
        // En tidligere afbrudt import kan have skrevet nogle af rækkerne: send kun dem, der mangler.
        let delvis = false;
        for (const t of KOERSEL_BOERN) {
            const her = new Set((await læs(t, { filter: { koersel_id: { eq: id } }, sidestørrelse: 5000 })).map((r) => r.id));
            if (her.size) delvis = true;
            const mangler = børn[t].filter((r) => !her.has(r[0] as string));
            if (mangler.length) kørselsTrin.push({ tabel: t, rækker: mangler, tekst: `${navn}: ${t}` });
            post.rækker += mangler.length;
        }
        kørselsTrin.push({
            tabel: "Koersel", rækker: [mappet], tekst: navn,
            forventet: { [id]: Object.fromEntries(KOERSEL_BOERN.map((t) => [t, børn[t].length])) as Børnetal },
        });
        post.rækker += 1;
        if (delvis) post.udfald = "genoptag";
    }
    if (nyeBest.length) trin.push({ tabel: "Bestilling", rækker: nyeBest, tekst: "bestillinger" });
    trin.push(...kørselsTrin);
    return { filnavn: fil.filnavn, arkiv: fil.arkiv, poster, trin };
}

// ------------------------------------------------------------------ skrivningen

export type Delskriver = (aendringer_json: string, del: string, bruger: string | undefined) => Promise<Importsvar>;

export interface Importresultat { dele: number; oprettet: number; fandtes: number }

/** Skriver planens trin. Stopper ved første afvisning (med Function'ens tekst); intet i den del er skrevet. */
export async function importér(plan: Plan, bruger: string | undefined, fremdrift: (gjort: number, ialt: number, tekst: string) => void = () => {}, skriv: Delskriver = importerArkivDel): Promise<Importresultat> {
    const arkiv = plan.arkiv.manifest.arkiv_sha256;
    const dele = plan.trin.flatMap((t) => delOp(t.rækker, t.tabel).map((d) => ({ trin: t, rækker: d })));
    const ialt = dele.reduce((s, d) => s + d.rækker.length, 0);
    let gjort = 0;
    const ud: Importresultat = { dele: 0, oprettet: 0, fandtes: 0 };
    const nr = new Map<Skrivetrin, number>();
    for (const d of dele) {
        const n = (nr.get(d.trin) ?? 0) + 1;
        nr.set(d.trin, n);
        const af = dele.filter((x) => x.trin === d.trin).length;
        const forventet = d.trin.forventet ? Object.fromEntries(d.rækker.map((r) => [r[0] as string, d.trin.forventet![r[0] as string]])) : undefined;
        const tekst = delTekst({ arkiv, tabel: d.trin.tabel, raekker: d.rækker, forventet });
        const anmodning = importAnmodningJson({
            arkiv, sha256: sha256Tekst(tekst), tabel: d.trin.tabel, nr: n, af,
            koersel_ider: d.trin.tabel === "Koersel" ? d.rækker.map((r) => r[0] as string) : [], filnavn: plan.filnavn.slice(0, 300),
        });
        fremdrift(gjort, ialt, d.trin.tekst);
        const svar = await skriv(anmodning, tekst, bruger);
        if (!svar.ok) throw new ArkivAfvisning(svar.svar);
        ud.dele++;
        ud.oprettet += svar.oprettet ?? 0;
        ud.fandtes += svar.fandtes ?? 0;
        gjort += d.rækker.length;
        fremdrift(gjort, ialt, d.trin.tekst);
    }
    return ud;
}
