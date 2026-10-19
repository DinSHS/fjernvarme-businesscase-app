//-----------------------------------------------------------------------
// Lille markdown-parser (CommonMark/GFM-delmængde) til appens egne tekster og
// modelrepoets vejledninger. Ingen afhængigheder, og den producerer et TRÆ — ikke HTML:
// renderen bygger React-elementer af træet, så rå HTML i en kilde aldrig bliver til
// markup (den vises som tekst). Sanitering er derfor konstruktionen, ikke et filter.
//
// Understøttet: overskrifter, afsnit, fed/kursiv/gennemstreget, kode (inline og blok),
// links (inkl. <url> og bare http-adresser), lister (også indlejrede og ordnede),
// citater, tabeller med justering, vandret streg. Ikke understøttet (findes ikke i
// kilderne): billeder (alt-teksten vises), fodnoter, rå HTML, referencelinks.
//-----------------------------------------------------------------------

export type Inline =
    | { t: "tekst"; v: string }
    | { t: "kode"; v: string }
    | { t: "fed" | "kursiv" | "streg"; b: Inline[] }
    | { t: "link"; href: string; b: Inline[] }
    | { t: "br" };

export type Justering = "venstre" | "hojre" | "midt" | null;

export type Blok =
    | { t: "overskrift"; niveau: number; b: Inline[]; id: string; tekst: string }
    | { t: "afsnit"; b: Inline[] }
    | { t: "kode"; sprog: string; v: string }
    | { t: "citat"; b: Blok[] }
    | { t: "liste"; ordnet: boolean; start: number; punkter: Blok[][] }
    | { t: "tabel"; hoved: Inline[][]; just: Justering[]; raekker: Inline[][][] }
    | { t: "streg" };

//-- slug -----------------------------------------------------------------

/** Prefix på overskrifts-id'er i DOM, så de ikke kolliderer med appens egne id'er. */
export const ANKER_PREFIX = "a-";

/**
 * GitHub-lignende overskriftsanker: små bogstaver, mellemrum -> '-', alt andet end
 * bogstaver/cifre/'-'/'_' fjernes (æøå bevares). "3. El: spot, tarif og afgift" -> "3-el-spot-tarif-og-afgift".
 */
export function overskriftsAnker(tekst: string): string {
    return tekst.toLowerCase().normalize("NFC").trim()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .replace(/\s/g, "-");
}

/** Ordliste-anker: som overskriftsankeret, men `_` bliver også til '-' og gentagne '-' slås sammen. */
export function ordAnker(tekst: string): string {
    return tekst.toLowerCase().normalize("NFC").trim()
        .replace(/[\s_]+/g, "-")
        .replace(/[^\p{L}\p{N}-]/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

//-- inline ---------------------------------------------------------------

const ER_BOGSTAV = /[\p{L}\p{N}]/u;
const ER_MELLEMRUM = /\s/;

/** Uigennemsigtigt flugttegn: backslash før tegnsætning viser tegnet. */
const FLUGT = /[\\`*_{}[\]()#+\-.!|~<>]/;

function findLukning(s: string, fra: number, tegn: string): number {
    // Første forekomst af `tegn` fra `fra`, som ikke er flugtet og ikke ligger inde i en kodespan.
    for (let i = fra; i < s.length; i++) {
        const c = s[i];
        if (c === "\\") { i++; continue; }
        if (c === "`") {
            const m = /^`+/.exec(s.slice(i))![0];
            const slut = s.indexOf(m, i + m.length);
            if (slut < 0) continue;
            i = slut + m.length - 1;
            continue;
        }
        if (s.startsWith(tegn, i)) return i;
    }
    return -1;
}

/** Finder den afsluttende `]` med korrekt nesting; -1 hvis den ikke findes. */
function findKlamme(s: string, fra: number): number {
    let dyb = 0;
    for (let i = fra; i < s.length; i++) {
        const c = s[i];
        if (c === "\\") { i++; continue; }
        if (c === "[") dyb++;
        else if (c === "]") { if (dyb === 0) return i; dyb--; }
    }
    return -1;
}

const BARE_URL = /^https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*/;

export function parsInline(s: string): Inline[] {
    const ud: Inline[] = [];
    let tekst = "";
    const skylTekst = () => { if (tekst) { ud.push({ t: "tekst", v: tekst }); tekst = ""; } };
    const forrige = () => (tekst ? tekst[tekst.length - 1] : ud.length ? "\u0000" : "");

    for (let i = 0; i < s.length; i++) {
        const c = s[i];

        // Flugtet tegn.
        if (c === "\\" && i + 1 < s.length) {
            if (s[i + 1] === "\n") { skylTekst(); ud.push({ t: "br" }); i++; continue; }
            if (FLUGT.test(s[i + 1])) { tekst += s[i + 1]; i++; continue; }
        }

        // Kodespan.
        if (c === "`") {
            const m = /^`+/.exec(s.slice(i))![0];
            const slut = s.indexOf(m, i + m.length);
            if (slut > 0) {
                skylTekst();
                let v = s.slice(i + m.length, slut).replace(/\n/g, " ");
                if (v.length > 2 && v.startsWith(" ") && v.endsWith(" ") && v.trim() !== "") v = v.slice(1, -1);
                ud.push({ t: "kode", v });
                i = slut + m.length - 1;
                continue;
            }
            tekst += m; i += m.length - 1; continue;
        }

        // Billede: kun alt-teksten (billeder bundtes ikke).
        if (c === "!" && s[i + 1] === "[") {
            const slut = findKlamme(s, i + 2);
            if (slut > 0 && s[slut + 1] === "(") {
                const par = s.indexOf(")", slut + 2);
                if (par > 0) { tekst += s.slice(i + 2, slut); i = par; continue; }
            }
        }

        // Link: [tekst](url "titel")
        if (c === "[") {
            const slut = findKlamme(s, i + 1);
            if (slut > 0 && s[slut + 1] === "(") {
                const par = findParentes(s, slut + 2);
                if (par > 0) {
                    const indre = s.slice(slut + 2, par).trim();
                    const m = /^(<[^>]*>|[^\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?$/.exec(indre);
                    if (m) {
                        skylTekst();
                        const href = m[1].startsWith("<") ? m[1].slice(1, -1) : m[1];
                        ud.push({ t: "link", href, b: parsInline(s.slice(i + 1, slut)) });
                        i = par;
                        continue;
                    }
                }
            }
        }

        // Autolink <https://…>
        if (c === "<") {
            const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(s.slice(i));
            if (m) { skylTekst(); ud.push({ t: "link", href: m[1], b: [{ t: "tekst", v: m[1] }] }); i += m[0].length - 1; continue; }
        }

        // Bar http-adresse.
        if (c === "h" && !ER_BOGSTAV.test(forrige() || " ")) {
            const m = BARE_URL.exec(s.slice(i));
            if (m) {
                const url = m[0].replace(/[.,;:!?]+$/, "");
                skylTekst();
                ud.push({ t: "link", href: url, b: [{ t: "tekst", v: url }] });
                i += url.length - 1;
                continue;
            }
        }

        // Gennemstreget ~~x~~
        if (c === "~" && s[i + 1] === "~" && s[i + 2] !== undefined && !ER_MELLEMRUM.test(s[i + 2])) {
            const slut = findLukning(s, i + 2, "~~");
            if (slut > i + 2 && !ER_MELLEMRUM.test(s[slut - 1])) {
                skylTekst(); ud.push({ t: "streg", b: parsInline(s.slice(i + 2, slut)) }); i = slut + 1; continue;
            }
        }

        // Fed og kursiv.
        if (c === "*" || c === "_") {
            const fr = forrige();
            // Åbning kræver start/mellemrum/tegnsætning før (ikke et bogstav: heat_load_params_* er ikke kursiv).
            const åbner = fr === "" || fr === "\u0000" || !(ER_BOGSTAV.test(fr) || fr === "_" || fr === "*");
            const dobbelt = s[i + 1] === c;
            const delim = dobbelt ? c + c : c;
            const efter = s[i + delim.length];
            if (åbner && efter !== undefined && !ER_MELLEMRUM.test(efter) && efter !== c) {
                let slut = -1;
                for (let j = findLukning(s, i + delim.length, delim); j > 0; j = findLukning(s, j + 1, delim)) {
                    const før = s[j - 1];
                    const næste = s[j + delim.length];
                    const lukkerGyldigt = !ER_MELLEMRUM.test(før) && (c === "*" || næste === undefined || !ER_BOGSTAV.test(næste))
                        && !(delim.length === 1 && (s[j + 1] === c || s[j - 1] === c));
                    if (lukkerGyldigt && j > i + delim.length) { slut = j; break; }
                }
                if (slut > 0) {
                    skylTekst();
                    ud.push({ t: dobbelt ? "fed" : "kursiv", b: parsInline(s.slice(i + delim.length, slut)) });
                    i = slut + delim.length - 1;
                    continue;
                }
            }
        }

        // Hård linjeskift: to mellemrum før \n.
        if (c === "\n") {
            if (tekst.endsWith("  ")) { tekst = tekst.replace(/ +$/, ""); skylTekst(); ud.push({ t: "br" }); continue; }
            tekst = tekst.replace(/ +$/, "") + " ";
            continue;
        }

        tekst += c;
    }
    skylTekst();
    return ud;
}

function findParentes(s: string, fra: number): number {
    let dyb = 0;
    for (let i = fra; i < s.length; i++) {
        const c = s[i];
        if (c === "\\") { i++; continue; }
        if (c === "(") dyb++;
        else if (c === ")") { if (dyb === 0) return i; dyb--; }
    }
    return -1;
}

/** Ren tekst af inline-træet (til anker og indholdsfortegnelse). */
export function inlineTekst(b: readonly Inline[]): string {
    return b.map((n) => {
        switch (n.t) {
            case "tekst": case "kode": return n.v;
            case "br": return " ";
            default: return inlineTekst(n.b);
        }
    }).join("");
}

//-- blokke ---------------------------------------------------------------

const RE_OVERSKRIFT = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RE_STREG = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const RE_KODE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const RE_LISTE = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const RE_TABEL_SEP = /^ {0,3}\|?[ \t]*:?-{1,}:?[ \t]*(?:\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;

function celler(linje: string): string[] {
    let l = linje.trim();
    if (l.startsWith("|")) l = l.slice(1);
    if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);
    const ud: string[] = [];
    let nu = "";
    let iKode = false;
    for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === "\\" && l[i + 1] === "|") { nu += "|"; i++; continue; }
        if (c === "`") iKode = !iKode;
        if (c === "|" && !iKode) { ud.push(nu.trim()); nu = ""; continue; }
        nu += c;
    }
    ud.push(nu.trim());
    return ud;
}

function justering(c: string): Justering {
    const v = c.trim();
    const l = v.startsWith(":"), r = v.endsWith(":");
    return l && r ? "midt" : r ? "hojre" : l ? "venstre" : null;
}

function erBlokStart(l: string, næste?: string): boolean {
    return RE_OVERSKRIFT.test(l) || RE_STREG.test(l) || RE_KODE.test(l) || /^ {0,3}>/.test(l)
        || (RE_LISTE.test(l) && !RE_STREG.test(l) && !/^ *\d{2,}[.)]/.test(l) && !/^ *[2-9][.)]/.test(l))
        || (l.includes("|") && næste !== undefined && RE_TABEL_SEP.test(næste) && næste.includes("-"));
}

export function parsMarkdown(kilde: string): Blok[] {
    const linjer = kilde.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
    const ankre = new Map<string, number>();
    return parsBlokke(linjer, ankre);
}

function parsBlokke(linjer: string[], ankre: Map<string, number>): Blok[] {
    const ud: Blok[] = [];
    let i = 0;
    while (i < linjer.length) {
        const l = linjer[i];
        if (l.trim() === "") { i++; continue; }

        // Kodeblok.
        const kode = RE_KODE.exec(l);
        if (kode) {
            const rammer = kode[1];
            const indrykning = /^ */.exec(l)![0].length;
            const v: string[] = [];
            i++;
            while (i < linjer.length && !new RegExp(`^ {0,3}${rammer[0]}{${rammer.length},}\\s*$`).test(linjer[i])) {
                v.push(linjer[i].slice(Math.min(indrykning, /^ */.exec(linjer[i])![0].length)));
                i++;
            }
            i++; // lukkende ramme (eller slut)
            ud.push({ t: "kode", sprog: kode[2], v: v.join("\n") });
            continue;
        }

        // Overskrift.
        const o = RE_OVERSKRIFT.exec(l);
        if (o) {
            const b = parsInline(o[2].trim());
            const tekst = inlineTekst(b);
            const grund = overskriftsAnker(tekst) || "afsnit";
            const antal = ankre.get(grund) ?? 0;
            ankre.set(grund, antal + 1);
            ud.push({ t: "overskrift", niveau: o[1].length, b, tekst, id: antal === 0 ? grund : `${grund}-${antal}` });
            i++;
            continue;
        }

        // Vandret streg (før liste: "---" og "* * *" er streger).
        if (RE_STREG.test(l)) { ud.push({ t: "streg" }); i++; continue; }

        // Tabel.
        if (l.includes("|") && i + 1 < linjer.length && RE_TABEL_SEP.test(linjer[i + 1]) && linjer[i + 1].includes("-")) {
            const hoved = celler(l);
            const sepCeller = celler(linjer[i + 1]);
            if (sepCeller.length === hoved.length) {
                const just = sepCeller.map(justering);
                const raekker: Inline[][][] = [];
                i += 2;
                while (i < linjer.length && linjer[i].trim() !== "" && linjer[i].includes("|")) {
                    const c = celler(linjer[i]);
                    while (c.length < hoved.length) c.push("");
                    raekker.push(c.slice(0, hoved.length).map(parsInline));
                    i++;
                }
                ud.push({ t: "tabel", hoved: hoved.map(parsInline), just, raekker });
                continue;
            }
        }

        // Citat.
        if (/^ {0,3}>/.test(l)) {
            const indre: string[] = [];
            while (i < linjer.length && /^ {0,3}>/.test(linjer[i])) { indre.push(linjer[i].replace(/^ {0,3}> ?/, "")); i++; }
            ud.push({ t: "citat", b: parsBlokke(indre, ankre) });
            continue;
        }

        // Liste.
        const lm = RE_LISTE.exec(l);
        if (lm) {
            const res = parsListe(linjer, i, ankre);
            ud.push(res.blok);
            i = res.næste;
            continue;
        }

        // Afsnit: løbende linjer til tom linje eller ny blok.
        const afsnit: string[] = [l];
        i++;
        while (i < linjer.length && linjer[i].trim() !== "" && !erBlokStart(linjer[i], linjer[i + 1])) {
            afsnit.push(linjer[i]);
            i++;
        }
        ud.push({ t: "afsnit", b: parsInline(afsnit.map((x) => x.replace(/^ +/, "")).join("\n").replace(/ +$/, "")) });
    }
    return ud;
}

function parsListe(linjer: string[], start: number, ankre: Map<string, number>): { blok: Blok; næste: number } {
    const første = RE_LISTE.exec(linjer[start])!;
    const basis = første[1].length;
    const ordnet = /\d/.test(første[2]);
    const nummer = ordnet ? parseInt(første[2], 10) : 1;
    const punkter: Blok[][] = [];
    let i = start;

    while (i < linjer.length) {
        const m = RE_LISTE.exec(linjer[i]);
        if (!m || m[1].length !== basis || /\d/.test(m[2]) !== ordnet || RE_STREG.test(linjer[i])) break;
        const indholdsKolonne = m[1].length + m[2].length + 1;
        const indre: string[] = [m[3]];
        i++;
        // Fortsættelse: tomme linjer og linjer indrykket mindst til indholdskolonnen (eller dovne afsnitsfortsættelser).
        while (i < linjer.length) {
            const l = linjer[i];
            if (l.trim() === "") {
                // En tom linje hører til punktet, hvis næste ikke-tomme linje stadig er indrykket.
                let j = i + 1;
                while (j < linjer.length && linjer[j].trim() === "") j++;
                if (j < linjer.length && /^ */.exec(linjer[j])![0].length >= indholdsKolonne) { indre.push(""); i++; continue; }
                break;
            }
            const rykind = /^ */.exec(l)![0].length;
            if (rykind >= indholdsKolonne) { indre.push(l.slice(indholdsKolonne)); i++; continue; }
            // Doven fortsættelse af et afsnit (ingen ny listemarkør, ingen blokstart).
            if (!RE_LISTE.test(l) && !erBlokStart(l, linjer[i + 1]) && indre[indre.length - 1] !== "") { indre.push(l.trim()); i++; continue; }
            break;
        }
        punkter.push(parsBlokke(indre, ankre));
        // Tomme linjer mellem punkter springes over, hvis næste linje er et søskendepunkt.
        let j = i;
        while (j < linjer.length && linjer[j].trim() === "") j++;
        const n = j < linjer.length ? RE_LISTE.exec(linjer[j]) : null;
        if (n && n[1].length === basis && /\d/.test(n[2]) === ordnet && !RE_STREG.test(linjer[j])) i = j;
        else break;
    }
    return { blok: { t: "liste", ordnet, start: nummer, punkter }, næste: i };
}

/** Alle overskrifter i et dokument (til indholdsfortegnelsen). */
export function overskrifter(blokke: readonly Blok[]): { niveau: number; tekst: string; id: string }[] {
    const ud: { niveau: number; tekst: string; id: string }[] = [];
    const gå = (bs: readonly Blok[]) => {
        for (const b of bs) {
            if (b.t === "overskrift") ud.push({ niveau: b.niveau, tekst: b.tekst, id: b.id });
            else if (b.t === "citat") gå(b.b);
            else if (b.t === "liste") b.punkter.forEach(gå);
        }
    };
    gå(blokke);
    return ud;
}

/** Alle links (href) i et dokument — til validering af interne henvisninger. */
export function linksI(blokke: readonly Blok[]): string[] {
    const ud: string[] = [];
    const inl = (bs: readonly Inline[]) => {
        for (const n of bs) {
            if (n.t === "link") { ud.push(n.href); inl(n.b); }
            else if (n.t === "fed" || n.t === "kursiv" || n.t === "streg") inl(n.b);
        }
    };
    const gå = (bs: readonly Blok[]) => {
        for (const b of bs) {
            if (b.t === "overskrift" || b.t === "afsnit") inl(b.b);
            else if (b.t === "citat") gå(b.b);
            else if (b.t === "liste") b.punkter.forEach(gå);
            else if (b.t === "tabel") { b.hoved.forEach(inl); b.raekker.forEach((r) => r.forEach(inl)); }
        }
    };
    gå(blokke);
    return ud;
}

/** Ordtal og læsetid (≈ 200 ord/min) af råteksten uden kodeblokke. */
export function laesetid(kilde: string): { ord: number; minutter: number } {
    const ord = kilde.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    return { ord, minutter: Math.max(1, Math.round(ord / 200)) };
}

/** Uden dokumentets egen titel (første blok, hvis den er en h1): titlen står allerede i sidens ramme. */
export function udenTitel(blokke: readonly Blok[]): Blok[] {
    return blokke[0]?.t === "overskrift" && blokke[0].niveau === 1 ? blokke.slice(1) : [...blokke];
}

const FORKORTELSER = new Set(["mio", "mia", "kr", "ca", "fx", "bl", "dvs", "osv", "pr", "evt", "nr", "jf", "inkl", "ekskl", "max", "min", "dkk"]);

/**
 * Den første sætning af et afsnit uden "(Kilde: …)"-henvisninger — til sidens budskab. Punktummer efter
 * forkortelser ("13,8 mio. kr.") afslutter ikke sætningen. Længere end `maks` tegn skæres ved et ord.
 */
export function foersteSaetning(blokke: readonly Blok[], maks = 220): string | undefined {
    const afsnit = blokke.find((b): b is Extract<Blok, { t: "afsnit" }> => b.t === "afsnit" && !/^\(?Kilder?:/.test(inlineTekst(b.b).trim()));
    if (!afsnit) return undefined;
    const tekst = inlineTekst(afsnit.b).replace(/\s*\(Kilder?:[^)]*\)/g, "").replace(/\s+/g, " ").trim();
    const re = /[.?!]\s+(?=[A-ZÆØÅ"«(])/g;
    let m: RegExpExecArray | null;
    let slut = tekst.length;
    while ((m = re.exec(tekst))) {
        const ord = /([\p{L}]+)$/u.exec(tekst.slice(0, m.index))?.[1]?.toLowerCase() ?? "";
        if (tekst[m.index] === "." && (FORKORTELSER.has(ord) || ord.length === 1)) continue;
        slut = m.index + 1;
        break;
    }
    const sætning = tekst.slice(0, slut);
    if (sætning.length <= maks) return sætning;
    const skåret = sætning.slice(0, maks);
    return skåret.slice(0, Math.max(skåret.lastIndexOf(" "), 40)).replace(/[,;:\s]+$/, "") + " …";
}
