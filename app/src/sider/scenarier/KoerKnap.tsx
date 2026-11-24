//-----------------------------------------------------------------------
// "Kør scenariet" på scenariets side (#/scenarier/<id>). Flyttet ud af ScenarieSide.tsx ved efterprøvningen af
// rettelserne i runde 15 (fund B), så knappen kan prøves for sig (__tests__/r15_uafklaret.spec.tsx).
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap } from "@/components/layout";
import { bestilHusket, forrigeTekst, genfundetTekst, udfaldTekst, åbentForsøg, åbentTekst, type Forsøgsmål } from "@/lib/data/bestillingsforsoeg";
import { opdaterAlt } from "@/lib/data/opdatering";
import { bestilKoersel } from "@/lib/data/skriv";
import type { Scenarie } from "../../../rayfin/data/Scenarie";

/**
 * "Kør"-knappen: én klientnøgle pr. KØRSEL, ikke pr. klik; afvisningen vises ordret.
 *
 * Efterprøvningen af rettelserne i runde 15, fund B: nøglen blev nulstillet i `finally`, så et klik efter et tabt svar
 * (serveren havde committet kørslen) oprettede en ny bestilling og en kørsel mere. Nu huskes nøglen pr. scenarie
 * (`bestilHusket`), til udfaldet er kendt; et kastet kald eller `teknisk: true` er uafklaret og siger det.
 *
 * Tredje rettelsesrunde, P2-1: forsøget er brugerens og gælder det indhold, `aftryk` beskriver (det GEMTE scenarie,
 * logik.ts › bestillingsaftryk). Er scenariet rettet siden et uafklaret forsøg, genoptages forsøget ikke: der bestilles
 * en ny kørsel, og blev det gamle forsøg til en kørsel, står det i kvitteringen. Før kvitterede knappen for den gamle
 * kørsel — med de gamle input. Den åbne tilstand læses af det huskede forsøg, ikke af komponentens eget svar, så den
 * også vises, når siden åbnes igen.
 *
 * Fjerde rettelsesrunde, punkt 2: aftrykket er, hvad siden SÅ — scenariet kan være gemt i en anden fane inden klikket.
 * Blev et forsøg på et andet aftryk til en kørsel, afgør `somFrosset` (kørslens frosne input over for det, der nu skal
 * bestilles), om den er svaret eller en kørsel af noget andet. Uden `somFrosset` kan det ikke afgøres, og intet nyt
 * bestilles. Kan det gamle kald stadig være undervejs, bestilles intet nyt, før brugeren vælger *Bestil ny kørsel*.
 */
export function KoerKnap({ s, bruger, aftryk, somFrosset, spærret }: {
    s: Scenarie; bruger: string | undefined; aftryk: string; somFrosset?: (koerselId: string) => Promise<boolean>; spærret?: string;
}) {
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string; åben?: boolean } | undefined>();
    const [sender, setSender] = useState(false);
    const mål: Forsøgsmål = { mål: `scenarie:${s.id}`, bruger, aftryk };
    const kør = async (bestilNy = false) => {
        setSender(true);
        setSvar(undefined);
        try {
            const u = await bestilHusket(mål, async () => s.id, (id, nøgle) => bestilKoersel(id, bruger, nøgle), { somFrosset, bestilNy });
            const a = u.art === "bestilt" ? u.svar.arbejder : undefined;
            setSvar(u.art === "bestilt"
                ? { ok: true, tekst: u.genfundet ? genfundetTekst(u.koersel_id, "kørslen") : `${a?.startet ? "Kørslen er bestilt, og beregningen er startet." : `Kørslen er bestilt. ${a?.grund ?? ""}`}${u.forrige ? forrigeTekst(u.forrige, "scenariet") : ""}` }
                : { ok: false, tekst: udfaldTekst(u, "kørslen", "scenariet"), åben: u.art === "forrige_aaben" });
            opdaterAlt();
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally {
            setSender(false);
        }
    };
    // Står der et forsøg, hvis udfald ikke er kendt, fortsætter næste klik det (samme bestilling) — og knappen siger det.
    // Uden et svar på skærmen (siden er lige åbnet) forklarer en linje, hvorfor knappen hedder, som den gør.
    const åbent = sender ? undefined : åbentForsøg(mål);
    const fortsætter = åbent === "samme";
    return (
        <div className="fs-blok">
            <div className="fs-raekke">
                <Knap onClick={() => kør()} disabled={sender || !bruger || !!spærret} title={spærret}>{sender ? "Bestiller…" : fortsætter ? "Prøv igen" : "Kør scenariet"}</Knap>
                {/* Kun efter et klik, der har vist, at det forrige forsøg står åbent — og kun mens indholdet stadig er et andet. */}
                {svar?.åben && åbent === "aendret" && <Knap sekundaer onClick={() => kør(true)} disabled={sender || !bruger || !!spærret} title={spærret}>Bestil ny kørsel</Knap>}
                {spærret && <span className="fs-lille">{spærret}</span>}
            </div>
            {svar && <p className="fs-tekst" role="status" style={{ color: svar.ok ? "var(--dash-pos)" : "var(--dash-neg)" }}>{svar.tekst}</p>}
            {!svar && åbent && <p className="fs-tekst" role="status">{åbentTekst(åbent, "kørslen", "scenariet")}</p>}
        </div>
    );
}
