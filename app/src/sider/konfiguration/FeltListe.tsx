//-----------------------------------------------------------------------
// Et afsnits felter som tabel: etiket + forklaring + kilde, værdi, enhed.
// Avancerede felter og felter modellen ikke læser er skjult bag
// "Vis alle felter"; de sidste markeres "læses ikke af modellen".
//-----------------------------------------------------------------------

import { Fragment, type ReactNode } from "react";
import { Maerke } from "@/components/layout";
import type { VistBlad } from "./gruppering";
import type { Fund } from "./validering";
import type { Kladde, Udkast } from "./redigering";
import { FeltInput } from "./Felt";
import { visFelt } from "./vis";
import { feltnavn } from "./gruppering";
import { BRAENDSEL, enhedstypeNavn } from "./katalog";

export interface Redigering {
    aktiv: boolean;
    udkast: Udkast;
    sæt: (sti: string, k: Kladde | null) => void;
}

export function FeltMaerker({ b }: { b: VistBlad }) {
    return (
        <span className="kf-maerker">
            {b.bekraeft && <Maerke tone="advarsel">[BEKRÆFT]</Maerke>}
            {b.post && !b.post.laeses_af_koden && <Maerke tone="fejl">læses ikke af modellen</Maerke>}
            {b.post?.avanceret && b.post.laeses_af_koden && <Maerke>avanceret</Maerke>}
            {b.ukendt && <Maerke tone="advarsel">ikke i kataloget</Maerke>}
        </span>
    );
}

/** Visningsværdi med dansk navn for enhedstype og brændsel: "Varmepumpe (heat_pump)". */
function visFeltDansk(b: VistBlad): string {
    const v = visFelt(b.vaerdi_json);
    if (/^units\.[^.]+\.type$/.test(b.sti)) return `${enhedstypeNavn(v)} (${v})`;
    if (/^units\.[^.]+\.fuel$/.test(b.sti) && BRAENDSEL[v]) return `${BRAENDSEL[v]} (${v})`;
    return v;
}

export function FeltListe({ blade, visAlle, red, fund = [], valg, gruppe, tom = "Ingen felter i dette afsnit." }: {
    blade: readonly VistBlad[];
    visAlle: boolean;
    red: Redigering;
    fund?: readonly Fund[];
    /** Valgmuligheder for felter uden tilladte værdier i kataloget (fx tarifbånd). */
    valg?: (b: VistBlad) => readonly string[] | undefined;
    /** Overskrift som bladene grupperes under (fortløbende), fx "aFRR" eller enhedens navn. */
    gruppe?: (b: VistBlad) => string;
    tom?: string;
}) {
    const synlige = blade.filter((b) => visAlle || !b.skjult || red.udkast.has(b.sti) || fund.some((f) => f.sti === b.sti));
    if (synlige.length === 0) return <p className="fjv-tilstand">{tom}</p>;
    // Gruppeoverskrift ved hvert skift (beregnet før render, ikke ved at mutere under map).
    const grupper = synlige.map((b) => gruppe?.(b));
    return (
        <div className="fjv-tabelrul">
            <table className="fjv-tabel" data-layout="tabel">
                <thead><tr><th>Felt</th><th className="fjv-h">Værdi</th><th>Enhed</th></tr></thead>
                <tbody>
                    {synlige.map((b, i) => {
                        const g = grupper[i];
                        const overskrift: ReactNode = g !== undefined && (i === 0 || g !== grupper[i - 1]) ? <tr className="kf-gruppe"><td colSpan={3}>{g}</td></tr> : null;
                        const k = red.udkast.get(b.sti);
                        const egneFund = fund.filter((f) => f.sti === b.sti);
                        const lang = b.vaerdi_json.length > 40;
                        return (
                            <Fragment key={b.sti}>
                                {overskrift}
                                <tr className={k ? "kf-aendret" : undefined} data-sti={b.sti}>
                                    <td>
                                        <span className="kf-feltnavn">{feltnavn(b)}</span>
                                        <FeltMaerker b={b} />
                                        <div className="kf-sti">{b.sti}</div>
                                        {b.post?.forklaring && <div className="kf-forklaring">{b.post.forklaring}</div>}
                                        {b.kommentar && <div className="kf-kommentar" title="Kommentar fra kildefilen">{b.kommentar}</div>}
                                        {b.post?.kilde && <div className="kf-kilde">Kilde: {b.post.kilde}</div>}
                                        {egneFund.map((f) => <div key={f.besked} className="kf-felt-fejl" data-alvor={f.alvor}>{f.alvor === "fejl" ? "Fejl" : "Advarsel"}: {f.besked}</div>)}
                                    </td>
                                    <td className="fjv-h">
                                        {red.aktiv
                                            ? <FeltInput sti={b.sti} post={b.post} gammel={b.vaerdi_json} k={k} sæt={(x) => red.sæt(b.sti, x)} valg={valg?.(b)} />
                                            : <span className="kf-vaerdi" data-lang={lang ? "true" : undefined}>{visFeltDansk(b)}</span>}
                                    </td>
                                    <td>{b.post?.enhed ?? ""}</td>
                                </tr>
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
