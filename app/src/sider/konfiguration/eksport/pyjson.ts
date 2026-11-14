//-----------------------------------------------------------------------
// Værdier som Python skriver dem (runde 12). Eksportens forudsigelse af
// modelscriptet (kort.ts) skal give PRÆCIS de vaerdi_json-strenge, som
// fjv.flad gemmer efter scripts/vaerksark_til_yaml.py — og Python skelner
// mellem 12 og 12.0 (KONTRAKT §3.2: typen overlever rundturen). Et tal er
// derfor mærket heltal eller float her, og JSON'en er json.dumps' kompakte
// form (separators=(",", ":"), ensure_ascii=False).
//-----------------------------------------------------------------------

export type PyVærdi = PyFloat | PyHeltal | string | boolean | null | PyVærdi[] | { [nøgle: string]: PyVærdi };

export class PyFloat { constructor(readonly v: number) { if (!Number.isFinite(v)) throw new Error(`${v} er ikke et endeligt tal`); } }
export class PyHeltal { constructor(readonly v: number) { if (!Number.isInteger(v)) throw new Error(`${v} er ikke et heltal`); } }

export const f = (v: number) => new PyFloat(v);
export const i = (v: number) => new PyHeltal(v);

/** Pythons repr(float): korteste decimalform; eksponent når eksponenten er < -4 eller ≥ 16; altid med ".0" ellers. */
export function pyFloatTekst(x: number): string {
    if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
    // JS' korteste cifre er de samme som Pythons (begge korteste rundtur); kun formen er forskellig.
    const [mantisse, eks] = Math.abs(x).toExponential().split("e");
    const eksponent = Number(eks);
    const fortegn = x < 0 ? "-" : "";
    if (eksponent < -4 || eksponent >= 16) {
        return `${fortegn}${mantisse}e${eksponent < 0 ? "-" : "+"}${String(Math.abs(eksponent)).padStart(2, "0")}`;
    }
    const cifre = mantisse.replace(".", "");
    let s: string;
    if (eksponent >= 0) {
        const heltal = cifre.slice(0, eksponent + 1).padEnd(eksponent + 1, "0");
        const brøk = cifre.slice(eksponent + 1);
        s = `${heltal}.${brøk || "0"}`;
    } else {
        s = `0.${"0".repeat(-eksponent - 1)}${cifre}`;
    }
    return fortegn + s;
}

/** json.dumps(v, ensure_ascii=False, separators=(",", ":")) for en PyVærdi. */
export function pyJson(v: PyVærdi): string {
    if (v === null) return "null";
    if (v instanceof PyFloat) return pyFloatTekst(v.v);
    if (v instanceof PyHeltal) return String(v.v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(pyJson).join(",")}]`;
    return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}:${pyJson(x)}`).join(",")}}`;
}

/** Træet som blade (fjv.flad): dicts rekurseres, skalarer og lister er blade, en tom dict er bladet {}. */
export function fladPy(v: { [nøgle: string]: PyVærdi }, før = ""): Map<string, string> {
    const ud = new Map<string, string>();
    const gå = (x: PyVærdi, sti: string) => {
        if (x !== null && typeof x === "object" && !Array.isArray(x) && !(x instanceof PyFloat) && !(x instanceof PyHeltal)) {
            const n = Object.entries(x);
            if (n.length === 0) { ud.set(sti, "{}"); return; }
            for (const [k, y] of n) gå(y, sti ? `${sti}.${k}` : k);
            return;
        }
        ud.set(sti, pyJson(x));
    };
    gå(v, før);
    return ud;
}
