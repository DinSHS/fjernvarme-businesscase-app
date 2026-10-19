import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Afvist, bestilKoersel, gemScenarieAendringer, gemVaerksaendringer, kopierVaerk, oversætFejl, sætSkriveKilde } from "../skriv";
import type { ScenarieAendring } from "../../../../rayfin/data/ScenarieAendring";

function falskKilde() {
    const create = vi.fn(async (r: Record<string, unknown>) => ({ id: "ny-id", ...r }));
    const update = vi.fn(async () => ({}));
    const del = vi.fn(async () => ({}));
    const invoke = vi.fn(async () => ({ ok: true }));
    const api = { create, update, delete: del };
    const kilde = {
        data: { Aendringsanmodning: api, Bestilling: api, Scenarie: api, ScenarieAendring: api },
        functions: { udfoerAendring: { invoke }, startBestilling: { invoke }, afstem: { invoke }, annullerKoersel: { invoke } },
    };
    sætSkriveKilde(() => kilde);
    return { create, update, del, invoke };
}

describe("skriv — den betroede skrivevej", () => {
    let f: ReturnType<typeof falskKilde>;
    beforeEach(() => { f = falskKilde(); });
    afterEach(() => sætSkriveKilde(null));

    it("gemVaerksaendringer opretter en anmodning i brugerens navn og lader udfoerAendring udføre den", async () => {
        await gemVaerksaendringer({ id: "v1", revision: 4 }, [
            { sti: "prices.straw.value", handling: "ret", ny_json: "47.5" },
            { sti: "units.x.p_min", handling: "slet" },
        ], "a@b.dk");
        const række = f.create.mock.calls[0][0];
        expect(række).toMatchObject({ vaerk_id: "v1", forventet_revision: 4, anmodet_af: "a@b.dk", status: "ny" });
        expect(JSON.parse(række.aendringer_json as string)).toEqual([
            { sti: "prices.straw.value", handling: "ret", ny_json: "47.5" },
            { sti: "units.x.p_min", handling: "slet" },
        ]);
        expect(f.invoke).toHaveBeenCalledWith({ anmodningId: "ny-id" }, expect.anything());
    });

    it("afviser uden bruger, uden ændringer og med samme sti to gange — uden at skrive", async () => {
        await expect(gemVaerksaendringer({ id: "v", revision: 1 }, [{ sti: "a", handling: "slet" }], undefined)).rejects.toThrow(/bruger/);
        await expect(gemVaerksaendringer({ id: "v", revision: 1 }, [], "a@b.dk")).rejects.toThrow(Afvist);
        await expect(gemVaerksaendringer({ id: "v", revision: 1 }, [{ sti: "a", handling: "slet" }, { sti: "a", handling: "slet" }], "a@b.dk")).rejects.toThrow(/to gange/);
        expect(f.create).not.toHaveBeenCalled();
    });

    it("afviser en gem der ikke kan være i 4000 tegn i stedet for at trunkere", async () => {
        const mange = Array.from({ length: 80 }, (_, i) => ({ sti: `units.enhed_${i}.p_max_heat`, handling: "ret" as const, ny_json: "12.0" }));
        await expect(gemVaerksaendringer({ id: "v", revision: 1 }, mange, "a@b.dk")).rejects.toThrow(/flere omgange/);
        expect(f.create).not.toHaveBeenCalled();
    });

    it("kopierVaerk sender kopi-formen og afviser en ugyldig kode", async () => {
        await kopierVaerk({ id: "v1", revision: 2 }, "andeby_kopi", "Kopi", "a@b.dk");
        expect(JSON.parse(f.create.mock.calls[0][0].aendringer_json as string)).toEqual([{ handling: "kopier_vaerk", ny_kode: "andeby_kopi", navn: "Kopi" }]);
        await expect(kopierVaerk({ id: "v1", revision: 2 }, "Andeby", "Kopi", "a@b.dk")).rejects.toThrow(/små bogstaver/);
    });

    it("bestilKoersel opretter en bestilling med klientnøgle og kalder startBestilling", async () => {
        await bestilKoersel("s1", "a@b.dk", "nøgle-1");
        expect(f.create.mock.calls[0][0]).toMatchObject({ scenarie_id: "s1", klient_noegle: "nøgle-1", bestilt_af: "a@b.dk" });
        expect(f.invoke).toHaveBeenCalledWith({ bestillingId: "ny-id" }, expect.anything());
    });

    it("oversætter DAB's tekniske afvisninger til dansk", () => {
        expect(oversætFejl(new Error("GraphQL errors: Could not insert row with given values.")).message).toMatch(/dit eget navn/);
        expect(oversætFejl(new Error("A record with the same unique value already exists.")).message).toMatch(/samme nøgle/);
        expect(oversætFejl(new Error("The field `createKoersel` does not exist on the type `Mutation`.")).message).toMatch(/anmodning/);
        const andet = new Error("netværk");
        expect(oversætFejl(andet)).toBe(andet);
    });

    it("gemScenarieAendringer sletter fjernede, retter ændrede og opretter nye", async () => {
        const eksisterende = [
            { id: "e1", scenarie_id: "s", type: "set", sti: "prices.straw.value", vaerdi_json: "45.0", raekkefoelge: 1 },
            { id: "e2", scenarie_id: "s", type: "disable", sti: "elkedel", vaerdi_json: null, raekkefoelge: 2 },
        ] as unknown as ScenarieAendring[];
        await gemScenarieAendringer("s", eksisterende, [
            { type: "set", sti: "prices.straw.value", vaerdi_json: "50.0" },
            { type: "enable", sti: "varmepumpe" },
        ]);
        expect(f.del).toHaveBeenCalledWith({ id: "e2" });
        expect(f.update).toHaveBeenCalledWith({ id: "e1" }, { type: "set", vaerdi_json: "50.0", raekkefoelge: 1 });
        expect(f.create).toHaveBeenCalledWith({ scenarie_id: "s", type: "enable", sti: "varmepumpe", vaerdi_json: null, raekkefoelge: 2 });
    });

    it("gemScenarieAendringer gemmer et skift fra enable til disable på samme navn (fejlede før)", async () => {
        const eksisterende = [{ id: "e1", scenarie_id: "s", type: "enable", sti: "elkedel", vaerdi_json: null, raekkefoelge: 1 }] as unknown as ScenarieAendring[];
        await gemScenarieAendringer("s", eksisterende, [{ type: "disable", sti: "elkedel" }]);
        expect(f.update).toHaveBeenCalledWith({ id: "e1" }, { type: "disable", vaerdi_json: null, raekkefoelge: 1 });
    });

    it("gemScenarieAendringer afviser samme sti to gange og set uden værdi", async () => {
        await expect(gemScenarieAendringer("s", [], [{ type: "set", sti: "a", vaerdi_json: "1" }, { type: "set", sti: "a", vaerdi_json: "2" }])).rejects.toThrow(/to gange/);
        await expect(gemScenarieAendringer("s", [], [{ type: "set", sti: "a" }])).rejects.toThrow(/mangler en værdi/);
        expect(f.create).not.toHaveBeenCalled();
    });
});
