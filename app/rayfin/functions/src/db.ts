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
 * Kvote-lås pr. bruger for resten af transaktionen (KONTRAKT §6c, K2-F9): to samtidige bestillinger fra
 * samme bruger — også på forskellige værker — tæller og indsætter efter hinanden. E-mailen er den, DAB's
 * create-policy har verificeret på Bestilling.
 */
export async function låsKvote(req: () => sql.Request, email: string): Promise<void> {
    const r = await req().input('res', sql.NVarChar(255), `fjv_kvote:${email.toLowerCase()}`).query(
        "DECLARE @rc int; EXEC @rc = sp_getapplock @Resource = @res, @LockMode = N'Exclusive', " +
        "@LockOwner = N'Transaction', @LockTimeout = 15000; SELECT @rc AS rc;",
    );
    const rc = Number(r.recordset[0]?.rc);
    if (rc < 0) throw new Error(`Kunne ikke få kvotelåsen (sp_getapplock = ${rc}).`);
}
