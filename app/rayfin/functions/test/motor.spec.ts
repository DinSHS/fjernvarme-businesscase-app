// @vitest-environment node
//-----------------------------------------------------------------------
// KONTRAKT §6c, Functions-siden (K2-F3/F4/F5/F9): solver-låsen, Motor-rækkens betingede jobstart,
// død-markering under låsen, samarbejdende annullering. SQL-forløbene testes mod en optagende
// stub-forbindelse (som Codex' prober) — den beviser kaldgrænser og betingelser, ikke SQL-isolation;
// det bevises live i Fabric (rapporten).
//-----------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markérDøde, solverLåsFri, startJobHvisFri } from "../src/motor";
import { MOTOR_ID as MOTOR_ID_FUNKTIONER } from "../src/konfig";
import { MOTOR_ID as MOTOR_ID_DATA } from "../../data/fjv.constants";

// Testen er uafhængig af en installation: konfig.ts har tomme værdier i repoet (de fyldes lokalt af scripts/installation.py), så de
// installationsafhængige konstanter gives syntetiske værdier her. MOTOR_ID er ikke installationsspecifik og bruges som den er.
vi.mock("../src/konfig", async (orig) => ({
    ...(await orig<typeof import("../src/konfig")>()),
    ARBEJDER_NOTEBOOK_ID: "00000000-0000-4000-8000-0000000000a1",
    WORKSPACE_ID: "00000000-0000-4000-8000-0000000000b1",
}));

type Svar = { recordset?: Record<string, unknown>[]; recordsets?: Record<string, unknown>[][]; rowsAffected?: number[] };

/** Stub af mssql.ConnectionPool: hvert query() optages, og `svar` vælger resultatet ud fra SQL-teksten. */
function stubPool(svar: (sqlText: string, input: Record<string, unknown>) => Svar) {
    const log: { sql: string; input: Record<string, unknown> }[] = [];
    const pool = {
        request() {
            const input: Record<string, unknown> = {};
            const req = {
                input(navn: string, _type: unknown, v?: unknown) { input[navn] = v === undefined ? _type : v; return req; },
                async query(sqlText: string) { log.push({ sql: sqlText, input }); const s = svar(sqlText, input); return { recordset: [], recordsets: [s.recordset ?? []], rowsAffected: [0], ...s }; },
            };
            return req;
        },
    };
    return { pool: pool as never, log };
}

const LÅS_FRI = (sqlText: string) => /sp_getapplock[\s\S]*LockTimeout = 0[\s\S]*SELECT @rc AS rc/.test(sqlText) && !/Koersels k JOIN/.test(sqlText);

afterEach(() => { vi.unstubAllGlobals(); });

describe("konstanter", () => {
    it("MOTOR_ID er ens i Functions og i datamodellen", () => expect(MOTOR_ID_FUNKTIONER).toBe(MOTOR_ID_DATA));
});

describe("solverLåsFri", () => {
    it("tester låsen med timeout 0, session-ejet, og frigiver i samme batch", async () => {
        const { pool, log } = stubPool(() => ({ recordset: [{ rc: 0 }] }));
        expect(await solverLåsFri(pool)).toBe(true);
        expect(log[0].sql).toMatch(/@Resource = N'fjv_solver'.*@LockOwner = N'Session', @LockTimeout = 0/s);
        expect(log[0].sql).toMatch(/IF @rc >= 0 EXEC sp_releaseapplock/);
    });
    it("er optaget når sp_getapplock giver negativ kode (en arbejder holder den)", async () => {
        const { pool } = stubPool(() => ({ recordset: [{ rc: -1 }] }));
        expect(await solverLåsFri(pool)).toBe(false);
    });
});

describe("startJobHvisFri (K2-F3)", () => {
    function scenarie(o: { kø?: number; fri?: boolean; reserveret?: boolean }) {
        return stubPool((s) => {
            if (/COUNT\(\*\) AS n FROM dbo\.Koersels WHERE status = 'koe'/.test(s)) return { recordset: [{ n: o.kø ?? 1 }] };
            if (LÅS_FRI(s)) return { recordset: [{ rc: o.fri === false ? -1 : 0 }] };
            if (/UPDATE dbo\.Motors SET sidste_jobstart = CAST\(SYSUTCDATETIME\(\) AS datetime2\(3\)\)/.test(s)) {
                return o.reserveret === false ? { rowsAffected: [0], recordset: [] } : { rowsAffected: [1], recordset: [{ sidste_jobstart: new Date("2026-10-16T08:30:00Z") }] };
            }
            return { rowsAffected: [1] };
        });
    }
    const fetchStub = (status: number, headers: Record<string, string> = {}) => {
        const f = vi.fn(async () => new Response(status === 202 ? null : "fejl", { status, headers }));
        vi.stubGlobal("fetch", f);
        return f;
    };

    it("POST'er ikke ved tom kø", async () => {
        const f = fetchStub(202); const { pool } = scenarie({ kø: 0 });
        expect((await startJobHvisFri(pool, "t")).startet).toBe(false);
        expect(f).not.toHaveBeenCalled();
    });
    it("POST'er ikke, når en arbejder holder solver-låsen", async () => {
        const f = fetchStub(202); const { pool } = scenarie({ fri: false });
        expect((await startJobHvisFri(pool, "t")).grund).toMatch(/arbejder er i gang/);
        expect(f).not.toHaveBeenCalled();
    });
    it("POST'er ikke, når et job er startet inden for 2 min (betinget Motor-UPDATE ramte 0 rækker)", async () => {
        const f = fetchStub(202); const { pool, log } = scenarie({ reserveret: false });
        expect((await startJobHvisFri(pool, "t")).startet).toBe(false);
        expect(f).not.toHaveBeenCalled();
        expect(log.find((l) => /UPDATE dbo\.Motors SET sidste_jobstart/.test(l.sql))!.sql).toMatch(/sidste_jobstart < DATEADD\(second, -120/);
    });
    it("POST'er uden parametre og binder job-id til netop denne start", async () => {
        const f = fetchStub(202, { location: "https://x/jobs/instances/job-123" }); const { pool, log } = scenarie({});
        const r = await startJobHvisFri(pool, "t");
        expect(r).toMatchObject({ startet: true, fabric_job_id: "job-123" });
        expect(JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({ executionData: { parameters: {} } });
        const binding = log.find((l) => /SET sidste_job_id = @job/.test(l.sql))!;
        expect(binding.sql).toMatch(/AND sidste_jobstart = @t/);
        expect(binding.input.t).toEqual(new Date("2026-10-16T08:30:00Z"));
    });
    it("binder job-id, når SQL Server gemmer tiden med 100 ns og JS Date kun har ms (målt live 10:16)", async () => {
        // Tro stub: Motor-rækken gemmer sidste_jobstart i 100 ns-ticks som datetime2(7). SYSUTCDATETIME() giver
        // sub-ms-cifre; CAST(... AS datetime2(3)) runder til ms. OUTPUT og driveren returnerer en Date (ms).
        const ms = Date.parse("2026-10-16T10:16:09.461Z");
        let lagretTicks = 0; let bundet = false;
        fetchStub(202, { location: "https://x/jobs/instances/job-9" });
        const { pool } = stubPool((s, input) => {
            if (/COUNT\(\*\) AS n FROM dbo\.Koersels WHERE status = 'koe'/.test(s)) return { recordset: [{ n: 1 }] };
            if (LÅS_FRI(s)) return { recordset: [{ rc: 0 }] };
            if (/UPDATE dbo\.Motors SET sidste_jobstart =/.test(s) && /OUTPUT inserted\.sidste_jobstart/.test(s)) {
                lagretTicks = /SET sidste_jobstart = CAST\(SYSUTCDATETIME\(\) AS datetime2\(3\)\)/.test(s) ? ms * 1e4 : ms * 1e4 + 255;
                return { rowsAffected: [1], recordset: [{ sidste_jobstart: new Date(Math.floor(lagretTicks / 1e4)) }] };
            }
            if (/SET sidste_job_id = @job/.test(s)) {
                bundet = (input.t as Date).getTime() * 1e4 === lagretTicks;
                return { rowsAffected: [bundet ? 1 : 0] };
            }
            return { rowsAffected: [1] };
        });
        const r = await startJobHvisFri(pool, "t");
        expect(bundet).toBe(true);
        expect(r).toEqual({ startet: true, fabric_job_id: "job-9", grund: "Beregningsjob startet." });
    });
    it("siger ærligt, at job-id ikke er registreret, når bindingen ramte 0 rækker", async () => {
        fetchStub(202, { location: "https://x/jobs/instances/job-7" });
        const { pool } = stubPool((s) => {
            if (/COUNT\(\*\) AS n FROM dbo\.Koersels WHERE status = 'koe'/.test(s)) return { recordset: [{ n: 1 }] };
            if (LÅS_FRI(s)) return { recordset: [{ rc: 0 }] };
            if (/OUTPUT inserted\.sidste_jobstart/.test(s)) return { rowsAffected: [1], recordset: [{ sidste_jobstart: new Date() }] };
            return { rowsAffected: [0] };
        });
        expect((await startJobHvisFri(pool, "t")).grund).toMatch(/ikke registreret/);
    });
    it("gemmer Retry-After ved 429 som en senere tidligste start", async () => {
        fetchStub(429, { "retry-after": "300" }); const { pool, log } = scenarie({});
        expect((await startJobHvisFri(pool, "t")).grund).toMatch(/300 s/);
        expect(log.some((l) => /SET sidste_jobstart = DATEADD\(second, 180, SYSUTCDATETIME\(\)\)/.test(l.sql))).toBe(true);
    });
    it("skriver aldrig fabric_job_id på en kørsel (job-id hører til jobbet, §6c)", () => {
        const kilde = readFileSync(new URL("../src/motor.ts", import.meta.url), "utf8");
        expect(kilde).not.toMatch(/UPDATE dbo\.Koersels[^`]*fabric_job_id/);
    });
});

describe("markérDøde (K2-F4)", () => {
    it("returnerer null og ændrer intet, når en arbejder holder låsen", async () => {
        const { pool } = stubPool(() => ({ recordsets: [[{ fri: false }]] }));
        expect(await markérDøde(pool)).toBeNull();
    });
    it("markerer under låsen, betinget på observeret status OG arbejder_id, og frigiver låsen", async () => {
        const { pool, log } = stubPool(() => ({ recordsets: [[{ id: "ABC", status: "koerer" }]] }));
        expect(await markérDøde(pool)).toEqual([{ id: "abc", status: "koerer" }]);
        const s = log[0].sql;
        expect(s).toMatch(/@LockTimeout = 0/);
        expect(s).toMatch(/WHERE k\.status = d\.status AND ISNULL\(k\.arbejder_id, N''\) = ISNULL\(d\.arbejder_id, N''\)/);
        expect(s.match(/sp_releaseapplock/g)!.length).toBe(2); // både i CATCH og efter
        expect(s.indexOf("sp_getapplock")).toBeLessThan(s.indexOf("UPDATE k SET status = 'fejl'"));
    });
    it("erklærer aldrig en kørsel med frisk hjerteslag død, selv når låsen er fri (hændelse 08:43)", async () => {
        const { pool, log } = stubPool(() => ({ recordsets: [[]] }));
        await markérDøde(pool);
        expect(log[0].sql).toMatch(/AND COALESCE\(hjerteslag, startet, bestilt\) < DATEADD\(minute, -5, SYSUTCDATETIME\(\)\)/);
    });
});

describe("function_app.ts — §6c-regler i kilden", () => {
    const f = readFileSync(new URL("../src/function_app.ts", import.meta.url), "utf8");
    const del = (fra: string, til: string) => f.slice(f.indexOf(fra), f.indexOf(til, f.indexOf(fra)));
    const bestil = del("'startBestilling'", "async function indsætInput");
    const annuller = del("'annullerKoersel'", "// ------------------------------------------------------------------ kildefil");

    it("K2-F9: kvotelåsen tages FØR brugerens kø tælles, og køens tid er servertid", () => {
        expect(bestil.indexOf("låsKvote(")).toBeGreaterThan(0);
        expect(bestil.indexOf("låsKvote(")).toBeLessThan(bestil.indexOf("WHERE bestilt_af = @af AND status = 'koe'"));
        expect(bestil).toMatch(/@bestilt, SYSUTCDATETIME\(\), 0, 'app'/);
    });
    it("K2-F8: scenarie og ændringer læses med UPDLOCK, HOLDLOCK, og pins fra Motor fryses i inputtet", () => {
        expect(bestil).toMatch(/FROM dbo\.Scenaries WITH \(UPDLOCK, HOLDLOCK\)/);
        expect(bestil).toMatch(/FROM dbo\.ScenarieAendrings WITH \(UPDLOCK, HOLDLOCK\)/);
        expect(bestil).toMatch(/bygFrossetInput\(params, aendr, scenarie,\s*\{ model_commit: motor\.model_commit, data_commit: motor\.data_commit \}, tidsserier\)/);
    });
    it("§6d: værkets tidsserier læses låst som resten af snapshottet, og kun de gyldige", () => {
        expect(bestil).toMatch(/FROM dbo\.Tidsseries WITH \(UPDLOCK, HOLDLOCK\) WHERE vaerk_id = @v AND status = 'gyldig'/);
    });
    it("K2-F5: annullering bruger ikke jobs-API'ets cancel og kontrollerer antal ramte rækker", () => {
        expect(f).not.toMatch(/annullerJob|\/cancel/);
        expect(annuller).toMatch(/AND annuller_anmodet IS NULL/);
        expect(annuller.match(/rowsAffected\[0\] === 1/g)!.length).toBeGreaterThanOrEqual(2);
    });
});
