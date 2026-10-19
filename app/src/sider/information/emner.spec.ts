import { describe, expect, it } from "vitest";
import { byggEmner, emneFraId, gruppeInddelt, type EmneManifest } from "./emner";

const rå = (import.meta.glob("../dokumentation/indhold/viden/emner.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["../dokumentation/indhold/viden/emner.json"];
const manifest = JSON.parse(rå) as EmneManifest;
const filer = Object.keys(import.meta.glob("../dokumentation/indhold/viden/information/*.md", { query: "?raw" })).map((k) => k.split("/").pop()!);

describe("emner", () => {
    const emner = byggEmner(manifest);
    it("hver nummereret tekst har et emne, og ingen er i 'Øvrige emner' (så kender planen dem alle)", () => {
        expect(manifest.emner.map((e) => e.fil.split("/").pop()!).sort()).toEqual([...filer].sort());
        expect(emner.filter((e) => e.gruppe === "Øvrige emner").map((e) => e.id)).toEqual([]);
        expect(emner.length).toBe(manifest.emner.length + 2);
    });
    it("id'et er filnavnet uden nummer, titlen er tekstens første overskrift", () => {
        expect(emneFraId(emner, "fabric-og-kapacitet")?.fil).toBe("viden/information/11_fabric_og_kapacitet.md");
        expect(emneFraId(emner, "solvergab")?.titel).toBe("Solvergab");
    });
    it("grupper i fast rækkefølge; opslag sidst", () => {
        expect(gruppeInddelt(emner).map((g) => g.gruppe)).toEqual(["Metoden", "Balancemarkedet", "Værket og tallene", "Opslag"]);
        expect(emner[emner.length - 1].id).toBe("begraensninger");
    });
    it("'Hvilke data skal med?' (data.md, uden nummer) står i 'Værket og tallene' lige efter tanken", () => {
        const med = byggEmner({ ...manifest, emner: [...manifest.emner, { nr: 1013, id: "data", fil: "information/data.md", titel: "Hvilke data skal med?" }] });
        const ider = med.filter((e) => e.gruppe === "Værket og tallene").map((e) => e.id);
        expect(ider.slice(0, 3)).toEqual(["varmelast-og-nettab", "tanken", "data"]);
        expect(emneFraId(med, "data")).toMatchObject({ titel: "Hvilke data skal med?", fil: "viden/information/data.md", gruppe: "Værket og tallene" });
        expect(med.filter((e) => e.gruppe === "Øvrige emner")).toEqual([]);
    });
    it("når data.md er bundtet, ligger den i manifestet og får en side (ikke et hul i navigationen)", () => {
        if (!manifest.emner.some((e) => e.id === "data")) return; // fv-data's tekst er endnu ikke leveret
        const e = emneFraId(emner, "data");
        expect(e?.gruppe).toBe("Værket og tallene");
        expect(filer).toContain("data.md");
    });
    it("et nyt, ukendt emne havner i 'Øvrige emner' efter opslagene — og forsvinder ikke", () => {
        const nyt = byggEmner({ ...manifest, emner: [...manifest.emner, { nr: 99, id: "nyt-emne", fil: "information/99_nyt_emne.md", titel: "Nyt" }] });
        expect(nyt[nyt.length - 1]).toMatchObject({ id: "nyt-emne", gruppe: "Øvrige emner" });
    });
});
