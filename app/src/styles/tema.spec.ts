// Temasystemet (brief 22 §1): farvematematik, filformat, de bundtede temaer (0 brud), faldbagen i global.css,
// den private/offentlige opdeling og valget i browseren (URL, localStorage, blokeret lager).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { afstand, bland, kontrast, simuler } from "./farve";
import { afledte, ANDEL, BASISTEMA, css, cssErklaeringer, loes, maal, mangler, validerFil, type Tema, type TemaFil } from "./tema-kerne";

const filer = import.meta.glob<TemaFil>("./temaer/**/*.json", { eager: true, import: "default" });
const basis = loes(Object.values(filer).find((f) => f.id === BASISTEMA)!, undefined);
const temaer: [string, Tema][] = Object.entries(filer).map(([sti, f]) => [sti, f.id === BASISTEMA ? basis : loes(f, basis)]);

describe("farve", () => {
    it("måler WCAG-kontrast som specifikationen", () => {
        expect(kontrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
        expect(kontrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2); // kendt grænsegrå for AA
        expect(kontrast("#ffffff", "#767676")).toBe(kontrast("#767676", "#ffffff"));
    });
    it("lader gråtoner være grå under farveblindhed og samler rød/grøn", () => {
        expect(simuler("#808080", "deutan")).toBe("#808080");
        expect(afstand("#2e7d32", "#c62828", "deutan")).toBeLessThan(afstand("#2e7d32", "#c62828"));
    });
});

describe("temafilens format", () => {
    const gyldig = { id: "eget", navn: "Eget", beskrivelse: "x", lys: { primaer: "#123456" } };
    it("accepterer et tema, der kun angiver det, der adskiller det", () => {
        expect(validerFil(gyldig)).toEqual([]);
        const t = loes(gyldig, basis);
        expect(mangler(t)).toEqual([]);
        expect(t.lys.primaer).toBe("#123456");
        expect(t.lys.flade).toBe(basis.lys.flade);
    });
    it("afviser forkerte farver, ukendte nøgler og forkerte rækkelængder", () => {
        expect(validerFil({ ...gyldig, lys: { primaer: "blue" } }).join()).toMatch(/primaer skal være #rrggbb/);
        expect(validerFil({ ...gyldig, lys: { prmaer: "#123456" } }).join()).toMatch(/ukendt nøgle lys\.prmaer/);
        expect(validerFil({ ...gyldig, moerk: { serie: ["#111111"] } }).join()).toMatch(/serie skal være 8/);
        expect(validerFil({ ...gyldig, id: "Med Mellemrum" }).join()).toMatch(/"id"/);
    });
    it("lukker ikke CSS-injektion ind via skrift eller skygge", () => {
        expect(validerFil({ ...gyldig, skrift: { base: "x; } body { display:none" } }).join()).toMatch(/skrift\.base/);
        expect(validerFil({ ...gyldig, lys: { skygge_kort: "none; } * { x: y" } }).join()).toMatch(/skygge_kort/);
    });
    it("kræver kilder og en mærketekst, når temaet ikke er godkendt af organisationen", () => {
        // tjek_offentlig:ignorer — testen skal sætte flaget for at bevise, at valideringen kræver kilder og mærke.
        const f = validerFil({ ...gyldig, uofficielt: true }).join();
        expect(f).toMatch(/kilder/);
        expect(f).toMatch(/maerke/);
    });
    it("skriver tokens på de CSS-variabler, siderne læser", () => {
        const c = css(basis, "moerk");
        expect(c).toContain(`--dash-ink: ${basis.moerk.tekst}`);
        expect(c).toContain(`--fjv-serie-8: ${basis.moerk.serie[7]}`);
        expect(c).toContain("color-scheme: dark");
    });
});

// Codex K6 F10: scriptet målte tokens mod rene flader og kun nabo-serier — ikke de par, skærmen faktisk viser.
describe("F10: de faktiske farvepar", () => {
    const med = (lys: Partial<Tema["lys"]>) => loes({ id: "proeve", navn: "Prøve", beskrivelse: "x", lys }, basis);
    const detaljer = (t: Tema) => maal(t).filter((f) => f.modus === "lys" && f.niveau === "brud").map((f) => f.detalje).join("\n");

    it("måler statusmærkets tekst mod den blandede baggrund, CSS'en viser — ikke mod den rene flade", () => {
        // Codex' tilfælde var #007a80: 5,13:1 mod hvid, 4,48:1 mod 10 % af sig selv. Find et grænsetilfælde for den
        // tone, CSS'en faktisk bruger (ANDEL.maerke): består mod den rene flade, dumper mod den tonede.
        const graense = Array.from({ length: 80 }, (_, i) => `#00${(0x60 + i).toString(16)}${(0x66 + i).toString(16)}`)
            .find((c) => kontrast(c, "#ffffff") >= 4.5 && kontrast(c, bland(c, "#ffffff", ANDEL.maerke)) < 4.5)!;
        expect(graense).toBeDefined();
        expect(detaljer(med({ pos: graense, flade: "#ffffff" }))).toMatch(/pos på maerke_ok_bg/);
    });
    it("skriver de afledte farver som tokens, så CSS og måling bruger samme hex", () => {
        const a = afledte(basis.lys);
        expect(a.maerke_ok_bg).toBe(bland(basis.lys.pos, basis.lys.flade, ANDEL.maerke));
        expect(css(basis, "lys")).toContain(`--fjv-maerke-ok-bg: ${a.maerke_ok_bg}`);
        expect(css(basis, "lys")).toContain(`--fjv-knap-hover: ${a.knap_hover}`);
    });
    it("blander ikke farver bag tekst i layout.css (kun i skygger) — afledte farver kommer fra temaet", () => {
        const l = readFileSync(resolve(__dirname, "layout.css"), "utf8").split(/\r?\n/);
        const blandet = l.map((x, i) => [i + 1, x] as const).filter(([, x]) => x.includes("color-mix(") && !/^\s*box-shadow:|^\s*.*\{\s*box-shadow:/.test(x));
        expect(blandet.map(([n, x]) => `${n}: ${x.trim()}`)).toEqual([]);
    });
    it("måler farveblind-afstand mellem ALLE seriepar, ikke kun naboer", () => {
        const s = [...basis.lys.serie];
        s[5] = s[1]; // plads 2 og 6 ens — naboerne 5/6 og 6/7 kan godt være fine
        expect(detaljer(med({ serie: s }))).toMatch(/serie 2\/6 under protan\/deutan/);
    });
    it("måler seriefarven, som analysernes lagdelte flader viser den (opacity 0,85 over kortet)", () => {
        // grafer.tsx:448 tegner hver enheds flade med opacity 0,85. Codex' modprøve fandt 13 brud med den første nye palet.
        const s = [...basis.lys.serie];
        s[0] = Array.from({ length: 60 }, (_, i) => { const v = (0x70 + i).toString(16); return `#${v}${v}${v}`; })
            .find((c) => kontrast(c, "#ffffff") >= 3 && kontrast(bland(c, "#ffffff", ANDEL.graf_flade), "#ffffff") < 3)!;
        expect(detaljer(med({ serie: s, flade: "#ffffff" }))).toMatch(/serie\.0 som flade/);
    });
    it("måler \"øvrige\" mod hver serie — den står i samme graf", () => {
        expect(detaljer(med({ serie_oevrige: basis.lys.serie[3] }))).toMatch(/øvrige\/serie 4/);
    });
    it("dæmper ikke indhold med opacity — kun deaktiverede kontroller (WCAG 1.4.3-undtagelsen)", () => {
        // Analysernes røgtest-kort havde opacity 0,8: tekst_3 faldt til 3,6:1 i Nordisk/lys, uden for scriptets syn.
        // En opacity-tone på indhold laver par, intet token beskriver; derfor forbydes den frem for at blive målt.
        const css = (d: string): string[] => readdirSync(d, { withFileTypes: true })
            .flatMap((e) => e.isDirectory() ? css(join(d, e.name)) : e.name.endsWith(".css") ? [join(d, e.name)] : []);
        const brud: string[] = [];
        for (const fil of css(resolve(__dirname, ".."))) {
            readFileSync(fil, "utf8").split(/\r?\n/).forEach((linje, i) => {
                const m = /opacity:\s*([0-9.]+)/.exec(linje);
                if (!m || Number(m[1]) === 0 || Number(m[1]) >= 1) return;
                if (/:disabled|\[data-deaktiveret/.test(linje)) return;
                brud.push(`${fil.slice(fil.indexOf("src"))}:${i + 1}: ${linje.trim()}`);
            });
        }
        expect(brud).toEqual([]);
    });
});

describe("de bundtede temaer", () => {
    it.each(temaer)("%s er gyldigt og har 0 kontrast-/farveblindhedsbrud", (sti, t) => {
        expect(validerFil(filer[sti], sti)).toEqual([]);
        expect(mangler(t)).toEqual([]);
        expect(maal(t).filter((f) => f.niveau === "brud")).toEqual([]);
    });
    it("har mindst tre neutrale temaer uden for privat/ (den offentlige udgave)", () => {
        const offentlige = temaer.filter(([sti]) => !sti.includes("/privat/"));
        expect(offentlige.length).toBeGreaterThanOrEqual(3);
        expect(offentlige.every(([, t]) => !t.uofficielt)).toBe(true);
    });
    it("lægger ethvert tema efter en organisations profil (har kilder) i privat/ (lokalt, git-ignoreret)", () => {
        const organisation = temaer.filter(([, t]) => t.uofficielt || t.kilder.length > 0);
        for (const [sti] of organisation) expect(sti).toContain("/privat/");
    });
    it("har en faldbag i global.css, der er lig basistemaet i lys modus", () => {
        const g = readFileSync(resolve(__dirname, "../global.css"), "utf8");
        const forventet = new Map(cssErklaeringer(basis, "lys").map((d) => d.split(/:\s(.+)/).slice(0, 2) as [string, string]));
        let sammenlignet = 0;
        for (const [, navn, vaerdi] of g.matchAll(/(--(?:color|dash|fjv)-[\w-]+):\s*([^;]+);/g)) {
            if (!forventet.has(navn)) continue;
            expect(`${navn}: ${vaerdi.trim()}`).toBe(`${navn}: ${forventet.get(navn)}`);
            sammenlignet++;
        }
        expect(sammenlignet).toBeGreaterThan(40);
    });
});

describe("valget i browseren", () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        window.history.replaceState(null, "", "/");
        document.getElementById("fjv-tema")?.remove();
    });

    it("anvender standardtemaet ved import og skriver CSS-variablerne", async () => {
        const m = await import("./tema");
        expect(document.documentElement.dataset.tema).toBe(m.standardTema().id);
        expect(document.getElementById("fjv-tema")?.textContent).toContain("--dash-navy:");
    });
    it("husker valget i localStorage og ignorerer ukendte temaer", async () => {
        const m = await import("./tema");
        m.vaelgTema("varme");
        m.vaelgModus("moerk");
        expect(document.documentElement.dataset.tema).toBe("varme");
        expect(document.documentElement.dataset.modus).toBe("moerk");
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        expect(JSON.parse(localStorage.getItem("fjv.tema.v1")!)).toEqual({ tema: "varme", modus: "moerk" });
        m.vaelgTema("findes_ikke");
        expect(document.documentElement.dataset.tema).toBe("varme");
        vi.resetModules();
        await import("./tema");
        expect(document.documentElement.dataset.tema).toBe("varme");
    });
    it("lader URL'en vinde uden at gemme den, og forstår harnessens gamle ?tema=moerk", async () => {
        window.history.replaceState(null, "", "/?tema=papir&modus=moerk");
        await import("./tema");
        expect(document.documentElement.dataset.tema).toBe("papir");
        expect(document.documentElement.dataset.modus).toBe("moerk");
        expect(localStorage.getItem("fjv.tema.v1")).toBeNull();
        vi.resetModules();
        window.history.replaceState(null, "", "/?tema=moerk");
        const m = await import("./tema");
        expect(document.documentElement.dataset.modus).toBe("moerk");
        expect(document.documentElement.dataset.tema).toBe(m.standardTema().id);
    });
    it("virker, når lageret er blokeret", async () => {
        const laes = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
        const skriv = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("SecurityError"); });
        const m = await import("./tema");
        expect(() => m.vaelgTema("papir")).not.toThrow();
        expect(document.documentElement.dataset.tema).toBe("papir");
        laes.mockRestore(); skriv.mockRestore();
    });
});
