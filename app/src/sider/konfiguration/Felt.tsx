//-----------------------------------------------------------------------
// Inputfelter typet efter kataloget: tal (dansk komma), valg, kontakt,
// tekst og lister som tabel. Alt kodes med kodVaerdi via `kladde()`.
//-----------------------------------------------------------------------

import { useState } from "react";
import { BRAENDSEL, enhedstypeNavn, type FeltPost } from "./katalog";

/** Dansk navn i valglisten for enhedstype og brændsel; værdien er stadig modellens nøgle. */
function valgEtiket(sti: string, m: string): string {
    if (/^units\.[^.]+\.type$/.test(sti)) return `${enhedstypeNavn(m)} (${m})`;
    if (/^units\.[^.]+\.fuel$/.test(sti) && BRAENDSEL[m]) return `${BRAENDSEL[m]} (${m})`;
    return m;
}
import { kladde, listeJson, type Celle, type Kladde } from "./redigering";
import { parseJV, serialiserJV, type JV } from "./jsontekst";
import { redigerbarTekst } from "./vis";

interface FeltProps {
    sti: string;
    post: FeltPost | null;
    /** Værdien i databasen nu. */
    gammel: string;
    /** Brugerens kladde, hvis feltet er rørt. */
    k: Kladde | undefined;
    sæt: (k: Kladde | null) => void;
    /** Valgmuligheder ud over katalogets (fx tarifbånd). */
    valg?: readonly string[];
    etiket?: string;
}

export function FeltInput({ sti, post, gammel, k, sæt, valg, etiket }: FeltProps) {
    const nu = k?.json ?? gammel;
    const aria = etiket ?? post?.etiket ?? sti;
    const ændr = (tekst: string) => {
        const ny = kladde(post, gammel, tekst);
        sæt(ny.json === gammel && !ny.fejl ? null : ny);
    };

    if (post?.type === "object" || gammel.trim().startsWith("{")) {
        return <span className="kf-vaerdi">{gammel === "{}" ? "(tom blok)" : gammel}</span>;
    }
    if (post?.type === "boolean" || nu === "true" || nu === "false") {
        return (
            <label className="kf-kontakt">
                <input type="checkbox" aria-label={aria} checked={nu === "true"} onChange={(e) => ændr(e.target.checked ? "ja" : "nej")} />
                {nu === "true" ? "Ja" : "Nej"}
            </label>
        );
    }
    const muligheder = valg ?? (post?.tilladte ? post.tilladte.map(String) : undefined);
    if (muligheder && muligheder.length) {
        const aktuel = redigerbarTekst(nu);
        const liste = muligheder.includes(aktuel) ? muligheder : [aktuel, ...muligheder];
        return (
            <select className="fjv-felt" aria-label={aria} value={aktuel} onChange={(e) => ændr(e.target.value)}>
                {liste.map((m) => <option key={m} value={m}>{valgEtiket(sti, m)}</option>)}
            </select>
        );
    }
    if (post?.type === "list" || gammel.trim().startsWith("[")) {
        return <ListeInput sti={sti} gammel={gammel} k={k} sæt={sæt} aria={aria} />;
    }
    const talfelt = post?.type === "number" || post?.type === "integer";
    return (
        <span>
            <input className={`fjv-felt${talfelt ? " kf-tal-input" : ""}`} aria-label={aria} aria-invalid={k?.fejl ? true : undefined}
                inputMode={talfelt ? "decimal" : undefined}
                value={k?.tekst ?? redigerbarTekst(gammel)} onChange={(e) => ændr(e.target.value)} />
            {k?.fejl && <div className="kf-felt-fejl">{k.fejl}</div>}
        </span>
    );
}

// ------------------------------------------------------------------ lister


function cellerFra(jv: JV): { kolonner: string[] | null; rækker: Celle[][] } {
    if (jv.t !== "liste") return { kolonner: null, rækker: [] };
    const objekter = jv.v.length > 0 && jv.v.every((x) => x.t === "objekt");
    if (objekter) {
        const kolonner = [...new Set(jv.v.flatMap((x) => (x as Extract<JV, { t: "objekt" }>).v.map(([n]) => n)))];
        return {
            kolonner,
            rækker: jv.v.map((x) => kolonner.map((n) => {
                const c = (x as Extract<JV, { t: "objekt" }>).v.find(([m]) => m === n)?.[1];
                const base = c ? serialiserJV(c) : "null";
                return { tekst: redigerbarTekst(base), base };
            })),
        };
    }
    return { kolonner: null, rækker: jv.v.map((x) => { const base = serialiserJV(x); return [{ tekst: redigerbarTekst(base), base }]; }) };
}

function ListeInput({ sti, gammel, k, sæt, aria }: { sti: string; gammel: string; k: Kladde | undefined; sæt: (k: Kladde | null) => void; aria: string }) {
    const [tilstand, setTilstand] = useState(() => {
        try { return cellerFra(parseJV(k?.json ?? gammel)); } catch { return null; }
    });
    if (!tilstand) {
        // Ikke en liste vi kan vise som tabel — rediger som JSON-tekst.
        return (
            <span>
                <textarea className="fjv-felt" aria-label={aria} rows={3} value={k?.tekst ?? gammel}
                    onChange={(e) => { const ny = kladde(null, gammel, e.target.value); sæt(ny.json === gammel ? null : ny); }} />
                {k?.fejl && <div className="kf-felt-fejl">{k.fejl}</div>}
            </span>
        );
    }
    const { kolonner, rækker } = tilstand;
    const opdater = (nye: Celle[][]) => {
        setTilstand({ kolonner, rækker: nye });
        try {
            const json = listeJson(kolonner, nye);
            sæt(json === gammel ? null : { tekst: json, json, fejl: null });
        } catch (e) {
            sæt({ tekst: "", json: null, fejl: e instanceof Error ? e.message : String(e) });
        }
    };
    const ret = (i: number, j: number, tekst: string) => opdater(rækker.map((r, a) => (a === i ? r.map((c, b) => (b === j ? { ...c, tekst } : c)) : r)));
    const tilføj = () => {
        const skabelon = rækker[rækker.length - 1] ?? (kolonner ?? [""]).map(() => ({ tekst: "", base: "0.0" }));
        opdater([...rækker, skabelon.map((c) => ({ ...c }))]);
    };
    const fjern = (i: number) => opdater(rækker.filter((_, a) => a !== i));

    return (
        <div className="kf-liste" data-sti={sti}>
            {kolonner ? (
                <div className="fjv-tabelrul">
                    <table className="fjv-tabel">
                        <thead><tr><th>#</th>{kolonner.map((n) => <th key={n} className="fjv-h">{n}</th>)}<th /></tr></thead>
                        <tbody>
                            {rækker.map((r, i) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    {r.map((c, j) => (
                                        <td key={j} className="fjv-h">
                                            <input className="fjv-felt kf-tal-input" aria-label={`${aria}: række ${i + 1}, ${kolonner[j]}`} inputMode="decimal"
                                                value={c.tekst} onChange={(e) => ret(i, j, e.target.value)} />
                                        </td>
                                    ))}
                                    <td><button type="button" className="fjv-knap" data-variant="sekundaer" onClick={() => fjern(i)} aria-label={`Fjern række ${i + 1}`}>Fjern</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="kf-liste-gitter">
                    {rækker.map((r, i) => (
                        <label key={i}>
                            {i}
                            <input className="fjv-felt kf-tal-input" aria-label={`${aria}: element ${i + 1}`} value={r[0].tekst} onChange={(e) => ret(i, 0, e.target.value)} />
                        </label>
                    ))}
                </div>
            )}
            <div className="kf-handlinger">
                <button type="button" className="fjv-knap" data-variant="sekundaer" onClick={tilføj}>Tilføj {kolonner ? "række" : "element"}</button>
                {!kolonner && rækker.length > 0 && (
                    <button type="button" className="fjv-knap" data-variant="sekundaer" onClick={() => fjern(rækker.length - 1)}>Fjern sidste</button>
                )}
                <span className="kf-kilde">{rækker.length} {kolonner ? "rækker" : "elementer"}</span>
            </div>
            {k?.fejl && <div className="kf-felt-fejl">{k.fejl}</div>}
        </div>
    );
}
