//-----------------------------------------------------------------------
// Budskaber regnet af data — én sætning pr. side/kort (AGENTS.md: et
// budskab er ikke en etiket). Ren logik, testet.
//-----------------------------------------------------------------------

import { BRAENDSEL, enhedstypeNavn } from "./katalog";
import { tal, tekst, type Enhed, type Gruppering, type Lager } from "./gruppering";
import { DAGTYPE_NAVN, dyresteBlok, type Tarif } from "./tarif";
import { dk, dkFri, pctTekst } from "./vis";

type V = ReadonlyMap<string, string>;
const flertal = (n: number, en: string, flere: string) => `${n} ${n === 1 ? en : flere}`;
const timer = (fra: number, til: number) => `kl. ${String(fra).padStart(2, "0")}–${String(til).padStart(2, "0")}`;

/**
 * "51 MW styrbar varme + 22 MW solvarme (profilbundet)": en profilbunden enheds p_max_heat er nameplate,
 * ikke rådighed (solen er 0 om natten), så den lægges ikke sammen med den styrbare effekt.
 */
export function effektTekst(til: readonly Enhed[]): string {
    const styrbar = til.filter((x) => !x.profil).reduce((s, x) => s + (x.pMax ?? 0), 0);
    const profil = til.filter((x) => x.profil);
    const p = profil.reduce((s, x) => s + (x.pMax ?? 0), 0);
    const navn = profil.every((x) => x.type === "solar_thermal" || x.fuel === "solar") ? "solvarme" : "profilbunden varme";
    return `${dkFri(styrbar, 1)} MW styrbar varme${profil.length ? ` + ${dkFri(p, 1)} MW ${navn} (profilbundet)` : ""}`;
}

export function enhederBudskab(e: readonly Enhed[]): string {
    if (e.length === 0) return "Værket har ingen enheder — modellen kan ikke køre uden mindst én.";
    const til = e.filter((x) => x.til);
    // Kun el-enheder byder, uanset flagene (doc/BALANCEMARKED.md:7-8).
    const byder = til.filter((x) => x.kanByde);
    const virkningsløse = til.filter((x) => (x.afrr || x.mfrr) && x.fuel !== "electricity");
    const bud = byder.length
        ? `${flertal(byder.length, "el-enhed", "el-enheder")} kan byde i balancemarkedet (${byder.map((x) => x.navn).join(", ")})`
        : "ingen el-enhed kan byde i balancemarkedet";
    const uden = virkningsløse.length ? `; aFRR/mFRR-flaget på ${virkningsløse.map((x) => x.navn).join(", ")} har ingen virkning` : "";
    return `${til.length} af ${flertal(e.length, "enhed", "enheder")} er slået til: ${effektTekst(til)}; ${bud}${uden}.`;
}

export function copTekst(e: Enhed): string | null {
    if (e.cop.length >= 2) {
        const a = e.cop[0], b = e.cop[e.cop.length - 1];
        return `COP ${dk(a.cop, 2)} ved ${dkFri(a.t_ambient)} °C til ${dk(b.cop, 2)} ved ${dkFri(b.t_ambient)} °C`;
    }
    if (e.copFraAlpha !== null) return `COP ${dk(e.copFraAlpha, 2)} (fra alpha)`;
    return null;
}

export function enhedBudskab(e: Enhed): string {
    const brændsel = e.fuel ? (BRAENDSEL[e.fuel] ?? e.fuel).toLowerCase() : "ukendt brændsel";
    const effekt = e.pMax !== null ? `${dkFri(e.pMax, 2)} MW` : "Ukendt effekt";
    const virkning = copTekst(e) ?? (e.eta !== null ? `virkningsgrad ${dkFri(e.eta, 3)}` : null);
    const dele = [`${effekt} ${enhedstypeNavn(e.type ?? undefined).toLowerCase()} på ${brændsel}`];
    if (virkning) dele.push(virkning);
    if (e.pMin) dele.push(`minimumslast ${dkFri(e.pMin, 2)} MW`);
    if (e.uc && (e.minOp ?? 1) > 1) dele.push(`mindst ${dkFri(e.minOp)} timers drift`);
    return `${dele.join(", ")}${e.til ? "." : " — slået fra."}`;
}

export function lagreBudskab(l: readonly Lager[]): string {
    if (l.length === 0) return "Værket har intet varmelager.";
    const til = l.filter((x) => x.til);
    const kap = til.reduce((s, x) => s + (x.kapacitet ?? 0), 0);
    const lad = til.reduce((s, x) => s + (x.pLad ?? 0), 0);
    return `${til.length} af ${flertal(l.length, "lager", "lagre")} er slået til med i alt ${dk(kap, 0)} MWh og ${dkFri(lad, 1)} MW ladeeffekt.`;
}

export function priserBudskab(v: V): string {
    const priser = [...v].filter(([s]) => /^prices\.[^.]+\.value$/.test(s) && !s.startsWith("prices.co2_eua."))
        .map(([s, j]) => ({ navn: s.split(".")[1], pris: tal(j) })).filter((p): p is { navn: string; pris: number } => p.pris !== null)
        .sort((a, b) => a.pris - b.pris);
    const co2 = tal(v.get("prices.co2_eua.value"));
    const navn = (n: string) => BRAENDSEL[n] ?? n;
    const co2Tekst = co2 !== null ? ` CO₂-kvoter: ${dkFri(co2)} kr./t.` : " CO₂-prisen mangler.";
    if (priser.length === 0) return `Ingen brændselspriser.${co2Tekst}`;
    const [lav, høj] = [priser[0], priser[priser.length - 1]];
    return priser.length === 1
        ? `${navn(lav.navn)} koster ${dkFri(lav.pris)} kr./MWh.${co2Tekst}`
        : `Billigst er ${navn(lav.navn).toLowerCase()} (${dkFri(lav.pris)} kr./MWh), dyrest ${navn(høj.navn).toLowerCase()} (${dkFri(høj.pris)} kr./MWh).${co2Tekst}`;
}

export function elBudskab(t: Tarif, v: V): string {
    const paritet = t.elafgiftNet === null
        ? `elafgift ${dkFri(t.elafgift)} kr./MWh`
        : t.elafgift === t.elafgiftNet ? `elafgift ${dkFri(t.elafgift)} kr./MWh = elafgift_net` : `elafgift ${dkFri(t.elafgift)} ≠ elafgift_net ${dkFri(t.elafgiftNet)} — casen afvises`;
    if (!t.findes) {
        return `Flad forbrugstarif ${dkFri(tal(v.get("electricity.tariff_consumption_flat")))} kr./MWh (ingen tarifprofil); ${paritet}.`;
    }
    // En profil, der findes men ikke kan læses, er IKKE "ingen profil" — modellen afviser casen (Codex K3-N7).
    const strukturfejl = t.fejl.filter((f) => !f.sti.endsWith(".elafgift_net"));
    if (strukturfejl.length) {
        return `Tarifprofilen er ufuldstændig, og modellen afviser casen: ${strukturfejl[0].besked}${strukturfejl.length > 1 ? ` (+${strukturfejl.length - 1} fejl mere)` : ""}`;
    }
    const d = dyresteBlok(t);
    const dyr = d ? `Dyreste bånd (${d.baand}, ${dkFri(d.pris)} kr./MWh) gælder ${d.saeson}, ${DAGTYPE_NAVN[d.dag].toLowerCase()} ${timer(d.fra, d.til)}` : "Ingen tidsbånd";
    // Faste tillæg UDEN elafgift_net; elafgiften (electricity_tax) lægges til separat (src/tariff.py:165-184).
    const lav = t.billigsteTime !== null
        ? `, så profilens billigste time koster ${dk(t.billigsteTime, 1)} kr./MWh${t.elafgift !== null ? ` (${dk(t.billigsteTime + t.elafgift, 1)} med elafgift)` : ""}`
        : "";
    return `${dyr}; faste tillæg ${dkFri(t.fastSum)} kr./MWh${lav}; ${paritet}.`;
}

export function balanceringBudskab(v: V): string {
    const metode = tekst(v.get("balancing.method")) ?? "legacy";
    const loft = tal(v.get("balancing.ancillary_caps.total_mw"));
    const op = tal(v.get("balancing.bid_strategy.up_markup_dkk_mwh"));
    const dele = [`Metode ${metode}`];
    if (loft !== null) dele.push(`samlet reserveloft ${dkFri(loft)} MW`);
    if (op !== null) dele.push(`op-bud = spot + ${dkFri(op)} kr./MWh`);
    return `${dele.join(", ")}. Balancering slås til pr. scenarie.`;
}

export function varmelastBudskab(v: V): string {
    const j = v.get("heat_load_params.baseline_profile_mw");
    let prof: number[] = [];
    try { prof = j ? (JSON.parse(j) as unknown[]).filter((x): x is number => typeof x === "number") : []; } catch { prof = []; }
    const gaf = tal(v.get("heat_load_params.gaf_mw_per_k"));
    const gafTekst = gaf !== null ? ` Lasten stiger ${dkFri(gaf, 3)} MW pr. grad koldere.` : "";
    if (prof.length !== 24) return `Grundprofilen har ${prof.length} værdier (skal være 24).${gafTekst}`;
    const maks = Math.max(...prof), min = Math.min(...prof);
    return `Grundprofilen ligger mellem ${dk(min, 1)} og ${dk(maks, 1)} MW og topper kl. ${String(prof.indexOf(maks)).padStart(2, "0")} UTC.${gafTekst}`; // modellens UTC-akse (src/data_loader.py:712-727)
}

/** "2025-07-01T00:00:00Z" -> "1. jul. 2025" (fra strengens cifre; ingen zonekonvertering). */
export function kortDato(iso: string | null): string {
    const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
    if (!m) return "–";
    const md = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."][Number(m[2]) - 1];
    return `${Number(m[3])}. ${md} ${m[1]}`;
}

export function tidBudskab(v: V): string {
    const start = tekst(v.get("time.start")), slut = tekst(v.get("time.end"));
    const opl = tekst(v.get("time.resolution")) ?? "?";
    const dmi = tekst(v.get("data.dmi_area")), zone = tekst(v.get("data.price_zone"));
    const gab = tal(v.get("solver.mip_rel_gap"));
    return `Periode ${kortDato(start)} – ${kortDato(slut)} i ${opl}-opløsning; vejr fra ${dmi ?? "?"}, priszone ${zone ?? "?"}`
        + (gab !== null ? `; MIP-gab ${pctTekst(gab, 2)}.` : "; solverens standardgab.");
}

export function vaerkBudskab(g: Gruppering, enheder: readonly Enhed[], lagre: readonly Lager[]): string {
    const til = enheder.filter((e) => e.til);
    const kap = lagre.filter((l) => l.til).reduce((s, l) => s + (l.kapacitet ?? 0), 0);
    const bekræft = g.alle.filter((b) => b.bekraeft).length;
    return `${flertal(enheder.length, "enhed", "enheder")} (${til.length} slået til: ${effektTekst(til)}) og ${flertal(lagre.length, "lager", "lagre")} på ${dk(kap, 0)} MWh`
        + (bekræft ? `; ${flertal(bekræft, "værdi", "værdier")} er markeret til bekræftelse.` : ".");
}
