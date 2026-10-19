// @vitest-environment node
//-----------------------------------------------------------------------
// KONTRAKT §6d på klientsiden: skrivehjælperne til tidsserier og værksark.
// Det afgørende: klientens sha256 skal være backendens — ellers afvises hver upload —
// og backend skal have filens RÅ bytes (Windows-1252 genkendes kun dér).
//-----------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aktiverTidsserie, sha256Hex, sætSkriveKilde, tilBase64, uploadTidsserie, uploadVaerksark, type SkriveKilde, type Tidsserievalg } from "../skriv";
import { sha256Hex as backendSha, validerUpload } from "../../../../rayfin/functions/src/tidsserie";
import { læsAnmodning } from "../../../../rayfin/functions/src/logik";

const VALG: Tidsserievalg = { rolle: "varmelast", tidsstempel: "start", tidszone: "UTC", enhed: "kW", kolonne: "varme_kw" };

describe("sha256 — klient (crypto.subtle) = backend (node:crypto)", () => {
    it.each([
        ["ASCII", "time,mw\n2026-01-05 00:00,1\n"],
        ["æøå og en BOM", "﻿Tidspunkt;Varme (MW) — Æbelø\n2026-01-05 00:00;1,5\n"],
        ["base64-tekst", tilBase64(new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]))],
    ])("%s", async (_n, tekst) => expect(await sha256Hex(tekst)).toBe(backendSha(tekst)));
});

describe("tilBase64", () => {
    it("giver det samme som Node for bytes over 32 kB (bidder, ikke én stor spread)", () => {
        const b = new Uint8Array(100_000).map((_, i) => (i * 37) % 256);
        expect(tilBase64(b)).toBe(Buffer.from(b).toString("base64"));
    });
});

describe("skrivehjælperne", () => {
    let create: ReturnType<typeof vi.fn>;
    let invoke: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        create = vi.fn(async (r: Record<string, unknown>) => ({ id: "anm-1", ...r }));
        invoke = vi.fn(async (...args: unknown[]) => (void args, { ok: true, status: "gyldig", svar: "ok" }));
        const api = { create, update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) };
        sætSkriveKilde(() => ({ data: { Aendringsanmodning: api }, functions: { uploadTidsserie: { invoke }, uploadVaerksark: { invoke }, udfoerAendring: { invoke } } }) as unknown as SkriveKilde);
    });
    afterEach(() => sætSkriveKilde(null));

    it("uploadTidsserie: rå bytes som base64, enhed og kolonne med, sha256 af base64-teksten — og backend kan læse det", async () => {
        // 50 timer: data_krav kræver mindst 48 (min_timer).
        const rækker = Array.from({ length: 50 }, (_, i) => `${new Date(Date.UTC(2026, 0, 5, i)).toISOString().slice(0, 16).replace("T", " ")},${12500 + i},1`);
        const bytes = new TextEncoder().encode(["timestamp,varme_kw,andet", ...rækker, ""].join("\n"));
        await uploadTidsserie("v-1", { navn: "maalt.csv", bytes }, VALG, "a@b.dk");
        const række = create.mock.calls[0][0] as Record<string, unknown>;
        expect(række).toMatchObject({ vaerk_id: "v-1", anmodet_af: "a@b.dk", status: "ny" });
        const base64 = Buffer.from(bytes).toString("base64");
        expect(læsAnmodning(række.aendringer_json as string)).toEqual({ type: "upload_tidsserie", upload: {
            handling: "upload_tidsserie", rolle: "varmelast", navn: "maalt.csv", filnavn: "maalt.csv", tidsstempel: "start", tidszone: "UTC",
            enhed: "kW", kolonne: "varme_kw", sha256: backendSha(base64),
        } });
        expect(invoke).toHaveBeenCalledWith({ anmodningId: "anm-1", indholdBase64: base64 }, expect.anything());
        // Backend: kW -> MW med den valgte kolonne.
        const r = validerUpload(new Uint8Array(Buffer.from(base64, "base64")), "varmelast", { tidszone: "UTC", tidsstempel: "start", enhed: "kW", kolonne: "varme_kw" }, null);
        expect(r.normaliseret!.split("\n")[1]).toBe("2026-01-05T00:00:00Z,12.5");
    });
    it("aktiverTidsserie sender aktiveringen som anmodning og lader udfoerAendring udføre den", async () => {
        await aktiverTidsserie("v-1", "11111111-1111-4111-8111-111111111111", true, "a@b.dk");
        expect(læsAnmodning(create.mock.calls[0][0].aendringer_json as string)).toEqual({
            type: "aktiver_tidsserie", aktiver: { handling: "aktiver_tidsserie", tidsserie_id: "11111111-1111-4111-8111-111111111111", aktiv: true },
        });
        expect(invoke).toHaveBeenCalledWith({ anmodningId: "anm-1" }, expect.anything());
    });
    it("uploadVaerksark binder base64-teksten til anmodningen og sender timeslut med", async () => {
        const base64 = Buffer.from("PK\u0003\u0004 resten af arket").toString("base64");
        await uploadVaerksark({ navn: "vaerksdata.xlsx", base64 }, "a@b.dk", { timeslut: true });
        expect(læsAnmodning(create.mock.calls[0][0].aendringer_json as string)).toEqual({
            type: "upload_vaerksark", upload: { handling: "upload_vaerksark", filnavn: "vaerksdata.xlsx", sha256: backendSha(base64), timeslut: true },
        });
        expect(invoke).toHaveBeenCalledWith({ anmodningId: "anm-1", indholdBase64: base64 }, expect.anything());
    });
    it.each([
        ["en tom fil", () => uploadTidsserie("v", { navn: "a.csv", bytes: new Uint8Array() }, VALG, "a@b.dk"), /tom/],
        ["en for stor fil", () => uploadTidsserie("v", { navn: "a.csv", bytes: new Uint8Array(2_900_001) }, VALG, "a@b.dk"), /for stor/],
        ["uden bruger", () => uploadTidsserie("v", { navn: "a.csv", bytes: new Uint8Array([49]) }, VALG, undefined), /bruger/],
        ["et værksark der ikke er .xlsx", () => uploadVaerksark({ navn: "ark.xls", base64: "UEsDBA==" }, "a@b.dk"), /xlsx/],
    ])("afviser %s uden at skrive", async (_n, kald, tekst) => {
        await expect(kald()).rejects.toThrow(tekst);
        expect(create).not.toHaveBeenCalled();
    });
});
