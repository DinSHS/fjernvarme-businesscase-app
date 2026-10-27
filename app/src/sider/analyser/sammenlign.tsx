//-----------------------------------------------------------------------
// #/analyser/sammenlign/<a>/<b> — differensen er produktet.
// a = reference, b = scenarie; Δ = b − a. Sammenlignelighed (KONTRAKT §6b),
// Δ objektiv med toleranceregel, hvad der ændrede sig (input, produktion,
// måneder, balance, lager) og dispatch for samme vindue på samme skala.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, FarveValg, Gitter, HeatSkalaProvider, Knap, Kort, Maerke, Side, StatusMaerke, Tabel, useFarvesaet, useHeatMaks, useVisning } from "@/components/layout";
import { farverTeksten, farvning, forklaring, skalaMaks } from "@/lib/tabelfarve";
import { useVaerkParametre, type Hentet } from "@/lib/data/hooks";
import { tal } from "@/lib/format";
import type { OmraadeProps } from "../typer";
import {
    absolutGab, aendringTekst, balanceDelta, balanceForskel, balanceMetode, balanceKolonner, difference, differenceTekst, feltInfo, intervalTekst, sammenlignelighedStatus, toleranceKlasse, farvepladser, gabTekst, inputDiff, kendtDelta, produktionsvarians, varianseOrden,
    relativAfvigelse, sammenlignelighed, sammenligningsBudskab, spor, type Profil,
} from "./beregn";
import { tilSide, usePakke, type Pakke } from "./data";
import { historie, ordnPar, vurder } from "./anbefaling";
import { AnbefalingKort, HistorieKort } from "./anbefaling-kort";
import { Commit, Fakta, KoerselLink, SporMaerke } from "./dele";
import DispatchKort from "./dispatch-kort";
import { dec, ellers, energi, maanedKort, medFortegn, periodeTekst } from "./fmt";
import { formatValue } from "@/ibcs";
import { DeltaTal, ENERGI_TABEL, NoegletalKort, OmkostningsVandfald, ProduktionMod, TKR, energiSkala, omkostningsBro, tkr, vandfaldSkala, type Noegletal } from "./ibcs-grafer";
import { forbehold, SPOR_A_FORBEHOLD, SPOR_B_FORBEHOLD } from "./tekster";

function begge(a: Hentet<Pakke | null>, b: Hentet<Pakke | null>): Hentet<[Pakke | null, Pakke | null]> {
    return {
        data: a.data !== undefined && b.data !== undefined ? [a.data, b.data] : undefined,
        fejl: a.fejl ?? b.fejl, indlæser: a.indlæser || b.indlæser,
        genindlæs: () => { a.genindlæs(); b.genindlæs(); },
    };
}

export default function Sammenlign({ a, b, gåTil }: { a: string; b: string; gåTil: OmraadeProps["gåTil"] }) {
    const pa = usePakke(a);
    const pb = usePakke(b);
    const h = begge(pa, pb);
    const klar = pa.data && pb.data && pa.data.k.status === "faerdig" && pb.data.k.status === "faerdig";
    const budskab = useMemo(() => {
        if (!klar) return undefined;
        const v = produktionsvarians(pa.data!.samlet.enheder, pb.data!.samlet.enheder);
        return sammenligningsBudskab(v, difference(pa.data!.k, pb.data!.k), energi);
    }, [klar, pa.data, pb.data]);
    return (
        <Side omraade="Analyser · Sammenligning" titel={klar ? `${pb.data!.scenarie?.navn ?? "Scenarie"} mod ${pa.data!.scenarie?.navn ?? "reference"}` : "Sammenligning"}
            budskab={budskab ?? (h.data && !klar ? "Begge kørsler skal være færdige for at kunne sammenlignes." : undefined)}
            titelblok={klar ? titelblok(pa.data!, pb.data!) : undefined}
            handlinger={<>
                <Knap sekundaer onClick={() => gåTil("analyser")}>Alle kørsler</Knap>
                <Knap sekundaer onClick={() => gåTil(`analyser/sammenlign/${b}/${a}`)} title="Gør scenariet til reference og omvendt">Byt reference og scenarie</Knap>
            </>}>
            <DataTilstand h={h} højde={300}>
                {([da, db]) => !da || !db
                    ? <Kort titel="Kørslen findes ikke" budskab={`${!da ? "Referencen" : "Scenariet"} findes ikke — linket kan være forkert.`} />
                    : da.k.status !== "faerdig" || db.k.status !== "faerdig"
                        ? <IkkeKlar a={da} b={db} />
                        : <Indhold a={da} b={db} />}
            </DataTilstand>
        </Side>
    );
}

/** IBCS-titlen (UN 2.2, spec analyser-sammenlign): værk + balancemarked / mål + enhed / periode + scenarier. */
function titelblok(a: Pakke, b: Pakke) {
    const bal = (p: Pakke) => (p.profil.med_balancering == null ? "balancemarked ukendt" : p.profil.med_balancering ? "med balancemarked" : "uden balancemarked");
    const balance = bal(a) === bal(b) ? bal(a) : `reference ${bal(a)}, scenarie ${bal(b)}`;
    const periode = (p: Pakke) => periodeTekst(p.profil.periode_start, p.profil.periode_slut);
    return {
        hvem: `${a.vaerkNavn}${b.vaerkNavn !== a.vaerkNavn ? ` og ${b.vaerkNavn}` : ""}, ${balance}`,
        hvad: <><strong>Driftsomkostning</strong> i t.kr. · <strong>varmeproduktion</strong> i MWh, pr. enhed</>,
        hvornaar: `${periode(a) === periode(b) ? periode(a) : `${periode(a)} og ${periode(b)}`} · Ref og Scen, ΔRef`,
    };
}

function IkkeKlar({ a, b }: { a: Pakke; b: Pakke }) {
    return (
        <Gitter form="6-6">
            {[["Reference", a], ["Scenarie", b]].map(([n, p]) => {
                const x = p as Pakke;
                return (
                    <Kort key={n as string} titel={n as string} afgraensning={x.scenarie?.navn} budskab={x.k.status === "faerdig" ? "Færdig." : x.k.fejlbesked ?? x.k.fase ?? "Ikke færdig."}>
                        <div className="fjv-a-raekke"><StatusMaerke status={x.k.status} /><KoerselLink id={x.k.id}>Åbn kørslen</KoerselLink></div>
                    </Kort>
                );
            })}
        </Gitter>
    );
}

function Indhold({ a, b }: { a: Pakke; b: Pakke }) {
    const pladser = useMemo(() => farvepladser([...a.objekter.enheder, ...b.objekter.enheder, ...a.samlet.enheder.map((e) => e.navn), ...b.samlet.enheder.map((e) => e.navn)]),
        [a.objekter.enheder, b.objekter.enheder, a.samlet.enheder, b.samlet.enheder]);
    const vp = useVaerkParametre(a.k.vaerk_id);
    const anbefaling = useMemo(() => {
        if (!vp.data) return null;
        const bekraeft = new Set(vp.data.filter((x) => x.bekraeft).map((x) => x.sti));
        const par = ordnPar(tilSide(a), tilSide(b));
        const v = vurder(par, bekraeft);
        const h = historie(par, v);
        const kopi = [h, "", `Anbefaling: ${v.maerke}. ${v.saetning}`, `Begrundelse: ${v.begrundelse}`,
            ...(v.forbehold.length ? [`Forbehold: ${v.forbehold.map((f) => f.tekst).join(" ")}`] : []),
            ...(v.naesteSkridt.length ? [`Næste skridt: ${v.naesteSkridt.join("; ")}.`] : [])].join("\n");
        return { par, v, h, kopi };
    }, [vp.data, a, b]);
    return (
        <HeatSkalaProvider>
            {/* Nøgletal og vandfald over folden ved 1280 px (sidekvalitet, K7; orkestratorens beslutning 2026-10-26), så
                historien og anbefalingen — begge regnet af data (brief 15 A2/A). */}
            <Gitter><Noegletal a={a} b={b} /></Gitter>
            <Gitter form="4-8">
                <DeltaObjektiv a={a} b={b} />
                <Vandfald a={a} b={b} />
            </Gitter>
            {anbefaling && <>
                <Gitter><HistorieKort par={anbefaling.par} historie={anbefaling.h} /></Gitter>
                <Gitter><AnbefalingKort v={anbefaling.v} vaerkKode={(anbefaling.par.scen.k.id === b.k.id ? b : a).vaerkKode} kopiTekst={anbefaling.kopi} /></Gitter>
            </>}
            <Gitter><Sammenlignelighed a={a} b={b} /></Gitter>
            <Gitter><ToKoersler a={a} b={b} /></Gitter>
            <Gitter><InputForskel a={a} b={b} /></Gitter>
            <Gitter><Produktion a={a} b={b} /></Gitter>
            <Gitter><MaanedDelta a={a} b={b} /></Gitter>
            <Gitter form="6-6">
                <BalanceDelta a={a} b={b} />
                <LagerDelta a={a} b={b} />
            </Gitter>
            <Gitter><DispatchKort a={a} b={b} pladser={pladser} /></Gitter>
        </HeatSkalaProvider>
    );
}

// ---------------------------------------------------------------- sammenlignelighed

const PROFILFELTER: readonly [string, (p: Profil) => React.ReactNode, string][] = [
    ["Værk", (p) => p.vaerk_navn, "vaerk_id"],
    ["Periode", (p) => periodeTekst(p.periode_start, p.periode_slut), "periode"],
    ["Opløsning", (p) => p.oploesning ?? "ukendt", "oploesning"],
    ["Datagrundlag (df-data)", (p) => <Commit sha={p.data_commit} />, "data_commit"],
    ["Modelversion", (p) => <Commit sha={p.model_commit} />, "model_commit"],
    ["Ønsket relativt gab", (p) => ellers(p.rel_gap, (v) => `${dec(v * 100, 3)} %`), "rel_gap"],
    ["Ønsket absolut gab", (p) => ellers(p.abs_gap, (v) => `${tal(v)} kr.`), "abs_gap"],
    ["Værkets revision", (p) => ellers(p.vaerk_revision, (v) => `r${v}`), "vaerk_revision"],
    ["Balancemarked", (p) => (p.med_balancering == null ? "ukendt" : p.med_balancering ? "med" : "uden"), "med_balancering"],
    ["Beregningsmiljø", (p) => <span className="fjv-a-svag">{p.miljoe ?? "ukendt"}</span>, "miljoe"],
];

function Sammenlignelighed({ a, b }: { a: Pakke; b: Pakke }) {
    const af = sammenlignelighed(a.profil, b.profil);
    const status = sammenlignelighedStatus(af);
    const adv = af.filter((x) => x.alvor === "advarsel"), ukendt = af.filter((x) => x.alvor === "ukendt");
    const noter = af.filter((x) => x.alvor === "note");
    const afv = new Map(af.map((x) => [x.felt as string, x]));
    const liste = (xs: typeof af) => xs.map((x) => x.navn.toLowerCase()).join(", ");
    const budskab = status === "ja"
        ? `Direkte sammenlignelige: samme værk, periode, opløsning, data, modelversion og ønsket gab${noter.length ? ` (forskelle: ${liste(noter)})` : ""}.`
        : status === "nej"
            ? `Ikke direkte sammenlignelige — ${liste(adv)} afviger. Differensen blander flere effekter.`
            : `Kan ikke afgøres — ${liste(ukendt)} kendes ikke for begge kørsler.`;
    return (
        <Kort titel="Kan de to kørsler sammenlignes?" afgraensning="differensmetoden" budskab={budskab}
            handling={status === "ja" ? <Maerke tone="ok">Sammenlignelige</Maerke>
                : status === "nej" ? <Maerke tone="advarsel">{adv.length} afvigelse{adv.length > 1 ? "r" : ""}</Maerke>
                    : <Maerke tone="advarsel">Kan ikke afgøres</Maerke>}
            fod="Kun det, scenariet ændrer, må være forskelligt (differensmetoden). Kør begge i samme miljø og med stramt gab: Spor A blev målt 28 kr. forskellig mellem 2 og 8 kerner.">
            <Tabel rækker={PROFILFELTER} nøgle={(r) => r[0]} kolonner={[
                { navn: "Felt", vis: (r) => r[0] },
                // Ved en afvigelse vises afvigelsens egne tekster: de er fulde, når den korte visning er ens.
                { navn: "Reference", vis: (r) => (afv.get(r[2])?.alvor === "note" || !afv.get(r[2]) ? r[1](a.profil) : afv.get(r[2])!.a) },
                { navn: "Scenarie", vis: (r) => (afv.get(r[2])?.alvor === "note" || !afv.get(r[2]) ? r[1](b.profil) : afv.get(r[2])!.b) },
                {
                    navn: "Ens?", vis: (r) => {
                        const s = afv.get(r[2])?.alvor;
                        return !s ? <Maerke tone="ok">ens</Maerke> : s === "advarsel" ? <Maerke tone="advarsel">afviger</Maerke>
                            : s === "ukendt" ? <Maerke tone="advarsel">ukendt</Maerke> : <Maerke>forskellig</Maerke>;
                    },
                },
            ]} />
        </Kort>
    );
}

// ---------------------------------------------------------------- Δ objektiv

export function DeltaObjektiv({ a, b }: { a: Pakke; b: Pakke }) {
    const d = difference(a.k, b.k);
    // Samme regel som KPI-kortet: fortegnsbærende reference, N/A ved Ref ≤ 0 (Codex K7 F4).
    const rel = relativAfvigelse(a.k.objektiv_dkk, b.k.objektiv_dkk);
    return (
        <Kort titel="Δ driftsomkostning" afgraensning="ΔRef = scenarie − reference, t.kr." budskab={d ? differenceTekst(d) : "Mindst én af kørslerne mangler et objektiv."}
            fod="Differens i omkostning, ikke indtægt. Hvert objektiv kan kun være for højt (højst sit gab over det bedst mulige), så det sande Δ ligger i [Δ − scenariets gab; Δ + referencens gab]. |Δ| under summen af de to gab kan ikke skelnes fra nul.">
            {d && <>
                <div className="fjv-a-helt">{d.indenForTolerance ? <span className="fjv-a-svag">{medFortegn(d.delta / 1000, (v) => dec(v, 1))}</span> : <DeltaTal v={d.delta} polaritet={-1} />}<small>t.kr. ΔRef</small></div>
                <div className="fjv-a-raekke">
                    {{
                        nul: <Maerke>Ingen forskel</Maerke>,
                        inden: <Maerke tone="advarsel">Inden for solverens tolerance</Maerke>,
                        lig: <Maerke tone="advarsel">Præcis på tolerancen</Maerke>,
                        ukendt: <Maerke tone="advarsel">Tolerance ukendt</Maerke>,
                        stoerre: <Maerke tone="ok">Større end tolerancen</Maerke>,
                    }[toleranceKlasse(d)]}
                </div>
                <Fakta par={[
                    ["Præcist", `${medFortegn(d.delta)} kr.`],
                    ["Tolerance", d.tolerance === null ? "ukendt" : `${tal(d.tolerance)} kr. (summen af de to gab)`],
                    ["Sandt Δ", intervalTekst(d)?.replace(/^Det sande Δ (ligger |er )/, "") ?? "ukendt"],
                    ["Relativt", rel == null ? "N/A" : `${medFortegn(rel * 100, (v) => dec(v, 2))} %`],
                ]} />
            </>}
        </Kort>
    );
}

/** Det præcise objektiv (Koersel.objektiv_dkk); manifestets afrundede tal kun som nødløsning (viden/anbefalingsregler.json). */
const objektiv = (p: Pakke): number | null => p.k.objektiv_dkk ?? p.samlet.objektiv_dkk ?? null;

/** KPI-kort (spec k1): driftsomkostning, CO₂, elforbrug og — med balancemarked — balanceindtægt netto. */
export function Noegletal({ a, b }: { a: Pakke; b: Pakke }) {
    const sa = a.samlet, sb = b.samlet;
    const heltal = { factor: 1, prefix: "", decimals: 0 };
    const el = energiSkala([sa.el_forbrug_mwh, sb.el_forbrug_mwh], ENERGI_TABEL);
    const tal_: Noegletal[] = [
        {
            navn: "Driftsomkostning", enhed: "t.kr.", ref: objektiv(a), scen: objektiv(b), skala: TKR, polaritet: -1,
            definition: "Objektivet: brændsel, el, tariffer, afgifter, D&V og starter minus elsalg og balanceindtægt, hele perioden.",
        },
        { navn: "CO₂-udledning", enhed: "t", ref: sa.co2_ton, scen: sb.co2_ton, skala: heltal, polaritet: -1 },
        {
            // Kortets tal har højst 4 heltalscifre (IBCS.md §3): GWh, når et helårs elforbrug ellers får 5 cifre.
            navn: "Elforbrug", enhed: `${el.enhed} el`, ref: sa.el_forbrug_mwh, scen: sb.el_forbrug_mwh, skala: el.skala, polaritet: 0,
            definition: "El til varmepumper og elkedler. Neutral: virkningen står i driftsomkostningen.",
        },
        ...(sa.balance || sb.balance ? [{ navn: "Balanceindtægt netto", enhed: "t.kr.", ref: sa.balance?.i_alt.netto ?? null, scen: sb.balance?.i_alt.netto ?? null, skala: TKR, polaritet: 1, relativ: false }] : []),
    ];
    const d = difference(a.k, b.k);
    const co2 = sa.co2_ton != null && sb.co2_ton != null ? `; CO₂ ${medFortegn(sb.co2_ton - sa.co2_ton)} t` : "";
    const budskab = d
        ? `Scenariet koster ${tkr(Math.abs(d.delta))} t.kr. ${d.delta > 0 ? "mere" : d.delta < 0 ? "mindre" : "det samme"} end referencen${co2}.`
        : "Mindst én af kørslerne mangler et objektiv.";
    return (
        <Kort titel="Nøgletal" afgraensning="Scen med ΔRef og ΔRef%" budskab={budskab}
            fod="Værdien er scenariets; ΔRef = scenarie − reference. Grøn = bedre, rød = dårligere, blå = neutral; et ΔRef, der afrundes til 0, har ingen farve. ΔRef% er N/A, når referencen er 0.">
            <NoegletalKort tal={tal_} fremhaev="Driftsomkostning" />
        </Kort>
    );
}

/** Vandfaldet (spec v1): hvad forklarer ΔRef på driftsomkostningen. */
export function Vandfald({ a, b }: { a: Pakke; b: Pakke }) {
    const legacy = [a, b].some((p) => (p.samlet.balance != null) && balanceMetode(p.input) === "legacy");
    const bro = omkostningsBro(a.samlet, b.samlet, objektiv(a), objektiv(b), legacy);
    const største = bro ? [...bro.steps].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0] : undefined;
    const budskab = !bro || !største ? "Mindst én af kørslerne mangler et objektiv."
        : `Største post: ${største.label.charAt(0).toLowerCase()}${største.label.slice(1)} ${medFortegn(største.delta / 1000, (v) => dec(v, 1))} t.kr.`;
    return (
        <Kort titel="Hvad forklarer Δ driftsomkostning" afgraensning={`${bro ? vandfaldSkala(bro).enhed : "t.kr."}, Ref → Scen`} budskab={budskab}
            fod="Trinene er i omkostningsfortegn (op = dyrere = rød). Elsalg og balanceindtægt er indtægter, så mindre salg tæller som en omkostning. 'Brændsel, CO₂-kvoter, D&V, start m.m.' er resten: ΔRef minus de poster, kørslerne gemmer hver for sig — brændsel og CO₂-kvoter gemmes ikke pr. kørsel (de indgår i modellens objektiv, src/model.py:93-110). Ved balanceringsmetoden legacy er modellens brutto = netto; den sparede tarif og afgift står da i resten. Mangler en post i den ene kørsel, fordeles den ikke: den står i resten med navn og '(ukendt)'.">
            {bro && <OmkostningsVandfald bro={bro} />}
        </Kort>
    );
}

function ToKoersler({ a, b }: { a: Pakke; b: Pakke }) {
    const rk = [["Reference", a], ["Scenarie", b]] as const;
    const ga = absolutGab(a.k), gb = absolutGab(b.k);
    return (
        <Kort titel="De to kørsler" afgraensning="driftsomkostning og usikkerhed"
            budskab={`Opnået gab: reference ${gabTekst(ga)}, scenarie ${gabTekst(gb)}.`}>
            <Tabel rækker={rk} nøgle={(r) => r[0]} kolonner={[
                { navn: "Rolle", vis: (r) => r[0] },
                { navn: "Kørsel", vis: (r) => <KoerselLink id={r[1].k.id}>{r[1].scenarie?.navn ?? r[1].k.id.slice(0, 8)}</KoerselLink> },
                { navn: "Driftsomkostning (t.kr.)", vis: (r) => tkr(r[1].samlet.objektiv_dkk ?? r[1].k.objektiv_dkk), tal: true },
                { navn: "Højst for højt (t.kr.)", vis: (r) => { const g = absolutGab(r[1].k); return g.kr === null ? "ukendt" : tkr(g.kr); }, tal: true },
                { navn: "Status", vis: (r) => r[1].k.solve_status ?? "–" },
            ]} />
        </Kort>
    );
}

// ---------------------------------------------------------------- hvad ændrede sig

function InputForskel({ a, b }: { a: Pakke; b: Pakke }) {
    const diff = inputDiff(a.input, b.input);
    const tanke = diff.some((x) => /^storage\.[^.]+\.enabled$/.test(x.sti));
    const budskab = diff.length === 0 ? "Det frosne input er ens — forskelle i resultatet er solverstøj eller miljø."
        : `${diff.length} værdi${diff.length > 1 ? "er" : ""} afviger: ${diff.slice(0, 2).map((x) => aendringTekst(x.sti, x.a, x.b).replace(/^./, (c) => c.toLowerCase())).join("; ")}${diff.length > 2 ? " …" : ""}.`;
    return (
        <Kort titel="Hvad blev ændret" afgraensning="frosset input, reference → scenarie" budskab={budskab}
            fod={tanke ? forbehold("ved sammenligning med og uden tank") : "Sammenlignet på det effektive input (værkets værdier overskrevet af kørslens ændringer)."}>
            <Tabel rækker={diff} nøgle={(x) => x.sti} tom="Ingen forskelle." kolonner={[
                { navn: "Ændring", vis: (x) => aendringTekst(x.sti, x.a, x.b) },
                { navn: "Sti", vis: (x) => <span className="fjv-a-tag">{x.sti}</span> },
                { navn: "Reference", vis: (x) => <span className="fjv-a-tag">{x.a ?? "—"}</span> },
                { navn: "Scenarie", vis: (x) => <span className="fjv-a-tag">{x.b ?? "—"}</span> },
            ]} />
        </Kort>
    );
}

function Produktion({ a, b }: { a: Pakke; b: Pakke }) {
    const v = produktionsvarians(a.samlet.enheder, b.samlet.enheder);
    const kendt = v.filter(kendtDelta);   // Codex K9 F1: en ukendt Δ indgår hverken i budskab eller fremhævning
    const ned = [...kendt].sort((x, y) => x.delta - y.delta)[0], op = [...kendt].sort((x, y) => y.delta - x.delta)[0];
    const dele = [op && op.delta > 0.5 ? `${op.navn} producerer ${energi(op.delta)} mere` : "", ned && ned.delta < -0.5 ? `${ned.navn} ${energi(-ned.delta)} mindre` : ""].filter(Boolean);
    const budskab = dele.length === 0 ? "Enhedsfordelingen er den samme i begge kørsler." : `I scenariet ${dele.join(" og ")}.`;
    const ea = new Map(a.samlet.enheder.map((e) => [e.navn, e])), eb = new Map(b.samlet.enheder.map((e) => [e.navn, e]));
    const rækker = [...v].sort(varianseOrden);
    const fremhaev = [...kendt].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
    const andelDelta = (x: (typeof v)[number]) => {
        const pa = ea.get(x.navn)?.andel_pct, pb = eb.get(x.navn)?.andel_pct;
        return pa == null || pb == null ? null : pb - pa;
    };
    const PP = { factor: 1, prefix: "", decimals: 1 };
    const vis = useVisning("delta"), saet = useFarvesaet();
    const maks = useHeatMaks("Δpp·andel", skalaMaks(rækker.map(andelDelta)));
    const art = { slags: "delta", polaritet: 0, saet } as const;
    const legende = forklaring(vis, art, [["", maks, `${dec(maks, 1)} pp`]]);
    return (
        <Kort titel="Varmeproduktion pr. enhed" afgraensning="hele perioden · Ref og Scen, ΔRef, ΔRef%" budskab={budskab}
            handling={<FarveValg slags="delta" />}
            fod={`Ref = omrids (reference), Scen = fyldt (scenarie), ΔRef = scenarie − reference på samme skala; ΔRef% med én decimal, N/A når referencen er 0. Afvigelserne er neutrale (blå): at en enhed producerer mere, er hverken godt eller skidt — virkningen står i Δ driftsomkostning. Tabellen viser andel og driftstimer, som grafen ikke viser.${legende ? ` Tabellens ΔRef andel: ${legende.charAt(0).toLowerCase()}${legende.slice(1)}` : ""}`}>
            <ProduktionMod varians={v} fremhaev={fremhaev && Math.abs(fremhaev.delta) > 0.5 ? fremhaev.navn : undefined} />
            <Tabel rækker={rækker} nøgle={(x) => x.navn} kolonner={[
                { navn: "Enhed", vis: (x) => x.navn },
                { navn: "Andel Ref", vis: (x) => ellers(ea.get(x.navn)?.andel_pct, (z) => `${dec(z, 1)} %`), tal: true },
                { navn: "Andel Scen", vis: (x) => ellers(eb.get(x.navn)?.andel_pct, (z) => `${dec(z, 1)} %`), tal: true },
                {
                    navn: "ΔRef andel (pp)", tal: true,
                    farve: (x) => farvning(vis, andelDelta(x), art, maks, PP),
                    vis: (x) => {
                        const dd = andelDelta(x);
                        return dd == null ? "–" : <DeltaTal v={dd} polaritet={0} skala={PP} arv={farverTeksten(vis, art)} />;
                    },
                },
                { navn: "Driftstimer Ref", vis: (x) => ellers(ea.get(x.navn)?.driftstimer, tal), tal: true },
                { navn: "Driftstimer Scen", vis: (x) => ellers(eb.get(x.navn)?.driftstimer, tal), tal: true },
            ]} />
        </Kort>
    );
}

export function MaanedDelta({ a, b }: { a: Pakke; b: Pakke }) {
    const ta = a.maaneder, tb = b.maaneder;
    const måneder = [...new Set([...ta.maaneder, ...tb.maaneder])].sort();
    const enheder = [...new Set([...ta.objekter("produktion_gwh"), ...tb.objekter("produktion_gwh")])];
    // Rækkerne i samme rækkefølge som grafen ovenfor (scenariets produktion, største først).
    enheder.sort((x, y) => (tb.periode(y, "produktion_gwh") ?? 0) - (tb.periode(x, "produktion_gwh") ?? 0) || x.localeCompare(y));
    // Codex K9 F1: en enhed, kørslen ikke har, og en måned uden for kørslens periode er fraværende (undefined) og
    // tæller 0 over for en kendt værdi. En manglende måling for en enhed, kørslen HAR, er ukendt (null): så er Δ ukendt.
    const måling = (t: typeof ta, m: string, e: string | null, felt: string): number | null | undefined => {
        if ((m !== "periode" && !t.maaneder.includes(m)) || (e !== null && !t.objekter(felt).includes(e))) return undefined;
        return m === "periode" ? t.periode(e, felt) : t.vaerdi(m, e, felt);
    };
    // MWh som resten af siden (GWh × 1.000): én enhed for varmeproduktion på hele siden.
    const d = (m: string, e: string | null) => {
        const felt = e === null ? "varmebehov_gwh" : "produktion_gwh";
        const va = måling(ta, m, e, felt), vb = måling(tb, m, e, felt);
        return va === null || vb === null || (va === undefined && vb === undefined) ? null : ((vb ?? 0) - (va ?? 0)) * 1000;
    };
    const kolonner = [...måneder, "periode"];
    // Ét præfiks for hele tabellen (måneder og 'Hele perioden') og budskabet, højst 4 heltalscifre (IBCS.md §3): GWh,
    // når MWh ellers får 5 cifre — samme regel som graferne (energiSkala).
    const E = energiSkala(kolonner.flatMap((m) => [...enheder, null].map((e) => d(m, e))), ENERGI_TABEL);
    const en = (v: number) => `${formatValue(v, E.skala)} ${E.enhed}`;
    const flyt = måneder.map((m) => [m, enheder.reduce((sum, e) => sum + Math.abs(d(m, e) ?? 0), 0) / 2] as const).sort((x, y) => y[1] - x[1]);
    const budskab = måneder.length === 0 ? "Ingen månedstal."
        : flyt[0][1] < 0.5 ? "Ingen produktion flytter mellem enhederne i nogen måned."
            : `Mest flytning i ${maanedKort(flyt[0][0])}: ${en(flyt[0][1])} skifter enhed.`;
    // Heatmap (IBCS.md §8): én skala for månedscellerne og én for 'Hele perioden' (delt med lagertabellens ΔMWh), så
    // totalen ikke vasker månederne ud. Varmebehovet står i samme MWh og deler månedernes skala.
    const rækker = [...enheder, VARMEBEHOV];
    const celle = (m: string, e: string) => d(m, e === VARMEBEHOV ? null : e);
    const vis = useVisning("delta"), saet = useFarvesaet();
    const maksM = useHeatMaks("ΔMWh·måned", skalaMaks(måneder.flatMap((m) => rækker.map((e) => celle(m, e)))));
    const maksP = useHeatMaks("ΔMWh·periode", skalaMaks(rækker.map((e) => celle("periode", e))));
    const art = { slags: "delta", polaritet: 0, saet } as const;
    const legende = forklaring(vis, art, [["månederne", maksM, en(maksM)], ["hele perioden", maksP, en(maksP)]]);
    return (
        <Kort titel="Måned for måned" afgraensning={`ΔRef varmeproduktion, ${E.enhed}, pr. enhed og måned`} budskab={budskab}
            handling={<FarveValg slags="delta" />}
            fod={`ΔRef = scenarie − reference${vis === "ingen" ? ", neutral (blå)" : ""}. ${legende ? `${legende} ` : ""}'Hele perioden' er differensen mellem de to kørslers periode-rækker (regnet på de fulde tidsserier), ikke summen af månederne.`}>
            <Tabel rækker={rækker} nøgle={(e) => e} kolonner={[
                { navn: "Enhed", vis: (e) => (e === VARMEBEHOV ? <span className="fjv-a-svag">Varmebehov</span> : e) },
                ...kolonner.map((m) => ({
                    navn: m === "periode" ? "Hele perioden" : maanedKort(m), tal: true,
                    farve: (e: string) => farvning(vis, celle(m, e), art, m === "periode" ? maksP : maksM, E.skala),
                    vis: (e: string) => {
                        const t = <DeltaTal v={celle(m, e)} polaritet={0} skala={E.skala} arv={farverTeksten(vis, art)} />;
                        return m === "periode" ? <strong>{t}</strong> : t;
                    },
                })),
            ]} />
        </Kort>
    );
}

/** Rækkenøgle for varmebehovet i månedstabellen (kan ikke kollidere med et enhedsnavn: modellens navne er [a-z0-9_]). */
const VARMEBEHOV = "Varmebehov ";

function BalanceDelta({ a, b }: { a: Pakke; b: Pakke }) {
    const ba = a.samlet.balance, bb = b.samlet.balance;
    const rk = ba || bb ? balanceDelta(ba, bb, balanceKolonner([a.k.model_commit, b.k.model_commit])) : [];   // K7-F2
    // Heatmap: 'I alt'-rækkerne har deres egen skala, så summen ikke vasker produkterne ud (IBCS.md §8). Balanceindtægt:
    // op = godt (polaritet +1): farvesættets godt/dårligt (grøn/blå = godt, rød = dårligt; Neutral: temaets god/dårlig). Hooks før den tidlige retur.
    const vis = useVisning("delta"), saet = useFarvesaet();
    const maksP = useHeatMaks("Δt.kr.·balance", skalaMaks(rk.filter((r) => r.marked !== "I alt").map((r) => r.delta)));
    const maksI = useHeatMaks("Δt.kr.·balance i alt", skalaMaks(rk.filter((r) => r.marked === "I alt").map((r) => r.delta)));
    if (!ba && !bb) {
        return <Kort titel="Balancemarked" afgraensning="aFRR og mFRR" budskab="Ingen af kørslerne er regnet med balancemarked." />;
    }
    const forskel = balanceForskel(a, b);
    const dNetto = ba?.i_alt.netto != null && bb?.i_alt.netto != null ? bb.i_alt.netto - ba.i_alt.netto : null;
    const sporer = [...new Set([...(ba ? [spor(a.input)] : []), ...(bb ? [spor(b.input)] : [])])];
    const hvem = (m: "a" | "b") => (m === "b" ? "scenariet" : "referencen");
    // Codex K3-N3: "balancemarkedets værdi" kun når balanceringen er den eneste forskel.
    const grund = (g: string) => (g.includes(".") ? (() => { const f = feltInfo(g); return `${f.etiket.toLowerCase()}${f.objekt ? ` (${f.objekt})` : ""}`; })() : g.toLowerCase());
    const budskab = forskel?.type === "vaerdi"
        ? `Kun ${hvem(forskel.med)} har balancemarked, og det er den eneste forskel. Balancemarkedets værdi: ${tkr(forskel.vaerdi)} t.kr. — se Δ driftsomkostning; indtægten nedenfor er ikke værdien.`
        : forskel?.type === "blandet"
            ? `Kun ${hvem(forskel.med)} har balancemarked, men kørslerne afviger også i ${forskel.grunde.slice(0, 3).map(grund).join(", ")}${forskel.grunde.length > 3 ? " med flere" : ""}. Δ driftsomkostning (${medFortegn((forskel.med === "b" ? -forskel.vaerdi : forskel.vaerdi) / 1000, (v) => dec(v, 1))} t.kr.) er en samlet omkostningsforskel med flere ændringer — ikke balancemarkedets værdi.`
            : dNetto !== null ? `ΔRef balanceindtægt netto ${medFortegn(dNetto / 1000, (v) => dec(v, 1))} t.kr.` : "Balancetallene kan ikke stilles op mod hinanden.";
    const art = { slags: "delta", polaritet: 1, saet } as const;
    const legende = forklaring(vis, art, [["markederne", maksP, `${tkr(maksP)} t.kr.`], ["I alt", maksI, `${tkr(maksI)} t.kr.`]]);
    return (
        <Kort titel="Balancemarked" afgraensning="pr. marked og produkt, t.kr." budskab={budskab}
            handling={rk.some((r) => r.delta != null) ? <FarveValg slags="delta" /> : undefined}
            fod={<>{forbehold("altid ved balancetal")} {sporer.includes("A") ? SPOR_A_FORBEHOLD : ""} {sporer.includes("B") ? SPOR_B_FORBEHOLD : ""} Netto og brutto lægges aldrig sammen. Δ vises kun, når begge kørsler har tallet.{legende ? ` ΔRef: ${legende.charAt(0).toLowerCase()}${legende.slice(1)}` : ""}</>}>
            <div className="fjv-a-raekke">{sporer.map((s) => <SporMaerke key={s} spor={s} />)}</div>
            <Tabel rækker={rk} nøgle={(r) => `${r.marked}|${r.felt}`} kolonner={[
                { navn: "Marked", vis: (r) => (r.marked === "I alt" ? <strong>I alt</strong> : r.marked) },
                { navn: "Produkt", vis: (r) => r.etiket },
                { navn: "Ref (t.kr.)", vis: (r) => tkr(r.a), tal: true },
                { navn: "Scen (t.kr.)", vis: (r) => tkr(r.b), tal: true },
                {
                    navn: "ΔRef", tal: true, farve: (r) => farvning(vis, r.delta, art, r.marked === "I alt" ? maksI : maksP, TKR),
                    vis: (r) => <DeltaTal v={r.delta} polaritet={1} arv={farverTeksten(vis, art)} />,
                },
            ]} />
        </Kort>
    );
}

export function LagerDelta({ a, b }: { a: Pakke; b: Pakke }) {
    const navne = [...new Set([...a.samlet.lagre.map((l) => l.navn), ...b.samlet.lagre.map((l) => l.navn)])].sort();
    const la = new Map(a.samlet.lagre.map((l) => [l.navn, l])), lb = new Map(b.samlet.lagre.map((l) => [l.navn, l]));
    const kunA = navne.filter((n) => la.has(n) && !lb.has(n)), kunB = navne.filter((n) => lb.has(n) && !la.has(n));
    const budskab = navne.length === 0 ? "Ingen af kørslerne har aktive lagre."
        : kunA.length ? `Scenariet kører uden ${kunA.join(" og ")}.` : kunB.length ? `Scenariet har ${kunB.join(" og ")}, som referencen ikke har.`
            : "Samme lagre i begge kørsler.";
    // Codex K9 F1: et lager, kørslen ikke har ("slået fra"), tæller 0; en ukendt afladning for et lager, den har, gør Δ ukendt.
    const afladet = (m: typeof la, n: string) => (m.has(n) ? m.get(n)!.afladet_mwh : 0);
    const dl = (n: string) => { const x = afladet(la, n), y = afladet(lb, n); return x == null || y == null ? null : y - x; };
    // Ét præfiks for tabellen, højst 4 heltalscifre (IBCS.md §3): et helårs afladning er > 10.000 MWh.
    const E = energiSkala(navne.flatMap((n) => [la.get(n)?.afladet_mwh, lb.get(n)?.afladet_mwh, dl(n)]), ENERGI_TABEL);
    const en = (v: number) => formatValue(v, E.skala);
    // Samme MWh-skala som månedstabellens 'Hele perioden' (begge er periodens ΔRef i MWh; IBCS.md §8).
    const vis = useVisning("delta"), saet = useFarvesaet();
    const maks = useHeatMaks("ΔMWh·periode", skalaMaks(navne.map(dl)));
    const art = { slags: "delta", polaritet: 0, saet } as const;
    const legende = forklaring(vis, art, [["", maks, `${en(maks)} ${E.enhed}, samme skala som månedstabellens 'Hele perioden'`]]);
    return (
        <Kort titel="Lager" afgraensning={`afladet energi, ${E.enhed}`} budskab={budskab}
            handling={navne.length ? <FarveValg slags="delta" /> : undefined}
            fod={`${kunA.length || kunB.length ? forbehold("ved sammenligning med og uden tank") : "Niveau ved start er indholdet efter modellens første interval (før modelversion eef950a: låst til startindholdet, med ubundet lagerbalance)."}${legende ? ` ΔRef: ${legende.charAt(0).toLowerCase()}${legende.slice(1)}` : ""}`}>
            <Tabel rækker={navne} nøgle={(n) => n} tom="Ingen lagre." kolonner={[
                { navn: "Lager", vis: (n) => n },
                { navn: `Ref (${E.enhed})`, vis: (n) => (la.has(n) ? ellers(la.get(n)!.afladet_mwh, en) : "slået fra"), tal: true },
                { navn: `Scen (${E.enhed})`, vis: (n) => (lb.has(n) ? ellers(lb.get(n)!.afladet_mwh, en) : "slået fra"), tal: true },
                { navn: "ΔRef", tal: true, farve: (n) => farvning(vis, dl(n), art, maks, E.skala), vis: (n) => <DeltaTal v={dl(n)} polaritet={0} skala={E.skala} arv={farverTeksten(vis, art)} /> },
            ]} />
        </Kort>
    );
}
