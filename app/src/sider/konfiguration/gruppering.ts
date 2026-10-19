//-----------------------------------------------------------------------
// Værkets flade blade -> det, en planlægger genkender: afsnit, enheder,
// lagre og priser. Ren logik (testet på alle 7 importerede værker).
//
// Værdierne holdes som JSON-TEKST hele vejen (kontraktens type-strenghed);
// `tal()` og `læs()` er kun til visning og budskaber.
//-----------------------------------------------------------------------

import { læsVaerdi } from "@/lib/data/vaerdi";
import { AFSNIT, type AfsnitDef, type AfsnitId, type FeltPost, afsnitFor, erSkjult, findFelt, katalogOrden } from "./katalog";

/** Den del af en VaerkParameter-række, siden bruger. */
export interface Blad {
    sti: string;
    vaerdi_json: string;
    sektion: string;
    kommentar?: string | null;
    bekraeft?: boolean | null;
    raekkefoelge?: number | null;
    /** Sidst ændret (VaerkParameter.aendret) — bruges til "rettet siden oprettelsen". */
    aendret?: Date | string | null;
}

export interface VistBlad extends Blad {
    post: FeltPost | null;
    /** Skjult bag "Vis alle felter" (avanceret eller læses ikke af modellen). */
    skjult: boolean;
    /** Ingen post i kataloget — vises altid og markeres. */
    ukendt: boolean;
    /** Stien under objektet (`p_max_heat`, `cop_curve.points`) eller under sektionen. */
    rel: string;
}

export type ObjektSektion = "units" | "storage" | "prices";
const OBJEKT_SEKTIONER: readonly string[] = ["units", "storage", "prices"];

export interface Objekt {
    sektion: ObjektSektion;
    navn: string;
    blade: VistBlad[];
}

export interface Afsnit {
    def: AfsnitDef;
    /** Blade der ikke hører til et objekt (fx `electricity.*`, `balancing.*`). */
    blade: VistBlad[];
    objekter: Objekt[];
    antal: number;
}

export interface Gruppering {
    afsnit: Afsnit[];
    efterId: (id: AfsnitId) => Afsnit;
    /** Blade uden post i kataloget (uanset afsnit). */
    ukendte: VistBlad[];
    /** Blade under "Øvrige" — målet er 0. */
    oevrige: number;
    alle: VistBlad[];
}

function sorterBlade(a: VistBlad, b: VistBlad): number {
    return katalogOrden(a.sti) - katalogOrden(b.sti) || (a.raekkefoelge ?? 0) - (b.raekkefoelge ?? 0) || a.sti.localeCompare(b.sti);
}

export function grupper(blade: readonly Blad[]): Gruppering {
    const alle: VistBlad[] = blade.map((b) => {
        const dele = b.sti.split(".");
        const post = findFelt(b.sti);
        const iObjekt = OBJEKT_SEKTIONER.includes(dele[0]) && dele.length > 2;
        return { ...b, post, skjult: erSkjult(post), ukendt: !post, rel: dele.slice(iObjekt ? 2 : 1).join(".") || dele[0] };
    });
    const afsnit: Afsnit[] = AFSNIT.map((def) => ({ def, blade: [], objekter: [], antal: 0 }));
    const efterId = (id: AfsnitId) => afsnit.find((a) => a.def.id === id)!;

    for (const b of alle) {
        const dele = b.sti.split(".");
        const a = efterId(afsnitFor(dele[0]));
        a.antal++;
        if (OBJEKT_SEKTIONER.includes(dele[0]) && dele.length > 2) {
            let o = a.objekter.find((x) => x.navn === dele[1] && x.sektion === dele[0]);
            if (!o) { o = { sektion: dele[0] as ObjektSektion, navn: dele[1], blade: [] }; a.objekter.push(o); }
            o.blade.push(b);
        } else {
            a.blade.push(b);
        }
    }
    for (const a of afsnit) {
        a.blade.sort(sorterBlade);
        for (const o of a.objekter) o.blade.sort(sorterBlade);
        // Objekter i kildefilens rækkefølge (første blads linjenummer).
        a.objekter.sort((x, y) => Math.min(...x.blade.map((b) => b.raekkefoelge ?? 0)) - Math.min(...y.blade.map((b) => b.raekkefoelge ?? 0)));
    }
    return { afsnit, efterId, ukendte: alle.filter((b) => b.ukendt), oevrige: efterId("oevrige").antal, alle };
}

/** Katalogets etiket + de frie navne, `*` stod for (fx "Tarifbånd · spids", "Bånd for tidsinterval (hverdag) · vinter 06-21"). */
export function feltnavn(b: VistBlad): string {
    if (!b.post) return b.rel;
    const skabelon = b.post.sti.split(".");
    const dele = b.sti.split(".");
    // Enhedens/lagerets/brændslets navn står allerede som kortets eller gruppens titel.
    const frie = skabelon.flatMap((d, i) => (d === "*" && !(i === 1 && ["units", "storage", "prices"].includes(skabelon[0])) ? [dele[i]] : []));
    return frie.length ? `${b.post.etiket} · ${frie.join(" ")}` : b.post.etiket;
}

// ------------------------------------------------------------------ værdier til visning

export function tal(json: string | undefined): number | null {
    if (json === undefined) return null;
    const v = læsVaerdi(json);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function tekst(json: string | undefined): string | null {
    if (json === undefined) return null;
    const v = læsVaerdi(json);
    return typeof v === "string" ? v : null;
}

export function sand(json: string | undefined): boolean | null {
    if (json === undefined) return null;
    const v = læsVaerdi(json);
    return typeof v === "boolean" ? v : null;
}

/** Bladene som opslag sti -> vaerdi_json. */
export const opslag = (blade: readonly Blad[]) => new Map(blade.map((b) => [b.sti, b.vaerdi_json]));

// ------------------------------------------------------------------ enheder og lagre

export interface CopPunkt { t_ambient: number; heat_mw: number; el_mw: number; cop: number }

export interface Enhed {
    navn: string;
    type: string | null;
    til: boolean;
    pMax: number | null;
    pMin: number | null;
    fuel: string | null;
    eta: number | null;
    alpha: number | null;
    varOm: number | null;
    startCost: number | null;
    minOp: number | null;
    minNed: number | null;
    uc: boolean;
    afrr: boolean;
    mfrr: boolean;
    /**
     * Kan faktisk byde i balancemarkedet: kun `fuel: electricity` byder, uanset flagene
     * (doc/BALANCEMARKED.md:7-8). En gasmotor med aFRR-flag byder ikke.
     */
    kanByde: boolean;
    /** Loftet er en produktionsprofil (solvarme: 0 om natten), ikke p_max_heat — ikke styrbar effekt. */
    profil: boolean;
    copType: string | null;
    cop: CopPunkt[];
    /** COP fra alpha (−1/alpha), når der ingen kurve er. */
    copFraAlpha: number | null;
}

export function copPunkter(json: string | undefined): CopPunkt[] {
    const v = json === undefined ? undefined : læsVaerdi(json);
    if (!Array.isArray(v)) return [];
    return v.flatMap((p) => {
        if (!p || typeof p !== "object") return [];
        const { t_ambient, heat_mw, el_mw } = p as Record<string, unknown>;
        if (typeof t_ambient !== "number" || typeof heat_mw !== "number" || typeof el_mw !== "number") return [];
        return [{ t_ambient, heat_mw, el_mw, cop: el_mw > 0 ? heat_mw / el_mw : NaN }];
    }).sort((a, b) => a.t_ambient - b.t_ambient);
}

export function enhed(o: Objekt): Enhed {
    const m = new Map(o.blade.map((b) => [b.rel, b.vaerdi_json]));
    const alpha = tal(m.get("alpha"));
    const copType = tekst(m.get("cop_curve.type"));
    const fuel = tekst(m.get("fuel"));
    const afrr = sand(m.get("ancillary.afrr_qualified")) ?? false;
    const mfrr = sand(m.get("ancillary.mfrr_qualified")) ?? false;
    return {
        kanByde: fuel === "electricity" && (afrr || mfrr),
        profil: fuel === "solar" || tekst(m.get("type")) === "solar_thermal" || m.has("production_profile_path"),
        navn: o.navn,
        type: tekst(m.get("type")),
        til: sand(m.get("enabled")) ?? true,
        pMax: tal(m.get("p_max_heat")),
        pMin: tal(m.get("p_min_heat")),
        fuel: tekst(m.get("fuel")),
        eta: tal(m.get("eta_fuel_to_heat")),
        alpha,
        varOm: tal(m.get("var_om")),
        startCost: tal(m.get("start_cost")),
        minOp: tal(m.get("min_uptime")),
        minNed: tal(m.get("min_downtime")),
        uc: sand(m.get("uc_enabled")) ?? false,
        afrr: sand(m.get("ancillary.afrr_qualified")) ?? false,
        mfrr: sand(m.get("ancillary.mfrr_qualified")) ?? false,
        copType,
        cop: copPunkter(m.get("cop_curve.points")),
        copFraAlpha: !copType && alpha !== null && alpha < 0 ? -1 / alpha : null,
    };
}

/** 1 m³ vand pr. K ≈ 1,163 kWh (viden/METODE.md; src/config.py:571-575). */
export const KWH_PR_M3_K = 1.163;

export interface Lager {
    navn: string;
    til: boolean;
    volumen: number | null;
    deltaT: number | null;
    eMax: number | null;
    /** Kapaciteten modellen bruger: e_max_mwh, ellers volumen × 1,163 × ΔT / 1000. */
    kapacitet: number | null;
    kapacitetBeregnet: boolean;
    eStart: number | null;
    pLad: number | null;
    pAflad: number | null;
    tab: number | null;
}

export function lager(o: Objekt): Lager {
    const m = new Map(o.blade.map((b) => [b.rel, b.vaerdi_json]));
    const volumen = tal(m.get("volume_m3"));
    const deltaT = tal(m.get("delta_t_k"));
    const eMax = tal(m.get("e_max_mwh"));
    const beregnet = volumen !== null && deltaT !== null ? (volumen * KWH_PR_M3_K * deltaT) / 1000 : null;
    return {
        navn: o.navn,
        til: sand(m.get("enabled")) ?? true,
        volumen, deltaT, eMax,
        kapacitet: eMax ?? beregnet,
        kapacitetBeregnet: eMax === null && beregnet !== null,
        eStart: tal(m.get("e_initial_mwh")),
        pLad: tal(m.get("p_max_charge_mw")),
        pAflad: tal(m.get("p_max_discharge_mw")),
        tab: tal(m.get("self_discharge_per_hour")),
    };
}

/** Navnene på værkets enheder og lagre (fra stierne; også dem uden `enabled`). */
export function objektnavne(blade: readonly { sti: string }[]): { units: Set<string>; storage: Set<string> } {
    const units = new Set<string>();
    const storage = new Set<string>();
    for (const b of blade) {
        const [s, n] = b.sti.split(".");
        if (n && b.sti.split(".").length > 2) {
            if (s === "units") units.add(n);
            else if (s === "storage") storage.add(n);
        }
    }
    return { units, storage };
}
