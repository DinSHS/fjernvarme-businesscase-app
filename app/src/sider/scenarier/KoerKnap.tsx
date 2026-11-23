//-----------------------------------------------------------------------
// "Kør scenariet" på scenariets side (#/scenarier/<id>). Flyttet ud af ScenarieSide.tsx ved efterprøvningen af
// rettelserne i runde 15 (fund B), så knappen kan prøves for sig (__tests__/r15_uafklaret.spec.tsx).
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap } from "@/components/layout";
import { bestilHusket, forrigeTekst, udfaldTekst, åbentForsøg, åbentTekst, type Forsøgsmål } from "@/lib/data/bestillingsforsoeg";
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
 */
export function KoerKnap({ s, bruger, aftryk, spærret }: { s: Scenarie; bruger: string | undefined; aftryk: string; spærret?: string }) {
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string } | undefined>();
    const [sender, setSender] = useState(false);
    const mål: Forsøgsmål = { mål: `scenarie:${s.id}`, bruger, aftryk };
    const kør = async () => {
        setSender(true);
        setSvar(undefined);
        try {
            const u = await bestilHusket(mål, async () => s.id, (id, nøgle) => bestilKoersel(id, bruger, nøgle));
            const a = u.art === "bestilt" ? u.svar.arbejder : undefined;
            setSvar(u.art === "bestilt"
                ? { ok: true, tekst: `${a?.startet ? "Kørslen er bestilt, og beregningen er startet." : `Kørslen er bestilt. ${a?.grund ?? ""}`}${u.forrige ? forrigeTekst(u.forrige, "scenariet") : ""}` }
                : { ok: false, tekst: udfaldTekst(u, "kørslen", "scenariet") });
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
                <Knap onClick={kør} disabled={sender || !bruger || !!spærret} title={spærret}>{sender ? "Bestiller…" : fortsætter ? "Prøv igen" : "Kør scenariet"}</Knap>
                {spærret && <span className="fs-lille">{spærret}</span>}
            </div>
            {svar && <p className="fs-tekst" role="status" style={{ color: svar.ok ? "var(--dash-pos)" : "var(--dash-neg)" }}>{svar.tekst}</p>}
            {!svar && åbent && <p className="fs-tekst" role="status">{åbentTekst(åbent, "kørslen", "scenariet")}</p>}
        </div>
    );
}
