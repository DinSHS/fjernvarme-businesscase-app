//-----------------------------------------------------------------------
// Et .xlsx som zip + XML: åbn modelrepoets skabelon, ret enkelte celler og
// gem — og læs et uploadet ark tilbage som celleværdier (runde 12).
//
// Hvorfor ikke et regnearksbibliotek: skabelonen bærer datavalidering
// (dropdowns), flettede celler, frosne ruder, talformater og vejledningen.
// Et bibliotek, der læser HELE arbejdsbogen ind i sin egen model og skriver
// den ud igen, gemmer kun det, modellen kender. Her ændres kun de celler,
// eksporten skriver; alle andre dele af filen (styles, sharedStrings, tema,
// validering) går byte for byte videre. fflate (MIT) pakker zip'en.
//
// Skabelonens XML er skrevet af LibreOffice og helt regelmæssig: én <row> pr.
// række med r-attribut og celler med r-attribut. Patcheren antager netop det
// og fejler højlydt, hvis den møder noget andet — en stille fejlplacering af
// en værdi er værre end ingen eksport.
//-----------------------------------------------------------------------

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export type Celleværdi = number | string | null;

/** "B12" -> { kol: 2, række: 12 }. */
export function delRef(ref: string): { kol: number; række: number } {
    const m = /^([A-Z]{1,3})(\d+)$/.exec(ref);
    if (!m) throw new Error(`Ugyldig cellereference: ${ref}`);
    let kol = 0;
    for (const c of m[1]) kol = kol * 26 + (c.charCodeAt(0) - 64);
    return { kol, række: Number(m[2]) };
}

export function kolBogstav(kol: number): string {
    let s = "";
    for (let k = kol; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
    return s;
}

export const ref = (kol: number, række: number) => `${kolBogstav(kol)}${række}`;

/**
 * Første tegn uden for XML 1.0's Char-produktion — C0-kontroltegn undtagen tab/LF/CR, U+FFFE/U+FFFF og enlige
 * surrogater — som tegnkode, eller null (Codex K11 F7).
 */
export function ulovligtXmlTegn(s: string): number | null {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return c;
        if (c === 0xfffe || c === 0xffff) return c;
        if (c >= 0xd800 && c <= 0xdbff) {
            const d = s.charCodeAt(i + 1);
            if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; }
            return c;
        }
        if (c >= 0xdc00 && c <= 0xdfff) return c;
    }
    return null;
}

/** Teksten med kontroltegn vist som \uXXXX (til fejlbeskeder). */
export const synligTekst = (s: string) => [...s].map((ch) => {
    const c = ch.charCodeAt(0);
    return c < 0x20 || c === 0xfffe || c === 0xffff ? `\\u${c.toString(16).padStart(4, "0")}` : ch;
}).join("");

/**
 * Tekst som XML. Tegn uden for XML 1.0 kan ikke skrives (openpyxl afviser filen som "not well-formed", Codex K11 F7):
 * eksportens plan nægter dem som feltfejl (kort.ts ulovligTekst); her er sidste værn, så en ugyldig fil aldrig bygges.
 */
const xmlTegn = (s: string) => {
    if (ulovligtXmlTegn(s) !== null) throw new Error(`Teksten "${synligTekst(s.slice(0, 40))}" indeholder et tegn, som et regneark (XML 1.0) ikke kan gemme.`);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};
const fraXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

/** Excels serietal (1900-systemet, date1904=false) for et UTC-tidspunkt; openpyxl læser det tilbage til samme time (målt for 19.200 timer). */
export const excelSerie = (ms: number) => ms / 86_400_000 + 25569;
/** Tilbage til UTC-ms, rundet til hele minutter (Excel gemmer tid som en brøkdel af døgnet). */
export const fraExcelSerie = (serie: number) => Math.round((serie - 25569) * 1440) * 60_000;

// ------------------------------------------------------------------ ét regneark (worksheet-XML)

interface Række { attr: string; celler: Map<number, string> }

/** Et regnearks <sheetData> som rækker af rå celle-XML; resten af filen (før/efter) bevares uændret. */
export class Regneark {
    private før: string;
    private efter: string;
    readonly rækker = new Map<number, Række>();

    constructor(xml: string, readonly navn: string) {
        const i = xml.indexOf("<sheetData>");
        const j = xml.indexOf("</sheetData>");
        if (i < 0 || j < 0) throw new Error(`Arket ${navn} har ingen <sheetData> (forventet skabelonens form).`);
        this.før = xml.slice(0, i);
        this.efter = xml.slice(j + "</sheetData>".length);
        const data = xml.slice(i + "<sheetData>".length, j);
        const rækkeRe = /<row ([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
        // Det, der står mellem rækkerne, skal være tomt; ellers er det ikke skabelonens form (en fil med 8.760
        // timer gennemløbes én gang — ingen erstatning i en streng pr. række).
        let slut = 0;
        for (let m = rækkeRe.exec(data); m; m = rækkeRe.exec(data)) {
            if (data.slice(slut, m.index).trim()) throw new Error(`Arket ${navn}: uventet indhold i <sheetData>.`);
            slut = m.index + m[0].length;
            const r = /\br="(\d+)"/.exec(m[1]);
            if (!r) throw new Error(`Arket ${navn}: en <row> uden r-attribut.`);
            const celler = new Map<number, string>();
            const celleRe = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
            for (let c = celleRe.exec(m[2] ?? ""); c; c = celleRe.exec(m[2] ?? "")) {
                const cr = /\br="([A-Z]+\d+)"/.exec(c[1]);
                if (!cr) throw new Error(`Arket ${navn}, række ${r[1]}: en celle uden r-attribut.`);
                celler.set(delRef(cr[1]).kol, c[0]);
            }
            this.rækker.set(Number(r[1]), { attr: m[1].replace(/\s*\br="\d+"/, "").trim(), celler });
        }
        if (data.slice(slut).trim()) throw new Error(`Arket ${navn}: uventet indhold i <sheetData>.`);
    }

    /** Cellens stil-index (s-attribut) eller null. */
    stil(celleRef: string): number | null {
        const { kol, række } = delRef(celleRef);
        const x = this.rækker.get(række)?.celler.get(kol);
        const s = x ? /\bs="(\d+)"/.exec(x) : null;
        return s ? Number(s[1]) : null;
    }

    /** Sætter en værdi (tal, tekst som inline string, null = tom). Stilen bevares, medmindre `stil` gives. */
    sæt(celleRef: string, v: Celleværdi, stil?: number | null): void {
        const { kol, række } = delRef(celleRef);
        const r = this.række(række);
        const gammel = r.celler.get(kol);
        const s = stil !== undefined ? stil : gammel ? (/\bs="(\d+)"/.exec(gammel)?.[1] ?? null) : null;
        const sAttr = s === null ? "" : ` s="${s}"`;
        let x: string;
        if (v === null) x = `<c r="${celleRef}"${sAttr}/>`;
        else if (typeof v === "number") {
            if (!Number.isFinite(v)) throw new Error(`${this.navn}!${celleRef}: ${v} er ikke et endeligt tal.`);
            x = `<c r="${celleRef}"${sAttr} t="n"><v>${String(v)}</v></c>`;
        } else x = `<c r="${celleRef}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlTegn(v)}</t></is></c>`;
        r.celler.set(kol, x);
    }

    /** En formel med den beregnede værdi (så filen er læsbar uden genberegning). */
    sætFormel(celleRef: string, formel: string, værdi: number | string, stil?: number | null): void {
        const { kol, række } = delRef(celleRef);
        const r = this.række(række);
        const gammel = r.celler.get(kol);
        const s = stil !== undefined ? stil : gammel ? (/\bs="(\d+)"/.exec(gammel)?.[1] ?? null) : null;
        const sAttr = s === null ? "" : ` s="${s}"`;
        const v = typeof værdi === "number" ? `t="n"><f aca="false">${xmlTegn(formel)}</f><v>${String(værdi)}</v>` : `t="str"><f aca="false">${xmlTegn(formel)}</f><v>${xmlTegn(værdi)}</v>`;
        r.celler.set(kol, `<c r="${celleRef}"${sAttr} ${v}</c>`);
    }

    private række(nr: number): Række {
        let r = this.rækker.get(nr);
        if (!r) {
            // En ny række får samme form som skabelonens rækker (LibreOffices attributter uden fast højde).
            r = { attr: 'customFormat="false" ht="15" hidden="false" customHeight="false" outlineLevel="0" collapsed="false"', celler: new Map() };
            this.rækker.set(nr, r);
        }
        return r;
    }

    /**
     * Indsætter `antal` tomme rækker FØR række `nr`: alle rækker fra `nr` og ned flyttes, og det samme gør
     * referencerne i flettede celler, datavalidering og betinget formatering. Formler flyttes ikke — arket,
     * der bruger det (Priser), har ingen.
     */
    indsætRækker(nr: number, antal: number): void {
        const flyt = (s: string) => s.replace(/\b([A-Z]{1,3})(\d+)\b/g, (hel, k: string, r: string) => (Number(r) >= nr ? `${k}${Number(r) + antal}` : hel));
        const nye = new Map<number, Række>();
        for (const [r, række] of this.rækker) {
            if (/<f[ >]/.test([...række.celler.values()].join(""))) throw new Error(`${this.navn}: rækker med formler kan ikke flyttes.`);
            if (r < nr) { nye.set(r, række); continue; }
            const celler = new Map<number, string>();
            for (const [k, x] of række.celler) celler.set(k, x.replace(/\br="([A-Z]+)(\d+)"/, (_, kb: string, rr: string) => `r="${kb}${Number(rr) + antal}"`));
            nye.set(r + antal, { attr: række.attr, celler });
        }
        this.rækker.clear();
        for (const [r, x] of nye) this.rækker.set(r, x);
        this.efter = this.efter.replace(/\b(sqref|ref)="([^"]*)"/g, (_, a: string, v: string) => `${a}="${flyt(v)}"`);
    }

    /** Omdøber en datavalidering/flet-reference i resten af arket (fx når en dropdown skal række længere ned). */
    erstatIEfter(fra: string, til: string): void {
        if (!this.efter.includes(fra)) throw new Error(`${this.navn}: "${fra}" findes ikke i arket.`);
        this.efter = this.efter.replace(fra, til);
    }

    /** Tilføjer en kolonnebredde (<cols>), hvis kolonnen ikke har en. */
    sikrKolonnebredde(kol: number, bredde: number): void {
        if (new RegExp(`<col [^>]*\\bmin="${kol}"`).test(this.før)) return;
        const col = `<col collapsed="false" customWidth="true" hidden="false" outlineLevel="0" max="${kol}" min="${kol}" style="0" width="${bredde}"/>`;
        if (!this.før.includes("</cols>")) throw new Error(`${this.navn}: arket har ingen <cols>.`);
        this.før = this.før.replace("</cols>", `${col}</cols>`);
    }

    xml(): string {
        let maksR = 1, maksK = 1;
        const rækker = [...this.rækker.entries()].sort((a, b) => a[0] - b[0]).map(([nr, r]) => {
            const celler = [...r.celler.entries()].sort((a, b) => a[0] - b[0]);
            if (celler.length) { maksR = Math.max(maksR, nr); maksK = Math.max(maksK, celler[celler.length - 1][0]); }
            return `<row r="${nr}" ${r.attr}>${celler.map(([, x]) => x).join("")}</row>`;
        });
        const før = this.før.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${ref(maksK, maksR)}"/>`);
        return `${før}<sheetData>${rækker.join("")}</sheetData>${this.efter}`;
    }
}

// ------------------------------------------------------------------ arbejdsbogen

const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const CT_ARK = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

/** Arbejdsbogen: arknavn -> sti i zip'en, og de ark, der er åbnet til ændring. */
export class Arbejdsbog {
    private filer: Record<string, Uint8Array>;
    private ark = new Map<string, Regneark>();
    private stier = new Map<string, string>();

    constructor(bytes: Uint8Array) {
        this.filer = unzipSync(bytes);
        const wb = this.tekst("xl/workbook.xml");
        const rels = this.tekst("xl/_rels/workbook.xml.rels");
        for (const m of wb.matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"[^>]*\/>/g)) {
            const rel = new RegExp(`<Relationship [^>]*Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)
                ?? new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${m[2]}"`).exec(rels);
            if (!rel) throw new Error(`Arket ${m[1]} har ingen relation i workbook.xml.rels.`);
            this.stier.set(fraXml(m[1]), `xl/${rel[1].replace(/^\/?xl\//, "")}`);
        }
    }

    tekst(sti: string): string {
        const f = this.filer[sti];
        if (!f) throw new Error(`Filen mangler ${sti} — er det et Excel-ark (.xlsx)?`);
        return strFromU8(f);
    }

    arknavne(): string[] { return [...this.stier.keys()]; }
    har(navn: string): boolean { return this.stier.has(navn); }

    regneark(navn: string): Regneark {
        let a = this.ark.get(navn);
        if (!a) {
            const sti = this.stier.get(navn);
            if (!sti) throw new Error(`Skabelonen har intet ark "${navn}".`);
            a = new Regneark(this.tekst(sti), navn);
            this.ark.set(navn, a);
        }
        return a;
    }

    /**
     * Tilføjer et nyt ark efter de eksisterende, bygget af et eksisterende arks XML (samme styles og kolonner),
     * men uden dets celler. `skjult` = state="hidden" (fx `_app`).
     */
    tilføjArk(navn: string, formFra: string, skjult = false): Regneark {
        if (this.stier.has(navn)) throw new Error(`Arket "${navn}" findes allerede.`);
        // Kildearkets XML læses direkte (ikke åbnet til ændring), så kilden går byte for byte videre.
        const kildeXml = this.ark.get(formFra)?.xml() ?? this.tekst(this.stier.get(formFra) ?? `?${formFra}`);
        const nyt = new Regneark(kildeXml.replace(/<sheetData>[\s\S]*<\/sheetData>/, "<sheetData></sheetData>")
            .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, "").replace(/<dataValidations[\s\S]*?<\/dataValidations>/, "")
            .replace(/\btabSelected="true"/, 'tabSelected="false"'), navn);
        let n = 1;
        while (this.filer[`xl/worksheets/sheet${n}.xml`]) n++;
        const sti = `xl/worksheets/sheet${n}.xml`;
        const rels = this.tekst("xl/_rels/workbook.xml.rels");
        const ider = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
        const rid = `rId${Math.max(0, ...ider) + 1}`;
        this.filer["xl/_rels/workbook.xml.rels"] = strToU8(rels.replace("</Relationships>",
            `<Relationship Id="${rid}" Type="${NS_REL}" Target="worksheets/sheet${n}.xml"/></Relationships>`));
        const wb = this.tekst("xl/workbook.xml");
        const sheetIder = [...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1]));
        this.filer["xl/workbook.xml"] = strToU8(wb.replace("</sheets>",
            `<sheet name="${xmlTegn(navn)}" sheetId="${Math.max(0, ...sheetIder) + 1}" state="${skjult ? "hidden" : "visible"}" r:id="${rid}"/></sheets>`));
        const ct = this.tekst("[Content_Types].xml");
        this.filer["[Content_Types].xml"] = strToU8(ct.replace("</Types>", `<Override PartName="/${sti}" ContentType="${CT_ARK}"/></Types>`));
        this.stier.set(navn, sti);
        this.ark.set(navn, nyt);
        this.filer[sti] = new Uint8Array();      // pladsen er taget; indholdet skrives af bytes()
        return nyt;
    }

    /** Arbejdsbogen uden et ark (bruges af rundturs-beviset: samme ark uden markeringen `_app`). */
    udenArk(navn: string): Uint8Array {
        const sti = this.stier.get(navn);
        if (!sti) throw new Error(`Arket "${navn}" findes ikke.`);
        const fil = sti.slice("xl/".length);
        const rels = this.tekst("xl/_rels/workbook.xml.rels");
        const rid = new RegExp(`<Relationship [^>]*Id="([^"]+)"[^>]*Target="${fil}"`).exec(rels)?.[1];
        this.filer["xl/_rels/workbook.xml.rels"] = strToU8(rels.replace(new RegExp(`<Relationship [^>]*Target="${fil}"[^>]*/>`), ""));
        this.filer["xl/workbook.xml"] = strToU8(this.tekst("xl/workbook.xml").replace(new RegExp(`<sheet [^>]*r:id="${rid}"[^>]*/>`), ""));
        this.filer["[Content_Types].xml"] = strToU8(this.tekst("[Content_Types].xml").replace(new RegExp(`<Override PartName="/${sti}"[^>]*/>`), ""));
        delete this.filer[sti];
        this.stier.delete(navn);
        this.ark.delete(navn);
        return this.bytes();
    }

    bytes(): Uint8Array {
        const ud: Zippable = {};
        for (const [sti, data] of Object.entries(this.filer)) ud[sti] = data;
        for (const [navn, a] of this.ark) ud[this.stier.get(navn)!] = strToU8(a.xml());
        // Fast tidsstempel pr. zip-medlem: samme indhold giver samme fil (eksporten er deterministisk).
        return zipSync(ud, { level: 6, mtime: new Date(Date.UTC(2026, 0, 1)) });
    }
}

// ------------------------------------------------------------------ læsning af et uploadet ark

/**
 * Alle arkenes celleværdier: arknavn -> ref -> værdi. Tal som tal, tekst (delte strenge, inline og formel-
 * tekst) som tekst; en formel giver sin gemte værdi (som pandas/openpyxl læser den). Tomme celler udelades.
 */
export function læsCeller(bytes: Uint8Array): Map<string, Map<string, number | string>> {
    const wb = new Arbejdsbog(bytes);
    let delte: string[] = [];
    try {
        const ss = wb.tekst("xl/sharedStrings.xml");
        delte = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => fraXml(t[1])).join(""));
    } catch { /* ingen delte strenge */ }
    const ud = new Map<string, Map<string, number | string>>();
    for (const navn of wb.arknavne()) {
        const a = wb.regneark(navn);
        const celler = new Map<string, number | string>();
        for (const [nr, r] of a.rækker) {
            for (const [kol, x] of r.celler) {
                const t = /\bt="([^"]+)"/.exec(x.slice(0, x.indexOf(">")))?.[1] ?? "n";
                const v = /<v>([\s\S]*?)<\/v>/.exec(x)?.[1];
                let værdi: number | string | undefined;
                if (t === "inlineStr") værdi = [...x.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => fraXml(m[1])).join("");
                else if (t === "s") værdi = v === undefined ? undefined : delte[Number(v)];
                else if (t === "str" || t === "e") værdi = v === undefined ? undefined : fraXml(v);
                else if (t === "b") værdi = v === undefined ? undefined : Number(v);
                else if (v !== undefined && v !== "") værdi = Number(v);
                if (værdi === undefined || værdi === "" || (typeof værdi === "number" && Number.isNaN(værdi))) continue;
                celler.set(ref(kol, nr), værdi);
            }
        }
        ud.set(navn, celler);
    }
    return ud;
}
