//-----------------------------------------------------------------------
// `erSessionsFejl` skal ramme Rayfins FAKTISKE ordlyd. Beskederne herunder er
// kopieret verbatim fra SDK'ens kilder, ikke skrevet efter hukommelsen:
//   - rayfin-lib/dist/ApiClient.js:245 og :249
//   - rayfin-auth/dist/Auth.js (_doRefresh: SESSION_EXPIRED, NO_REFRESH_TOKEN)
// Ændrer en opgradering ordlyden, falder appen tilbage til den rå besked — ikke
// pænt, men ikke farligt. Derfor test frem for et forsøg på at være udtømmende.
//-----------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { erSessionsFejl, SESSIONS_FEJL_BESKED } from "./auth-fejl";

describe("erSessionsFejl", () => {
    it.each([
        "Authentication failed after token refresh",
        "Authentication required",
        "Session expired. Please sign in again.",
        "No refresh token available.",
        "HTTP Error 401: Unauthorized",
        "Fabric-handoff gennemført, men der blev ikke etableret nogen session.",
    ])("genkender %j", (besked) => {
        expect(erSessionsFejl(new Error(besked))).toBe(true);
    });

    it("genkender en NetworkError på status alene", () => {
        // AuthApi.mapError pakker NetworkError om til AuthError undervejs, så
        // beskeden kan være væk mens statussen består.
        const fejl = Object.assign(new Error("Uventet svar"), { status: 401 });
        expect(erSessionsFejl(fejl)).toBe(true);
    });

    it.each([
        "The field `afdelingsstamdata` does not exist on the type `Query`",
        "Internal server error",
        "HTTP Error 403: Forbidden",
        "HTTP Error 500",
        // Rettighedsfejl må IKKE fanges: brugeren skal ikke sendes ud i en
        // genindlæsning der ikke hjælper. 403 er beskeden om manglende adgang.
        "Anonymous access is not allowed",
    ])("lader %j passere", (besked) => {
        expect(erSessionsFejl(new Error(besked))).toBe(false);
    });

    it("fanger ikke en serverbesked der blot citerer værdien 401", () => {
        // Afdelingsnavne og id'er ender i fejltekster. Et bart tal-match ville
        // vise »session udløbet« for en helt anden fejl.
        expect(
            erSessionsFejl(new Error("Kolonnen Visningsnavn for afdeling 401 er for lang")),
        ).toBe(false);
    });

    it("tåler null, undefined og ikke-fejl", () => {
        expect(erSessionsFejl(null)).toBe(false);
        expect(erSessionsFejl(undefined)).toBe(false);
        expect(erSessionsFejl("Session expired")).toBe(true);
    });
});

describe("SESSIONS_FEJL_BESKED", () => {
    it("siger både hvad brugeren skal gøre, og hvad det koster", () => {
        // Uden advarslen om tabte indtastninger trykker brugeren F5 og mister
        // arbejde uden varsel — hele grunden til at beskeden er skrevet om.
        expect(SESSIONS_FEJL_BESKED).toMatch(/genindlæs/i);
        expect(SESSIONS_FEJL_BESKED).toMatch(/forsvinder ved genindlæsning/i);
        expect(SESSIONS_FEJL_BESKED).toMatch(/ikke et rettighedsproblem/i);
    });
});
