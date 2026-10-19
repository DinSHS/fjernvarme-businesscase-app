// Redigér / Gem / Fortryd og svaret fra gem — fælles for alle afsnit.
import { Knap } from "@/components/layout";
import { opdaterAlt } from "@/lib/data/opdatering";
import type { RedigeringsTilstand } from "./useRedigering";

export function RedigerKnapper({ rt }: { rt: RedigeringsTilstand }) {
    if (!rt.red.aktiv) return <Knap sekundaer onClick={rt.start}>Redigér</Knap>;
    const n = rt.ændringer.length;
    const blokeret = rt.blokerende.length > 0 || rt.inputFejl.length > 0;
    return (
        <span className="kf-handlinger">
            <Knap onClick={rt.gem} disabled={n === 0 || blokeret || rt.sender}
                title={blokeret ? "Ret fejlene først" : n === 0 ? "Ingen ændringer endnu" : undefined}>
                {rt.sender ? "Gemmer…" : n === 0 ? "Gem" : `Gem ${n} ${n === 1 ? "ændring" : "ændringer"}`}
            </Knap>
            <Knap sekundaer onClick={rt.fortryd} disabled={rt.sender}>Fortryd</Knap>
        </span>
    );
}

/** Svar fra seneste gem + det der blokerer — vises i kortets fod. */
export function RedigerSvar({ rt }: { rt: RedigeringsTilstand }) {
    const blok = [...rt.inputFejl.map((f) => ({ ...f, alvor: "fejl" as const })), ...rt.blokerende];
    if (!rt.svar && !(rt.red.aktiv && blok.length)) {
        return rt.red.aktiv ? <>Ændringerne gemmes som én anmodning med værkets revision; backend kontrollerer igen.</> : null;
    }
    return (
        <div className="kf-fund" role="status">
            {rt.svar && (
                <span className="kf-svar" data-tone={rt.svar.tone}>
                    {rt.svar.tekst}
                    {rt.svar.konflikt && <> Dine ændringer er bevaret. <button type="button" className="fjv-knap" data-variant="sekundaer" onClick={opdaterAlt}>Genindlæs</button> og gem igen.</>}
                </span>
            )}
            {rt.red.aktiv && blok.map((f) => <span key={`${f.sti}|${f.besked}`} className="kf-felt-fejl">{f.sti}: {f.besked}</span>)}
        </div>
    );
}
