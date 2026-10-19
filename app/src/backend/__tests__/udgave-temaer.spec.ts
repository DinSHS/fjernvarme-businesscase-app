// Standardtemaet pr. udgave. Fabric-udgaven indlæser de LOKALE temaer (src/styles/temaer/privat/, git-ignoreret) og lader det med højest
// `standard` være standard; findes ingen, er Nordisk standard. Community-udgaven har kun de neutrale. Køres af gaten med både
// VITE_BACKEND=rayfin og rest. Testen kender ingen organisations navne: den læser de lokale temaer, der faktisk ligger i mappen.
import { describe, expect, it } from "vitest";
import { BACKEND } from "@/backend/data";
import { alleTemaer, standardTema } from "@/styles/tema";

const lokale = Object.values(import.meta.glob<{ id: string; standard?: number }>("../../styles/temaer/privat/*.json", { eager: true, import: "default" }));
const NEUTRALE = ["nordisk", "varme", "hoej_kontrast", "papir"];

describe(`temaer i ${BACKEND}-udgaven`, () => {
    it.runIf(BACKEND === "rayfin")("Fabric: de lokale temaer findes, og det med højest standard er standard (ellers Nordisk)", () => {
        const ids = alleTemaer().map((t) => t.id);
        for (const t of lokale) expect(ids).toContain(t.id);
        const forventet = lokale.length ? [...lokale].sort((a, b) => (b.standard ?? 0) - (a.standard ?? 0))[0] : undefined;
        if (forventet && (forventet.standard ?? 0) > 0) expect(standardTema().id).toBe(forventet.id);
        else expect(standardTema().id).toBe("nordisk");
    });
    it.runIf(BACKEND === "rest")("community: ingen lokale temaer; Nordisk er standard", () => {
        const ids = alleTemaer().map((t) => t.id);
        for (const t of lokale) expect(ids).not.toContain(t.id);
        expect(standardTema().id).toBe("nordisk");
    });
    it("de neutrale temaer findes i begge", () => {
        const ids = alleTemaer().map((t) => t.id);
        for (const id of NEUTRALE) expect(ids).toContain(id);
    });
});
