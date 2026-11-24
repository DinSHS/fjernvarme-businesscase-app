//-----------------------------------------------------------------------
// SQL mod appens egen database SOM APP-EJEREN (ctx.Tokens.Sql).
//
// Målt 2026-10-16 (bevisEjerskab): login = item-ejeren, IS_ROLEMEMBER
// ('db_owner') = 1, INSERT i en transaktion virker. DAB-klienten
// (ctx.getDataClient) kører derimod som KALDEREN og er underlagt de
// read-only-rettigheder, der beskytter tabellerne — derfor går alle
// betroede skrivninger herigennem.
//-----------------------------------------------------------------------

import sql from 'mssql';
import { SQL_DATABASE, SQL_SERVER } from './konfig.js';

export { sql };

export async function forbind(token: string): Promise<sql.ConnectionPool> {
    const pool = new sql.ConnectionPool({
        server: SQL_SERVER,
        port: 1433,
        database: SQL_DATABASE,
        options: { encrypt: true, trustServerCertificate: false },
        authentication: { type: 'azure-active-directory-access-token', options: { token } },
        pool: { max: 2, min: 0 },
    });
    return pool.connect();
}

/** Kører `fn` i én transaktion; ruller tilbage ved enhver fejl. */
export async function iTransaktion<T>(
    pool: sql.ConnectionPool,
    fn: (req: () => sql.Request) => Promise<T>,
    isolation: sql.IIsolationLevel = sql.ISOLATION_LEVEL.READ_COMMITTED,
): Promise<T> {
    const tx = new sql.Transaction(pool);
    await tx.begin(isolation);
    try {
        const ud = await fn(() => new sql.Request(tx));
        await tx.commit();
        return ud;
    } catch (e) {
        try { await tx.rollback(); } catch { /* allerede rullet tilbage af serveren */ }
        throw e;
    }
}

/**
 * ÉT tjek af `sp_getapplock`'s svar, for alle transaktionsejede låse (kvote, bestilling, arkivets kørselslås).
 * Proceduren melder en lås, den ikke fik, i sin returværdi (-1 timeout, -2 annulleret, -3 deadlock-offer, -999 fejl),
 * ikke som en SQL-fejl. Efterprøvningen af runde 15 (fund I): `Number(recordset[0]?.rc) < 0` læste en MANGLENDE række
 * som `NaN`, og `NaN < 0` er falsk — en lås uden svar talte som tildelt. Her kræves en række med netop 0 (tildelt)
 * eller 1 (tildelt efter ventetid); alt andet kaster inde i transaktionen (rollback). Også en uventet POSITIV kode
 * (tredje rettelsesrunde, P3-4): før gik `rc = 2` igennem her ("helt og ikke-negativt"), mens den lokale udgave
 * kastede (`community/fjernvarme_app/betroet_lager.py › APPLOCK_TILDELT`) — samme svar, to tolkninger.
 */
export function applockTildelt(recordset: readonly Record<string, unknown>[] | undefined, hvad: string): void {
    const række = recordset?.[0];
    const rc = række?.rc;
    if (rc !== 0 && rc !== 1) {
        throw new Error(`Kunne ikke få ${hvad} (sp_getapplock = ${række === undefined ? 'intet svar' : String(rc)}).`);
    }
}

/**
 * Kvote-lås pr. bruger for resten af transaktionen (KONTRAKT §6c, K2-F9): to samtidige bestillinger fra
 * samme bruger — også på forskellige værker — tæller og indsætter efter hinanden. E-mailen er den, DAB's
 * create-policy har verificeret på Bestilling.
 */
export async function låsKvote(req: () => sql.Request, email: string): Promise<void> {
    const r = await req().input('res', sql.NVarChar(255), `fjv_kvote:${email.toLowerCase()}`).query(
        "DECLARE @rc int; EXEC @rc = sp_getapplock @Resource = @res, @LockMode = N'Exclusive', " +
        "@LockOwner = N'Transaction', @LockTimeout = 15000; SELECT @rc AS rc;",
    );
    applockTildelt(r.recordset, 'kvotelåsen');
}

/**
 * Lås pr. bestilling for resten af transaktionen (kodegennemgangen af runde 15, fund 1). Tages som det FØRSTE i
 * startBestilling's transaktion — før bestillingen læses — så to kald om samme bestilling går efter hinanden fra
 * læsning til indsættelse. Samme mønster som `låsKvote`; rækkefølgen er altid bestilling -> kvote. Id'et er valideret
 * som uuid af kalderen. IKKE kørt mod en Fabric-database (rapporten for rettelserne, runde 15).
 */
export async function låsBestilling(req: () => sql.Request, bestillingId: string): Promise<void> {
    const r = await req().input('res', sql.NVarChar(255), `fjv_bestilling:${bestillingId.toLowerCase()}`).query(
        "DECLARE @rc int; EXEC @rc = sp_getapplock @Resource = @res, @LockMode = N'Exclusive', " +
        "@LockOwner = N'Transaction', @LockTimeout = 15000; SELECT @rc AS rc;",
    );
    applockTildelt(r.recordset, 'bestillingens lås');
}
