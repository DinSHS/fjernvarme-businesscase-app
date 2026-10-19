import { describe, expect, it } from "vitest";
import type { FjvSchema } from "../../../rayfin/data/schema";
import { dageTilUdloeb, koeoversigt, udloebsTekst, versioner } from "./drift";

type Koersel = FjvSchema["Koersel"];
const k = (o: Partial<Koersel>) => o as Koersel;

describe("prøvekapacitet", () => {
    it("tæller døgn til 7. december 2026", () => {
        expect(dageTilUdloeb(new Date("2026-10-16T08:00:00Z"))).toBe(52);
        expect(udloebsTekst(new Date("2026-10-16T08:00:00Z"))).toBe("Prøvekapaciteten udløber om 52 dage (omkring 7. december 2026).");
    });
    it("i morgen, i dag og udløbet", () => {
        expect(udloebsTekst(new Date("2026-12-06T00:00:00Z"))).toMatch(/i morgen/);
        expect(udloebsTekst(new Date("2026-12-07T00:00:00Z"))).toMatch(/i dag/);
        expect(udloebsTekst(new Date("2026-12-09T00:00:00Z"))).toMatch(/udløb for 2 dage siden.*kan ikke regnes/);
    });
});

describe("versioner og kø", () => {
    it("grupperer på modelcommit + df-data-commit, nyeste først, og springer kørsler uden versioner over", () => {
        const v = versioner([
            k({ model_commit: "b49aeb0aaa", data_commit: "392992caaa", afsluttet: new Date("2026-10-16T07:00:00Z") }),
            k({ model_commit: "b49aeb0aaa", data_commit: "392992caaa", afsluttet: new Date("2026-10-16T08:00:00Z") }),
            k({ model_commit: "b49aeb0aaa", data_commit: "ffffffbbb", afsluttet: new Date("2026-10-20T08:00:00Z") }),
            k({ status: "koe" }),
        ]);
        expect(v.map((x) => [x.data, x.antal])).toEqual([["ffffffbbb", 1], ["392992caaa", 2]]);
    });
    it("én kører, resten venter — startet og indlæser tæller som kørende", () => {
        expect(koeoversigt([k({ status: "koerer" }), k({ status: "koe" }), k({ status: "koe" }), k({ status: "faerdig" }), k({ status: "indlaeser" })]))
            .toEqual({ regner: 2, venter: 2 });
    });
});
