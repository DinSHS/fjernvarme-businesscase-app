//-----------------------------------------------------------------------
// Fabric jobs-API som APP-EJEREN (ctx.Tokens.Fabric).
//
// Målt 2026-10-16: POST …/jobs/instances?jobType=RunNotebook med
// executionData.parameters.<navn> = {value, type:"string"} giver 202 +
// Location (…/jobs/instances/<jobId>) + Retry-After: 60, og en Python-
// notebook modtager parameteren i sin parameters-celle.
//
// Jobs-API'ets cancel og jobstatus bruges ikke (KONTRAKT §6c): annullering er samarbejdende,
// og en død arbejder afgøres af solver-låsen, ikke af jobstatus.
//-----------------------------------------------------------------------

import { FABRIC_API, WORKSPACE_ID } from './konfig.js';

export interface Jobstart { ok: boolean; jobId?: string; status: number; retryAfterS?: number; fejl?: string }

export async function startNotebook(token: string, notebookId: string, parametre: Record<string, string>): Promise<Jobstart> {
    const url = `${FABRIC_API}/workspaces/${WORKSPACE_ID}/items/${notebookId}/jobs/instances?jobType=RunNotebook`;
    const parameters = Object.fromEntries(Object.entries(parametre).map(([k, v]) => [k, { value: v, type: 'string' }]));
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionData: { parameters } }),
    });
    const retry = Number(res.headers.get('retry-after'));
    if (res.status === 202) {
        const loc = res.headers.get('location') ?? '';
        const jobId = loc.split('/').filter(Boolean).pop();
        return { ok: true, jobId, status: 202, retryAfterS: Number.isFinite(retry) ? retry : undefined };
    }
    const tekst = (await res.text()).slice(0, 800);
    return { ok: false, status: res.status, retryAfterS: Number.isFinite(retry) ? retry : undefined, fejl: tekst };
}
