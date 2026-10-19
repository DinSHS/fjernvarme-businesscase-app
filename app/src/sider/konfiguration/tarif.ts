//-----------------------------------------------------------------------
// Nettariffen som ugeskema: bånd × sæson × hverdag/weekend (src/tariff.py).
// Ren logik; reglerne er modellens egne (viden/validering.md §4).
//-----------------------------------------------------------------------

import { læsVaerdi } from "@/lib/data/vaerdi";

export const TARIF = "electricity.tariff_consumption";
const NET = `${TARIF}.net_tariff`;

/** Fast post, der KUN er dokumentation — modellen lægger electricity_tax til i stedet (src/tariff.py:165-184). */
export const ELAFGIFT_NET = "elafgift_net";

export type Dagtype = "weekday" | "weekend";
export const DAGTYPE_NAVN: Record<Dagtype, string> = { weekday: "Hverdag", weekend: "Weekend" };

export interface Saeson {
    navn: string;
    maaneder: number[];
    /** 24 timer (lokal tid), værdien er båndnavnet eller null (ikke dækket). */
    timer: Record<Dagtype, (string | null)[]>;
}

export interface Tarif {
    /** Har værket en tarifprofil (ellers bruges de flade satser alene). */
    findes: boolean;
    baand: { navn: string; pris: number | null }[];
    saesoner: Saeson[];
    faste: { navn: string; pris: number | null }[];
    /**
     * Summen af de faste tillæg, modellen lægger i tariffen — UDEN `elafgift_net`. Den post er dokumentation:
     * modellen springer den over og lægger `electricity_tax` til separat (src/tariff.py:165-184).
     */
    fastSum: number;
    /**
     * Profilens billigste time: billigste BRUGTE bånd + faste tillæg (uden elafgift), fx 7,4 + 115 = 122,4
     * (src/tariff.py:14-19). Null uden profil eller uden ét brugt bånd.
     */
    billigsteTime: number | null;
    elafgift: number | null;
    elafgiftNet: number | null;
    /** Regelbrud — tekster som modellens (src/tariff.py), stien hvor fejlen sidder. */
    fejl: { sti: string; besked: string }[];
}

const læsTal = (j: string | undefined) => { const v = j === undefined ? undefined : læsVaerdi(j); return typeof v === "number" ? v : null; };

/** "06-21" -> [6, 21] (halvåbent), ellers null. */
export function interval(nøgle: string): [number, number] | null {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(nøgle);
    return m ? [Number(m[1]), Number(m[2])] : null;
}

export function laesTarif(værdi: ReadonlyMap<string, string>): Tarif {
    const fejl: Tarif["fejl"] = [];
    const baand: Tarif["baand"] = [];
    const faste: Tarif["faste"] = [];
    const sæsonMap = new Map<string, Saeson>();
    // Hvilke af de tre nøgler hver sæson har — modellen slår dem op med s["months"] osv. (KeyError, src/tariff.py:222-230).
    const harNøgle = new Map<string, Set<string>>();
    // En profil findes, så snart tariff_consumption har ét blad (src/tariff.py:219: `if not raw: return None`).
    // En ufuldstændig profil er IKKE fravær af en profil (Codex K3-N7).
    let findes = false;

    for (const [sti, json] of værdi) {
        if (!sti.startsWith(`${TARIF}.`)) continue;
        findes = true;
        const rest = sti.slice(TARIF.length + 1).split(".");
        if (rest[0] === "fixed_components" && rest.length === 2) faste.push({ navn: rest[1], pris: læsTal(json) });
        if (rest[0] !== "net_tariff") continue;
        if (rest[1] === "bands" && rest.length === 3) baand.push({ navn: rest[2], pris: læsTal(json) });
        if (rest[1] === "seasons" && rest.length >= 4) {
            const navn = rest[2];
            let s = sæsonMap.get(navn);
            if (!s) { s = { navn, maaneder: [], timer: { weekday: Array(24).fill(null), weekend: Array(24).fill(null) } }; sæsonMap.set(navn, s); }
            harNøgle.set(navn, (harNøgle.get(navn) ?? new Set()).add(rest[3]));
            if (rest[3] === "months" && rest.length === 4) {
                const v = læsVaerdi(json);
                s.maaneder = Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
            }
        }
    }
    // Intervallerne i anden runde, når båndene kendes.
    const båndNavne = new Set(baand.map((b) => b.navn));
    for (const [sti, json] of værdi) {
        if (!sti.startsWith(`${NET}.seasons.`)) continue;
        const rest = sti.slice(NET.length + ".seasons.".length).split(".");
        if (rest.length !== 3 || (rest[1] !== "weekday" && rest[1] !== "weekend")) continue;
        const s = sæsonMap.get(rest[0])!;
        const dag = rest[1] as Dagtype;
        const iv = interval(rest[2]);
        const bånd = læsVaerdi(json);
        if (!iv) { fejl.push({ sti, besked: `Intervallet "${rest[2]}" kan ikke læses. Formatet er 'HH-HH'.` }); continue; }
        const [fra, til] = iv;
        if (fra < 0 || til > 24 || fra >= til) { fejl.push({ sti, besked: `Intervallet "${rest[2]}": timer skal ligge i 0–24 og start < slut.` }); continue; }
        if (typeof bånd !== "string" || !båndNavne.has(bånd)) {
            fejl.push({ sti, besked: `Intervallet "${rest[2]}" (${s.navn}, ${DAGTYPE_NAVN[dag].toLowerCase()}) refererer båndet "${String(bånd)}", som ikke er defineret under bands.` });
            continue;
        }
        for (let t = fra; t < til; t++) {
            const før = s.timer[dag][t];
            if (før !== null) fejl.push({ sti, besked: `Time ${String(t).padStart(2, "0")} er dækket to gange (${s.navn}, ${DAGTYPE_NAVN[dag].toLowerCase()}).` });
            s.timer[dag][t] = bånd;
        }
    }
    const saesoner = [...sæsonMap.values()];
    if (findes) {
        if (saesoner.length === 0) fejl.push({ sti: `${NET}.seasons`, besked: "Tarifprofilen er ufuldstændig: net_tariff.seasons mangler eller er tom (src/tariff.py:231-234)." });
        if (baand.length === 0) fejl.push({ sti: `${NET}.bands`, besked: "Tarifprofilen er ufuldstændig: net_tariff.bands mangler — ingen tidsintervaller kan pege på et bånd." });
        let alleHarMåneder = true;
        for (const s of saesoner) {
            const har = harNøgle.get(s.navn) ?? new Set();
            for (const k of ["months", "weekday", "weekend"]) {
                if (!har.has(k)) fejl.push({ sti: `${NET}.seasons.${s.navn}.${k}`, besked: `Sæson ${s.navn}: ${k} mangler — modellen kræver months, weekday og weekend i hver sæson.` });
            }
            if (!har.has("months")) alleHarMåneder = false;
            for (const dag of ["weekday", "weekend"] as const) {
                if (!har.has(dag)) continue; // allerede meldt som manglende
                const huller = s.timer[dag].flatMap((b, t) => (b === null ? [t] : []));
                if (huller.length) fejl.push({ sti: `${NET}.seasons.${s.navn}.${dag}`, besked: `${s.navn}, ${DAGTYPE_NAVN[dag].toLowerCase()}: timerne ${huller.join(", ")} er ikke dækket. Intervaller er halvåbne ('06-21' = 6 til og med 20).` });
            }
        }
        const set = new Map<number, string>();
        for (const s of saesoner) for (const m of s.maaneder) {
            if (set.has(m)) fejl.push({ sti: `${NET}.seasons.${s.navn}.months`, besked: `Måned ${m} står i både ${set.get(m)} og ${s.navn}.` });
            set.set(m, s.navn);
        }
        const mangler = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !set.has(m));
        if (saesoner.length && alleHarMåneder && mangler.length) fejl.push({ sti: `${NET}.seasons`, besked: `Månederne ${mangler.join(", ")} er ikke dækket af nogen sæson.` });
        // Manglende unit læses som "" og afvises (src/tariff.py:111-115, 236).
        const enhed = værdi.get(`${TARIF}.unit`);
        if (enhed === undefined || læsVaerdi(enhed) !== "kr_per_mwh") {
            fejl.push({ sti: `${TARIF}.unit`, besked: `Tarifprofilens unit skal være 'kr_per_mwh' (${enhed === undefined ? "mangler" : `fik ${enhed}`}).` });
        }
    }

    const elafgift = læsTal(værdi.get("electricity.electricity_tax"));
    const elafgiftNet = læsTal(værdi.get(`${TARIF}.fixed_components.elafgift_net`));
    if (værdi.has(`${TARIF}.fixed_components.elafgift_net`) && elafgift !== elafgiftNet) {
        fejl.push({
            sti: `${TARIF}.fixed_components.elafgift_net`,
            besked: `elafgift_net (${elafgiftNet ?? "–"}) afviger fra electricity.electricity_tax (${elafgift ?? "–"}). De skal være samme tal, ellers afvises casen.`,
        });
    }
    // Båndene i den rækkefølge de koster (billigst først) — skemaets farveskala følger prisen.
    baand.sort((a, b) => (a.pris ?? 0) - (b.pris ?? 0));
    const fastSum = faste.filter((f) => f.navn !== ELAFGIFT_NET).reduce((s, f) => s + (f.pris ?? 0), 0);
    // Profilens billigste time: minimum over de bånd, der FAKTISK står i et timeskema — et defineret, men ubrugt
    // bånd koster ingen time noget (Codex K3-N6: et ubrugt bånd på −1000 gav "−885 kr./MWh").
    const brugte = new Set(saesoner.flatMap((s) => [...s.timer.weekday, ...s.timer.weekend]).filter((b): b is string => b !== null));
    const brugtePriser = baand.filter((b) => brugte.has(b.navn) && b.pris !== null).map((b) => b.pris!);
    const billigsteTime = brugtePriser.length ? Math.min(...brugtePriser) + fastSum : null;
    return { findes, baand, saesoner, faste, fastSum, billigsteTime, elafgift, elafgiftNet, fejl };
}

/** Den dyreste time-blok pr. sæson/dagtype, fx "vinter, hverdage kl. 06–21: spids". */
export function dyresteBlok(t: Tarif): { saeson: string; dag: Dagtype; fra: number; til: number; baand: string; pris: number } | null {
    const pris = new Map(t.baand.map((b) => [b.navn, b.pris ?? 0]));
    let bedst: ReturnType<typeof dyresteBlok> = null;
    for (const s of t.saesoner) for (const dag of ["weekday", "weekend"] as const) {
        const timer = s.timer[dag];
        for (let i = 0; i < 24; i++) {
            const b = timer[i];
            if (!b || (i > 0 && timer[i - 1] === b)) continue;
            let j = i;
            while (j < 24 && timer[j] === b) j++;
            const p = pris.get(b) ?? 0;
            if (!bedst || p > bedst.pris || (p === bedst.pris && j - i > bedst.til - bedst.fra)) bedst = { saeson: s.navn, dag, fra: i, til: j, baand: b, pris: p };
        }
    }
    return bedst;
}
