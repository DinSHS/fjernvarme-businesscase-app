// Fagligt review (fv-ekspert 2026-10-16 09:30, K1–K6): hvert fund låst af en test mod de rigtige værker.
// Tallene er fv-eksperts, efterregnet mod modelrepoet @ b49aeb0 (kildelinjer i hver test).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { læsFixture } from "./fixture-vaerker";
import { enhed, grupper, opslag } from "./gruppering";
import { laesTarif } from "./tarif";
import { validerVaerk } from "./validering";
import { effektTekst, enhederBudskab, varmelastBudskab } from "./budskaber";
import { BRAENDSEL, findFelt } from "./katalog";
import { FELTER } from "./katalog.data";

const fx = læsFixture();
const vaerk = (kode: string) => fx.blade.get(fx.vaerker.find((v) => v.kode === kode)!.id)!;
const andeby = opslag(vaerk("andeby"));
const enheder = grupper(vaerk("andeby")).efterId("enheder").objekter.map(enhed);
const VIDEN = resolve(import.meta.dirname, "../../../../viden");

describe("K1 (Høj) — faste tillæg uden elafgift_net (src/tariff.py:165-184)", () => {
    const t = laesTarif(andeby);
    it("faste tillæg = 115 kr./MWh (energinet 115 + dv 0), ikke 119", () => {
        expect(t.faste.map((f) => f.navn).sort()).toEqual(["dv", "elafgift_net", "energinet"]);
        expect(t.fastSum).toBe(115);
    });
    it("en lavlasttime er 122,4 kr./MWh, med elafgift 126,4 (src/tariff.py:14-19)", () => {
        expect(t.billigsteTime).toBeCloseTo(122.4, 10);
        expect(t.billigsteTime! + t.elafgift!).toBeCloseTo(126.4, 10);
    });
    it("summen ændres ikke af elafgift_net's værdi (den er kun dokumentation)", () => {
        const m = new Map(andeby);
        m.set("electricity.tariff_consumption.fixed_components.elafgift_net", "400.0");
        expect(laesTarif(m).fastSum).toBe(115);
    });
});

describe("K2 (Høj) — kun el-enheder byder i balancemarkedet (doc/BALANCEMARKED.md:7-8)", () => {
    it("gasmotorens flag tæller ikke; slukket elkedel tæller ikke", () => {
        const byder = enheder.filter((e) => e.til && e.kanByde).map((e) => e.navn);
        expect(byder).toEqual(["vp_luft_vand", "elkedel_ny"]);
        const gm = enheder.find((e) => e.navn === "gasmotor")!;
        expect(gm.afrr && gm.mfrr && !gm.kanByde).toBe(true);
    });
    it("budskabet navngiver de to el-enheder og siger at gasmotorens flag ikke virker", () => {
        expect(enhederBudskab(enheder)).toBe(
            "6 af 8 enheder er slået til: 51 MW styrbar varme + 22 MW solvarme (profilbundet); "
            + "2 el-enheder kan byde i balancemarkedet (vp_luft_vand, elkedel_ny); aFRR/mFRR-flaget på gasmotor har ingen virkning.",
        );
    });
});

describe("K3 (Middel) — aktiveringsmodel uden activation_value er en FEJL i værket (src/config.py:1067-1071)", () => {
    const legacy = () => { const m = new Map(andeby); m.set("balancing.method", '"legacy"'); m.delete("balancing.bid_strategy.up_markup_dkk_mwh"); return m; };
    it("foresight ≠ realized og model ≠ clear med metode legacy giver fejl, ikke advarsel", () => {
        const f = validerVaerk(legacy()).filter((x) => /kræver balancing\.method='activation_value'/.test(x.besked));
        expect(f.map((x) => [x.alvor, x.sti])).toEqual(expect.arrayContaining([
            ["fejl", "balancing.activation.foresight"], ["fejl", "balancing.activation.afrr.model"],
        ]));
        expect(f.every((x) => x.alvor === "fejl")).toBe(true);
    });
    it("med realized/clear er legacy i orden", () => {
        const m = legacy();
        m.set("balancing.activation.foresight", '"realized"');
        m.set("balancing.activation.afrr.model", '"clear"');
        m.set("balancing.activation.mfrr.model", '"clear"');
        expect(validerVaerk(m).filter((x) => x.sti.startsWith("balancing.activation"))).toEqual([]);
    });
    it("de 7 importerede værker har stadig ingen fejl", () => {
        for (const v of fx.vaerker) expect(validerVaerk(opslag(fx.blade.get(v.id)!)).filter((x) => x.alvor === "fejl"), v.kode).toEqual([]);
    });
});

describe("K4 (Middel) — solvarmens nameplate er ikke styrbar effekt", () => {
    it("51 MW styrbar + 22 MW solvarme (profilbundet), ikke 73 MW", () => {
        expect(effektTekst(enheder.filter((e) => e.til))).toBe("51 MW styrbar varme + 22 MW solvarme (profilbundet)");
        expect(enheder.filter((e) => e.profil).map((e) => e.navn)).toEqual(["solvarme"]);
    });
    it("et værk uden solvarme nævner ingen profilbunden effekt", () => {
        expect(effektTekst(enheder.filter((e) => e.til && !e.profil))).toBe("51 MW styrbar varme");
    });
});

describe("K5 (Lav) — grundprofilen er på UTC-aksen (src/data_loader.py:712-727)", () => {
    it("budskabet siger UTC, og kataloget forklarer det", () => {
        expect(varmelastBudskab(andeby)).toMatch(/topper kl\. 07 UTC\./);
        expect(findFelt("heat_load_params.baseline_profile_mw")?.forklaring).toMatch(/i UTC/);
    });
});

describe("K6 (Lav) — brændselsnavne og katalog fra viden/, ikke egen kopi", () => {
    it("BRAENDSEL er viden/enhedstyper.json → braendselsnavne", () => {
        const e = JSON.parse(readFileSync(resolve(VIDEN, "enhedstyper.json"), "utf8"));
        expect(BRAENDSEL).toEqual(e.braendselsnavne);
    });
    it("katalog.data.ts er genereret af den nuværende viden/felt_katalog.json (ellers: kør _byg/byg_katalog.py)", () => {
        const k = JSON.parse(readFileSync(resolve(VIDEN, "felt_katalog.json"), "utf8"));
        expect(FELTER).toEqual(k.felter);
    });
});
