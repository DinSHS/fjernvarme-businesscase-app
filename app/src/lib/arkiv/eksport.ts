//-----------------------------------------------------------------------
// Eksport af scenarier og kørsler til et arkiv (runde 13). Genereres i browseren — begge udgaver, intet job.
//
// Alt læses PAGINERET (`læs` -> hentAlle; DAB svarer ellers med 100 rækker). En afkortet KoerselTime er den
// farligste fejl her, så eksporten tjekker hver færdig kørsel: antallet af timerækker skal være kørslens eget
// `antal_interval_csv` (de N-1 rækker i modellens _hourly.csv) — ellers stopper den med en forklaring.
//
// Enheden er en scenarie-FAMILIE: et scenarie og dets reference (og de scenarier, der bruger dem som reference).
// En familie kan genimporteres for sig og kan sammenlignes bagefter; derfor er "Eksportér arkiv" en .zip med én
// .xlsx pr. familie + manifest.json, mens et enkelt scenarie (og dets familie) er én .xlsx.
//-----------------------------------------------------------------------

import {
    AFSLUTTEDE_STATUS, ArkivAfvisning, kanoniskRække, kolonnenavne, sha256Bytes, vaerkSha, type ImportTabel, type Kanonisk,
} from "../../../rayfin/functions/src/arkiv";
import { MOTOR_ID } from "../../../rayfin/data/fjv.constants";
import { læs, læsÉn } from "@/lib/data/laes";
import { MODEL_COMMIT } from "@/sider/konfiguration/katalog.data";
import { bygArkivBog, tomtIndhold, type ArkivIndhold, type ArkivMeta, type ArkivTabel, type Manifest } from "./bog";
import { APP_COMMIT, APP_VERSION } from "./version";
import { skrivZip } from "./xlsx";

/** Sidestørrelse ved eksport: DAB tillader op til 100.000; 5.000 holder svarene under et par MB. */
export const EKSPORT_SIDE = 5000;

export interface Fremdrift { (tekst: string): void }

export { familier, familieFor } from "./familier";

const kan = (tabel: ImportTabel | "Aendringslog", r: object) => kanoniskRække(tabel, r as Record<string, unknown>);

export interface Eksportvalg {
    /** Scenarierne i arkivet (en hel familie — se familieFor). */
    scenarier: readonly string[];
    /** Kun disse kørsler (af scenarierne); udeladt = alle afsluttede. */
    koersler?: ReadonlySet<string>;
    bruger: string;
    titel?: string;
}

/** Henter et arkivs indhold fra databasen (pagineret) og tjekker, at intet er afkortet. */
export async function hentArkivindhold(valg: Eksportvalg, fremdrift: Fremdrift = () => {}): Promise<ArkivIndhold> {
    const motor = await læsÉn("Motor", MOTOR_ID).catch(() => null);
    const meta: ArkivMeta = {
        titel: valg.titel ?? "Arkiv — scenarier og kørsler",
        eksporteret: new Date().toISOString(), eksporteret_af: valg.bruger, app_version: APP_VERSION, app_commit: APP_COMMIT,
        model_commit: MODEL_COMMIT, motor_model_commit: motor?.model_commit ?? null, motor_data_commit: motor?.data_commit ?? null,
        scenarier: [...valg.scenarier], udeladt: [],
    };
    const ind = tomtIndhold(meta);
    const tilføj = (t: ArkivTabel, r: Kanonisk[]) => ind.tabeller[t].push(r);
    const vaerker = new Set<string>();
    const revisioner = new Map<string, Kanonisk[]>();

    for (const sid of valg.scenarier) {
        const s = await læsÉn("Scenarie", sid);
        if (!s) throw new ArkivAfvisning(`Scenariet ${sid} findes ikke.`);
        fremdrift(`Scenariet "${s.navn}"`);
        tilføj("Scenarie", kan("Scenarie", s));
        vaerker.add(s.vaerk_id);
        for (const a of await læs("ScenarieAendring", { filter: { scenarie_id: { eq: sid } }, sidestørrelse: EKSPORT_SIDE })) tilføj("ScenarieAendring", kan("ScenarieAendring", a));
        const koersler = await læs("Koersel", { filter: { scenarie_id: { eq: sid } }, sidestørrelse: EKSPORT_SIDE });
        const med = koersler.filter((k) => !valg.koersler || valg.koersler.has(k.id));
        const bestillinger = new Set(med.map((k) => k.bestilling_id));
        for (const b of await læs("Bestilling", { filter: { scenarie_id: { eq: sid } }, sidestørrelse: EKSPORT_SIDE })) {
            if (bestillinger.has(b.id)) tilføj("Bestilling", kan("Bestilling", b));
        }
        for (const k of med) {
            if (!(AFSLUTTEDE_STATUS as readonly string[]).includes(k.status)) {
                meta.udeladt.push({ id: k.id, scenarie_id: sid, status: k.status });
                continue;
            }
            fremdrift(`Kørslen ${k.id.slice(0, 8)} (${s.navn})`);
            const f = { filter: { koersel_id: { eq: k.id } }, sidestørrelse: EKSPORT_SIDE };
            const input = await læs("KoerselInput", f);
            const noegletal = await læs("KoerselNoegletal", f);
            const maaneder = await læs("KoerselMaaned", f);
            const timer = await læs("KoerselTime", { ...f, sortering: { tid: "asc" } });
            if (k.status === "faerdig" && k.antal_interval_csv != null && timer.length !== k.antal_interval_csv) {
                throw new ArkivAfvisning(
                    `Kørslen ${k.id} har ${timer.length} timerækker i databasen, men kørslen siger ${k.antal_interval_csv}. ` +
                    "Eksporten stopper hellere end at gemme en afkortet kørsel — prøv igen, og meld fejlen, hvis tallet står fast.");
            }
            tilføj("Koersel", kan("Koersel", k));
            for (const r of input) tilføj("KoerselInput", kan("KoerselInput", r));
            for (const r of noegletal) tilføj("KoerselNoegletal", kan("KoerselNoegletal", r));
            for (const r of maaneder) tilføj("KoerselMaaned", kan("KoerselMaaned", r));
            for (const r of timer) tilføj("KoerselTime", kan("KoerselTime", r));
            const sha = vaerkSha(input.filter((r) => r.kilde === "vaerk"));
            revisioner.set(`${k.vaerk_id}:${k.vaerk_revision}:${sha}`, [k.vaerk_id, k.vaerk_revision, sha]);
            vaerker.add(k.vaerk_id);
        }
    }
    for (const vid of vaerker) {
        const v = await læsÉn("Vaerk", vid);
        if (!v) throw new ArkivAfvisning(`Værket ${vid} findes ikke.`);
        tilføj("VaerkRef", [v.id, v.kode, v.navn, v.revision, v.kilde]);
        for (const l of await læs("Aendringslog", { filter: { vaerk_id: { eq: vid } }, sidestørrelse: EKSPORT_SIDE })) tilføj("Aendringslog", kan("Aendringslog", l));
        for (const t of await læs("Tidsserie", { filter: { vaerk_id: { eq: vid } }, sidestørrelse: EKSPORT_SIDE })) {
            tilføj("TidsserieRef", [t.id, t.vaerk_id, t.rolle, t.navn, t.filnavn, t.sha256 ?? null, t.status, (t.uploadet as Date).toISOString()]);
        }
    }
    for (const r of revisioner.values()) tilføj("Vaerksrevision", r);
    return ind;
}

// ------------------------------------------------------------------ filer

const filnavnsdel = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/æ/gi, "ae").replace(/ø/gi, "oe").replace(/å/gi, "aa")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "scenarie";

const dato = (iso: string) => iso.slice(0, 10);

export function arkivFilnavn(vaerkKode: string, scenarienavn: string, iso: string): string {
    return `arkiv_${filnavnsdel(vaerkKode)}_${filnavnsdel(scenarienavn)}_${dato(iso)}.xlsx`;
}

export interface EksporteretFil { navn: string; bytes: Uint8Array; manifest: Manifest }

/** Én familie som én .xlsx. */
export async function eksporterFamilie(valg: Eksportvalg, fremdrift?: Fremdrift): Promise<EksporteretFil> {
    const ind = await hentArkivindhold(valg, fremdrift);
    // Familien hedder som sin rod: scenariet uden reference (referencen), ellers det første.
    const første = ind.tabeller.Scenarie.find((r) => r[kolonnenavne("Scenarie").indexOf("reference_scenarie_id")] === null) ?? ind.tabeller.Scenarie[0];
    const vaerk = ind.tabeller.VaerkRef[0];
    fremdrift?.("Skriver regnearket");
    const { bytes, manifest } = bygArkivBog(ind);
    return { navn: arkivFilnavn(String(vaerk?.[1] ?? "vaerk"), String(første?.[2] ?? "scenarie"), ind.meta.eksporteret), bytes, manifest };
}

export const SAMLING_FORMAT = "fjv-arkiv-samling";

export interface SamlingsManifest {
    format: typeof SAMLING_FORMAT; version: 1; eksporteret: string; eksporteret_af: string; app_version: string; app_commit: string;
    filer: { navn: string; sha256: string; arkiv_sha256: string; scenarier: number; koersler: number }[];
}

/** Alle familier som én .zip: én .xlsx pr. familie + manifest.json (filernes sha256, så en manglende eller ændret fil opdages). */
export async function eksporterSamling(familierne: readonly string[][], bruger: string, fremdrift?: Fremdrift): Promise<{ navn: string; bytes: Uint8Array; manifest: SamlingsManifest }> {
    const nu = new Date().toISOString();
    const filer: Record<string, Uint8Array> = {};
    const m: SamlingsManifest = { format: SAMLING_FORMAT, version: 1, eksporteret: nu, eksporteret_af: bruger, app_version: APP_VERSION, app_commit: APP_COMMIT, filer: [] };
    for (const [i, f] of familierne.entries()) {
        fremdrift?.(`Familie ${i + 1} af ${familierne.length}`);
        const e = await eksporterFamilie({ scenarier: f, bruger }, fremdrift);
        let navn = e.navn;
        for (let n = 2; filer[navn]; n++) navn = e.navn.replace(/\.xlsx$/, `_${n}.xlsx`);
        filer[navn] = e.bytes;
        m.filer.push({ navn, sha256: sha256Bytes(e.bytes), arkiv_sha256: e.manifest.arkiv_sha256, scenarier: e.manifest.tabeller.Scenarie.raekker, koersler: e.manifest.tabeller.Koersel.raekker });
    }
    filer["manifest.json"] = new TextEncoder().encode(JSON.stringify(m, null, 1));
    return { navn: `fjv-arkiv_${dato(nu)}.zip`, bytes: skrivZip(filer), manifest: m };
}

/** Hent en fil i browseren. */
export function download(navn: string, bytes: Uint8Array, type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = navn;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
