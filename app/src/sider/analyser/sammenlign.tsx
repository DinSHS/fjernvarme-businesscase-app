//-----------------------------------------------------------------------
// #/analyser/sammenlign/<a>/<b> — differensen er produktet.
// a = reference, b = scenarie; Δ = b − a. Sammenlignelighed (KONTRAKT §6b),
// Δ objektiv med toleranceregel, hvad der ændrede sig (input, produktion,
// måneder, balance, lager) og dispatch for samme vindue på samme skala.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, Gitter, Knap, Kort, Maerke, Side, StatusMaerke, Tabel } from "@/components/layout";
import { useVaerkParametre, type Hentet } from "@/lib/data/hooks";
import { tal } from "@/lib/format";
import type { OmraadeProps } from "../typer";
import {
    absolutGab, aendringTekst, balanceDelta, balanceForskel, difference, differenceTekst, feltInfo, intervalTekst, sammenlignelighedStatus, toleranceKlasse, farvepladser, gabTekst, inputDiff, produktionsvarians,
    sammenlignelighed, sammenligningsBudskab, spor, type Profil,
} from "./beregn";
import { tilSide, usePakke, type Pakke } from "./data";
import { historie, ordnPar, vurder } from "./anbefaling";
import { AnbefalingKort, HistorieKort } from "./anbefaling-kort";
import { Commit, Fakta, KoerselLink, SporMaerke } from "./dele";
import DispatchKort from "./dispatch-kort";
import { dec, ellers, energi, maanedKort, medFortegn, periodeTekst } from "./fmt";
import { DeltaTal, NoegletalKort, OmkostningsVandfald, ProduktionMod, TKR, omkostningsBro, tkr, type Noegletal } from "./ibcs-grafer";
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
        <>
            {/* Brief 15 A2/A: historien øverst, så anbefalingen — begge regnet af data. */}
            {anbefaling && <>
                <Gitter><HistorieKort par={anbefaling.par} historie={anbefaling.h} /></Gitter>
                <Gitter><AnbefalingKort v={anbefaling.v} vaerkKode={(anbefaling.par.scen.k.id === b.k.id ? b : a).vaerkKode} kopiTekst={anbefaling.kopi} /></Gitter>
            </>}
            <Gitter><Noegletal a={a} b={b} /></Gitter>
            <Gitter form="4-8">
                <DeltaObjektiv a={a} b={b} />
                <Vandfald a={a} b={b} />
            </Gitter>
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
        </>
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

function DeltaObjektiv({ a, b }: { a: Pakke; b: Pakke }) {
    const d = difference(a.k, b.k);
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
                    ["Relativt", ellers(a.k.objektiv_dkk, (x) => (x === 0 ? "–" : `${medFortegn((d.delta / Math.abs(x)) * 100, (v) => dec(v, 2))} %`))],
                ]} />
            </>}
        </Kort>
    );
}

/** Det præcise objektiv (Koersel.objektiv_dkk); manifestets afrundede tal kun som nødløsning (viden/anbefalingsregler.json). */
const objektiv = (p: Pakke): number | null => p.k.objektiv_dkk ?? p.samlet.objektiv_dkk ?? null;

/** KPI-kort (spec k1): driftsomkostning, CO₂, elforbrug og — med balancemarked — balanceindtægt netto. */
function Noegletal({ a, b }: { a: Pakke; b: Pakke }) {
    const sa = a.samlet, sb = b.samlet;
    const heltal = { factor: 1, prefix: "", decimals: 0 };
    const tal_: Noegletal[] = [
        {
            navn: "Driftsomkostning", enhed: "t.kr.", ref: objektiv(a), scen: objektiv(b), skala: TKR, polaritet: -1,
            definition: "Objektivet: brændsel, el, tariffer, afgifter, D&V og starter minus elsalg og balanceindtægt, hele perioden.",
        },
        { navn: "CO₂-udledning", enhed: "t", ref: sa.co2_ton, scen: sb.co2_ton, skala: heltal, polaritet: -1 },
        {
            navn: "Elforbrug", enhed: "MWh el", ref: sa.el_forbrug_mwh, scen: sb.el_forbrug_mwh, skala: heltal, polaritet: 0,
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
function Vandfald({ a, b }: { a: Pakke; b: Pakke }) {
    const bro = omkostningsBro(a.samlet, b.samlet, objektiv(a), objektiv(b));
    const største = bro ? [...bro.steps].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0] : undefined;
    const budskab = !bro || !største ? "Mindst én af kørslerne mangler et objektiv."
        : `Største post: ${største.label.charAt(0).toLowerCase()}${største.label.slice(1)} ${medFortegn(største.delta / 1000, (v) => dec(v, 1))} t.kr.`;
    return (
        <Kort titel="Hvad forklarer Δ driftsomkostning" afgraensning="t.kr., Ref → Scen" budskab={budskab}
            fod="Trinene er i omkostningsfortegn (op = dyrere = rød). Elsalg og balanceindtægt er indtægter, så mindre salg tæller som en omkostning. 'Brændsel, D&V, start m.m.' er resten: ΔRef minus de poster, kørslerne gemmer hver for sig — brændsel gemmes ikke pr. kørsel.">
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
    const ned = [...v].sort((x, y) => x.delta - y.delta)[0], op = [...v].sort((x, y) => y.delta - x.delta)[0];
    const dele = [op && op.delta > 0.5 ? `${op.navn} producerer ${energi(op.delta)} mere` : "", ned && ned.delta < -0.5 ? `${ned.navn} ${energi(-ned.delta)} mindre` : ""].filter(Boolean);
    const budskab = dele.length === 0 ? "Enhedsfordelingen er den samme i begge kørsler." : `I scenariet ${dele.join(" og ")}.`;
    const ea = new Map(a.samlet.enheder.map((e) => [e.navn, e])), eb = new Map(b.samlet.enheder.map((e) => [e.navn, e]));
    const rækker = [...v].sort((x, y) => y.b - x.b || y.a - x.a || x.navn.localeCompare(y.navn));
    const fremhaev = [...v].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
    return (
        <Kort titel="Varmeproduktion pr. enhed" afgraensning="hele perioden · Ref og Scen, ΔRef, ΔRef%" budskab={budskab}
            fod="Ref = omrids (reference), Scen = fyldt (scenarie), ΔRef = scenarie − reference på samme skala; ΔRef% med én decimal, N/A når referencen er 0. Afvigelserne er neutrale (blå): at en enhed producerer mere, er hverken godt eller skidt — virkningen står i Δ driftsomkostning. Tabellen viser andel og driftstimer, som grafen ikke viser.">
            <ProduktionMod varians={v} fremhaev={fremhaev && Math.abs(fremhaev.delta) > 0.5 ? fremhaev.navn : undefined} />
            <Tabel rækker={rækker} nøgle={(x) => x.navn} kolonner={[
                { navn: "Enhed", vis: (x) => x.navn },
                { navn: "Andel Ref", vis: (x) => ellers(ea.get(x.navn)?.andel_pct, (z) => `${dec(z, 1)} %`), tal: true },
                { navn: "Andel Scen", vis: (x) => ellers(eb.get(x.navn)?.andel_pct, (z) => `${dec(z, 1)} %`), tal: true },
                {
                    navn: "ΔRef andel (pp)", tal: true, vis: (x) => {
                        const pa = ea.get(x.navn)?.andel_pct, pb = eb.get(x.navn)?.andel_pct;
                        return pa == null || pb == null ? "–" : <DeltaTal v={pb - pa} polaritet={0} skala={{ factor: 1, prefix: "", decimals: 1 }} />;
                    },
                },
                { navn: "Driftstimer Ref", vis: (x) => ellers(ea.get(x.navn)?.driftstimer, tal), tal: true },
                { navn: "Driftstimer Scen", vis: (x) => ellers(eb.get(x.navn)?.driftstimer, tal), tal: true },
            ]} />
        </Kort>
    );
}

function MaanedDelta({ a, b }: { a: Pakke; b: Pakke }) {
    const ta = a.maaneder, tb = b.maaneder;
    const måneder = [...new Set([...ta.maaneder, ...tb.maaneder])].sort();
    const enheder = [...new Set([...ta.objekter("produktion_gwh"), ...tb.objekter("produktion_gwh")])];
    // Rækkerne i samme rækkefølge som grafen ovenfor (scenariets produktion, største først).
    enheder.sort((x, y) => (tb.periode(y, "produktion_gwh") ?? 0) - (tb.periode(x, "produktion_gwh") ?? 0) || x.localeCompare(y));
    // MWh som resten af siden (GWh × 1.000): én enhed for varmeproduktion på hele siden.
    const d = (m: string, e: string | null) => {
        const felt = e === null ? "varmebehov_gwh" : "produktion_gwh";
        const va = m === "periode" ? ta.periode(e, felt) : ta.vaerdi(m, e, felt);
        const vb = m === "periode" ? tb.periode(e, felt) : tb.vaerdi(m, e, felt);
        return va == null && vb == null ? null : ((vb ?? 0) - (va ?? 0)) * 1000;
    };
    const kolonner = [...måneder, "periode"];
    const flyt = måneder.map((m) => [m, enheder.reduce((sum, e) => sum + Math.abs(d(m, e) ?? 0), 0) / 2] as const).sort((x, y) => y[1] - x[1]);
    const budskab = måneder.length === 0 ? "Ingen månedstal."
        : flyt[0][1] < 0.5 ? "Ingen produktion flytter mellem enhederne i nogen måned."
            : `Mest flytning i ${maanedKort(flyt[0][0])}: ${tal(flyt[0][1])} MWh skifter enhed.`;
    const MWH = { factor: 1, prefix: "", decimals: 0 };
    return (
        <Kort titel="Måned for måned" afgraensning="ΔRef varmeproduktion, MWh, pr. enhed og måned" budskab={budskab}
            fod="ΔRef = scenarie − reference, neutral (blå). 'Hele perioden' er differensen mellem de to kørslers periode-rækker (regnet på de fulde tidsserier), ikke summen af månederne.">
            <Tabel rækker={[...enheder, VARMEBEHOV]} nøgle={(e) => e} kolonner={[
                { navn: "Enhed", vis: (e) => (e === VARMEBEHOV ? <span className="fjv-a-svag">Varmebehov</span> : e) },
                ...kolonner.map((m) => ({
                    navn: m === "periode" ? "Hele perioden" : maanedKort(m), tal: true,
                    vis: (e: string) => {
                        const t = <DeltaTal v={d(m, e === VARMEBEHOV ? null : e)} polaritet={0} skala={MWH} />;
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
    if (!ba && !bb) {
        return <Kort titel="Balancemarked" afgraensning="aFRR og mFRR" budskab="Ingen af kørslerne er regnet med balancemarked." />;
    }
    const rk = balanceDelta(ba, bb);
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
    return (
        <Kort titel="Balancemarked" afgraensning="pr. marked og produkt, t.kr." budskab={budskab}
            fod={<>{forbehold("altid ved balancetal")} {sporer.includes("A") ? SPOR_A_FORBEHOLD : ""} {sporer.includes("B") ? SPOR_B_FORBEHOLD : ""} Netto og brutto lægges aldrig sammen. Δ vises kun, når begge kørsler har tallet.</>}>
            <div className="fjv-a-raekke">{sporer.map((s) => <SporMaerke key={s} spor={s} />)}</div>
            <Tabel rækker={rk} nøgle={(r) => `${r.marked}|${r.felt}`} kolonner={[
                { navn: "Marked", vis: (r) => (r.marked === "I alt" ? <strong>I alt</strong> : r.marked) },
                { navn: "Produkt", vis: (r) => r.etiket },
                { navn: "Ref (t.kr.)", vis: (r) => tkr(r.a), tal: true },
                { navn: "Scen (t.kr.)", vis: (r) => tkr(r.b), tal: true },
                { navn: "ΔRef", vis: (r) => <DeltaTal v={r.delta} polaritet={1} />, tal: true },
            ]} />
        </Kort>
    );
}

function LagerDelta({ a, b }: { a: Pakke; b: Pakke }) {
    const navne = [...new Set([...a.samlet.lagre.map((l) => l.navn), ...b.samlet.lagre.map((l) => l.navn)])].sort();
    const la = new Map(a.samlet.lagre.map((l) => [l.navn, l])), lb = new Map(b.samlet.lagre.map((l) => [l.navn, l]));
    const kunA = navne.filter((n) => la.has(n) && !lb.has(n)), kunB = navne.filter((n) => lb.has(n) && !la.has(n));
    const budskab = navne.length === 0 ? "Ingen af kørslerne har aktive lagre."
        : kunA.length ? `Scenariet kører uden ${kunA.join(" og ")}.` : kunB.length ? `Scenariet har ${kunB.join(" og ")}, som referencen ikke har.`
            : "Samme lagre i begge kørsler.";
    return (
        <Kort titel="Lager" afgraensning="afladet energi, MWh" budskab={budskab}
            fod={kunA.length || kunB.length ? forbehold("ved sammenligning med og uden tank") : "Niveau ved start er modellens første interval, hvor lagerbalancen er ubundet."}>
            <Tabel rækker={navne} nøgle={(n) => n} tom="Ingen lagre." kolonner={[
                { navn: "Lager", vis: (n) => n },
                { navn: "Ref (MWh)", vis: (n) => (la.has(n) ? ellers(la.get(n)!.afladet_mwh, tal) : "slået fra"), tal: true },
                { navn: "Scen (MWh)", vis: (n) => (lb.has(n) ? ellers(lb.get(n)!.afladet_mwh, tal) : "slået fra"), tal: true },
                { navn: "ΔRef", vis: (n) => <DeltaTal v={(lb.get(n)?.afladet_mwh ?? 0) - (la.get(n)?.afladet_mwh ?? 0)} polaritet={0} skala={{ factor: 1, prefix: "", decimals: 0 }} />, tal: true },
            ]} />
        </Kort>
    );
}
