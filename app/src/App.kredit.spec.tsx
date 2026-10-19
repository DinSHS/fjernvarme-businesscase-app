// Brief 21 punkt 8 / Codex K6-F3: den faste kreditlinje skal vaere MONTERET i app-skallen paa ALLE sider - ogsaa naar et
// omraade gaar ned, og naar afstemningen fejler. tjek_offentlig.py kontrollerer det statisk; denne test renderer den
// rigtige skal (<App />), saa en fjernet <Sidefod /> fejler her og ikke kun i gaten.
import { Suspense, lazy, type ComponentType } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KREDITLINJE_TEKST } from "@/sider/dokumentation/kredit";
import { DATAREPO, MODELREPO } from "@/sider/dokumentation/kilde";

const afstemMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/data/skriv", () => ({ afstem: afstemMock }));
vi.mock("@/lib/data/opdatering", () => ({ opdaterAlt: vi.fn() }));
// Lette omraader: ingen data, ingen netvaerk. "fejl" kaster, saa omraadets fejlgraense udloeses.
vi.mock("@/sider/omraader", () => {
    const stub = (id: string, navn: string, kast = false) => ({
        id, navn, beskrivelse: navn,
        Komponent: lazy(async () => ({
            default: (() => {
                if (kast) throw new Error("omraadet gik ned");
                return <p data-omraade={id}>{navn}</p>;
            }) as ComponentType<Record<string, unknown>>,
        })),
    });
    return {
        OMRAADER: [stub("dokumentation", "Dokumentation"), stub("konfiguration", "Konfiguration"), stub("fejl", "Fejl", true)],
        STANDARD_OMRAADE: "konfiguration",
    };
});

const bruger = { session: { isAuthenticated: true, user: { email: "bruger@example.com" } }, isAuthenticated: true, isLoading: false, error: null };

/** Faelles kontrol: kreditlinjen findes, er synlig, har de rigtige ord og links, og staar UDEN FOR omraadets <main>. */
export function kraevKreditlinje(container: HTMLElement) {
    const el = container.querySelector<HTMLElement>('[data-layout="kreditlinje"]');
    if (!el) throw new Error("kreditlinjen (data-layout=\"kreditlinje\") er ikke monteret i skallen");
    expect(el).toBeVisible();
    expect(el.textContent).toContain("Bygger på");
    expect(el.textContent).toContain("Om og kredit");
    const hrefs = Array.from(el.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(MODELREPO.url);
    expect(hrefs).toContain(DATAREPO.url);
    expect(el.querySelector("footer")?.getAttribute("title")).toBe(KREDITLINJE_TEKST);
    expect(el.closest("main"), "kreditlinjen maa ikke ligge inde i omraadets fejlgraense").toBeNull();
    return el;
}

async function visApp(hash: string) {
    window.location.hash = hash;
    // Efter vi.resetModules() er modulgrafen ny: kontekst og App skal komme fra SAMME graf, ellers finder useAuth ingen udbyder.
    const { AuthContext } = await import("@/hooks/auth.context");
    const { default: App } = await import("./App");
    const r = render(<AuthContext.Provider value={bruger as never}><Suspense fallback={null}><App /></Suspense></AuthContext.Provider>);
    await act(async () => { await Promise.resolve(); });
    return r;
}

describe("kreditlinjen i app-skallen (brief 21 punkt 8)", () => {
    beforeEach(() => { afstemMock.mockReset(); afstemMock.mockResolvedValue(undefined); });
    afterEach(() => { window.location.hash = ""; vi.resetModules(); });

    for (const hash of ["#/dokumentation", "#/konfiguration/andeby/units", "#/", "#/findes-ikke"]) {
        it(`vises paa ruten ${hash || "(tom)"}`, async () => {
            const { container } = await visApp(hash);
            kraevKreditlinje(container);
        });
    }

    it("vises, naar omraadet gaar ned (fejlgraensen tager kun omraadet med)", async () => {
        const { container, findByRole } = await visApp("#/fejl");
        expect((await findByRole("alert")).textContent).toContain("Siden kunne ikke vises");
        kraevKreditlinje(container);
    });

    it("vises, naar afstemningen fejler", async () => {
        afstemMock.mockRejectedValue(new Error("db sover"));
        const { container, findByText } = await visApp("#/konfiguration");
        await findByText(/db sover/);
        kraevKreditlinje(container);
    });

    it("staar nederst i skallen: efter indholdet", async () => {
        const { container } = await visApp("#/dokumentation");
        const el = kraevKreditlinje(container);
        const main = container.querySelector("main")!;
        expect(main.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});

describe("negativ kontrol: testen kan fejle", () => {
    afterEach(() => { vi.resetModules(); vi.doUnmock("@/components/layout"); window.location.hash = ""; });

    it("en skal uden sidefod afvises af kontrollen", () => {
        const { container } = render(<div><header /><main>indhold</main></div>);
        expect(() => kraevKreditlinje(container)).toThrow(/ikke monteret/);
    });

    it("den RIGTIGE skal, hvor <Sidefod /> gengiver intet, afvises af samme kontrol", async () => {
        vi.resetModules();
        vi.doMock("@/components/layout", async () => ({ ...(await vi.importActual<object>("@/components/layout")), Sidefod: () => null }));
        const { container } = await visApp("#/dokumentation");
        expect(() => kraevKreditlinje(container)).toThrow(/ikke monteret/);
    });

    it("en kreditlinje inde i omraadets <main> afvises (maa staa uden for fejlgraensen)", () => {
        const { container } = render(<main><div data-layout="kreditlinje"><footer title={KREDITLINJE_TEKST}>Bygger på Om og kredit</footer></div></main>);
        expect(() => kraevKreditlinje(container)).toThrow();
    });
});
