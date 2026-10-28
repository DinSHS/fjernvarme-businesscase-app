//-----------------------------------------------------------------------
// uploadVaerksark's forløb (KONTRAKT §6d), skilt ud fra Function-registreringen, så det kan testes mod en falsk
// database (K5-F4). function_app.ts giver SQL-implementeringen af VaerksarkDeps.
//
// K5-F4: samme anmodning gav før to importer, to filer og to jobstarter (to kald, der begge havde læst `ny`), og en
// fejlet jobstart blev aldrig genoptaget (anmodningen stod `udfoert`, importen `koe` uden job). Nu:
//   - importens id ER anmodningens id — én anmodning kan højst give én import, én fil og én række;
//   - anmodningen genlæses låst i transaktionen, før importen oprettes;
//   - jobstarten reserveres betinget (kun én kalder POST'er), og en fejlet start frigiver reservationen, så et nyt
//     kald med samme anmodning genoptager den. Notebooken uden parametre tager desuden alle `koe`-importer FIFO.
// K5-F3: ZIP-kataloget tjekkes (zip.ts), før filen gemmes og importen startes.
//
// Runde 12: genupload af et ark, appen har eksporteret, er en ny revision af værket (anmodningens vaerk_id og
// forventet_revision). Med arket følger BASIS — appens nye eksport af værkets revision — bundet af `basis_sha256`;
// importen kører modelscriptet på begge og gemmer kun forskellen. Værkets revision tjekkes allerede her, så en
// konflikt siges med det samme (og igen i importens transaktion). Basis gemmes som `<id>_basis.xlsx`.
//-----------------------------------------------------------------------

import { Afvisning, læsAnmodning, type UploadVaerksark } from './logik.js';
import { MAKS_VAERKSARK_BYTES, sha256Hex } from './tidsserie.js';
import { tjekZip } from './zip.js';

export interface AnmodningsRad { id: string; status: string; svar: string | null; aendringer_json: string; anmodet_af: string; vaerk_id?: string | null; forventet_revision?: number | null }
export interface ImportRad { id: string; status: string; fabric_job_id: string | null; log: string | null }
export interface VaerkRad { id: string; kode: string; revision: number; arkiveret: boolean }
export interface Jobsvar { ok: boolean; jobId?: string; status: number; fejl?: string }

export interface VaerksarkDeps {
    læsAnmodning(id: string): Promise<AnmodningsRad | undefined>;
    læsImport(id: string): Promise<ImportRad | undefined>;
    /** Runde 12: værket, en revision gælder. */
    læsVaerk(id: string): Promise<VaerkRad | undefined>;
    skrivFil(filesRelativSti: string, bytes: Uint8Array): Promise<void>;
    /** I ÉN transaktion: lås og genlæs anmodningen; er den stadig `ny`, opret importen (id = anmodningens) og sæt anmodningen `udfoert`. */
    opretImport(a: AnmodningsRad, upload: UploadVaerksark, sti: string, log: string | null): Promise<'oprettet' | 'allerede_behandlet'>;
    /** Betinget: kun hvis importen er `koe` uden (eller med en forældet) reservation. true = denne kalder må starte jobbet. */
    reserverJobstart(importId: string): Promise<boolean>;
    /** Binder job-id'et — eller frigiver reservationen (null) med en læsbar log, så et nyt kald prøver igen. */
    bindJob(importId: string, jobId: string | null, log: string | null): Promise<void>;
    /** null = importnotebooken er ikke konfigureret. */
    startJob: ((importId: string) => Promise<Jobsvar>) | null;
    afvisAnmodning(id: string, tekst: string): Promise<void>;
}

export interface Vaerksarksvar { ok: boolean; status: string; svar: string; import_id?: string }

/** Base64 -> bytes med arkets egne kontroller (størrelse, xlsx-signatur, ZIP-katalog). Basis-arket nævnes i fejlen. */
function arkbytes(b64: string, basis: boolean): Uint8Array {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Afvisning(`${basis ? 'Basis-arket' : 'Filen'} er ikke base64-kodet.`);
    const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    if (bytes.byteLength > MAKS_VAERKSARK_BYTES) throw new Afvisning(`${basis ? 'Basis-arket' : 'Værksarket'} er for stort (${Math.round(bytes.byteLength / 1000)} kB; højst ${MAKS_VAERKSARK_BYTES / 1000} kB).`);
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) throw new Afvisning(`${basis ? 'Basis-arket' : 'Filen'} er ikke et Excel-ark (.xlsx).`);
    const z = tjekZip(bytes);
    if (!z.ok) throw new Afvisning(z.fejl!);
    return bytes;
}

export async function behandlVaerksark(d: VaerksarkDeps, anmodningId: string, indholdBase64: string, basisBase64 = ''): Promise<Vaerksarksvar> {
    const a = await d.læsAnmodning(anmodningId);
    if (!a) return { ok: false, status: 'afvist', svar: 'Anmodningen findes ikke.' };
    if (a.status === 'afvist') return { ok: false, status: 'afvist', svar: a.svar ?? '' };
    let upload: UploadVaerksark;
    try {
        const x = læsAnmodning(a.aendringer_json);
        if (x.type !== 'upload_vaerksark') throw new Afvisning('Anmodningen er ikke en værksark-upload.');
        upload = x.upload;
        if (sha256Hex(indholdBase64) !== upload.sha256) throw new Afvisning('Filens indhold passer ikke med anmodningens sha256 — upload filen igen.');
        if (upload.basis_sha256 !== null && sha256Hex(basisBase64) !== upload.basis_sha256) throw new Afvisning('Basis-arket passer ikke med anmodningens sha256 — upload arket igen.');
        if (upload.basis_sha256 === null && basisBase64) throw new Afvisning('Et basis-ark hører kun til en genupload som revision.');
    } catch (e) {
        if (e instanceof Afvisning) return { ok: false, status: 'afvist', svar: e.message };
        throw e;
    }

    const id = a.id.toLowerCase();
    if (a.status === 'ny') {
        try {
            const bytes = arkbytes(indholdBase64, false);
            const basis = upload.basis_sha256 === null ? null : arkbytes(basisBase64, true);
            if (basis) {
                const v = await d.læsVaerk(String(a.vaerk_id ?? '').toLowerCase());
                if (!v) throw new Afvisning('Værket, arket er eksporteret fra, findes ikke længere. Fjern det skjulte ark "_app" for at uploade arket som et nyt værk.');
                if (v.arkiveret) throw new Afvisning(`Værket "${v.kode}" er arkiveret og kan ikke ændres.`);
                if (Number(v.revision) !== Number(a.forventet_revision)) {
                    throw new Afvisning(`Værket "${v.kode}" er ændret, siden arket blev eksporteret (revision ${a.forventet_revision} → ${v.revision}). Intet er gemt — eksportér værket igen, og læg dine ændringer ind i det nye ark.`);
                }
            }
            const sti = `Files/fjv/uploads/${id}.xlsx`;
            // Samme anmodning = samme sti og samme indhold (sha256 er bundet), så et samtidigt kald skriver det samme.
            await d.skrivFil(sti.slice('Files/'.length), bytes);
            if (basis) await d.skrivFil(`fjv/uploads/${id}_basis.xlsx`, basis);
            await d.opretImport(a, upload, sti, d.startJob ? null : 'Importnotebooken fjv_importer_vaerksark er ikke deployet endnu; importen venter i kø.');
        } catch (e) {
            if (!(e instanceof Afvisning)) throw e;
            await d.afvisAnmodning(a.id, e.message);
            return { ok: false, status: 'afvist', svar: e.message };
        }
    }

    // Behandlet (nu eller tidligere): find importen og genoptag en manglende jobstart.
    const imp = await d.læsImport(id);
    if (!imp) return { ok: a.status === 'udfoert', status: a.status, svar: a.svar ?? '' };
    if (imp.status === 'koe' && d.startJob && await d.reserverJobstart(id)) {
        const job = await d.startJob(id);
        await d.bindJob(id, job.ok ? (job.jobId ?? 'ukendt') : null, job.ok ? null : `Importen kunne ikke startes (HTTP ${job.status}); prøv at uploade igen for at genoptage. ${job.fejl ?? ''}`.slice(0, 4000));
        return job.ok
            ? { ok: true, status: 'koe', svar: 'Værksarket importeres nu.', import_id: id }
            : { ok: false, status: 'koe', svar: `Værksarket er gemt, men importen kunne ikke startes (HTTP ${job.status}). Prøv igen — samme fil genoptager importen.`, import_id: id };
    }
    const tekst: Record<string, string> = { koe: imp.fabric_job_id ? 'Værksarket importeres.' : 'Værksarket venter i kø.', koerer: 'Værksarket importeres.', faerdig: 'Værksarket er importeret.', fejl: 'Importen fejlede — se loggen.' };
    return { ok: imp.status !== 'fejl', status: imp.status, svar: tekst[imp.status] ?? imp.status, import_id: id };
}
