//-----------------------------------------------------------------------
// Delte UI-primitiver: kort, felter, select, badge, tema-skifter.
// Farverne er temaets tokens (src/styles/temaer/) — definér ikke nye farver her.
//-----------------------------------------------------------------------

import { type ReactNode } from "react";
import { TemaVaelger } from "@/components/layout/TemaVaelger";

export const CARD =
    "rounded-2xl border border-[var(--dash-hairline)] bg-card shadow-[0_1px_2px_rgba(8,20,38,0.06),0_8px_24px_-12px_rgba(8,20,38,0.25)]";

export function Eyebrow({ children }: { children: ReactNode }) {
    return (
        <span className="text-[10px] font-semibold uppercase text-[var(--dash-ink-3)]"
            style={{ fontFamily: "var(--font-monospace)", letterSpacing: "0.14em" }}>
            {children}
        </span>
    );
}

export function Card({ title, hint, action, children, className = "" }: {
    title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
    return (
        <section className={`${CARD} flex flex-col p-4 ${className}`}>
            {title && (
                <header className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-[13px] font-semibold text-[var(--dash-ink)]">{title}</h2>
                    {action ?? (hint && <Eyebrow>{hint}</Eyebrow>)}
                </header>
            )}
            {children}
        </section>
    );
}

export function Skeleton({ h = 240 }: { h?: number }) {
    return <div className="animate-pulse rounded-lg bg-[var(--dash-elevated)]" style={{ height: h }} />;
}

export function Segmented({ options, value, onChange }: {
    options: { label: string; value: string | null }[]; value: string | null; onChange: (v: string | null) => void;
}) {
    return (
        <div className="inline-flex rounded-lg border border-[var(--dash-hairline)] bg-card p-0.5">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button key={o.label} type="button" onClick={() => onChange(o.value)}
                        className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                            active ? "bg-[var(--dash-navy)] text-white" : "text-[var(--dash-ink-2)] hover:text-[var(--dash-ink)]"
                        }`}>
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Fælles feltstil — også brugt af tekstområderne på siderne, så stilen kun står ét sted. */
export const FELT_BASE =
    "w-full rounded-lg border bg-card px-2.5 py-1.5 text-[13px] text-[var(--dash-ink)] " +
    "outline-none transition-colors focus:border-[var(--dash-series)] focus:ring-2 focus:ring-[var(--dash-series)]/25 " +
    "disabled:opacity-50";

/** Tekstfelt til formularrækker. `fejl` giver rød ramme + aria-invalid. */
export function TextField({ value, onChange, placeholder, fejl, label, maxLength }: {
    value: string; onChange: (v: string) => void; placeholder?: string;
    fejl?: string; label: string; maxLength?: number;
}) {
    return (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder} aria-label={label} maxLength={maxLength}
            aria-invalid={fejl ? true : undefined} title={fejl}
            className={`${FELT_BASE} ${fejl ? "border-[var(--dash-neg)]" : "border-[var(--dash-hairline)]"}`} />
    );
}

/**
 * Select til formularrækker. Tom værdi rendres som en "vælg…"-placeholder.
 *
 * Bruges til felter med få faste valg (status, årsag).
 */
export function SelectField({ value, onChange, options, placeholder, fejl, label }: {
    value: string; onChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder: string; fejl?: string; label: string;
}) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
            aria-invalid={fejl ? true : undefined} title={fejl}
            className={`${FELT_BASE} ${fejl ? "border-[var(--dash-neg)]" : "border-[var(--dash-hairline)]"} ${
                value ? "" : "text-[var(--dash-ink-3)]"
            }`}>
            <option value="">{placeholder}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

type BadgeTone = "neutral" | "ok" | "advarsel" | "fejl";

const BADGE_TONE: Record<BadgeTone, string> = {
    neutral: "bg-[var(--dash-elevated)] text-[var(--dash-ink-2)]",
    ok: "bg-[var(--dash-pos)]/12 text-[var(--dash-pos)]",
    advarsel: "bg-[var(--dash-amber)]/14 text-[var(--dash-amber)]",
    fejl: "bg-[var(--dash-neg)]/12 text-[var(--dash-neg)]",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE_TONE[tone]}`}>
            {children}
        </span>
    );
}

export function Button({ children, onClick, variant = "primary", disabled, type = "button" }: {
    children: ReactNode; onClick?: () => void;
    variant?: "primary" | "ghost"; disabled?: boolean; type?: "button" | "submit";
}) {
    const styles = variant === "primary"
        ? "bg-[var(--dash-navy)] text-white hover:bg-[var(--dash-series)] disabled:hover:bg-[var(--dash-navy)]"
        : "border border-[var(--dash-hairline)] bg-card text-[var(--dash-ink-2)] hover:text-[var(--dash-ink)]";
    return (
        <button type={type} onClick={onClick} disabled={disabled}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>
            {children}
        </button>
    );
}

/**
 * Den gamle lys/mørk-knap er erstattet af temavælgeren (brief 22). Propsene ignoreres:
 * temaet og modus ejes nu af src/styles/tema.ts. App.tsx kan skifte til `<TemaVaelger />`
 * direkte (ønske til fundamentet, fv-design2) — indtil da peger denne på den.
 */
export function ThemeToggle(props: { isDark: boolean; onToggle: () => void }) {
    void props;
    return <TemaVaelger />;
}
