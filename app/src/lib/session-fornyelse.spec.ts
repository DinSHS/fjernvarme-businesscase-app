//-----------------------------------------------------------------------
// Reglerne for sessionsfornyelse. De to vigtigste tests er `sammenfletter`
// og `karantæne`: to samtidige handoffs river hinanden ned, fordi
// `embeddedFabricLogin` starter med at TILBAGEKALDE det nuværende token via
// `auth.signOut()`. Det ville vise sig som præcis den fejl vi retter — og
// altså se ud som om rettelsen ikke virkede.
//-----------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
    FORNYELSE_KARANTÆNE_MS,
    opretSessionsfornyer,
    type Fornyelsesporte,
} from "./session-fornyelse";

/** Porte med fornuftige standardværdier; overskriv det testen handler om. */
function porte(overstyr: Partial<Fornyelsesporte> = {}) {
    let tid = 1_000_000;
    const p: Fornyelsesporte = {
        harHaftSession: () => true,
        harRefreshToken: () => false,
        fornyMedRefreshToken: vi.fn(async () => {}),
        handoff: vi.fn(async () => {}),
        erAutentificeret: () => true,
        nu: () => tid,
        ...overstyr,
    };
    return { p, spolFrem: (ms: number) => { tid += ms; } };
}

describe("opretSessionsfornyer", () => {
    it("laver handoff når der ikke er noget refresh-token (SDK'ens tavse no-op)", async () => {
        const { p } = porte();
        await opretSessionsfornyer(p)();

        expect(p.handoff).toHaveBeenCalledTimes(1);
        expect(p.fornyMedRefreshToken).not.toHaveBeenCalled();
    });

    it("foretrækker refresh-tokenet og rører ikke postMessage-kanalen", async () => {
        const { p } = porte({ harRefreshToken: () => true });
        await opretSessionsfornyer(p)();

        expect(p.fornyMedRefreshToken).toHaveBeenCalledTimes(1);
        expect(p.handoff).not.toHaveBeenCalled();
    });

    it("falder tilbage på handoff når refresh-tokenet er afvist", async () => {
        const { p } = porte({
            harRefreshToken: () => true,
            fornyMedRefreshToken: vi.fn(async () => {
                throw new Error("INVALID_GRANT");
            }),
        });
        await opretSessionsfornyer(p)();

        expect(p.handoff).toHaveBeenCalledTimes(1);
    });

    it("gør intet uden for Fabric-portalen — der er ingen forælder at spørge", async () => {
        const { p } = porte({ harHaftSession: () => false });
        await opretSessionsfornyer(p)();

        expect(p.handoff).not.toHaveBeenCalled();
        expect(p.fornyMedRefreshToken).not.toHaveBeenCalled();
    });

    it("kaster når handoff'en ikke efterlader en session", async () => {
        // Ellers ville ApiClient prøve igen med samme døde token og give
        // brugeren præcis den fejlbesked vi er i gang med at fjerne.
        const { p } = porte({ erAutentificeret: () => false });

        await expect(opretSessionsfornyer(p)()).rejects.toThrow(/nogen session/i);
    });

    it("sammenfletter samtidige kald til ÉN handoff", async () => {
        // Fem kald 401'er på samme tid (en pagineret læsning, eller »Gem alle«).
        // Fem handoffs = fire tilbagekaldelser af det token den femte hentede.
        let slip: () => void = () => {};
        const iGang = new Promise<void>((r) => { slip = r; });
        const handoff = vi.fn(async () => { await iGang; });

        const { p } = porte({ handoff });
        const forny = opretSessionsfornyer(p);

        const alle = [forny(), forny(), forny(), forny(), forny()];
        slip();
        await Promise.all(alle);

        expect(handoff).toHaveBeenCalledTimes(1);
    });

    it("afviser en ny handoff i karantæneperioden efter en lykket fornyelse", async () => {
        const { p, spolFrem } = porte();
        const forny = opretSessionsfornyer(p);

        await forny();
        spolFrem(FORNYELSE_KARANTÆNE_MS - 1);
        await forny(); // 401 fra et kald der var undervejs før fornyelsen

        expect(p.handoff).toHaveBeenCalledTimes(1);
    });

    it("tillader fornyelse igen når karantænen er udløbet", async () => {
        const { p, spolFrem } = porte();
        const forny = opretSessionsfornyer(p);

        await forny();
        spolFrem(FORNYELSE_KARANTÆNE_MS);
        await forny();

        expect(p.handoff).toHaveBeenCalledTimes(2);
    });

    it("starter ikke — og låser ikke fast — når 401'et kommer fra handoff'ens eget token-kald", async () => {
        // `exchangeVerificationCode` går gennem samme ApiClient og sætter ikke
        // `skipRetryOn401`, så et 401 derfra kalder fornyeren igen. Testen
        // fanger både rekursionen og den deadlock et `await igangværende`
        // ville give, hvis rekursionsspærren blev flyttet under den.
        // Holder-objekt frem for `let`: fornyeren skal kunne kaldes inde fra
        // den handoff den selv starter, altså før den findes.
        const ref: { forny: () => Promise<void> } = { forny: async () => {} };
        const handoff = vi.fn(async () => {
            await ref.forny(); // ApiClient's 401-sti, kaldt inde fra handoff'en
        });

        const { p } = porte({ handoff });
        ref.forny = opretSessionsfornyer(p);

        await expect(ref.forny()).resolves.toBeUndefined();
        expect(handoff).toHaveBeenCalledTimes(1);
    });

    it("frigiver låsen efter en fejlet fornyelse, så næste forsøg kan køre", async () => {
        const handoff = vi.fn()
            .mockRejectedValueOnce(new Error("forælder svarede ikke"))
            .mockResolvedValueOnce(undefined);

        const { p } = porte({ handoff });
        const forny = opretSessionsfornyer(p);

        await expect(forny()).rejects.toThrow(/svarede ikke/);
        await expect(forny()).resolves.toBeUndefined(); // ingen karantæne efter en fejl
        expect(handoff).toHaveBeenCalledTimes(2);
    });
});
