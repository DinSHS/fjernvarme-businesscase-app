//-----------------------------------------------------------------------
// startBestilling's transaktion: Bestilling -> Koersel(koe) + KoerselInput (+ frosne pins).
//
// Flyttet ud af function_app.ts ved rettelserne efter kodegennemgangen af runde 15, så kaldrækkefølgen kan
// testes mod en optagende stub (test/r15_bestilling.spec.ts) — SQL'en selv kan kun køres i Fabric.
//
// Rækkefølgen er pointen (fund 1):
//   1. bestillingens lås (sp_getapplock, transaktionsejet) — FØR noget læses
//   2. findes kørslen allerede?  -> svar med den (idempotent), intet andet
//   3. bestillingen, kvotelåsen, scenarie, værk, kø, parametre, ændringer, motor, tidsserier  (kun læsninger)
//   4. reglerne (bygFrossetInput) — en Afvisning her er endelig, og INTET er skrevet
//   5. INSERT Koersels + KoerselInputs
//
// En afvist bestilling SLETTES IKKE i Fabric-udgaven (fund 2): funktionen kender ikke kalderen (Rayfin-tokenet
// bærer ingen e-mail, se function_app.ts › Identitet), så den kan ikke afgøre, om det er bestillingens ejer, der
// beder om behandlingen — og bestillings-id'et kommer fra kalderen. Bestilling-rækken bliver stående; klienten
// genoptager den ved "Prøv igen" (src/lib/data/skriv.ts › bestilKoersel). Den lokale udgave kender sessionens
// bruger og rydder ejerens egen afviste bestilling i samme transaktion (community/…/logik/tjenester.py).
//-----------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { låsBestilling, låsKvote, sql } from './db.js';
import { MOTOR_ID } from './konfig.js';
import { Afvisning, bygFrossetInput, GRAENSER, type InputRad, type ScenarieAendringRad, type ScenarieRad, type TidsserieRad } from './logik.js';

/** mssql returnerer uniqueidentifier med STORE bogstaver, DAB med små — svar altid med små. */
const lc = (v: unknown): string => String(v).toLowerCase();

export type Bestillingsudfald =
    /** Bestillingen er allerede blevet til en kørsel (et gentaget eller samtidigt kald). */
    | { art: 'findes'; koersel_id: string; status: string }
    | { art: 'ny'; koersel_id: string }
    /** En endelig afvisning fra reglerne. Intet er skrevet, og Bestilling-rækken står. */
    | { art: 'afvist'; tekst: string };

/** Alt, der skal til for at indsætte kørslen — læst og regnet under låsene. Kaster `Afvisning`, før noget er skrevet. */
async function frys(req: () => sql.Request, bestillingId: string) {
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
    return { b, s, v, motor, frossen };
}

/**
 * startBestilling's transaktion (se filens hoved). `req` giver en forespørgsel i den åbne transaktion; alt andet
 * end en `Afvisning` kastes videre og ruller transaktionen tilbage (en teknisk fejl).
 */
export async function behandlBestilling(req: () => sql.Request, bestillingId: string): Promise<Bestillingsudfald> {
    await låsBestilling(req, bestillingId);
    const før = (await req().input('b', sql.UniqueIdentifier, bestillingId)
        .query('SELECT id, status FROM dbo.Koersels WHERE bestilling_id = @b')).recordset[0] as { id: string; status: string } | undefined;
    if (før) return { art: 'findes', koersel_id: lc(før.id), status: før.status };

    let f: Awaited<ReturnType<typeof frys>>;
    try {
        f = await frys(req, bestillingId);
    } catch (e) {
        if (e instanceof Afvisning) return { art: 'afvist', tekst: e.message };
        throw e;
    }
    const { b, s, v, motor, frossen } = f;

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
    return { art: 'ny', koersel_id: id };
}

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
