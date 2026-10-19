//-----------------------------------------------------------------------
// Farvematematik for temasystemet — ren, uden DOM, så den deles af appen,
// testene og kontrastscriptet (scripts/kontrast.ts kører den direkte i Node).
//
//   kontrast(a, b)   WCAG 2.x-kontrastforhold (1–21)
//   oklab(hex)       OKLab-koordinater; afstand ×100 = ΔE i dataviz-metoden
//   simuler(hex, t)  farveblindhed (Machado, Oliveira & Fernandes 2009, styrke 1,0)
//
// Tærsklerne i tema-kerne.ts er kalibreret til PRÆCIS denne simulering — et
// andet CVD-skøn (fx Viénot 1999) flytter grænsetilfælde og kræver nye tærskler.
//-----------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{6})$/i;

export function erHex(v: unknown): v is string {
    return typeof v === "string" && HEX.test(v);
}

export function hexTilRgb(hex: string): Rgb {
    const m = HEX.exec(hex);
    if (!m) throw new Error(`Ikke en farve på formen #rrggbb: ${hex}`);
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbTilHex([r, g, b]: Rgb): string {
    const k = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0");
    return `#${k(r)}${k(g)}${k(b)}`;
}

/** sRGB-kanal 0–255 → lineær 0–1. */
function lin(c: number): number {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function ulin(c: number): number {
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, s)) * 255;
}

export function luminans(hex: string): number {
    const [r, g, b] = hexTilRgb(hex).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG-kontrastforhold mellem to uigennemsigtige farver. */
export function kontrast(a: string, b: string): number {
    const [l1, l2] = [luminans(a), luminans(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
}

/** Blander `forgrund` med andelen `andel` (0–1) over `bag` — samme som CSS color-mix i sRGB. */
export function bland(forgrund: string, bag: string, andel: number): string {
    const f = hexTilRgb(forgrund), b = hexTilRgb(bag);
    return rgbTilHex([0, 1, 2].map((i) => f[i] * andel + b[i] * (1 - andel)) as unknown as Rgb);
}

export type Lab = readonly [number, number, number];

function linTilOklab([r, g, b]: Rgb): Lab {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

export function oklab(hex: string): Lab {
    return linTilOklab(hexTilRgb(hex).map(lin) as unknown as Rgb);
}

/** OKLCH: lyshed L (0–1) og kroma C. */
export function oklch(hex: string): { L: number; C: number; h: number } {
    const [L, a, b] = oklab(hex);
    return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}

/** ΔE = euklidisk afstand i OKLab × 100 (dataviz-metodens enhed). */
export function deltaE(a: Lab, b: Lab): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
}

export type Syn = "normal" | "protan" | "deutan";

// Machado, Oliveira & Fernandes (2009), styrke 1,0, i lineær RGB.
const MACHADO: Record<Exclude<Syn, "normal">, readonly (readonly number[])[]> = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};

/** Farven som den ses med den givne synstype (hex ind, hex ud). */
export function simuler(hex: string, syn: Syn): string {
    if (syn === "normal") return hex.toLowerCase();
    const v = hexTilRgb(hex).map(lin);
    const m = MACHADO[syn];
    const ud = m.map((r) => Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2])));
    return rgbTilHex(ud.map(ulin) as unknown as Rgb);
}

/** ΔE mellem to farver set med en given synstype. */
export function afstand(a: string, b: string, syn: Syn = "normal"): number {
    return deltaE(oklab(simuler(a, syn)), oklab(simuler(b, syn)));
}
