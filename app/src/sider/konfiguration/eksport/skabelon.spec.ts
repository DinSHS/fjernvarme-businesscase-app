// Runde 15: eksporten bundet til SELVE skabelonfilen (modelrepoets vaerksdata_skabelon.xlsx ved pinnen).
//
// Ved modelrepoets 939228a (v0.11.0) skiftede skabelonen to ting på én gang:
//  1. Priser-arket fik rækken `fyringsolie` (række 10), så CO2 og alt under den rykkede én række ned.
//  2. Filen er nu skrevet direkte af openpyxl (scripts/byg_skabelon.py), ikke gemt af LibreOffice: tekster står som
//     inlineStr, der er ingen xl/sharedStrings.xml, intet <printOptions>, r-navnerummet erklæres pr. <sheet>, og
//     styles.xml har 26 celleformater (før 27) — appens "vejledning" (25) og "forklaring" (26) lå på andre pladser.
// Fejlene, disse tests forhindrer: en pris skrevet i naboens række (CO2-prisen i fyringsoliens celle), et stilindeks,
// der ikke findes (Excel melder filen beskadiget), en <sheet> med et uerklæret r:-præfiks (filen kan ikke åbnes), og
// to valgte faner. Før fandt kun den tunge rundtur (tjek_eksport_rundtur.py) dem — eller slet ingen.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { eksporter, tomSkabelon } from "./eksporter";
import { BRAENDSEL_PR_TYPE, CO2_PR_MWH_BRAENDSEL, planlæg, PRISER_RAEKKER, type Eksportkilde } from "./kort";
import { STIL } from "./lag";
import { andeby, skabelon } from "./testdata";
import { læsCeller } from "./xlsx";

const NU = new Date(Date.UTC(2026, 10, 23, 12));
const tekst = (b: Uint8Array) => strFromU8(b);

// ------------------------------------------------------------------ styles.xml opløst til det, formatet ser ud som

interface Format { tal: string; fed: boolean; kursiv: boolean; størrelse: string; skrift: string | null; fyld: string | null; kant: boolean; ombryd: boolean; lodret: string }

function formater(styles: string): Format[] {
    const blok = (n: string) => new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(styles)![1];
    // Excel ser bort fra alfakanalen i en farve: LibreOffice skrev FFRRGGBB, openpyxl 00RRGGBB.
    const farve = (x: string, tag: string) => new RegExp(`<${tag} rgb="[0-9A-Fa-f]{2}([0-9A-Fa-f]{6})"`).exec(x)?.[1].toUpperCase() ?? null;
    const talformater = new Map<number, string>([[0, "General"], [2, "0.00"], [4, "#,##0.00"]]);
    for (const m of styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)) talformater.set(Number(m[1]), /y/i.test(m[2]) ? m[2].replace(/\\/g, "").toUpperCase() : m[2]);
    const til = (x: string, tag: string) => new RegExp(`<${tag}(?: val="(?:true|1)")?\\s*/>`).test(x);
    const skrifter = [...blok("fonts").matchAll(/<font>[\s\S]*?<\/font>/g)].map((m) => ({ fed: til(m[0], "b"), kursiv: til(m[0], "i"), størrelse: /<sz val="([\d.]+)"/.exec(m[0])![1], skrift: farve(m[0], "color") }));
    const fyld = [...blok("fills").matchAll(/<fill>[\s\S]*?<\/fill>/g)].map((m) => (/patternType="solid"/.test(m[0]) ? farve(m[0], "fgColor") : null));
    const kanter = [...blok("borders").matchAll(/<border\b[\s\S]*?<\/border>|<border\s*\/>/g)].map((m) => /style="thin"/.test(m[0]));
    return [...blok("cellXfs").matchAll(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => {
        const nr = (a: string) => Number(new RegExp(`\\b${a}="(\\d+)"`).exec(m[0])![1]);
        return { tal: talformater.get(nr("numFmtId")) ?? `?${nr("numFmtId")}`, ...skrifter[nr("fontId")], fyld: fyld[nr("fillId")], kant: kanter[nr("borderId")],
            ombryd: /wrapText="(true|1)"/.test(m[0]), lodret: /vertical="(\w+)"/.exec(m[0])?.[1] ?? "bottom" };
    });
}

const GUL = "FFFF00", MØRKEBLÅ = "1F3864", GRÅ_TEKST = "595959", BLÅ_TEKST = "0000FF";

describe("skabelonen ved pinnen: Priser-arkets rækker", () => {
    const pr = læsCeller(skabelon()).get("Priser")!;
    const A = (r: number) => String(pr.get(`A${r}`) ?? "");

    it("hver pris skrives i rækken med sin egen etiket (modelscriptet læser på etiketterne i kolonne A)", () => {
        expect(A(PRISER_RAEKKER.natural_gas)).toBe("naturgas");
        expect(A(PRISER_RAEKKER.straw)).toBe("halm");
        expect(A(PRISER_RAEKKER.flis)).toBe("flis");
        expect(A(PRISER_RAEKKER.waste_heat)).toBe("overskudsvarme");
        expect(A(PRISER_RAEKKER.fuel_oil)).toBe("fyringsolie");                       // ny ved 939228a
        expect(A(PRISER_RAEKKER.co2_eua)).toMatch(/^CO2/);
        expect(A(PRISER_RAEKKER.elafgift)).toMatch(/^elafgift/);
        expect(A(PRISER_RAEKKER.energinet)).toMatch(/^Energinet/);
        expect(A(PRISER_RAEKKER.dv)).toMatch(/^netselskabets drift/);
        expect(A(PRISER_RAEKKER.indfoedning)).toMatch(/^indfødningstarif/);
        expect(A(PRISER_RAEKKER.lavlast)).toBe("lavlast");
        expect(A(PRISER_RAEKKER.hoejlast)).toBe("højlast");
        expect(A(PRISER_RAEKKER.spidslast)).toBe("spidslast");
        expect(A(PRISER_RAEKKER.dmi)).toBe("nærmeste DMI-område");
        expect(A(PRISER_RAEKKER.priszone)).toBe("priszone");
        expect(A(PRISER_RAEKKER.navn)).toBe("værkets navn");
    });
    it("brændselsblokken slutter ved en tom række: dér indsættes træpiller, og intet brændsel i skabelonen mangler en plads", () => {
        expect(PRISER_RAEKKER.traepillerIndsat).toBe(PRISER_RAEKKER.co2_eua + 1);
        expect(pr.has(`A${PRISER_RAEKKER.traepillerIndsat}`)).toBe(false);
        // Hver række i blokken (fra overskriften "brændsel" til den tomme række) har en plads i eksportens tabel.
        const overskrift = [...pr.entries()].find(([k, v]) => /^A\d+$/.test(k) && v === "brændsel")![0];
        const første = Number(overskrift.slice(1)) + 1;
        const blok: number[] = [];
        for (let r = første; pr.has(`A${r}`); r++) blok.push(r);
        const kendte = [PRISER_RAEKKER.natural_gas, PRISER_RAEKKER.straw, PRISER_RAEKKER.flis, PRISER_RAEKKER.waste_heat, PRISER_RAEKKER.fuel_oil, PRISER_RAEKKER.co2_eua];
        expect(blok).toEqual([...kendte].sort((a, b) => a - b));
    });
    it("dropdowns for DMI-område og priszone står på de celler, eksporten skriver", () => {
        const xml = tekst(unzipSync(skabelon())["xl/worksheets/sheet5.xml"]);
        expect(xml).toMatch(new RegExp(`<dataValidation [^>]*sqref="B${PRISER_RAEKKER.dmi}"[^>]*errorTitle="DMI-omr`));
        expect(xml).toMatch(new RegExp(`<dataValidation [^>]*sqref="B${PRISER_RAEKKER.priszone}"[^>]*errorTitle="Priszone"`));
    });
});

describe("skabelonen ved pinnen: stilarterne, eksporten skriver med", () => {
    const fm = formater(tekst(unzipSync(skabelon())["xl/styles.xml"]));

    it("appens faner (lag.ts STIL): hvert indeks findes og ser ud som sit navn", () => {
        for (const [navn, nr] of Object.entries(STIL)) expect(nr, navn).toBeLessThan(fm.length);
        expect(fm[STIL.titel]).toMatchObject({ fed: true, størrelse: "14", skrift: MØRKEBLÅ, fyld: null });
        expect(fm[STIL.afsnit]).toMatchObject({ fed: true, størrelse: "11", skrift: MØRKEBLÅ });
        expect(fm[STIL.etiket]).toMatchObject({ fed: true, kursiv: false, størrelse: "10", fyld: null, kant: false });
        expect(fm[STIL.tekst]).toMatchObject({ fed: false, kursiv: false, ombryd: true, lodret: "top", kant: false, fyld: null });
        expect(fm[STIL.gul]).toMatchObject({ fyld: GUL, kant: true, skrift: BLÅ_TEKST, tal: "General" });           // "her skriver du"
        expect(fm[STIL.overskrift]).toMatchObject({ fed: true, fyld: MØRKEBLÅ, skrift: "FFFFFF", ombryd: true, kant: true });
        expect(fm[STIL.kopi]).toMatchObject({ fyld: null, kant: true, kursiv: false });                               // kant uden farve
        expect(fm[STIL.kontrol]).toMatchObject({ kursiv: true, skrift: GRÅ_TEKST, kant: true, ombryd: false, fyld: null });
        // De to, der lå på andre pladser i den LibreOffice-gemte skabelon (25 og 26):
        expect(fm[STIL.vejledning]).toMatchObject({ kursiv: true, skrift: GRÅ_TEKST, kant: false, ombryd: true, lodret: "top" });
        expect(fm[STIL.forklaring]).toMatchObject({ kursiv: true, skrift: GRÅ_TEKST, kant: true, ombryd: true, lodret: "top" });
    });
    it("modelrepoets faner (kort.ts): de faste indekser 1, 2, 4, 10, 11, 12, 15, 16, 22, 24", () => {
        expect(fm[2]).toMatchObject({ kursiv: true, skrift: GRÅ_TEKST, kant: false });
        expect(fm[10]).toMatchObject({ fyld: GUL, kant: true, tal: "General" });
        expect(fm[11]).toMatchObject({ fyld: GUL, kant: true, tal: "0.0" });
        expect(fm[15]).toMatchObject({ fyld: GUL, kant: true, tal: "YYYY-MM-DD HH:MM" });                             // tidsstempler
        expect(fm[16]).toMatchObject({ fyld: GUL, kant: true, tal: "0.00" });
        expect(fm[22]).toMatchObject({ fyld: null, kant: true, kursiv: false });
        expect(fm[24]).toMatchObject({ kursiv: true, kant: true });
    });
});

describe("den færdige arbejdsbog er gyldig med skabelonen ved pinnen", () => {
    const tilfælde = async (): Promise<[string, Uint8Array][]> => [
        ["Andeby", (await eksporter(andeby(), skabelon(), NU)).bytes],
        ["Andeby med træpiller", (await eksporter({ ...andeby(), blade: [...andeby().blade, { sti: "prices.wood_pellets.value", vaerdi_json: "250.0" }] }, skabelon(), NU)).bytes],
        ["tom skabelon med appens faner", tomSkabelon(skabelon())],
    ];
    const ark = (f: Record<string, Uint8Array>) => Object.keys(f).filter((s) => /^xl\/worksheets\/sheet\d+\.xml$/.test(s));

    it("hvert stilindeks i hvert ark findes i styles.xml", async () => {
        for (const [navn, bytes] of await tilfælde()) {
            const f = unzipSync(bytes);
            const antal = formater(tekst(f["xl/styles.xml"])).length;
            for (const s of ark(f)) {
                const brugt = [...tekst(f[s]).matchAll(/<c [^>]*\bs="(\d+)"/g)].map((m) => Number(m[1]));
                expect(Math.max(0, ...brugt), `${navn}: ${s}`).toBeLessThan(antal);
            }
        }
    });
    it("r:-præfikset er erklæret for hver <sheet> — også dem, appen tilføjer", async () => {
        for (const [navn, bytes] of await tilfælde()) {
            const wb = tekst(unzipSync(bytes)["xl/workbook.xml"]);
            const rod = /<workbook\b[^>]*>/.exec(wb)![0].includes("xmlns:r=");
            const faner = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => m[0]);
            expect(faner.length, navn).toBeGreaterThanOrEqual(9);
            for (const s of faner) expect(rod || s.includes("xmlns:r="), `${navn}: ${s}`).toBe(true);
        }
    });
    it("hver XML-del er velformet (også med navnerum)", () => {
        // Den tomme skabelon har alle appens faner og ingen 8.760 timers serie: DOMParser er langsom på store ark.
        for (const [sti, b] of Object.entries(unzipSync(tomSkabelon(skabelon())))) {
            if (!/\.(xml|rels)$/.test(sti)) continue;
            const d = new DOMParser().parseFromString(tekst(b), "application/xml");
            expect(d.getElementsByTagName("parsererror").length, sti).toBe(0);
        }
        // Modprøve: et uerklæret præfiks (fejlen, en tilføjet <sheet r:id=…> uden xmlns:r ville give) fanges af læseren.
        const galt = new DOMParser().parseFromString('<workbook xmlns="x"><sheets><sheet name="a" r:id="rId1"/></sheets></workbook>', "application/xml");
        expect(galt.getElementsByTagName("parsererror").length).toBe(1);
    }, 30_000);
    it("præcis én fane er valgt: Læs først, som står forrest", async () => {
        for (const [navn, bytes] of await tilfælde()) {
            const f = unzipSync(bytes);
            const valgte = ark(f).filter((s) => /\btabSelected="(true|1)"/.test(tekst(f[s])));
            expect(valgte.length, navn).toBe(1);
            const wb = tekst(f["xl/workbook.xml"]);
            expect(/<sheets>\s*<sheet [^>]*name="Læs først"/.test(wb), navn).toBe(true);
            const c = læsCeller(bytes);
            expect([...c.keys()][0], navn).toBe("Læs først");
        }
    });
    it("flet og dropdowns i appens faner står i regnearkets rækkefølge: efter cellerne, før sidemargener", async () => {
        for (const [navn, bytes] of await tilfælde()) {
            const f = unzipSync(bytes);
            for (const s of ark(f)) {
                const x = tekst(f[s]);
                const pos = ["</sheetData>", "<mergeCells", "<dataValidations", "<printOptions", "<pageMargins"].map((t) => x.indexOf(t)).filter((p) => p >= 0);
                expect(pos, `${navn}: ${s}`).toEqual([...pos].sort((a, b) => a - b));
                expect(x.indexOf("<pageMargins"), `${navn}: ${s}`).toBeGreaterThan(0);
            }
        }
    });
    it("det, eksporten ikke skriver i, er skabelonens egne bytes", async () => {
        const før = unzipSync(skabelon());
        const efter = unzipSync((await eksporter(andeby(), skabelon(), NU)).bytes);
        const urørt = Object.keys(før).filter((s) => !/^xl\/worksheets\//.test(s) && !["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "[Content_Types].xml"].includes(s));
        expect(urørt).toEqual(expect.arrayContaining(["xl/styles.xml", "xl/theme/theme1.xml", "docProps/core.xml"]));
        for (const s of urørt) expect(tekst(efter[s]), s).toBe(tekst(før[s]));
        // Vejledning skrives der aldrig i.
        expect(tekst(efter["xl/worksheets/sheet1.xml"]).replace(/\btabSelected="(true|1)"/, 'tabSelected="false"'))
            .toBe(tekst(før["xl/worksheets/sheet1.xml"]).replace(/\btabSelected="(true|1)"/, 'tabSelected="false"'));
    });
    it("Andebys priser står i de rigtige rækker — CO2-prisen ikke i fyringsoliens celle", async () => {
        const pr = læsCeller((await eksporter(andeby(), skabelon(), NU)).bytes).get("Priser")!;
        expect(pr.get(`B${PRISER_RAEKKER.natural_gas}`)).toBe(606);
        expect(pr.has(`B${PRISER_RAEKKER.fuel_oil}`)).toBe(false);                    // Andeby har ingen oliepris
        expect(pr.get(`B${PRISER_RAEKKER.co2_eua}`)).toBe(600);
        expect(pr.get(`B${PRISER_RAEKKER.elafgift}`)).toBe(4);
        expect(pr.get(`B${PRISER_RAEKKER.dmi}`)).toBe("karup");
        expect(pr.get(`B${PRISER_RAEKKER.priszone}`)).toBe("DK1");
        expect(pr.get(`B${PRISER_RAEKKER.navn}`)).toBe("Andeby — fiktivt referenceværk");
    });
});

// ------------------------------------------------------------------ oliekedlen (modelrepoets 939228a)

describe("oliekedlen i værksarket", () => {
    /** Andeby med en oliekedel på 6 MW; `ekstra` retter eller tilføjer blade (null = bladet er ikke med). */
    const medOlie = (ekstra: Record<string, string | null> = {}): Eksportkilde => {
        const k = andeby();
        const nye: Record<string, string | null> = {
            "units.oliekedel.enabled": "true", "units.oliekedel.type": '"oil_boiler"', "units.oliekedel.p_max_heat": "6.0", "units.oliekedel.p_min_heat": "0.0",
            "units.oliekedel.alpha": "0.0", "units.oliekedel.fuel": '"fuel_oil"', "units.oliekedel.eta_fuel_to_heat": "0.9", "units.oliekedel.var_om": "30.0",
            "units.oliekedel.start_cost": "500.0", "units.oliekedel.min_uptime": "1", "units.oliekedel.min_downtime": "1", "units.oliekedel.uc_enabled": "false",
            "units.oliekedel.co2_emissions_per_mwh_fuel": "0.266", "prices.fuel_oil.value": "900.0", "prices.fuel_oil.unit": '"DKK/MWh_fuel"', ...ekstra,
        };
        const rettet = k.blade.filter((b) => nye[b.sti] !== null).map((b) => ({ ...b, vaerdi_json: nye[b.sti] ?? b.vaerdi_json }));
        const kendte = new Set(k.blade.map((b) => b.sti));
        return { ...k, blade: [...rettet, ...Object.entries(nye).filter(([s, v]) => v !== null && !kendte.has(s)).map(([sti, v], j) => ({ sti, vaerdi_json: v as string, raekkefoelge: 20_000 + j }))] };
    };

    it("eksportens tabeller over typer, brændsler og CO₂-faktorer er modelscriptets egne (modelspejlet)", () => {
        const vt = (JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../../viden/modelspejl.json"), "utf8")) as
            { vaerksark_typer: { braendsel_pr_type: Record<string, string | null>; co2_pr_mwh_braendsel: Record<string, number> } }).vaerksark_typer;
        expect(BRAENDSEL_PR_TYPE).toEqual(vt.braendsel_pr_type);
        expect(CO2_PR_MWH_BRAENDSEL).toEqual(vt.co2_pr_mwh_braendsel);
        expect(BRAENDSEL_PR_TYPE.oil_boiler).toBe("fuel_oil");
        expect(CO2_PR_MWH_BRAENDSEL.oil_boiler).toBe(0.266);
    });
    it("står i Anlaeg med typen oil_boiler, og olieprisen står i fyringsoliens række", async () => {
        const k = medOlie();
        const p = planlæg(k);
        expect(p.nægter).toEqual([]);
        expect(p.ikkeMed.filter((t) => t.sti.includes("oliekedel") || t.sti.includes("fuel_oil"))).toEqual([]);
        const c = læsCeller((await eksporter(k, skabelon(), NU)).bytes);
        const an = c.get("Anlaeg")!, pr = c.get("Priser")!;
        const r = [...an.entries()].find(([ref, v]) => /^A\d+$/.test(ref) && v === "oliekedel")![0].slice(1);
        expect([an.get(`B${r}`), an.get(`C${r}`), an.get(`E${r}`)]).toEqual(["oil_boiler", 6, 0.9]);
        expect(pr.get(`A${PRISER_RAEKKER.fuel_oil}`)).toBe("fyringsolie");
        expect(pr.get(`B${PRISER_RAEKKER.fuel_oil}`)).toBe(900);
        expect(pr.get(`B${PRISER_RAEKKER.co2_eua}`)).toBe(600);
    });
    it("forudsiger modelscriptets læsning: fuel_oil, CO₂-faktor 0,266 og prisen pr. MWh brændsel", () => {
        const p = planlæg(medOlie());
        expect(p.forventet.get("units.oliekedel.type")).toBe('"oil_boiler"');
        expect(p.forventet.get("units.oliekedel.fuel")).toBe('"fuel_oil"');
        expect(p.forventet.get("units.oliekedel.co2_emissions_per_mwh_fuel")).toBe("0.266");
        expect(p.forventet.get("units.oliekedel.alpha")).toBe("0.0");
        expect(p.forventet.get("prices.fuel_oil.value")).toBe("900.0");
        expect(p.forventet.get("prices.fuel_oil.unit")).toBe('"DKK/MWh_fuel"');
        // Værket efter import (scriptets læsning + appens faner) er værket selv.
        expect(p.endelig.get("units.oliekedel.co2_emissions_per_mwh_fuel")).toBe("0.266");
    });
    it("tung fuelolie (0,28 t/MWh) bæres af fanen Start og drift, for scriptet sætter altid 0,266", () => {
        const p = planlæg(medOlie({ "units.oliekedel.co2_emissions_per_mwh_fuel": "0.28" }));
        expect(p.nægter).toEqual([]);
        expect(p.forventet.get("units.oliekedel.co2_emissions_per_mwh_fuel")).toBe("0.266");
        expect(p.endelig.get("units.oliekedel.co2_emissions_per_mwh_fuel")).toBe("0.28");
        expect(p.ikkeMed.filter((t) => t.sti.includes("oliekedel"))).toEqual([]);
    });
    it("uden oliepris nægter eksporten — modelscriptet ville stoppe på rækken", async () => {
        const k = medOlie({ "prices.fuel_oil.value": null, "prices.fuel_oil.unit": null });
        expect(planlæg(k).nægter.join(" ")).toMatch(/Oliekedlen oliekedel kræver en pris for fyringsolie på arket Priser/);
        await expect(eksporter(k, skabelon(), NU)).rejects.toThrow(/kan ikke eksporteres/);
    });
    it("uden CO₂-pris nægter eksporten, som for en gasenhed", () => {
        const uden = medOlie({ "prices.co2_eua.value": null, "prices.co2_eua.unit": null });
        // Andebys gasenheder rammes først; uden dem er det oliekedlen, der kræver CO2-prisen.
        const kunOlie = { ...uden, blade: uden.blade.filter((b) => !/^units\.(gasmotor|gaskedel_agg)\./.test(b.sti)) };
        expect(planlæg(kunOlie).nægter.join(" ")).toMatch(/Oliekedlen oliekedel kræver en CO2-pris på arket Priser/);
    });
});
