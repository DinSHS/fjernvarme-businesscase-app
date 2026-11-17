//-----------------------------------------------------------------------
// "Hent tom skabelon med appens faner" (runde 14, rettelser; brugertesten
// F3): modelrepoets egen skabelon + fanerne Læs først, Start og drift,
// Balancemarked og Øvrige felter, uden markering. Bygges i browseren
// (begge udgaver) og hentes først, når der trykkes.
//-----------------------------------------------------------------------

import { useState } from "react";
import { Knap } from "@/components/layout";

export function TomSkabelonKnap({ tekst = "Hent tom skabelon med appens faner" }: { tekst?: string }) {
    const [fejl, setFejl] = useState<string>();
    const hent = async () => {
        setFejl(undefined);
        try {
            const [{ tomSkabelon, TOM_SKABELON_FILNAVN }, { hentSkabelon }] = await Promise.all([import("./eksporter"), import("./hent")]);
            const bytes = tomSkabelon(await hentSkabelon());
            const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            const a = document.createElement("a");
            a.href = url; a.download = TOM_SKABELON_FILNAVN;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (e) {
            setFejl(e instanceof Error ? e.message : String(e));
        }
    };
    return (
        <>
            <Knap sekundaer onClick={() => { void hent(); }}>{tekst}</Knap>
            {fejl && <span className="kf-felt-fejl" role="alert">{fejl}</span>}
        </>
    );
}
