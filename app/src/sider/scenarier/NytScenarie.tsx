//-----------------------------------------------------------------------
// Nyt scenarie fra et spørgsmål (#/scenarier/nyt[/<værkskode>]).
//
// Værk -> knap (fra viden/knapper.json; kun knapper hvis kraever_stier findes
// i værket) -> appen foreslår BÅDE reference og scenarie med samme periode,
// datakilde og stramt gab -> bekræft -> begge oprettes og bestilles. Findes
// der en sammenlignelig referencekørsel af samme værksrevision, genbruges den.
//-----------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { DataTilstand, Gitter, Kort, Knap, Maerke, Side, Tabel } from "@/components/layout";
import { useKoersler, useKoerselInput, useMotor, useVaerker } from "@/lib/data/hooks";
import { læsÉn } from "@/lib/data/laes";
import { bestilKoersel, gemScenarieAendringer, opdaterScenarie, opretScenarie } from "@/lib/data/skriv";
import { erAktiv } from "@/lib/data/koersel-status";
import { opdaterAlt } from "@/lib/data/opdatering";
import { visVaerdi } from "@/lib/data/vaerdi";
import { modelDato, tal, tidspunkt } from "@/lib/format";
import { rutehref } from "@/lib/rute";
import { GRAENSER } from "../../../rayfin/data/fjv.constants";
import type { Koersel } from "../../../rayfin/data/Koersel";
import type { OmraadeProps } from "../typer";
import { Felt, Fundliste } from "./faelles";
import { enhedAf, gabProcent, rodKode, stiEtiket, useBlade, useVaerketsTidsserier } from "./hjaelp";
import {
    anvendVarmelast, læsVarmelast, maalteMuligheder, maaltVarmelastMulig, tjekVarmelast, valgFraNøgle, valgNøgle, varmelastMuligheder, varmelastTekst,
    type TidsserieInfo,
} from "./varmelast";
import {
    bygPar, erTil, forventetFrosset, forventetInput, forventetVarighed, frosset, knapStatus, pinsAf, pinsPasser, knapStyrerBalancering, knapStyrerVarmelast,
    datoTilFelt, feltTilDato, sammeKort, STRAMT_GAB, tjekPeriode, tjekÆndringer, utilgængeligTekst, varighedTekst, visningsnavn, værdifelter,
    type Blade, type Forslag, type Fund, type Pins, type Scenariefelter,
} from "./logik";
import { saetningFørKørsel } from "./historie";
import { periodeFelter, periodeFraRute, type Periodevalg } from "./nyt-rute";
import { opretOgBestilPar, type ParTilstand } from "./par";
import type { Knap as KnapT } from "./viden";
import { FASTE_VINDUER, KNAPPER } from "./viden.data";

const MAKS_KANDIDATER = 6;
const INGEN_SERIER: readonly TidsserieInfo[] = [];

/** Periodefelterne for siden: egne datoer står i dansk form i felterne og læses her (S8). */
function sidensPeriode(p: Periodevalg): { start: string | null; slut: string | null } {
    if (p.type === "egen") return { start: feltTilDato(p.start) || null, slut: feltTilDato(p.slut) || null };
    return periodeFelter(p);
}

/** Startperioden fra ruten (#/scenarier/nyt/<værk>/<knap>/<periode>, K4-F8); egne datoer vises i dansk form. */
function startPeriode(seg: string | undefined): { valg: Periodevalg; ugyldig?: string } {
    const r = periodeFraRute(seg);
    return r.valg.type === "egen" ? { ...r, valg: { type: "egen", start: datoTilFelt(r.valg.start), slut: datoTilFelt(r.valg.slut) } } : r;
}

/** Effektiv `balancing.activation.settle` for en side: ændringen, ellers værkets. */
function settleRealized(f: Forslag, blade: Blade): boolean {
    const æ = f.aendringer.find((a) => a.type === "set" && a.sti === "balancing.activation.settle");
    return (æ?.vaerdi_json ?? blade.get("balancing.activation.settle")) === '"realized"';
}

function periodeTekst(start: string | undefined, slut: string | undefined, doegn: number | undefined): string {
    if (!start || !slut) return "–";
    return `${modelDato(start)} – ${modelDato(slut)}${doegn ? ` (${Math.round(doegn)} døgn)` : ""}`;
}

/**
 * Find en eksisterende referencekørsel med præcis det frosne input, referencen ville få.
 * Et fast antal hook-kald (MAKS_KANDIDATER), så hook-reglerne holder.
 */
function useGenbrugeligReference(
    kandidater: readonly Koersel[], forventet: ReadonlyMap<string, string> | undefined, pins: Pins | undefined, pinsHentes: boolean,
): { fundet?: Koersel; pins?: Pins; søger: boolean } {
    const k = kandidater.slice(0, MAKS_KANDIDATER);
    const i0 = useKoerselInput(k[0]?.id), i1 = useKoerselInput(k[1]?.id), i2 = useKoerselInput(k[2]?.id);
    const i3 = useKoerselInput(k[3]?.id), i4 = useKoerselInput(k[4]?.id), i5 = useKoerselInput(k[5]?.id);
    const input = [i0, i1, i2, i3, i4, i5];
    if (!forventet) return { søger: false };
    // Genbrug udsættes, til Motorens pins kendes; kendes de ikke (fejl/tom), genbruges intet.
    if (pinsHentes) return { søger: true };
    if (!pins) return { søger: false };
    let søger = false;
    for (let i = 0; i < k.length; i++) {
        const d = input[i].data;
        if (!d) { søger = true; continue; }
        if (!sammeKort(forventet, frosset(d))) continue;
        // Samme model- og df-data-SHA som en ny kørsel ville få; begge skal kendes (K3-N4, §6b).
        const p = pinsAf(d, k[i]);
        if (!pinsPasser(pins, p)) continue;
        return { fundet: k[i], pins: p, søger: false };
    }
    return { søger };
}

export default function NytScenarie({ sti, gåTil, bruger }: OmraadeProps) {
    const vaerker = useVaerker();
    const [vaerkKode, setVaerkKode] = useState<string | undefined>(sti[1]);
    const vaerk = vaerker.data?.find((v) => v.kode === vaerkKode) ?? (vaerkKode ? undefined : vaerker.data?.[0]);
    const { blade, ...parametre } = useBlade(vaerk?.id);
    const rod = rodKode(vaerk, vaerker.data);
    const vaerkKoersler = useKoersler({ vaerkId: vaerk?.id });
    const iKø = useKoersler({ status: ["koe"] });
    // De pins en ny kørsel får fryses fra Motor (KONTRAKT §6c) — derfor er det dem, en reference skal matche (K3-N4).
    const motor = useMotor();
    const motorPins: Pins | undefined = motor.data ? { model: motor.data.model_commit, data: motor.data.data_commit } : undefined;
    const motorUkendt = motor.data === undefined && !motor.fejl;

    const [knapId, setKnapId] = useState<string | undefined>(sti[2]);
    const [valgt, setValgt] = useState<Record<string, string>>({});
    const [værdier, setVærdier] = useState<Record<string, string>>({});
    const [rutePeriode] = useState(() => startPeriode(sti[3]));
    const [periode, setPeriode] = useState<Periodevalg>(rutePeriode.valg);
    const [medBal, setMedBal] = useState(false);
    /** Varmelast for begge kørsler (nøgle fra varmelast.ts; "" = standarden: aktiv serie eller syntetisk). */
    const [varmelast, setVarmelast] = useState<string>("");
    /** "Målt varmelast"-knappens målte serie/fil for scenariet ("" = den første mulighed). */
    const [maalt, setMaalt] = useState<string>("");
    const [skridt, setSkridt] = useState<string | undefined>();
    const [fejl, setFejl] = useState<string | undefined>();
    const [færdig, setFærdig] = useState<ParTilstand | undefined>();
    const [sender, setSender] = useState(false);
    /** Er parret delvist oprettet (så knappen fortsætter i stedet for at starte forfra)? */
    const [påbegyndt, setPåbegyndt] = useState(false);
    // Én klientnøgle pr. brugerhandling og ét fremskridt pr. par: "Prøv igen" fortsætter.
    const nøgle = useRef<string | null>(null);
    const tilstand = useRef<ParTilstand>({});

    /** Ethvert nyt valg starter et nyt par. */
    const nyt = () => { nøgle.current = null; tilstand.current = {}; setFejl(undefined); setFærdig(undefined); setPåbegyndt(false); };

    const ts = useVaerketsTidsserier(vaerk?.id);
    const serier = ts.data ?? INGEN_SERIER;
    /** Uden serierne kendes "værkets aktive" ikke, og en syntetisk side kunne fryse den aktive serie — vent. */
    const serierHentes = !!vaerk && ts.data === undefined && !ts.fejl;
    // "Målt varmelast" kan også bruge værkets egne gyldige tidsserier (§6d), ikke kun repoets filer.
    const statusser = useMemo(() => (blade ? KNAPPER.map((k) => {
        const st = knapStatus(k, blade, rod);
        if (k.id !== "maalt_varmelast") return { k, st };
        const mulig = maaltVarmelastMulig(k, serier, rod);
        return { k, st: { ...st, mulig, grund: mulig ? undefined : st.grund, valg: [] } };
    }) : undefined), [blade, rod, serier]);
    const valgtKnap = statusser?.find((x) => x.k.id === knapId && x.st.mulig);
    const knap: KnapT | undefined = valgtKnap?.k;

    // Valg: brugerens, hvis det stadig er en mulighed; ellers den første.
    const valgEff = useMemo(() => Object.fromEntries((valgtKnap?.st.valg ?? []).map((v) =>
        [v.pladsholder, v.muligheder.includes(valgt[v.pladsholder]) ? valgt[v.pladsholder] : v.muligheder[0]])), [valgtKnap, valgt]);
    const felter = useMemo(() => (knap && blade ? værdifelter(knap, blade, valgEff) : []), [knap, blade, valgEff]);
    const værdierEff = useMemo(() => Object.fromEntries(felter.map((f) => [f.pladsholder, værdier[f.pladsholder] ?? f.standard])), [felter, værdier]);

    const fællesMul = varmelastMuligheder(serier, rod);
    const fællesValg = varmelast ? valgFraNøgle(varmelast) : læsVarmelast([], null, serier);
    const maaltMul = maalteMuligheder(serier, rod);
    const maaltValg = valgFraNøgle(maalt && maaltMul.some((x) => x.nøgle === maalt) ? maalt : maaltMul[0]?.nøgle ?? "syntetisk");
    const par = useMemo((): { par?: { reference: Forslag; scenarie: Forslag }; fejl?: string } => {
        if (!knap || !blade) return {};
        try {
            const p = bygPar(knap, blade, valgEff, værdierEff, medBal);
            // Varmelasten sættes eksplicit på begge sider (§6d): "målt varmelast" = syntetisk reference mod målt
            // scenarie; alle andre knapper = samme valg på begge sider, så kun knappen er forskellig.
            if (knap.id === "maalt_varmelast") anvendVarmelast(p, { type: "syntetisk" }, maaltValg, serier);
            else anvendVarmelast(p, fællesValg, fællesValg, serier);
            return { par: p };
        } catch (e) {
            return { fejl: e instanceof Error ? e.message : String(e) };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valgene er afledt af varmelast/maalt/serier, som står her
    }, [knap, blade, valgEff, værdierEff, medBal, varmelast, maalt, serier]);

    const pf = sidensPeriode(periode);
    const fælles = { periode_start: pf.start, periode_slut: pf.slut, ...STRAMT_GAB, tidsgraense_s: null };
    const enMedBal = !!par.par && (par.par.reference.felter.med_balancering || par.par.scenarie.felter.med_balancering);
    const periodeSvar = blade ? tjekPeriode(pf.start, pf.slut, blade, { medBalancering: enMedBal }) : undefined;

    const fund: Fund[] = [];
    // Et tomt værdifelt er en manglende oplysning, ikke en fejl: knappen er spærret (intet par), men intet lyser rødt.
    const tomtFelt = felter.some((f) => !(værdierEff[f.pladsholder] ?? "").trim());
    if (par.fejl) fund.push({ niveau: tomtFelt ? "advarsel" : "fejl", tekst: par.fejl });
    if (rutePeriode.ugyldig) fund.push({ niveau: "advarsel", tekst: rutePeriode.ugyldig });
    if (ts.fejl) fund.push({ niveau: "advarsel", tekst: `Værkets tidsserier kunne ikke hentes (${ts.fejl.message}); varmelast kan kun være syntetisk eller en af repoets filer.` });
    if (par.par && blade) {
        const tjekket = new Set<string>();
        for (const side of [par.par.reference, par.par.scenarie]) {
            for (const f of tjekVarmelast(læsVarmelast(side.aendringer, side.felter.heat_csv, serier), serier, { start: pf.start, slut: pf.slut }, blade)) {
                if (!tjekket.has(f.tekst)) { tjekket.add(f.tekst); fund.push(f); }
            }
        }
    }
    if (periodeSvar) fund.push(...periodeSvar.fund);
    if (par.par && blade) {
        for (const [navn, s] of [["Referencen", par.par.reference], ["Scenariet", par.par.scenarie]] as const) {
            for (const f of tjekÆndringer(s.aendringer, blade)) fund.push({ ...f, tekst: `${navn}: ${f.tekst}` });
        }
    }
    const blokeret = fund.some((f) => f.niveau === "fejl");

    // Genbrug: samme værksrevision, ikke fejlet/annulleret, samme ønskede gab (hvis kendt).
    const kandidater = useMemo(() => (vaerkKoersler.data ?? []).filter((k) =>
        k.vaerk_revision === vaerk?.revision && (k.status === "faerdig" || erAktiv(k.status))
        && (k.oensket_rel_gap == null || k.oensket_rel_gap === STRAMT_GAB.mip_rel_gap)
        && (k.oensket_abs_gap == null || k.oensket_abs_gap === STRAMT_GAB.mip_abs_gap)), [vaerkKoersler.data, vaerk?.revision]);
    const forventetRef = par.par && blade && !blokeret
        ? forventetFrosset(par.par.reference.aendringer, { ...fælles, ...par.par.reference.felter } as Scenariefelter, blade, serier)
        : undefined;
    const genbrug = useGenbrugeligReference(kandidater, forventetRef, motorPins, motorUkendt);

    const egneIKø = (iKø.data ?? []).filter((k) => k.bestilt_af === bruger).length;
    const pladser = GRAENSER.ventendePrBruger - egneIKø;
    const behov = genbrug.fundet ? 1 : 2;

    const varighed = (f: Forslag) => (periodeSvar?.doegn && blade
        ? varighedTekst(forventetVarighed({ rodKode: rod, doegn: periodeSvar.doegn, medBalancering: f.felter.med_balancering, settleRealized: settleRealized(f, blade) }))
        : "–");

    const bekræft = async () => {
        if (!knap || !par.par || !vaerk) return;
        nøgle.current ??= crypto.randomUUID();
        setSender(true);
        setFejl(undefined);
        try {
            const svar = await opretOgBestilPar({
                vaerkId: vaerk.id, spørgsmål: knap.spoergsmaal, forklaring: knap.forklaring, fælles,
                reference: par.par.reference, scenarie: par.par.scenarie,
                genbrug: genbrug.fundet && !tilstand.current.refScenarieId ? { scenarie_id: genbrug.fundet.scenarie_id, koersel_id: genbrug.fundet.id, pins: genbrug.pins } : undefined,
            }, bruger, nøgle.current, tilstand.current, {
                opretScenarie, gemScenarieAendringer, bestilKoersel,
                // Efter bestilling: hvilke pins fik scenariet faktisk frosset (startBestilling skriver dem på Koersel)?
                frosnePins: async (id) => { const k = await læsÉn("Koersel", id); return { model: k?.model_commit, data: k?.data_commit }; },
                sætReference: async (id, ref) => { await opdaterScenarie(id, { reference_scenarie_id: ref }); },
            }, setSkridt);
            if (svar.ok) { setFærdig({ ...svar.tilstand }); nøgle.current = null; tilstand.current = {}; }
            else setFejl(svar.afvist);
            opdaterAlt();
        } catch (e) {
            setFejl(e instanceof Error ? e.message : String(e));
        } finally {
            setPåbegyndt(!!tilstand.current.refScenarieId);
            setSender(false);
            setSkridt(undefined);
        }
    };

    const mulige = statusser?.filter((x) => x.st.mulig).length ?? 0;
    const budskab = !vaerk ? undefined
        : !knap ? `${mulige} af ${KNAPPER.length} spørgsmål kan stilles til ${vaerk.navn}. Vælg et — appen foreslår både reference og scenarie.`
            : `${knap.spoergsmaal} ${vaerk.navn}, ${periodeTekst(periodeSvar?.start, periodeSvar?.slut, periodeSvar?.doegn)}: reference og scenarie regnes med samme periode og gab, så kun knappen er forskellig.`;

    return (
        <Side omraade="Scenarier" titel="Nyt scenarie fra et spørgsmål" budskab={budskab}
            handlinger={<Knap sekundaer onClick={() => gåTil("scenarier")}>Tilbage til oversigten</Knap>}>
            <Gitter form="4-8">
                <Kort titel="1 · Værk" afgraensning="aktive værker"
                    budskab={vaerk ? `${vaerk.navn} (revision ${vaerk.revision}).` : vaerker.data ? "Vælg et værk." : undefined}>
                    <DataTilstand h={vaerker}>
                        {(v) => (
                            <Tabel rækker={v} nøgle={(x) => x.id} valgt={vaerk?.id} tom="Ingen værker."
                                onVælg={(x) => { setVaerkKode(x.kode); setKnapId(undefined); nyt(); }}
                                kolonner={[{ navn: "Værk", vis: (x) => x.navn }, { navn: "Kode", vis: (x) => <span className="fs-lille">{x.kode}</span> }]} />
                        )}
                    </DataTilstand>
                </Kort>
                <Kort titel="2 · Spørgsmål" afgraensning={vaerk?.navn}
                    budskab={statusser ? (knap ? `Valgt: ${knap.spoergsmaal}` : `${mulige} spørgsmål kan stilles; de øvrige kræver noget, værket ikke har.`) : undefined}
                    fod="Én knap ad gangen: kombineres flere, kan bidragene ikke skilles ad (doc/KOERSEL.md).">
                    <DataTilstand h={{ ...parametre, data: statusser }} højde={220}>
                        {(s) => (
                            <div className="fs-valg">
                                {s.map(({ k, st }) => (
                                    <button key={k.id} type="button" aria-pressed={k.id === knap?.id} disabled={!st.mulig}
                                        title={st.mulig ? k.forklaring : utilgængeligTekst(k, st).detalje}
                                        onClick={() => { setKnapId(k.id); setValgt({}); setVærdier({}); nyt(); }}>
                                        <strong>{k.spoergsmaal}</strong>
                                        <small>{k.gruppe}{st.mulig ? "" : ` · ${utilgængeligTekst(k, st).tekst}`}</small>
                                    </button>
                                ))}
                            </div>
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
            {knap && blade && vaerk && (
                <Gitter form="8-4">
                    <Kort titel="3 · Reference og scenarie" afgraensning={knap.gruppe}
                        budskab={par.par ? parSaetning(par.par, fælles, blade, vaerk.navn, serier) : par.fejl}
                        fod={`Kilde: ${knap.kilde}. Gab: ${gabProcent(STRAMT_GAB.mip_rel_gap)} og højst ${tal(STRAMT_GAB.mip_abs_gap)} kr. — standardgabet (0,5 %) kan være større end selve differensen.`}>
                        <p className="fs-tekst">{knap.forklaring}</p>
                        <div className="fs-felter">
                            {valgtKnap!.st.valg.map((v) => (
                                <Felt key={v.pladsholder} etiket={v.etiket}>
                                    <select className="fjv-felt" value={valgEff[v.pladsholder]}
                                        onChange={(e) => { setValgt({ ...valgt, [v.pladsholder]: e.target.value }); nyt(); }}>
                                        {v.muligheder.map((m) => <option key={m} value={m}>{visningsnavn(v.pladsholder, m)}</option>)}
                                    </select>
                                </Felt>
                            ))}
                            {felter.map((f) => (
                                <Felt key={f.pladsholder} etiket={`${f.pladsholder.startsWith("<") ? stort(f.pladsholder.replace(/[<>]/g, "")) : "Ny værdi"} · ${stiEtiket(f.sti)}`}
                                    hjælp={`Værket: ${visVaerdi(f.vaerk_json)}${enhedAf(f.sti) ? ` ${enhedAf(f.sti)}` : ""}`}>
                                    <input className="fjv-felt" inputMode="decimal" value={værdierEff[f.pladsholder] ?? ""}
                                        aria-invalid={!!par.fejl && !tomtFelt}
                                        onChange={(e) => { setVærdier({ ...værdier, [f.pladsholder]: e.target.value }); nyt(); }} />
                                </Felt>
                            ))}
                            <Felt etiket="Periode" hjælp={periode.type === "vindue" ? FASTE_VINDUER[periode.i].note : periode.type === "vaerk" ? "Værkets egen time-blok." : "Datoerne er inklusive."}>
                                <select className="fjv-felt" value={periode.type === "vindue" ? `v${periode.i}` : periode.type}
                                    onChange={(e) => {
                                        const x = e.target.value;
                                        setPeriode(x === "vaerk" ? { type: "vaerk" } : x === "egen" ? { type: "egen", start: datoTilFelt(pf.start), slut: datoTilFelt(pf.slut) } : { type: "vindue", i: Number(x.slice(1)) });
                                        nyt();
                                    }}>
                                    {FASTE_VINDUER.map((v, i) => <option key={v.navn} value={`v${i}`}>{v.navn}</option>)}
                                    <option value="vaerk">Værkets periode</option>
                                    <option value="egen">Egen periode</option>
                                </select>
                            </Felt>
                            {periode.type === "egen" && (
                                <>
                                    <Felt etiket="Fra og med" hjælp="dd-mm-åååå"><input className="fjv-felt" inputMode="numeric" placeholder="dd-mm-åååå" value={periode.start} onChange={(e) => { setPeriode({ ...periode, start: e.target.value }); nyt(); }} /></Felt>
                                    <Felt etiket="Til og med" hjælp="dd-mm-åååå"><input className="fjv-felt" inputMode="numeric" placeholder="dd-mm-åååå" value={periode.slut} onChange={(e) => { setPeriode({ ...periode, slut: e.target.value }); nyt(); }} /></Felt>
                                </>
                            )}
                            {!knapStyrerBalancering(knap) && (
                                <Felt etiket="Balancemarked (begge kørsler)" hjælp="aFRR og mFRR. Kun el-forbrugende enheder byder.">
                                    <label className="fs-afkryds">
                                        <input type="checkbox" checked={medBal} onChange={(e) => { setMedBal(e.target.checked); nyt(); }} /> Med balancering
                                    </label>
                                </Felt>
                            )}
                            {!knapStyrerVarmelast(knap) && fællesMul.length > 1 && (
                                <Felt etiket="Varmelast (begge kørsler)" hjælp="Værkets tidsserier uploades under Konfiguration → Tidsserier.">
                                    <select className="fjv-felt" value={valgNøgle(fællesValg)} onChange={(e) => { setVarmelast(e.target.value); nyt(); }}>
                                        {fællesMul.map((x) => <option key={x.nøgle} value={x.nøgle}>{x.etiket}</option>)}
                                    </select>
                                </Felt>
                            )}
                            {knap.id === "maalt_varmelast" && (
                                <Felt etiket="Målt varmelast (scenariet)" hjælp="Referencen regnes med den syntetiske varmelast.">
                                    <select className="fjv-felt" value={valgNøgle(maaltValg)} onChange={(e) => { setMaalt(e.target.value); nyt(); }}>
                                        {maaltMul.map((x) => <option key={x.nøgle} value={x.nøgle}>{x.etiket}</option>)}
                                    </select>
                                </Felt>
                            )}
                        </div>
                        {par.par && <Parforskel par={par.par} blade={blade} serier={serier} />}
                        <Fundliste fund={fund} />
                        {knap.advarsler?.length ? (
                            <div className="fs-blok">
                                <span className="fs-overskrift">Værd at vide</span>
                                <Fundliste fund={knap.advarsler.map((a) => ({ niveau: "advarsel" as const, tekst: a }))} />
                            </div>
                        ) : null}
                    </Kort>
                    <Kort titel="4 · Bekræft og kør" afgraensning="to kørsler"
                        budskab={færdig ? "Begge er bestilt — følg dem på scenariets side."
                            : genbrug.fundet ? "Referencen er allerede regnet; kun scenariet bestilles."
                                : genbrug.søger ? "Leder efter en referencekørsel, der kan genbruges…" : "Både reference og scenarie bestilles."}
                        fod="Referencen bestilles først, så køen regner den først. Status opdateres på scenariets side.">
                        <dl className="fs-dl">
                            <dt>Periode</dt><dd>{periodeTekst(periodeSvar?.start, periodeSvar?.slut, periodeSvar?.doegn)}</dd>
                            <dt>Reference</dt>
                            <dd>{genbrug.fundet
                                ? <>Genbruger kørslen fra {tidspunkt(genbrug.fundet.bestilt)} ({genbrug.fundet.status === "faerdig" ? "færdig" : "i gang"})</>
                                : par.par ? `Ny kørsel, forventet ${varighed(par.par.reference)}` : "–"}</dd>
                            <dt>Scenarie</dt><dd>{par.par ? `Ny kørsel, forventet ${varighed(par.par.scenarie)}` : "–"}</dd>
                            <dt>Dine pladser i køen</dt><dd>{pladser} af {GRAENSER.ventendePrBruger} ledige; parret bruger {behov}</dd>
                        </dl>
                        {pladser < behov && !færdig && <Fundliste fund={[{ niveau: "advarsel", tekst: "Du har ikke plads nok i køen til parret; vent, til en af dine kørsler er startet. Ellers afvises den sidste bestilling." }]} />}
                        {!færdig && (
                            <div className="fs-raekke">
                                <Knap onClick={bekræft} disabled={sender || blokeret || !par.par || !bruger || genbrug.søger || serierHentes}
                                    title={serierHentes ? "Henter værkets tidsserier — varmelasten afhænger af dem" : undefined}>
                                    {sender ? (skridt ?? "Arbejder…") : fejl && påbegyndt ? "Prøv igen" : "Bekræft og kør begge"}
                                </Knap>
                            </div>
                        )}
                        {fejl && <p className="fjv-tilstand" data-tone="fejl" role="alert">{fejl}</p>}
                        {færdig && (
                            <div className="fs-blok">
                                <div className="fs-raekke">
                                    <Maerke tone="ok">Bestilt</Maerke>
                                    {færdig.refGenbrugt && <Maerke>Reference genbrugt</Maerke>}
                                    {færdig.pinsUdskiftet && <Maerke tone="advarsel">Ny reference: df-data skiftede under bestillingen</Maerke>}
                                </div>
                                <a className="fs-link" href={rutehref("scenarier", færdig.scenScenarieId!)}>Følg scenariet</a>
                                <a className="fs-link" href={rutehref("scenarier", færdig.refScenarieId!)}>Se referencen</a>
                            </div>
                        )}
                    </Kort>
                </Gitter>
            )}
        </Side>
    );
}

/** Sætning 1 af parret, regnet af fv-analyse's generator på det input, de to kørsler vil få frosset (A2). */
function parSaetning(par: { reference: Forslag; scenarie: Forslag }, fælles: Pick<Scenariefelter, "periode_start" | "periode_slut" | "mip_rel_gap" | "mip_abs_gap" | "tidsgraense_s">, blade: Blade, vaerkNavn: string, serier: readonly TidsserieInfo[]): string {
    const input = (f: Forslag) => forventetInput(f.aendringer, { ...fælles, ...f.felter }, blade, serier);
    return saetningFørKørsel(input(par.reference), "referencen", input(par.scenarie), "scenariet", vaerkNavn, serier);
}

/** Tabel: hvad er forskelligt — værkets værdi, referencens og scenariets. */
function Parforskel({ par, blade, serier }: { par: { reference: Forslag; scenarie: Forslag }; blade: Blade; serier: readonly TidsserieInfo[] }) {
    type Række = { hvad: string; vaerk: string; ref: string; scen: string };
    const rækker: Række[] = [];
    const bal = (b: boolean) => (b ? "Med" : "Uden");
    rækker.push({ hvad: "Balancemarked", vaerk: "Uden", ref: bal(par.reference.felter.med_balancering), scen: bal(par.scenarie.felter.med_balancering) });
    if (par.reference.felter.balancing_method || par.scenarie.felter.balancing_method) {
        rækker.push({ hvad: "Indtægtsmetode", vaerk: visVaerdi(blade.get("balancing.method")), ref: par.reference.felter.balancing_method ?? "værkets", scen: par.scenarie.felter.balancing_method ?? "værkets" });
    }
    const vl = (f: Forslag) => varmelastTekst(læsVarmelast(f.aendringer, f.felter.heat_csv, serier), serier);
    const vVl = varmelastTekst(læsVarmelast([], null, serier), serier);
    if (vl(par.reference) !== vVl || vl(par.scenarie) !== vVl) rækker.push({ hvad: "Varmelast", vaerk: vVl, ref: vl(par.reference), scen: vl(par.scenarie) });
    if (par.scenarie.felter.ekstra_flag || par.reference.felter.ekstra_flag) {
        rækker.push({ hvad: "Ekstra flag", vaerk: "–", ref: par.reference.felter.ekstra_flag ?? "–", scen: par.scenarie.felter.ekstra_flag ?? "–" });
    }
    const stier = new Map<string, Række>();
    const vis = (a: Forslag["aendringer"][number]) => (a.type === "set" ? visVaerdi(a.vaerdi_json) : a.type === "enable" ? "Til" : "Fra");
    const nøgle = (a: Forslag["aendringer"][number]) => (a.type === "set" ? a.sti : a.sti);
    for (const [side, f] of [["ref", par.reference], ["scen", par.scenarie]] as const) {
        for (const a of f.aendringer) {
            if (a.sti.startsWith("_tidsserie.")) continue;   // står i rækken "Varmelast"
            const k = nøgle(a);
            const enabled = a.type === "set" ? undefined : erTil(a.sti, blade) ? "true" : "false";
            const r = stier.get(k) ?? {
                hvad: a.type === "set" ? stiEtiket(a.sti) : `${a.sti} i drift`,
                vaerk: a.type === "set" ? visVaerdi(blade.get(a.sti)) : enabled === "true" ? "Til" : "Fra",
                ref: "", scen: "",
            };
            r[side] = vis(a);
            stier.set(k, r);
        }
    }
    for (const r of stier.values()) { r.ref ||= r.vaerk; r.scen ||= r.vaerk; rækker.push(r); }
    return (
        <Tabel rækker={rækker} nøgle={(r) => r.hvad}
            kolonner={[
                { navn: "Hvad", vis: (r) => r.hvad },
                { navn: "Værket", vis: (r) => <span className="fs-gammel">{r.vaerk}</span> },
                { navn: "Reference", vis: (r) => <span className={r.vaerk !== "–" && r.ref !== r.vaerk ? "fs-ny" : undefined}>{r.ref}</span> },
                { navn: "Scenarie", vis: (r) => <span className={r.scen !== r.ref ? "fs-ny" : undefined}>{r.scen}</span> },
            ]} />
    );
}

function stort(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
