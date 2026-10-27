//-----------------------------------------------------------------------
// #/konfiguration/nyt — guiden "Nyt værk fra bunden" (brief 15 B):
// navn/kode → klima og priszone → varmebehov → enheder → lager → priser og
// tarif → gennemse → opret. Alt regnes i nyt-vaerk.ts; her er kun formularerne.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Gitter, Knap, Kort, Maerke, Side, Tabel } from "@/components/layout";
import { useVaerker } from "@/lib/data/hooks";
import { opdaterAlt } from "@/lib/data/opdatering";
import { rutehref } from "@/lib/rute";
import type { OmraadeProps } from "../typer";
import { AFSNIT, BRAENDSEL, ENHEDSTYPER, afsnitFor, enhedstypeNavn, findFelt } from "./katalog";
import { KWH_PR_M3_K } from "./gruppering";
import { NYT_VAERK_SKABELON } from "./nyt-vaerk.data";
import {
    TRIN, bygVaerk, effektAf, enhedsværdi, foreslåKode, kapacitet, prisfelter, skalerVarmelast, startUdkast, talAf, tjekTrin,
    RESERVEREDE_KODER, type NytVaerkSkabelon, type TrinId, type Udkast,
} from "./nyt-vaerk";
import { opretVaerk } from "@/lib/data/skriv";
import { dk, dkFri, redigerbarTekst, visFelt } from "./vis";

export default function NytVaerk(props: OmraadeProps) {
    const s = NYT_VAERK_SKABELON;
    if (!s) {
        return (
            <Side omraade="Konfiguration" titel="Nyt værk" budskab="Guiden venter på skabelonen for et minimalt værk — indtil da kan et nyt værk oprettes som kopi.">
                <Kort titel="Nyt værk fra bunden" afgraensning="ikke klar endnu"
                    budskab="Skabelonen (viden/nyt_vaerk_skabelon.json) er ikke lagt ind i appen endnu."
                    fod="Når skabelonen findes, bygges guiden af den: navn og kode, klima, varmebehov, enheder, lager, priser og tarif.">
                    <a className="fjv-knap" data-variant="sekundaer" href={rutehref("konfiguration")}>Til værkerne og "Kopiér værk"</a>
                </Kort>
            </Side>
        );
    }
    return <Guide {...props} s={s} />;
}

function Guide({ gåTil, bruger, s }: OmraadeProps & { s: NytVaerkSkabelon }) {
    const vaerker = useVaerker(true);
    const optagneKoder = useMemo(() => new Set([...(vaerker.data ?? []).map((v) => v.kode), ...RESERVEREDE_KODER]), [vaerker.data]);
    const ctx = { optagneKoder };
    const [u, setU] = useState<Udkast>(() => startUdkast(s));
    const [trin, setTrin] = useState<TrinId>("navn");
    const [sender, setSender] = useState(false);
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string }>();
    const i = TRIN.findIndex((t) => t.id === trin);
    const fejl = tjekTrin(trin, u, s, ctx);
    const opdater = (f: (x: Udkast) => Udkast) => setU((x) => f(x));
    const vaerk = useMemo(() => (trin === "gennemse" ? bygVaerk(u, s) : null), [trin, u, s]);

    const opret = async () => {
        if (!vaerk) return;
        setSender(true); setSvar(undefined);
        try {
            const r = await opretVaerk(u.kode, u.navn.trim(), vaerk.blade, bruger);
            if (r.ok && r.status === "udfoert") { opdaterAlt(); gåTil(`konfiguration/${u.kode}/kom-i-gang`); }
            else setSvar({ ok: false, tekst: r.svar || "Oprettelsen blev afvist." });
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { setSender(false); }
    };

    return (
        <Side omraade="Konfiguration" titel={u.navn.trim() ? `Nyt værk: ${u.navn.trim()}` : "Nyt værk"}
            budskab={`Trin ${i + 1} af ${TRIN.length}: ${TRIN[i].navn.toLowerCase()}. Værket bygges af en minimal, gyldig skabelon; skønnede værdier er markeret [BEKRÆFT].`}
            handlinger={<a className="fjv-knap" data-variant="sekundaer" href={rutehref("konfiguration")}>Annullér</a>}>
            <Gitter form="3-9">
                <Kort titel="Trin" afgraensning={`${i + 1} af ${TRIN.length}`}
                    budskab={fejl.length ? `${fejl.length} ${fejl.length === 1 ? "ting" : "ting"} mangler på dette trin.` : "Trinnet er udfyldt."}
                    fod={`Skabelon: ${s.kilde}`}>
                    <ol className="kf-trin">
                        {TRIN.map((t, j) => {
                            const ok = j < i || (j === i && !fejl.length);
                            return (
                                <li key={t.id} aria-current={t.id === trin ? "step" : undefined}>
                                    <button type="button" className="kf-trinknap" disabled={j > i && TRIN.slice(0, j).some((x) => x.id !== "gennemse" && tjekTrin(x.id, u, s, ctx).length > 0)}
                                        onClick={() => setTrin(t.id)}>
                                        <span className="kf-trinnr" data-ok={ok ? "true" : undefined}>{j + 1}</span>{t.navn}
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </Kort>
                <Kort titel={TRIN[i].navn} afgraensning={u.kode || "nyt værk"} budskab={trinBudskab(trin, u, s)}
                    fod={fejl.length ? <span className="kf-fund">{fejl.map((f) => <span key={f} className="kf-felt-fejl">{f}</span>)}</span> : trinFod(trin, s)}>
                    {trin === "navn" && <TrinNavn u={u} opdater={opdater} />}
                    {trin === "klima" && <TrinKlima u={u} s={s} opdater={opdater} />}
                    {trin === "varme" && <TrinVarme u={u} s={s} opdater={opdater} />}
                    {trin === "enheder" && <TrinEnheder u={u} s={s} opdater={opdater} />}
                    {trin === "lager" && <TrinLager u={u} opdater={opdater} />}
                    {trin === "priser" && <TrinPriser u={u} s={s} opdater={opdater} />}
                    {trin === "gennemse" && vaerk && <TrinGennemse vaerk={vaerk} />}
                    <div className="kf-handlinger">
                        {i > 0 && <Knap sekundaer onClick={() => setTrin(TRIN[i - 1].id)}>Tilbage</Knap>}
                        {trin !== "gennemse" && <Knap onClick={() => setTrin(TRIN[i + 1].id)} disabled={fejl.length > 0}>Næste</Knap>}
                        {trin === "gennemse" && (
                            <Knap onClick={opret} disabled={fejl.length > 0 || sender || !bruger}>
                                {sender ? "Opretter…" : "Opret værk"}
                            </Knap>
                        )}
                        {svar && <span className="kf-svar" data-tone={svar.ok ? "ok" : "fejl"} role="status">{svar.tekst}</span>}
                    </div>
                </Kort>
            </Gitter>
        </Side>
    );
}

type Opdater = (f: (x: Udkast) => Udkast) => void;

function trinBudskab(trin: TrinId, u: Udkast, s: NytVaerkSkabelon): string {
    switch (trin) {
        case "navn": return "Navnet vises i appen; koden er værkets faste nøgle og kan ikke ændres senere.";
        case "klima": return `Vejrdata fra ${u.dmi}, spot- og balancepriser fra ${u.zone}.`;
        case "varme": {
            const g = talAf(u.varme.gwh);
            return g ? `Varmelasten skaleres fra skabelonens ${dkFri(s.varmelast.reference_gwh)} GWh til ${dkFri(g, 1)} GWh om året.` : "Skriv værkets årlige varmebehov.";
        }
        case "enheder": {
            if (!u.enheder.length) return "Tilføj mindst én enhed.";
            const k = kapacitet(u, s);
            const sp = k.spidslast !== null ? `; spidslasten er ca. ${dkFri(k.spidslast, 1)} MW` : "";
            return `${u.enheder.length} ${u.enheder.length === 1 ? "enhed" : "enheder"} med ${dkFri(k.styrbar, 1)} MW styrbar varme${sp}${k.spidslast !== null && k.styrbar >= k.spidslast ? " — dækket." : "."}`;
        }
        case "lager": {
            const kap = u.lagre.reduce((x, l) => x + ((talAf(l.volumen) ?? 0) * KWH_PR_M3_K * (talAf(l.deltaT) ?? 0)) / 1000, 0);
            return u.lagre.length ? `${u.lagre.length} ${u.lagre.length === 1 ? "lager" : "lagre"} på i alt ${dk(kap, 0)} MWh.` : "Intet lager — trinnet er valgfrit.";
        }
        case "priser": {
            const bekræft = s.blade.filter((b) => b.bekraeft && (b.sti.startsWith("prices.") || b.sti.startsWith("electricity.")) && !u.priser.get(b.sti)?.trim()).length;
            return bekræft ? `${bekræft} priser og tarifsatser er skøn fra skabelonen og markeret [BEKRÆFT].` : "Alle priser og satser er sat af dig.";
        }
        case "gennemse": {
            const r = bygVaerk(u, s);
            const b = r.blade.filter((x) => x.bekraeft).length;
            const f = r.fund.filter((x) => x.alvor === "fejl").length;
            return f ? `${f} fejl skal rettes, før værket kan oprettes.` : `${r.blade.length} felter er klar; ${b} af dem er skøn, der bør bekræftes efter oprettelsen.`;
        }
    }
}

function trinFod(trin: TrinId, s: NytVaerkSkabelon): string {
    // Brugertekst. Skabelonens guide_trin-regler er skrevet til udviklere (filnavne, validering.md), så tallene
    // tages derfra, men ikke ordlyden.
    switch (trin) {
        case "navn": return "Koden: små bogstaver, cifre og _ (højst 60 tegn).";
        case "klima": return findFelt("data.dmi_area")?.forklaring ?? "";
        case "varme": return `Formel (modelrepoets, som værksarket): ${s.varmelast.tekst}${s.varmelast.kilde ? ` — ${s.varmelast.kilde}` : ""}.${s.varmelast.forbehold ? ` ${s.varmelast.forbehold}` : ""}${s.egneAntagelser?.length ? ` Egne antagelser i skabelonen: ${s.egneAntagelser.join(" ")}` : ""}`;
        case "enheder": return `Mindst én enhed, og tilsammen skal de dække spidslasten (ca. ${String(s.spidslastPrGwh ?? 0.38).replace(".", ",")} MW pr. GWh/år; solvarme tæller ikke med). Det gælder også med timedata: værket og prøvekørslen regner på varmelastmodellen, indtil et scenarie vælger en fil. Felterne starter med typens skønnede værdier — erstat dem med værkets egne; resten kan rettes efter oprettelsen.`;
        case "lager": return "Kapacitet = volumen × 1,163 kWh/(m³·K) × ΔT / 1000. Startindhold sættes halvfuldt og tab pr. time som Andebys tanke — begge [BEKRÆFT].";
        case "priser": return "Ekskl. moms. electricity_tax og elafgift_net holdes ens (paritetsreglen). Priser og tarifbånd er Andebys (cases/andeby.yaml i modelrepoet; kilden står ved hvert felt) og markeret [BEKRÆFT].";
        case "gennemse": return "Værket kontrolleres med modellens egne regler før oprettelsen og oprettes i én transaktion som revision 1 med kilde 'Appen'; hvert felt logges i revisionsloggen.";
    }
}

// ------------------------------------------------------------------ trinnene

function TrinNavn({ u, opdater }: { u: Udkast; opdater: Opdater }) {
    const [rørt, setRørt] = useState(false);
    return (
        <div className="kf-formular" data-spalter="2">
            <label>Navn <small>fx Fjernvarme Vesterby</small>
                <input className="fjv-felt" value={u.navn} onChange={(e) => { const n = e.target.value; opdater((x) => ({ ...x, navn: n, kode: rørt ? x.kode : foreslåKode(n) })); }} />
            </label>
            <label>Kode <small>værkets faste nøgle</small>
                <input className="fjv-felt fjv-mono" value={u.kode} onChange={(e) => { setRørt(true); const k = e.target.value.trim(); opdater((x) => ({ ...x, kode: k })); }} />
            </label>
        </div>
    );
}

function TrinKlima({ u, s, opdater }: { u: Udkast; s: NytVaerkSkabelon; opdater: Opdater }) {
    return (
        <div className="kf-formular" data-spalter="2">
            <label>Klima (DMI-område) <small>{findFelt("data.dmi_area")?.etiket}</small>
                <select className="fjv-felt" value={u.dmi} onChange={(e) => { const d = e.target.value; opdater((x) => ({ ...x, dmi: d })); }}>
                    {s.dmi.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
            </label>
            <label>Priszone <small>DK1 vest for Storebælt, DK2 øst for</small>
                <select className="fjv-felt" value={u.zone} onChange={(e) => { const z = e.target.value; opdater((x) => ({ ...x, zone: z })); }}>
                    {s.zoner.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
            </label>
            {(u.dmi === "fyn" || u.dmi === "vestkyst") && (
                <p className="kf-svar" data-tone="fejl">{u.dmi} mangler vejrdata 28. februar 2026{u.dmi === "fyn" ? " og 1. januar 2026" : ""} — en kørsel hen over de dage fejler (validering.md §2).</p>
            )}
        </div>
    );
}

function TrinVarme({ u, s, opdater }: { u: Udkast; s: NytVaerkSkabelon; opdater: Opdater }) {
    const g = talAf(u.varme.gwh);
    const prøve = g && g > 0 ? skalerVarmelast(s.blade, s.varmelast, g) : null;
    const profil = prøve ? (JSON.parse(prøve.find((b) => b.sti === "heat_load_params.baseline_profile_mw")?.vaerdi_json ?? "[]") as number[]) : [];
    const gaf = prøve ? prøve.find((b) => b.sti === "heat_load_params.gaf_mw_per_k")?.vaerdi_json : undefined;
    return (
        <div className="kf-formular">
            <div className="kf-handlinger" role="radiogroup" aria-label="Varmebehov">
                <label className="kf-kontakt"><input type="radio" checked={u.varme.kilde === "gwh"} onChange={() => opdater((x) => ({ ...x, varme: { ...x.varme, kilde: "gwh" } }))} />Årligt varmebehov i GWh</label>
                <label className="kf-kontakt"><input type="radio" checked={u.varme.kilde === "timedata"} onChange={() => opdater((x) => ({ ...x, varme: { ...x.varme, kilde: "timedata" } }))} />Jeg har timedata</label>
            </div>
            {u.varme.kilde === "timedata" && (
                <p className="fjv-brod">Målte timedata kan endnu kun komme fra modelrepoets <span className="fjv-mono">data/</span>-mappe, og de vælges pr. scenarie (feltet "Målt varmelast"), ikke i værket. Værket skal alligevel have en varmelastmodel — den bruges, når et scenarie ikke angiver timedata, også i prøvekørslen efter oprettelsen. Skriv derfor værkets årlige varmebehov herunder; enhederne skal kunne dække den last, det giver.</p>
            )}
            <label>Årligt varmebehov <small>GWh pr. år</small>
                <input className="fjv-felt kf-tal-input" inputMode="decimal" value={u.varme.gwh} onChange={(e) => { const v = e.target.value; opdater((x) => ({ ...x, varme: { ...x.varme, gwh: v } })); }} />
            </label>
            {profil.length === 24 && (
                <p className="fjv-brod">Grundprofilen bliver {dk(Math.min(...profil), 1)}–{dk(Math.max(...profil), 1)} MW (time 0–23 UTC), og lasten stiger {gaf ? visFelt(gaf) : "–"} MW pr. grad koldere.</p>
            )}
        </div>
    );
}

function TrinEnheder({ u, s, opdater }: { u: Udkast; s: NytVaerkSkabelon; opdater: Opdater }) {
    const [nyType, setNyType] = useState(Object.keys(ENHEDSTYPER)[0]);
    const sæt = (j: number, rel: string, v: string) => opdater((x) => ({ ...x, enheder: x.enheder.map((e, k) => (k === j ? { ...e, værdier: new Map(e.værdier).set(rel, v) } : e)) }));
    const tilføj = () => opdater((x) => {
        const base = nyType.replace(/_.*$/, "") || "enhed";
        let navn = base; let n = 2;
        while (x.enheder.some((e) => e.navn === navn)) navn = `${base}_${n++}`;
        return { ...x, enheder: [...x.enheder, { type: nyType, navn, værdier: new Map() }] };
    });
    return (
        <div className="kf-formular">
            {u.enheder.map((e, j) => {
                const t = ENHEDSTYPER[e.type];
                const felter = ["p_max_heat", "p_min_heat", ...(t?.paakraevede.includes("eta_fuel_to_heat") ? ["eta_fuel_to_heat"] : []), "var_om"];
                const sk = (rel: string) => enhedsværdi(e, rel);
                return (
                    <fieldset key={j} className="kf-gruppefelt">
                        <legend>{enhedstypeNavn(e.type)} · <span className="fjv-mono">{e.navn}</span></legend>
                        <div className="kf-formular" data-spalter="2">
                            <label>Navn
                                <input className="fjv-felt fjv-mono" value={e.navn} onChange={(ev) => { const n = ev.target.value.trim(); opdater((x) => ({ ...x, enheder: x.enheder.map((y, k) => (k === j ? { ...y, navn: n } : y)) })); }} />
                            </label>
                            <label>Brændsel
                                <select className="fjv-felt" value={e.værdier.get("fuel") ?? redigerbarTekst(sk("fuel"))} disabled={(t?.fuel.length ?? 0) < 2} onChange={(ev) => sæt(j, "fuel", ev.target.value)}>
                                    {(t?.fuel ?? []).map((f) => <option key={f} value={f}>{BRAENDSEL[f] ?? f}</option>)}
                                </select>
                            </label>
                            {felter.map((rel) => {
                                const p = findFelt(`units.x.${rel}`);
                                return (
                                    <label key={rel}>{p?.etiket ?? rel}<small>{p?.enhed ?? ""}{e.værdier.has(rel) ? "" : rel === "p_max_heat" && e.forvalg && e.type === "gas_boiler" ? " · følger varmebehovet [BEKRÆFT]" : e.forvalg?.get(rel)?.bekraeft !== false ? " · egen antagelse: typens pladsholder [BEKRÆFT]" : " · skabelonens værdi"}</small>
                                        <input className="fjv-felt kf-tal-input" inputMode="decimal"
                                            value={e.værdier.get(rel) ?? (rel === "p_max_heat" ? String(effektAf(e, u, s)).replace(".", ",") : redigerbarTekst(sk(rel)))}
                                            onChange={(ev) => sæt(j, rel, ev.target.value)} />
                                    </label>
                                );
                            })}
                        </div>
                        <div className="kf-handlinger"><Knap sekundaer onClick={() => opdater((x) => ({ ...x, enheder: x.enheder.filter((_, k) => k !== j) }))}>Fjern enheden</Knap></div>
                    </fieldset>
                );
            })}
            <div className="kf-handlinger">
                <select className="fjv-felt kf-smal" aria-label="Enhedstype" value={nyType} onChange={(e) => setNyType(e.target.value)}>
                    {Object.entries(ENHEDSTYPER).map(([k, t]) => <option key={k} value={k}>{t.navn}</option>)}
                </select>
                <Knap sekundaer onClick={tilføj}>Tilføj enhed</Knap>
            </div>
        </div>
    );
}

function TrinLager({ u, opdater }: { u: Udkast; opdater: Opdater }) {
    const sæt = (j: number, felt: "navn" | "volumen" | "deltaT" | "pLad" | "pAflad", v: string) =>
        opdater((x) => ({ ...x, lagre: x.lagre.map((l, k) => (k === j ? { ...l, [felt]: felt === "navn" ? v.trim() : v } : l)) }));
    return (
        <div className="kf-formular">
            {u.lagre.length === 0 && <p className="fjv-tilstand">Intet lager. Et lager kan også tilføjes senere — eller afprøves som et scenarie.</p>}
            {u.lagre.map((l, j) => {
                const kap = ((talAf(l.volumen) ?? 0) * KWH_PR_M3_K * (talAf(l.deltaT) ?? 0)) / 1000;
                return (
                    <fieldset key={j} className="kf-gruppefelt">
                        <legend>Lager · <span className="fjv-mono">{l.navn}</span> · {dk(kap, 1)} MWh</legend>
                        <div className="kf-formular" data-spalter="2">
                            <label>Navn<input className="fjv-felt fjv-mono" value={l.navn} onChange={(e) => sæt(j, "navn", e.target.value)} /></label>
                            <label>Volumen <small>m³</small><input className="fjv-felt kf-tal-input" inputMode="decimal" value={l.volumen} onChange={(e) => sæt(j, "volumen", e.target.value)} /></label>
                            <label>ΔT <small>K — forskel mellem top og bund</small><input className="fjv-felt kf-tal-input" inputMode="decimal" value={l.deltaT} onChange={(e) => sæt(j, "deltaT", e.target.value)} /></label>
                            <label>Maks. ladeeffekt <small>MW</small><input className="fjv-felt kf-tal-input" inputMode="decimal" value={l.pLad} onChange={(e) => sæt(j, "pLad", e.target.value)} /></label>
                            <label>Maks. afladeeffekt <small>MW</small><input className="fjv-felt kf-tal-input" inputMode="decimal" value={l.pAflad} onChange={(e) => sæt(j, "pAflad", e.target.value)} /></label>
                        </div>
                        <div className="kf-handlinger"><Knap sekundaer onClick={() => opdater((x) => ({ ...x, lagre: x.lagre.filter((_, k) => k !== j) }))}>Fjern lageret</Knap></div>
                    </fieldset>
                );
            })}
            <div className="kf-handlinger">
                <Knap sekundaer onClick={() => opdater((x) => ({ ...x, lagre: [...x.lagre, { navn: x.lagre.length ? `tank_${x.lagre.length + 1}` : "tank", volumen: "", deltaT: "", pLad: "", pAflad: "" }] }))}>Tilføj lager</Knap>
            </div>
        </div>
    );
}

function TrinPriser({ u, s, opdater }: { u: Udkast; s: NytVaerkSkabelon; opdater: Opdater }) {
    const felter = prisfelter(u, s);
    return (
        <div className="fjv-tabelrul">
            <table className="fjv-tabel" data-layout="tabel">
                <thead><tr><th>Felt</th><th className="fjv-h">Værdi</th><th>Enhed</th></tr></thead>
                <tbody>
                    {felter.map((sti) => {
                        const b = s.blade.find((x) => x.sti === sti);
                        const p = findFelt(sti);
                        const egen = u.priser.get(sti);
                        const fri = sti.split(".").slice(-2, -1)[0];
                        return (
                            <tr key={sti}>
                                <td>
                                    <span className="kf-feltnavn">{p?.etiket ?? sti}{sti.startsWith("prices.") ? ` · ${BRAENDSEL[sti.split(".")[1]] ?? sti.split(".")[1]}` : /bands|fixed_components/.test(sti) ? ` · ${sti.split(".").pop()}` : ""}</span>
                                    <span className="kf-maerker">{b?.bekraeft && !egen?.trim() && <Maerke tone="advarsel">[BEKRÆFT]</Maerke>}{!b && <Maerke tone="fejl">mangler — en enhed bruger {fri}</Maerke>}</span>
                                    <div className="kf-sti">{sti}{b?.kilde && !egen?.trim() ? ` · ${b.kilde}` : ""}</div>
                                </td>
                                <td className="fjv-h">
                                    <input className="fjv-felt kf-tal-input" inputMode="decimal" aria-label={p?.etiket ?? sti}
                                        value={egen ?? (b ? redigerbarTekst(b.vaerdi_json) : "")}
                                        onChange={(e) => { const v = e.target.value; opdater((x) => ({ ...x, priser: new Map(x.priser).set(sti, v) })); }} />
                                </td>
                                <td>{p?.enhed ?? ""}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function TrinGennemse({ vaerk }: { vaerk: ReturnType<typeof bygVaerk> }) {
    const pr = AFSNIT.filter((a) => a.id !== "oevrige").map((a) => {
        const b = vaerk.blade.filter((x) => afsnitFor(x.sti.split(".")[0]) === a.id);
        return { id: a.id, navn: a.navn, antal: b.length, bekraeft: b.filter((x) => x.bekraeft).length };
    }).filter((r) => r.antal > 0);
    const fejl = vaerk.fund.filter((f) => f.alvor === "fejl");
    const adv = vaerk.fund.filter((f) => f.alvor === "advarsel");
    return (
        <>
            <Tabel rækker={pr} nøgle={(r) => r.id}
                kolonner={[
                    { navn: "Afsnit", vis: (r) => r.navn },
                    { navn: "Felter", vis: (r) => r.antal, tal: true },
                    { navn: "[BEKRÆFT]", vis: (r) => r.bekraeft || "", tal: true },
                ]} />
            {(fejl.length > 0 || adv.length > 0 || vaerk.fejl.length > 0) && (
                <ul className="kf-fund">
                    {vaerk.fejl.map((f) => <li key={f}><Maerke tone="fejl">fejl</Maerke><span>{f}</span></li>)}
                    {[...fejl, ...adv].map((f) => <li key={f.sti + f.besked}><Maerke tone={f.alvor === "fejl" ? "fejl" : "advarsel"}>{f.alvor}</Maerke><span><span className="kf-sti">{f.sti}</span> {f.besked}</span></li>)}
                </ul>
            )}
        </>
    );
}
