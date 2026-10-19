import { describe, expect, it } from "vitest";
import { gabProcent, gabTekst } from "./tal";

describe("solvergab i tekst", () => {
    it("brøk -> procent uden afsluttende nuller", () => {
        expect(gabProcent(0.0002)).toBe("0,02 %");
        expect(gabProcent(0.005)).toBe("0,5 %");
        expect(gabProcent(0.001)).toBe("0,1 %");
        expect(gabProcent(0.000501)).toBe("0,0501 %");
    });
    it("begge gab, eller det ene, eller ingen", () => {
        expect(gabTekst(0.005, 5000)).toBe("0,5 % og 5.000 kr.");
        expect(gabTekst(null, 100)).toBe("100 kr.");
        expect(gabTekst(null, null)).toBe("ikke oplyst");
    });
});
