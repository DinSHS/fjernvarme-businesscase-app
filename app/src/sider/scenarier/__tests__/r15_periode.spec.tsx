// Runde 15, fund 3.3 (den uafhængige test 18. november 2026): "Scenarienavnene er desuden ens ('Hvad er tanken
// værd? · reference'), så perioden bør stå i navnet eller ved siden af." Parflowet giver alle par af samme spørgsmål
// samme navne; i oversigten stod to referencer og to scenarier med præcis samme tekst. Genskabt FØR rettelsen.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Koersel } from "../../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../../rayfin/data/Scenarie";
import Oversigt from "../Oversigt";

const hentet = <T,>(data: T) => ({ data, fejl: undefined, indlæser: false, genindlæs: () => {} });
const s = (id: string, navn: string, start: string | null, slut: string | null, minut: number): Scenarie => ({
    id, vaerk_id: "v1", navn, arkiveret: false, periode_start: start, periode_slut: slut, oprettet: new Date(Date.UTC(2026, 10, 18, 9, minut)), oprettet_af: "a@example.org",
} as Scenarie);
const SCENARIER = [
    s("s1", "Hvad er tanken værd? · reference", "2026-01-05", "2026-01-06", 1),
    s("s2", "Hvad er tanken værd? · reference", "2026-01-05", "2026-01-16", 2),
    s("s3", "Værkets periode", null, null, 3),
];

vi.mock("@/lib/data/hooks", () => ({
    useScenarier: () => hentet(SCENARIER),
    useVaerker: () => hentet([{ id: "v1", navn: "Andeby" }]),
    useKoersler: () => hentet([] as Koersel[]),
    useKoerselStatus: (k: Koersel[] | undefined) => k ?? [],
}));
// Oversigten henter også kørslernes korte frosne profil (efterprøvningen af runde 15, fund D); her er der ingen kørsler.
vi.mock("@/lib/data/frossen-profil", () => ({ useKortFrossenProfil: () => hentet(new Map()) }));
afterEach(cleanup);

describe("3.3: perioden står ved scenariets navn i oversigten", () => {
    it("to scenarier med samme navn kan skelnes på perioden", () => {
        const { container } = render(<Oversigt gåTil={() => {}} bruger="a@example.org" sti={[]} />);
        const celler = [...container.querySelectorAll("td")].map((td) => td.textContent ?? "").filter((t) => t.includes("Hvad er tanken værd? · reference"));
        expect(celler).toHaveLength(2);
        expect(new Set(celler).size).toBe(2);
        expect(celler.some((t) => t.includes("5. jan.–6. jan. 2026"))).toBe(true);
        expect(celler.some((t) => t.includes("5. jan.–16. jan. 2026"))).toBe(true);
    });
    it("et scenarie uden egne datoer siger, at det følger værkets periode", () => {
        const { container } = render(<Oversigt gåTil={() => {}} bruger="a@example.org" sti={[]} />);
        const celle = [...container.querySelectorAll("td")].map((td) => td.textContent ?? "").find((t) => t.startsWith("Værkets periode"));
        expect(celle).toContain("værkets egen periode");
    });
});
