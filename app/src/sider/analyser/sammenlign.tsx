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
import { Forklaring, StablededeSoejler, Varians } from "./grafer";
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
            <Gitter><Sammenlignelighed a={a} b={b} /></Gitter>
            <Gitter form="4-8">
                <DeltaObjektiv a={a} b={b} />
                <ToKoersler a={a} b={b} />
            </Gitter>
            <Gitter><InputForskel a={a} b={b} /></Gitter>
            <Gitter><Produktion a={a} b={b} pladser={pladser} /></Gitter>
            <Gitter><MaanedDelta a={a} b={b} pladser={pladser} /></Gitter>
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
        <Kort titel="Kan de to kørsler sammenlignes?" afgraensning="KONTRAKT §6b" budskab={budskab}
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
        <Kort titel="Δ driftsomkostning" afgraensning="scenarie − reference" budskab={d ? differenceTekst(d) : "Mindst én af kørslerne mangler et objektiv."}
            fod="Differens i omkostning, ikke indtægt. Hvert objektiv kan kun være for højt (højst sit gab over det bedst mulige), så det sande Δ ligger i [Δ − scenariets gab; Δ + referencens gab]. |Δ| under summen af de to gab kan ikke skelnes fra nul.">
            {d && <>
                <div className={`fjv-a-helt ${d.indenForTolerance ? "fjv-a-svag" : d.delta > 0 ? "fjv-a-neg" : d.delta < 0 ? "fjv-a-pos" : ""}`}>{medFortegn(d.delta)}<small>kr.</small></div>
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
                    ["Tolerance", d.tolerance === null ? "ukendt" : `${tal(d.tolerance)} kr. (summen af de to gab)`],
                    ["Sandt Δ", intervalTekst(d)?.replace(/^Det sande Δ (ligger |er )/, "") ?? "ukendt"],
                    ["Relativt", ellers(a.k.objektiv_dkk, (x) => (x === 0 ? "–" : `${medFortegn((d.delta / Math.abs(x)) * 100, (v) => dec(v, 2))} %`))],
                ]} />
            </>}
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
                { navn: "Driftsomkostning (kr.)", vis: (r) => ellers(r[1].samlet.objektiv_dkk ?? r[1].k.objektiv_dkk, tal), tal: true },
                { navn: "Højst for højt (kr.)", vis: (r) => { const g = absolutGab(r[1].k); return g.kr === null ? "ukendt" : tal(g.kr); }, tal: true },
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

function Produktion({ a, b, pladser }: { a: Pakke; b: Pakke; pladser: Map<string, number> }) {
    const v = produktionsvarians(a.samlet.enheder, b.samlet.enheder);
    const ned = [...v].sort((x, y) => x.delta - y.delta)[0], op = [...v].sort((x, y) => y.delta - x.delta)[0];
    const dele = [op && op.delta > 0.5 ? `${op.navn} producerer ${energi(op.delta)} mere` : "", ned && ned.delta < -0.5 ? `${ned.navn} ${energi(-ned.delta)} mindre` : ""].filter(Boolean);
    const budskab = dele.length === 0 ? "Enhedsfordelingen er den samme i begge kørsler." : `I scenariet ${dele.join(" og ")}.`;
    return (
        <Kort titel="Varmeproduktion pr. enhed" afgraensning="hele perioden, MWh — absolut og relativ varians" budskab={budskab}
            fod="Hul bjælke = reference, fyldt = scenarie, på samme skala. Δ er neutralt farvet: at en enhed producerer mere er hverken godt eller skidt — omkostningen står i Δ driftsomkostning.">
            <Forklaring serier={v.map((x) => ({ navn: x.navn, plads: pladser.get(x.navn) ?? 0 }))} ekstra={<span><i className="fjv-a-hul" />Reference</span>} />
            <Varians rækker={v.map((x) => ({ ...x, plads: pladser.get(x.navn) ?? 0 }))} enhed="MWh" formatér={(x) => tal(x)} />
            <Tabel rækker={v} nøgle={(x) => x.navn} kolonner={[
                { navn: "Enhed", vis: (x) => x.navn },
                { navn: "Reference MWh", vis: (x) => tal(x.a), tal: true },
                { navn: "Scenarie MWh", vis: (x) => tal(x.b), tal: true },
                { navn: "Δ MWh", vis: (x) => medFortegn(x.delta), tal: true },
                { navn: "Δ %", vis: (x) => (x.relativ === null ? (x.b > 0 ? "ny" : "–") : `${medFortegn(x.relativ * 100, (z) => dec(z, 1))} %`), tal: true },
            ]} />
        </Kort>
    );
}

function MaanedDelta({ a, b, pladser }: { a: Pakke; b: Pakke; pladser: Map<string, number> }) {
    const ta = a.maaneder, tb = b.maaneder;
    const måneder = [...new Set([...ta.maaneder, ...tb.maaneder])].sort();
    const enheder = [...new Set([...ta.objekter("produktion_gwh"), ...tb.objekter("produktion_gwh")])].sort();
    const d = (m: string, e: string) => {
        const va = m === "periode" ? ta.periode(e, "produktion_gwh") : ta.vaerdi(m, e, "produktion_gwh");
        const vb = m === "periode" ? tb.periode(e, "produktion_gwh") : tb.vaerdi(m, e, "produktion_gwh");
        return va == null && vb == null ? null : (vb ?? 0) - (va ?? 0);
    };
    const søjler = måneder.map((m) => ({ etiket: maanedKort(m), dele: enheder.map((e) => ({ navn: e, plads: pladser.get(e) ?? 0, værdi: d(m, e) ?? 0 })) }));
    const flyt = måneder.map((m) => [m, enheder.reduce((s, e) => s + Math.abs(d(m, e) ?? 0), 0) / 2] as const).sort((x, y) => y[1] - x[1]);
    const budskab = måneder.length === 0 ? "Ingen månedstal."
        : flyt[0][1] < 0.0005 ? "Ingen produktion flytter mellem enhederne i nogen måned."
            : `Mest flytning i ${maanedKort(flyt[0][0])}: ${dec(flyt[0][1], 2)} GWh skifter enhed.`;
    return (
        <Kort titel="Måned for måned" afgraensning="Δ varmeproduktion pr. enhed, GWh (scenarie − reference)" budskab={budskab}
            fod="'Hele perioden' er differensen mellem de to kørslers periode-rækker (regnet på de fulde tidsserier), ikke summen af månederne.">
            <Forklaring serier={enheder.map((e) => ({ navn: e, plads: pladser.get(e) ?? 0 }))} />
            <StablededeSoejler søjler={søjler} enhed="Δ GWh" formatér={(x) => `${medFortegn(x, (z) => dec(z, 3))} GWh`} />
            <Tabel rækker={[...måneder, "periode"]} nøgle={(m) => m} kolonner={[
                { navn: "Måned", vis: (m) => (m === "periode" ? <strong>Hele perioden</strong> : maanedKort(m)) },
                ...enheder.map((e) => ({ navn: e, vis: (m: string) => ellers(d(m, e), (x) => medFortegn(x, (z) => dec(z, 2))), tal: true })),
                {
                    navn: "Δ varmebehov", tal: true, vis: (m: string) => {
                        const va = m === "periode" ? ta.periode(null, "varmebehov_gwh") : ta.vaerdi(m, null, "varmebehov_gwh");
                        const vb = m === "periode" ? tb.periode(null, "varmebehov_gwh") : tb.vaerdi(m, null, "varmebehov_gwh");
                        return va == null || vb == null ? "–" : medFortegn(vb - va, (z) => dec(z, 2));
                    },
                },
            ]} />
        </Kort>
    );
}

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
        ? `Kun ${hvem(forskel.med)} har balancemarked, og det er den eneste forskel. Balancemarkedets værdi: ${tal(forskel.vaerdi)} kr. — se Δ driftsomkostning; indtægten nedenfor er ikke værdien.`
        : forskel?.type === "blandet"
            ? `Kun ${hvem(forskel.med)} har balancemarked, men kørslerne afviger også i ${forskel.grunde.slice(0, 3).map(grund).join(", ")}${forskel.grunde.length > 3 ? " med flere" : ""}. Δ driftsomkostning (${medFortegn(forskel.med === "b" ? -forskel.vaerdi : forskel.vaerdi)} kr.) er en samlet omkostningsforskel med flere ændringer — ikke balancemarkedets værdi.`
            : dNetto !== null ? `Δ balanceindtægt netto ${medFortegn(dNetto)} kr.` : "Balancetallene kan ikke stilles op mod hinanden.";
    return (
        <Kort titel="Balancemarked" afgraensning="pr. marked og produkt, kr." budskab={budskab}
            fod={<>{forbehold("altid ved balancetal")} {sporer.includes("A") ? SPOR_A_FORBEHOLD : ""} {sporer.includes("B") ? SPOR_B_FORBEHOLD : ""} Netto og brutto lægges aldrig sammen. Δ vises kun, når begge kørsler har tallet.</>}>
            <div className="fjv-a-raekke">{sporer.map((s) => <SporMaerke key={s} spor={s} />)}</div>
            <Tabel rækker={rk} nøgle={(r) => `${r.marked}|${r.felt}`} kolonner={[
                { navn: "Marked", vis: (r) => (r.marked === "I alt" ? <strong>I alt</strong> : r.marked) },
                { navn: "Produkt", vis: (r) => r.etiket },
                { navn: "Reference", vis: (r) => ellers(r.a, tal), tal: true },
                { navn: "Scenarie", vis: (r) => ellers(r.b, tal), tal: true },
                { navn: "Δ", vis: (r) => (r.delta === null ? "–" : medFortegn(r.delta)), tal: true },
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
                { navn: "Reference", vis: (n) => (la.has(n) ? ellers(la.get(n)!.afladet_mwh, tal) : "slået fra"), tal: true },
                { navn: "Scenarie", vis: (n) => (lb.has(n) ? ellers(lb.get(n)!.afladet_mwh, tal) : "slået fra"), tal: true },
                { navn: "Δ", vis: (n) => medFortegn((lb.get(n)?.afladet_mwh ?? 0) - (la.get(n)?.afladet_mwh ?? 0)), tal: true },
            ]} />
        </Kort>
    );
}
