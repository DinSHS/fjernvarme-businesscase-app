// Fixtures må ikke bære rigtige e-mails/tenant-domæner (brief 21 §6: den offentlige del må ikke indeholde dem).
// Hver e-mail i en tekstværdi erstattes af en fast, neutral bruger; samme ind = samme ud, så policy-felter
// (oprettet_af, bestilt_af …) stadig matcher hinanden. Brug: node skaermbilleder/anonymiser.mjs [fil]
import { readFileSync, writeFileSync } from "node:fs";

export const NEUTRAL = "planlaegger@example.org";
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function anonymiser(v) {
    if (typeof v === "string") return v.replace(EMAIL, NEUTRAL);
    if (Array.isArray(v)) return v.map(anonymiser);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, anonymiser(x)]));
    return v;
}

if (process.argv[1]?.endsWith("anonymiser.mjs")) {
    const fil = process.argv[2] ?? new URL("harness/fixtures.json", import.meta.url);
    const før = readFileSync(fil, "utf8");
    const efter = JSON.stringify(anonymiser(JSON.parse(før)));
    writeFileSync(fil, efter);
    console.log(`${fil}: ${(før.match(EMAIL) ?? []).length} e-mails -> ${NEUTRAL}`);
}
