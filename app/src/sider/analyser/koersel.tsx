//-----------------------------------------------------------------------
// #/analyser/<koersel_id> — én kørsel: objektiv med usikkerhed, hvad den
// svarer på, enhedsfordeling, måneder, balancering, lager, dispatch, input.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, Gitter, Knap, Kort, Maerke, Side, StatusMaerke, Tabel } from "@/components/layout";
import { erAktiv } from "@/lib/data/koersel-status";
import { tal, tidspunkt } from "@/lib/format";
import { rutehref } from "@/lib/rute";
import type { OmraadeProps } from "../typer";
import {
    absolutGab, aendringTekst, BALANCE_KOLONNER, enhedstype, profilbundne, farvepladser, gabTekst, koerselsAendringer, koerselsVarighed, loesningTekst,
    spoergsmaal, spor, stoersteEnhed,
} from "./beregn";
import { usePakke, type Pakke } from "./data";
import { DataIKoersel } from "./data-kort";
import { Commit, Fakta, SporMaerke } from "./dele";
import DispatchKort from "./dispatch-kort";
import { egneRaekker, useKandidatInfo } from "./kandidat-data";
import Kandidatliste from "./kandidatliste";
import { kandidater } from "./kandidater";
import { NOEGLETAL_TEKST } from "./etiketter.data";
import { dec, ellers, energi, gabPct, maanedKort, pctVaerdi, periodeTekst, varighed } from "./fmt";
import { Bjaelker, Forklaring, PunktRaekke, StablededeSoejler } from "./grafer";
import { forbehold, SPOR_A_FORBEHOLD, SPOR_B_FORBEHOLD } from "./tekster";

/**
 * Én kørsel. `sammenlign` = kandidatlisten er åben (ruten `#/analyser/<id>/sammenlign`,
 * så den kan linkes og fotograferes). Kandidaterne hentes én gang her og deles af
 * knappen for den naturlige reference og listen.
 */
export default function KoerselSide({ id, gåTil, sammenlign = false }: { id: string; gåTil: OmraadeProps["gåTil"]; sammenlign?: boolean }) {
    const p = usePakke(id);
    const k = p.koersel;
    const alle = useKandidatInfo();
    const færdig = p.data && k?.status === "faerdig" ? p.data : null;
    const top = useMemo(() => {
        if (!færdig || !alle.data) return undefined;
        return kandidater({ k: færdig.k, scenarie: færdig.scenarie, vaerkNavn: færdig.vaerkNavn, input: egneRaekker(færdig.input) }, alle.data).anbefalet[0];
    }, [færdig, alle.data]);
    const titel = p.data?.scenarie?.navn ?? "Kørsel";
    const budskab = p.data && k?.status === "faerdig" ? sideBudskab(p.data) : k ? statusBudskab(k.status, k.fase, k.fejlbesked) : p.data === null ? "Kørslen findes ikke." : undefined;
    return (
        <Side omraade="Analyser · Kørsel" titel={titel} budskab={budskab}
            handlinger={<>
                <Knap sekundaer onClick={() => gåTil("analyser")}>Alle kørsler</Knap>
                {færdig && top?.naturlig && (
                    <Knap onClick={() => gåTil(`analyser/sammenlign/${top.k.id}/${færdig.k.id}`)} title={`${top.navn} bliver referencen`}>
                        Sammenlign med referencen: {top.navn}
                    </Knap>
                )}
                {færdig && (
                    <Knap sekundaer onClick={() => gåTil(sammenlign ? `analyser/${id}` : `analyser/${id}/sammenlign`)}>
                        {sammenlign ? "Luk listen over sammenligninger" : "Hvad kan den sammenlignes med?"}
                    </Knap>
                )}
            </>}>
            <DataTilstand h={p} højde={300}>
                {(d) => !d ? <Kort titel="Kørslen findes ikke" budskab="Den kan være slettet, eller linket er forkert."><a className="fjv-a-link" href={rutehref("analyser")}>Til alle kørsler</a></Kort>
                    : d.k.status !== "faerdig" ? <IkkeFaerdig d={d} />
                        : <>{sammenlign && <Gitter><Kandidatliste pakke={d} alle={alle} /></Gitter>}<Resultater d={d} /></>}
            </DataTilstand>
        </Side>
    );
}

function statusBudskab(status: string, fase?: string | null, fejl?: string | null): string {
    if (status === "fejl") return `Kørslen fejlede${fejl ? `: ${fejl.split("\n")[0]}` : "."}`;
    if (status === "annulleret") return "Kørslen blev annulleret — der er ingen resultater.";
    if (erAktiv(status)) return `Kørslen er i gang${fase ? ` (${fase})` : ""}; resultaterne vises, når den er færdig.`;
    return "Kørslen har ingen resultater.";
}

function sideBudskab(d: Pakke): string {
    const s = d.samlet;
    const st = stoersteEnhed(s.enheder);
    const g = absolutGab(d.k);
    const dele = [`${d.vaerkNavn}, ${periodeTekst(d.profil.periode_start, d.profil.periode_slut)}: driften koster ${ellers(s.objektiv_dkk ?? d.k.objektiv_dkk, tal)} kr.`];
    if (g.kr !== null) dele[0] += ` (${gabTekst(g)})`;
    if (st?.andel_pct != null) dele.push(`${st.navn} leverer ${pctVaerdi(st.andel_pct, 0)} af varmen`);
    return `${dele.join("; ")}.`;
}

function IkkeFaerdig({ d }: { d: Pakke }) {
    return (
        <>
        <Gitter form="8-4">
            <Kort titel="Status" budskab={statusBudskab(d.k.status, d.k.fase, d.k.fejlbesked)}>
                <Fakta par={[
                    ["Status", <StatusMaerke status={d.k.status} />],
                    ["Fase", d.k.fase ?? "–"],
                    !!d.k.fejlbesked && ["Fejlbesked", <span style={{ whiteSpace: "pre-wrap" }}>{d.k.fejlbesked}</span>],
                    ["Bestilt", `${tidspunkt(d.k.bestilt)} af ${d.k.bestilt_af}`],
                    ["Startet", tidspunkt(d.k.startet)],
                    ["Afsluttet", tidspunkt(d.k.afsluttet)],
                ]} />
            </Kort>
            <Spoergsmaal d={d} />
        </Gitter>
        <Gitter>
            <DataIKoersel d={d} />
        </Gitter>
        </>
    );
}

function Spoergsmaal({ d }: { d: Pakke }) {
    const linjer = spoergsmaal(d.input);
    const v = koerselsVarighed(d.k);
    return (
        <Kort titel="Hvad kørslen svarer på" afgraensning={d.scenarie?.navn} budskab={`${linjer.join("; ")}.`}>
            {linjer.length > 3 && <ul className="fjv-a-liste">{linjer.map((l) => <li key={l}>{l}</li>)}</ul>}
            <Fakta par={[
                ["Værk", `${d.vaerkNavn} · revision ${d.k.vaerk_revision}`],
                ["Periode", periodeTekst(d.profil.periode_start, d.profil.periode_slut)],
                ["Opløsning", d.k.oploesning ? `${d.k.oploesning}${d.k.antal_interval_model ? ` · ${tal(d.k.antal_interval_model)} intervaller` : ""}` : "–"],
                ["Modelversion", <Commit sha={d.k.model_commit} />],
                ["Data (df-data)", <Commit sha={d.k.data_commit} />],
                ["Bestilt", `${tidspunkt(d.k.bestilt)} af ${d.k.bestilt_af}${d.k.kilde === "notebook" ? " (notebook)" : ""}`],
                v != null && ["Varighed", varighed(v)],
            ]} />
        </Kort>
    );
}

function Resultater({ d }: { d: Pakke }) {
    const pladser = useMemo(() => farvepladser([...d.objekter.enheder, ...d.samlet.enheder.map((e) => e.navn)]), [d.objekter.enheder, d.samlet.enheder]);
    return (
        <>
            <Gitter form="4-8">
                <Objektiv d={d} />
                <Spoergsmaal d={d} />
            </Gitter>
            <Gitter>
                <DataIKoersel d={d} />
            </Gitter>
            <Gitter form="8-4">
                <Enheder d={d} pladser={pladser} />
                <VarmeOgMiljoe d={d} />
            </Gitter>
            <Gitter>
                <Maaneder d={d} pladser={pladser} />
            </Gitter>
            {/* Balancetabellen har 7 kolonner (marked × produkt, review A1) og får hele bredden. */}
            <Gitter>
                <Balancering d={d} />
            </Gitter>
            <Gitter>
                <Lager d={d} />
            </Gitter>
            <Gitter>
                <DispatchKort a={d} pladser={pladser} />
            </Gitter>
            <Gitter>
                <FrosnetInput d={d} />
            </Gitter>
        </>
    );
}

function Objektiv({ d }: { d: Pakke }) {
    const g = absolutGab(d.k);
    const obj = d.samlet.objektiv_dkk ?? d.k.objektiv_dkk ?? null;
    const ok = (d.k.solve_status ?? "").toLowerCase() === "optimal";
    return (
        <Kort titel="Driftsomkostning" afgraensning="objektiv, hele perioden"
            budskab={g.kr === null ? "Usikkerheden kendes ikke — brug tallet varsomt i differenser." : `Tallet er ${gabTekst(g)} — ${loesningTekst(d.k.solve_status)}.`}
            fod={NOEGLETAL_TEKST.objektiv_dkk?.forklaring}>
            <div className="fjv-a-helt">{ellers(obj, tal)}<small>kr.</small></div>
            <div className="fjv-a-raekke"><Maerke tone={ok ? "ok" : "advarsel"}>{ok ? "Optimal" : d.k.solve_status ?? "ukendt status"}</Maerke></div>
            <Fakta par={[
                ["Opnået gab", d.k.opnaaet_gap != null ? gabPct(d.k.opnaaet_gap) : g.kilde === "oensket_loft" ? `≤ ${gabPct(g.rel ?? 0)} (loft)` : "ukendt"],
                ["Usikkerhed", g.kr === null ? "ukendt" : `højst ${tal(g.kr)} kr. for højt`],
                ["Ønsket gab", `${ellers(d.k.oensket_rel_gap, gabPct)} eller ${ellers(d.k.oensket_abs_gap, (x) => `${tal(x)} kr.`)}`],
                d.k.best_bound != null && ["Bedste grænse", `${tal(d.k.best_bound)} kr.`],
                d.k.loesetid_s != null && ["Løsetid", varighed(d.k.loesetid_s)],
            ]} />
        </Kort>
    );
}

function Enheder({ d, pladser }: { d: Pakke; pladser: Map<string, number> }) {
    const e = d.samlet.enheder;
    const producerer = e.filter((x) => (x.produktion_mwh ?? 0) > 0);
    const st = stoersteEnhed(e);
    const profil = profilbundne(d.input);
    const budskab = st?.andel_pct != null
        ? `${st.navn} leverer ${pctVaerdi(st.andel_pct, 0)} af varmen; ${producerer.length} af ${e.length} aktive enheder producerer.`
        : "Ingen enheder producerede i perioden.";
    return (
        <Kort titel="Varmeproduktion pr. enhed" afgraensning="hele perioden" budskab={budskab}
            fod="Fuldlasttimer = produktion ÷ nominel varmeeffekt (beregnet her; modellens 'fuldlasttimer' er antal driftsintervaller). Driftstimer = intervaller med produktion × intervallets længde. For profilbundne enheder (markeret *, fx solvarme) regnes fuldlasttimer mod nominel effekt, ikke mod profilen.">
            <Bjaelker enhed="MWh" rækker={e.map((x) => ({
                navn: x.navn, plads: pladser.get(x.navn) ?? 0, værdi: x.produktion_mwh ?? 0,
                etiket: `${tal(x.produktion_mwh ?? 0)} MWh · ${ellers(x.andel_pct, (v) => pctVaerdi(v, 0))}`,
            }))} />
            <Tabel rækker={e} nøgle={(x) => x.navn} kolonner={[
                { navn: "Enhed", vis: (x) => x.navn },
                { navn: "Type", vis: (x) => `${enhedstype(d.input, x.navn) ?? "–"}${profil.has(x.navn) ? " *" : ""}` },
                { navn: "MWh", vis: (x) => ellers(x.produktion_mwh, tal), tal: true },
                { navn: "Andel", vis: (x) => ellers(x.andel_pct, (v) => pctVaerdi(v)), tal: true },
                { navn: "Driftstimer", vis: (x) => ellers(x.driftstimer, tal), tal: true },
                { navn: "Fuldlasttimer", vis: (x) => ellers(x.fuldlasttimer, tal), tal: true },
                { navn: "Nominel MW", vis: (x) => ellers(x.p_max_mw, (v) => dec(v, 1)), tal: true },
                { navn: "Kap.faktor", vis: (x) => ellers(x.kapacitetsfaktor_pct, (v) => pctVaerdi(v)), tal: true },
            ]} />
        </Kort>
    );
}

function VarmeOgMiljoe({ d }: { d: Pakke }) {
    const s = d.samlet;
    const lagerNetto = s.produktion_mwh != null && s.varmebehov_mwh != null ? s.produktion_mwh - s.varmebehov_mwh : null;
    return (
        <Kort titel="Varme og miljø" afgraensning="hele perioden"
            budskab={s.nettab_pct != null ? `Nettabet er ${pctVaerdi(s.nettab_pct)} af varmebehovet.` : s.varmebehov_mwh != null ? `Varmebehovet er ${energi(s.varmebehov_mwh)} (målt last — nettab indgår i målingen).` : undefined}
            fod={NOEGLETAL_TEKST.samlet_produktion_mwh?.forklaring}>
            <Fakta par={[
                ["Varmebehov", ellers(s.varmebehov_mwh, (v) => `${tal(v)} MWh`)],
                ["Samlet produktion", ellers(s.produktion_mwh, (v) => `${tal(v)} MWh`)],
                lagerNetto != null && ["Produktion − behov", `${lagerNetto > 0 ? "+" : lagerNetto < 0 ? "−" : ""}${tal(Math.abs(lagerNetto))} MWh`],
                ["Nettab", ellers(s.nettab_mwh, (v) => `${tal(v)} MWh`)],
                ["CO₂-udledning", ellers(s.co2_ton, (v) => `${tal(v)} t`)],
            ]} />
        </Kort>
    );
}

function Maaneder({ d, pladser }: { d: Pakke; pladser: Map<string, number> }) {
    const t = d.maaneder;
    const enheder = t.objekter("produktion_gwh");
    const ordnet = [...enheder].sort((a, b) => (t.periode(b, "produktion_gwh") ?? 0) - (t.periode(a, "produktion_gwh") ?? 0));
    const søjler = t.maaneder.map((m) => {
        const behov = t.vaerdi(m, null, "varmebehov_gwh");
        return {
            etiket: maanedKort(m),
            dele: ordnet.map((e) => ({ navn: e, plads: pladser.get(e) ?? 0, værdi: t.vaerdi(m, e, "produktion_gwh") ?? 0 })),
            markør: behov, topEtiket: behov == null ? undefined : dec(behov, 2),
        };
    });
    const behovMaaned = t.maaneder.map((m) => [m, t.vaerdi(m, null, "varmebehov_gwh") ?? 0] as const).sort((a, b) => b[1] - a[1]);
    const budskab = t.maaneder.length === 0 ? "Ingen månedstal for kørslen."
        : t.maaneder.length === 1 ? `Hele perioden ligger i ${maanedKort(t.maaneder[0])} (${ellers(t.periode(null, "antal_interval"), tal)} intervaller); varmebehovet er ${ellers(t.periode(null, "varmebehov_gwh"), (v) => dec(v, 2))} GWh.`
            : `Varmebehovet topper i ${maanedKort(behovMaaned[0][0])} med ${dec(behovMaaned[0][1], 2)} GWh af periodens ${ellers(t.periode(null, "varmebehov_gwh"), (v) => dec(v, 2))} GWh.`;
    const rækker = [...t.maaneder, "periode"];
    return (
        <Kort titel="Måned for måned" afgraensning="lokale måneder (dansk tid), GWh" budskab={budskab}
            fod="Rækken 'Hele perioden' er regnet på kørslens fulde, uafrundede tidsserie — ikke som summen af de viste måneder. En måned med færre intervaller end døgn × 24 er en delmåned. Spotprisen er tidsvægtet, ikke produktionsvægtet.">
            <Forklaring serier={ordnet.map((e) => ({ navn: e, plads: pladser.get(e) ?? 0 }))} ekstra={<span><i className="fjv-a-streg" />Varmebehov</span>} />
            <StablededeSoejler søjler={søjler} enhed="GWh" markørNavn="Varmebehov" formatér={(v) => `${dec(v, 3)} GWh`} />
            <div className="fjv-a-panel-titel">Spotpris, tidsvægtet middel (kr./MWh)</div>
            <PunktRaekke punkter={t.maaneder.map((m) => ({ etiket: maanedKort(m), værdi: t.vaerdi(m, null, "spot_middel_dkk_mwh") }))} enhed="kr./MWh" formatér={(v) => tal(v)} />
            <Tabel rækker={rækker} nøgle={(m) => m} kolonner={[
                { navn: "Måned", vis: (m) => (m === "periode" ? <strong>Hele perioden</strong> : maanedKort(m)) },
                { navn: "Intervaller", vis: (m) => ellers(m === "periode" ? t.periode(null, "antal_interval") : t.vaerdi(m, null, "antal_interval"), tal), tal: true },
                { navn: "Varmebehov", vis: (m) => ellers(m === "periode" ? t.periode(null, "varmebehov_gwh") : t.vaerdi(m, null, "varmebehov_gwh"), (v) => dec(v, 2)), tal: true },
                ...ordnet.map((e) => ({ navn: e, vis: (m: string) => ellers(m === "periode" ? t.periode(e, "produktion_gwh") : t.vaerdi(m, e, "produktion_gwh"), (v) => dec(v, 2)), tal: true })),
                { navn: "Spot kr./MWh", vis: (m) => ellers(m === "periode" ? t.periode(null, "spot_middel_dkk_mwh") : t.vaerdi(m, null, "spot_middel_dkk_mwh"), tal), tal: true },
                { navn: "Udetemp. °C", vis: (m) => ellers(m === "periode" ? t.periode(null, "udetemp_middel_c") : t.vaerdi(m, null, "udetemp_middel_c"), (v) => dec(v, 1)), tal: true },
            ]} />
        </Kort>
    );
}

function Balancering({ d }: { d: Pakke }) {
    const b = d.samlet.balance;
    const sp = spor(d.input);
    if (!b) {
        return (
            <Kort titel="Balancemarked" afgraensning="aFRR og mFRR" budskab="Kørt uden balancemarked — ingen balancetal.">
                <p className="fjv-brod">Balancemarkedets værdi findes som differensen i driftsomkostning mellem denne kørsel og en kørsel med
                    balancemarked for samme værk og periode. Vælg dem begge i listen og tryk Sammenlign.</p>
            </Kort>
        );
    }
    const rk = [["aFRR", b.afrr], ["mFRR", b.mfrr], ["I alt", b.i_alt]] as const;
    const kol = b.harProdukter ? BALANCE_KOLONNER : BALANCE_KOLONNER.filter((k) => k.felt === "netto" || k.felt === "brutto");
    const budskab = b.harProdukter
        ? `Netto ${ellers(b.i_alt.netto, tal)} kr., heraf kapacitet ${ellers(b.i_alt.kapacitet, tal)} og aktivering ${ellers(b.i_alt.aktivering_netto, tal)} kr.; aFRR ${ellers(b.afrr.netto, tal)} og mFRR ${ellers(b.mfrr.netto, tal)} kr.`
        : `Netto ${ellers(b.i_alt.netto, tal)} kr.: aFRR ${ellers(b.afrr.netto, tal)} og mFRR ${ellers(b.mfrr.netto, tal)} kr. — brutto ${ellers(b.i_alt.brutto, tal)} kr.`;
    return (
        <Kort titel="Balancemarked" afgraensning="hele perioden, pr. marked og produkt, kr." budskab={budskab}
            fod={<>{forbehold("altid ved balancetal")} {sp === "A" ? SPOR_A_FORBEHOLD : SPOR_B_FORBEHOLD} Brutto = netto + {BALANCE_KOLONNER[2].etiket.toLowerCase()}: {BALANCE_KOLONNER[2].forklaring}
                {b.harProdukter ? " 'I alt' for produkterne er aFRR + mFRR af de uafrundede tal." : " Fordelingen på kapacitet og aktivering for hele perioden findes ikke for denne kørsel (publiceret før måleregister v3); se et vindue under Intervaldispatch."}</>}>
            <div className="fjv-a-raekke"><SporMaerke spor={sp} /></div>
            <Tabel rækker={rk} nøgle={(r) => r[0]} kolonner={[
                { navn: "Marked", vis: (r) => (r[0] === "I alt" ? <strong>I alt</strong> : r[0]) },
                ...kol.map((k) => ({ navn: k.etiket, vis: (r: (typeof rk)[number]) => ellers(r[1][k.felt], tal), tal: true })),
            ]} />
        </Kort>
    );
}

function Lager({ d }: { d: Pakke }) {
    const l = d.samlet.lagre;
    const op = l.reduce((a, x) => a + (x.opladet_mwh ?? 0), 0), af = l.reduce((a, x) => a + (x.afladet_mwh ?? 0), 0);
    return (
        <Kort titel="Lager" afgraensning="hele perioden, MWh"
            budskab={l.length === 0 ? "Ingen aktive lagre i kørslen." : `${l.length === 1 ? "Tanken" : `De ${l.length} lagre`} ladede ${tal(op)} MWh op og afladede ${tal(af)} MWh.`}
            fod={<>Niveau ved start er modellens første interval, hvor lagerbalancen er ubundet (kendt defekt). {forbehold("ved MILP og skyggepriser")}</>}>
            {l.length > 0 && (
                <Tabel rækker={l} nøgle={(x) => x.navn} kolonner={[
                    { navn: "Lager", vis: (x) => x.navn },
                    { navn: "Start", vis: (x) => ellers(x.niveau_start_mwh, tal), tal: true },
                    { navn: "Slut", vis: (x) => ellers(x.niveau_slut_mwh, tal), tal: true },
                    { navn: "Højeste", vis: (x) => ellers(x.niveau_max_mwh, tal), tal: true },
                    { navn: "Opladet", vis: (x) => ellers(x.opladet_mwh, tal), tal: true },
                    { navn: "Afladet", vis: (x) => ellers(x.afladet_mwh, tal), tal: true },
                ]} />
            )}
            <Fakta par={[["Tankens værdi", d.samlet.tank_arbitrage_dkk == null
                ? "ikke tilgængelig (MILP) — regn den som differensen mod en kørsel uden tank"
                : `${tal(d.samlet.tank_arbitrage_dkk)} kr. (skyggepris)`]]} />
        </Kort>
    );
}

function FrosnetInput({ d }: { d: Pakke }) {
    const ænd = koerselsAendringer(d.input);
    const værk = d.input.filter((r) => r.kilde === "vaerk").length;
    return (
        <Kort titel="Det frosne input" afgraensning={`værket ved revision ${d.k.vaerk_revision} + kørslens ændringer`}
            budskab={ænd.length === 0 ? `Kørt med værket som det er (${tal(værk)} værdier).` : `${ænd.length} af ${tal(værk + ænd.filter((x) => x.vaerk_json === undefined).length)} værdier er sat af kørslen; resten er værkets egne.`}
            fod={<>Det er præcis dette input, notebooken regnede på (verificeret mod input_hash <span className="fjv-a-tag">{d.k.input_hash.slice(0, 12)}…</span>).</>}>
            <Tabel rækker={ænd} nøgle={(x) => x.sti} tom="Ingen ændringer i forhold til værket." kolonner={[
                { navn: "Ændring", vis: (x) => aendringTekst(x.sti, x.vaerk_json, x.ny_json) },
                { navn: "Sti", vis: (x) => <span className="fjv-a-tag">{x.sti}</span> },
                { navn: "Kilde", vis: (x) => (x.kilde === "aendring" ? "scenariets knap" : "kørselsindstilling") },
            ]} />
            <details>
                <summary className="fjv-a-svag" style={{ cursor: "pointer" }}>Hele det effektive input ({tal(d.input.length)} rækker)</summary>
                <Tabel rækker={[...d.input].sort((a, b) => a.sti.localeCompare(b.sti))} nøgle={(x) => `${x.kilde}|${x.sti}`} kolonner={[
                    { navn: "Sti", vis: (x) => <span className="fjv-a-tag">{x.sti}</span> },
                    { navn: "Værdi", vis: (x) => <span className="fjv-a-tag">{x.vaerdi_json.length > 90 ? `${x.vaerdi_json.slice(0, 87)}…` : x.vaerdi_json}</span> },
                    { navn: "Kilde", vis: (x) => x.kilde },
                ]} />
            </details>
        </Kort>
    );
}
