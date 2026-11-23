// Runde 15, fund 3.6 (den uafhængige test 18. november 2026): en ukendt rute (#/findes/ikke) faldt stille tilbage
// til Konfiguration — uden at sige, at adressen ikke fandtes. Genskabt FØR rettelsen: skallen viste standardområdet og
// intet andet. Efter rettelsen siger skallen, hvilken adresse der ikke findes, og at den viser Konfiguration i stedet.
import { Suspense, lazy, type ComponentType } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afstemMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/skriv", () => ({ afstem: afstemMock }));
vi.mock("@/lib/data/opdatering", () => ({ opdaterAlt: vi.fn() }));
vi.mock("@/sider/omraader", () => {
    const stub = (id: string, navn: string) => ({
        id, navn, beskrivelse: navn,
        Komponent: lazy(async () => ({ default: (() => <p data-omraade={id}>{navn}</p>) as ComponentType<Record<string, unknown>> })),
    });
    return { OMRAADER: [stub("dokumentation", "Dokumentation"), stub("konfiguration", "Konfiguration"), stub("analyser", "Analyser")], STANDARD_OMRAADE: "konfiguration" };
});

const bruger = { session: { isAuthenticated: true, user: { email: "bruger@example.com" } }, isAuthenticated: true, isLoading: false, error: null };

async function visApp(hash: string) {
    window.location.hash = hash;
    const { AuthContext } = await import("@/hooks/auth.context");
    const { default: App } = await import("./App");
    const r = render(<AuthContext.Provider value={bruger as never}><Suspense fallback={null}><App /></Suspense></AuthContext.Provider>);
    await act(async () => { await Promise.resolve(); });
    return r;
}
const besked = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-fejl='ukendt-rute']");

describe("3.6: en ukendt rute siger, at den ikke findes", () => {
    beforeEach(() => { afstemMock.mockReset(); afstemMock.mockResolvedValue(undefined); });
    afterEach(() => { window.location.hash = ""; vi.resetModules(); });

    // 20 s: testens første import af skallen (hele modulgrafen) tager flere sekunder under jsdom.
    it("#/findes/ikke: beskeden nævner adressen, og Konfiguration vises i stedet", { timeout: 20_000 }, async () => {
        const { container } = await visApp("#/findes/ikke");
        const b = besked(container);
        expect(b, "ingen besked om den ukendte adresse").not.toBeNull();
        expect(b!.textContent).toContain("#/findes/ikke");
        expect(b!.textContent).toMatch(/findes ikke/);
        expect(b!.textContent).toMatch(/Konfiguration/);
        expect(b!.getAttribute("role")).toBe("status");
        // Området får ikke den ukendte adresses rest som sin egen sti.
        expect(container.querySelector("main")!.getAttribute("data-omraade")).toBe("konfiguration");
    });
    for (const hash of ["", "#/", "#/konfiguration/andeby", "#/analyser"]) {
        it(`en kendt rute (${hash || "tom"}) har ingen besked`, async () => {
            const { container } = await visApp(hash);
            expect(besked(container)).toBeNull();
        });
    }
});
