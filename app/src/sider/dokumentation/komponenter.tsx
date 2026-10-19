//-----------------------------------------------------------------------
// Små byggeklodser, som både Dokumentation og Information bruger (begge områder er mine).
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import { useMinBredde } from "./hjaelp";
import "./komponenter.css";

export interface ListePunkt { id: string; tekst: ReactNode; href: string; niveau?: 1 | 2; aktiv?: boolean }
export interface ListeGruppe { navn?: string; punkter: ListePunkt[] }

/** Indholdsfortegnelse eller emneliste. På smal skærm foldes den sammen, så teksten ikke havner under en lang liste. */
export function Indholdsliste({ grupper, etiket }: { grupper: ListeGruppe[]; etiket: string }) {
    const bred = useMinBredde();
    const antal = grupper.reduce((n, g) => n + g.punkter.length, 0);
    const liste = (
        <nav aria-label={etiket} className="fjv-liste">
            {grupper.map((g, gi) => (
                <div key={gi} className="fjv-liste-gruppe">
                    {g.navn && <p className="fjv-liste-navn">{g.navn}</p>}
                    <ul>
                        {g.punkter.map((p) => (
                            <li key={p.id} data-niveau={p.niveau ?? 1}>
                                <a href={p.href} aria-current={p.aktiv ? "page" : undefined}>{p.tekst}</a>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </nav>
    );
    if (bred) return <div className="fjv-liste-fast">{liste}</div>;
    return (
        <details className="fjv-liste-fold">
            <summary>{etiket} ({antal})</summary>
            {liste}
        </details>
    );
}

/** Et link, der ser ud som en knap (en rigtig `<a>`, så det virker uden JavaScript og kan åbnes i ny fane). */
export function LinkKnap({ href, children, ekstern, sekundaer = true }: { href: string; children: ReactNode; ekstern?: boolean; sekundaer?: boolean }) {
    return (
        <a className="fjv-knap fjv-linkknap" data-variant={sekundaer ? "sekundaer" : undefined} href={href}
            {...(ekstern ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {children}
        </a>
    );
}
