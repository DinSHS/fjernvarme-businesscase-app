//-----------------------------------------------------------------------
// Værdier i `vaerdi_json` — vis og redigér UDEN at miste typen.
//
// Modellens YAML skelner int fra float (`12` vs `12.0`), og rundturen er
// type-streng (KONTRAKT §3.2). JavaScript gør ikke: `JSON.parse("12.0")` er 12,
// og `JSON.stringify(12)` er "12". Derfor:
//   - en gemt værdi re-serialiseres ALDRIG (vis den, eller send den uændret);
//   - en redigeret værdi kodes ud fra den GAMLE værdis type (`kodVaerdi`).
// Danske decimalkommaer accepteres i input ("12,5").
//-----------------------------------------------------------------------

export type Værditype = "heltal" | "decimaltal" | "tekst" | "sand/falsk" | "tom" | "liste" | "objekt";

/** Typen af en JSON-tekst, læst af TEKSTEN (så "12.0" er decimaltal, "12" heltal). */
export function værditype(json: string): Værditype {
    const s = json.trim();
    if (s === "null") return "tom";
    if (s === "true" || s === "false") return "sand/falsk";
    if (s.startsWith('"')) return "tekst";
    if (s.startsWith("[")) return "liste";
    if (s.startsWith("{")) return "objekt";
    if (/^-?\d+$/.test(s)) return "heltal";
    return "decimaltal";
}

/** En læsbar visning af værdien (dansk talformat; lister/objekter som kompakt JSON). */
export function visVaerdi(json: string | null | undefined): string {
    if (json == null) return "–";
    const t = værditype(json);
    if (t === "tom") return "(tom)";
    if (t === "sand/falsk") return json.trim() === "true" ? "Ja" : "Nej";
    if (t === "tekst") {
        try { return String(JSON.parse(json)); } catch { return json; }
    }
    if (t === "heltal" || t === "decimaltal") {
        // Behold antallet af decimaler i teksten, men dansk komma.
        return json.trim().replace(".", ",");
    }
    return json;
}

/** Fejl i brugerens input — teksten vises ved feltet. */
export class Inputfejl extends Error {
    constructor(besked: string) { super(besked); this.name = "Inputfejl"; }
}

function talTekst(input: string): string {
    const s = input.trim().replace(/\s/g, "").replace(",", ".");
    if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) throw new Inputfejl(`"${input}" er ikke et tal.`);
    return s.startsWith(".") ? `0${s}` : s.startsWith("-.") ? `-0${s.slice(1)}` : s;
}

/**
 * Koder brugerens input som JSON med SAMME type som den gamle værdi.
 * `gammel` = null betyder en ny parameter: så gættes typen af inputtet
 * (tal med decimaltegn -> decimaltal, ja/nej -> sand/falsk, ellers tekst).
 */
export function kodVaerdi(gammel: string | null, input: string): string {
    const type = gammel == null ? gætType(input) : værditype(gammel);
    switch (type) {
        case "decimaltal": {
            const s = talTekst(input);
            return /[.eE]/.test(s) ? s : `${s}.0`;
        }
        case "heltal": {
            const s = talTekst(input);
            if (!/^-?\d+$/.test(s)) throw new Inputfejl(`Værdien skal være et helt tal (fik "${input}").`);
            return String(Number(s));
        }
        case "sand/falsk": {
            const s = input.trim().toLowerCase();
            if (["ja", "true", "sand", "1"].includes(s)) return "true";
            if (["nej", "false", "falsk", "0"].includes(s)) return "false";
            throw new Inputfejl(`Skriv ja eller nej (fik "${input}").`);
        }
        case "tekst":
            return JSON.stringify(input);
        case "tom":
            if (input.trim() === "" || input.trim() === "null") return "null";
            // En tom værdi kan udfyldes; typen gættes så af inputtet.
            return kodVaerdi(null, input);
        case "liste":
        case "objekt": {
            const s = input.trim();
            try { JSON.parse(s); } catch { throw new Inputfejl(`Ugyldig JSON (${s.slice(0, 40)}…).`); }
            if (type === "liste" && !s.startsWith("[")) throw new Inputfejl("Værdien skal være en liste: [ … ].");
            if (type === "objekt" && !s.startsWith("{")) throw new Inputfejl("Værdien skal være et objekt: { … }.");
            // Gemmes som skrevet (kompakt mellemrum fjernes ikke, for ikke at røre talformatet).
            return s;
        }
    }
}

function gætType(input: string): Værditype {
    const s = input.trim();
    if (s === "" || s === "null") return "tom";
    if (["ja", "nej", "true", "false"].includes(s.toLowerCase())) return "sand/falsk";
    if (s.startsWith("[")) return "liste";
    if (s.startsWith("{")) return "objekt";
    const tal = s.replace(/\s/g, "").replace(",", ".");
    if (/^-?\d+$/.test(tal)) return "heltal";
    if (/^-?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(tal)) return "decimaltal";
    return "tekst";
}

/** Værdien som JavaScript-værdi — KUN til visning/grafer, aldrig til at gemme. */
export function læsVaerdi(json: string): unknown {
    try { return JSON.parse(json); } catch { return undefined; }
}
