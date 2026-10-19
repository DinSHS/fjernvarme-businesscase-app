// Kontrast- og farveblindhedstjek for alle temaer (brief 22 §1). Kører direkte i Node 24 (type-stripping):
//   node scripts/kontrast.ts [--json <fil>] [--mappe <temamappe>] [ekstra-tema.json …]
// Exit 0 = ingen brud. Exit 1 = mindst ét brud (WCAG AA eller farveblind-gulv). Exit 2 = ugyldig temafil.
// Advarsler (farveblind-afstand mellem gulv 6 og mål 8) udskrives, men fejler ikke: de kræver etiketter i grafen.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afledte, BASISTEMA, loes, maal, mangler, validerFil, type Fund, type Tema, type TemaFil } from "../src/styles/tema-kerne.ts";
import { afstand, kontrast } from "../src/styles/farve.ts";

const her = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const jsonUd = flag("--json");
const mappe = resolve(flag("--mappe") ?? join(her, "..", "src", "styles", "temaer"));

function alleJson(d: string): string[] {
    return readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? alleJson(p) : n.endsWith(".json") ? [p] : [];
    }).sort();
}

const filer = [...alleJson(mappe), ...args.map((a) => resolve(a))];
const raa = new Map<string, { fil: string; data: TemaFil }>();
let strukturfejl = 0;
for (const fil of filer) {
    const navn = relative(process.cwd(), fil);
    let data: unknown;
    try { data = JSON.parse(readFileSync(fil, "utf8")); } catch (e) { console.log(`FEJL ${navn}: ikke gyldig JSON (${(e as Error).message})`); strukturfejl++; continue; }
    const f = validerFil(data, navn);
    if (f.length) { f.forEach((x) => console.log(`FEJL ${x}`)); strukturfejl++; continue; }
    const t = data as TemaFil;
    if (raa.has(t.id)) { console.log(`FEJL ${navn}: id "${t.id}" findes også i ${raa.get(t.id)!.fil}`); strukturfejl++; continue; }
    raa.set(t.id, { fil: navn, data: t });
}
const basisFil = raa.get(BASISTEMA);
if (!basisFil) { console.log(`FEJL basistemaet "${BASISTEMA}" mangler`); process.exit(2); }
const basis = loes(basisFil.data, undefined);
const temaer: Tema[] = [...raa.values()].map(({ data }) => data.id === BASISTEMA ? basis : loes(data, basis));
for (const t of temaer) { const m = mangler(t); if (m.length) { m.forEach((x) => console.log(`FEJL ${x}`)); strukturfejl++; } }
if (strukturfejl) process.exit(2);

const alle: Fund[] = temaer.flatMap(maal);
const brud = alle.filter((f) => f.niveau === "brud");
const adv = alle.filter((f) => f.niveau === "advarsel");

// Oversigt pr. tema × modus: den svageste måling i hver klasse — så en tæt sag ses, også når den består.
const tekstpar = [["tekst_3", "flade"], ["tekst_3", "baggrund"], ["accent", "flade"], ["advarsel", "flade"], ["primaer_tekst", "primaer"]] as const;
console.log("tema               modus   min.tekst          min.serie  CVD alle par  normal alle par  brud");
for (const t of temaer) {
    for (const m of ["lys", "moerk"] as const) {
        const v = t[m];
        const a = afledte(v);
        const tk = [
            ...tekstpar.map(([x, y]) => [`${x}/${y}`, kontrast(v[x], v[y])] as const),
            ["pos/mærke", kontrast(v.pos, a.maerke_ok_bg)] as const, ["neg/mærke", kontrast(v.neg, a.maerke_fejl_bg)] as const,
            ["knap/hover", kontrast(v.primaer_tekst, a.knap_hover)] as const,
        ].sort((x, y) => x[1] - y[1])[0];
        const ser = Math.min(...v.serie.map((c) => kontrast(c, v.flade)));
        // Samme pairliste som maal(): alle par af de 8 serier + "øvrige" (K6 F10).
        const f = [...v.serie, v.serie_oevrige];
        let cvd = Infinity, nor = Infinity;
        for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) {
            cvd = Math.min(cvd, afstand(f[i], f[j], "protan"), afstand(f[i], f[j], "deutan"));
            nor = Math.min(nor, afstand(f[i], f[j]));
        }
        const n = brud.filter((f) => f.tema === t.id && f.modus === m).length;
        console.log(`${t.id.padEnd(18)} ${m.padEnd(7)} ${tk[1].toFixed(2).padStart(5)} ${tk[0].padEnd(12)} ${ser.toFixed(2).padStart(5)}  ${cvd.toFixed(1).padStart(12)}  ${nor.toFixed(1).padStart(15)}  ${String(n).padStart(4)}`);
    }
}
for (const f of brud) console.log(`BRUD     ${f.tema}/${f.modus}: ${f.regel} — ${f.detalje}: ${f.maalt} < ${f.krav}`);
for (const f of adv) console.log(`ADVARSEL ${f.tema}/${f.modus}: ${f.regel} — ${f.detalje}: ${f.maalt} < ${f.krav}`);
console.log(`${temaer.length} temaer × 2 modi: ${brud.length} brud, ${adv.length} advarsler`);
if (jsonUd) writeFileSync(jsonUd, JSON.stringify({ temaer: temaer.map((t) => t.id), brud, advarsler: adv }, null, 2));
process.exit(brud.length ? 1 : 0);
