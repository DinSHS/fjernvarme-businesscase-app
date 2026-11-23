//-----------------------------------------------------------------------
// "Kør scenariet" på scenariets side (#/scenarier/<id>). Flyttet ud af ScenarieSide.tsx ved efterprøvningen af
// rettelserne i runde 15 (fund B), så knappen kan prøves for sig (__tests__/r15_uafklaret.spec.tsx).
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap } from "@/components/layout";
import { bestilHusket, harÅbentForsøg, uafklaretTekst } from "@/lib/data/bestillingsforsoeg";
import { opdaterAlt } from "@/lib/data/opdatering";
import { bestilKoersel } from "@/lib/data/skriv";
import type { Scenarie } from "../../../rayfin/data/Scenarie";

/**
 * "Kør"-knappen: én klientnøgle pr. KØRSEL, ikke pr. klik; afvisningen vises ordret.
 *
 * Efterprøvningen af rettelserne i runde 15, fund B: nøglen blev nulstillet i `finally`, så et klik efter et tabt svar
 * (serveren havde committet kørslen) oprettede en ny bestilling og en kørsel mere. Nu huskes nøglen pr. scenarie
 * (`bestilHusket`), til udfaldet er kendt; et kastet kald eller `teknisk: true` er uafklaret og siger det.
 */
export function KoerKnap({ s, bruger, spærret }: { s: Scenarie; bruger: string | undefined; spærret?: string }) {
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string } | undefined>();
    const [sender, setSender] = useState(false);
    const mål = `scenarie:${s.id}`;
    const kør = async () => {
        setSender(true);
        setSvar(undefined);
        try {
            const u = await bestilHusket(mål, async () => s.id, (id, nøgle) => bestilKoersel(id, bruger, nøgle));
            const a = u.art === "bestilt" ? u.svar.arbejder : undefined;
            setSvar(u.art === "bestilt"
                ? { ok: true, tekst: a?.startet ? "Kørslen er bestilt, og beregningen er startet." : `Kørslen er bestilt. ${a?.grund ?? ""}` }
                : { ok: false, tekst: u.art === "uafklaret" ? uafklaretTekst("kørslen", u.detalje) : u.tekst });
            opdaterAlt();
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally {
            setSender(false);
        }
    };
    // Står der et forsøg, hvis udfald ikke er kendt, fortsætter næste klik det (samme bestilling) — og knappen siger det.
    const fortsætter = !sender && svar?.ok === false && harÅbentForsøg(mål);
    return (
        <div className="fs-blok">
            <div className="fs-raekke">
                <Knap onClick={kør} disabled={sender || !bruger || !!spærret} title={spærret}>{sender ? "Bestiller…" : fortsætter ? "Prøv igen" : "Kør scenariet"}</Knap>
                {spærret && <span className="fs-lille">{spærret}</span>}
            </div>
            {svar && <p className="fs-tekst" role="status" style={{ color: svar.ok ? "var(--dash-pos)" : "var(--dash-neg)" }}>{svar.tekst}</p>}
        </div>
    );
}
