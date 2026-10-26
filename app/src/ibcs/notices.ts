// Indkopieret kode under src/ — ikke npm-pakker, så rollup-plugin-license ser den ikke. Hver post får sin FULDE
// licenstekst i den byggede frontends THIRD_PARTY_NOTICES.txt (vite.config.ts), og scripts/tjek_bundle.mjs fejler,
// hvis en LICENSE-fil under src/ ikke står ordret dér (Codex K7 F1: MIT kræver ophavs- og tilladelsesteksten i kopier).
export const VENDOREDE_LICENSER: readonly { navn: string; licens: string; licensfil: string }[] = [
    { navn: "IBCS-komponenter (src/ibcs, indkopieret fra ibcs-web-charts react-reference)", licens: "MIT", licensfil: "src/ibcs/LICENSE" },
];

export const NOTICE_SKILLE = "\n\n" + "=".repeat(60) + "\n\n";

/** Notices-afsnittet for den indkopierede kode; `laes` henter en fil relativt til app/. */
export function vendoredeNotices(laes: (sti: string) => string): string {
    return VENDOREDE_LICENSER
        .map((v) => [v.navn, `License: ${v.licens}`, `Source: ${v.licensfil}`, "", laes(v.licensfil).trim()].join("\n"))
        .join(NOTICE_SKILLE);
}
