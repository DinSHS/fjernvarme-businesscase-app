//-----------------------------------------------------------------------
// Temaet i browseren: register, valg, anvendelse og en React-hook.
//
// Registret er alle JSON-filer under ./temaer/ (inkl. undermapper). Den
// offentlige eksport udelader ./temaer/privat/ — så forsvinder husets og de
// uofficielle temaer uden en kodeændring, og standarden falder til det tema
// med højest `standard` blandt dem, der er tilbage.
//
// Valget gemmes pr. bruger i localStorage (en UI-præference, ikke data) med
// try/catch: privat vindue, blokeret lager og Fabric-iframen må aldrig
// vælte appen. Uden gemt valg følger modus `prefers-color-scheme`.
//
// URL-parametre til skærmbilleder og links (gemmes IKKE):
//   ?tema=<id>&modus=lys|moerk     ·     ?tema=moerk (harnessens gamle form)
//
// Farverne skrives som CSS-variabler i ét <style id="fjv-tema">, og <html>
// får data-tema, data-modus og (af hensyn til Tailwinds dark-variant) .dark.
//-----------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import { BASISTEMA, css, loes, mangler, validerFil, type Modus, type Tema, type TemaFil } from "./tema-kerne.ts";
import { UDGAVETEMAER } from "@/backend/temaer";

export type ModusValg = Modus | "system";
export interface Temavalg { tema: string; modus: ModusValg }

const NOEGLE = "fjv.tema.v1";

// De neutrale temaer (./temaer/*.json) er med i begge udgaver; privat/ (en installations lokale og de uofficielle) kommer KUN
// gennem udgavens backend-modul (src/backend/rayfin/temaer.ts), så en rest-bundle aldrig får en installations
// lokale tema med — heller ikke når den bygges fra en kopi, hvor temaet ligger lokalt (tjek_bundle.mjs håndhæver det).
const filer = { ...import.meta.glob<TemaFil>("./temaer/*.json", { eager: true, import: "default" }), ...Object.fromEntries(UDGAVETEMAER.map((f, i) => [`udgave:${i}`, f])) };

function byg(raa: readonly TemaFil[]): Tema[] {
    const gyldige = raa.filter((f) => {
        const fejl = validerFil(f, String((f as { id?: unknown })?.id ?? "tema"));
        if (fejl.length) console.warn("Tema afvist:", fejl.join("; "));
        return !fejl.length;
    });
    const basisFil = gyldige.find((f) => f.id === BASISTEMA);
    const basis = basisFil ? loes(basisFil, undefined) : undefined;
    const ud: Tema[] = [];
    for (const f of gyldige) {
        if (ud.some((t) => t.id === f.id)) continue;
        const t = f.id === BASISTEMA ? basis! : loes(f, basis);
        if (mangler(t).length) { console.warn("Tema ufuldstændigt:", f.id); continue; }
        ud.push(t);
    }
    return ud.sort((a, b) => b.standard - a.standard || a.navn.localeCompare(b.navn, "da"));
}

let temaer: Tema[] = byg(Object.values(filer));

export function alleTemaer(): readonly Tema[] { return temaer; }
export function standardTema(): Tema { return temaer[0]; }

function laes(): Partial<Temavalg> {
    try {
        const v = JSON.parse(window.localStorage.getItem(NOEGLE) ?? "null") as Partial<Temavalg> | null;
        return v && typeof v === "object" ? v : {};
    } catch { return {}; }
}

function gem(v: Temavalg): void {
    try { window.localStorage.setItem(NOEGLE, JSON.stringify(v)); } catch { /* lager blokeret: valget gælder sessionen */ }
}

function fraUrl(): Partial<Temavalg> {
    try {
        const p = new URLSearchParams(window.location.search);
        const t = p.get("tema"), m = p.get("modus");
        if (t === "moerk" || t === "lys") return { modus: t };
        const ud: Partial<Temavalg> = {};
        if (t) ud.tema = t;
        if (m === "lys" || m === "moerk" || m === "system") ud.modus = m;
        return ud;
    } catch { return {}; }
}

const url = typeof window !== "undefined" ? fraUrl() : {};
let valg: Temavalg = { tema: standardTema().id, modus: "system", ...(typeof window !== "undefined" ? laes() : {}), ...url };

function systemMoerk(): boolean {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

export function aktivtTema(): Tema { return temaer.find((t) => t.id === valg.tema) ?? standardTema(); }
export function aktivModus(): Modus { return valg.modus === "system" ? (systemMoerk() ? "moerk" : "lys") : valg.modus; }

const lyttere = new Set<() => void>();
let version = 0;

function anvend(): void {
    if (typeof document === "undefined") return;
    const t = aktivtTema(), m = aktivModus();
    const html = document.documentElement;
    html.dataset.tema = t.id;
    html.dataset.modus = m;
    html.classList.toggle("dark", m === "moerk");
    let stil = document.getElementById("fjv-tema") as HTMLStyleElement | null;
    if (!stil) {
        stil = document.createElement("style");
        stil.id = "fjv-tema";
        document.head.appendChild(stil);
    }
    stil.textContent = css(t, m);
    version++;
    lyttere.forEach((l) => l());
}

export function vaelgTema(id: string): void {
    if (!temaer.some((t) => t.id === id)) return;
    valg = { ...valg, tema: id };
    gem(valg);
    anvend();
}

export function vaelgModus(m: ModusValg): void {
    valg = { ...valg, modus: m };
    gem(valg);
    anvend();
}

/** Installationens egne temaer (community: `temaer.json` ved siden af index.html — én fil eller en liste). */
async function hentInstallerede(): Promise<void> {
    if (typeof fetch === "undefined" || typeof document === "undefined" || !import.meta.env.PROD) return;
    try {
        const svar = await fetch(new URL("temaer.json", document.baseURI), { cache: "no-cache" });
        if (!svar.ok || !(svar.headers.get("content-type") ?? "").includes("json")) return;
        const data = (await svar.json()) as unknown;
        const ekstra = (Array.isArray(data) ? data : [data]) as TemaFil[];
        temaer = byg([...Object.values(filer), ...ekstra]);
        anvend(); // et gemt valg af et installationstema træder i kraft nu, hvor temaet findes
    } catch { /* ingen installationstemaer */ }
}

if (typeof window !== "undefined") {
    anvend();
    try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (valg.modus === "system") anvend(); });
    } catch { /* ældre browser/jsdom */ }
    void hentInstallerede();
}

function abonner(l: () => void): () => void {
    lyttere.add(l);
    return () => { lyttere.delete(l); };
}

/** Det aktive tema til komponenter (fx temavælgeren). Opdateres ved hvert skift. */
export function useTema() {
    useSyncExternalStore(abonner, () => version, () => version);
    return { tema: aktivtTema(), modus: aktivModus(), valg, temaer: alleTemaer(), vaelgTema, vaelgModus };
}
