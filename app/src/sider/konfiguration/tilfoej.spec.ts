// Runde 14c: tilføj det, et værk mangler — balancemarkedets blok, et enkelt felt fra kataloget — og advarslen om, at
// ingen enhed er tændt ved start. Værkerne bygges af modelspejlet (modelrepoet ved pinnen), ikke af en installations
// database, så specs'ene kører overalt.
import { describe, expect, it } from "vitest";
import { MODELSPEJL } from "@/lib/modelspejl.data";
import { anvend, anmodningsLængde, MAKS_ANMODNING, nyEnhed, ændringerFraUdkast } from "./redigering";
import { validerVaerk } from "./validering";
import { nyeFejl } from "./useRedigering";
import { findFelt } from "./katalog";
import {
    BALANCE_IKKE_TILBUDT, balanceEnheder, fjernBalancemarked, forvalgteEnheder, harBalancemarked, planlægBalancemarked,
    udgangspunkter, type BalanceValg,
} from "./balancemarked";
import { manglendeFelter, tilfoejFelt } from "./manglende-felter";
import { startAdvarsel } from "./startstatus";

const KORT = MODELSPEJL.model_commit.slice(0, 7);
const BS = MODELSPEJL.budstrategi;
const andeby = new Map(Object.entries(MODELSPEJL.cases.andeby.blade).map(([s, [v]]) => [s, v]));

/** Andeby, som et værk fra værksarket ser ud: ingen balancing-blok (scriptet skriver den ikke). */
function utenBalancing(v: ReadonlyMap<string, string>): Map<string, string> {
    return new Map([...v].filter(([s]) => !s.startsWith("balancing.")));
}
const arkVaerk = utenBalancing(andeby);

/** Blokkens blade (sti -> værdi) efter planen er lagt på værket. */
const balancing = (v: ReadonlyMap<string, string>) => new Map([...v].filter(([s]) => s.startsWith("balancing.")));

describe("målt før runde 14c: hvad Konfiguration kan tilføje", () => {
    it("redigeringens udkast kan kun RETTE felter, værket har; et nyt felt afvises", () => {
        const udkast = new Map([["balancing.method", { tekst: "activation_value", json: '"activation_value"', fejl: null }]]);
        const r = ændringerFraUdkast(udkast, arkVaerk);
        expect(r.ændringer).toEqual([]);
        expect(r.fejl.map((f) => f.besked)).toEqual(["Feltet findes ikke længere i værket — genindlæs."]);
    });
    it("Ny enhed opretter kun under units.<navn>", () => {
        const r = nyEnhed("electric_boiler", "elkedel_x", new Map());
        expect(r.ændringer.length).toBeGreaterThan(0);
        expect(r.ændringer.every((æ) => æ.handling === "opret" && æ.sti.startsWith("units.elkedel_x."))).toBe(true);
    });
});

describe("modelspejlet bærer BUDSTRATEGI.md's færdige blokke", () => {
    it("fælles del og profil 1–4 med linjer i doc/BUDSTRATEGI.md", () => {
        expect(BS.fil).toBe("doc/BUDSTRATEGI.md");
        const titler = BS.blokke.map((b) => b.titel);
        expect(titler[0]).toMatch(/^Fælles del/);
        for (const n of [1, 2, 3, 4, 5]) expect(titler.some((t) => t.startsWith(`Profil ${n} `))).toBe(true);
        expect(BS.blokke[0].blade["balancing.method"][0]).toBe('"activation_value"');
        expect(BS.blokke[0].blade["balancing.activation.afrr.k"][0]).toBe("4.0");
    });
});

describe("udgangspunkter for balancemarkedet", () => {
    it("Andebys blok og BUDSTRATEGI's profil 1–4; profil 5 og budvinduet tilbydes ikke, og det siges hvorfor", () => {
        expect(udgangspunkter().map((u) => u.id)).toEqual(["andeby", "profil1", "profil2", "profil3", "profil4"]);
        for (const u of udgangspunkter()) expect(u.kilde).toMatch(new RegExp(`@ ${KORT}$`));
        expect(udgangspunkter()[0].kilde).toMatch(/^cases\/andeby\.yaml:\d+-\d+ @/);
        expect(udgangspunkter()[2].kilde).toMatch(/^doc\/BUDSTRATEGI\.md:224-239, 256-262 @/);
        expect(BALANCE_IKKE_TILBUDT.map((x) => x.navn)).toEqual([expect.stringMatching(/^Profil 5/), expect.stringMatching(/^Valgfrit: budvindue/)]);
        for (const x of BALANCE_IKKE_TILBUDT) expect(x.grund.length).toBeGreaterThan(10);
    });
});

describe("enheder, der kan byde", () => {
    it("kun el-enhederne (katalogets gaelder_for for ancillary.afrr_qualified); forvalgt = dem værket allerede har prækvalificeret", () => {
        const e = balanceEnheder(arkVaerk);
        expect(e.filter((x) => x.kanByde).map((x) => x.navn)).toEqual(["vp_luft_vand", "elkedel_ny", "elkedel_gl"]);
        expect(forvalgteEnheder(arkVaerk)).toEqual(["vp_luft_vand", "elkedel_ny", "elkedel_gl"]);
        const ukval = new Map(arkVaerk);
        for (const n of ["vp_luft_vand", "elkedel_ny", "elkedel_gl"]) { ukval.set(`units.${n}.ancillary.afrr_qualified`, "false"); ukval.set(`units.${n}.ancillary.mfrr_qualified`, "false"); }
        expect(forvalgteEnheder(ukval)).toEqual([]);
    });
});

describe("tilføj balancemarked", () => {
    const fælles = BS.blokke[0];
    const profil2 = BS.blokke.find((b) => b.titel.startsWith("Profil 2 "))!;
    // Et værk fra værksarket med egne enhedsnavne: Andebys varmepumpe hedder "varmepumpe".
    const omdøbt = new Map([...arkVaerk].map(([s, v]) => [s.replace(/^units\.vp_luft_vand\./, "units.varmepumpe."), v]));

    it("profil 2 med værkets egne navne: hver værdi er kildens, med fil:linje; ingen af Andebys navne", () => {
        const valg: BalanceValg = { udgangspunkt: "profil2", enheder: ["varmepumpe"], loft: { varmepumpe: "5,5" } };
        const p = planlægBalancemarked(omdøbt, valg);
        expect(p.fejl).toEqual([]);
        const efter = anvend(omdøbt, p.ændringer);
        for (const [sti, [v, linje]] of Object.entries({ ...fælles.blade, ...profil2.blade })) {
            if (sti.includes("vp_luft_vand")) continue;
            expect(efter.get(sti), sti).toBe(v);
            expect(p.felter.find((f) => f.sti === sti)?.kilde, sti).toBe(`doc/BUDSTRATEGI.md:${linje} @ ${KORT}`);
        }
        expect(efter.get("balancing.ancillary_caps.per_unit_mw.varmepumpe")).toBe("5.5");
        expect([...p.ændringer].some((æ) => æ.sti.includes("vp_luft_vand") || (æ.ny_json ?? "").includes("vp_luft_vand"))).toBe(false);
        // BUDSTRATEGI.md: prækvalificerede enheder skal have afrr_qualified/mfrr_qualified: true.
        const kval = p.felter.filter((f) => f.slags === "kvalifikation");
        expect(kval.map((f) => f.sti)).toEqual(["units.varmepumpe.ancillary.afrr_qualified", "units.varmepumpe.ancillary.mfrr_qualified"]);
        expect(kval.every((f) => f.kilde === `doc/BUDSTRATEGI.md:${BS.kvalificering_linje} @ ${KORT}`)).toBe(true);
        // Allerede true i værket: står i planen som uændret, sendes ikke.
        expect(kval.every((f) => f.handling === "uændret")).toBe(true);
        // Modellens egne regler: ingen nye fejl.
        expect(nyeFejl(validerVaerk(omdøbt), validerVaerk(efter))).toEqual([]);
    });

    it("markerer de felter, brugeren skal tage stilling til, og tallene som eksempler", () => {
        const p = planlægBalancemarked(omdøbt, { udgangspunkt: "profil2", enheder: ["varmepumpe"], loft: { varmepumpe: "5,5" } });
        const stilling = p.felter.filter((f) => f.tagStilling).map((f) => f.sti);
        expect(stilling).toEqual(expect.arrayContaining(["balancing.ancillary_caps.per_unit_mw.varmepumpe", "balancing.ancillary_caps.total_mw"]));
        expect(p.felter.find((f) => f.sti === "balancing.reservation_gate.afrr.block_mw")?.eksempel).toBe(true);
        expect(p.felter.find((f) => f.sti === "balancing.method")?.eksempel).toBe(false);
        // Eksemplet i kilden vises ved loftet (Andebys varmepumpe), ikke som værdi.
        expect(p.felter.find((f) => f.slags === "loft")?.tagStilling).toMatch(/vp_luft_vand 6,0 MW/);
    });

    it("en uprækvalificeret enhed får afrr_qualified/mfrr_qualified sat til true i samme revision", () => {
        const v = new Map(omdøbt);
        v.set("units.elkedel_gl.ancillary.afrr_qualified", "false");
        v.delete("units.elkedel_gl.ancillary.mfrr_qualified");
        const p = planlægBalancemarked(v, { udgangspunkt: "profil2", enheder: ["varmepumpe", "elkedel_gl"], loft: { varmepumpe: "5,5", elkedel_gl: "12" } });
        expect(p.fejl).toEqual([]);
        expect(p.ændringer).toEqual(expect.arrayContaining([
            { sti: "units.elkedel_gl.ancillary.afrr_qualified", handling: "ret", ny_json: "true" },
            { sti: "units.elkedel_gl.ancillary.mfrr_qualified", handling: "opret", ny_json: "true" },
            { sti: "balancing.ancillary_caps.per_unit_mw.elkedel_gl", handling: "opret", ny_json: "12.0" },
        ]));
    });

    it("Andebys egen blok med Andebys valg giver præcis Andebys blade (rundtur mod casen)", () => {
        const p = planlægBalancemarked(arkVaerk, {
            udgangspunkt: "andeby", enheder: ["vp_luft_vand"], loft: { vp_luft_vand: "6,0" },
            markedsloft: { vp_luft_vand: { afrr: "2,0", mfrr: "3,0" } }, reference: "vp_luft_vand",
        });
        expect(p.fejl).toEqual([]);
        expect(balancing(anvend(arkVaerk, p.ændringer))).toEqual(balancing(andeby));
        expect(p.felter.find((f) => f.sti === "balancing.method")?.kilde).toBe(`cases/andeby.yaml:${MODELSPEJL.cases.andeby.blade["balancing.method"][1]} @ ${KORT}`);
    });

    it("profil 4: referenceenheden er værkets egen og skal vælges blandt de valgte", () => {
        const uden = planlægBalancemarked(omdøbt, { udgangspunkt: "profil4", enheder: ["varmepumpe"], loft: { varmepumpe: "5,5" } });
        expect(uden.fejl.map((f) => f.sti)).toContain("balancing.reservation_gate.afrr.opportunity_cost.reference_unit");
        const med = planlægBalancemarked(omdøbt, { udgangspunkt: "profil4", enheder: ["varmepumpe"], loft: { varmepumpe: "5,5" }, reference: "varmepumpe" });
        expect(med.fejl).toEqual([]);
        const efter = anvend(omdøbt, med.ændringer);
        expect(efter.get("balancing.reservation_gate.afrr.opportunity_cost.reference_unit")).toBe('"varmepumpe"');
        expect(efter.get("balancing.reservation_gate.mfrr.opportunity_cost.reference_unit")).toBe('"varmepumpe"');
        expect(nyeFejl(validerVaerk(omdøbt), validerVaerk(efter))).toEqual([]);
        expect(planlægBalancemarked(omdøbt, { udgangspunkt: "profil4", enheder: ["varmepumpe"], loft: { varmepumpe: "5,5" }, reference: "elkedel_gl" }).fejl.length).toBe(1);
    });

    it.each([
        ["ingen enhed valgt", { enheder: [], loft: {} }, /mindst én/],
        ["et loft mangler", { enheder: ["varmepumpe"], loft: {} }, /loft/i],
        ["et loft kan ikke læses", { enheder: ["varmepumpe"], loft: { varmepumpe: "fem" } }, /tal/],
        ["en enhed, der ikke kan byde", { enheder: ["halmkedel"], loft: { halmkedel: "1" } }, /kan ikke byde/],
        ["en enhed, værket ikke har", { enheder: ["vp_luft_vand"], loft: { vp_luft_vand: "1" } }, /findes ikke/],
    ])("afviser: %s", (_n, v, tekst) => {
        const p = planlægBalancemarked(omdøbt, { udgangspunkt: "profil2", ...v });
        expect(p.fejl.map((f) => f.besked).join(" ")).toMatch(tekst);
    });

    it("tilbydes ikke, når værket allerede har en blok", () => {
        expect(harBalancemarked(andeby)).toBe(true);
        expect(harBalancemarked(arkVaerk)).toBe(false);
        expect(planlægBalancemarked(andeby, { udgangspunkt: "profil2", enheder: ["vp_luft_vand"], loft: { vp_luft_vand: "6" } }).fejl[0].besked).toMatch(/har allerede/);
    });

    it("en rettet eksempelværdi kodes med kildens type (500 forbliver heltal, 14 bliver 14.0)", () => {
        const p = planlægBalancemarked(omdøbt, {
            udgangspunkt: "profil2", enheder: ["varmepumpe"], loft: { varmepumpe: "5,5" },
            vaerdier: { "balancing.bid_strategy.up_markup_dkk_mwh": "300", "balancing.ancillary_caps.total_mw": "8" },
        });
        const efter = anvend(omdøbt, p.ændringer);
        expect(efter.get("balancing.bid_strategy.up_markup_dkk_mwh")).toBe("300");
        expect(efter.get("balancing.ancillary_caps.total_mw")).toBe("8.0");
    });

    it("hele blokken for et stort værk (17 enheder, 6 bydende) er én anmodning inden for grænsen", () => {
        const stort = new Map(omdøbt);
        const nye: string[] = [];
        for (let i = 1; i <= 9; i++) {
            const navn = i <= 5 ? `elkedel_nummer_${i}` : `kedel_nummer_${i}`;
            for (const æ of nyEnhed(i <= 5 ? "electric_boiler" : "biomass_boiler", navn, new Map()).ændringer) stort.set(æ.sti, æ.ny_json!);
            if (i <= 5) nye.push(navn);
        }
        expect(new Set([...stort.keys()].filter((s) => s.startsWith("units.")).map((s) => s.split(".")[1])).size).toBe(17);
        const enheder = ["varmepumpe", ...nye];
        const p = planlægBalancemarked(stort, { udgangspunkt: "andeby", enheder, loft: Object.fromEntries(enheder.map((e) => [e, "3"])), reference: "varmepumpe" });
        expect(p.fejl).toEqual([]);
        expect(anmodningsLængde(p.ændringer)).toBeLessThanOrEqual(MAKS_ANMODNING);
    });
});

describe("fjern balancemarkedet igen", () => {
    it("sletter hvert balancing-blad i én anmodning; værket er bagefter uden blok, og den kan lægges til igen", () => {
        const f = fjernBalancemarked(andeby);
        expect(f.ændringer.every((æ) => æ.handling === "slet")).toBe(true);
        expect(f.ændringer.map((æ) => æ.sti).sort()).toEqual([...balancing(andeby).keys()].sort());
        const efter = anvend(andeby, f.ændringer);
        expect(harBalancemarked(efter)).toBe(false);
        expect(nyeFejl(validerVaerk(andeby), validerVaerk(efter))).toEqual([]);
        const igen = planlægBalancemarked(efter, {
            udgangspunkt: "andeby", enheder: ["vp_luft_vand"], loft: { vp_luft_vand: "6,0" },
            markedsloft: { vp_luft_vand: { afrr: "2,0", mfrr: "3,0" } }, reference: "vp_luft_vand",
        });
        expect(anvend(efter, igen.ændringer)).toEqual(andeby);
    });
    it("intet at fjerne, når værket ingen blok har", () => {
        expect(fjernBalancemarked(arkVaerk).ændringer).toEqual([]);
    });
});

describe("tilføj et enkelt manglende felt", () => {
    const uden = new Map(andeby);
    uden.delete("units.fliskedel.ancillary.afrr_qualified");
    uden.delete("electricity.tariff_consumption_flat");
    uden.delete("units.halmkedel.min_uptime");
    uden.delete("units.fliskedel.commissioned");

    it("tilbyder katalogets felter, værket ikke har, med modellens standardværdi og kilde", () => {
        const k = manglendeFelter(uden, ["units"], "fliskedel");
        const afrr = k.find((x) => x.sti === "units.fliskedel.ancillary.afrr_qualified");
        // Kataloget: gælder kun el-enheder, men et værk kan have flaget på andre (Andeby har det på fliskedlen) —
        // det tilbydes kun for typer, kataloget siger det gælder for.
        expect(afrr).toBeUndefined();
        const kom = k.find((x) => x.sti === "units.fliskedel.commissioned");
        expect(kom?.standard_json).toBeNull();
        const halm = manglendeFelter(uden, ["units"], "halmkedel").find((x) => x.sti === "units.halmkedel.min_uptime");
        expect(halm?.standard_json).toBe("1");
        expect(halm?.standardKilde).toBe(`${findFelt("units.x.min_uptime")!.kilde} @ ${KORT}`);
        const el = manglendeFelter(uden, ["electricity", "grid"]).find((x) => x.sti === "electricity.tariff_consumption_flat");
        expect(el?.post.forklaring.length).toBeGreaterThan(10);
        expect(el?.standard_json).toBeNull();
    });

    it("tilbyder el-enhedens ancillary-felter med standard false", () => {
        const v = new Map(andeby);
        v.delete("units.elkedel_gl.ancillary.afrr_qualified");
        const k = manglendeFelter(v, ["units"], "elkedel_gl");
        const a = k.find((x) => x.sti === "units.elkedel_gl.ancillary.afrr_qualified");
        expect(a?.standard_json).toBe("false");
        expect(k.some((x) => x.sti === "units.elkedel_gl.ancillary.bid_window.months")).toBe(true);
        // Varmepumpens COP-kurve tilbydes ikke en elkedel; og et blad, værket har, tilbydes ikke.
        expect(k.some((x) => x.sti.includes("cop_curve"))).toBe(false);
        expect(k.some((x) => x.sti === "units.elkedel_gl.p_max_heat")).toBe(false);
    });

    it("tilbyder ikke et felt, hvis blok ikke findes, når blokkens tilstedeværelse ændrer regningen", () => {
        // cop_curve, tarifprofilen og nettab slår til, når blokken står der — et enkelt felt ville ændre regningen.
        const v = new Map([...andeby].filter(([s]) => !s.startsWith("units.vp_luft_vand.cop_curve.")));
        expect(manglendeFelter(v, ["units"], "vp_luft_vand").some((x) => x.sti.includes("cop_curve"))).toBe(false);
        const t = new Map([...andeby].filter(([s]) => !s.startsWith("electricity.tariff_consumption.")));
        expect(manglendeFelter(t, ["electricity"]).some((x) => x.sti.startsWith("electricity.tariff_consumption."))).toBe(false);
        // Balanceringens felter tilbydes ikke uden blok — dér bruges "Tilføj balancemarked".
        expect(manglendeFelter(arkVaerk, ["balancing"]).length).toBe(0);
        // Med blok: et manglende felt i den tilbydes.
        const b = new Map(andeby);
        b.delete("balancing.robust_reservation");
        expect(manglendeFelter(b, ["balancing"]).map((x) => x.sti)).toContain("balancing.robust_reservation");
    });

    it("opretter feltet som ét blad med katalogets type (standard 0.0 forbliver decimaltal)", () => {
        const v = new Map(andeby);
        v.delete("units.halmkedel.var_om");
        const k = manglendeFelter(v, ["units"], "halmkedel").find((x) => x.sti === "units.halmkedel.var_om")!;
        expect(k.standard_json).toBe("0.0");
        expect(tilfoejFelt(k, "0")).toEqual({ ændring: { sti: "units.halmkedel.var_om", handling: "opret", ny_json: "0.0" } });
        expect(tilfoejFelt(k, "").fejl).toMatch(/værdi/);
        expect(tilfoejFelt(k, "x").fejl).toBeTruthy();
    });
});

describe("advarsel: ingen enhed er tændt ved start", () => {
    const ucEnheder = (v: ReadonlyMap<string, string>) => [...v].filter(([s, x]) => /^units\.[^.]+\.uc_enabled$/.test(s) && x === "true").map(([s]) => s.split(".")[1]);
    it("Andeby har tændte enheder ved start: ingen advarsel", () => {
        expect(startAdvarsel(andeby)).toBeNull();
    });
    it("alle unit commitment-enheder står til slukket (som værksarket sætter dem): advarsel med enhederne og feltet", () => {
        const v = new Map(andeby);
        for (const n of ucEnheder(v)) v.set(`units.${n}.initial_status`, "0");
        const a = startAdvarsel(v)!;
        expect(a.enheder).toEqual(ucEnheder(andeby).filter((n) => v.get(`units.${n}.enabled`) !== "false"));
        expect(a.stier).toEqual(a.enheder.map((n) => `units.${n}.initial_status`));
        expect(a.tekst).toMatch(/uden tank/);
        // Brugertest r14 F18: feltets danske navn i teksten, ikke YAML-navnet (stien står ved hver enhed i kortet).
        expect(a.tekst).toContain(`«${findFelt("units.x.initial_status")!.etiket}»`);
        expect(a.tekst).not.toMatch(/initial_status|unit commitment/);
    });
    it("et manglende initial_status er modellens standard 1 (tændt)", () => {
        const v = new Map(andeby);
        // Den første TÆNDTE enhed med unit commitment (Andebys fliskedel er slået fra).
        const første = ucEnheder(v).find((n) => v.get(`units.${n}.enabled`) !== "false")!;
        const resten = ucEnheder(v).filter((n) => n !== første);
        for (const n of resten) v.set(`units.${n}.initial_status`, "0");
        v.delete(`units.${første}.initial_status`);
        expect(startAdvarsel(v)).toBeNull();
    });
    it("en slukket enhed tæller ikke, og et værk uden unit commitment får ingen advarsel", () => {
        const v = new Map(andeby);
        const [første, ...resten] = ucEnheder(v);
        for (const n of resten) v.set(`units.${n}.initial_status`, "0");
        v.set(`units.${første}.enabled`, "false");
        expect(startAdvarsel(v)?.enheder).toEqual(resten.filter((n) => v.get(`units.${n}.enabled`) !== "false"));
        const ingen = new Map([...andeby].map(([s, x]) => [s, /\.uc_enabled$/.test(s) ? "false" : /\.initial_status$/.test(s) ? "0" : x]));
        expect(startAdvarsel(ingen)).toBeNull();
    });
});
