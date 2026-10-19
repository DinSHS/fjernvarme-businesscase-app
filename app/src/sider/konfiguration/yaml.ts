//-----------------------------------------------------------------------
// Rekonstruerer en læsbar case-YAML af værkets blade (til "Kildefil", når
// lakehousets originale kilde.yaml ikke findes — fx et kopieret værk).
//
// Værdierne skrives som deres JSON-tekst: JSON er gyldig YAML (flow-stil),
// så `12.0` forbliver `12.0`, og lister/objekter står på én linje.
// Kommentarerne er dem, importen gemte pr. blad. Rækkefølgen følger
// kildefilens linjenumre (`raekkefoelge`).
//-----------------------------------------------------------------------

import type { Blad } from "./gruppering";

interface Knude { navn: string; orden: number; blad?: Blad; børn: Map<string, Knude> }

const RESERVEREDE = new Set(["true", "false", "null", "yes", "no", "on", "off", "y", "n", "~"]);

export function yamlNøgle(k: string): string {
    return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) && !RESERVEREDE.has(k.toLowerCase()) ? k : JSON.stringify(k);
}

export function rekonstruerYaml(blade: readonly Blad[], hoved: readonly string[] = []): string {
    const rod: Knude = { navn: "", orden: 0, børn: new Map() };
    for (const b of blade) {
        let k = rod;
        const orden = b.raekkefoelge ?? Number.MAX_SAFE_INTEGER;
        for (const del of b.sti.split(".")) {
            let n = k.børn.get(del);
            if (!n) { n = { navn: del, orden, børn: new Map() }; k.børn.set(del, n); }
            n.orden = Math.min(n.orden, orden);
            k = n;
        }
        k.blad = b;
    }
    const linjer: string[] = hoved.map((h) => `# ${h}`);
    if (linjer.length) linjer.push("");
    const skriv = (k: Knude, ind: number) => {
        const børn = [...k.børn.values()].sort((a, b) => a.orden - b.orden || a.navn.localeCompare(b.navn));
        for (const n of børn) {
            const pad = "  ".repeat(ind);
            if (n.blad?.kommentar) for (const l of n.blad.kommentar.split(/\r?\n/)) linjer.push(`${pad}# ${l}`.trimEnd());
            if (n.blad && n.børn.size === 0) {
                const mærke = n.blad.bekraeft && !/BEKRÆFT|TBC/i.test(n.blad.kommentar ?? "") ? "  # [BEKRÆFT]" : "";
                linjer.push(`${pad}${yamlNøgle(n.navn)}: ${n.blad.vaerdi_json}${mærke}`);
            } else {
                if (ind === 0 && linjer.length && linjer[linjer.length - 1] !== "") linjer.push("");
                linjer.push(`${pad}${yamlNøgle(n.navn)}:`);
                skriv(n, ind + 1);
            }
        }
    };
    skriv(rod, 0);
    return `${linjer.join("\n")}\n`;
}
