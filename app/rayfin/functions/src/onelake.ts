//-----------------------------------------------------------------------
// Filer i lakehouset via OneLakes ADLS Gen2-API (ctx.Tokens.Storage), som APP-EJEREN.
//
// Skrivning er create -> append -> flush (OneLake tager ikke en PUT med indhold
// i ét kald). Stien er altid under lakehousets Files/ og bygges af koden, aldrig
// af kalderen: kun `fjv/tidsserier/<kode>/<sha256>.csv` og `fjv/uploads/<id>.xlsx`.
//-----------------------------------------------------------------------

import { LAKEHOUSE_ID, ONELAKE_DFS, WORKSPACE_ID } from './konfig.js';

const VERSION = '2023-11-03';
const url = (sti: string) => `${ONELAKE_DFS}/${WORKSPACE_ID}/${LAKEHOUSE_ID}/Files/${sti.split('/').map(encodeURIComponent).join('/')}`;

/** Tilladte stier (Files/-relative). Alt andet afvises, så en fejl aldrig kan skrive uden for appens mapper. */
const TILLADT = [
    /^fjv\/tidsserier\/[a-z0-9_]{1,60}\/[0-9a-f]{64}\.csv$/, /^fjv\/uploads\/[0-9a-f-]{36}\.xlsx$/,
    /^fjv\/df-data\/[0-9a-f]{40}\/dmi\/[a-z]{1,30}_\d{4}\.csv$/, // kun læsning (hentDmiTemperatur)
];

export function tjekSti(sti: string): void {
    if (!TILLADT.some((m) => m.test(sti))) throw new Error(`Ugyldig lakehouse-sti: ${sti}`);
}

/**
 * Skriver en UFORANDERLIG fil. Findes den allerede hel (samme sti = samme hash, samme længde), er det ikke en
 * fejl: returnerer `ny: false` uden at røre den.
 */
export async function skrivFil(token: string, sti: string, indhold: Uint8Array): Promise<{ ny: boolean }> {
    tjekSti(sti);
    const h = { Authorization: `Bearer ${token}`, 'x-ms-version': VERSION };
    let opret = await fetch(`${url(sti)}?resource=file`, { method: 'PUT', headers: { ...h, 'If-None-Match': '*', 'Content-Length': '0' } });
    if (opret.status === 409) {
        // Findes allerede. Er den hel (samme længde), er den den samme fil (stien er dens hash). Er den det ikke —
        // fx en tidligere upload, der døde mellem create og append — overskrives den, ellers sad en tom fil fast.
        const hoved = await fetch(url(sti), { method: 'HEAD', headers: h });
        if (hoved.ok && Number(hoved.headers.get('content-length')) === indhold.byteLength) return { ny: false };
        opret = await fetch(`${url(sti)}?resource=file`, { method: 'PUT', headers: { ...h, 'Content-Length': '0' } });
    }
    if (!opret.ok) throw new Error(`OneLake: oprettelse af ${sti} gav HTTP ${opret.status}: ${(await opret.text()).slice(0, 300)}`);
    const tilføj = await fetch(`${url(sti)}?action=append&position=0`, {
        method: 'PATCH', headers: { ...h, 'Content-Type': 'application/octet-stream', 'Content-Length': String(indhold.byteLength) }, body: new Blob([indhold as Uint8Array<ArrayBuffer>]),
    });
    if (!tilføj.ok) throw new Error(`OneLake: skrivning til ${sti} gav HTTP ${tilføj.status}: ${(await tilføj.text()).slice(0, 300)}`);
    const flush = await fetch(`${url(sti)}?action=flush&position=${indhold.byteLength}`, { method: 'PATCH', headers: { ...h, 'Content-Length': '0' } });
    if (!flush.ok) throw new Error(`OneLake: afslutning af ${sti} gav HTTP ${flush.status}: ${(await flush.text()).slice(0, 300)}`);
    return { ny: true };
}

/** Læser en fil som tekst (UTF-8). null hvis den ikke findes. */
export async function læsTekst(token: string, sti: string): Promise<string | null> {
    tjekSti(sti);
    const res = await fetch(url(sti), { headers: { Authorization: `Bearer ${token}`, 'x-ms-version': VERSION } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OneLake: læsning af ${sti} gav HTTP ${res.status}`);
    return await res.text();
}
