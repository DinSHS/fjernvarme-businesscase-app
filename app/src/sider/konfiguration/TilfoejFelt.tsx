//-----------------------------------------------------------------------
// "Tilføj et felt" (runde 14c) under hvert afsnits felter og under den
// valgte enhed: katalogets felter, værket mangler, med forklaring, kilde og
// modellens standardværdi som udgangspunkt. Ét felt = én revision.
// Logikken står i manglende-felter.ts; advarslen om start i startstatus.ts.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Gitter, Knap, Kort, Maerke } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import { anvend } from "./redigering";
import { nyeFejl, type RedigeringsTilstand } from "./useRedigering";
import { validerVaerk } from "./validering";
import { redigerbarTekst } from "./vis";
import { manglendeFelter, tilfoejFelt } from "./manglende-felter";
import { START_ETIKET, startAdvarsel } from "./startstatus";

export function TilfoejFelt({ rt, sektioner, objekt }: { rt: RedigeringsTilstand; sektioner: readonly string[]; objekt?: string }) {
    const kandidater = useMemo(() => manglendeFelter(rt.nu, sektioner, objekt), [rt.nu, sektioner, objekt]);
    const [sti, setSti] = useState("");
    const [tekst, setTekst] = useState<string | null>(null);
    const k = kandidater.find((x) => x.sti === sti);
    const værdi = tekst ?? (k?.standard_json ? redigerbarTekst(k.standard_json) : "");
    const r = useMemo(() => (k ? tilfoejFelt(k, værdi) : null), [k, værdi]);
    const nyFund = useMemo(() => (r?.ændring ? nyeFejl(rt.grundFund, validerVaerk(anvend(rt.nu, [r.ændring]))) : []), [r, rt.grundFund, rt.nu]);
    if (kandidater.length === 0) return null;
    const kan = !!r?.ændring && nyFund.length === 0 && !rt.sender && !rt.red.aktiv;
    const vælg = (s: string) => { setSti(s); setTekst(null); };
    const tilføj = async () => { if (r?.ændring && (await rt.send([r.ændring]))) { setSti(""); setTekst(null); } };
    const liste = k?.post.tilladte?.map(String) ?? (k?.post.type === "boolean" ? ["ja", "nej"] : undefined);

    return (
        <details className="kf-tilfoej" data-layout="tilfoej-felt">
            <summary>Tilføj et felt, værket ikke har ({kandidater.length})</summary>
            <div className="kf-formular" data-spalter="2">
                <label>Felt
                    <select className="fjv-felt" value={sti} onChange={(e) => vælg(e.target.value)}>
                        <option value="">Vælg et felt</option>
                        {kandidater.map((x) => <option key={x.sti} value={x.sti}>{x.post.etiket} — {x.sti}</option>)}
                    </select>
                </label>
                {k && (
                    <label>Værdi{k.post.enhed && <small>{k.post.enhed}</small>}
                        {liste
                            ? <select className="fjv-felt" value={værdi} onChange={(e) => setTekst(e.target.value)}>
                                {!liste.includes(værdi) && <option value={værdi}>{værdi || "Vælg"}</option>}
                                {liste.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                            : <input className={`fjv-felt${k.post.type === "number" || k.post.type === "integer" ? " kf-tal-input" : ""}`}
                                inputMode={k.post.type === "number" || k.post.type === "integer" ? "decimal" : undefined}
                                aria-invalid={r?.fejl && tekst !== null ? true : undefined}
                                value={værdi} onChange={(e) => setTekst(e.target.value)} />}
                        {r?.fejl && tekst !== null && <span className="kf-felt-fejl">{r.fejl}</span>}
                    </label>
                )}
            </div>
            {k && (
                <div className="fjv-brod">
                    <p className="kf-sti">{k.sti}
                        <span className="kf-maerker">
                            {!k.post.laeses_af_koden && <Maerke tone="fejl">læses ikke af modellen</Maerke>}
                            {k.post.avanceret && <Maerke>avanceret</Maerke>}
                        </span>
                    </p>
                    <p className="kf-forklaring">{k.post.forklaring}</p>
                    <p className="kf-kilde">
                        {k.standard_json !== null
                            ? `Modellens standard: ${redigerbarTekst(k.standard_json)} (${k.standardKilde}). Med standarden regner modellen som før; feltet kan bagefter rettes og bruges i scenarier.`
                            : `Modellen har ingen standard for feltet — skriv værkets egen værdi. Kilde: ${k.post.kilde}.`}
                    </p>
                </div>
            )}
            {nyFund.length > 0 && <div className="kf-fund">{nyFund.map((x) => <span key={x.sti + x.besked} className="kf-felt-fejl">{x.besked}</span>)}</div>}
            <div className="kf-handlinger">
                <Knap onClick={tilføj} disabled={!kan}>{rt.sender ? "Tilføjer…" : "Tilføj feltet"}</Knap>
                {rt.red.aktiv && <span className="kf-kilde">Gem eller fortryd rettelserne først.</span>}
            </div>
        </details>
    );
}

/** Advarslen øverst på værkets side, når ingen enhed med start/stop-logik (unit commitment) er tændt ved start. */
export function StartAdvarselKort({ rt, kode }: { rt: RedigeringsTilstand; kode: string }) {
    const a = useMemo(() => startAdvarsel(rt.nu), [rt.nu]);
    if (!a) return null;
    return (
        <Gitter>
            <Kort titel="Starttilstand" afgraensning="initial_status" budskab={a.tekst}
                fod={`Modelrepoets værksark-script sætter «${START_ETIKET}» til 0 på hver enhed med start/stop-logik (scripts/vaerksark_til_yaml.py). Modellens standard, når feltet mangler, er 1 (tændt).`}>
                <ul className="kf-fund">
                    {a.enheder.map((n, i) => (
                        <li key={n}><Maerke tone="advarsel">slukket ved start</Maerke>
                            <span><a href={rutehref("konfiguration", kode, "enheder", n)}>{n}</a> <span className="kf-sti">{a.stier[i]} = 0</span></span>
                        </li>
                    ))}
                </ul>
            </Kort>
        </Gitter>
    );
}
