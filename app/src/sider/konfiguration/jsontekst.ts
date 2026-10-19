//-----------------------------------------------------------------------
// En JSON-parser der BEVARER talenes tekst (`6.0` forbliver `6.0`).
//
// Bruges til at redigere lister og lister af objekter (COP-tabel,
// grundprofil, måneder) uden at ændre typen på de elementer, brugeren ikke
// rører: JSON.parse gør 6.0 til 6, og modellens rundtur er type-streng
// (KONTRAKT §3.2). Serialiseringen er kompakt som fv-fabric's flad.py.
//-----------------------------------------------------------------------

export type JV =
    | { t: "tal"; raw: string }
    | { t: "tekst"; v: string }
    | { t: "bool"; v: boolean }
    | { t: "null" }
    | { t: "liste"; v: JV[] }
    | { t: "objekt"; v: [string, JV][] };

export function parseJV(json: string): JV {
    let i = 0;
    const s = json;
    const mellemrum = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const fejl = (hvad: string): never => { throw new Error(`Ugyldig JSON ved tegn ${i}: ${hvad}`); };
    const værdi = (): JV => {
        mellemrum();
        const c = s[i];
        if (c === "{") {
            i++;
            const v: [string, JV][] = [];
            mellemrum();
            if (s[i] === "}") { i++; return { t: "objekt", v }; }
            for (;;) {
                mellemrum();
                const k = værdi();
                if (k.t !== "tekst") fejl("nøgle skal være tekst");
                mellemrum();
                if (s[i++] !== ":") fejl("forventede :");
                v.push([(k as { v: string }).v, værdi()]);
                mellemrum();
                if (s[i] === ",") { i++; continue; }
                if (s[i++] === "}") return { t: "objekt", v };
                fejl("forventede , eller }");
            }
        }
        if (c === "[") {
            i++;
            const v: JV[] = [];
            mellemrum();
            if (s[i] === "]") { i++; return { t: "liste", v }; }
            for (;;) {
                v.push(værdi());
                mellemrum();
                if (s[i] === ",") { i++; continue; }
                if (s[i++] === "]") return { t: "liste", v };
                fejl("forventede , eller ]");
            }
        }
        if (c === '"') {
            const start = i++;
            while (i < s.length && s[i] !== '"') i += s[i] === "\\" ? 2 : 1;
            i++;
            return { t: "tekst", v: JSON.parse(s.slice(start, i)) as string };
        }
        const m = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(s.slice(i));
        if (m) { i += m[0].length; return { t: "tal", raw: m[0] }; }
        for (const [ord, jv] of [["true", { t: "bool", v: true }], ["false", { t: "bool", v: false }], ["null", { t: "null" }]] as const) {
            if (s.startsWith(ord, i)) { i += ord.length; return jv as JV; }
        }
        return fejl(`uventet "${c}"`);
    };
    const r = værdi();
    mellemrum();
    if (i !== s.length) fejl("tekst efter værdien");
    return r;
}

export function serialiserJV(v: JV): string {
    switch (v.t) {
        case "tal": return v.raw;
        case "tekst": return JSON.stringify(v.v);
        case "bool": return v.v ? "true" : "false";
        case "null": return "null";
        case "liste": return `[${v.v.map(serialiserJV).join(",")}]`;
        case "objekt": return `{${v.v.map(([k, x]) => `${JSON.stringify(k)}:${serialiserJV(x)}`).join(",")}}`;
    }
}

/** Et skalar-element som JSON-tekst (til kodVaerdi og visning). */
export function somJson(v: JV): string {
    return serialiserJV(v);
}

/** JSON-tekst -> JV for et enkelt element (efter kodVaerdi). */
export const fraJson = (json: string): JV => parseJV(json);
