//-----------------------------------------------------------------------
// Temavælgeren i topbjælken: tema (med farveprøver) og lys/mørk/system.
// Native radioknapper bærer tastaturet (pile flytter valget, Tab forlader
// gruppen); panelet lukker på Escape og klik udenfor og giver fokus tilbage.
//-----------------------------------------------------------------------

import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTema, type ModusValg } from "@/styles/tema";

const MODI: readonly { v: ModusValg; navn: string; Ikon: typeof Sun }[] = [
    { v: "lys", navn: "Lys", Ikon: Sun },
    { v: "moerk", navn: "Mørk", Ikon: Moon },
    { v: "system", navn: "System", Ikon: Monitor },
];

export function TemaVaelger() {
    const { tema, modus, valg, temaer, vaelgTema, vaelgModus } = useTema();
    const [aaben, setAaben] = useState(false);
    const rod = useRef<HTMLDivElement>(null);
    const knap = useRef<HTMLButtonElement>(null);
    const id = useId();

    useEffect(() => {
        if (!aaben) return;
        const luk = (e: Event) => {
            if (e instanceof KeyboardEvent) {
                if (e.key !== "Escape") return;
                setAaben(false);
                knap.current?.focus();
                return;
            }
            if (rod.current && !rod.current.contains(e.target as Node)) setAaben(false);
        };
        document.addEventListener("keydown", luk);
        document.addEventListener("pointerdown", luk);
        return () => { document.removeEventListener("keydown", luk); document.removeEventListener("pointerdown", luk); };
    }, [aaben]);

    return (
        <div className="fjv-tema" ref={rod}>
            <button ref={knap} type="button" className="fjv-ikonknap" aria-expanded={aaben} aria-controls={`${id}-panel`}
                aria-label={`Tema: ${tema.uofficielt ? "uofficielt" : tema.navn}, ${modus === "moerk" ? "mørk" : "lys"}. Skift tema`}
                title="Tema og lys/mørk" onClick={() => setAaben((a) => !a)}>
                <Palette size={16} strokeWidth={1.75} aria-hidden="true" />
                {/* Et uofficielt tema må ikke bære organisationens navn i sidehovedet (brief 22). */}
                <span className="fjv-tema-navn">{tema.uofficielt ? "Tema" : tema.navn}</span>
            </button>
            {aaben && (
                <div className="fjv-tema-panel" id={`${id}-panel`} role="dialog" aria-label="Tema">
                    <fieldset className="fjv-tema-gruppe">
                        <legend>Tema</legend>
                        {temaer.map((t) => {
                            const p = t[modus];
                            return (
                                <label key={t.id} className="fjv-tema-valg" data-valgt={t.id === tema.id || undefined}>
                                    <input type="radio" name={`${id}-tema`} value={t.id} checked={t.id === tema.id}
                                        onChange={() => vaelgTema(t.id)} />
                                    <span className="fjv-tema-proeve" aria-hidden="true" style={{ background: p.flade, borderColor: p.streg }}>
                                        <i style={{ background: p.primaer }} />
                                        <i style={{ background: p.accent }} />
                                        <i style={{ background: p.signatur[p.signatur.length > 1 ? 1 : 0] }} />
                                    </span>
                                    <span className="fjv-tema-tekst">
                                        <span className="fjv-tema-titel">{t.navn}</span>
                                        <span className="fjv-tema-besk">{t.uofficielt ? t.maerke : t.beskrivelse}</span>
                                    </span>
                                    {t.id === tema.id && <Check size={16} strokeWidth={2} className="fjv-tema-flueben" aria-hidden="true" />}
                                </label>
                            );
                        })}
                    </fieldset>
                    <fieldset className="fjv-tema-modi">
                        <legend>Lys eller mørk</legend>
                        <div className="fjv-segment">
                            {MODI.map(({ v, navn, Ikon }) => (
                                <label key={v} data-valgt={valg.modus === v || undefined}>
                                    <input type="radio" name={`${id}-modus`} value={v} checked={valg.modus === v} onChange={() => vaelgModus(v)} />
                                    <Ikon size={14} strokeWidth={1.75} aria-hidden="true" />
                                    {navn}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <p className="fjv-fod">Valget huskes i denne browser.</p>
                </div>
            )}
        </div>
    );
}
