import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHent } from "../hooks";
import { opdaterAlt } from "../opdatering";

describe("useHent", () => {
    it("henter ikke med nøgle null", async () => {
        const hent = vi.fn(async () => 1);
        const { result } = renderHook(() => useHent(null, hent));
        expect(result.current).toMatchObject({ data: undefined, indlæser: false });
        expect(hent).not.toHaveBeenCalled();
    });

    it("henter, og henter igen ved Opdatér (opdaterAlt) og genindlæs()", async () => {
        let n = 0;
        const hent = vi.fn(async () => ++n);
        const { result } = renderHook(() => useHent("x", hent));
        await waitFor(() => expect(result.current.data).toBe(1));
        expect(result.current.indlæser).toBe(false);

        act(() => opdaterAlt());
        expect(result.current.indlæser).toBe(true);
        expect(result.current.data).toBe(1); // forrige svar vises, til det nye er der
        await waitFor(() => expect(result.current.data).toBe(2));

        act(() => result.current.genindlæs());
        await waitFor(() => expect(result.current.data).toBe(3));
    });

    it("kasserer et svar for en nøgle, der ikke længere er den viste", async () => {
        const løftere: Record<string, (v: string) => void> = {};
        const { result, rerender } = renderHook(({ k }) => useHent(k, () => new Promise<string>((r) => { løftere[k] = r; })), {
            initialProps: { k: "a" },
        });
        rerender({ k: "b" });
        await act(async () => { løftere.a("svar-a"); });
        expect(result.current.data).toBeUndefined();
        await act(async () => { løftere.b("svar-b"); });
        expect(result.current.data).toBe("svar-b");
    });

    it("viser fejlen og ingen data", async () => {
        const { result } = renderHook(() => useHent("y", async () => { throw new Error("nej"); }));
        await waitFor(() => expect(result.current.fejl?.message).toBe("nej"));
        expect(result.current.data).toBeUndefined();
        expect(result.current.indlæser).toBe(false);
    });
});
