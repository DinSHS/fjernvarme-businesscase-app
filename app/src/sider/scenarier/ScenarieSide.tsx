//-----------------------------------------------------------------------
// Ét scenarie (#/scenarier/<id>): redigér indstillinger og ændringsliste, se
// det effektive input (værkets værdi -> scenariets), kør, følg kørslen og gå
// til sammenligningen med referencen. Arkivér (ingen sletning).
//-----------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { DataTilstand, Gitter, Kort, Knap, Maerke, Side, StatusMaerke, Tabel } from "@/components/layout";
import { useKoersler, useKoerselStatus, useScenarie, useScenarieAendringer, useScenarier, useVaerker } from "@/lib/data/hooks";
import { bestilKoersel, gemScenarieAendringer, opdaterScenarie, type ÆndringUdkast } from "@/lib/data/skriv";
import { STATUS_TEKST, erAktiv } from "@/lib/data/koersel-status";
import { opdaterAlt } from "@/lib/data/opdatering";
import { kodVaerdi, visVaerdi } from "@/lib/data/vaerdi";
import { modelDato, tal, tidspunkt } from "@/lib/format";
import { tkr } from "../analyser/ibcs-grafer";
import { periodeTekst as periodeKort } from "../analyser/fmt";
import { modelKoersel, type Modelkoersel } from "@/lib/modelspejl";
import { rutehref } from "@/lib/rute";
import { GRAENSER, MAKS, TILLADTE_FLAG } from "../../../rayfin/data/fjv.constants";
import type { Koersel } from "../../../rayfin/data/Koersel";
import type { Scenarie } from "../../../rayfin/data/Scenarie";
import type { ScenarieAendring } from "../../../rayfin/data/ScenarieAendring";
import type { Vaerk } from "../../../rayfin/data/Vaerk";
import type { OmraadeProps } from "../typer";
import { Felt, Fundliste } from "./faelles";
import { enhedAf, gabProcent, katalogpost, læsTal, rodKode, stiEtiket, sætbareStier, talTilFelt, tekstTal, useBlade, useVaerketsTidsserier } from "./hjaelp";
import { kodVarmelast, læsVarmelast, tjekVarmelast, valgFraNøgle, valgNøgle, varmelastMuligheder, varmelastTekst, type TidsserieInfo } from "./varmelast";
import { ScenarieHistorie } from "./HistorieKort";
import { KoerselDetaljer } from "./KoerselKort";
import { difference, differenceTekst } from "../analyser/beregn";
import { sammenlignHref } from "./koersel-logik";
import { importTekst, useArkivimporter } from "@/lib/arkiv/markering";
import {
    datoTilFelt, effektivTidsgraense, erTil, feltTilDato, forventetVarighed, objekter, parretsReference, tjekPeriode, tjekÆndringer, visBeskrivelse,
    type Blade, type Fund, type Scenariefelter, type Ændring,
} from "./logik";
import { ANBEFALET_GAB, FASTE_VINDUER } from "./viden.data";

const NETTAB_FLAG = TILLADTE_FLAG[0];

export default function ScenarieSide({ sti, gåTil, bruger }: OmraadeProps) {
    const id = sti[0];
    const s = useScenarie(id);
    const æ = useScenarieAendringer(id);
    const vaerker = useVaerker(true);
    const scenarie = s.data ?? undefined;
    const vaerk = vaerker.data?.find((v) => v.id === scenarie?.vaerk_id);
    const { blade, data: parametre } = useBlade(scenarie?.vaerk_id);
    // Felter markeret [BEKRÆFT] i værket — anbefalingsreglerne nedgraderer, når ændringen rammer dem.
    const bekraeft = useMemo(() => new Set((parametre ?? []).filter((p) => p.bekraeft).map((p) => p.sti)), [parametre]);
    const ts = useVaerketsTidsserier(scenarie?.vaerk_id);
    const serier = useMemo(() => ts.data ?? [], [ts.data]);

    if (s.data === null) {
        return (
            <Side omraade="Scenarier" titel="Scenariet findes ikke" budskab="Det kan være arkiveret eller slettet i databasen."
                handlinger={<Knap sekundaer onClick={() => gåTil("scenarier")}>Tilbage til oversigten</Knap>}>
                <Kort titel="Ingen data" budskab={`Intet scenarie med id ${id}.`} />
            </Side>
        );
    }
    // Vent også på tidsserierne (kladdens varmelast-valg afhænger af dem); fejler de, fortsættes uden.
    if (!scenarie || !æ.data || !vaerk || !blade || (ts.data === undefined && !ts.fejl)) {
        const fejl = s.fejl ?? æ.fejl ?? vaerker.fejl;
        return (
            <Side omraade="Scenarier" titel="Scenarie">
                <Kort titel="Indlæser">
                    <DataTilstand h={{ data: undefined, fejl, indlæser: true, genindlæs: () => {} }}>{() => null}</DataTilstand>
                </Kort>
            </Side>
        );
    }
    // Nøglen nulstiller kladden, når de gemte data ændrer sig (efter "Gem" eller "Opdatér").
    const stempel = JSON.stringify([scenarie, æ.data.map((x) => [x.id, x.type, x.sti, x.vaerdi_json, x.raekkefoelge]), vaerk.revision, serier.map((x) => [x.id, x.aktiv, x.status])]);
    return <Redigering key={stempel} s={scenarie} aendringer={æ.data} vaerk={vaerk} vaerker={vaerker.data ?? []} blade={blade} bekraeft={bekraeft} serier={serier} serierFejl={ts.fejl} gåTil={gåTil} bruger={bruger} />;
}

interface SætRække { nøgle: string; sti: string; input: string; oprindelig?: { input: string; json: string } }

function startTilstand(s: Scenarie, aendringer: readonly ScenarieAendring[], serier: readonly TidsserieInfo[]) {
    return {
        navn: s.navn,
        beskrivelse: visBeskrivelse(s.beskrivelse),
        start: datoTilFelt(s.periode_start),
        slut: datoTilFelt(s.periode_slut),
        medBal: s.med_balancering,
        metode: s.balancing_method ?? "",
        rel: talTilFelt(s.mip_rel_gap),
        abs: talTilFelt(s.mip_abs_gap),
        tid: talTilFelt(s.tidsgraense_s),
        nettab: (s.ekstra_flag ?? "").split(/\s+/).includes(NETTAB_FLAG),
        /** Varmelast-valget som <select>-nøgle (varmelast.ts): aktiv · syntetisk · tidsserie:<id> · repo:<fil>. */
        varmelast: valgNøgle(læsVarmelast(aendringer.map((a) => ({ type: a.type, sti: a.sti, vaerdi_json: a.vaerdi_json })), s.heat_csv, serier)),
        tilFra: Object.fromEntries(aendringer.filter((a) => a.type !== "set").map((a) => [a.sti, a.type])) as Record<string, "enable" | "disable">,
        sæt: aendringer.filter((a) => a.type === "set" && !a.sti.startsWith("_tidsserie.")).map<SætRække>((a) => ({
            nøgle: a.id, sti: a.sti, input: visVaerdi(a.vaerdi_json), oprindelig: { input: visVaerdi(a.vaerdi_json), json: a.vaerdi_json ?? "null" },
        })),
    };
}
type Kladde = ReturnType<typeof startTilstand>;

/** Kladden -> ændringsliste (til/fra først, i værkets rækkefølge) + fejl pr. sæt-række. */
function kladdeÆndringer(k: Kladde, blade: Blade, serier: readonly TidsserieInfo[]): { ændringer: Ændring[]; fund: Fund[] } {
    const fund: Fund[] = [];
    const ændringer: Ændring[] = [];
    const navne = objekter(blade).map((o) => o.navn);
    for (const [navn, type] of Object.entries(k.tilFra).sort(([a], [b]) => navne.indexOf(a) - navne.indexOf(b))) ændringer.push({ type, sti: navn });
    for (const r of k.sæt) {
        if (!r.sti) { fund.push({ niveau: "fejl", tekst: "En ændring mangler et felt — vælg et eller fjern rækken." }); continue; }
        try {
            const json = r.oprindelig && r.input === r.oprindelig.input ? r.oprindelig.json : kodVaerdi(blade.get(r.sti) ?? null, r.input);
            if (json.length > MAKS.json) throw new Error(`Værdien for ${r.sti} er for lang (højst ${MAKS.json} tegn).`);
            ændringer.push({ type: "set", sti: r.sti, vaerdi_json: json });
        } catch (e) {
            fund.push({ niveau: "fejl", sti: r.sti, tekst: `${stiEtiket(r.sti)}: ${e instanceof Error ? e.message : String(e)}` });
            ændringer.push({ type: "set", sti: r.sti, vaerdi_json: null });
        }
    }
    const varmelast = kodVarmelast(valgFraNøgle(k.varmelast), serier).aendring;
    if (varmelast) ændringer.push(varmelast);
    return { ændringer, fund };
}

function kladdeFelter(k: Kladde, serier: readonly TidsserieInfo[]): { felter: Scenariefelter; fund: Fund[] } {
    const fund: Fund[] = [];
    const rel = læsTal(k.rel), abs = læsTal(k.abs), tid = læsTal(k.tid);
    if (Number.isNaN(rel) || (rel != null && !(rel >= 0 && rel < 1))) fund.push({ niveau: "fejl", tekst: "Relativt gab skal være et tal i [0; 1), fx 0,0002." });
    if (Number.isNaN(abs) || (abs != null && abs < 0)) fund.push({ niveau: "fejl", tekst: "Absolut gab skal være et tal ≥ 0 (kr.)." });
    if (Number.isNaN(tid) || (tid != null && (tid <= 0 || !Number.isInteger(tid)))) fund.push({ niveau: "fejl", tekst: "Tidsgrænsen skal være et helt antal sekunder > 0." });
    else if (tid != null && tid > GRAENSER.maksTidsgraenseS) fund.push({ niveau: "fejl", tekst: `Tidsgrænsen må højst være ${GRAENSER.maksTidsgraenseS.toLocaleString("da-DK")} s.` });
    if (!k.navn.trim()) fund.push({ niveau: "fejl", tekst: "Scenariet skal have et navn." });
    const n = (v: number | null) => (v == null || Number.isNaN(v) ? null : v);
    return {
        felter: {
            periode_start: feltTilDato(k.start) || null, periode_slut: feltTilDato(k.slut) || null,
            med_balancering: k.medBal, balancing_method: (k.metode || null) as Scenariefelter["balancing_method"],
            mip_rel_gap: n(rel), mip_abs_gap: n(abs), tidsgraense_s: n(tid),
            ekstra_flag: k.nettab ? NETTAB_FLAG : null, heat_csv: kodVarmelast(valgFraNøgle(k.varmelast), serier).heat_csv,
        },
        fund,
    };
}

/**
 * Gemmer ændringslisten. `gemScenarieAendringer` matcher eksisterende rækker på
 * sti og retter kun værdi/rækkefølge — ikke typen. En til/fra-ændring der skifter
 * type (enable <-> disable) slettes derfor først og oprettes så igen.
 */
async function gemÆndringer(id: string, eksisterende: readonly ScenarieAendring[], nye: readonly ÆndringUdkast[]): Promise<void> {
    const skift = new Set(eksisterende.filter((e) => e.type !== "set" && nye.some((n) => n.type !== "set" && n.sti === e.sti && n.type !== e.type)).map((e) => e.sti));
    if (skift.size === 0) return gemScenarieAendringer(id, eksisterende, nye);
    await gemScenarieAendringer(id, eksisterende, nye.filter((n) => !(n.type !== "set" && skift.has(n.sti))));
    await gemScenarieAendringer(id, [], nye.filter((n) => n.type !== "set" && skift.has(n.sti)));
}

function Redigering({ s, aendringer, vaerk, vaerker, blade, bekraeft, serier, serierFejl, gåTil, bruger }: {
    s: Scenarie; aendringer: readonly ScenarieAendring[]; vaerk: Vaerk; vaerker: readonly Vaerk[]; blade: Blade; bekraeft: ReadonlySet<string>;
    serier: readonly TidsserieInfo[]; serierFejl?: Error;
    gåTil: (sti: string) => void; bruger: string | undefined;
}) {
    const [k, setK] = useState<Kladde>(() => startTilstand(s, aendringer, serier));
    const start = useMemo(() => startTilstand(s, aendringer, serier), [s, aendringer, serier]);
    const [gemmer, setGemmer] = useState(false);
    const [gemSvar, setGemSvar] = useState<{ ok: boolean; tekst: string } | undefined>();
    const [arkivTrin, setArkivTrin] = useState(false);
    const rod = rodKode(vaerk, vaerker);
    // Parrets reference: feltet/beskrivelsen, ellers demo-parret ud fra navnet (logik.ts › parretsReference).
    const vaerketsScenarier = useScenarier(s.vaerk_id);
    const refId = parretsReference(s, vaerketsScenarier.data ?? []);
    const sæt = (d: Partial<Kladde>) => { setK({ ...k, ...d }); setGemSvar(undefined); };

    const æSvar = kladdeÆndringer(k, blade, serier);
    const fSvar = kladdeFelter(k, serier);
    const varmelastValg = valgFraNøgle(k.varmelast);
    const varmelastMul = varmelastMuligheder(serier, rod);
    const periode = tjekPeriode(fSvar.felter.periode_start, fSvar.felter.periode_slut, blade, { medBalancering: k.medBal });
    const fund: Fund[] = [...fSvar.fund, ...periode.fund, ...æSvar.fund, ...tjekÆndringer(æSvar.ændringer.filter((x) => x.type !== "set" || x.vaerdi_json), blade),
        ...tjekVarmelast(varmelastValg, serier, { start: fSvar.felter.periode_start, slut: fSvar.felter.periode_slut }, blade)];
    if (serierFejl) fund.push({ niveau: "advarsel", tekst: `Værkets tidsserier kunne ikke hentes (${serierFejl.message}); varmelast kan kun være syntetisk eller en af repoets filer.` });
    if (k.metode === "activation_value" && !blade.has("balancing.bid_strategy.up_markup_dkk_mwh")) {
        fund.push({ niveau: "fejl", tekst: "Metoden activation_value kræver balancing.bid_strategy i værket." });
    }
    if (k.metode === "legacy" && blade.has("balancing.activation.foresight")) {
        fund.push({ niveau: "advarsel", tekst: "Med metoden legacy bruges værkets activation-blok slet ikke; differensen blander metode og aktiveringsmodel." });
    }
    const blokeret = fund.some((f) => f.niveau === "fejl");
    const ændret = JSON.stringify([k, null]) !== JSON.stringify([start, null]);

    const koersler = useKoersler({ scenarieId: s.id });
    const levende = useKoerselStatus(koersler.data);
    const importer = useArkivimporter();
    const refKoersler = useKoersler({ scenarieId: refId });
    const refLevende = useKoerselStatus(refId ? refKoersler.data : undefined);
    const seneste = levende[0];
    const reference = refLevende.find((x) => x.status === "faerdig") ?? refLevende[0];

    // Varighed og budskab regnes af det GEMTE scenarie (det er det, en kørsel fryser).
    const gemtPeriode = tjekPeriode(s.periode_start, s.periode_slut, blade, { medBalancering: s.med_balancering });
    const settle = (aendringer.find((a) => a.type === "set" && a.sti === "balancing.activation.settle")?.vaerdi_json ?? blade.get("balancing.activation.settle")) === '"realized"';
    const varighed = gemtPeriode.doegn ? forventetVarighed({ rodKode: rod, doegn: gemtPeriode.doegn, medBalancering: s.med_balancering, settleRealized: settle }) : undefined;
    const tidsgrænse = effektivTidsgraense(s.tidsgraense_s, blade);

    const gem = async () => {
        setGemmer(true);
        setGemSvar(undefined);
        try {
            // Referencen gemmes i feltet; en gammel henvisningslinje i beskrivelsen flyttes dermed over (visBeskrivelse har fjernet den).
            const besk = k.beskrivelse;
            if (besk.length > MAKS.beskrivelse) throw new Error(`Beskrivelsen er for lang (højst ${MAKS.beskrivelse} tegn).`);
            const f = fSvar.felter;
            // null rydder et felt i databasen (undefined ville lade det stå).
            const felter = {
                navn: k.navn.trim(), beskrivelse: besk || null, reference_scenarie_id: refId ?? null, periode_start: f.periode_start, periode_slut: f.periode_slut,
                med_balancering: f.med_balancering, balancing_method: f.balancing_method, mip_rel_gap: f.mip_rel_gap,
                mip_abs_gap: f.mip_abs_gap, tidsgraense_s: f.tidsgraense_s, ekstra_flag: f.ekstra_flag, heat_csv: f.heat_csv,
            } as unknown as Parameters<typeof opdaterScenarie>[1];
            await opdaterScenarie(s.id, felter);
            await gemÆndringer(s.id, aendringer, æSvar.ændringer.map((x) => ({ type: x.type, sti: x.sti, vaerdi_json: x.vaerdi_json ?? null })));
            setGemSvar({ ok: true, tekst: "Gemt." });
            opdaterAlt();
        } catch (e) {
            setGemSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally {
            setGemmer(false);
        }
    };

    const arkivér = async (arkiveret: boolean) => {
        try {
            await opdaterScenarie(s.id, { arkiveret });
            opdaterAlt();
            if (arkiveret) gåTil("scenarier");
        } catch (e) {
            setGemSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        }
    };

    const antal = aendringer.length;
    // Samme periodeform som Analyser (IBCS.md §3, review-fund B8): "5. jan.–16. jan. 2026", ikke "05-01-2026 – 16-01-2026".
    const periodeTekst = gemtPeriode.start ? periodeKort(gemtPeriode.start, gemtPeriode.slut) : "ugyldig periode";
    const diff = seneste?.status === "faerdig" && reference?.status === "faerdig" ? difference(reference, seneste) : null;
    const budskab = `${antal === 0 ? "Ingen ændringer" : `${antal} ændring${antal === 1 ? "" : "er"}`} mod ${vaerk.navn}, ${periodeTekst}, ${s.med_balancering ? "med" : "uden"} balancering; `
        + (!seneste ? "ikke kørt endnu."
            : diff ? `seneste kørsel er færdig. ${differenceTekst(diff)}`
                : `seneste kørsel: ${STATUS_TEKST[seneste.status].toLowerCase()}.`);

    return (
        <Side omraade="Scenarier" titel={s.navn} budskab={budskab}
            handlinger={<>
                <Knap onClick={gem} disabled={!ændret || blokeret || gemmer}>{gemmer ? "Gemmer…" : ændret ? "Gem ændringer" : "Gemt"}</Knap>
                {ændret && <Knap sekundaer onClick={() => setK(start)}>Fortryd</Knap>}
                <Knap sekundaer onClick={() => gåTil("scenarier")}>Oversigten</Knap>
                <Knap sekundaer onClick={() => gåTil(`scenarier/arkiv/${s.id}`)} title="Scenariet, dets reference og kørslerne som Excel-arkiv (backup og flytning)">Eksportér til Excel</Knap>
                {s.arkiveret
                    ? <Knap sekundaer onClick={() => arkivér(false)}>Genskab</Knap>
                    : arkivTrin
                        ? <><Knap sekundaer onClick={() => arkivér(true)}>Bekræft arkivering</Knap><Knap sekundaer onClick={() => setArkivTrin(false)}>Annullér</Knap></>
                        : <Knap sekundaer onClick={() => setArkivTrin(true)} title="Skjuler scenariet i oversigten; kørslerne bevares">Arkivér</Knap>}
                {s.arkiveret && <Maerke>Arkiveret</Maerke>}
                {gemSvar && <span className="fs-tekst" role="status" style={{ color: gemSvar.ok ? "var(--dash-pos)" : "var(--dash-neg)" }}>{gemSvar.tekst}</span>}
            </>}>
            <Gitter>
                <ScenarieHistorie s={s} ændringer={æSvar.ændringer.filter((x) => x.type !== "set" || x.vaerdi_json)} felter={fSvar.felter}
                    blade={blade} vaerkNavn={vaerk.navn} bekraeft={bekraeft} seneste={seneste} reference={reference} refId={refId} serier={serier} />
            </Gitter>
            <Gitter form="8-4">
                <Kort titel="Indstillinger" afgraensning={`${vaerk.navn} · revision ${vaerk.revision}`}
                    budskab={blokeret ? `${fund.filter((f) => f.niveau === "fejl").length} ting skal rettes, før scenariet kan gemmes.` : ændret ? "Ændret — husk at gemme, før du kører." : "Scenariet er gemt og kan køres."}
                    fod="Tom periode = værkets egen time-blok. Tomme gab og tidsgrænse = værkets (ellers modellens 0,5 % / 5.000 kr. / 600 s).">
                    <div className="fs-felter">
                        <Felt etiket="Navn" bred>
                            <input className="fjv-felt" value={k.navn} maxLength={MAKS.navn} aria-invalid={!k.navn.trim()} onChange={(e) => sæt({ navn: e.target.value })} />
                        </Felt>
                        <Felt etiket="Beskrivelse" bred>
                            <textarea className="fjv-felt" value={k.beskrivelse} maxLength={MAKS.beskrivelse - 60} rows={2} onChange={(e) => sæt({ beskrivelse: e.target.value })} />
                        </Felt>
                        <Felt etiket="Fra og med" hjælp={`Værket: ${modelDato(blade.get("time.start")?.replace(/"/g, ""))}`}>
                            <input className="fjv-felt" inputMode="numeric" placeholder="dd-mm-åååå" value={k.start} onChange={(e) => sæt({ start: e.target.value })} />
                        </Felt>
                        <Felt etiket="Til og med" hjælp={`Værket: ${modelDato(blade.get("time.end")?.replace(/"/g, ""))}`}>
                            <input className="fjv-felt" inputMode="numeric" placeholder="dd-mm-åååå" value={k.slut} onChange={(e) => sæt({ slut: e.target.value })} />
                        </Felt>
                        <Felt etiket="Faste vinduer" hjælp={periode.doegn ? `${Math.round(periode.doegn)} døgn` : undefined}>
                            <select className="fjv-felt" value="" onChange={(e) => {
                                const v = e.target.value;
                                if (v === "vaerk") sæt({ start: "", slut: "" });
                                else if (v) { const w = FASTE_VINDUER[Number(v)]; sæt({ start: datoTilFelt(w.periode_start), slut: datoTilFelt(w.periode_slut) }); }
                            }}>
                                <option value="">Vælg…</option>
                                {FASTE_VINDUER.map((w, i) => <option key={w.navn} value={i}>{w.navn}</option>)}
                                <option value="vaerk">Værkets periode</option>
                            </select>
                        </Felt>
                        <Felt etiket="Balancemarked" hjælp="--with-balancing (aFRR og mFRR)">
                            <label className="fs-afkryds"><input type="checkbox" checked={k.medBal} onChange={(e) => sæt({ medBal: e.target.checked })} /> Med balancering</label>
                        </Felt>
                        <Felt etiket="Indtægtsmetode" hjælp={`Værket: ${visVaerdi(blade.get("balancing.method"))}`}>
                            <select className="fjv-felt" value={k.metode} disabled={!k.medBal} onChange={(e) => sæt({ metode: e.target.value })}>
                                <option value="">Værkets</option>
                                <option value="activation_value">activation_value</option>
                                <option value="legacy">legacy</option>
                            </select>
                        </Felt>
                        <Felt etiket="Relativt gab" hjælp={`Værket: ${gabProcent(Number(blade.get("solver.mip_rel_gap") ?? "0.005"))}; differenser: ${gabProcent(ANBEFALET_GAB.mip_rel_gap)} (skriv ${talTilFelt(ANBEFALET_GAB.mip_rel_gap)}).`}>
                            <input className="fjv-felt" inputMode="decimal" value={k.rel} placeholder="værkets" onChange={(e) => sæt({ rel: e.target.value })} />
                        </Felt>
                        <Felt etiket="Absolut gab (kr.)" hjælp={`Værket: ${tekstTal(blade.get("solver.mip_abs_gap") ?? "5000", "kr.")}; differenser: højst ${tal(ANBEFALET_GAB.mip_abs_gap)} kr. (egen antagelse; modelrepoet sætter kun det relative gab ned).`}>
                            <input className="fjv-felt" inputMode="decimal" value={k.abs} placeholder="værkets" onChange={(e) => sæt({ abs: e.target.value })} />
                        </Felt>
                        <Felt etiket="Tidsgrænse (s)" hjælp={`Højst ${GRAENSER.maksTidsgraenseS.toLocaleString("da-DK")}. Nås den, gemmes bedste løsning.`}>
                            <input className="fjv-felt" inputMode="numeric" value={k.tid} placeholder={`værkets (${tal(effektivTidsgraense(null, blade))})`} onChange={(e) => sæt({ tid: e.target.value })} />
                        </Felt>
                        <Felt etiket="Varmelast" hjælp="Værkets tidsserier uploades under Konfiguration → Tidsserier.">
                            <select className="fjv-felt" value={k.varmelast} onChange={(e) => sæt({ varmelast: e.target.value })}>
                                {varmelastMul.map((x) => <option key={x.nøgle} value={x.nøgle}>{x.etiket}</option>)}
                                {!varmelastMul.some((x) => x.nøgle === k.varmelast) && <option value={k.varmelast}>{varmelastTekst(varmelastValg, serier)} (kan ikke vælges i dette værk)</option>}
                            </select>
                        </Felt>
                        <Felt etiket="Ekstra flag" hjælp="Kun med en nettab-blok og syntetisk varmelast.">
                            <label className="fs-afkryds"><input type="checkbox" checked={k.nettab} onChange={(e) => sæt({ nettab: e.target.checked })} /> {NETTAB_FLAG}</label>
                        </Felt>
                    </div>
                    <Fundliste fund={fund} />
                </Kort>
                <Kort titel="Kørsel" afgraensning={seneste ? `bestilt ${tidspunkt(seneste.bestilt)}` : "ikke kørt"}
                    budskab={seneste ? `${STATUS_TEKST[seneste.status]}${seneste.fase && erAktiv(seneste.status) ? ` · ${seneste.fase}` : ""}.`
                        : varighed ? `Forventet ${forventetTekst(varighed)} regnetid ved ${gemtPeriode.doegn ? Math.round(gemtPeriode.doegn) : "?"} døgn.` : undefined}
                    fod={`Tidsgrænse ${tal(tidsgrænse)} s. Status opdateres hvert 20. sekund, mens kørslen er i gang og fanen er synlig.`}>
                    <KørKnap s={s} bruger={bruger} spærret={ændret ? "Gem først." : blokeret ? "Ret fejlene først." : s.arkiveret ? "Scenariet er arkiveret." : undefined} />
                    <DataTilstand h={koersler}>
                        {() => (seneste
                            ? <KoerselDetaljer k={seneste} varighed={varighed} reference={reference}
                                rådkontekst={{ medBalancering: s.med_balancering, start: gemtPeriode.start, slut: gemtPeriode.slut, dmi: læsTekst(blade.get("data.dmi_area")) }} />
                            : <p className="fs-lille">Scenariet er ikke kørt endnu.</p>)}
                    </DataTilstand>
                    {refId && (
                        <div className="fs-blok">
                            <hr className="fs-skillelinje" />
                            <span className="fs-overskrift">Reference</span>
                            <div className="fs-raekke">
                                {reference ? <StatusMaerke status={reference.status} /> : <span className="fs-lille">ikke kørt</span>}
                                <a className="fs-link" href={rutehref("scenarier", refId)}>Gå til referencen</a>
                            </div>
                        </div>
                    )}
                </Kort>
            </Gitter>
            <Gitter form="6-6">
                <Kort titel="Ændringer" afgraensning="i forhold til værket"
                    budskab={æSvar.ændringer.length === 0 ? "Ingen ændringer — scenariet regner værket, som det står." : `${Object.keys(k.tilFra).length} til/fra og ${k.sæt.length} værdier ændret.`}
                    fod="Et scenarie kan kun ændre eksisterende værdier; nye enheder og blokke er en værksændring (Konfiguration). Slå en enhed fra i stedet for at sætte kapaciteten til 0.">
                    <span className="fs-overskrift">Enheder og lagre i drift</span>
                    <div className="fs-felter">
                        {objekter(blade).map((o) => {
                            const type = k.tilFra[o.navn];
                            const iDrift = type ? type === "enable" : o.til;
                            return (
                                <label key={o.navn} className="fs-afkryds" title={`Værket: ${o.til ? "til" : "fra"}`}>
                                    <input type="checkbox" checked={iDrift} onChange={(e) => {
                                        const tilFra = { ...k.tilFra };
                                        if (e.target.checked === o.til) delete tilFra[o.navn];
                                        else tilFra[o.navn] = e.target.checked ? "enable" : "disable";
                                        sæt({ tilFra });
                                    }} />
                                    <span className={type ? "fs-ny" : undefined}>{o.navn}</span>
                                    <span className="fs-lille">{o.slags === "storage" ? "lager" : "enhed"}{type ? ` · værket: ${o.til ? "til" : "fra"}` : ""}</span>
                                </label>
                            );
                        })}
                    </div>
                    <hr className="fs-skillelinje" />
                    <span className="fs-overskrift">Værdier</span>
                    <SætListe rækker={k.sæt} blade={blade} onChange={(r) => sæt({ sæt: r })} />
                </Kort>
                <Kort titel="Forhåndsvisning" afgraensning="værkets værdi → scenariets"
                    budskab={`${forhåndsrækker(k, fSvar.felter, æSvar.ændringer, blade, serier, modelKoersel(rod)).filter((r) => r.ændret).length} værdier afviger fra værket i den kørsel, scenariet vil bestille.`}
                    fod="Det effektive input fryses ved bestilling (værkets revision + scenariets ændringer); en senere værksændring rører ikke en bestilt kørsel.">
                    <Tabel rækker={forhåndsrækker(k, fSvar.felter, æSvar.ændringer, blade, serier, modelKoersel(rod))} nøgle={(r) => r.hvad}
                        kolonner={[
                            { navn: "Hvad", vis: (r) => r.hvad },
                            { navn: "Værket", vis: (r) => <span className="fs-gammel">{r.vaerk}</span> },
                            { navn: "Scenariet", vis: (r) => <span className={r.ændret ? "fs-ny" : undefined}>{r.scen}</span> },
                        ]} />
                </Kort>
            </Gitter>
            <Gitter>
                <Kort titel="Kørsler" afgraensning="nyeste først"
                    budskab={levende.length === 0 ? "Ingen kørsler endnu." : `${levende.length} kørsel${levende.length === 1 ? "" : "er"}; ${levende.filter((x) => x.status === "faerdig").length} færdig${levende.filter((x) => x.status === "faerdig").length === 1 ? "" : "e"}.`}>
                    <DataTilstand h={koersler}>
                        {() => (
                            <Tabel rækker={levende} nøgle={(x) => x.id} tom="Scenariet er ikke kørt endnu."
                                kolonner={[
                                    { navn: "Bestilt", vis: (x) => tidspunkt(x.bestilt) },
                                    { navn: "Status", vis: (x) => { const i = importer.data?.get(x.id); return <><StatusMaerke status={x.status} />{i && <> <Maerke>{importTekst(i)}</Maerke></>}</>; } },
                                    { navn: "Revision", tal: true, vis: (x) => x.vaerk_revision },
                                    { navn: "Driftsomkostning (t.kr.)", tal: true, vis: (x) => tkr(x.objektiv_dkk) },
                                    { navn: "Opnået gab", tal: true, vis: (x) => (x.opnaaet_gap != null ? `${(x.opnaaet_gap * 100).toLocaleString("da-DK", { maximumFractionDigits: 3 })} %` : "–") },
                                    { navn: "", vis: (x) => <KørselsLinks k={x} reference={reference} /> },
                                ]} />
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
        </Side>
    );
}

function forventetTekst(v: { lav: number; høj: number }): string {
    return v.høj <= 1 ? "under 1 minuts" : `${v.lav}–${v.høj} minutters`;
}

function KørselsLinks({ k, reference }: { k: Koersel; reference?: Koersel }) {
    if (k.status !== "faerdig") return null;
    return (
        <span className="fs-raekke">
            <a className="fs-link" href={rutehref("analyser", k.id)}>Se</a>
            {reference?.status === "faerdig" && reference.id !== k.id && <a className="fs-link" href={sammenlignHref(reference.id, k.id)}>Sammenlign</a>}
        </span>
    );
}

/** "Kør"-knappen: én klientnøgle pr. klik; afvisningen vises ordret. */
function KørKnap({ s, bruger, spærret }: { s: Scenarie; bruger: string | undefined; spærret?: string }) {
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string } | undefined>();
    const [sender, setSender] = useState(false);
    const nøgle = useRef<string | null>(null);
    const kør = async () => {
        setSender(true);
        setSvar(undefined);
        nøgle.current ??= crypto.randomUUID();
        try {
            const r = await bestilKoersel(s.id, bruger, nøgle.current);
            setSvar(r.ok
                ? { ok: true, tekst: r.arbejder?.startet ? "Kørslen er bestilt, og beregningen er startet." : `Kørslen er bestilt. ${r.arbejder?.grund ?? ""}` }
                : { ok: false, tekst: r.afvist ?? "Bestillingen blev afvist." });
            opdaterAlt();
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally {
            nøgle.current = null;
            setSender(false);
        }
    };
    return (
        <div className="fs-blok">
            <div className="fs-raekke">
                <Knap onClick={kør} disabled={sender || !bruger || !!spærret} title={spærret}>{sender ? "Bestiller…" : "Kør scenariet"}</Knap>
                {spærret && <span className="fs-lille">{spærret}</span>}
            </div>
            {svar && <p className="fs-tekst" role="status" style={{ color: svar.ok ? "var(--dash-pos)" : "var(--dash-neg)" }}>{svar.tekst}</p>}
        </div>
    );
}

/** "Vælg felt" -> ny værdi, med katalogets etiket/enhed og værkets nuværende værdi ved siden af. */
function SætListe({ rækker, blade, onChange }: { rækker: readonly SætRække[]; blade: Blade; onChange: (r: SætRække[]) => void }) {
    const stier = useMemo(() => sætbareStier(blade), [blade]);
    const grupper = useMemo(() => {
        const m = new Map<string, string[]>();
        for (const sti of stier) { const g = sti.split(".")[0]; m.set(g, [...(m.get(g) ?? []), sti]); }
        return [...m.entries()];
    }, [stier]);
    const ret = (i: number, r: Partial<SætRække>) => onChange(rækker.map((x, j) => (j === i ? { ...x, ...r } : x)));
    return (
        <div className="fs-blok">
            {rækker.length === 0 && <p className="fs-lille">Ingen værdier ændret.</p>}
            {rækker.map((r, i) => {
                const post = r.sti ? katalogpost(r.sti) : undefined;
                return (
                    <div key={r.nøgle} className="fs-felter">
                        <Felt etiket="Felt" hjælp={post?.forklaring ?? undefined}>
                            <select className="fjv-felt" value={r.sti} onChange={(e) => ret(i, { sti: e.target.value, input: visVaerdi(blade.get(e.target.value)), oprindelig: undefined })}>
                                <option value="">Vælg felt…</option>
                                {grupper.map(([g, ss]) => (
                                    <optgroup key={g} label={g}>
                                        {ss.map((x) => <option key={x} value={x}>{stiEtiket(x)} ({x})</option>)}
                                    </optgroup>
                                ))}
                                {r.sti && !stier.includes(r.sti) && <option value={r.sti}>{r.sti} (findes ikke i værket)</option>}
                            </select>
                        </Felt>
                        <Felt etiket={`Ny værdi${r.sti && enhedAf(r.sti) ? ` (${enhedAf(r.sti)})` : ""}`}
                            hjælp={r.sti ? `Værket: ${visVaerdi(blade.get(r.sti))}` : undefined}>
                            <span className="fs-raekke">
                                <input className="fjv-felt" style={{ flex: 1, width: "auto", minWidth: 0 }} value={r.input} disabled={!r.sti} onChange={(e) => ret(i, { input: e.target.value })} />
                                <Knap sekundaer onClick={() => onChange(rækker.filter((_, j) => j !== i))} title="Fjern ændringen">Fjern</Knap>
                            </span>
                        </Felt>
                    </div>
                );
            })}
            <div className="fs-raekke">
                <Knap sekundaer onClick={() => onChange([...rækker, { nøgle: `ny-${rækker.length}-${Math.random().toString(36).slice(2)}`, sti: "", input: "" }])}>Tilføj ændring</Knap>
            </div>
        </div>
    );
}

interface Forhåndsrække { hvad: string; vaerk: string; scen: string; ændret: boolean }

/** Det effektive input: scenariefelterne og hver ændring, værkets værdi mod scenariets. */
function forhåndsrækker(k: Kladde, f: Scenariefelter, ændringer: readonly Ændring[], blade: Blade, serier: readonly TidsserieInfo[], mk: Modelkoersel | undefined): Forhåndsrække[] {
    const vp = tjekPeriode(null, null, blade, { medBalancering: false });
    const vPeriode = vp.start ? `${modelDato(vp.start)} – ${modelDato(vp.slut)}` : "–";
    const sPeriode = f.periode_start && f.periode_slut ? `${modelDato(f.periode_start)} – ${modelDato(f.periode_slut)}` : vPeriode;
    const rel = (v: string | number) => gabProcent(Number(v));
    const vRel = rel(blade.get("solver.mip_rel_gap") ?? "0.005");
    const vAbs = tekstTal(blade.get("solver.mip_abs_gap") ?? "5000", "kr.");
    const r: Forhåndsrække[] = [
        { hvad: "Periode", vaerk: vPeriode, scen: sPeriode, ændret: sPeriode !== vPeriode },
        // "Værket" = standarden: modelrepoets kørsel af casen (runde 8), ellers appens egen antagelse (uden).
        { hvad: "Balancemarked", vaerk: mk ? `${mk.med_balancering ? "med" : "uden"} (modelrepoet)` : "uden (egen antagelse)", scen: f.med_balancering ? "med" : "uden", ændret: f.med_balancering !== (mk?.med_balancering ?? false) },
        { hvad: "Indtægtsmetode", vaerk: visVaerdi(blade.get("balancing.method")), scen: f.balancing_method ?? visVaerdi(blade.get("balancing.method")), ændret: !!f.balancing_method && JSON.stringify(f.balancing_method) !== blade.get("balancing.method") },
        { hvad: "Relativt gab", vaerk: vRel, scen: f.mip_rel_gap != null ? rel(f.mip_rel_gap) : vRel, ændret: f.mip_rel_gap != null },
        { hvad: "Absolut gab", vaerk: vAbs, scen: f.mip_abs_gap != null ? `${tal(f.mip_abs_gap)} kr.` : vAbs, ændret: f.mip_abs_gap != null },
        { hvad: "Tidsgrænse", vaerk: `${tal(effektivTidsgraense(null, blade))} s`, scen: `${tal(effektivTidsgraense(f.tidsgraense_s, blade))} s`, ændret: f.tidsgraense_s != null },
        { hvad: "Varmelast", vaerk: varmelastTekst(læsVarmelast([], null, serier), serier), scen: varmelastTekst(valgFraNøgle(k.varmelast), serier), ændret: valgFraNøgle(k.varmelast).type !== læsVarmelast([], null, serier).type },
    ];
    if (k.nettab) r.push({ hvad: "Ekstra flag", vaerk: "–", scen: NETTAB_FLAG, ændret: true });
    for (const æ of ændringer) {
        if (æ.type === "set" && æ.sti.startsWith("_tidsserie.")) continue;   // står i rækken "Varmelast"
        if (æ.type === "set") {
            r.push({ hvad: `${stiEtiket(æ.sti)}${enhedAf(æ.sti) ? ` (${enhedAf(æ.sti)})` : ""}`, vaerk: visVaerdi(blade.get(æ.sti)), scen: æ.vaerdi_json ? visVaerdi(æ.vaerdi_json) : "ugyldig", ændret: true });
        } else {
            r.push({ hvad: `${æ.sti} i drift`, vaerk: erTil(æ.sti, blade) ? "til" : "fra", scen: æ.type === "enable" ? "til" : "fra", ændret: true });
        }
    }
    return r;
}

function læsTekst(j: string | undefined): string | undefined {
    try { const v = j ? JSON.parse(j) : undefined; return typeof v === "string" ? v : undefined; } catch { return undefined; }
}
