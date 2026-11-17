//-----------------------------------------------------------------------
// Fanen Balancering (runde 14c): "Tilføj balancemarked" til et værk uden
// balancing-blok og "Fjern balancemarkedet" igen. Ruterne er
// #/konfiguration/<kode>/balancering/tilfoej og …/fjern. Logikken står i
// balancemarked.ts; her vises HELE blokken med kilde pr. felt, før den
// gemmes som én revision.
//-----------------------------------------------------------------------

import { Fragment, useMemo, useState } from "react";
import { Gitter, Knap, Kort, Maerke } from "@/components/layout";
import { BUDSTRATEGI } from "@/lib/modelspejl";
import { rutehref } from "@/lib/rute";
import { findFelt } from "./katalog";
import { anvend } from "./redigering";
import { nyeFejl, type RedigeringsTilstand } from "./useRedigering";
import { validerVaerk } from "./validering";
import { redigerbarTekst, visFelt } from "./vis";
import {
    BALANCE_IKKE_TILBUDT, balanceEnheder, fjernBalancemarked, forvalgteEnheder, harBalancemarked, planlægBalancemarked,
    udgangspunkter, type Blokfelt, type UdgangspunktId,
} from "./balancemarked";
import type { ScenarieRef } from "./Enheder";

const DOK = rutehref("dokumentation", "budstrategi");

/** Kortet øverst på fanen Balancering: tilføj, når værket ingen blok har; ellers fjern. */
export function BalancemarkedKort({ kode, rt, gåTil }: { kode: string; rt: RedigeringsTilstand; gåTil: (s: string) => void }) {
    if (harBalancemarked(rt.nu)) {
        return (
            <Kort titel="Balancemarked" afgraensning="balancing-blokken"
                budskab="Værket har en balancing-blok; den bruges, når et scenarie kører med balancemarked."
                handling={<Knap sekundaer disabled={rt.red.aktiv} title={rt.red.aktiv ? "Gem eller fortryd rettelserne først." : undefined}
                    onClick={() => gåTil(`konfiguration/${kode}/balancering/fjern`)}>Fjern balancemarkedet…</Knap>}
                fod="Blokken kan rettes felt for felt med Redigér nedenfor." />
        );
    }
    return (
        <Kort titel="Balancemarked" afgraensning="ingen balancing-blok"
            budskab="Værket har ingen balancing-blok, så scenarier kan ikke regne med balancemarkedet. Et værk fra værksarket får ingen — modelrepoets script skriver den ikke."
            handling={<Knap disabled={rt.red.aktiv} title={rt.red.aktiv ? "Gem eller fortryd rettelserne først." : undefined}
                onClick={() => gåTil(`konfiguration/${kode}/balancering/tilfoej`)}>Tilføj balancemarked…</Knap>}
            fod={<>Blokken bygges af modelrepoets egne blokke (Andebys eller <a href={DOK}>BUDSTRATEGI.md</a> § 5) med værkets egne enhedsnavne.</>} />
    );
}

function Kilde({ f }: { f: Blokfelt }) {
    return (
        <>
            <div className="kf-kilde">{f.slags === "loft" || f.slags === "markedsloft" ? `Feltet: ${f.kilde} · værdien er jeres` : f.slags === "reference" ? `Feltet: ${f.kilde} · enheden er jeres` : f.kilde}</div>
            {f.kommentar && <div className="kf-kommentar" title="Kommentar i kilden">{f.kommentar}</div>}
        </>
    );
}

const HANDLING: Record<Blokfelt["handling"], string> = { opret: "oprettes", ret: "rettes", uændret: "står allerede" };

export function TilfoejBalancemarked({ kode, rt, gåTil }: { kode: string; rt: RedigeringsTilstand; gåTil: (s: string) => void }) {
    const muligheder = useMemo(() => udgangspunkter(), []);
    const enheder = useMemo(() => balanceEnheder(rt.nu), [rt.nu]);
    const [udgangspunkt, setUdgangspunkt] = useState<UdgangspunktId>("profil2");
    const [valgte, setValgte] = useState<string[]>(() => forvalgteEnheder(rt.nu));
    const [loft, setLoft] = useState<Record<string, string>>({});
    const [markedsloft, setMarkedsloft] = useState<Record<string, Record<string, string>>>({});
    const [reference, setReference] = useState<string | null>(null);
    const [vaerdier, setVaerdier] = useState<Record<string, string>>({});
    const [set, setSet] = useState(false);

    const ref = reference && valgte.includes(reference) ? reference : null;
    const plan = useMemo(() => planlægBalancemarked(rt.nu, { udgangspunkt, enheder: valgte, loft, markedsloft, reference: ref, vaerdier }),
        [rt.nu, udgangspunkt, valgte, loft, markedsloft, ref, vaerdier]);
    const nyFund = useMemo(() => (plan.fejl.length || plan.ændringer.length === 0 ? [] : nyeFejl(rt.grundFund, validerVaerk(anvend(rt.nu, plan.ændringer)))),
        [plan, rt.grundFund, rt.nu]);
    const valgt = muligheder.find((m) => m.id === udgangspunkt)!;
    const harReference = plan.felter.some((f) => f.slags === "reference");
    const harMarkedsloft = udgangspunkt === "andeby";
    const kan = plan.fejl.length === 0 && nyFund.length === 0 && plan.ændringer.length > 0 && set && !rt.sender && !rt.red.aktiv;

    if (harBalancemarked(rt.nu)) {
        return (
            <Gitter>
                <Kort titel="Tilføj balancemarked" budskab="Værket har allerede en balancing-blok.">
                    <a href={rutehref("konfiguration", kode, "balancering")}>Til fanen Balancering</a>
                </Kort>
            </Gitter>
        );
    }
    const skift = (u: UdgangspunktId) => { setUdgangspunkt(u); setVaerdier({}); setSet(false); };
    const vælg = (n: string, på: boolean) => { setValgte((v) => (på ? [...v, n] : v.filter((x) => x !== n))); setSet(false); };
    const gem = async () => { if (await rt.send(plan.ændringer)) gåTil(`konfiguration/${kode}/balancering`); };
    const bydere = enheder.filter((e) => e.kanByde);

    return (
        <>
            <Gitter form="8-4">
                <Kort titel="Tilføj balancemarked" afgraensning="trin 1 af 2 · værkets valg"
                    budskab={`Blokken bygges af ${udgangspunkt === "andeby" ? "Andebys blok" : "BUDSTRATEGI.md's fælles del og en profil"}; I tager stilling til enhederne og deres lofter.`}
                    fod={<>Kilde: {valgt.kilde}. BUDSTRATEGI.md:{BUDSTRATEGI.navne_linje}: enhedsnavnene skal være værkets egne. Tallene i kilden er eksempler og skal erstattes med værkets egne (BUDSTRATEGI.md:{BUDSTRATEGI.kvalificering_linje}).</>}>
                    <div className="kf-formular">
                        <label>Udgangspunkt
                            <select className="fjv-felt" value={udgangspunkt} onChange={(e) => skift(e.target.value as UdgangspunktId)}>
                                {muligheder.map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
                            </select>
                            <small>{valgt.resume} · {valgt.kilde}</small>
                        </label>
                        <fieldset className="kf-gruppefelt">
                            <legend>Prækvalificerede enheder <Maerke tone="advarsel">tag stilling</Maerke></legend>
                            {bydere.length === 0 && <p className="kf-svar" data-tone="fejl">Værket har ingen el-enheder (varmepumpe eller elkedel). Kun de kan byde.</p>}
                            {bydere.map((e) => (
                                <Fragment key={e.navn}>
                                    <label className="kf-kontakt">
                                        <input type="checkbox" checked={valgte.includes(e.navn)} onChange={(x) => vælg(e.navn, x.target.checked)} />
                                        <span className="fjv-mono">{e.navn}</span>
                                        {e.kvalificeret && <Maerke>prækvalificeret i værket</Maerke>}
                                        {!e.til && <Maerke tone="advarsel">slået fra</Maerke>}
                                    </label>
                                    {valgte.includes(e.navn) && (
                                        <div className="kf-formular" data-spalter="3">
                                            <label>Loft pr. enhed <small>MW el · per_unit_mw</small>
                                                <input className="fjv-felt kf-tal-input" inputMode="decimal" value={loft[e.navn] ?? ""}
                                                    aria-invalid={plan.fejl.some((f) => f.sti.endsWith(`.${e.navn}`)) ? true : undefined}
                                                    onChange={(x) => { setLoft((m) => ({ ...m, [e.navn]: x.target.value })); setSet(false); }} />
                                            </label>
                                            {harMarkedsloft && ["afrr", "mfrr"].map((m) => (
                                                <label key={m}>{m === "afrr" ? "aFRR" : "mFRR"} <small>MW el · tomt = intet loft</small>
                                                    <input className="fjv-felt kf-tal-input" inputMode="decimal" value={markedsloft[e.navn]?.[m] ?? ""}
                                                        onChange={(x) => { setMarkedsloft((v) => ({ ...v, [e.navn]: { ...v[e.navn], [m]: x.target.value } })); setSet(false); }} />
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </Fragment>
                            ))}
                        </fieldset>
                        {harReference && (
                            <label>Budtærsklen regnes for <Maerke tone="advarsel">tag stilling</Maerke>
                                <select className="fjv-felt" value={ref ?? ""} onChange={(e) => { setReference(e.target.value || null); setSet(false); }}>
                                    <option value="">Vælg en af de valgte enheder</option>
                                    {valgte.map((n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <small>{findFelt("balancing.reservation_gate.afrr.opportunity_cost.reference_unit")?.forklaring}</small>
                            </label>
                        )}
                    </div>
                    {plan.fejl.length > 0 && <ul className="kf-fund">{plan.fejl.map((f) => <li key={f.sti + f.besked}><Maerke tone="fejl">mangler</Maerke><span>{f.besked}</span></li>)}</ul>}
                    {plan.advarsler.length > 0 && <ul className="kf-fund">{plan.advarsler.map((a) => <li key={a}><Maerke tone="advarsel">advarsel</Maerke><span>{a}</span></li>)}</ul>}
                </Kort>
                <Kort titel="Kilden" afgraensning="modelrepoet ved pinnen"
                    budskab="Andebys blok er modelrepoets referenceværk; profil 1–4 er BUDSTRATEGI.md's budprofiler oven på den fælles del."
                    fod={<>Profilerne forklares i <a href={DOK}>BUDSTRATEGI.md</a> § 4.</>}>
                    <ul className="kf-fund">
                        {muligheder.map((m) => <li key={m.id}><span><strong>{m.navn}</strong>: {m.resume}. <span className="kf-kilde">{m.kilde}</span></span></li>)}
                        {BALANCE_IKKE_TILBUDT.map((x) => <li key={x.navn}><span><strong>{x.navn}</strong> (ikke her): {x.grund} <span className="kf-kilde">{x.kilde}</span></span></li>)}
                    </ul>
                </Kort>
            </Gitter>
            <Gitter>
                <Kort titel="Hele blokken" afgraensning={`trin 2 af 2 · ${plan.ændringer.length} ændringer i én revision`}
                    budskab={plan.fejl.length ? "Udfyld det markerede i trin 1; så vises blokken, som den gemmes." : `${plan.felter.filter((f) => f.handling === "opret").length} felter oprettes og ${plan.felter.filter((f) => f.handling === "ret").length} rettes. Gennemse dem, og bekræft.`}
                    fod="Tal markeret 'eksempel' er kildens og kan rettes her eller bagefter under Redigér. Blokken kan fjernes igen fra fanen Balancering.">
                    <div className="fjv-tabelrul">
                        <table className="fjv-tabel" data-layout="tabel">
                            <thead><tr><th>Felt</th><th className="fjv-h">Værdi</th><th>Hvad sker der</th></tr></thead>
                            <tbody>
                                {plan.felter.map((f) => {
                                    const post = findFelt(f.sti);
                                    const rettet = vaerdier[f.sti];
                                    const fejl = plan.fejl.find((x) => x.sti === f.sti)?.besked;
                                    return (
                                        <tr key={f.sti} data-sti={f.sti} className={f.handling === "uændret" ? "kf-uden-virkning" : undefined}>
                                            <td>
                                                <span className="kf-feltnavn">{post?.etiket ?? f.sti}</span>
                                                <span className="kf-maerker">
                                                    {f.tagStilling && <Maerke tone="advarsel">tag stilling</Maerke>}
                                                    {f.eksempel && <Maerke>eksempel</Maerke>}
                                                </span>
                                                <div className="kf-sti">{f.sti}</div>
                                                {f.tagStilling && <div className="kf-forklaring">{f.tagStilling}</div>}
                                                <Kilde f={f} />
                                                {fejl && <div className="kf-felt-fejl">{fejl}</div>}
                                            </td>
                                            <td className="fjv-h">
                                                {f.slags === "blok" && f.vaerdi_json !== null && post?.type === "number"
                                                    ? <input className="fjv-felt kf-tal-input" inputMode="decimal" aria-label={f.sti}
                                                        value={rettet ?? redigerbarTekst(f.vaerdi_json)}
                                                        onChange={(e) => { setVaerdier((v) => ({ ...v, [f.sti]: e.target.value })); setSet(false); }} />
                                                    : <span className="kf-vaerdi">{f.vaerdi_json === null ? "–" : visFelt(f.vaerdi_json)}</span>}
                                                {post?.enhed && <div className="kf-kilde">{post.enhed}</div>}
                                            </td>
                                            <td>{HANDLING[f.handling]}{f.handling === "ret" && f.gammel !== null ? ` (fra ${visFelt(f.gammel)})` : ""}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {nyFund.length > 0 && <div className="kf-fund">{nyFund.map((x) => <span key={x.sti + x.besked} className="kf-felt-fejl">{x.sti}: {x.besked}</span>)}</div>}
                    <div className="kf-handlinger">
                        <label className="kf-kontakt">
                            <input type="checkbox" checked={set} disabled={plan.fejl.length > 0} onChange={(e) => setSet(e.target.checked)} />
                            Jeg har set hele blokken og taget stilling til de markerede felter
                        </label>
                    </div>
                    <div className="kf-handlinger">
                        <Knap onClick={gem} disabled={!kan}>{rt.sender ? "Gemmer…" : "Gem blokken"}</Knap>
                        <Knap sekundaer onClick={() => gåTil(`konfiguration/${kode}/balancering`)}>Annullér</Knap>
                        {rt.red.aktiv && <span className="kf-svar" data-tone="fejl">Gem eller fortryd rettelserne i værket først.</span>}
                        {rt.svar && <span className="kf-svar" data-tone={rt.svar.tone}>{rt.svar.tekst}</span>}
                    </div>
                </Kort>
            </Gitter>
        </>
    );
}

export function FjernBalancemarked({ kode, rt, gåTil, scenarieAendringer, scenarier }: {
    kode: string; rt: RedigeringsTilstand; gåTil: (s: string) => void;
    scenarieAendringer: readonly { scenarie_id: string; type: string; sti: string }[] | undefined;
    scenarier: readonly ScenarieRef[];
}) {
    const plan = useMemo(() => fjernBalancemarked(rt.nu), [rt.nu]);
    const refs = scenarieAendringer ? [...new Set(scenarieAendringer.filter((æ) => æ.sti.startsWith("balancing.")).map((æ) => æ.scenarie_id))] : undefined;
    const navne = (refs ?? []).map((id) => scenarier.find((s) => s.id === id)?.navn ?? id);
    const nyFund = useMemo(() => (plan.ændringer.length ? nyeFejl(rt.grundFund, validerVaerk(anvend(rt.nu, plan.ændringer))) : []), [plan, rt.grundFund, rt.nu]);
    const kan = plan.ændringer.length > 0 && refs !== undefined && navne.length === 0 && nyFund.length === 0 && !rt.sender && !rt.red.aktiv;
    return (
        <Gitter>
            <Kort titel="Fjern balancemarkedet" afgraensning={`${plan.stier.length} felter i én revision`}
                budskab={plan.stier.length ? "Hele balancing-blokken slettes. Ændringen logges og kan ses i revisionsloggen; blokken kan lægges til igen." : "Værket har ingen balancing-blok."}
                fod="Prækvalifikationen på enhederne (units.<enhed>.ancillary) står urørt — den er enhedernes egne felter.">
                <ul className="kf-fund">{plan.stier.map((s) => <li key={s}><span className="kf-sti">{s}</span><span>{visFelt(rt.nu.get(s) ?? "null")}</span></li>)}</ul>
                {refs === undefined && <p className="kf-kilde">Tjekker scenarier…</p>}
                {navne.length > 0 && <p className="kf-svar" data-tone="fejl">Kan ikke fjernes: scenarierne {navne.join(", ")} ændrer felter i blokken. Ret eller arkivér dem først.</p>}
                {nyFund.length > 0 && <div className="kf-fund">{nyFund.map((x) => <span key={x.sti + x.besked} className="kf-felt-fejl">{x.sti}: {x.besked}</span>)}</div>}
                <div className="kf-handlinger">
                    <Knap disabled={!kan} onClick={async () => { if (await rt.send(plan.ændringer)) gåTil(`konfiguration/${kode}/balancering`); }}>
                        {rt.sender ? "Fjerner…" : "Fjern blokken"}</Knap>
                    <Knap sekundaer onClick={() => gåTil(`konfiguration/${kode}/balancering`)}>Annullér</Knap>
                    {rt.svar && <span className="kf-svar" data-tone={rt.svar.tone}>{rt.svar.tekst}</span>}
                </div>
            </Kort>
        </Gitter>
    );
}
