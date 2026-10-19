//-----------------------------------------------------------------------
// App-skal — Fjernvarme Businesscase. Top med de fem områder, "Opdatér" og
// tema; indholdet er det valgte område (src/sider/<område>/).
//
// Ved åbning kaldes Function `afstem` én gang (KONTRAKT §6): døde jobs bliver
// til `fejl`, og en kø uden arbejder får startet en. "Opdatér" gør det samme
// og genindlæser alle synlige data. Der er ingen baggrundstimer her.
//-----------------------------------------------------------------------

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { useAuth } from "@/hooks/auth.context";
import { Knap, Sidefod, TemaVaelger } from "@/components/layout";
import { useRute, rutehref } from "@/lib/rute";
import { afstem } from "@/lib/data/skriv";
import { UDGAVETEKSTER, genindlaesApp } from "@/backend/auth";
import { erIndlaesningsfejl, markérForældet, useForældet } from "@/lib/genindlaes";
import { opdaterAlt } from "@/lib/data/opdatering";
import { OMRAADER, STANDARD_OMRAADE } from "@/sider/omraader";

const GENINDLAES_TEKST = "Appen har været åben længe, eller den er blevet opdateret, så en del af den kunne ikke hentes. " +
    "Genindlæs appen — dit arbejde i databasen er gemt.";

/**
 * Områdets del af appen kunne ikke hentes (lazy-chunk/CSS). Ikke en fejl i siden: vis "Genindlæs appen"
 * (src/lib/genindlaes.ts). "Prøv igen" hjælper ikke her — værtens session eller filnavnene er væk.
 */
function Indlaesningsfejl({ besked }: { besked: string }) {
    return (
        <article className="fjv-kort" data-layout="kort" role="alert" data-fejl="indlaesning">
            <h2 className="fjv-kort-titel">Appen skal genindlæses</h2>
            <p className="fjv-kort-budskab">{GENINDLAES_TEKST}</p>
            <div><button type="button" className="fjv-knap" onClick={genindlaesApp}>Genindlæs appen</button></div>
            <details><summary>Teknisk</summary><pre className="fjv-tilstand" data-tone="fejl">{besked}</pre></details>
        </article>
    );
}

/** En side der går ned, tager kun sit eget område med — toppen og de andre områder virker stadig. */
export function OmraadeFejl({ error, resetErrorBoundary }: FallbackProps) {
    const besked = error instanceof Error ? error.message : String(error);
    if (erIndlaesningsfejl(error)) {
        markérForældet();
        return <Indlaesningsfejl besked={besked} />;
    }
    return (
        <article className="fjv-kort" data-layout="kort" role="alert">
            <h2 className="fjv-kort-titel">Siden kunne ikke vises</h2>
            <p className="fjv-kort-budskab">Der opstod en fejl i dette område. De andre områder virker stadig.</p>
            <pre className="fjv-tilstand" data-tone="fejl">{besked}</pre>
            <div><button type="button" className="fjv-knap" data-variant="sekundaer" onClick={resetErrorBoundary}>Prøv igen</button></div>
        </article>
    );
}

function App() {
    const { session } = useAuth();
    const bruger = session?.user?.email ?? undefined;
    const { omraade, sti, gåTil } = useRute();
    const valgt = OMRAADER.find((o) => o.id === omraade) ?? OMRAADER.find((o) => o.id === STANDARD_OMRAADE)!;
    const [opdaterer, setOpdaterer] = useState(false);
    const [afstemFejl, setAfstemFejl] = useState<string | undefined>();
    const startet = useRef(false);
    const forældet = useForældet();

    const kørAfstem = useCallback(async () => {
        try {
            await afstem();
            setAfstemFejl(undefined);
        } catch (e) {
            setAfstemFejl(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        if (startet.current) return;
        startet.current = true;
        void kørAfstem();
    }, [kørAfstem]);

    const opdater = async () => {
        setOpdaterer(true);
        await kørAfstem();
        opdaterAlt();
        setOpdaterer(false);
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="grafisk-linje" />
            <header className="fjv-top">
                <div className="fjv-top-indre">
                    <div className="fjv-appnavn">
                        Fjernvarme Businesscase
                        <small>Driftsmodel for fjernvarmeværker</small>
                    </div>
                    <nav className="fjv-nav" aria-label="Områder">
                        {OMRAADER.map((o) => (
                            <a key={o.id} href={rutehref(o.id)} title={o.beskrivelse}
                                aria-current={o.id === valgt.id ? "page" : undefined}>
                                {o.navn}
                            </a>
                        ))}
                    </nav>
                    <div className="fjv-top-hoejre">
                        <Knap sekundaer onClick={opdater} disabled={opdaterer}
                            title={UDGAVETEKSTER.opdaterTitel}>
                            {opdaterer ? "Opdaterer…" : "Opdatér"}
                        </Knap>
                        <TemaVaelger />
                    </div>
                </div>
            </header>
            {/* data-omraade: områdes-CSS afgrænses med [data-omraade="<id>"] — al CSS ligger i én fil (cssCodeSplit: false). */}
            <main className="fjv-indhold" data-omraade={valgt.id}>
                {forældet && (
                    <p className="fjv-tilstand" data-tone="fejl" role="status" data-fejl="indlaesning">
                        {GENINDLAES_TEKST}{" "}
                        <button type="button" className="fjv-knap" onClick={genindlaesApp}>Genindlæs appen</button>
                    </p>
                )}
                {afstemFejl && (
                    <p className="fjv-tilstand" data-tone="fejl" role="status">
                        {UDGAVETEKSTER.afstemFejl}: {afstemFejl}
                    </p>
                )}
                <ErrorBoundary FallbackComponent={OmraadeFejl} resetKeys={[valgt.id, sti.join("/")]}>
                    <Suspense fallback={<div className="fjv-skelet" style={{ height: 240 }} aria-busy="true" />}>
                        <valgt.Komponent sti={omraade === valgt.id ? sti : []} gåTil={gåTil} bruger={bruger} />
                    </Suspense>
                </ErrorBoundary>
            </main>
            {/* Brief 21 §8: fast kreditlinje på alle sider, uden for områdets fejlgrænse (data-layout="kreditlinje"). */}
            <Sidefod />
        </div>
    );
}

export default App;
