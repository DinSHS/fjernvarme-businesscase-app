//-----------------------------------------------------------------------
// Klientvalidering af et værk — reglerne markeret "Klient" i
// viden/validering.md (fv-ekspert), med modellens egne beskeder.
//
// Backend og modellen har det sidste ord; formålet her er at fange det,
// der ellers bliver en Python-traceback (TypeError/KeyError) eller en
// afvist kørsel, FØR brugeren gemmer. Alvor:
//   fejl      — casen afvises eller kan ikke køre (blokerer "Gem")
//   advarsel  — kører, men giver sandsynligvis ikke det, brugeren mener
//-----------------------------------------------------------------------

import { læsVaerdi } from "@/lib/data/vaerdi";
import { GRAENSER } from "../../../rayfin/data/fjv.constants";
import { findFelt, kendteObjektfelter, type FeltPost } from "./katalog";
import { KWH_PR_M3_K, copPunkter } from "./gruppering";
import { laesTarif } from "./tarif";

export interface Fund { sti: string; besked: string; alvor: "fejl" | "advarsel" }

const BRAENDSELS_PRIS: Record<string, string> = {
    natural_gas: "natural_gas", straw: "straw", flis: "flis", wood_pellets: "wood_pellets", waste_heat: "waste_heat",
};
const IKKE_BRAENDSEL = new Set(["electricity", "solar"]);
const BALANCING_NOEGLER = new Set(["method", "bid_strategy", "ancillary_caps", "reservation_gate", "activation", "availability", "shared_reserve_cap_mw", "robust_reservation"]);
const MARKEDER = ["afrr", "mfrr"] as const;
const LAGER_PAAKRAEVET = ["volume_m3", "delta_t_k", "e_initial_mwh", "p_max_charge_mw", "p_max_discharge_mw", "self_discharge_per_hour"];
const ENHED_PAAKRAEVET = ["type", "p_max_heat", "p_min_heat", "alpha", "fuel"];

const UNITS_FELTER = kendteObjektfelter("units");
const STORAGE_FELTER = kendteObjektfelter("storage");

type V = ReadonlyMap<string, string>;

const værdi = (v: V, sti: string): unknown => { const j = v.get(sti); return j === undefined ? undefined : læsVaerdi(j); };
const num = (v: V, sti: string): number | null => { const x = værdi(v, sti); return typeof x === "number" && Number.isFinite(x) ? x : null; };
const str = (v: V, sti: string): string | null => { const x = værdi(v, sti); return typeof x === "string" ? x : null; };
const harUnder = (v: V, pre: string) => [...v.keys()].some((s) => s.startsWith(`${pre}.`) || s === pre);
const børn = (v: V, pre: string) => [...new Set([...v.keys()].filter((s) => s.startsWith(`${pre}.`)).map((s) => s.slice(pre.length + 1).split(".")[0]))];

/** Et enkelt blad mod sin katalogpost: type, tilladte værdier, min/max. */
export function tjekFelt(sti: string, json: string, post: FeltPost | null = findFelt(sti)): Fund | null {
    if (!post) return null;
    const v = læsVaerdi(json);
    if (v === undefined) return { sti, besked: "Værdien er ikke gyldig JSON.", alvor: "fejl" };
    const navn = post.etiket;
    // Et påkrævet felt må ikke være tomt: modellen regner med værdien (fx electricity_tax i src/model.py:83).
    // At nøglen findes er ikke nok (Codex K3-N7). Valgfri felter må være null (e_max_mwh: null = beregnes).
    if (v === null) return post.paakraevet ? { sti, besked: `${navn}: påkrævet og må ikke være tom (null).`, alvor: "fejl" } : null;
    if (post.type === "object") return null;
    switch (post.type) {
        case "number":
            if (typeof v !== "number") return { sti, besked: `${navn}: skal være et tal.`, alvor: "fejl" };
            break;
        case "integer":
            if (typeof v !== "number" || !/^-?\d+$/.test(json.trim())) return { sti, besked: `${navn}: skal være et helt tal.`, alvor: "fejl" };
            break;
        case "boolean":
            if (typeof v !== "boolean") return { sti, besked: `${navn}: skal være ja eller nej.`, alvor: "fejl" };
            break;
        case "string":
            if (typeof v !== "string") return { sti, besked: `${navn}: skal være tekst.`, alvor: "fejl" };
            break;
        case "list":
            if (!Array.isArray(v)) return { sti, besked: `${navn}: skal være en liste.`, alvor: "fejl" };
            break;
        case "enum":
            if (post.tilladte && !post.tilladte.some((t) => t === v)) {
                return { sti, besked: `${navn}: "${String(v)}" er ikke tilladt. Tilladte: ${post.tilladte.join(", ")}.`, alvor: "fejl" };
            }
            break;
    }
    if (typeof v === "number") {
        if (post.min !== null && (post.min_eksklusiv ? v <= post.min : v < post.min)) {
            return { sti, besked: `${navn}: skal være ${post.min_eksklusiv ? ">" : "≥"} ${String(post.min).replace(".", ",")}.`, alvor: "fejl" };
        }
        if (post.max !== null && v > post.max) return { sti, besked: `${navn}: må højst være ${String(post.max).replace(".", ",")}.`, alvor: "fejl" };
    }
    return null;
}

/** Hele værket (eller udkastet) — alle fund, sorteret fejl før advarsler. */
export function validerVaerk(v: V): Fund[] {
    const f: Fund[] = [];
    const fejl = (sti: string, besked: string) => f.push({ sti, besked, alvor: "fejl" });
    const adv = (sti: string, besked: string) => f.push({ sti, besked, alvor: "advarsel" });

    // ---- felt for felt
    for (const [sti, json] of v) {
        const post = findFelt(sti);
        const r = tjekFelt(sti, json, post);
        if (r) f.push(r);
        if (!post) {
            const [s] = sti.split(".");
            // Ukendte felter på enheder/lagre giver TypeError i modellen; andre steder er de blot uden virkning.
            if (s !== "units" && s !== "storage" && s !== "balancing" && s !== "data" && s !== "solver" && s !== "grid") {
                adv(sti, "Feltet findes ikke i felt-kataloget og læses sandsynligvis ikke af modellen.");
            }
        }
    }

    // ---- enheder
    const units = børn(v, "units");
    const storage = børn(v, "storage");
    const aktive = units.filter((u) => værdi(v, `units.${u}.enabled`) !== false);
    if (aktive.length === 0) fejl("units", "Ingen aktive produktionsenheder — modellen er tom.");
    for (const u of units) {
        const p = `units.${u}`;
        for (const s of [...v.keys()].filter((s) => s.startsWith(`${p}.`))) {
            const rel = s.slice(p.length + 1);
            if (!UNITS_FELTER.has(rel)) fejl(s, `${u}: ukendt felt "${rel}" — enheden bygges med Unit(**felter) og afviser det.`);
        }
        for (const k of ENHED_PAAKRAEVET) if (værdi(v, `${p}.${k}`) == null) fejl(`${p}.${k}`, `${u}: påkrævet felt "${k}" mangler.`);
        const pMin = num(v, `${p}.p_min_heat`), pMax = num(v, `${p}.p_max_heat`);
        if (pMin !== null && pMax !== null && pMin > pMax) fejl(`${p}.p_min_heat`, `${u}: p_min > p_max.`);
        const fuel = str(v, `${p}.fuel`);
        const type = str(v, `${p}.type`);
        const til = værdi(v, `${p}.enabled`) !== false;
        if (fuel && !IKKE_BRAENDSEL.has(fuel) && num(v, `${p}.eta_fuel_to_heat`) === null) fejl(`${p}.eta_fuel_to_heat`, `${u}: brændselsenhed mangler eta_fuel_to_heat.`);
        if (til && fuel && BRAENDSELS_PRIS[fuel] && num(v, `prices.${BRAENDSELS_PRIS[fuel]}.value`) === null) {
            fejl(`prices.${BRAENDSELS_PRIS[fuel]}.value`, `En enhed (${u}) bruger ${fuel}, men prisen for ${fuel} er ikke sat under prices.`);
        }
        const alpha = num(v, `${p}.alpha`);
        if (alpha !== null && fuel === "electricity" && alpha >= 0) adv(`${p}.alpha`, `${u}: alpha bør være negativ for en el-forbrugende enhed.`);
        if (alpha !== null && alpha > 0 && type !== "gas_engine_chp") adv(`${p}.alpha`, `${u}: positiv alpha (elproduktion) bruges kun for kraftvarme.`);
        if (værdi(v, `${p}.uc_enabled`) === true) {
            const init = værdi(v, `${p}.initial_status`);
            if (init !== undefined && init !== 0 && init !== 1) fejl(`${p}.initial_status`, `${u}: initial_status skal være 0 eller 1.`);
        }
        // COP-kurven
        if (harUnder(v, `${p}.cop_curve`)) {
            if (type !== "heat_pump") fejl(`${p}.cop_curve`, `${u}: cop_curve kun gyldig for type='heat_pump'.`);
            if (fuel !== "electricity") fejl(`${p}.cop_curve`, `${u}: cop_curve kræver fuel='electricity'.`);
            const ct = str(v, `${p}.cop_curve.type`) ?? "linear";
            const harPunkter = v.has(`${p}.cop_curve.points`);
            if (ct === "linear") {
                if (harPunkter) fejl(`${p}.cop_curve.points`, `${u}: 'points' gælder kun type 'table'.`);
                const cmin = num(v, `${p}.cop_curve.cop_min`) ?? 1.8, cmax = num(v, `${p}.cop_curve.cop_max`) ?? 4.0;
                if (cmin <= 0 || cmax <= cmin) fejl(`${p}.cop_curve.cop_min`, `${u}: Ugyldige COP-grænser (cop_min > 0 og cop_max > cop_min).`);
            } else if (ct === "table") {
                const rå = værdi(v, `${p}.cop_curve.points`);
                const pkt = copPunkter(v.get(`${p}.cop_curve.points`));
                if (!Array.isArray(rå) || rå.length < 2) fejl(`${p}.cop_curve.points`, `${u}: COP-tabellen kræver mindst to målepunkter.`);
                else if (pkt.length !== rå.length) fejl(`${p}.cop_curve.points`, `${u}: hvert punkt skal have t_ambient, heat_mw og el_mw som tal.`);
                const set = new Set<number>();
                for (const [i, q] of pkt.entries()) {
                    if (q.heat_mw <= 0 || q.el_mw <= 0) fejl(`${p}.cop_curve.points`, `${u}: punkt ${i + 1}: varme og el skal være > 0.`);
                    else if (q.cop < 1 || q.cop > 8) fejl(`${p}.cop_curve.points`, `${u}: punkt ${i + 1} har COP ${q.cop.toFixed(2).replace(".", ",")} — er varme og el byttet om, eller står et tal i kW?`);
                    if (set.has(q.t_ambient)) fejl(`${p}.cop_curve.points`, `${u}: samme udetemperatur (${q.t_ambient} °C) står to gange.`);
                    set.add(q.t_ambient);
                }
            }
        }
    }

    // ---- lagre
    for (const s of storage) {
        const p = `storage.${s}`;
        for (const k of [...v.keys()].filter((k) => k.startsWith(`${p}.`))) {
            const rel = k.slice(p.length + 1);
            if (!STORAGE_FELTER.has(rel)) fejl(k, `${s}: ukendt felt "${rel}" — lageret bygges med Storage(**felter) og afviser det.`);
        }
        for (const k of LAGER_PAAKRAEVET) if (værdi(v, `${p}.${k}`) == null) fejl(`${p}.${k}`, `${s}: påkrævet felt "${k}" mangler.`);
        const vol = num(v, `${p}.volume_m3`), dt = num(v, `${p}.delta_t_k`), emax = num(v, `${p}.e_max_mwh`), e0 = num(v, `${p}.e_initial_mwh`);
        const kap = emax ?? (vol !== null && dt !== null ? (vol * KWH_PR_M3_K * dt) / 1000 : null);
        if (kap !== null && e0 !== null && e0 > kap) adv(`${p}.e_initial_mwh`, `${s}: startindholdet (${e0} MWh) er større end kapaciteten (${kap.toFixed(1).replace(".", ",")} MWh) — modellen sætter det til halvfuldt.`);
    }
    for (const n of units) if (storage.includes(n)) fejl(`storage.${n}`, `"${n}" findes både som enhed og som lager — til/fra i et scenarie kan ikke skelne dem.`);

    // ---- priser
    if (num(v, "prices.co2_eua.value") === null) fejl("prices.co2_eua.value", "prices.co2_eua mangler i casen. Skriv 0, hvis gasprisen allerede indeholder CO2-afgiften.");
    for (const b of børn(v, "prices")) if (b !== "co2_eua" && !v.has(`prices.${b}.value`)) fejl(`prices.${b}`, `Prisen ${b} mangler value.`);

    // ---- el og tarif
    for (const k of ["spot_area", "tariff_consumption_flat", "tariff_production_flat", "electricity_tax"]) {
        if (!v.has(`electricity.${k}`)) fejl(`electricity.${k}`, `electricity.${k} mangler.`);
    }
    for (const t of laesTarif(v).fejl) fejl(t.sti, t.besked);
    if (v.has("grid.max_consumption_mw") && !aktive.some((u) => str(v, `units.${u}.fuel`) === "electricity")) {
        fejl("grid.max_consumption_mw", "grid.max_consumption_mw er sat, men casen har ingen aktive el-enheder.");
    }
    for (const k of børn(v, "grid")) if (k !== "max_consumption_mw") fejl(`grid.${k}`, `Ukendt nøgle i grid-blokken: ${k}.`);

    // ---- data, tid, solver
    if (!harUnder(v, "data")) fejl("data", "Casen mangler en 'data'-blok.");
    for (const k of ["dmi_area", "price_zone"]) if (!v.has(`data.${k}`)) fejl(`data.${k}`, `data.${k} mangler i casen og har med vilje ingen standard.`);
    for (const k of børn(v, "data")) if (!findFelt(`data.${k}`)) fejl(`data.${k}`, `Ukendt nøgle i data-blokken: ${k}.`);
    const zone = str(v, "data.price_zone"), spot = str(v, "electricity.spot_area");
    if (zone && spot && zone !== spot) adv("data.price_zone", `Priszonen (${zone}) er ikke lig electricity.spot_area (${spot}) — spotpriser hentes for ${zone}, balancepriser for ${spot}.`);
    for (const k of ["start", "end", "resolution"]) if (!v.has(`time.${k}`)) fejl(`time.${k}`, `time.${k} mangler.`);
    const start = str(v, "time.start"), slut = str(v, "time.end");
    const ts = start ? Date.parse(start) : NaN, te = slut ? Date.parse(slut) : NaN;
    if (start && Number.isNaN(ts)) fejl("time.start", `"${start}" er ikke et gyldigt ISO-tidspunkt.`);
    if (slut && Number.isNaN(te)) fejl("time.end", `"${slut}" er ikke et gyldigt ISO-tidspunkt.`);
    if (!Number.isNaN(ts) && !Number.isNaN(te) && te <= ts) fejl("time.end", "Slut skal være efter start.");
    for (const k of børn(v, "solver")) if (!findFelt(`solver.${k}`)) fejl(`solver.${k}`, `Ukendt nøgle i solver-blokken: ${k}.`);
    const gab = num(v, "solver.mip_rel_gap");
    if (gab === 1) fejl("solver.mip_rel_gap", "solver.mip_rel_gap skal ligge i [0, 1).");
    const tl = num(v, "solver.time_limit");
    if (tl !== null && tl > GRAENSER.maksTidsgraenseS) adv("solver.time_limit", `Tidsgrænsen er over ${GRAENSER.maksTidsgraenseS} s — en kørsel fra appen afvises, medmindre scenariet sætter en lavere.`);

    // ---- varmelast
    if (!harUnder(v, "heat_load_params")) fejl("heat_load_params", "heat_load_params mangler (også når målt varmelast bruges).");
    else if (num(v, "heat_load_params.gaf_mw_per_k") === null) fejl("heat_load_params.gaf_mw_per_k", "heat_load_params.gaf_mw_per_k mangler.");
    const prof = værdi(v, "heat_load_params.baseline_profile_mw");
    if (prof !== undefined && (!Array.isArray(prof) || prof.length !== 24 || prof.some((x) => typeof x !== "number"))) {
        fejl("heat_load_params.baseline_profile_mw", "baseline_profile_mw skal være præcis 24 tal.");
    }
    if (harUnder(v, "heat_load_params.nettab")) {
        const n = "heat_load_params.nettab";
        if (!v.has(`${n}.aarligt_nettab_mwh`) && !v.has(`${n}.aarligt_nettab_pct`)) fejl(n, "Angiv enten 'aarligt_nettab_mwh' eller 'aarligt_nettab_pct'.");
        for (const s of ["sommer.t_frem", "sommer.t_retur", "vinter.t_frem", "vinter.t_retur"]) if (!v.has(`${n}.${s}`)) fejl(`${n}.${s}`, `Nettab: ${s} mangler.`);
        const so = num(v, `${n}.sommer.t_ude`) ?? 16, vi = num(v, `${n}.vinter.t_ude`) ?? 1;
        if (so <= vi) fejl(`${n}.sommer.t_ude`, "sommer.t_ude skal være højere end vinter.t_ude.");
        const ka = num(v, `${n}.konduktiv_andel`);
        if (ka !== null && ka >= 1) fejl(`${n}.konduktiv_andel`, "konduktiv_andel skal være mellem 0 og 1.");
        const da = num(v, `${n}.t_jord_damping`);
        if (da !== null && (da < 0 || da > 1)) fejl(`${n}.t_jord_damping`, "t_jord_damping skal være mellem 0 og 1.");
    }

    // ---- balancering
    for (const k of børn(v, "balancing")) if (!BALANCING_NOEGLER.has(k)) fejl(`balancing.${k}`, `Ukendt nøgle i balancing: ${k}. Gyldige: ${[...BALANCING_NOEGLER].join(", ")}.`);
    const metode = str(v, "balancing.method") ?? "legacy";
    const harBud = harUnder(v, "balancing.bid_strategy");
    if (metode === "activation_value" && !harBud) fejl("balancing.method", "balancing.method='activation_value' kræver balancing.bid_strategy.");
    if (harBud && !v.has("balancing.bid_strategy.up_markup_dkk_mwh")) fejl("balancing.bid_strategy.up_markup_dkk_mwh", "bid_strategy kræver up_markup_dkk_mwh.");
    const kendtEnhed = (navn: string) => units.includes(navn);
    for (const u of børn(v, "balancing.ancillary_caps.per_unit_mw")) if (!kendtEnhed(u)) fejl(`balancing.ancillary_caps.per_unit_mw.${u}`, `balancing.ancillary_caps.per_unit_mw: enheden ${u} findes ikke i casen.`);
    for (const u of børn(v, "balancing.ancillary_caps.per_unit_market_mw")) {
        if (!kendtEnhed(u)) fejl(`balancing.ancillary_caps.per_unit_market_mw.${u}`, `balancing.ancillary_caps.per_unit_market_mw: enheden ${u} findes ikke i casen.`);
        for (const m of børn(v, `balancing.ancillary_caps.per_unit_market_mw.${u}`)) if (!MARKEDER.includes(m as never)) fejl(`balancing.ancillary_caps.per_unit_market_mw.${u}.${m}`, `Ukendt marked ${m}. Gyldige nøgler: afrr, mfrr.`);
    }
    for (const m of MARKEDER) {
        const g = `balancing.reservation_gate.${m}`;
        if (!harUnder(v, g)) continue;
        if (!v.has(`${g}.block_mw`)) fejl(`${g}.block_mw`, `reservation_gate.${m} mangler block_mw.`);
        if (!v.has(`${g}.cm_threshold_dkk_mw_h`) && !harUnder(v, `${g}.opportunity_cost`)) fejl(g, `reservation_gate.${m}: sæt enten cm_threshold_dkk_mw_h eller opportunity_cost.`);
        const ref = str(v, `${g}.opportunity_cost.reference_unit`);
        if (ref && !kendtEnhed(ref)) fejl(`${g}.opportunity_cost.reference_unit`, `opportunity_cost.reference_unit=${ref} findes ikke i casen.`);
    }
    const fs = str(v, "balancing.activation.foresight");
    // FEJL i værket: værkets egen metode tjekkes ved indlæsning (src/config.py:1067-1071). Undtagelsen i
    // validering.md gælder kun, når et SCENARIE sætter metoden (run_case.py:661-668) — det hører til Scenarier.
    if (fs && fs !== "realized" && metode !== "activation_value") {
        fejl("balancing.activation.foresight", `balancing.activation.foresight='${fs}' kræver balancing.method='activation_value' (værkets metode er '${metode}').`);
    }
    for (const m of MARKEDER) {
        const model = str(v, `balancing.activation.${m}.model`);
        if (model && model !== "clear" && metode !== "activation_value") {
            fejl(`balancing.activation.${m}.model`, `balancing.activation.${m}.model='${model}' kræver balancing.method='activation_value' (værkets metode er '${metode}').`);
        }
        if (model === "ramp" && !((num(v, `balancing.activation.${m}.ramp_dkk_mwh`) ?? 0) > 0)) fejl(`balancing.activation.${m}.ramp_dkk_mwh`, "model='ramp' kræver ramp_dkk_mwh > 0.");
        for (const mdr of børn(v, `balancing.availability.${m}.mw_by_month`)) {
            if (!/^\d{4}-\d{2}$/.test(mdr)) fejl(`balancing.availability.${m}.mw_by_month.${mdr}`, "Månedsnøgle skal være 'ÅÅÅÅ-MM'.");
        }
    }
    for (const g of børn(v, "ancillary_groups")) {
        const navne = værdi(v, `ancillary_groups.${g}.units`);
        const ukendte = Array.isArray(navne) ? navne.filter((n) => typeof n !== "string" || !kendtEnhed(n)) : [];
        if (ukendte.length) fejl(`ancillary_groups.${g}.units`, `ancillary_groups.${g}: ukendte enheder ${ukendte.join(", ")}.`);
    }

    // Én besked pr. (sti, besked); fejl først.
    const set = new Set<string>();
    return f.filter((x) => { const k = `${x.sti}|${x.besked}`; if (set.has(k)) return false; set.add(k); return true; })
        .sort((a, b) => (a.alvor === b.alvor ? 0 : a.alvor === "fejl" ? -1 : 1));
}
