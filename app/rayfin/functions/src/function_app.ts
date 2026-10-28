//-----------------------------------------------------------------------
// Betroede funktioner (KONTRAKT v2 §6) — kører som APP-EJEREN.
//
//   startBestilling(bestillingId)   Bestilling -> Koersel(koe) + KoerselInput (+ frosne pins), start arbejder
//   udfoerAendring(anmodningId)     Aendringsanmodning -> VaerkParameter + Aendringslog + revision
//                                   (også kopier_vaerk og opret_vaerk = nyt værk fra bunden af N dele)
//   afstem()                        kørsler uden levende arbejder -> fejl; kø uden arbejder -> start job
//   annullerKoersel(koerselId)      koe -> annulleret; aktiv -> annuller_anmodet (arbejderen stopper selv)
//
// Arbejderprotokollen følger KONTRAKT v2.2 §6c (solver-applock, Motor-række, servertid) — se motor.ts.
//   hentKildeYaml(vaerkId)          værkets oprindelige YAML fra lakehouset (kun læsning)
//   uploadTidsserie(anmodningId, indhold)        CSV -> validering -> normaliseret fil + Tidsserie (KONTRAKT §6d)
//   hentTidsserie(tidsserieId)                   værdierne kompakt til visning
//   uploadVaerksark(anmodningId, indholdBase64, basisBase64)  xlsx -> Files/fjv/uploads + Vaerksarkimport + importnotebook
//                                                (basis = runde 12's revision: appens nye eksport af værket)
//   hentDmiTemperatur(omraade, fra, til, kolonne) DMI-temperatur rå fra df-data (målt mod syntetisk varmelast)
//   skemaInfo()                     læs-kun diagnose af databasens faktiske tabeller/kolonner
//
// INGEN test- eller oprydningsfunktioner her (K2-F1, KONTRAKT §6c): alt der er registreret med
// udf.func kan kaldes af enhver bruger med adgang til appen. Testoprydning ligger i
// scripts/ryd_testdata.py og kører med udviklerens egen identitet.
//
// Identitet: kalderens Rayfin-token bærer INGEN e-mail-claim (målt
// 2026-10-16: kun iss/aud/sub/tid/exp, sub = …/users/<oid>). Funktionerne
// kender derfor ikke kalderen; de stoler på `bestilt_af`/`anmodet_af`, som
// DAB's create-policy (`@claims.email eq @item.…`) har verificeret, da
// klienten oprettede rækken. Målt: en Bestilling med en fremmed e-mail
// afvises af DAB.
//
// Workspace, database og notebook er konstanter (konfig.ts) — de må aldrig
// komme fra kalderen.
//-----------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import {
    UserDataFunctions,
    AudienceType,
    type RayfinContext,
} from '@microsoft/fabric-user-data-functions';
import { forbind, iTransaktion, låsKvote, sql } from './db.js';
import { IMPORTER_NOTEBOOK_ID, LAKEHOUSE_ID, MOTOR_ID, ONELAKE_DFS, WORKSPACE_ID } from './konfig.js';
import { startNotebook } from './jobs.js';
import { læsTekst, skrivFil } from './onelake.js';
import { behandlVaerksark, type VaerksarkDeps } from './vaerksark.js';
import { ForLangRække, MAKS_UPLOAD_BYTES, sha256Bytes, sha256Hex, tætRække, vaerkTrae, validerUpload, valideringJson } from './tidsserie.js';
import { markérDøde, startJobHvisFri, type Arbejderstart } from './motor.js';
import {
    Afvisning, bygFrossetInput, GRAENSER, læsAnmodning, planlægParametre, samlNytVaerk,
    type AktiverTidsserie, type InputRad, type NytBlad, type OpretVaerk, type OpretVaerkDel, type ScenarieAendringRad, type ScenarieRad,
    type TidsserieRad, type UploadTidsserie, type UploadVaerksark,
} from './logik.js';

const udf = new UserDataFunctions();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Skema = Record<string, any>;
// NB: kontekstparameteren SKAL annoteres bogstaveligt som `RayfinContext<…>` i hver
// handler. Et type-alias (`ctx: RayfinContext<Skema, AudienceType.Sql>`) får typegen til at behandle `ctx` som en
// almindelig request-parameter, og kaldet fejler med »MissingInput: Parameter not
// found in the request« (målt 2026-10-16).

export interface Bestillingssvar {
    ok: boolean;
    koersel_id?: string;
    status?: string;
    ny?: boolean;
    afvist?: string;
    arbejder?: Arbejderstart;
}

export interface Aendringssvar { ok: boolean; status: string; svar: string; vaerk_id?: string; revision?: number }

export interface Afstemningssvar { tjekket: number; aendret: string[]; arbejder: Arbejderstart }

export interface Annulleringssvar { ok: boolean; status: string; besked: string }

/** mssql returnerer uniqueidentifier med STORE bogstaver, DAB med små — svar altid med små. */
const lc = (v: unknown): string => String(v).toLowerCase();

const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * En uventet fejl inde i en Function når kalderen som en anonym »InternalError« (målt
 * 2026-10-16) — teksten går tabt. De brugerrettede funktioner fanger derfor alt og
 * returnerer en læsbar tekst i deres eget svarformat.
 */
function tekniskFejl(hvor: string, e: unknown): string {
    const m = e instanceof Error ? e.message : String(e);
    return `Teknisk fejl i ${hvor}: ${m}`.slice(0, 1900);
}

function afvisningstekst(e: unknown): string | null {
    return e instanceof Afvisning ? e.message : null;
}

function erUnikBrud(e: unknown): boolean {
    const n = (e as { number?: number; originalError?: { info?: { number?: number } } })?.number
        ?? (e as { originalError?: { info?: { number?: number } } })?.originalError?.info?.number;
    return n === 2627 || n === 2601;
}

// ------------------------------------------------------------------ startBestilling

udf.func(
    'startBestilling',
    async (ctx: RayfinContext<Skema, AudienceType.Sql | AudienceType.Fabric>, bestillingId: string): Promise<Bestillingssvar> => {
        if (!uuid(bestillingId)) return { ok: false, afvist: 'Ugyldigt bestillings-id.' };
        const pool = await forbind(ctx.Tokens.Sql);
        try {
            const findes = async () => (await pool.request().input('b', sql.UniqueIdentifier, bestillingId)
                .query('SELECT id, status FROM dbo.Koersels WHERE bestilling_id = @b')).recordset[0] as { id: string; status: string } | undefined;

            const før = await findes();
            if (før) return { ok: true, koersel_id: lc(før.id), status: før.status, ny: false, arbejder: await startJobHvisFri(pool, ctx.Tokens.Fabric) };

            let koerselId: string;
            try {
                koerselId = await iTransaktion(pool, async (req) => {
                    const b = (await req().input('b', sql.UniqueIdentifier, bestillingId)
                        .query('SELECT id, scenarie_id, bestilt_af, bestilt FROM dbo.Bestillings WHERE id = @b')).recordset[0];
                    if (!b) throw new Afvisning('Bestillingen findes ikke.');
                    // K2-F9: kvoten tælles og forbruges under en lås pr. bruger (på tværs af værker).
                    await låsKvote(req, b.bestilt_af);

                    const s = (await req().input('s', sql.UniqueIdentifier, b.scenarie_id).query(`
                        SELECT id, vaerk_id, arkiveret, periode_start, periode_slut, med_balancering, balancing_method,
                               mip_rel_gap, mip_abs_gap, tidsgraense_s, ekstra_flag, heat_csv
                        FROM dbo.Scenaries WITH (UPDLOCK, HOLDLOCK) WHERE id = @s`)).recordset[0];
                    if (!s) throw new Afvisning('Scenariet findes ikke.');
                    if (s.arkiveret) throw new Afvisning('Scenariet er arkiveret.');

                    // UPDLOCK på værket: serialiserer mod udfoerAendring, så revision og blade hører sammen.
                    const v = (await req().input('v', sql.UniqueIdentifier, s.vaerk_id)
                        .query('SELECT id, revision, arkiveret FROM dbo.Vaerks WITH (UPDLOCK, HOLDLOCK) WHERE id = @v')).recordset[0];
                    if (!v) throw new Afvisning('Værket findes ikke.');
                    if (v.arkiveret) throw new Afvisning('Værket er arkiveret.');

                    const ventende = (await req().input('af', sql.NVarChar(200), b.bestilt_af)
                        .query(`SELECT COUNT(*) AS n FROM dbo.Koersels WHERE bestilt_af = @af AND status = 'koe'`)).recordset[0].n;
                    if (Number(ventende) >= GRAENSER.ventendePrBruger) {
                        throw new Afvisning(`Du har allerede ${ventende} kørsler i kø; højst ${GRAENSER.ventendePrBruger} ad gangen. Vent til en er færdig, eller annullér en.`);
                    }

                    const params = (await req().input('v', sql.UniqueIdentifier, v.id)
                        .query('SELECT sti, vaerdi_json FROM dbo.VaerkParameters WHERE vaerk_id = @v')).recordset as { sti: string; vaerdi_json: string }[];
                    const aendr = (await req().input('s', sql.UniqueIdentifier, s.id)
                        .query('SELECT type, sti, vaerdi_json, raekkefoelge FROM dbo.ScenarieAendrings WITH (UPDLOCK, HOLDLOCK) WHERE scenarie_id = @s')).recordset as ScenarieAendringRad[];
                    // K2-F8: scenarie og ændringer er låst til transaktionens slutning (UPDLOCK/HOLDLOCK), så en
                    // samtidig redigering i UI'et venter og ikke kan blandes ind i det frosne input.

                    // K2-F8: model- og data-revision fryses i det hashbeskyttede input. Arbejderen bruger netop dem.
                    const motor = (await req().input('m', sql.UniqueIdentifier, MOTOR_ID)
                        .query('SELECT model_commit, data_commit FROM dbo.Motors WHERE id = @m')).recordset[0];
                    if (!motor?.model_commit || !motor?.data_commit) {
                        throw new Afvisning('Regnemotoren har endnu ikke registreret sin model- og dataversion. Prøv igen om lidt.');
                    }

                    const scenarie: ScenarieRad = {
                        periode_start: s.periode_start, periode_slut: s.periode_slut,
                        med_balancering: Boolean(s.med_balancering), balancing_method: s.balancing_method,
                        mip_rel_gap: s.mip_rel_gap == null ? null : Number(s.mip_rel_gap),
                        mip_abs_gap: s.mip_abs_gap == null ? null : Number(s.mip_abs_gap),
                        tidsgraense_s: s.tidsgraense_s == null ? null : Number(s.tidsgraense_s),
                        ekstra_flag: s.ekstra_flag, heat_csv: s.heat_csv,
                    };
                    // KONTRAKT §6d: værkets gyldige tidsserier, låst som resten af snapshottet, så en samtidig
                    // aktivering ikke kan blandes ind i det frosne input.
                    const tidsserier = ((await req().input('v', sql.UniqueIdentifier, v.id).query(`
                        SELECT id, rolle, navn, sha256, sti, oploesning, start, slut, aktiv, validering_json
                        FROM dbo.Tidsseries WITH (UPDLOCK, HOLDLOCK) WHERE vaerk_id = @v AND status = 'gyldig'`)).recordset as
                        { id: string; rolle: 'varmelast' | 'solprofil'; navn: string; sha256: string; sti: string; oploesning: string; start: Date; slut: Date; aktiv: boolean; validering_json: string | null }[])
                        .map((t): TidsserieRad => ({ ...t, id: lc(t.id), aktiv: Boolean(t.aktiv), start: new Date(t.start).toISOString(), slut: new Date(t.slut).toISOString() }));
                    const frossen = bygFrossetInput(params, aendr, scenarie,
                        { model_commit: motor.model_commit, data_commit: motor.data_commit }, tidsserier);

                    const id = randomUUID();
                    await req()
                        .input('id', sql.UniqueIdentifier, id)
                        .input('b', sql.UniqueIdentifier, b.id)
                        .input('s', sql.UniqueIdentifier, s.id)
                        .input('v', sql.UniqueIdentifier, v.id)
                        .input('rev', sql.Int, v.revision)
                        .input('hash', sql.NVarChar(64), frossen.hash)
                        .input('af', sql.NVarChar(200), b.bestilt_af)
                        .input('bestilt', sql.DateTime2, b.bestilt)
                        .input('mc', sql.NVarChar(40), motor.model_commit)
                        .input('dc', sql.NVarChar(40), motor.data_commit)
                        .input('rel', sql.Decimal(18, 10), frossen.effektiv.mip_rel_gap)
                        .input('abs', sql.Decimal(28, 4), frossen.effektiv.mip_abs_gap)
                        .query(`
                            INSERT INTO dbo.Koersels (id, bestilling_id, scenarie_id, vaerk_id, vaerk_revision, input_hash, status, fase,
                                                      bestilt_af, bestilt, modtaget, forsoeg, kilde, oensket_rel_gap, oensket_abs_gap,
                                                      model_commit, data_commit)
                            VALUES (@id, @b, @s, @v, @rev, @hash, 'koe', N'I kø', @af, @bestilt, SYSUTCDATETIME(), 0, 'app', @rel, @abs,
                                    @mc, @dc)`);
                    // K2-F9: `modtaget` (servertid) er køens sorteringsnøgle; `bestilt` er klientens og kun diagnostik.
                    await indsætInput(req, id, frossen.rækker);
                    return id;
                });
            } catch (e) {
                const tekst = afvisningstekst(e);
                if (tekst) return { ok: false, afvist: tekst };
                if (erUnikBrud(e)) {
                    // To samtidige kald med samme bestilling: den anden taber på den unikke bestilling_id.
                    const efter = await findes();
                    if (efter) return { ok: true, koersel_id: lc(efter.id), status: efter.status, ny: false };
                }
                return { ok: false, afvist: tekniskFejl('startBestilling', e) };
            }

            const arbejder = await startJobHvisFri(pool, ctx.Tokens.Fabric);
            const nu = await findes();
            return { ok: true, koersel_id: koerselId, status: nu?.status ?? 'koe', ny: true, arbejder };
        } finally {
            await pool.close();
        }
    },
    [],
);

/** Indsætter det frosne input i bidder (SQL Server tillader højst 2100 parametre pr. kald). */
async function indsætInput(req: () => sql.Request, koerselId: string, rækker: readonly InputRad[]): Promise<void> {
    const BID = 400; // 4 parametre pr. række + koersel_id
    for (let i = 0; i < rækker.length; i += BID) {
        const del = rækker.slice(i, i + BID);
        const r = req().input('k', sql.UniqueIdentifier, koerselId);
        const værdier = del.map((rad, j) => {
            r.input(`i${j}`, sql.UniqueIdentifier, randomUUID());
            r.input(`s${j}`, sql.NVarChar(400), rad.sti);
            r.input(`v${j}`, sql.NVarChar(4000), rad.vaerdi_json);
            r.input(`q${j}`, sql.NVarChar(20), rad.kilde);
            return `(@i${j}, @k, @s${j}, @v${j}, @q${j})`;
        });
        await r.query(`INSERT INTO dbo.KoerselInputs (id, koersel_id, sti, vaerdi_json, kilde) VALUES ${værdier.join(', ')}`);
    }
}

// ------------------------------------------------------------------ nyt værk fra bunden

interface AnmodningRad { id: string; anmodet_af: string }

/**
 * Finder et udkasts dele: anmodninger fra SAMME bruger (`anmodet_af` er DAB-verificeret ved create), status 'ny',
 * af typen opret_vaerk_del med netop dette udkast. `udkast` er valideret som uuid, så LIKE-mønstret kan ikke
 * indeholde jokertegn; det er kun et forfilter — typen og udkastet afgøres ved at læse hver række.
 */
async function findDele(req: () => sql.Request, anmodetAf: string, udkast: string, lås: boolean): Promise<{ id: string; del: OpretVaerkDel }[]> {
    const r = await req().input('af', sql.NVarChar(200), anmodetAf).input('m', sql.NVarChar(100), `%${udkast}%`).query(`
        SELECT id, aendringer_json FROM dbo.Aendringsanmodnings ${lås ? 'WITH (UPDLOCK, HOLDLOCK)' : ''}
        WHERE anmodet_af = @af AND status = 'ny' AND aendringer_json LIKE @m`);
    const ud: { id: string; del: OpretVaerkDel }[] = [];
    for (const rad of r.recordset as { id: string; aendringer_json: string }[]) {
        try {
            const x = læsAnmodning(rad.aendringer_json);
            if (x.type === 'opret_del' && x.del.udkast === udkast) ud.push({ id: lc(rad.id), del: x.del });
        } catch { /* en ugyldig række med uuid'et i teksten er ikke en del */ }
    }
    return ud;
}

/** Indsætter et nyt værks blade i bidder (SQL Server: højst 2100 parametre pr. kald; 7 pr. række). */
async function indsætBlade(req: () => sql.Request, vaerkId: string, af: string, blade: readonly NytBlad[]): Promise<void> {
    const BID = 250;
    for (let i = 0; i < blade.length; i += BID) {
        const r = req().input('v', sql.UniqueIdentifier, vaerkId).input('af', sql.NVarChar(200), af);
        const værdier = blade.slice(i, i + BID).map((b, j) => {
            r.input(`s${j}`, sql.NVarChar(400), b.sti).input(`n${j}`, sql.NVarChar(4000), b.vaerdi_json)
                .input(`k${j}`, sql.NVarChar(60), b.sektion).input(`o${j}`, sql.NVarChar(120), b.objekt)
                .input(`c${j}`, sql.NVarChar(2000), b.kommentar).input(`b${j}`, sql.Bit, b.bekraeft).input(`r${j}`, sql.Int, b.raekkefoelge);
            return `(NEWID(), @v, @s${j}, @n${j}, @k${j}, @o${j}, @c${j}, @b${j}, @r${j}, @af, SYSUTCDATETIME())`;
        });
        await r.query(`INSERT INTO dbo.VaerkParameters (id, vaerk_id, sti, vaerdi_json, sektion, objekt, kommentar, bekraeft,
                                                        raekkefoelge, aendret_af, aendret) VALUES ${værdier.join(', ')}`);
    }
}

/**
 * opret_vaerk: samler delene og opretter værket i den transaktion, `udfoerAendring` allerede har åbnet — samme
 * form som kopier_vaerk (kilde 'app', revision 1, én log-række 'opret' pr. blad med anmodningens id), men uden
 * kildeværk. Delene og den afsluttende anmodning sættes 'udfoert' sammen; afvises noget, ruller alt tilbage.
 */
async function opretVaerk(req: () => sql.Request, a: AnmodningRad, o: OpretVaerk): Promise<Aendringssvar> {
    const dele = await findDele(req, a.anmodet_af, o.udkast, true);
    const blade = samlNytVaerk(dele.map((d) => d.del), o.dele, o.udkast);
    const optaget = (await req().input('k', sql.NVarChar(60), o.ny_kode)
        .query('SELECT COUNT(*) AS n FROM dbo.Vaerks WITH (UPDLOCK, HOLDLOCK) WHERE kode = @k')).recordset[0].n;
    if (Number(optaget) > 0) throw new Afvisning(`Koden "${o.ny_kode}" er allerede i brug.`);
    const nyId = randomUUID();
    try {
        await req()
            .input('ny', sql.UniqueIdentifier, nyId).input('k', sql.NVarChar(60), o.ny_kode).input('navn', sql.NVarChar(200), o.navn)
            .input('besk', sql.NVarChar(4000), o.beskrivelse ?? null).input('af', sql.NVarChar(200), a.anmodet_af)
            .query(`INSERT INTO dbo.Vaerks (id, kode, navn, beskrivelse, kilde, kopieret_fra_id, revision, arkiveret,
                                            oprettet_af, aendret_af, oprettet, aendret)
                    VALUES (@ny, @k, @navn, @besk, 'app', NULL, 1, 0, @af, @af, SYSUTCDATETIME(), SYSUTCDATETIME())`);
    } catch (e) {
        if (erUnikBrud(e)) throw new Afvisning(`Koden "${o.ny_kode}" er allerede i brug.`);
        throw e;
    }
    await indsætBlade(req, nyId, a.anmodet_af, blade);
    await req().input('ny', sql.UniqueIdentifier, nyId).input('af', sql.NVarChar(200), a.anmodet_af).input('anm', sql.UniqueIdentifier, a.id)
        .query(`INSERT INTO dbo.Aendringslogs (id, vaerk_id, revision, sti, handling, gammel_json, ny_json, aendret_af, tidspunkt, anmodning_id)
                SELECT NEWID(), @ny, 1, sti, 'opret', NULL, vaerdi_json, @af, SYSUTCDATETIME(), @anm
                FROM dbo.VaerkParameters WHERE vaerk_id = @ny`);
    const n = Number((await req().input('ny', sql.UniqueIdentifier, nyId)
        .query('SELECT COUNT(*) AS n FROM dbo.VaerkParameters WHERE vaerk_id = @ny')).recordset[0].n);
    if (n !== blade.length) throw new Error(`Uventet: ${n} parametre indsat, ${blade.length} forventet.`);

    const svar = `Værket "${o.ny_kode}" er oprettet fra bunden med ${n} parametre (${blade.filter((b) => b.bekraeft).length} skal bekræftes).`;
    for (const d of dele) {
        const u = await req().input('d', sql.UniqueIdentifier, d.id).input('svar', sql.NVarChar(2000), `Del ${d.del.nr}/${d.del.af}: ${svar}`.slice(0, 2000))
            .query(`UPDATE dbo.Aendringsanmodnings SET status = 'udfoert', svar = @svar WHERE id = @d AND status = 'ny'`);
        if (u.rowsAffected[0] !== 1) throw new Error(`Uventet: del ${d.del.nr} blev ændret samtidig.`);
    }
    await req().input('a', sql.UniqueIdentifier, a.id).input('svar', sql.NVarChar(2000), svar.slice(0, 2000))
        .query(`UPDATE dbo.Aendringsanmodnings SET status = 'udfoert', svar = @svar WHERE id = @a AND status = 'ny'`);
    return { ok: true, status: 'udfoert', svar, vaerk_id: nyId, revision: 1 };
}

// ------------------------------------------------------------------ tidsserier (KONTRAKT §6d)

/**
 * aktiver_tidsserie: højst én aktiv pr. værk + rolle. Rollens rækker låses, alle andre sættes inaktive og den
 * valgte aktiv (eller inaktiv) i samme transaktion. Kun en GYLDIG serie af netop anmodningens værk kan aktiveres.
 */
async function aktiverTidsserie(req: () => sql.Request, a: AnmodningRad & { vaerk_id: string }, o: AktiverTidsserie): Promise<Aendringssvar> {
    const ts = (await req().input('t', sql.UniqueIdentifier, o.tidsserie_id).query(`
        SELECT id, vaerk_id, rolle, navn, status FROM dbo.Tidsseries WITH (UPDLOCK, HOLDLOCK) WHERE id = @t`)).recordset[0];
    if (!ts) throw new Afvisning('Tidsserien findes ikke.');
    if (lc(ts.vaerk_id) !== lc(a.vaerk_id)) throw new Afvisning('Tidsserien hører til et andet værk.');
    if (o.aktiv && ts.status !== 'gyldig') throw new Afvisning(`"${ts.navn}" er ${ts.status} og kan ikke gøres aktiv.`);
    await req().input('v', sql.UniqueIdentifier, ts.vaerk_id).input('r', sql.NVarChar(20), ts.rolle)
        .query(`SELECT id FROM dbo.Tidsseries WITH (UPDLOCK, HOLDLOCK) WHERE vaerk_id = @v AND rolle = @r`);
    if (o.aktiv) {
        await req().input('v', sql.UniqueIdentifier, ts.vaerk_id).input('r', sql.NVarChar(20), ts.rolle).input('t', sql.UniqueIdentifier, ts.id)
            .query(`UPDATE dbo.Tidsseries SET aktiv = 0 WHERE vaerk_id = @v AND rolle = @r AND id <> @t AND aktiv = 1`);
    }
    await req().input('t', sql.UniqueIdentifier, ts.id).input('a', sql.Bit, o.aktiv).query('UPDATE dbo.Tidsseries SET aktiv = @a WHERE id = @t');
    const svar = o.aktiv ? `"${ts.navn}" er nu værkets aktive ${ts.rolle}.` : `"${ts.navn}" er ikke længere aktiv.`;
    await req().input('a', sql.UniqueIdentifier, a.id).input('svar', sql.NVarChar(2000), svar)
        .query(`UPDATE dbo.Aendringsanmodnings SET status = 'udfoert', svar = @svar WHERE id = @a AND status = 'ny'`);
    return { ok: true, status: 'udfoert', svar, vaerk_id: lc(ts.vaerk_id) };
}

// ------------------------------------------------------------------ udfoerAendring

udf.func(
    'udfoerAendring',
    async (ctx: RayfinContext<Skema, AudienceType.Sql>, anmodningId: string): Promise<Aendringssvar> => {
        if (!uuid(anmodningId)) return { ok: false, status: 'afvist', svar: 'Ugyldigt anmodnings-id.' };
        const pool = await forbind(ctx.Tokens.Sql);
        try {
            const a = (await pool.request().input('a', sql.UniqueIdentifier, anmodningId).query(`
                SELECT id, vaerk_id, forventet_revision, aendringer_json, anmodet_af, status, svar
                FROM dbo.Aendringsanmodnings WHERE id = @a`)).recordset[0];
            if (!a) return { ok: false, status: 'afvist', svar: 'Anmodningen findes ikke.' };
            // K2-F10: kun backend skriver status/svar; DAB afviser create med anden status end 'ny'.
            // Et klientleveret `svar` på en 'ny' anmodning ignoreres (overskrives ved behandlingen).
            if (a.status !== 'ny') return { ok: a.status === 'udfoert', status: a.status, svar: a.svar ?? '' };

            let udkast: string | null = null;
            try {
                const anmodning = læsAnmodning(a.aendringer_json);
                // En del af et nyt værk udføres aldrig alene; den bliver stående som 'ny' til den afsluttende
                // opret_vaerk-anmodning samler den (eller afviser den sammen med oprettelsen).
                if (anmodning.type === 'opret_del') {
                    return { ok: false, status: 'ny', svar: `Del ${anmodning.del.nr} af ${anmodning.del.af} af et nyt værk — udføres sammen med den afsluttende oprettelse.` };
                }
                if (anmodning.type === 'upload_tidsserie' || anmodning.type === 'upload_vaerksark') {
                    return { ok: false, status: 'ny', svar: 'En upload udføres sammen med filen af uploadTidsserie/uploadVaerksark.' };
                }
                if (anmodning.type === 'opret') udkast = anmodning.opret.udkast;
                return await iTransaktion(pool, async (req) => {
                    const igen = (await req().input('a', sql.UniqueIdentifier, a.id)
                        .query('SELECT status, svar FROM dbo.Aendringsanmodnings WITH (UPDLOCK, HOLDLOCK) WHERE id = @a')).recordset[0];
                    if (igen.status !== 'ny') return { ok: igen.status === 'udfoert', status: igen.status, svar: igen.svar ?? '' };

                    if (anmodning.type === 'opret') return opretVaerk(req, a, anmodning.opret);
                    if (anmodning.type === 'aktiver_tidsserie') return aktiverTidsserie(req, a, anmodning.aktiver);

                    const v = (await req().input('v', sql.UniqueIdentifier, a.vaerk_id).query(`
                        SELECT id, kode, navn, revision, arkiveret FROM dbo.Vaerks WITH (UPDLOCK, HOLDLOCK) WHERE id = @v`)).recordset[0];
                    if (!v) throw new Afvisning('Værket findes ikke.');

                    const afslut = async (svar: string, vaerkId: string, revision: number): Promise<Aendringssvar> => {
                        await req().input('a', sql.UniqueIdentifier, a.id).input('svar', sql.NVarChar(2000), svar.slice(0, 2000))
                            .query(`UPDATE dbo.Aendringsanmodnings SET status = 'udfoert', svar = @svar WHERE id = @a AND status = 'ny'`);
                        return { ok: true, status: 'udfoert', svar, vaerk_id: vaerkId, revision };
                    };

                    if (anmodning.type === 'kopi') {
                        const { ny_kode, navn, beskrivelse } = anmodning.kopi;
                        const optaget = (await req().input('k', sql.NVarChar(60), ny_kode)
                            .query('SELECT COUNT(*) AS n FROM dbo.Vaerks WHERE kode = @k')).recordset[0].n;
                        if (Number(optaget) > 0) throw new Afvisning(`Koden "${ny_kode}" er allerede i brug.`);
                        const nyId = randomUUID();
                        await req()
                            .input('ny', sql.UniqueIdentifier, nyId).input('fra', sql.UniqueIdentifier, v.id)
                            .input('k', sql.NVarChar(60), ny_kode).input('navn', sql.NVarChar(200), navn)
                            .input('besk', sql.NVarChar(4000), beskrivelse ?? null)
                            .input('af', sql.NVarChar(200), a.anmodet_af).input('anm', sql.UniqueIdentifier, a.id)
                            .query(`
                                INSERT INTO dbo.Vaerks (id, kode, navn, beskrivelse, kilde, kopieret_fra_id, revision, arkiveret,
                                                        oprettet_af, aendret_af, oprettet, aendret)
                                VALUES (@ny, @k, @navn, @besk, 'app', @fra, 1, 0, @af, @af, SYSUTCDATETIME(), SYSUTCDATETIME());
                                INSERT INTO dbo.VaerkParameters (id, vaerk_id, sti, vaerdi_json, sektion, objekt, kommentar, bekraeft,
                                                                 raekkefoelge, aendret_af, aendret)
                                SELECT NEWID(), @ny, sti, vaerdi_json, sektion, objekt, kommentar, bekraeft, raekkefoelge, @af, SYSUTCDATETIME()
                                FROM dbo.VaerkParameters WHERE vaerk_id = @fra;
                                INSERT INTO dbo.Aendringslogs (id, vaerk_id, revision, sti, handling, gammel_json, ny_json, aendret_af, tidspunkt, anmodning_id)
                                SELECT NEWID(), @ny, 1, sti, 'opret', NULL, vaerdi_json, @af, SYSUTCDATETIME(), @anm
                                FROM dbo.VaerkParameters WHERE vaerk_id = @ny;`);
                        const n = (await req().input('ny', sql.UniqueIdentifier, nyId)
                            .query('SELECT COUNT(*) AS n FROM dbo.VaerkParameters WHERE vaerk_id = @ny')).recordset[0].n;
                        return afslut(`Værket "${ny_kode}" er oprettet som kopi af "${v.kode}" (revision ${v.revision}) med ${n} parametre.`, nyId, 1);
                    }

                    if (v.arkiveret) throw new Afvisning('Værket er arkiveret og kan ikke ændres.');
                    if (Number(v.revision) !== Number(a.forventet_revision)) {
                        throw new Afvisning(
                            `Værket er ændret, siden du begyndte at redigere (revision ${a.forventet_revision} → ${v.revision}). ` +
                            `Genindlæs værket og læg dine ændringer ind igen.`,
                        );
                    }
                    const rækker = (await req().input('v', sql.UniqueIdentifier, v.id)
                        .query('SELECT sti, vaerdi_json, raekkefoelge FROM dbo.VaerkParameters WHERE vaerk_id = @v')).recordset as
                        { sti: string; vaerdi_json: string; raekkefoelge: number }[];
                    const nuværende = new Map(rækker.map((r) => [r.sti, r.vaerdi_json]));
                    if (nuværende.size !== rækker.length) throw new Afvisning('Værket har dobbelte parametre — det skal ryddes op, før det kan ændres.');
                    const plan = planlægParametre(nuværende, anmodning.aendringer);
                    const nyRev = Number(v.revision) + 1;
                    let næsteRække = rækker.reduce((m, r) => Math.max(m, Number(r.raekkefoelge)), 0) + 1;

                    const log = (sti: string, handling: string, gammel: string | null, ny: string | null) =>
                        req().input('v', sql.UniqueIdentifier, v.id).input('rev', sql.Int, nyRev).input('sti', sql.NVarChar(400), sti)
                            .input('h', sql.NVarChar(10), handling).input('g', sql.NVarChar(4000), gammel).input('n', sql.NVarChar(4000), ny)
                            .input('af', sql.NVarChar(200), a.anmodet_af).input('anm', sql.UniqueIdentifier, a.id)
                            .query(`INSERT INTO dbo.Aendringslogs (id, vaerk_id, revision, sti, handling, gammel_json, ny_json, aendret_af, tidspunkt, anmodning_id)
                                    VALUES (NEWID(), @v, @rev, @sti, @h, @g, @n, @af, SYSUTCDATETIME(), @anm)`);

                    for (const r of plan.ret) {
                        const u = await req().input('v', sql.UniqueIdentifier, v.id).input('sti', sql.NVarChar(400), r.sti)
                            .input('n', sql.NVarChar(4000), r.ny_json).input('af', sql.NVarChar(200), a.anmodet_af)
                            .query(`UPDATE dbo.VaerkParameters SET vaerdi_json = @n, aendret_af = @af, aendret = SYSUTCDATETIME()
                                    WHERE vaerk_id = @v AND sti = @sti`);
                        if (u.rowsAffected[0] !== 1) throw new Error(`Uventet: ${u.rowsAffected[0]} rækker ramt for ${r.sti}`);
                        await log(r.sti, 'ret', r.gammel_json, r.ny_json);
                    }
                    for (const r of plan.slet) {
                        await req().input('v', sql.UniqueIdentifier, v.id).input('sti', sql.NVarChar(400), r.sti)
                            .query('DELETE FROM dbo.VaerkParameters WHERE vaerk_id = @v AND sti = @sti');
                        await log(r.sti, 'slet', r.gammel_json, null);
                    }
                    for (const r of plan.opret) {
                        await req().input('v', sql.UniqueIdentifier, v.id).input('sti', sql.NVarChar(400), r.sti)
                            .input('n', sql.NVarChar(4000), r.ny_json).input('sek', sql.NVarChar(60), r.sektion)
                            .input('obj', sql.NVarChar(120), r.objekt).input('rk', sql.Int, næsteRække++)
                            .input('af', sql.NVarChar(200), a.anmodet_af)
                            .query(`INSERT INTO dbo.VaerkParameters (id, vaerk_id, sti, vaerdi_json, sektion, objekt, kommentar, bekraeft,
                                                                     raekkefoelge, aendret_af, aendret)
                                    VALUES (NEWID(), @v, @sti, @n, @sek, @obj, NULL, 0, @rk, @af, SYSUTCDATETIME())`);
                        await log(r.sti, 'opret', null, r.ny_json);
                    }
                    const u = await req().input('v', sql.UniqueIdentifier, v.id).input('gl', sql.Int, v.revision)
                        .input('ny', sql.Int, nyRev).input('af', sql.NVarChar(200), a.anmodet_af)
                        .query(`UPDATE dbo.Vaerks SET revision = @ny, aendret_af = @af, aendret = SYSUTCDATETIME()
                                WHERE id = @v AND revision = @gl`);
                    if (u.rowsAffected[0] !== 1) throw new Afvisning('Værket blev ændret samtidig af en anden. Genindlæs og prøv igen.');
                    const antal = plan.ret.length + plan.slet.length + plan.opret.length;
                    return afslut(`${antal} ændring(er) gemt i "${v.kode}" (revision ${v.revision} → ${nyRev}).`, lc(v.id), nyRev);
                }, sql.ISOLATION_LEVEL.READ_COMMITTED);
            } catch (e) {
                const tekst = afvisningstekst(e);
                if (!tekst) return { ok: false, status: 'ny', svar: tekniskFejl('udfoerAendring', e) + ' Intet er ændret; prøv igen.' };
                await pool.request().input('a', sql.UniqueIdentifier, a.id).input('svar', sql.NVarChar(2000), tekst.slice(0, 2000))
                    .query(`UPDATE dbo.Aendringsanmodnings SET status = 'afvist', svar = @svar WHERE id = @a AND status = 'ny'`);
                // Afvises en oprettelse, afvises dens dele også, så de ikke ligger og venter.
                if (udkast) {
                    for (const d of await findDele(() => pool.request(), a.anmodet_af, udkast, false)) {
                        await pool.request().input('d', sql.UniqueIdentifier, d.id).input('svar', sql.NVarChar(2000), `Oprettelsen blev afvist: ${tekst}`.slice(0, 2000))
                            .query(`UPDATE dbo.Aendringsanmodnings SET status = 'afvist', svar = @svar WHERE id = @d AND status = 'ny'`);
                    }
                }
                return { ok: false, status: 'afvist', svar: tekst };
            }
        } finally {
            await pool.close();
        }
    },
    [],
);

// ------------------------------------------------------------------ afstem

/**
 * KONTRAKT §6c: en kørsel i `koerer`/`indlaeser`, mens solver-låsen er fri, er død (ejeren skal holde låsen)
 * -> `fejl`, betinget på observeret status og arbejder_id. Derefter startes et job, hvis køen ikke er tom.
 * Hjerteslag bruges kun til visning.
 */
udf.func(
    'afstem',
    async (ctx: RayfinContext<Skema, AudienceType.Sql | AudienceType.Fabric>): Promise<Afstemningssvar> => {
        const pool = await forbind(ctx.Tokens.Sql);
        try {
            const døde = await markérDøde(pool);
            const ændret = (døde ?? []).map((d) => `${d.id}: fejl (${d.status} uden levende arbejder)`);
            const arbejder = await startJobHvisFri(pool, ctx.Tokens.Fabric);
            return { tjekket: døde === null ? 0 : døde.length, aendret: ændret, arbejder };
        } finally {
            await pool.close();
        }
    },
    [],
);

// ------------------------------------------------------------------ annullerKoersel

/**
 * KONTRAKT §6c: samarbejdende annullering. `koe` -> `annulleret` direkte (betinget). En aktiv kørsel får
 * `annuller_anmodet`; arbejderen ser flaget, stopper solveren og sætter selv `annulleret`. Jobs-API'ets
 * cancel bruges ikke (K2-F5: et job kan være gået videre til næste kørsel).
 */
udf.func(
    'annullerKoersel',
    async (ctx: RayfinContext<Skema, AudienceType.Sql>, koerselId: string): Promise<Annulleringssvar> => {
        if (!uuid(koerselId)) return { ok: false, status: 'ukendt', besked: 'Ugyldigt kørsels-id.' };
        const pool = await forbind(ctx.Tokens.Sql);
        try {
            const læs = async () => (await pool.request().input('id', sql.UniqueIdentifier, koerselId)
                .query('SELECT id, status, annuller_anmodet FROM dbo.Koersels WHERE id = @id')).recordset[0] as
                { id: string; status: string; annuller_anmodet: Date | null } | undefined;
            const r = await læs();
            if (!r) return { ok: false, status: 'ukendt', besked: 'Kørslen findes ikke.' };

            if (r.status === 'koe' || r.status === 'startet') {
                // `startet` er en forældet reservation fra før §6c; ingen arbejder tager den.
                const u = await pool.request().input('id', sql.UniqueIdentifier, koerselId).input('s', sql.NVarChar(20), r.status).query(`
                    UPDATE dbo.Koersels SET status = 'annulleret', afsluttet = SYSUTCDATETIME(), fase = N'Annulleret før start'
                    WHERE id = @id AND status = @s`);
                if (u.rowsAffected[0] === 1) return { ok: true, status: 'annulleret', besked: 'Kørslen er annulleret.' };
                const nu = await læs();
                return { ok: false, status: nu?.status ?? 'ukendt', besked: `Kørslen nåede at skifte til "${nu?.status}" imens — prøv igen.` };
            }
            if (r.status === 'koerer' || r.status === 'indlaeser') {
                if (r.annuller_anmodet) return { ok: true, status: r.status, besked: 'Annullering er allerede anmodet; arbejderen stopper kørslen.' };
                const u = await pool.request().input('id', sql.UniqueIdentifier, koerselId).input('s', sql.NVarChar(20), r.status).query(`
                    UPDATE dbo.Koersels SET annuller_anmodet = SYSUTCDATETIME(), fase = N'Annullering anmodet'
                    WHERE id = @id AND status = @s AND annuller_anmodet IS NULL`);
                if (u.rowsAffected[0] === 1) {
                    return { ok: true, status: r.status, besked: 'Annullering er anmodet. Arbejderen stopper solveren og markerer kørslen annulleret.' };
                }
                const nu = await læs();
                return { ok: false, status: nu?.status ?? 'ukendt', besked: `Kørslen skiftede til "${nu?.status}" imens — intet er ændret.` };
            }
            return { ok: false, status: r.status, besked: `Kørslen er allerede ${r.status} og kan ikke annulleres.` };
        } finally {
            await pool.close();
        }
    },
    [],
);

// ------------------------------------------------------------------ kildefil

export interface Kildefil { ok: boolean; kode?: string; tekst?: string; bytes?: number; fejl?: string }

const MAKS_KILDEFIL = 1_000_000;

/**
 * Værkets oprindelige case-YAML (med kommentarer) fra lakehouset: `Files/fjv/vaerker/<kode>/kilde.yaml`,
 * skrevet af importeren. Kalderen giver kun værkets id; koden slås op i databasen, så ingen sti kan
 * komme udefra. Kun til visning — sandheden er VaerkParameter.
 */
udf.func(
    'hentKildeYaml',
    async (ctx: RayfinContext<Skema, AudienceType.Sql | AudienceType.Storage>, vaerkId: string): Promise<Kildefil> => {
        if (!uuid(vaerkId)) return { ok: false, fejl: 'Ugyldigt værks-id.' };
        const pool = await forbind(ctx.Tokens.Sql);
        let kode: string | undefined;
        try {
            kode = (await pool.request().input('v', sql.UniqueIdentifier, vaerkId)
                .query('SELECT kode FROM dbo.Vaerks WHERE id = @v')).recordset[0]?.kode;
        } finally {
            await pool.close();
        }
        if (!kode) return { ok: false, fejl: 'Værket findes ikke.' };
        if (!/^[a-z0-9_]+$/.test(kode)) return { ok: false, kode, fejl: 'Værkets kode er ugyldig.' };
        try {
            const url = `${ONELAKE_DFS}/${WORKSPACE_ID}/${LAKEHOUSE_ID}/Files/fjv/vaerker/${kode}/kilde.yaml`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${ctx.Tokens.Storage}`, 'x-ms-version': '2023-11-03' } });
            if (res.status === 404) {
                return { ok: false, kode, fejl: 'Der findes ingen kildefil for værket (fx et værk oprettet som kopi i appen).' };
            }
            if (!res.ok) return { ok: false, kode, fejl: `Lakehouset svarede HTTP ${res.status}.` };
            const tekst = await res.text();
            if (tekst.length > MAKS_KILDEFIL) return { ok: false, kode, fejl: `Kildefilen er for stor til visning (${tekst.length} tegn).` };
            return { ok: true, kode, tekst, bytes: tekst.length };
        } catch (e) {
            return { ok: false, kode, fejl: tekniskFejl('hentKildeYaml', e) };
        }
    },
    [],
);

// ------------------------------------------------------------------ tidsserier og værksark (KONTRAKT §6d)

/** `validering_json` er den samme kompakte JSON, der står på Tidsserie-rækken (data_krav.json › validering_json). */
export interface Uploadsvar { ok: boolean; status: string; svar: string; tidsserie_id?: string; import_id?: string; validering_json?: string }
export interface Tidsseriedata { ok: boolean; fejl?: string; positioner?: number; id?: string; navn?: string; rolle?: string; start?: string; oploesning?: string; enhed?: string; vaerdier?: (number | null)[] }

/** Anmodningen bag en upload: skal være 'ny', af den rette type, og indholdet skal have anmodningens sha256. */
async function læsUploadAnmodning<T extends 'upload_tidsserie' | 'upload_vaerksark'>(pool: sql.ConnectionPool, anmodningId: string, type: T, indhold: string) {
    const a = (await pool.request().input('a', sql.UniqueIdentifier, anmodningId).query(`
        SELECT id, vaerk_id, aendringer_json, anmodet_af, status, svar FROM dbo.Aendringsanmodnings WHERE id = @a`)).recordset[0];
    if (!a) return { fejl: { ok: false, status: 'afvist', svar: 'Anmodningen findes ikke.' } as Uploadsvar };
    if (a.status !== 'ny') return { fejl: { ok: a.status === 'udfoert', status: a.status, svar: a.svar ?? '' } as Uploadsvar };
    const x = læsAnmodning(a.aendringer_json);
    if (x.type !== type) throw new Afvisning(`Anmodningen er ikke en ${type === 'upload_tidsserie' ? 'tidsserie-upload' : 'værksark-upload'}.`);
    const upload = (x as Extract<typeof x, { type: T }>).upload;
    if (sha256Hex(indhold) !== upload.sha256) throw new Afvisning('Filens indhold passer ikke med anmodningens sha256 — upload filen igen.');
    return { a, upload: upload as T extends 'upload_tidsserie' ? UploadTidsserie : UploadVaerksark };
}

async function afvisAnmodning(pool: sql.ConnectionPool, id: string, tekst: string): Promise<void> {
    await pool.request().input('a', sql.UniqueIdentifier, id).input('svar', sql.NVarChar(2000), tekst.slice(0, 2000))
        .query(`UPDATE dbo.Aendringsanmodnings SET status = 'afvist', svar = @svar WHERE id = @a AND status = 'ny'`);
}

/**
 * uploadTidsserie(anmodningId, indholdBase64): filens RÅ bytes som base64 (så tolkeren selv kan genkende
 * Windows-1252), valideret med den fælles tolker (tidsserie-validering.ts = fv-data's orakel) og værkets egne
 * enheder/lagre. Skriver den normaliserede fil `Files/fjv/tidsserier/<kode>/<sha256>.csv` (sha256 af dens bytes)
 * og rækken i Tidsseries (gyldig eller afvist, aldrig aktiv). Klienten opretter først en Aendringsanmodning
 * `upload_tidsserie` i eget navn med base64-tekstens sha256 (identiteten og bindingen til netop dette indhold).
 */
udf.func(
    'uploadTidsserie',
    async (ctx: RayfinContext<Skema, AudienceType.Sql | AudienceType.Storage>, anmodningId: string, indholdBase64: string): Promise<Uploadsvar> => {
        if (!uuid(anmodningId)) return { ok: false, status: 'afvist', svar: 'Ugyldigt anmodnings-id.' };
        if (typeof indholdBase64 !== 'string' || !indholdBase64) return { ok: false, status: 'afvist', svar: 'Filen er tom.' };
        const pool = await forbind(ctx.Tokens.Sql);
        let anmId: string | null = null;
        try {
            const l = await læsUploadAnmodning(pool, anmodningId, 'upload_tidsserie', indholdBase64);
            if ('fejl' in l) return l.fejl!;
            const { a, upload } = l;
            anmId = a.id;
            const v = (await pool.request().input('v', sql.UniqueIdentifier, a.vaerk_id)
                .query('SELECT id, kode, arkiveret FROM dbo.Vaerks WHERE id = @v')).recordset[0];
            if (!v) throw new Afvisning('Værket findes ikke.');
            if (v.arkiveret) throw new Afvisning('Værket er arkiveret.');
            if (!/^[a-z0-9_]{1,60}$/.test(v.kode)) throw new Afvisning('Værkets kode er ugyldig.');
            if (!/^[A-Za-z0-9+/]+={0,2}$/.test(indholdBase64)) throw new Afvisning('Filen er ikke base64-kodet.');
            const rå = new Uint8Array(Buffer.from(indholdBase64, 'base64'));
            if (rå.byteLength > MAKS_UPLOAD_BYTES) throw new Afvisning(`Filen er for stor (${rå.byteLength} bytes; højst ${MAKS_UPLOAD_BYTES} gennem appen).`);
            const params = (await pool.request().input('v', sql.UniqueIdentifier, v.id)
                .query(`SELECT sti, vaerdi_json FROM dbo.VaerkParameters WHERE vaerk_id = @v AND (sti LIKE 'units.%' OR sti LIKE 'storage.%')`)).recordset as { sti: string; vaerdi_json: string }[];

            const r = validerUpload(rå, upload.rolle, { tidszone: upload.tidszone, tidsstempel: upload.tidsstempel, enhed: upload.enhed, kolonne: upload.kolonne }, vaerkTrae(params));
            const gyldig = r.status === 'gyldig' && r.normaliseret !== null;
            const fil = gyldig ? new TextEncoder().encode(r.normaliseret!) : null;
            const sha = fil ? sha256Bytes(fil) : null;
            // Tidsserie.sti er lakehouse-stien MED `Files/` (KONTRAKT §6d; som fv-fabric2's registrering og arbejderens
            // opslag). OneLake-hjælperen tager den Files-relative del.
            const relativ = sha ? `fjv/tidsserier/${v.kode}/${sha}.csv` : null;
            const sti = relativ ? `Files/${relativ}` : null;
            if (fil) await skrivFil(ctx.Tokens.Storage, relativ!, fil);

            const val = r.validering as Record<string, unknown> & { fund: { niveau: string; kode: string; besked: string }[] };
            const json = valideringJson(val as Parameters<typeof valideringJson>[0]);
            const id = randomUUID();
            const fejl = val.fund.filter((f) => f.niveau === 'fejl');
            const advarsler = val.fund.filter((f) => f.niveau === 'advarsel');
            const tekst = (k: string) => (typeof val[k] === 'string' ? (val[k] as string) : null);
            const tal = (k: string) => (typeof val[k] === 'number' ? (val[k] as number) : null);
            const svar = gyldig
                ? `"${upload.navn}" er gyldig: ${tal('antal_raekker')} timer, ${tekst('start')?.slice(0, 10)}–${tekst('slut')?.slice(0, 10)}${advarsler.length ? `; ${advarsler.length} advarsel(er)` : ''}.`
                : `"${upload.navn}" er afvist: ${fejl.map((f) => f.besked).join(' ')}`;
            return await iTransaktion(pool, async (req) => {
                const igen = (await req().input('a', sql.UniqueIdentifier, a.id)
                    .query('SELECT status, svar FROM dbo.Aendringsanmodnings WITH (UPDLOCK, HOLDLOCK) WHERE id = @a')).recordset[0];
                if (igen.status !== 'ny') return { ok: igen.status === 'udfoert', status: igen.status, svar: igen.svar ?? '' };
                await req()
                    .input('id', sql.UniqueIdentifier, id).input('v', sql.UniqueIdentifier, v.id).input('rolle', sql.NVarChar(20), upload.rolle)
                    .input('navn', sql.NVarChar(200), upload.navn).input('fil', sql.NVarChar(300), upload.filnavn).input('sti', sql.NVarChar(400), sti)
                    .input('sha', sql.NVarChar(64), sha).input('opl', sql.NVarChar(10), gyldig ? '1h' : null)
                    .input('start', sql.DateTime2, gyldig && tekst('start') ? new Date(tekst('start')!) : null)
                    .input('slut', sql.DateTime2, gyldig && tekst('slut') ? new Date(tekst('slut')!) : null)
                    .input('n', sql.Int, gyldig ? tal('antal_raekker') : null).input('huller', sql.Int, gyldig ? tal('antal_huller') : null)
                    .input('enhed', sql.NVarChar(20), gyldig ? 'MW' : null).input('ts', sql.NVarChar(10), upload.tidsstempel)
                    .input('tz', sql.NVarChar(40), upload.tidszone).input('status', sql.NVarChar(20), gyldig ? 'gyldig' : 'afvist')
                    .input('val', sql.NVarChar(4000), json).input('af', sql.NVarChar(200), a.anmodet_af)
                    .query(`INSERT INTO dbo.Tidsseries (id, vaerk_id, rolle, navn, filnavn, sti, sha256, oploesning, start, slut, antal_raekker,
                                                        antal_huller, enhed, tidsstempel, tidszone, kilde, status, validering_json, aktiv, uploadet_af, uploadet)
                            VALUES (@id, @v, @rolle, @navn, @fil, @sti, @sha, @opl, @start, @slut, @n, @huller, @enhed, @ts, @tz, 'csv', @status,
                                    @val, 0, @af, SYSUTCDATETIME())`);
                await req().input('a', sql.UniqueIdentifier, a.id).input('st', sql.NVarChar(20), gyldig ? 'udfoert' : 'afvist')
                    .input('svar', sql.NVarChar(2000), svar.slice(0, 2000))
                    .query(`UPDATE dbo.Aendringsanmodnings SET status = @st, svar = @svar WHERE id = @a AND status = 'ny'`);
                return { ok: gyldig, status: gyldig ? 'gyldig' : 'afvist', svar, tidsserie_id: id, validering_json: json };
            }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        } catch (e) {
            const tekst = afvisningstekst(e);
            if (!tekst) return { ok: false, status: 'ny', svar: tekniskFejl('uploadTidsserie', e) + ' Intet er gemt; prøv igen.' };
            if (anmId) await afvisAnmodning(pool, anmId, tekst);
            return { ok: false, status: 'afvist', svar: tekst };
        } finally {
            await pool.close();
        }
    },
    [],
);

/**
 * hentTidsserie(id, fra, til): værdierne kompakt (start + opløsning + array, null i huller) til fanen Tidsserier.
 * `fra`/`til` (ISO-tidspunkt, UTC; tom = seriens ende) giver et vindue. Højst MAKS_POSITIONER timer pr. svar (K5-F2).
 */
udf.func(
    'hentTidsserie',
    async (ctx: RayfinContext<Skema, AudienceType.Sql | AudienceType.Storage>, tidsserieId: string, fra: string, til: string): Promise<Tidsseriedata> => {
        if (!uuid(tidsserieId)) return { ok: false, fejl: 'Ugyldigt tidsserie-id.' };
        const tid = (s: string) => (s ? Date.parse(s) : undefined);
        const vindue = { fra: tid(fra), til: tid(til) };
        if (Number.isNaN(vindue.fra) || Number.isNaN(vindue.til)) return { ok: false, fejl: 'fra/til skal være ISO-tidspunkter (UTC) eller tomme.' };
        const pool = await forbind(ctx.Tokens.Sql);
        let t: { id: string; navn: string; rolle: string; sti: string | null; sha256: string | null; oploesning: string | null; status: string } | undefined;
        try {
            t = (await pool.request().input('t', sql.UniqueIdentifier, tidsserieId)
                .query('SELECT id, navn, rolle, sti, sha256, oploesning, status FROM dbo.Tidsseries WHERE id = @t')).recordset[0];
        } finally {
            await pool.close();
        }
        if (!t) return { ok: false, fejl: 'Tidsserien findes ikke.' };
        if (t.status !== 'gyldig' || !t.sti || !t.sha256) return { ok: false, fejl: `Tidsserien er ${t.status} og har ingen data at vise.` };
        try {
            // Rækker skrevet før 15:45 havde stien uden `Files/` — begge former læses.
            const tekst = await læsTekst(ctx.Tokens.Storage, t.sti.replace(/^Files\//, ''));
            if (tekst === null) return { ok: false, fejl: 'Tidsseriens fil findes ikke i lakehouset.' };
            if (sha256Hex(tekst) !== t.sha256) return { ok: false, fejl: 'Tidsseriens fil passer ikke med sin sha256 — den er ændret efter upload.' };
            return { ok: true, id: lc(t.id), navn: t.navn, rolle: t.rolle, ...tætRække(tekst, vindue) };
        } catch (e) {
            if (e instanceof ForLangRække) return { ok: false, fejl: e.message, positioner: e.positioner };
            return { ok: false, fejl: tekniskFejl('hentTidsserie', e) };
        }
    },
    [],
);



/**
 * uploadVaerksark(anmodningId, indholdBase64, basisBase64): gemmer `vaerksdata_skabelon.xlsx` i `Files/fjv/uploads/<id>.xlsx`,
 * opretter Vaerksarkimport (`koe`) og starter `fjv_importer_vaerksark` med `import_id` (uden solver-låsen).
 * Runde 12: med `basis_sha256` i anmodningen er uploaden en ny revision af `vaerk_id` — basis gemmes som
 * `<id>_basis.xlsx`, og importen bindes til værket fra start. `basisBase64` er tom for et nyt værk.
 */
udf.func(
    'uploadVaerksark',
    async (ctx: RayfinContext<Skema, AudienceType.Sql | AudienceType.Storage | AudienceType.Fabric>, anmodningId: string, indholdBase64: string, basisBase64?: string): Promise<Uploadsvar> => {
        if (!uuid(anmodningId)) return { ok: false, status: 'afvist', svar: 'Ugyldigt anmodnings-id.' };
        if (typeof indholdBase64 !== 'string' || !indholdBase64) return { ok: false, status: 'afvist', svar: 'Filen er tom.' };
        if (basisBase64 != null && typeof basisBase64 !== 'string') return { ok: false, status: 'afvist', svar: 'Basis-arket er ugyldigt.' };
        const pool = await forbind(ctx.Tokens.Sql);
        // K5-F4: forløbet står i vaerksark.ts (testet mod en falsk database); her er SQL'en.
        const deps: VaerksarkDeps = {
            læsAnmodning: async (id) => (await pool.request().input('a', sql.UniqueIdentifier, id).query(`
                SELECT id, status, svar, aendringer_json, anmodet_af, vaerk_id, forventet_revision FROM dbo.Aendringsanmodnings WHERE id = @a`)).recordset[0],
            læsImport: async (id) => (await pool.request().input('i', sql.UniqueIdentifier, id).query(`
                SELECT id, status, fabric_job_id, log FROM dbo.Vaerksarkimports WHERE id = @i`)).recordset[0],
            læsVaerk: async (id) => (uuid(id) ? (await pool.request().input('v', sql.UniqueIdentifier, id).query(`
                SELECT id, kode, revision, arkiveret FROM dbo.Vaerks WHERE id = @v`)).recordset[0] : undefined),
            skrivFil: async (sti, bytes) => { await skrivFil(ctx.Tokens.Storage, sti, bytes); },
            opretImport: (a, upload, sti, log) => iTransaktion(pool, async (req) => {
                const igen = (await req().input('a', sql.UniqueIdentifier, a.id)
                    .query('SELECT status FROM dbo.Aendringsanmodnings WITH (UPDLOCK, HOLDLOCK) WHERE id = @a')).recordset[0];
                if (igen?.status !== 'ny') return 'allerede_behandlet' as const;
                const findes = (await req().input('i', sql.UniqueIdentifier, a.id)
                    .query('SELECT COUNT(*) AS n FROM dbo.Vaerksarkimports WITH (UPDLOCK, HOLDLOCK) WHERE id = @i')).recordset[0].n;
                if (Number(findes) === 0) {
                    // Runde 12: en revision bindes til værket fra start (importen viser værket, mens den kører).
                    await req().input('id', sql.UniqueIdentifier, a.id).input('fil', sql.NVarChar(300), upload.filnavn).input('sti', sql.NVarChar(400), sti)
                        .input('log', sql.NVarChar(4000), log).input('af', sql.NVarChar(200), a.anmodet_af).input('ts', sql.Bit, upload.timeslut)
                        .input('v', sql.UniqueIdentifier, upload.basis_sha256 ? a.vaerk_id : null)
                        .query(`INSERT INTO dbo.Vaerksarkimports (id, filnavn, sti, status, log, timeslut, vaerk_id, uploadet_af, uploadet)
                                VALUES (@id, @fil, @sti, 'koe', @log, @ts, @v, @af, SYSUTCDATETIME())`);
                }
                const u = await req().input('a', sql.UniqueIdentifier, a.id).input('svar', sql.NVarChar(2000), `Værksarket "${upload.filnavn}" er modtaget (import ${lc(a.id)}).`)
                    .query(`UPDATE dbo.Aendringsanmodnings SET status = 'udfoert', svar = @svar WHERE id = @a AND status = 'ny'`);
                if (u.rowsAffected[0] !== 1) throw new Error('Uventet: anmodningen blev ændret samtidig.');
                return 'oprettet' as const;
            }, sql.ISOLATION_LEVEL.READ_COMMITTED),
            reserverJobstart: async (id) => (await pool.request().input('i', sql.UniqueIdentifier, id).query(`
                UPDATE dbo.Vaerksarkimports SET fabric_job_id = CONCAT('reserveret:', CONVERT(nvarchar(30), SYSUTCDATETIME(), 126))
                WHERE id = @i AND status = 'koe' AND (fabric_job_id IS NULL
                    OR (fabric_job_id LIKE 'reserveret:%' AND TRY_CONVERT(datetime2, SUBSTRING(fabric_job_id, 12, 30), 126) < DATEADD(minute, -5, SYSUTCDATETIME())))`)).rowsAffected[0] === 1,
            bindJob: async (id, jobId, log) => {
                await pool.request().input('i', sql.UniqueIdentifier, id).input('job', sql.NVarChar(100), jobId).input('log', sql.NVarChar(4000), log)
                    .query(`UPDATE dbo.Vaerksarkimports SET fabric_job_id = @job, log = COALESCE(@log, log) WHERE id = @i AND fabric_job_id LIKE 'reserveret:%'`);
            },
            startJob: IMPORTER_NOTEBOOK_ID ? (id) => startNotebook(ctx.Tokens.Fabric, IMPORTER_NOTEBOOK_ID, { import_id: id }) : null,
            afvisAnmodning: (id, tekst) => afvisAnmodning(pool, id, tekst),
        };
        try {
            return await behandlVaerksark(deps, anmodningId, indholdBase64, basisBase64 ?? '');
        } catch (e) {
            return { ok: false, status: 'ny', svar: tekniskFejl('uploadVaerksark', e) + ' Prøv igen.' };
        } finally {
            await pool.close();
        }
    },
    [],
);

export interface Dmitemperatur { ok: boolean; fejl?: string; data_commit?: string; kolonne?: string; tider?: string[]; vaerdier?: (number | null)[] }

/** Kolonner, der må læses fra DMI-filerne (modellens `data.dmi_temp_shortname`; standard temp_mean_past1h). */
const DMI_KOLONNER = ['temp_mean_past1h', 'temp_dry', 'temp_mean'];

/**
 * hentDmiTemperatur(omraade, fra, til, kolonne): DMI-temperatur RÅ som i df-data (samme data_commit som arbejderen,
 * `Files/fjv/df-data/<Motor.data_commit>/dmi/<omraade>_<år>.csv`) — `tider` = hour_utc, `vaerdier` = kolonnen
 * (null hvor tom). Til 'målt mod syntetisk varmelast'; interpolation/ffill/bfill sker i browseren som modellen.
 * `fra`/`til` er datoer (ÅÅÅÅ-MM-DD, UTC, begge med); højst 366 døgn pr. kald.
 */
udf.func(
    'hentDmiTemperatur',
    async (ctx: RayfinContext<Skema, AudienceType.Sql | AudienceType.Storage>, omraade: string, fra: string, til: string, kolonne: string): Promise<Dmitemperatur> => {
        if (!/^[a-z]{1,30}$/.test(omraade ?? '')) return { ok: false, fejl: 'Ugyldigt DMI-område.' };
        const kol = kolonne || 'temp_mean_past1h';
        if (!DMI_KOLONNER.includes(kol)) return { ok: false, fejl: `Kolonnen "${kol}" kan ikke hentes (tilladt: ${DMI_KOLONNER.join(', ')}).` };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fra ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(til ?? '')) return { ok: false, fejl: 'fra og til skal være datoer (ÅÅÅÅ-MM-DD).' };
        const a = Date.parse(`${fra}T00:00:00Z`), b = Date.parse(`${til}T23:00:00Z`);
        if (!(b >= a)) return { ok: false, fejl: 'til ligger før fra.' };
        if ((b - a) / 86_400_000 > 366) return { ok: false, fejl: 'Højst 366 døgn pr. kald.' };
        const pool = await forbind(ctx.Tokens.Sql);
        let dataCommit: string | undefined;
        try {
            dataCommit = (await pool.request().input('m', sql.UniqueIdentifier, MOTOR_ID).query('SELECT data_commit FROM dbo.Motors WHERE id = @m')).recordset[0]?.data_commit;
        } finally {
            await pool.close();
        }
        if (!dataCommit || !/^[0-9a-f]{40}$/.test(dataCommit)) return { ok: false, fejl: 'Regnemotoren har ikke registreret sin dataversion endnu.' };
        try {
            const tider: string[] = [], vaerdier: (number | null)[] = [];
            for (let år = new Date(a).getUTCFullYear(); år <= new Date(b).getUTCFullYear(); år++) {
                const tekst = await læsTekst(ctx.Tokens.Storage, `fjv/df-data/${dataCommit}/dmi/${omraade}_${år}.csv`);
                if (tekst === null) continue;
                const linjer = tekst.split(/\r?\n/);
                const hoved = linjer[0].split(',');
                const ti = hoved.indexOf('hour_utc'), vi = hoved.indexOf(kol);
                if (ti < 0 || vi < 0) return { ok: false, fejl: `DMI-filen for ${omraade} ${år} mangler hour_utc eller ${kol}.` };
                for (const l of linjer.slice(1)) {
                    if (!l) continue;
                    const f = l.split(',');
                    const t = Date.parse(`${f[ti].replace(' ', 'T')}Z`);
                    if (!(t >= a && t <= b)) continue;
                    const v = f[vi] === '' ? null : Number(f[vi]);
                    tider.push(f[ti]);
                    vaerdier.push(v !== null && Number.isFinite(v) ? v : null);
                }
            }
            if (tider.length === 0) return { ok: false, data_commit: dataCommit, fejl: `Ingen DMI-data for ${omraade} i ${fra}–${til}.` };
            return { ok: true, data_commit: dataCommit, kolonne: kol, tider, vaerdier };
        } catch (e) {
            return { ok: false, fejl: tekniskFejl('hentDmiTemperatur', e) };
        }
    },
    [],
);

// ------------------------------------------------------------------ diagnose

export interface Kolonne { tabel: string; kolonne: string; type: string; laengde: number | null; praecision: number | null; skala: number | null; nullable: boolean }

udf.func(
    'skemaInfo',
    async (ctx: RayfinContext<Skema, AudienceType.Sql>): Promise<{ login: string; kolonner: Kolonne[]; unikke: string[]; checks: string[] }> => {
        const pool = await forbind(ctx.Tokens.Sql);
        try {
            const login = (await pool.request().query('SELECT SUSER_SNAME() AS l')).recordset[0].l as string;
            const kol = (await pool.request().query(`
                SELECT TABLE_NAME AS tabel, COLUMN_NAME AS kolonne, DATA_TYPE AS type, CHARACTER_MAXIMUM_LENGTH AS laengde,
                       NUMERIC_PRECISION AS praecision, NUMERIC_SCALE AS skala, CASE IS_NULLABLE WHEN 'YES' THEN 1 ELSE 0 END AS nullable
                FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' ORDER BY TABLE_NAME, ORDINAL_POSITION`)).recordset;
            const unikke = (await pool.request().query(`
                SELECT t.name + '(' + STRING_AGG(c.name, ',') + ')' + CASE WHEN i.is_primary_key = 1 THEN ' PK' ELSE ' UNIQUE' END AS u
                FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
                JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                WHERE i.is_unique = 1 GROUP BY t.name, i.name, i.is_primary_key`)).recordset.map((r) => r.u as string);
            const checks = (await pool.request().query(`
                SELECT OBJECT_NAME(parent_object_id) + ': ' + definition AS c FROM sys.check_constraints`)).recordset.map((r) => r.c as string);
            return {
                login,
                kolonner: kol.map((k) => ({ ...k, nullable: Boolean(k.nullable) })) as Kolonne[],
                unikke, checks,
            };
        } finally {
            await pool.close();
        }
    },
    [],
);
