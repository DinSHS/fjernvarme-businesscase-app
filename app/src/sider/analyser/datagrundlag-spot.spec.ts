// Spotprisens fodnote i "Data i denne kørsel" følger kørslens FROSNE modelversion (som K7-F2 i balance-version.spec.ts).
// Modelrepoet 5021a5e (3/11-2026): på timeaksen midles kvarterpriserne (spot_paa_akse, src/data_loader.py:70-92 @ 90fb16e).
// Før tog loaderne timens første kvarter. En kørsel regnet ved b49aeb0 eller eef950a må ikke vises med den nye regel,
// og en ny kørsel ikke med den gamle.
import { describe, expect, it } from "vitest";
import type { Koersel, Profil } from "./beregn";
import { datagrundlag } from "./datagrundlag";

const B49 = "b49aeb0af097be42938b80a0fea6acdd77162836";
const EEF = "eef950a2ac7b3808a9456dcf48742ce08e52366a";
const NY = "90fb16eb1e2d5aa8e619b5a951b93760fa803985";

const koersel = (model_commit: string | null) =>
    ({ model_commit, data_commit: "106b9fce9a2e3610090b1a542559024056449b88", vaerk_revision: 1, antal_interval_model: 48 }) as unknown as Koersel;
const profil = (fra: string, til: string) => ({ periode_fra: fra, periode_til: til, oploesning: "1h" }) as unknown as Profil;
const VINTER = profil("2026-01-04T23:00:00Z", "2026-01-06T22:00:00Z");
const spot = (model_commit: string | null, p: Profil = VINTER) =>
    datagrundlag(koersel(model_commit), "Andeby", p, []).find((x) => x.etiket === "Spotpris")!;

describe("spotprisens fodnote følger kørslens modelversion (5021a5e)", () => {
    it("kørsel ved 90fb16e: middel af timens kvarterer", () => {
        expect(spot(NY).fodnote).toMatch(/middel af timens kvarter/);
        expect(spot(NY).fodnote).not.toMatch(/første kvarter/);
    });

    it("kørsler ved eef950a og b49aeb0: timens første kvarter, med versionen nævnt", () => {
        for (const c of [EEF, B49]) {
            expect(spot(c).fodnote).toMatch(/første kvarter/);
            expect(spot(c).fodnote).toMatch(/5021a5e/);
        }
    });

    it("ukendt modelversion: den gældende regel (pinnen), ikke den gamle", () => {
        expect(spot(null).fodnote).toMatch(/middel af timens kvarter/);
    });

    it("perioder, der slutter før 1. oktober 2025, har ingen fodnote (timepriser), uanset version", () => {
        const sommer = profil("2025-06-01T22:00:00Z", "2025-06-03T21:00:00Z");
        expect(spot(EEF, sommer).fodnote).toBeNull();
        expect(spot(NY, sommer).fodnote).toBeNull();
    });
});
