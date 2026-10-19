//-----------------------------------------------------------------------
// Analysen af én tidsserie — bruges både på en gemt serie og på en fil,
// før den uploades. Profil over tid med zoom, varighedskurve, måneder,
// døgnprofil, huller, og (varmelast) målt mod værkets varmelastmodel.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Gitter, Knap, Kort, Maerke, Tabel } from "@/components/layout";
import { SKRIDT_MS, type Serie } from "./serie";
import { analyser, døgnprofil, nedsampl, natteværdier, sammenlign, slutMs, varighedskurve, type Analyse, type Hul, type Sammenligning } from "./tidsserie-analyse";
import {
    dkTid, døgnBudskab, dækningBudskab, energi, energiBudskab, maaltModSyntetiskFund, månedBudskab, sammenligningBudskab, spidsBudskab, varighedBudskab,
} from "./tidsserie-budskaber";
import type { Rolle } from "./tidsserie-kilde";
import { DoegnGraf, MaanedsGraf, TidsGraf, VarighedsGraf, type Spor } from "./TidsserieGrafer";
import { useSyntese, type Syntesetilstand } from "./useSyntese";
import { dk, dkFri } from "./vis";

const TIME = 3_600_000, DØGN = 24 * TIME;
const VINDUER = [
    { id: "hele", navn: "Hele perioden", ms: Infinity },
    { id: "aar", navn: "År", ms: 365 * DØGN },
    { id: "maaned", navn: "Måned", ms: 31 * DØGN },
    { id: "uge", navn: "Uge", ms: 7 * DØGN },
    { id: "doegn", navn: "Døgn", ms: DØGN },
] as const;
type VindueId = (typeof VINDUER)[number]["id"];

function vinduesBudskab(s: Serie, fra: number, til: number): string {
    const step = SKRIDT_MS[s.opløsning];
    let maks = -Infinity, maksMs = 0, sum = 0, n = 0;
    const i0 = Math.max(0, Math.floor((fra - s.startMs) / step)), i1 = Math.min(s.værdier.length, Math.ceil((til - s.startMs) / step));
    for (let i = i0; i < i1; i++) {
        const v = s.værdier[i];
        if (v === null) continue;
        sum += v; n++;
        if (v > maks) { maks = v; maksMs = s.startMs + i * step; }
    }
    if (!n) return `Ingen værdier fra ${dkTid(fra, false)} til ${dkTid(til - 1, false)}.`;
    return `Fra ${dkTid(fra, false)} til ${dkTid(til - 1, false)}: middel ${dk(sum / n, 1)} MW, højst ${dk(maks, 1)} MW (${dkTid(maksMs)}).`;
}

export function TidsserieAnalyse({ serie, rolle, navn, blade, kompakt }: {
    serie: Serie; rolle: Rolle; navn: string;
    /** Værkets blade (sti → vaerdi_json) — til varmelastmodellen. */
    blade?: ReadonlyMap<string, string>;
    /** Upload-forhåndsvisning: færre kort. */
    kompakt?: boolean;
}) {
    const a = useMemo(() => analyser(serie), [serie]);
    const varighed = useMemo(() => varighedskurve(serie), [serie]);
    const døgn = useMemo(() => døgnprofil(serie), [serie]);
    const nat = useMemo(() => (rolle === "solprofil" ? natteværdier(serie) : undefined), [serie, rolle]);
    const syntese = useSyntese(serie, blade, rolle === "varmelast");
    const sml = useMemo(() => (syntese?.total ? sammenlign(serie, syntese.fraMs, syntese.total) : null), [serie, syntese]);
    const start = serie.startMs, slut = slutMs(serie);

    const [vindueId, setVindueId] = useState<VindueId>("hele");
    const [vinduesSlut, setVinduesSlut] = useState(slut);
    const længde = Math.min(VINDUER.find((v) => v.id === vindueId)!.ms, slut - start);
    const til = Math.min(slut, Math.max(start + længde, vinduesSlut));
    const fra = til - længde;
    const flyt = (retning: -1 | 1) => setVinduesSlut(Math.min(slut, Math.max(start + længde, til + retning * længde)));

    const spor: Spor[] = useMemo(() => {
        const ud: Spor[] = [{ navn, type: "maalt", spande: nedsampl(serie, fra, til, 600) }];
        if (syntese?.total) {
            const syn: Serie = { startMs: syntese.fraMs, opløsning: "1h", værdier: syntese.total };
            const sp = nedsampl(syn, fra, til, 600);
            if (sp.length) ud.push({ navn: "Varmelastmodellen", type: "model", spande: sp });
        }
        return ud;
    }, [serie, syntese, fra, til, navn]);

    const måneder = useMemo(() => a.måneder.map((m) => {
        const s = sml?.måneder.find((x) => x.nøgle === m.nøgle);
        // Modellens søjle kun for måneder, hvor alle målte timer også har en modelværdi (ellers er søjlerne ikke sammenlignelige).
        const model = s && Math.abs(s.målt_mwh - m.mwh) < 1e-6 ? s.syntetisk_mwh : undefined;
        return { nøgle: m.nøgle, maalt: m.mwh, model, hel: m.intervaller === m.mulige };
    }), [a, sml]);

    return (
        <>
            <Gitter form="3-3-3-3">
                <Kort titel="Periode" afgraensning={serie.opløsning === "1h" ? "timeværdier" : "kvarterværdier"}
                    budskab={`${dkFri(Math.round((slut - start) / DØGN))} døgn, ${dkFri(a.intervaller)} intervaller.`}>
                    <p className="kf-tal-raekke"><span><strong>{dkTid(start, false)}</strong></span></p>
                    <p className="kf-kilde">til {dkTid(slut - SKRIDT_MS[serie.opløsning])} (timens start)</p>
                </Kort>
                <Kort titel="Dækning" afgraensning="huller" budskab={dækningBudskab(a)}>
                    <p className="kf-tal-raekke"><span><strong>{dk(a.dækning * 100, 1)} %</strong></span></p>
                </Kort>
                <Kort titel="Energi" afgraensning="MWh = MW × timer" budskab={energiBudskab(a, rolle)}>
                    <p className="kf-tal-raekke"><span><strong>{energi(a.mwh)}</strong></span></p>
                </Kort>
                <Kort titel={rolle === "varmelast" ? "Spidslast" : "Største ydelse"} afgraensning="MW" budskab={spidsBudskab(a)}>
                    <p className="kf-tal-raekke"><span><strong>{dk(a.maks, 1)} MW</strong></span></p>
                </Kort>
            </Gitter>
            <Gitter>
                <Kort titel="Profil over tid" afgraensning="MW, dansk tid på aksen" budskab={vinduesBudskab(serie, fra, til)}
                    handling={
                        <div className="kf-zoom" role="group" aria-label="Zoom">
                            {VINDUER.filter((v) => v.ms === Infinity || v.ms < slut - start).map((v) => (
                                <button key={v.id} type="button" className="fjv-knap" data-variant="sekundaer" aria-pressed={vindueId === v.id}
                                    onClick={() => { setVindueId(v.id); setVinduesSlut(slut); }}>{v.navn}</button>
                            ))}
                            {vindueId !== "hele" && <>
                                <Knap sekundaer onClick={() => flyt(-1)} disabled={fra <= start} title="Tidligere">‹ Før</Knap>
                                <Knap sekundaer onClick={() => flyt(1)} disabled={til >= slut} title="Senere">Efter ›</Knap>
                            </>}
                        </div>
                    }
                    fod={<Signatur syntese={!!syntese?.total} bånd={til - fra > 600 * SKRIDT_MS[serie.opløsning]} />}>
                    <TidsGraf spor={spor} fraMs={fra} tilMs={til} />
                </Kort>
            </Gitter>
            <Gitter form="4-4-4">
                <Kort titel="Varighedskurve" afgraensning="MW, sorteret" budskab={varighedBudskab(varighed, a.maks, a.medVærdi * a.timerPrInterval)}
                    fod="Hver værdi i serien, sorteret fra største til mindste. Kurvens areal er energien.">
                    <VarighedsGraf punkter={varighed} />
                </Kort>
                <Kort titel="Energi pr. måned" afgraensning="MWh, dansk måned" budskab={månedBudskab(a)}
                    fod={måneder.some((m) => m.model !== undefined) ? "Fyldt: målt. Tom: varmelastmodellen i de samme timer. Lyse søjler: ufuldstændig måned." : "Lyse søjler er ufuldstændige måneder (huller eller seriens første/sidste måned)."}>
                    <MaanedsGraf måneder={måneder} />
                </Kort>
                <Kort titel="Døgnprofil" afgraensning="middel pr. time, UTC" budskab={døgnBudskab(døgn, rolle, nat)}
                    fod={rolle === "varmelast" ? "Sammenlign med værkets grundprofil (fanen Varmelast), som også er i UTC." : "En solprofil skal være 0 om natten; sol midt om natten tyder på forkert tidszone."}>
                    <DoegnGraf værdier={døgn} />
                </Kort>
            </Gitter>
            {!kompakt || rolle === "varmelast" ? (
                <Gitter form="8-4">
                    <HulKort a={a} />
                    {rolle === "varmelast"
                        ? <ModelKort syntese={syntese} sml={sml} />
                        : <Kort titel="Plausibilitet" afgraensning="solprofil" budskab={nat && nat.mørke ? `${dkFri(nat.timer)} af ${dkFri(nat.mørke)} mørke timer (kl. 22–04 dansk tid) har sol over 0 (${dk((nat.timer / nat.mørke) * 100, 1)} %); ${dkFri(a.negative)} negative værdier.` : "Ingen mørke timer i serien."}>
                            <div className="kf-noegletal">
                                <div><strong>{dkFri(nat?.timer ?? 0)}</strong><span>mørke timer med sol &gt; 0</span></div>
                                <div><strong>{dkFri(a.negative)}</strong><span>negative værdier</span></div>
                                <div><strong>{dkFri(a.nuller)}</strong><span>intervaller med 0</span></div>
                            </div>
                        </Kort>}
                </Gitter>
            ) : null}
        </>
    );
}

function Signatur({ syntese, bånd }: { syntese: boolean; bånd: boolean }) {
    return (
        <span className="kf-signatur">
            <span><i />Målt (middel pr. punkt)</span>
            {bånd && <span><i data-type="baand" />Mindste–største i punktet</span>}
            {syntese && <span><i data-type="model" />Varmelastmodellen (værkets parametre + DMI)</span>}
        </span>
    );
}

function HulKort({ a }: { a: Analyse }) {
    const t = (n: number) => `${dkFri(n * a.timerPrInterval)} t`;
    return (
        <Kort titel="Huller" afgraensning="intervaller uden værdi" budskab={dækningBudskab(a)}
            fod="Modellen interpolerer huller i en målt varmelast lineært, hvis de udgør højst 5 % af kørslens periode; ellers afviser den kørslen. En solprofil skal dække hele perioden.">
            <Tabel<Hul> rækker={a.huller.slice(0, 20)} nøgle={(h) => String(h.fraMs)} tom="Ingen huller."
                kolonner={[
                    { navn: "Fra", vis: (h) => dkTid(h.fraMs) },
                    { navn: "Til (ekskl.)", vis: (h) => dkTid(h.tilMs) },
                    { navn: "Varighed", vis: (h) => t(h.intervaller), tal: true },
                ]} />
            {a.huller.length > 20 && <p className="kf-kilde">… og {a.huller.length - 20} huller mere.</p>}
        </Kort>
    );
}

function ModelKort({ syntese, sml }: { syntese: Syntesetilstand | null; sml: Sammenligning | null }) {
    const budskab = sml ? sammenligningBudskab(sml) : syntese?.grund ?? (syntese?.henter ? "Henter DMI-temperatur …" : "Kan ikke regnes.");
    const fund = sml ? maaltModSyntetiskFund(sml) : null;
    return (
        <Kort titel="Målt mod varmelastmodellen" afgraensning="seneste ≤ 12 måneder" budskab={budskab}
            fod={<>Modellen regner varmelasten af værkets parametre (fanen Varmelast) og DMI-temperaturen {syntese?.kolonne ? <> (kolonnen <span className="fjv-mono">{syntese.kolonne}</span>)</> : null}{syntese?.data_commit ? <> fra df-data <span className="fjv-mono">{syntese.data_commit.slice(0, 7)}</span></> : null}. Den bruges, når et scenarie ikke vælger en tidsserie. Det første døgn påvirkes af, at bygningernes træghed starter fra seriens første time.</>}>
            {fund && <p className="kf-fund"><span><Maerke tone="advarsel">advarsel</Maerke> {fund.besked}</span></p>}
            {sml ? (
                <div className="kf-noegletal">
                    <div><strong>{energi(sml.målt_mwh)}</strong><span>målt</span></div>
                    <div><strong>{energi(sml.syntetisk_mwh)}</strong><span>modellen</span></div>
                    <div><strong>{dk(sml.forhold, 2)}</strong><span>forhold målt / model (normalt 0,85–1,15)</span></div>
                    <div><strong>{dk(sml.døgnkorrelation, 2)}</strong><span>døgnkorrelation, {dkFri(sml.døgn)} døgn (normalt ≥ 0,85)</span></div>
                    <div><strong>{dk(sml.rmse_mw, 2)} MW</strong><span>RMSE pr. time</span></div>
                    <div><strong>{dk(sml.målt_maks, 1)} / {dk(sml.syntetisk_maks, 1)}</strong><span>spidslast målt / model, MW</span></div>
                </div>
            ) : syntese?.henter ? <div className="fjv-skelet" style={{ height: 120 }} aria-busy="true" /> : <p className="fjv-tilstand"><Maerke tone="advarsel">ikke tilgængelig</Maerke></p>}
        </Kort>
    );
}
