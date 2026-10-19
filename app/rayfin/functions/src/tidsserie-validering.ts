//-----------------------------------------------------------------------
// Tolkning, normalisering og validering af en uploadet tidsserie — en
// TRO PORT af fv-data's orakel viden/vaerktoej/valider_tidsserie.py med
// reglerne fra viden/data_krav.json (datakrav.data.ts).
//
// Samme input skal give samme status, samme fund (kode, niveau, besked) og
// samme normaliserede fil (time,mw — dermed samme sha256) som oraklet;
// tidsserie-validering.spec.ts kræver det på alle orakel-vektorer
// (_byg/byg_datakrav.py). Ret derfor aldrig en regel her — ret oraklet og
// data_krav.json, generér vektorerne igen, og få testen grøn.
//
// ÉN tolker (fv-app 15:00, fv-tidsserie's forslag): denne fil er både browserens
// FORHÅNDSTJEK (importeret via src/sider/konfiguration/tidsserie-validering.ts)
// og backendens validering i uploadTidsserie, hvis validering_json står på serien.
// Flyttet hertil, fordi Functions-buildet kun pakker rayfin/functions/src/.
// Ingen node:-importer, så modulet kan bruges både i browseren og i en Function.
// Ren logik.
//-----------------------------------------------------------------------

import { DATAKRAV } from "./datakrav.data.js";

const TIME = 3_600_000, KVARTER = 900_000, DØGN = 86_400_000;
const K = DATAKRAV;
const G = K.graenser;
type Kode = keyof typeof K.regler;
export type Niveau = "fejl" | "advarsel" | "info";
export interface Fund { niveau: Niveau; kode: string; besked: string }
export type Rolle = "varmelast" | "solprofil";

/** En værdi i den normaliserede serie: intervallets start (UTC ms) og MW. */
export interface Punkt { t: number; v: number }

export interface Valideringsresultat {
    status: "gyldig" | "afvist";
    /** Den normaliserede fil (time,mw), kun for en gyldig serie. */
    normaliseret: string | null;
    /** Oraklets validering_json-felter (uden afkortning). */
    validering: Record<string, unknown> & { fund: Fund[]; fejl: string[]; advarsler: string[] };
    punkter: Punkt[];
}

export interface Valg {
    tidszone?: string; tidsstempel?: string; enhed?: string; kolonne?: string | null;
    /** Værkets effektive case som træ (units/storage) — giver de værksafhængige regler. */
    vaerk?: { units?: Record<string, unknown>; storage?: Record<string, unknown> } | null;
}

// ------------------------------------------------------------------ tal og tid

const TOMME = new Set<string>(K.tomme_vaerdier);
const REN_DECIMAL = /^[0-9]+(?:\.[0-9]+)?$/;
const TAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DECIMALKOMMA = /^-?\d+(\.\d{3})*,\d+$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|z|[+-]\d{2}:?\d{2})?$/;
const DANSK = /^(\d{1,2})([-./])(\d{1,2})\2(\d{4})(?:[ T](\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$/;

const erTom = (f: string) => TOMME.has(f.trim().toLowerCase());

/** Plain decimal for et endeligt tal (JS's String(x) giver eksponent under 1e-6 og fra 1e21). */
function udenEksponent(s: string): string {
    const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
    if (!m) return s;
    const [, fortegn, heltal, dec = "", e] = m;
    const cifre = heltal + dec, eks = Number(e);
    const punkt = 1 + eks;
    if (punkt <= 0) return `${fortegn}0.${"0".repeat(-punkt)}${cifre}`.replace(/0+$/, "");
    if (punkt >= cifre.length) return fortegn + cifre + "0".repeat(punkt - cifre.length);
    return `${fortegn}${cifre.slice(0, punkt)}.${cifre.slice(punkt)}`;
}

/** Korteste decimalform, der giver samme double, uden eksponent og uden '.0' (oraklets tal_tekst). */
export function talTekst(x: number): string {
    if (!Number.isFinite(x)) throw new Error(`ikke et endeligt tal: ${x}`);
    if (x === 0) return "0";
    return udenEksponent(String(x));
}

/** YYYY-MM-DDTHH:MM:SSZ */
export function tidTekst(ms: number): string { return new Date(ms).toISOString().slice(0, 19) + "Z"; }

/** Pythons math.fsum (Shewchuk): den korrekt afrundede sum. */
export function fsum(xs: Iterable<number>): number {
    const partials: number[] = [];
    for (let x of xs) {
        let i = 0;
        for (let y of partials) {
            if (Math.abs(x) < Math.abs(y)) [x, y] = [y, x];
            const hi = x + y, lo = y - (hi - x);
            if (lo) partials[i++] = lo;
            x = hi;
        }
        partials.length = i;
        partials.push(x);
    }
    let n = partials.length, hi = 0, lo = 0;
    if (n > 0) {
        hi = partials[--n];
        while (n > 0) {
            const x = hi, y = partials[--n];
            hi = x + y;
            const yr = hi - x;
            lo = y - yr;
            if (lo) break;
        }
        if (n > 0 && ((lo < 0 && partials[n - 1] < 0) || (lo > 0 && partials[n - 1] > 0))) {
            const y = lo * 2, x = hi + y, yr = x - hi;
            if (y === yr) hi = x;
        }
    }
    return hi;
}

/** Pythons round(x, d): halvdelen til lige på decimalrepræsentationen (som Python for de tal, der forekommer her). */
function pyRound(x: number, d = 0): number {
    const f = 10 ** d, y = x * f, r = Math.round(y);
    return (Math.abs(y % 1) === 0.5 ? (r % 2 === 0 ? r : r - 1) : r) / f;
}

/** Python f"{x:.Nf}" og f"{x:.1%}" med dansk komma. */
const fast = (x: number, d: number) => x.toFixed(d).replace(".", ",");
const procent1 = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const tusind = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function sidsteSøndagUtc(år: number, måned: number): number {
    const sidste = new Date(Date.UTC(år, måned, 0));
    return Date.UTC(år, måned - 1, sidste.getUTCDate() - sidste.getUTCDay(), 1);
}

export function dkForskydning(utcMs: number): 1 | 2 {
    const år = new Date(utcMs).getUTCFullYear();
    return utcMs >= sidsteSøndagUtc(år, 3) && utcMs < sidsteSøndagUtc(år, 10) ? 2 : 1;
}

interface Stempel { naiv: number; zoneMin: number | null; slash: [number, number] | null }

function gyldigDato(å: number, mo: number, d: number): boolean {
    if (å < 1 || mo < 1 || mo > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(å, mo, 0)).getUTCDate();
}

export function læsStempel(f: string): Stempel | null {
    const t = f.trim();
    let m = ISO.exec(t);
    let å: number, mo: number, d: number, h: number, mi: number, s: number, zone: number | null = null, slash: [number, number] | null = null;
    if (m) {
        [å, mo, d] = [+m[1], +m[2], +m[3]];
        [h, mi, s] = [+(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
        if (m[7]) {
            if (m[7] === "Z" || m[7] === "z") zone = 0;
            else { const z = m[7].replace(":", ""); zone = (z[0] === "-" ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3, 5)); }
        }
    } else {
        m = DANSK.exec(t);
        if (!m) return null;
        [d, mo, å] = [+m[1], +m[3], +m[4]];
        [h, mi, s] = [+(m[5] ?? 0), +(m[6] ?? 0), +(m[7] ?? 0)];
        if (m[2] === "/") slash = [+m[1], +m[3]];
    }
    if (!gyldigDato(å, mo, d)) return null;
    let naiv: number;
    if (h === 24 && mi === 0 && s === 0) naiv = Date.UTC(å, mo - 1, d) + DØGN;
    else if (h > 23 || mi > 59 || s > 59) return null;
    else naiv = Date.UTC(å, mo - 1, d, h, mi, s);
    return { naiv, zoneMin: zone, slash };
}

/** Naiv dansk lokaltid → UTC (infer ved vintertid, shift_forward ved sommertid). */
function lokalTilUtc(naiv: number, set: Set<number>): [number, "ok" | "tvetydig1" | "tvetydig2" | "findes_ikke"] {
    const sommer = naiv - 2 * TIME, vinter = naiv - TIME;
    const sOk = dkForskydning(sommer) === 2, vOk = dkForskydning(vinter) === 1;
    if (sOk && vOk) {
        if (set.has(naiv)) return [vinter, "tvetydig2"];
        set.add(naiv);
        return [sommer, "tvetydig1"];
    }
    if (sOk) return [sommer, "ok"];
    if (vOk) return [vinter, "ok"];
    return [sidsteSøndagUtc(new Date(naiv).getUTCFullYear(), 3), "findes_ikke"];
}

/** Port af scripts/vaerksark_til_yaml.py:_solen_er_nede (56° N, 10,5° Ø, midt i timen, > 6° under horisonten). */
export function solenErNede(tUtc: number): boolean {
    const d = new Date(tUtc);
    const doy = Math.floor((tUtc - Date.UTC(d.getUTCFullYear(), 0, 1)) / DØGN) + 1;
    const soltid = d.getUTCHours() + 0.5 + 10.5 / 15.0;
    const rad = (x: number) => (x * Math.PI) / 180;
    const decl = rad(23.45 * Math.sin(rad((360.0 / 365.0) * (doy - 81))));
    const lat = rad(56.0);
    const sinH = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(rad(15.0 * (soltid - 12.0)));
    return sinH < Math.sin(rad(-6.0));
}

/** (værdi, ren tekst) ; null = tom ; kaster ved ikke-tal (fejlen bærer teksten). */
function læsTal(f: string, decimalkomma: boolean): [number, string | null] | null {
    let t = f.trim();
    if (TOMME.has(t.toLowerCase())) return null;
    if (decimalkomma) t = t.replace(/\.(?=\d{3}(\D|$))/g, "").replaceAll(",", ".");
    if (!TAL.test(t)) throw new IkkeTal(t);
    const v = Number(t);
    if (!Number.isFinite(v)) throw new IkkeTal(t);
    return [v, REN_DECIMAL.test(t) ? t : null];
}
class IkkeTal extends Error { constructor(public tekst: string) { super(tekst); } }

function ligerTal(f: string): boolean {
    try { return læsTal(f, true) !== null; } catch { return false; }
}

function lignerExcel(f: string, decimalkomma: boolean): boolean {
    try { const r = læsTal(f, decimalkomma); return r !== null && r[0] >= 20000 && r[0] <= 80000; } catch { return false; }
}

const linjer = (nr: number[]) => nr.slice(0, 3).join(", ") + (nr.length > 3 ? ` (og ${nr.length - 3} flere)` : "");
const pad = (n: number) => String(n).padStart(2, "0");
function dato(ms: number): string {
    const d = new Date(ms);
    return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
const naivDato = (ms: number) => { const d = new Date(ms); return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`; };
const naivKl = (ms: number) => `${naivDato(ms)} kl. ${pad(new Date(ms).getUTCHours())}`;

// ------------------------------------------------------------------ tabel

interface Tabel { skille: string; decimalkomma: boolean; overskrift: boolean; kolonner: string[]; rækker: [number, string[]][] }

export function læsTabel(tekst: string): Tabel | null {
    if (tekst.startsWith("\uFEFF")) tekst = tekst.slice(1);
    const lin = tekst.split(/\r\n|\n|\r/).map((l, i) => [i + 1, l] as [number, string]).filter(([, l]) => l.trim() && !l.trimStart().startsWith("#"));
    if (!lin.length) return null;
    const første = lin[0][1];
    const skille = første.includes("\t") ? "\t" : første.includes(";") ? ";" : ",";
    const del = (l: string) => {
        const ud: string[] = [];
        let felt = "", citat = false;
        for (let i = 0; i < l.length; i++) {
            const c = l[i];
            if (citat) {
                if (c === '"' && l[i + 1] === '"') { felt += '"'; i++; }
                else if (c === '"') citat = false;
                else felt += c;
            } else if (c === '"') citat = true;
            else if (c === skille) { ud.push(felt.trim()); felt = ""; }
            else felt += c;
        }
        ud.push(felt.trim());
        return ud;
    };
    const alle = lin.map(([nr, l]) => [nr, del(l)] as [number, string[]]);
    const hoved0 = alle[0][1];
    const overskrift = læsStempel(hoved0[0]) === null && !ligerTal(hoved0[hoved0.length - 1]);
    const data = overskrift ? alle.slice(1) : alle;
    const bredde = Math.max(...alle.map(([, r]) => r.length));
    const kolonner = overskrift ? hoved0 : Array.from({ length: bredde }, (_, i) => `kolonne ${i + 1}`);
    const decimalkomma = skille !== "," && data.slice(0, 500).some(([, r]) => r.some((f) => DECIMALKOMMA.test(f)));
    return { skille, decimalkomma, overskrift, kolonner: kolonner.map((k) => k.trim()), rækker: data };
}

// ------------------------------------------------------------------ fund

class Fundliste {
    liste: Fund[] = [];
    add(kode: Kode, felter: Record<string, string | number> = {}, niveau?: Niveau): void {
        const r = K.regler[kode];
        let besked: string = r.besked;
        const mangler = [...besked.matchAll(/\{(\w+)\}/g)].some((m) => !(m[1] in felter));
        if (!mangler) besked = besked.replace(/\{(\w+)\}/g, (_, k: string) => String(felter[k]));
        this.liste.push({ niveau: niveau ?? (r.niveau as Niveau), kode, besked: besked.slice(0, 400) });
    }
    harFejl(): boolean { return this.liste.some((f) => f.niveau === "fejl"); }
}

function aktiv(e: unknown): boolean { return !(e && typeof e === "object" && (e as Record<string, unknown>).enabled === false); }

export function kapacitetMw(vaerk: NonNullable<Valg["vaerk"]>): number {
    const u = Object.values(vaerk.units ?? {}).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && aktiv(x));
    const s = Object.values(vaerk.storage ?? {}).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && aktiv(x));
    return fsum(u.map((x) => Number(x.p_max_heat || 0))) + fsum(s.map((x) => Number(x.p_max_discharge_mw || 0)));
}

function værksFund(p: [number, number, string | null][], rolle: Rolle, vaerk: NonNullable<Valg["vaerk"]>, spændDøgn: number): Fund[] {
    const f = new Fundliste();
    const units = Object.entries(vaerk.units ?? {}).filter((e): e is [string, Record<string, unknown>] => !!e[1] && typeof e[1] === "object" && aktiv(e[1]));
    const vs = p.map((x) => x[1]);
    const maks = Math.max(...vs);
    if (rolle === "varmelast") {
        const kap = kapacitetMw(vaerk);
        const over = p.filter(([, v]) => v > kap * (1 + 1e-9));
        if (over.length) f.add("over_kapacitet", { antal: over.length, foerste: dato(over[0][0]), vaerdi: talTekst(pyRound(over[0][1], 2)), kap: talTekst(pyRound(kap, 2)) });
    }
    if (rolle === "solprofil") {
        const sol = units.filter(([, u]) => u.type === "solar_thermal");
        if (!sol.length) { f.add("sol_ingen_enhed"); return f.liste; }
        if (sol.length > 1) { f.add("sol_flere_enheder", { navne: sol.map(([n]) => n).join(", ") }); return f.liste; }
        const [navn, u] = sol[0];
        const pmax = Number(u.p_max_heat || 0);
        if (pmax > 0 && maks > pmax * (1 + 1e-9)) f.add("sol_over_pmax", { maks: talTekst(pyRound(maks, 2)), pmax: talTekst(pmax), navn });
        if (pmax >= G.sol_andel_min_pmax && maks > 0 && maks <= 1.0) f.add("sol_andel", { pmax: talTekst(pmax) });
        if (spændDøgn >= G.helaar_doegn && pmax > 0) {
            const b = (fsum(vs) / vs.length) * 8760.0 / pmax;
            const [lo, hi] = G.benyttelsestid_sol_t;
            if (!(lo <= b && b <= hi)) f.add("sol_benyttelsestid", { timer: pyRound(b), lo, hi, pmax: talTekst(pmax) });
        }
    }
    return f.liste;
}

function nulstræk(p: [number, number, string | null][]): [number, number | null] {
    let bedst = 0, cur = 0, start: number | null = null, bst: number | null = null;
    let forrige: [number, number] | null = null;
    for (const [t, v] of p) {
        if (v === 0 && forrige && forrige[1] === 0 && t - forrige[0] === TIME) cur++;
        else if (v === 0) { cur = 1; start = t; }
        else cur = 0;
        if (cur > bedst) { bedst = cur; bst = start; }
        forrige = [t, v];
    }
    return [bedst, bst];
}

function konstant(p: [number, number, string | null][]): [number, number | null, number | null] {
    let bedst = 0, cur = 0, start: number | null = null, bst: number | null = null, bv: number | null = null;
    let forrige: [number, number] | null = null;
    for (const [t, v] of p) {
        if (v > 0 && forrige && forrige[1] === v && t - forrige[0] === TIME) cur++;
        else if (v > 0) { cur = 1; start = t; }
        else cur = 0;
        if (cur > bedst) { bedst = cur; bst = start; bv = v; }
        forrige = [t, v];
    }
    return [bedst, bst, bv];
}

function spidser(p: [number, number, string | null][], vindue: number, faktor: number): [number, number][] {
    const vs = p.map((x) => x[1]), ts = p.map((x) => x[0]);
    const h = Math.floor(vindue / 2);
    const ud: [number, number][] = [];
    for (let i = 0; i < vs.length; i++) {
        let lo = i, hi = i;
        while (lo > 0 && ts[i] - ts[lo - 1] <= h * TIME) lo--;
        while (hi < vs.length - 1 && ts[hi + 1] - ts[i] <= h * TIME) hi++;
        const s = vs.slice(lo, hi + 1).sort((a, b) => a - b);
        const n = s.length;
        const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
        if (med > 0 && vs[i] > faktor * med) ud.push([ts[i], vs[i]]);
    }
    return ud;
}

// ------------------------------------------------------------------ valider

/** Afkoder bytes som oraklet: UTF-8, ellers Windows-1252 (med fundet kodning_cp1252). */
function afkod(b: Uint8Array): [string, boolean] {
    try { return [new TextDecoder("utf-8", { fatal: true }).decode(b), false]; }
    catch { return [new TextDecoder("windows-1252").decode(b), true]; }
}

export function valider(indhold: string | Uint8Array, rolle: string, valg: Valg = {}): Valideringsresultat {
    const tidszone = valg.tidszone ?? "UTC", tidsstempel = valg.tidsstempel ?? "start", enhed = valg.enhed ?? "MW";
    const kolonne = valg.kolonne ?? null;
    const fund = new Fundliste();
    const val: Record<string, unknown> = { version: K.version, rolle, tidszone, tidsstempel, enhed_kilde: enhed, enhed: "MW" };
    const afvis = (): Valideringsresultat => ({
        status: "afvist", normaliseret: null, punkter: [],
        validering: { ...val, fund: fund.liste, fejl: fund.liste.filter((f) => f.niveau === "fejl").map((f) => f.besked), advarsler: fund.liste.filter((f) => f.niveau === "advarsel").map((f) => f.besked) },
    });

    if (rolle !== "varmelast" && rolle !== "solprofil") { fund.add("rolle_ukendt", { rolle }); return afvis(); }
    if (tidszone !== "UTC" && tidszone !== "Europe/Copenhagen") { fund.add("tidszone_ukendt", { tidszone }); return afvis(); }
    if (tidsstempel !== "start" && tidsstempel !== "slut") { fund.add("tidsstempel_ukendt", { tidsstempel }); return afvis(); }
    const enheder = K.enheder as Record<string, { faktor_til_mw: number; pr_interval?: boolean }>;
    // K5-F1: kun egne egenskaber — `enheder['constructor']` ville ellers være Object og give NaN (oraklet: KeyError).
    const faktorEnhed = Object.hasOwn(enheder, enhed) ? enheder[enhed] : undefined;
    if (!faktorEnhed) { fund.add("enhed_ukendt", { enhed }); return afvis(); }

    let tekst: string;
    if (typeof indhold !== "string") {
        if (indhold.length > G.max_bytes) {
            fund.add("for_stor", { hvad: `${tusind(indhold.length)} bytes`, graense: `${tusind(G.max_bytes)} bytes` });
            return afvis();
        }
        const [t, cp] = afkod(indhold);
        tekst = t;
        if (cp) fund.add("kodning_cp1252");
    } else tekst = indhold;

    const tabel = læsTabel(tekst);
    if (!tabel || !tabel.rækker.length) { fund.add("tom"); return afvis(); }
    if (tabel.rækker.length > G.max_raekker) {
        fund.add("for_stor", { hvad: `${tusind(tabel.rækker.length)} rækker`, graense: `${tusind(G.max_raekker)} rækker` });
        return afvis();
    }
    const kol = tabel.kolonner, navne = kol.map((c) => c.toLowerCase());
    const prøve = tabel.rækker.slice(0, 50);
    const andel = (i: number, ok: (f: string) => boolean) => {
        const felter = prøve.filter(([, r]) => i < r.length && !erTom(r[i])).map(([, r]) => r[i]);
        return felter.length ? felter.filter(ok).length / felter.length : 0;
    };
    const erStempel = (f: string) => læsStempel(f) !== null;
    let it: number | null = null;
    for (const n of K.tidskolonne_navne) if (navne.includes(n)) { it = navne.indexOf(n); break; }
    if (it === null || andel(it, erStempel) < 0.9) {
        it = null;
        for (let i = 0; i < kol.length; i++) if (andel(i, erStempel) >= 0.9) { it = i; break; }
    }
    if (it === null) {
        if (kol.some((_, i) => andel(i, (f) => lignerExcel(f, tabel.decimalkomma)) >= 0.9)) fund.add("excel_serietal");
        else fund.add("ingen_tid");
        return afvis();
    }
    const tid = it;
    const erTalkol = (i: number) => i !== tid
        && andel(i, (f) => { try { læsTal(f, tabel.decimalkomma); return true; } catch { return false; } }) >= 0.9
        && prøve.some(([, r]) => i < r.length && !erTom(r[i]));
    const talkol = kol.map((_, i) => i).filter(erTalkol);
    let iv: number | null;
    if (kolonne !== null) {
        if (!kol.includes(kolonne)) { fund.add("kolonne_findes_ikke", { kolonne, kolonner: kol.join(", ") }); return afvis(); }
        iv = kol.indexOf(kolonne);
    } else {
        const foretrukne = K.vaerdikolonne_navne.filter((n) => navne.includes(n) && talkol.includes(navne.indexOf(n))).map((n) => navne.indexOf(n));
        iv = foretrukne[0] ?? talkol[0] ?? null;
    }
    if (iv === null) { fund.add("ingen_vaerdi"); return afvis(); }
    const vk = iv;
    if (talkol.length > 1 && kolonne === null) fund.add("flere_kolonner", { antal: talkol.length, kolonne: kol[vk] });
    Object.assign(val, { tidskolonne: kol[tid], vaerdikolonne: kol[vk], kilde_raekker: tabel.rækker.length });
    if (navne[tid] === "hour_dk" && tidszone === "UTC") fund.add("hour_dk_som_utc");

    // --- tid og tal
    const ugyldigTid: number[] = [], ugyldigtTal: number[] = [], ikkeEndelig: number[] = [], findesIkke: number[] = [], slashUs: number[] = [];
    const tvetydige = new Set<number>();
    let medZone = 0, udenZone = 0;
    const rå: { t: number; v: number | null; vt: string | null; nr: number; naiv: number }[] = [];
    const lokalNaiv: number[] = [];
    for (const [nr, r] of tabel.rækker) {
        const felt = tid < r.length ? r[tid] : "";
        const st = læsStempel(felt);
        if (!st) {
            // måned/dag/år: et "måned"-felt over 12 findes ikke som dansk dato.
            const us = DANSK.exec(felt.trim());
            (us && us[2] === "/" && +us[3] > 12 && 12 >= +us[1] ? slashUs : ugyldigTid).push(nr);
            continue;
        }
        if (st.slash && st.slash[1] > 12 && 12 >= st.slash[0]) slashUs.push(nr);
        let lt: [number, string | null] | null;
        try { lt = læsTal(vk < r.length ? r[vk] : "", tabel.decimalkomma); }
        catch (e) {
            const t = e instanceof IkkeTal ? e.tekst.toLowerCase().replace(/^[+-]+/, "") : "";
            (t === "inf" || t === "infinity" ? ikkeEndelig : ugyldigtTal).push(nr);
            continue;
        }
        let t: number;
        if (st.zoneMin !== null) { medZone++; t = st.naiv - st.zoneMin * 60_000; }
        else {
            udenZone++;
            if (tidszone === "UTC") t = st.naiv;
            else {
                lokalNaiv.push(st.naiv);
                const [u, art] = lokalTilUtc(st.naiv, tvetydige);
                t = u;
                if (art === "findes_ikke") findesIkke.push(nr);
            }
        }
        rå.push({ t, v: lt ? lt[0] : null, vt: lt ? lt[1] : null, nr, naiv: st.naiv });
    }
    if (ugyldigTid.length) fund.add("ugyldig_tid", { antal: ugyldigTid.length, linjer: linjer(ugyldigTid) });
    if (slashUs.length) fund.add("amerikansk_dato", { antal: slashUs.length, linjer: linjer(slashUs) });
    if (ugyldigtTal.length) fund.add("ugyldigt_tal", { antal: ugyldigtTal.length, linjer: linjer(ugyldigtTal) });
    if (ikkeEndelig.length) fund.add("ikke_endelig", { antal: ikkeEndelig.length, linjer: linjer(ikkeEndelig) });
    if (medZone && udenZone) fund.add("blandet_zone");
    if (medZone && !udenZone && tidszone !== "UTC") fund.add("zone_i_fil");
    if (findesIkke.length) fund.add("dst_time_findes_ikke", { antal: findesIkke.length, linjer: linjer(findesIkke) });
    if (fund.harFejl()) return afvis();
    if (!rå.some((p) => p.v !== null)) { fund.add("alle_tomme"); return afvis(); }

    // --- opløsning og timens slut
    rå.sort((a, b) => a.t - b.t);
    const skridt = new Map<number, number>();
    for (let i = 1; i < rå.length; i++) { const d = rå[i].t - rå[i - 1].t; if (d > 0) skridt.set(d, (skridt.get(d) ?? 0) + 1); }
    let typisk: number | null = null, flest = 0;
    for (const [d, c] of skridt) if (c > flest) { typisk = d; flest = c; }
    if (typisk !== TIME && typisk !== KVARTER) { fund.add("oploesning", { minutter: typisk === null ? "?" : Math.floor(typisk / 60_000) }); return afvis(); }
    const kildeOpl = typisk === TIME ? "1h" : "15min";
    val.kilde_oploesning = kildeOpl;
    const forskyd = tidsstempel === "slut" ? typisk : 0;

    const naive = rå.map((p) => p.naiv).sort((a, b) => a - b);
    const n0 = naive[0], n1 = naive[naive.length - 1];
    const del = (ms: number) => { const d = new Date(ms); return { dag: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), m: d.getUTCMonth() + 1, ugedag: d.getUTCDay(), år: d.getUTCFullYear() }; };
    if (tidsstempel === "start" && del(n0).dag === 1 && del(n0).h === 1 && del(n0).mi === 0 && del(n1).dag === 1 && del(n1).h === 0 && del(n1).mi === 0) fund.add("timeslut_mistanke");
    if (tidsstempel === "slut" && del(n0).dag === 1 && del(n0).h === 0 && del(n0).mi === 0 && del(n1 + typisk).dag === 1 && del(n1 + typisk).h === 0) fund.add("timestart_mistanke");

    if (tidszone === "UTC" && udenZone) {
        const tæl = new Map<number, number>();
        for (const n of naive) tæl.set(n, (tæl.get(n) ?? 0) + 1);
        const dobbelt = [...tæl.entries()].filter(([n, c]) => { const x = del(n); return c >= 2 && x.m === 10 && x.ugedag === 0 && x.dag > 24 && x.h === 2; }).map(([n]) => n).sort((a, b) => a - b);
        const sfort = new Set(naive);
        const hulForår: number[] = [];
        for (const år of [...new Set(naive.map((n) => del(n).år))].sort((a, b) => a - b)) {
            const kl2 = sidsteSøndagUtc(år, 3) + TIME;
            if (n0 < kl2 && kl2 < n1 && !sfort.has(kl2) && sfort.has(kl2 - TIME) && sfort.has(kl2 + TIME)) hulForår.push(kl2);
        }
        if (dobbelt.length || hulForår.length) {
            fund.add("ligner_dansk_tid", { hvor: [...dobbelt.map((d) => `${naivKl(d)} (to gange)`), ...hulForår.map((d) => `${naivKl(d)} (mangler)`)].join(", ") });
        }
    }
    if (tidszone === "Europe/Copenhagen" && lokalNaiv.length) {
        for (const år of [...new Set(lokalNaiv.map((n) => del(n).år))].sort((a, b) => a - b)) {
            const kl2 = sidsteSøndagUtc(år, 10) + TIME;
            if (lokalNaiv[0] < kl2 && kl2 < lokalNaiv[lokalNaiv.length - 1] && lokalNaiv.filter((n) => n === kl2).length === 1) fund.add("dst_dobbelttime_en_gang", { dato: naivDato(kl2) });
        }
    }

    // --- skæve stempler, dubletter
    const skæve: number[] = [], dubletter: number[] = [];
    const prTid = new Map<number, [number | null, string | null]>();
    for (const p of rå) {
        const t2 = p.t - forskyd;
        const d2 = new Date(t2);
        if (d2.getUTCMinutes() % (kildeOpl === "1h" ? 60 : 15) || d2.getUTCSeconds() || d2.getUTCMilliseconds()) { skæve.push(p.nr); continue; }
        if (prTid.has(t2)) { dubletter.push(p.nr); continue; }
        prTid.set(t2, [p.v, p.vt]);
    }
    if (skæve.length) fund.add("skaev_tid", { antal: skæve.length, linjer: linjer(skæve), enhed: kildeOpl === "1h" ? "klokkeslæt" : "kvarter" });
    if (dubletter.length) fund.add("dubletter", { antal: dubletter.length, linjer: linjer(dubletter) });
    if (fund.harFejl()) return afvis();

    // --- 15 min → 1 h
    let punkter: [number, number, string | null][];
    let timerPrInterval: number;
    if (kildeOpl === "15min") {
        const timer = new Map<number, number[]>();
        for (const [t, [v]] of prTid) {
            if (v === null) continue;
            const h = t - (t % TIME);
            const l = timer.get(h);
            if (l) l.push(v); else timer.set(h, [v]);
        }
        const delvise = [...timer.values()].filter((vs) => vs.length < 4).length;
        punkter = [...timer.entries()].filter(([, vs]) => vs.length === 4).map(([h, vs]) => [h, fsum(vs) / 4.0, null] as [number, number, null]).sort((a, b) => a[0] - b[0]);
        fund.add("kvarter_aggregeret");
        if (delvise) fund.add("delvise_timer", { antal: delvise });
        timerPrInterval = 0.25;
    } else {
        punkter = [...prTid.entries()].filter(([, [v]]) => v !== null).map(([t, [v, vt]]) => [t, v as number, vt] as [number, number, string | null]).sort((a, b) => a[0] - b[0]);
        timerPrInterval = 1.0;
    }
    if (!punkter.length) { fund.add("alle_tomme"); return afvis(); }

    // --- enhed
    let fak = faktorEnhed.faktor_til_mw;
    if (faktorEnhed.pr_interval) fak = fak / timerPrInterval;
    if (fak !== 1.0) { punkter = punkter.map(([t, v]) => [t, v * fak, null]); fund.add("enhed_omregnet", { enhed }); }

    // --- værdier
    let vs = punkter.map((p) => p[1]);
    const neg = punkter.filter((p) => p[1] < 0);
    if (neg.length) fund.add("negativ", { antal: neg.length, foerste: dato(neg[0][0]), vaerdi: talTekst(neg[0][1]) });
    const mx = Math.max(...vs);
    if (mx === 0) fund.add("alle_nul");
    if (mx > G.urimelig_stor_mw) fund.add("urimelig_stor", { maks: talTekst(pyRound(mx, 1)), graense: G.urimelig_stor_mw });
    if (punkter.length < G.min_timer) fund.add("for_kort", { antal: punkter.length, graense: G.min_timer });
    if (fund.harFejl()) return afvis();

    const t0 = punkter[0][0], t1 = punkter[punkter.length - 1][0];
    const forventet = Math.floor((t1 - t0) / TIME) + 1;
    const huller: [number, number, number][] = [];
    for (let i = 1; i < punkter.length; i++) {
        const a = punkter[i - 1][0], b = punkter[i][0];
        const n = Math.floor((b - a) / TIME) - 1;
        if (n > 0) huller.push([a + TIME, b - TIME, n]);
    }
    const antalHuller = huller.reduce((s, h) => s + h[2], 0);
    const længste = huller.reduce((m, h) => Math.max(m, h[2]), 0);
    const spændDøgn = (t1 - t0 + TIME) / DØGN;

    let udfyldt = 0;
    if (rolle === "solprofil" && antalHuller) {
        if (antalHuller > G.sol_max_hulandel * forventet) { fund.add("sol_huller", { antal: antalHuller, andel: procent1(antalHuller / forventet) }); return afvis(); }
        const ny: [number, number, string | null][] = [];
        for (let i = 1; i < punkter.length; i++) {
            const [ta, va, sa] = punkter[i - 1], [tb, vb] = punkter[i];
            ny.push([ta, va, sa]);
            const n = Math.floor((tb - ta) / TIME) - 1;
            for (let j = 1; j <= n; j++) {
                const t = ta + j * TIME;
                ny.push([t, solenErNede(t) ? 0.0 : va + ((vb - va) * j) / (n + 1), null]);
            }
        }
        ny.push(punkter[punkter.length - 1]);
        punkter = ny;
        udfyldt = antalHuller;
        fund.add("sol_huller_udfyldt", { antal: antalHuller, laengste: længste });
        vs = punkter.map((p) => p[1]);
    }

    const total = fsum(vs);
    const middel = total / vs.length;
    const maks = Math.max(...vs);
    const maksT = punkter.find((p) => p[1] === maks)![0];
    Object.assign(val, {
        start: tidTekst(t0), slut: tidTekst(t1), oploesning: "1h", antal_raekker: punkter.length, forventet_raekker: forventet,
        antal_huller: rolle === "solprofil" ? 0 : antalHuller, udfyldte_timer: udfyldt, laengste_hul_timer: længste,
        daekning: pyRound(1 - (rolle === "solprofil" ? 0 : antalHuller) / forventet, 6),
        min: Math.min(...vs), max: maks, max_tid: tidTekst(maksT), middel, sum_mwh: total, aarssum_gwh: (middel * 8760.0) / 1000.0,
        benyttelsestid_t: maks > 0 ? pyRound((middel / maks) * 8760.0) : null,
        huller: rolle === "varmelast" ? huller.map(([a, b, n]) => [tidTekst(a), tidTekst(b), n]) : [],
    });

    if (rolle === "varmelast" && huller.length) {
        fund.add("huller", { antal: antalHuller, laengste: længste, andel: procent1(antalHuller / forventet) });
        if (længste > G.langt_hul_timer) fund.add("langt_hul", { laengste: længste });
    }
    if (spændDøgn < G.kort_serie_doegn) fund.add("kort_serie", { doegn: fast(spændDøgn, 1) });

    if (rolle === "varmelast") {
        const [n0s, t0s] = nulstræk(punkter);
        if (n0s >= G.nul_straek_timer) fund.add("nul_straek", { timer: n0s, fra: dato(t0s!) });
        const [nf, tf, vf] = konstant(punkter);
        if (nf >= G.fastfrosset_timer) fund.add("fastfrosset", { timer: nf, fra: dato(tf!), vaerdi: talTekst(vf!) });
        const sp = spidser(punkter, G.spids_vindue_timer, G.spids_faktor);
        if (sp.length) fund.add("spids", { antal: sp.length, foerste: dato(sp[0][0]), vaerdi: talTekst(pyRound(sp[0][1], 2)), faktor: talTekst(G.spids_faktor) });
        if (spændDøgn >= G.helaar_doegn && maks > 0) {
            const b = (middel / maks) * 8760.0;
            const [lo, hi] = G.benyttelsestid_varmelast_t;
            if (!(lo <= b && b <= hi)) fund.add("benyttelsestid", { timer: pyRound(b), lo, hi });
        }
    }
    if (rolle === "solprofil" && total > 0) {
        const nat = punkter.filter(([t]) => solenErNede(t));
        const natSum = fsum(nat.map((p) => p[1]));
        const natMax = nat.reduce((m, p) => Math.max(m, p[1]), 0.0);
        if (natSum > G.sol_nat_andel * total || natMax > G.sol_nat_spids_andel * maks) {
            fund.add("sol_nat", { timer: nat.filter((p) => p[1] > 0.01 * maks).length, mwh: talTekst(pyRound(natSum, 1)) });
        }
        const tyngde = fsum(punkter.map(([t, v]) => new Date(t).getUTCHours() * v)) / total;
        val.sol_tyngdepunkt_time_utc = pyRound(tyngde, 3);
        const [lo, hi] = G.sol_tyngdepunkt_utc;
        if (!(lo <= tyngde && tyngde <= hi)) fund.add("sol_tidsforskudt", { tyngde: fast(tyngde, 2), lo, hi });
    }
    if (valg.vaerk) fund.liste.push(...værksFund(punkter, rolle, valg.vaerk, spændDøgn));
    if (fund.harFejl()) return afvis();

    const ud = ["time,mw", ...punkter.map(([t, v, vt]) => `${tidTekst(t)},${vt !== null && fak === 1.0 ? vt : talTekst(v)}`)];
    return {
        status: "gyldig",
        normaliseret: ud.join("\n") + "\n",
        punkter: punkter.map(([t, v]) => ({ t, v })),
        validering: { ...val, fund: fund.liste, fejl: [], advarsler: fund.liste.filter((f) => f.niveau === "advarsel").map((f) => f.besked) },
    };
}
