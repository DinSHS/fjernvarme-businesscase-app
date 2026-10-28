//-----------------------------------------------------------------------
// En ny .xlsx fra bunden og læsning af en .xlsx tilbage til celleværdier (runde 13, arkivet).
//
// Samme bibliotek som værksarket (runde 12): fflate (MIT) pakker zip'en, XML'en skrives her. Arkivet udfylder
// ikke en skabelon, men skriver sine egne ark — så kun det, arkivet bruger: tekst (inline), tal, sand/falsk,
// datoer (talformat), fed overskrift, frosne overskriftsrækker, skjulte rækker og skjulte ark.
//
// Tekst gemmes, så den kommer PRÆCIS tilbage: XML kan ikke bære kontroltegn, og en XML-læser gør \r\n til \n.
// De skrives derfor som Excels egen _xHHHH_-form (og en bogstavelig "_x0041_" i teksten beskyttes med _x005F_).
// En tom tekst ("") er en celle med tom inline-tekst, ikke en tom celle — tom celle = null.
//-----------------------------------------------------------------------

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

/** Én celle. `dato` er et Excel-serietal vist som dato og tid (vægur — se arkivets Læs mig). */
export type Celle = string | number | boolean | null | { dato: number };

export interface Ark {
    navn: string;
    rækker: readonly (readonly Celle[])[];
    skjult?: boolean;
    /** 1-baserede rækkenumre. */
    skjulteRækker?: readonly number[];
    fedeRækker?: readonly number[];
    /** Antal frosne rækker øverst. */
    frys?: number;
    /** Kolonnebredder (tegn). */
    bredder?: readonly number[];
    /** Rækker med stor overskrift (Læs mig). */
    titelRækker?: readonly number[];
    /** Ombryd tekst i disse kolonner (1-baserede). */
    ombrydKolonner?: readonly number[];
}

export const EXCEL_MAKS_RÆKKER = 1_048_576;
export const EXCEL_MAKS_KOLONNER = 16_384;
export const EXCEL_MAKS_TEGN = 32_767;

export function kolBogstav(kol: number): string {
    let s = "";
    for (let k = kol; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
    return s;
}

function kolNummer(bogstaver: string): number {
    let n = 0;
    for (const c of bogstaver) n = n * 26 + (c.charCodeAt(0) - 64);
    return n;
}

const LØS_SURROGAT = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Tekst -> XML-tekst, der læses tilbage til præcis samme streng. */
export function tilXmlTekst(s: string): string {
    if (LØS_SURROGAT.test(s)) throw new Error("Teksten indeholder et ugyldigt Unicode-tegn (en løs surrogat), som Excel ikke kan gemme.");
    return s
        // Hver "_", der indleder noget, der ligner en escape, bliver _x005F_ — også i "_x005F_x0041_" (lookahead,
        // så den afsluttende "_" ikke forbruges og kan beskyttes som indledning til den næste).
        .replace(/_(?=x[0-9A-Fa-f]{4}_)/g, "_x005F_")
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0D\x0E-\x1F￾￿]/g, (c) => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fraXmlTekst(s: string): string {
    return s
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&")
        .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const STIL = { normal: 0, fed: 1, dato: 2, titel: 3, ombryd: 4 } as const;

function celleXml(ref: string, v: Celle, stil: number): string {
    const s = stil ? ` s="${stil}"` : "";
    if (v === null) return "";
    if (typeof v === "number") {
        if (!Number.isFinite(v)) throw new Error(`${ref}: ${v} er ikke et endeligt tal.`);
        return `<c r="${ref}"${s}><v>${String(v)}</v></c>`;
    }
    if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
    if (typeof v === "object") {
        if (!Number.isFinite(v.dato)) throw new Error(`${ref}: ugyldig dato.`);
        return `<c r="${ref}" s="${STIL.dato}"><v>${String(v.dato)}</v></c>`;
    }
    if (v.length > EXCEL_MAKS_TEGN) throw new Error(`${ref}: teksten er ${v.length} tegn; Excel tillader højst ${EXCEL_MAKS_TEGN} pr. celle.`);
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${tilXmlTekst(v)}</t></is></c>`;
}

function arkXml(a: Ark, valgt: boolean): string {
    if (a.rækker.length > EXCEL_MAKS_RÆKKER) throw new Error(`Arket ${a.navn} har ${a.rækker.length} rækker; Excel tillader højst ${EXCEL_MAKS_RÆKKER}.`);
    const skjulte = new Set(a.skjulteRækker ?? []);
    const fede = new Set(a.fedeRækker ?? []);
    const titler = new Set(a.titelRækker ?? []);
    const ombryd = new Set(a.ombrydKolonner ?? []);
    let maksK = 1;
    const rækker: string[] = [];
    a.rækker.forEach((r, i) => {
        const nr = i + 1;
        if (r.length > EXCEL_MAKS_KOLONNER) throw new Error(`Arket ${a.navn}, række ${nr}: ${r.length} kolonner; Excel tillader højst ${EXCEL_MAKS_KOLONNER}.`);
        const stil = titler.has(nr) ? STIL.titel : fede.has(nr) ? STIL.fed : STIL.normal;
        const celler = r.map((v, j) => celleXml(`${kolBogstav(j + 1)}${nr}`, v, stil === STIL.normal && ombryd.has(j + 1) ? STIL.ombryd : stil)).join("");
        if (r.length > maksK) maksK = r.length;
        rækker.push(`<row r="${nr}"${skjulte.has(nr) ? ' hidden="1"' : ""}>${celler}</row>`);
    });
    const frys = a.frys ? `<pane ySplit="${a.frys}" topLeftCell="A${a.frys + 1}" activePane="bottomLeft" state="frozen"/>` : "";
    const cols = a.bredder?.length
        ? `<cols>${a.bredder.map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`).join("")}</cols>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<dimension ref="A1:${kolBogstav(maksK)}${Math.max(1, a.rækker.length)}"/>` +
        `<sheetViews><sheetView workbookViewId="0"${valgt ? ' tabSelected="1"' : ""}>${frys}</sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rækker.join("")}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd-mm-yyyy hh:mm:ss"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Fast tidsstempel pr. zip-medlem: samme indhold giver samme fil. */
export const ZIP_TID = new Date(Date.UTC(2026, 0, 1));

/**
 * Arbejdsbogen som .xlsx-bytes. `skrivebeskyttetAnbefalet`: Excel foreslår at åbne filen skrivebeskyttet — et
 * arkiv er en backup, og en gemning fra Excel kan omskrive tal og tekst.
 */
export function skrivXlsx(ark: readonly Ark[], egenskaber: { titel: string; skrivebeskyttetAnbefalet?: boolean }): Uint8Array {
    const navne = new Set<string>();
    for (const a of ark) {
        if (!a.navn || a.navn.length > 31 || /[:\\/?*[\]]/.test(a.navn)) throw new Error(`Ugyldigt arknavn "${a.navn}".`);
        if (navne.has(a.navn.toLowerCase())) throw new Error(`Arknavnet "${a.navn}" findes to gange.`);
        navne.add(a.navn.toLowerCase());
    }
    const filer: Zippable = {};
    const ct = ark.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
    filer["[Content_Types].xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
    filer["_rels/.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    filer["docProps/core.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${tilXmlTekst(egenskaber.titel)}</dc:title><dc:creator>Fjernvarme Businesscase</dc:creator></cp:coreProperties>`);
    filer["docProps/app.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Fjernvarme Businesscase</Application></Properties>`);
    const sheets = ark.map((a, i) => `<sheet name="${attr(a.navn)}" sheetId="${i + 1}"${a.skjult ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`).join("");
    filer["xl/workbook.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${egenskaber.skrivebeskyttetAnbefalet ? '<fileSharing readOnlyRecommended="1"/>' : ""}<workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets}</sheets></workbook>`);
    const rels = ark.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
    filer["xl/_rels/workbook.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${ark.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    filer["xl/styles.xml"] = strToU8(STYLES);
    ark.forEach((a, i) => { filer[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(arkXml(a, i === 0)); });
    return zipSync(filer, { level: 6, mtime: ZIP_TID });
}

// ------------------------------------------------------------------ læsning

export type Læst = string | number | boolean;

export interface LæstArk {
    navn: string;
    skjult: boolean;
    /** række -> kolonne -> værdi (1-baseret). En tom celle findes ikke; en tom tekst er "". */
    celler: Map<number, Map<number, Læst>>;
    skjulteRækker: Set<number>;
}

/** Alle ark i en .xlsx. Tåler delte strenge og formler (gemt værdi), så en fil gemt af Excel kan læses. */
export function læsXlsx(bytes: Uint8Array): LæstArk[] {
    let filer: Record<string, Uint8Array>;
    try { filer = unzipSync(bytes); } catch { throw new Error("Filen er ikke en .xlsx (kunne ikke pakkes ud)."); }
    const tekst = (sti: string) => {
        const f = filer[sti];
        if (!f) throw new Error(`Filen mangler ${sti} — er det en .xlsx?`);
        return strFromU8(f);
    };
    const wb = tekst("xl/workbook.xml");
    const rels = tekst("xl/_rels/workbook.xml.rels");
    const delte: string[] = filer["xl/sharedStrings.xml"]
        ? [...tekst("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
            [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)].map((t) => fraXmlTekst(t[1] ?? "")).join(""))
        : [];
    const ud: LæstArk[] = [];
    for (const m of wb.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
        const navn = fraXmlTekst(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? "");
        const rid = /\br:id="([^"]*)"/.exec(m[1])?.[1];
        const skjult = /\bstate="(hidden|veryHidden)"/.test(m[1]);
        const rel = [...rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)].map((r) => r[1]).find((r) => new RegExp(`\\bId="${rid}"`).test(r));
        const mål = rel ? /\bTarget="([^"]*)"/.exec(rel)?.[1] : undefined;
        if (!mål) throw new Error(`Arket ${navn} har ingen relation i workbook.xml.rels.`);
        const xml = tekst(mål.startsWith("/") ? mål.slice(1) : `xl/${mål}`);
        const celler = new Map<number, Map<number, Læst>>();
        const skjulteRækker = new Set<number>();
        for (const r of xml.matchAll(/<row\s([^>]*?)(\/>|>)/g)) {
            if (/\bhidden="(1|true)"/.test(r[1])) skjulteRækker.add(Number(/\br="(\d+)"/.exec(r[1])?.[1]));
        }
        for (const c of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const ref = /\br="([A-Z]+)(\d+)"/.exec(c[1]);
            if (!ref) throw new Error(`Arket ${navn}: en celle uden reference.`);
            const t = /\bt="([^"]+)"/.exec(c[1])?.[1] ?? "n";
            const indre = c[2] ?? "";
            const v = /<v>([\s\S]*?)<\/v>/.exec(indre)?.[1];
            let værdi: Læst | undefined;
            if (t === "inlineStr") {
                const ts = [...indre.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)];
                værdi = ts.length ? ts.map((x) => fraXmlTekst(x[1] ?? "")).join("") : "";
            } else if (t === "s") værdi = v === undefined ? undefined : delte[Number(v)];
            else if (t === "str" || t === "e") værdi = v === undefined ? undefined : fraXmlTekst(v);
            else if (t === "b") værdi = v === undefined ? undefined : v === "1" || v === "true";
            else if (v !== undefined && v !== "") værdi = Number(v);
            if (værdi === undefined) continue;
            const række = Number(ref[2]);
            let rk = celler.get(række);
            if (!rk) { rk = new Map(); celler.set(række, rk); }
            rk.set(kolNummer(ref[1]), værdi);
        }
        ud.push({ navn, skjult, celler, skjulteRækker });
    }
    return ud;
}

// ------------------------------------------------------------------ zip med flere filer

export function skrivZip(filer: Record<string, Uint8Array>): Uint8Array {
    return zipSync(Object.fromEntries(Object.entries(filer).map(([k, v]) => [k, [v, { level: 0 }]])) as Zippable, { mtime: ZIP_TID });
}

export function læsZip(bytes: Uint8Array): Record<string, Uint8Array> {
    try { return unzipSync(bytes); } catch { throw new Error("Filen er ikke en gyldig .zip."); }
}

export const erZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;
