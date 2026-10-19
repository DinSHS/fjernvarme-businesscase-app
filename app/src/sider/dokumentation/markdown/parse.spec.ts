import { describe, expect, it } from "vitest";
import { inlineTekst, linksI, ordAnker, overskriftsAnker, overskrifter, parsInline, parsMarkdown, laesetid, type Blok, type Inline } from "./parse";
import { normaliserSti, omskrivLink } from "./links";
import { DOKUMENTER } from "../dokumenter";

const tekster = import.meta.glob("../indhold/**/*.{md,txt}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const tekstAf = (rel: string) => {
    const t = tekster[`../indhold/${rel}`];
    if (t === undefined) throw new Error(`Mangler ../indhold/${rel}`);
    return t;
};

describe("anker", () => {
    it("følger GitHubs regel for overskrifter", () => {
        expect(overskriftsAnker("3. El: spot, tarif og afgift")).toBe("3-el-spot-tarif-og-afgift");
        expect(overskriftsAnker("Fiktivt 2026-marked (scenarie)")).toBe("fiktivt-2026-marked-scenarie");
        expect(overskriftsAnker("Helår og løsetid")).toBe("helår-og-løsetid");
    });
    it("ordliste-anker: små bogstaver, mellemrum og _ bliver -, tegnsætning væk, æøå og Δ bevares", () => {
        expect(ordAnker("aFRR")).toBe("afrr");
        expect(ordAnker("Spor A")).toBe("spor-a");
        expect(ordAnker("CM-pris")).toBe("cm-pris");
        expect(ordAnker("D&V")).toBe("dv");
        expect(ordAnker("var_om")).toBe("var-om");
        expect(ordAnker("Månedsloft")).toBe("månedsloft");
        expect(ordAnker("ΔT")).toBe("δt");
        expect(ordAnker("  Ab   værk ")).toBe("ab-værk");
    });
});

describe("inline", () => {
    it("fed, kursiv og kode kan indlejres", () => {
        const n = parsInline("**fed *kursiv* og `kode`** og _kursiv_");
        expect(n[0]).toMatchObject({ t: "fed" });
        expect(inlineTekst(n)).toBe("fed kursiv og kode og kursiv");
    });
    it("understregning midt i et ord er ikke kursiv", () => {
        expect(inlineTekst(parsInline("heat_load_params_* og var_om"))).toBe("heat_load_params_* og var_om");
        expect(parsInline("heat_load_params_*").every((n) => n.t === "tekst")).toBe(true);
    });
    it("et enkelt * uden lukning er bare tekst", () => {
        expect(parsInline("2 * 3 = 6 og 5 *")).toEqual([{ t: "tekst", v: "2 * 3 = 6 og 5 *" }]);
    });
    it("kode skærmer for markup, og flugtede tegn vises", () => {
        expect(parsInline("`**ikke fed**` og \\*ikke kursiv\\*")).toEqual([
            { t: "kode", v: "**ikke fed**" }, { t: "tekst", v: " og *ikke kursiv*" },
        ]);
    });
    it("links, autolinks og bare adresser", () => {
        const n = parsInline("se [README](README.md#a) og <https://x.dk/a> og https://y.dk/b.");
        const hrefs = n.filter((x): x is Extract<Inline, { t: "link" }> => x.t === "link").map((x) => x.href);
        expect(hrefs).toEqual(["README.md#a", "https://x.dk/a", "https://y.dk/b"]);
    });
    it("rå HTML bliver tekst, aldrig markup", () => {
        const n = parsInline("<script>alert(1)</script> og <b>fed</b>");
        expect(n.every((x) => x.t === "tekst")).toBe(true);
        expect(inlineTekst(n)).toBe("<script>alert(1)</script> og <b>fed</b>");
    });
    it("javascript:-links bevares i træet (renderen/omskriveren afgør) men er aldrig 'intern'", () => {
        const r = omskrivLink("javascript:alert(1)", { rute: "dokumentation/x", mappe: "" });
        expect(r.ekstern).toBe(true);
    });
});

describe("blokke", () => {
    it("overskrifter får unikke ankre", () => {
        const b = parsMarkdown("## A\n\n## A\n\n## A\n");
        expect(overskrifter(b).map((o) => o.id)).toEqual(["a", "a-1", "a-2"]);
    });
    it("tabel med justering og tomme celler", () => {
        const b = parsMarkdown("| Navn | Tal |\n|:--|--:|\n| a | 1 |\n| b |\n");
        const t = b[0] as Extract<Blok, { t: "tabel" }>;
        expect(t.t).toBe("tabel");
        expect(t.just).toEqual(["venstre", "hojre"]);
        expect(t.raekker).toHaveLength(2);
        expect(t.raekker[1]).toHaveLength(2);
    });
    it("kodeblok bevarer indhold uændret, også tegn der ligner markdown", () => {
        const b = parsMarkdown("```yaml\nkey: **ikke fed**\n  - [a](b)\n```\n");
        expect(b).toEqual([{ t: "kode", sprog: "yaml", v: "key: **ikke fed**\n  - [a](b)" }]);
    });
    it("indlejrede lister og fortsættelseslinjer", () => {
        const b = parsMarkdown("- a\n  fortsat\n  - b\n  - c\n- d\n");
        const l = b[0] as Extract<Blok, { t: "liste" }>;
        expect(l.punkter).toHaveLength(2);
        const første = l.punkter[0];
        expect(første[0].t).toBe("afsnit");
        expect(første[1].t).toBe("liste");
    });
    it("ordnet liste starter ved sit eget nummer, og et årstal midt i et afsnit er ikke en liste", () => {
        expect((parsMarkdown("3. tre\n4. fire")[0] as Extract<Blok, { t: "liste" }>).start).toBe(3);
        expect(parsMarkdown("Hen mod slutningen af\n2026. Så kom det").map((x) => x.t)).toEqual(["afsnit"]);
    });
    it("vandret streg er ikke en liste", () => {
        expect(parsMarkdown("a\n\n---\n\nb").map((x) => x.t)).toEqual(["afsnit", "streg", "afsnit"]);
        expect(parsMarkdown("* * *").map((x) => x.t)).toEqual(["streg"]);
    });
    it("citat parses rekursivt", () => {
        const b = parsMarkdown("> **Pas på**\n> tekst\n");
        expect(b[0].t).toBe("citat");
    });
    it("læsetid", () => {
        expect(laesetid("ord ".repeat(400)).minutter).toBe(2);
        expect(laesetid("kort").minutter).toBe(1);
    });
});

describe("links", () => {
    it("normaliserer relative stier", () => {
        expect(normaliserSti("doc/../README.md")).toBe("README.md");
        expect(normaliserSti("./doc/KOERSEL.md")).toBe("doc/KOERSEL.md");
        expect(normaliserSti("../uden-for")).toBeUndefined();
        expect(normaliserSti("doc/arkiv/")).toBe("doc/arkiv/");
    });
    it("bundtet dokument -> intern visning, med anker", () => {
        expect(omskrivLink("BALANCEMARKED.md#fiktivt-2026-marked-scenarie", { rute: "dokumentation/koersel", mappe: "doc" }))
            .toEqual({ href: "#/dokumentation/balancemarked#fiktivt-2026-marked-scenarie", ekstern: false });
        expect(omskrivLink("doc/KOERSEL.md", { rute: "dokumentation/readme", mappe: "" }).href).toBe("#/dokumentation/koersel");
        expect(omskrivLink("../README.md", { rute: "dokumentation/koersel", mappe: "doc" }).href).toBe("#/dokumentation/readme");
    });
    it("ubundtet fil -> GitHub ved den pinnede commit; mappe -> tree; regneark -> raw", () => {
        const c = "b49aeb0af097be42938b80a0fea6acdd77162836";
        expect(omskrivLink("doc/rapport_billund_v4.pdf", { rute: "dokumentation/readme", mappe: "" }))
            .toEqual({ href: `https://github.com/skj-1964/fjernvarme-businesscase/blob/${c}/doc/rapport_billund_v4.pdf`, ekstern: true });
        expect(omskrivLink("doc/arkiv/", { rute: "dokumentation/readme", mappe: "" }).href)
            .toBe(`https://github.com/skj-1964/fjernvarme-businesscase/tree/${c}/doc/arkiv`);
        expect(omskrivLink("doc/vaerksdata_skabelon.xlsx", { rute: "dokumentation/readme", mappe: "" }).href)
            .toBe(`https://github.com/skj-1964/fjernvarme-businesscase/raw/${c}/doc/vaerksdata_skabelon.xlsx`);
    });
    it("anker i samme dokument, appstier og eksterne adresser", () => {
        expect(omskrivLink("#helår", { rute: "dokumentation/eget_vaerk", mappe: "doc" })).toEqual({ href: "#/dokumentation/eget_vaerk#helår", ekstern: false });
        expect(omskrivLink("#/analyser/abc", { rute: "x", mappe: "" })).toEqual({ href: "#/analyser/abc", ekstern: false });
        expect(omskrivLink("https://github.com/skj-1964/df-data", { rute: "x", mappe: "" })).toEqual({ href: "https://github.com/skj-1964/df-data", ekstern: true });
    });
});

// Korpus: alle bundtede tekster skal parse uden at efterlade rå markup, og alle interne links skal ramme noget.
const MD = Object.keys(tekster).filter((k) => k.endsWith(".md")).map((k) => k.replace("../indhold/", ""));

function tekstnoder(bs: readonly Blok[]): string[] {
    const ud: string[] = [];
    const inl = (xs: readonly Inline[]) => xs.forEach((x) => {
        if (x.t === "tekst") ud.push(x.v);
        else if (x.t === "fed" || x.t === "kursiv" || x.t === "streg" || x.t === "link") inl(x.b);
    });
    const gå = (xs: readonly Blok[]) => xs.forEach((b) => {
        if (b.t === "overskrift" || b.t === "afsnit") inl(b.b);
        else if (b.t === "citat") gå(b.b);
        else if (b.t === "liste") b.punkter.forEach(gå);
        else if (b.t === "tabel") { b.hoved.forEach(inl); b.raekker.forEach((r) => r.forEach(inl)); }
    });
    gå(bs);
    return ud;
}

describe("korpus: de bundtede tekster", () => {
    it("der er tekster at tjekke", () => { expect(MD.length).toBeGreaterThanOrEqual(25); });

    it.each(MD)("%s parser uden rå fed/kodemarkup", (rel) => {
        const b = parsMarkdown(tekstAf(rel));
        expect(b.length).toBeGreaterThan(0);
        const flad = tekstnoder(b).join("\n");
        expect(flad).not.toMatch(/\*\*/);
        expect(flad).not.toMatch(/`/);
    });

    it("alle dokumenter i indekset har en bundtet tekst (og omvendt for repo/egne)", () => {
        for (const d of DOKUMENTER) if (d.fil) expect(Object.keys(tekster), d.id).toContain(`../indhold/${d.fil}`);
    });

    it("alle interne links og ankre i dokumenterne rammer en bundtet tekst og en overskrift", () => {
        const fejl: string[] = [];
        for (const d of DOKUMENTER.filter((x) => x.fil && x.format === "md")) {
            const links = linksI(parsMarkdown(tekstAf(d.fil!)));
            const mappe = d.kilde === "modelrepo" ? d.sti.split("/").slice(0, -1).join("/") : "";
            for (const l of links) {
                const r = omskrivLink(l, { rute: `dokumentation/${d.id}`, mappe });
                if (r.ekstern || !r.href.startsWith("#/dokumentation/")) continue;
                const [rute, anker] = r.href.slice(2).split("#");
                const mål = DOKUMENTER.find((x) => x.id === rute.split("/")[1]);
                if (!mål?.fil) { fejl.push(`${d.id}: ${l} -> intet bundtet dokument`); continue; }
                if (anker && !overskrifter(parsMarkdown(tekstAf(mål.fil))).some((o) => o.id === anker)) fejl.push(`${d.id}: ${l} -> ankeret findes ikke i ${mål.id}`);
            }
        }
        expect(fejl).toEqual([]);
    });
});
