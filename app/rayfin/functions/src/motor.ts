//-----------------------------------------------------------------------
// Arbejderprotokollen, Functions-siden (KONTRAKT v2.2 §6c — har forrang over §6).
//
// Global eksklusion er SQL-applocken 'fjv_solver' (session-ejet), som ARBEJDEREN holder hele sit
// jobs levetid. Functions tager den aldrig for at regne — kun:
//   - som TEST (timeout 0, frigives i samme batch): er låsen fri, kører ingen arbejder;
//   - mens døde kørsler markeres i `afstem`: så kan ingen arbejder nå at starte imens, og en kørsel i
//     `koerer`/`indlaeser` UDEN låseholder er beviseligt død (ejeren skal holde låsen, mens den regner).
// Jobstart er betinget af Motor.sidste_jobstart (ældre end 2 min, betinget UPDATE): kun ét kald
// POST'er. Et ekstra job er ufarligt — det får ikke låsen og afslutter straks.
//-----------------------------------------------------------------------

import { sql } from './db.js';
import { startNotebook } from './jobs.js';
import { ARBEJDER_NOTEBOOK_ID, MOTOR_ID } from './konfig.js';

export const SOLVER_LAAS = 'fjv_solver';
/**
 * En kørsel erklæres først død, når låsen er fri OG den ikke har meldt sig i så mange minutter. Arbejderen
 * melder sig hvert minut. Kontrakten (§6c) siger "hjerteslag er kun visning" — værnet er en bevidst afvigelse
 * efter hændelsen 08:43, hvor en levende kørsel under den gamle protokol blev sat til `fejl`.
 */
export const DOED_EFTER_MIN = 5;

/** Mindste afstand mellem to jobstarter (KONTRAKT §6c). */
export const JOBSTART_INTERVAL_S = 120;

export interface Arbejderstart { startet: boolean; fabric_job_id?: string; grund: string }

/** True hvis ingen arbejder holder solver-låsen. Tager den med timeout 0 og frigiver i samme batch. */
export async function solverLåsFri(pool: sql.ConnectionPool): Promise<boolean> {
    const r = await pool.request().query(`
        DECLARE @rc int;
        EXEC @rc = sp_getapplock @Resource = N'${SOLVER_LAAS}', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0;
        IF @rc >= 0 EXEC sp_releaseapplock @Resource = N'${SOLVER_LAAS}', @LockOwner = N'Session';
        SELECT @rc AS rc;`);
    return Number(r.recordset[0].rc) >= 0;
}

export interface DødKørsel { id: string; status: string }

/**
 * Markerer døde kørsler som `fejl` — men kun hvis solver-låsen kan tages (ingen arbejder lever) OG
 * kørslen ikke har meldt sig i DOED_EFTER_MIN minutter.
 * Låsen holdes i hele batchen, så ingen arbejder kan starte og overtage imens. Betinget på den
 * observerede status OG arbejder_id (K2-F4). Returnerer null, hvis en arbejder holder låsen.
 * `startet` er udgået som reservation (§6c); en række der stadig står der, er en forældet reservation.
 */
export async function markérDøde(pool: sql.ConnectionPool): Promise<DødKørsel[] | null> {
    const r = await pool.request().query(`
        SET NOCOUNT ON;
        DECLARE @rc int;
        EXEC @rc = sp_getapplock @Resource = N'${SOLVER_LAAS}', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0;
        IF @rc < 0 BEGIN SELECT CAST(0 AS bit) AS fri; RETURN; END;
        BEGIN TRY
            DECLARE @d TABLE (id uniqueidentifier, status nvarchar(20), arbejder_id nvarchar(100), annulleret bit);
            INSERT INTO @d SELECT id, status, arbejder_id, CASE WHEN annuller_anmodet IS NULL THEN 0 ELSE 1 END
            FROM dbo.Koersels WHERE status IN ('startet','koerer','indlaeser')
              -- Forsvar i dybden (hændelse 2026-10-16 08:43): en arbejder der IKKE følger låseprotokollen (gammel
              -- version, manuel vej) holder ikke låsen, men lever. En række med frisk livstegn erklæres aldrig død.
              AND COALESCE(hjerteslag, startet, bestilt) < DATEADD(minute, -${DOED_EFTER_MIN}, SYSUTCDATETIME());
            UPDATE k SET status = 'fejl', afsluttet = SYSUTCDATETIME(), fase = N'Fejl',
                fejlbesked = CASE d.status
                    WHEN 'indlaeser' THEN N'Arbejderen stoppede under indlæsningen af resultaterne, uden at afslutte. Kørslen kan bestilles igen.'
                    WHEN 'startet' THEN N'Forældet reservation fra før arbejderprotokol v2.2 — ingen arbejder tog kørslen. Den kan bestilles igen.'
                    ELSE N'Arbejderen stoppede uden at afslutte kørslen (ingen arbejder holder solver-låsen). Den kan bestilles igen.' END
                    + CASE WHEN d.annulleret = 1 THEN N' (Annullering var anmodet.)' ELSE N'' END
            OUTPUT inserted.id, deleted.status
            FROM dbo.Koersels k JOIN @d d ON d.id = k.id
            WHERE k.status = d.status AND ISNULL(k.arbejder_id, N'') = ISNULL(d.arbejder_id, N'');
        END TRY
        BEGIN CATCH
            EXEC sp_releaseapplock @Resource = N'${SOLVER_LAAS}', @LockOwner = N'Session';
            THROW;
        END CATCH;
        EXEC sp_releaseapplock @Resource = N'${SOLVER_LAAS}', @LockOwner = N'Session';`);
    const sæt = r.recordsets as unknown as { id?: string; status?: string; fri?: boolean }[][];
    if (sæt.length && sæt[0][0] && 'fri' in sæt[0][0]) return null;
    return (sæt[0] ?? []).map((x) => ({ id: String(x.id).toLowerCase(), status: String(x.status) }));
}

/** Opretter Motor-rækken, hvis den mangler (fast id). */
export async function sikrMotorRække(pool: sql.ConnectionPool): Promise<void> {
    await pool.request().input('m', sql.UniqueIdentifier, MOTOR_ID).query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.Motors WITH (UPDLOCK, HOLDLOCK) WHERE id = @m)
            INSERT INTO dbo.Motors (id, aendret) VALUES (@m, SYSUTCDATETIME());`);
}

/**
 * Starter et arbejderjob, hvis der er kø, ingen arbejder holder låsen, og intet job er startet de
 * seneste 2 minutter. Jobbet får ingen parametre: arbejderen tager køen FIFO efter `modtaget`.
 */
export async function startJobHvisFri(pool: sql.ConnectionPool, fabricToken: string): Promise<Arbejderstart> {
    if (!ARBEJDER_NOTEBOOK_ID) return { startet: false, grund: 'Ingen arbejder-notebook konfigureret; kørslen venter i kø.' };
    const kø = Number((await pool.request().query(
        `SELECT COUNT(*) AS n FROM dbo.Koersels WHERE status = 'koe' AND annuller_anmodet IS NULL`)).recordset[0].n);
    if (kø === 0) return { startet: false, grund: 'Køen er tom.' };
    if (!(await solverLåsFri(pool))) return { startet: false, grund: 'En arbejder er i gang; kørslen venter i kø.' };

    await sikrMotorRække(pool);
    // Reservationen gemmes med millisekunder (datetime2(3)), fordi den bruges som nøgle i de betingede UPDATEs
    // nedenfor og skal overleve en rundtur gennem JS Date. SYSUTCDATETIME() har 100 ns: målt live 10:16 gemte den
    // 10:16:09.4610255, Date blev .461, og `sidste_jobstart = @t` ramte aldrig — job-id blev ikke bundet, og
    // Retry-After ved 429 kunne aldrig være skrevet.
    const reservation = await pool.request().input('m', sql.UniqueIdentifier, MOTOR_ID).query(`
        UPDATE dbo.Motors SET sidste_jobstart = CAST(SYSUTCDATETIME() AS datetime2(3)), aendret = SYSUTCDATETIME()
        OUTPUT inserted.sidste_jobstart
        WHERE id = @m AND (sidste_jobstart IS NULL OR sidste_jobstart < DATEADD(second, -${JOBSTART_INTERVAL_S}, SYSUTCDATETIME()))`);
    if (reservation.rowsAffected[0] !== 1) {
        return { startet: false, grund: 'Et arbejderjob er startet for under 2 minutter siden; kørslen venter i kø.' };
    }
    const mitStart = reservation.recordset[0].sidste_jobstart as Date;

    const start = await startNotebook(fabricToken, ARBEJDER_NOTEBOOK_ID, {});
    if (start.ok && start.jobId) {
        // Bundet til netop denne start (K2-F3): et senere starts job-id overskrives ikke af et forsinket svar.
        const bind = await pool.request().input('m', sql.UniqueIdentifier, MOTOR_ID).input('t', sql.DateTime2, mitStart)
            .input('job', sql.NVarChar(100), start.jobId)
            .query(`UPDATE dbo.Motors SET sidste_job_id = @job, aendret = SYSUTCDATETIME() WHERE id = @m AND sidste_jobstart = @t`);
        // 0 rækker = en nyere start har overtaget reservationen; jobbet er startet, men dets id står ikke på Motor.
        return bind.rowsAffected[0] === 1
            ? { startet: true, fabric_job_id: start.jobId, grund: 'Beregningsjob startet.' }
            : { startet: true, fabric_job_id: start.jobId, grund: "Beregningsjob startet; en nyere start har overtaget Motor-reservationen, så job-id'et er ikke registreret der." };
    }
    if (start.status === 429) {
        // Retry-After respekteres: næste start tidligst efter den angivne ventetid.
        const vent = Math.max(60, Math.min(3600, start.retryAfterS ?? 60));
        await pool.request().input('m', sql.UniqueIdentifier, MOTOR_ID).input('t', sql.DateTime2, mitStart)
            .query(`UPDATE dbo.Motors SET sidste_jobstart = DATEADD(second, ${vent - JOBSTART_INTERVAL_S}, SYSUTCDATETIME())
                    WHERE id = @m AND sidste_jobstart = @t`);
        return { startet: false, grund: `Fabric bad om at vente ${vent} s (429); kørslen venter i kø og startes derefter.` };
    }
    return { startet: false, grund: `Jobstart fejlede (HTTP ${start.status}); der prøves igen om 2 minutter. ${start.fejl ?? ''}`.trim() };
}
