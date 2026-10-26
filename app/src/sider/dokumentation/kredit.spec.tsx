// Kredit til den oprindelige case (produktejer 2026-10-16, punkt 8): kreditlinjen, "Om og kredit", licenstekster, pinnede commits.
import { configure, render, screen, waitFor } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dokumentation from "./index";
import { Kreditlinje } from "./Kreditlinje";
import { DATAREPO, MODELREPO } from "./kilde";
import { BRUGERFLADE_TIL_MODELLEN, KREDITLINJE, KREDITLINJE_TEKST, dataNote, licensLinje } from "./kredit";

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 20000 });
beforeEach(() => { window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn(); });

const her = dirname(fileURLToPath(import.meta.url));
const produkt = resolve(her, "..", "..", "..", "..");
const indhold = join(her, "indhold");
const læs = (...d: string[]) => readFileSync(join(...d), "utf8");

describe("kreditlinjen (sidefoden)", () => {
    it("siger præcis det, produktejeren bad om — og peger på Om og kredit", () => {
        expect(KREDITLINJE_TEKST).toBe(
            "Bygger på fjernvarme-businesscase af skj-1964 (MIT), udviklet med Billund Varme og Dansk Fjernvarme · data fra df-data · Om og kredit",
        );
    });

    it("linker til modelrepoet, forfatteren, datarepoet og siden Om og kredit; eksterne links åbner sikkert", () => {
        render(<Kreditlinje />);
        const f = screen.getByRole("contentinfo");
        expect(f).toHaveAttribute("data-layout", "kredit");
        const a = (navn: string) => screen.getByRole("link", { name: navn });
        expect(a("fjernvarme-businesscase")).toHaveAttribute("href", "https://github.com/skj-1964/fjernvarme-businesscase");
        expect(a("skj-1964")).toHaveAttribute("href", "https://github.com/skj-1964");
        expect(a("df-data")).toHaveAttribute("href", "https://github.com/skj-1964/df-data");
        expect(a("Om og kredit")).toHaveAttribute("href", "#/dokumentation/om");
        for (const navn of ["fjernvarme-businesscase", "skj-1964", "df-data"]) {
            expect(a(navn)).toHaveAttribute("target", "_blank");
            expect(a(navn)).toHaveAttribute("rel", "noopener noreferrer");
        }
        expect(a("Om og kredit")).not.toHaveAttribute("target");
        expect(f.textContent).toBe(KREDITLINJE_TEKST);
    });

    it("ingen led i linjen antyder, at nogen står bag eller har godkendt appen", () => {
        expect(KREDITLINJE_TEKST).not.toMatch(KRAV_OM_GODKENDELSE);
    });
});

// Vendinger, der ville fremstille appen som udgivet af, støttet af eller godkendt af den oprindelige case eller dens parter.
const KRAV_OM_GODKENDELSE = /(i samarbejde med|støttet af|sponsoreret af|anbefalet af|godkendt af|udgivet af|officiel|certificeret af|på vegne af)/i;

describe("Om og kredit", () => {
    const vis = () => render(<Dokumentation sti={["om"]} gåTil={() => {}} bruger="a@b.dk" />);

    it("siger, at appen er en brugerflade TIL modellen, og at metoden, valideringen og referencetallene er forfatterens", async () => {
        const { container } = vis();
        expect(await screen.findByRole("heading", { level: 1, name: "Om og kredit" })).toBeInTheDocument();
        const tekst = () => container.textContent ?? "";
        await waitFor(() => expect(tekst()).toContain(BRUGERFLADE_TIL_MODELLEN));
        expect(BRUGERFLADE_TIL_MODELLEN).toMatch(/brugerflade til modellen/);
        expect(tekst()).toMatch(/metoden, valideringen og referencetallene — er forfatterens/);
        expect(tekst()).toMatch(/Appen distribuerer ikke modellens kode: den afhænger af den på en pinnet commit/);
    });

    it("fuld kreditering: modelrepo, forfatter, Billund Varme og Dansk Fjernvarme (README's egne ord), df-data og de oprindelige kilder", async () => {
        const { container } = vis();
        // README's citat indlæses som en lazy chunk: vent på det, ikke på sidens egne ord.
        await waitFor(() => expect(container.textContent).toMatch(/Frigivet under MIT-licens/));
        const t = container.textContent ?? "";
        expect(t).toMatch(/udviklet sammen med\s*Billund Varme\s*og\s*Dansk Fjernvarme/);
        await waitFor(() => expect(container.textContent).toMatch(/råudtræk fra Energinet Energi Data Service/));
        await waitFor(() => expect(container.textContent).toMatch(/api\.sysapp\.dk/));
        expect(container.textContent).toMatch(/DMI/);
        expect(container.textContent).toMatch(/api\.sysapp\.dk/);
        const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
        expect(hrefs).toContain("https://github.com/skj-1964/fjernvarme-businesscase");
        expect(hrefs).toContain("https://github.com/skj-1964");
        expect(hrefs).toContain("https://github.com/skj-1964/df-data");
        expect(hrefs).toContain("https://www.energidataservice.dk/");
    });

    it("df-datas licensafsnit og LICENSE-note er gengivet ORDRET (CC BY 4.0 for Energinet og DMI)", async () => {
        const { container } = vis();
        const afsnit = læs(indhold, "kreditter", "df-data_README_licens.md");
        const første = afsnit.split(/\r?\n/).find((l) => l.startsWith("Data er offentlige"))!;
        await waitFor(() => expect(container.textContent).toContain(første));
        expect(første).toBe("Data er offentlige fra Energinet (CC BY 4.0) og DMI (CC BY 4.0). Dette repo gør ingen krav på dem og frigiver dem under samme vilkår.");
        await waitFor(() => expect(container.textContent).toContain(dataNote(læs(indhold, "kreditter", "df-data_LICENSE.txt"))!));
        expect(container.textContent).toMatch(/both published under CC BY 4\.0/);
    });

    it("pinnede commits: fulde SHA'er med link til netop den commit, for model og data", async () => {
        const { container } = vis();
        await screen.findByRole("heading", { name: /Pinnede versioner/ });
        const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
        expect(hrefs).toContain(`https://github.com/skj-1964/fjernvarme-businesscase/tree/${MODELREPO.commit}`);
        expect(hrefs).toContain(`https://github.com/skj-1964/df-data/tree/${DATAREPO.commit}`);
        expect(container.textContent).toContain(MODELREPO.commit);
        expect(container.textContent).toContain(DATAREPO.commit);
    });

    it("begge licenstekster kan læses i fuld længde, med deres ophavsret", async () => {
        const { container } = vis();
        await waitFor(() => expect(container.querySelectorAll("pre").length).toBe(2));
        const pre = [...container.querySelectorAll("pre")].map((p) => p.textContent ?? "");
        expect(pre[0]).toContain("Copyright (c) 2026 Dansk Fjernvarme");
        expect(pre[0]).toContain("Permission is hereby granted, free of charge");
        expect(pre[1]).toContain("Copyright (c) 2026 Steen Kramer Jensen / Dansk Fjernvarme");
        expect(pre[1]).toContain("Permission is hereby granted, free of charge");
        expect(container.textContent).toContain("Copyright (c) 2026 Dansk Fjernvarme");
    });

    it("ingen formulering antyder, at Dansk Fjernvarme, Billund eller forfatteren står bag eller har godkendt appen — og siden siger det direkte", async () => {
        const { container } = vis();
        await waitFor(() => expect(container.textContent).toMatch(/Energinet Energi Data Service/));
        const t = container.textContent ?? "";
        expect(t).toMatch(/Der foreligger ingen godkendelse eller tilslutning fra Dansk Fjernvarme, Billund Varme eller modellens forfatter/);
        expect(t.replace(/Der foreligger ingen godkendelse eller tilslutning[^.;]*;/, "")).not.toMatch(KRAV_OM_GODKENDELSE);
    });

    it("er ikke tenant-specifik: ingen Fabric-adresser eller e-mails på siden", async () => {
        const { container } = vis();
        await waitFor(() => expect(container.textContent).toMatch(/Energinet Energi Data Service/));
        expect(container.textContent).not.toMatch(/@[a-z0-9-]+\.(dk|com)|onmicrosoft|fabricapps|pbidedicated/i);
    });

    it("dokumentationsindekset peger på siden", () => {
        render(<Dokumentation sti={[]} gåTil={() => {}} bruger="a@b.dk" />);
        expect(screen.getByRole("link", { name: "Om og kredit" })).toHaveAttribute("href", "#/dokumentation/om");
    });
});

describe("kredit: licenshjælpere", () => {
    it("finder ophavsretslinjen og df-datas note (efter ---)", () => {
        expect(licensLinje("MIT License\n\nCopyright (c) 2026 X\n", /^Copyright \(c\)/)).toBe("Copyright (c) 2026 X");
        expect(dataNote("MIT\r\n---\r\n\r\nNote a\r\nnote b\r\n")).toBe("Note a note b");
        expect(dataNote("ingen skillelinje")).toBeUndefined();
    });
    it("KREDITLINJE har eksterne links med ekstern-markering og kun ét internt link", () => {
        expect(KREDITLINJE.filter((d) => d.href && !d.ekstern)).toHaveLength(1);
        expect(KREDITLINJE.filter((d) => d.ekstern).length).toBe(3);
    });
});

describe.skipIf(!existsSync(join(produkt, "fabric", "fjv", "konstanter.py")))("pinnede commits er dem, motoren faktisk bruger", () => {
    const konst = existsSync(join(produkt, "fabric", "fjv", "konstanter.py")) ? læs(produkt, "fabric", "fjv", "konstanter.py") : "";
    it("modelcommit og df-data-commit i kilde.ts = MODEL_COMMIT og DF_DATA_SHA i fabric/fjv/konstanter.py", () => {
        expect(konst.match(/^MODEL_COMMIT\s*=\s*"([0-9a-f]{40})"/m)?.[1]).toBe(MODELREPO.commit);
        expect(konst.match(/^DF_DATA_SHA\s*=\s*"([0-9a-f]{40})"/m)?.[1]).toBe(DATAREPO.commit);
    });
    it("df-datas bundtede licenstekster er byte-ens med datarepoet ved den pinnede commit", () => {
        const dir = join(produkt, "fabric", "_lokal", "df-data", DATAREPO.commit);
        if (!existsSync(join(dir, "LICENSE"))) return; // udpakningen findes kun lokalt
        expect(læs(indhold, "kreditter", "df-data_LICENSE.txt")).toBe(læs(dir, "LICENSE"));
        expect(læs(indhold, "kreditter", "df-data_commit.txt").trim()).toBe(DATAREPO.commit);
        expect(læs(dir, "README.md")).toContain(læs(indhold, "kreditter", "df-data_README_licens.md").trim().split(/\r?\n/).slice(2).join("\n").trim());
    });
});

describe("modellens licenstekst er byte-ens med modelrepoet ved den pinnede commit", () => {
    const repo = resolve(produkt, "..", "fjernvarme-businesscase");
    it.skipIf(!existsSync(join(repo, ".git")))("LICENSE", () => {
        const ved = execFileSync("git", ["-C", repo, "show", `${MODELREPO.commit}:LICENSE`], { encoding: "utf8" });
        expect(læs(indhold, "repo", "licens.txt")).toBe(ved);
    });
});

describe("krav: appens skal viser kreditlinjen på alle sider (fv-app)", () => {
    it.todo("<Kreditlinje /> står i App.tsx uden for områdets <main> — afventer fv-app (se rapporten: ønske til fundamentet)");
});
