//-----------------------------------------------------------------------
// Backup og flytning (#/scenarier/arkiv[/<scenarie_id>], runde 13): eksportér scenarier og kørsler til Excel,
// og importér et arkiv igen — med forhåndsvisning, før noget skrives.
//
// Regnearkskoden (fflate + src/lib/arkiv/{eksport,genimport,bog,xlsx}.ts) hentes først ved klik, så bundtet ikke
// vokser for alle. Reglerne står i rayfin/functions/src/arkiv.ts; skrivningen går gennem Function importerArkiv.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { DataTilstand, Fejl, Gitter, Knap, Kort, Maerke, Side, StatusMaerke, Tabel } from "@/components/layout";
import { useKoersler, useScenarier, useVaerker } from "@/lib/data/hooks";
import { opdaterAlt } from "@/lib/data/opdatering";
import { tidspunkt } from "@/lib/format";
import { familier } from "@/lib/arkiv/familier";
import type { Plan, Planpost, Udfaldstype } from "@/lib/arkiv/genimport";
import { AFSLUTTEDE_STATUS } from "../../../rayfin/functions/src/arkiv";
import type { OmraadeProps } from "../typer";

const afsluttet = (s: string) => (AFSLUTTEDE_STATUS as readonly string[]).includes(s);

const UDFALD: Record<Udfaldstype, { tekst: string; tone: "neutral" | "ok" | "advarsel" | "fejl" }> = {
    opret: { tekst: "Oprettes", tone: "ok" },
    genoptag: { tekst: "Genoptages", tone: "ok" },
    findes: { tekst: "Findes allerede", tone: "neutral" },
    konflikt: { tekst: "Konflikt", tone: "advarsel" },
    afvist: { tekst: "Kan ikke importeres", tone: "fejl" },
};

const tekstFejl = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Arkiv({ sti, gåTil, bruger }: OmraadeProps) {
    const scenarieId = sti[1];
    return (
        <Side omraade="Scenarier" titel="Backup og flytning"
            budskab="Gem scenarier og kørsler som Excel-arkiv, og importér arkivet igen — i samme eller en anden installation. Tallene flyttes uændret; intet køres om."
            handlinger={<Knap sekundaer onClick={() => gåTil(scenarieId ? `scenarier/${scenarieId}` : "scenarier")}>{scenarieId ? "Tilbage til scenariet" : "Oversigten"}</Knap>}>
            <Gitter form="6-6">
                {scenarieId ? <EksportérFamilie scenarieId={scenarieId} bruger={bruger} gåTil={gåTil} /> : <EksportérAlt bruger={bruger} gåTil={gåTil} />}
                <Importér bruger={bruger} />
            </Gitter>
        </Side>
    );
}

// ------------------------------------------------------------------ eksport

function EksportérAlt({ bruger, gåTil }: { bruger: string | undefined; gåTil: (s: string) => void }) {
    const [medArkiverede, setMedArkiverede] = useState(false);
    const scenarier = useScenarier(undefined, true);
    const koersler = useKoersler();
    const [status, setStatus] = useState<{ arbejder: boolean; tekst?: string; fejl?: string }>({ arbejder: false });

    // En familie er med, hvis blot ét af dens scenarier er det — så en reference altid følger med sit scenarie.
    const valgte = useMemo(() => {
        if (!scenarier.data) return undefined;
        const arkiveret = new Map(scenarier.data.map((s) => [s.id, s.arkiveret]));
        return familier(scenarier.data).filter((f) => medArkiverede || f.some((id) => !arkiveret.get(id)));
    }, [scenarier.data, medArkiverede]);
    const antalScen = valgte?.flat().length ?? 0;
    const ider = new Set(valgte?.flat());
    const antalKørsler = (koersler.data ?? []).filter((k) => ider.has(k.scenarie_id) && afsluttet(k.status)).length;

    const eksportér = async () => {
        if (!valgte || !bruger) return;
        setStatus({ arbejder: true, tekst: "Henter regnearkskoden …" });
        try {
            const { eksporterSamling, download } = await import("@/lib/arkiv/eksport");
            const z = await eksporterSamling(valgte, bruger, (t) => setStatus({ arbejder: true, tekst: t }));
            download(z.navn, z.bytes, "application/zip");
            setStatus({ arbejder: false, tekst: `Hentet: ${z.navn} — ${z.manifest.filer.length} fil(er), ${z.manifest.filer.reduce((s, f) => s + f.koersler, 0)} kørsler.` });
        } catch (e) {
            setStatus({ arbejder: false, fejl: tekstFejl(e) });
        }
    };

    return (
        <Kort titel="Eksportér arkiv" afgraensning="alle scenarier"
            budskab={valgte ? `${antalScen} ${antalScen === 1 ? "scenarie" : "scenarier"} i ${valgte.length} ${valgte.length === 1 ? "familie" : "familier"} (et scenarie og dets reference), ${antalKørsler} afsluttede ${antalKørsler === 1 ? "kørsel" : "kørsler"}.` : undefined}
            fod="Én .zip med én Excel-fil pr. familie og manifest.json. Hver fil kan importeres for sig. Kørsler, der ikke er færdige, kommer ikke med. Værker og tidsserier eksporteres ikke — eksportér værksarket under Konfiguration. Hver tabel tælles også i databasen; mangler en række, stopper eksporten. Tal bevares med dobbelt præcision (ca. 15–17 betydende cifre), som appen læser dem.">
            <DataTilstand h={scenarier}>
                {() => (
                    <div className="fs-blok">
                        <label className="fs-tekst"><input type="checkbox" checked={medArkiverede} onChange={(e) => setMedArkiverede(e.target.checked)} /> Medtag arkiverede scenarier</label>
                        <p className="fs-lille">Ét scenarie og dets reference: åbn scenariet og vælg <em>Eksportér til Excel</em>, eller vælg i <a className="fs-link" href="#/scenarier" onClick={(e) => { e.preventDefault(); gåTil("scenarier"); }}>oversigten</a>.</p>
                        <div className="fs-raekke">
                            <Knap onClick={eksportér} disabled={status.arbejder || !bruger || !valgte?.length}>{status.arbejder ? "Eksporterer …" : "Eksportér arkiv (.zip)"}</Knap>
                        </div>
                        <Statuslinje status={status} />
                    </div>
                )}
            </DataTilstand>
        </Kort>
    );
}

function EksportérFamilie({ scenarieId, bruger }: { scenarieId: string; bruger: string | undefined; gåTil: (s: string) => void }) {
    const scenarier = useScenarier(undefined, true);
    const koersler = useKoersler();
    const vaerker = useVaerker(true);
    const [fravalgt, setFravalgt] = useState<Set<string>>(new Set());
    const [status, setStatus] = useState<{ arbejder: boolean; tekst?: string; fejl?: string }>({ arbejder: false });

    const familie = useMemo(() => (scenarier.data ? familier(scenarier.data).find((f) => f.includes(scenarieId)) ?? null : undefined), [scenarier.data, scenarieId]);
    const navn = (id: string) => scenarier.data?.find((s) => s.id === id)?.navn ?? id;
    const kørsler = (koersler.data ?? []).filter((k) => familie?.includes(k.scenarie_id));
    const valgte = kørsler.filter((k) => afsluttet(k.status) && !fravalgt.has(k.id));
    const vaerk = vaerker.data?.find((v) => v.id === scenarier.data?.find((s) => s.id === scenarieId)?.vaerk_id);

    const eksportér = async () => {
        if (!familie || !bruger) return;
        setStatus({ arbejder: true, tekst: "Henter regnearkskoden …" });
        try {
            const { eksporterFamilie, download } = await import("@/lib/arkiv/eksport");
            const f = await eksporterFamilie({ scenarier: familie, koersler: new Set(valgte.map((k) => k.id)), bruger, titel: `Arkiv — ${navn(scenarieId)} (${vaerk?.navn ?? "værk"})` },
                (t) => setStatus({ arbejder: true, tekst: t }));
            download(f.navn, f.bytes);
            setStatus({ arbejder: false, tekst: `Hentet: ${f.navn} — ${f.manifest.tabeller.Koersel.raekker} kørsler, ${f.manifest.tabeller.KoerselTime.raekker.toLocaleString("da-DK")} timerækker.` });
        } catch (e) {
            setStatus({ arbejder: false, fejl: tekstFejl(e) });
        }
    };

    return (
        <Kort titel="Eksportér scenariet" afgraensning={familie ? familie.map(navn).join(" · ") : undefined}
            budskab={familie ? `${valgte.length} af ${kørsler.filter((k) => afsluttet(k.status)).length} afsluttede kørsler er valgt.` : undefined}
            fod="Scenariet eksporteres med sin reference (og de scenarier, der bruger det som reference), så parret kan sammenlignes efter en import. Én .xlsx; arket Læs mig forklarer indholdet.">
            <DataTilstand h={{ ...koersler, data: familie === undefined ? undefined : koersler.data }}>
                {() => familie === null ? <Fejl titel="Scenariet findes ikke">Intet scenarie med id {scenarieId}.</Fejl> : (
                    <div className="fs-blok">
                        <Tabel rækker={kørsler} nøgle={(k) => k.id} tom="Ingen kørsler — kun scenarierne eksporteres."
                            kolonner={[
                                { navn: "Med", vis: (k) => <input type="checkbox" aria-label="Med i arkivet" disabled={!afsluttet(k.status)} checked={afsluttet(k.status) && !fravalgt.has(k.id)}
                                    onChange={(e) => setFravalgt((f) => { const n = new Set(f); if (e.target.checked) n.delete(k.id); else n.add(k.id); return n; })} /> },
                                { navn: "Scenarie", vis: (k) => navn(k.scenarie_id) },
                                { navn: "Bestilt", vis: (k) => tidspunkt(k.bestilt) },
                                { navn: "Status", vis: (k) => <StatusMaerke status={k.status} /> },
                            ]} />
                        <div className="fs-raekke">
                            <Knap onClick={eksportér} disabled={status.arbejder || !bruger}>{status.arbejder ? "Eksporterer …" : "Eksportér til Excel (.xlsx)"}</Knap>
                        </div>
                        <Statuslinje status={status} />
                    </div>
                )}
            </DataTilstand>
        </Kort>
    );
}

function Statuslinje({ status }: { status: { arbejder: boolean; tekst?: string; fejl?: string } }) {
    if (status.fejl) return <Fejl titel="Eksporten stoppede">{status.fejl}</Fejl>;
    return status.tekst ? <p className="fs-tekst" role="status">{status.tekst}</p> : null;
}

// ------------------------------------------------------------------ import

interface Tilstand {
    trin: "vælg" | "læser" | "vis" | "skriver" | "færdig" | "fejl";
    planer?: Plan[];
    fejl?: string;
    fremdrift?: string;
    resultat?: string;
}

function Importér({ bruger }: { bruger: string | undefined }) {
    const [t, setT] = useState<Tilstand>({ trin: "vælg" });
    const poster = (t.planer ?? []).flatMap((p) => p.poster.map((x) => ({ ...x, fil: p.filnavn })));
    const tæl = (u: Udfaldstype) => poster.filter((p) => p.udfald === u).length;
    const skrives = poster.filter((p) => p.udfald === "opret" || p.udfald === "genoptag");

    const vælgFil = async (fil: File | undefined) => {
        if (!fil) return;
        setT({ trin: "læser", fremdrift: `Læser ${fil.name} …` });
        try {
            const { læsArkivfil, planlæg } = await import("@/lib/arkiv/genimport");
            const filer = læsArkivfil(new Uint8Array(await fil.arrayBuffer()), fil.name);
            const planer: Plan[] = [];
            for (const f of filer) {
                setT({ trin: "læser", fremdrift: `Sammenligner ${f.filnavn} med databasen her …` });
                planer.push(await planlæg(f));
            }
            setT({ trin: "vis", planer });
        } catch (e) {
            setT({ trin: "fejl", fejl: tekstFejl(e) });
        }
    };

    const importér = async () => {
        if (!t.planer) return;
        setT({ ...t, trin: "skriver", fremdrift: "Starter …" });
        try {
            const { importér } = await import("@/lib/arkiv/genimport");
            let oprettet = 0, fandtes = 0;
            for (const p of t.planer) {
                const r = await importér(p, bruger, (gjort, ialt, tekst) => setT((x) => ({ ...x, fremdrift: `${p.filnavn}: ${gjort.toLocaleString("da-DK")} af ${ialt.toLocaleString("da-DK")} rækker — ${tekst}` })));
                oprettet += r.oprettet;
                fandtes += r.fandtes;
            }
            opdaterAlt();
            setT({ trin: "færdig", planer: t.planer, resultat: `Importeret: ${oprettet.toLocaleString("da-DK")} rækker skrevet${fandtes ? `, ${fandtes.toLocaleString("da-DK")} fandtes allerede` : ""}. Kørslerne er markeret "importeret fra arkiv".` });
        } catch (e) {
            setT({ ...t, trin: "fejl", fejl: `${tekstFejl(e)} Intet i den del er gemt. Det, der allerede er importeret, springes over, når du importerer igen.` });
        }
    };

    const budskab = t.planer
        ? `${skrives.filter((p) => p.slags === "scenarie").length} scenarier og ${skrives.filter((p) => p.slags === "koersel").length} kørsler importeres; ${tæl("findes")} findes allerede, ${tæl("konflikt")} i konflikt, ${tæl("afvist")} kan ikke importeres.`
        : "Vælg en .xlsx eller .zip fra Eksportér arkiv. Du ser, hvad der sker, før noget skrives.";

    return (
        <Kort titel="Importér arkiv" afgraensning={t.planer ? t.planer.map((p) => p.filnavn).join(", ") : undefined} budskab={budskab}
            fod="En kørsel importeres som historisk kørsel med sit frosne input, sine pins og resultater uændret — den køres ikke om. Samme id og samme indhold springes over; samme id og andet indhold er en konflikt og overskrives aldrig. Værket (og en tidsserie, kørslen bygger på) skal findes her med de samme parametre: upload værksarket først. Et arkiv, hvor et tal er rettet, afvises.">
            <div className="fs-blok">
                <div className="fs-raekke">
                    <label className="fjv-knap" data-variant={t.planer ? "sekundaer" : undefined}>
                        {t.planer ? "Vælg en anden fil" : "Vælg arkiv (.xlsx eller .zip)"}
                        <input type="file" accept=".xlsx,.zip" hidden disabled={t.trin === "skriver" || t.trin === "læser"} onChange={(e) => { void vælgFil(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    {t.planer && t.trin !== "færdig" && !skrives.length && <span className="fs-tekst">Intet at importere.</span>}
                    {t.planer && t.trin !== "færdig" && skrives.length > 0 && (
                        <Knap onClick={importér} disabled={t.trin === "skriver" || !skrives.length || !bruger}>
                            {t.trin === "skriver" ? "Importerer …" : `Importér ${skrives.length} ${skrives.length === 1 ? "post" : "poster"}`}
                        </Knap>
                    )}
                </div>
                {(t.trin === "læser" || t.trin === "skriver") && <p className="fs-tekst" role="status">{t.fremdrift}</p>}
                {t.trin === "fejl" && <Fejl titel="Arkivet kan ikke importeres">{t.fejl}</Fejl>}
                {t.trin === "færdig" && <p className="fs-tekst" role="status"><Maerke tone="ok">Færdig</Maerke> {t.resultat}</p>}
                {t.planer && (
                    <Tabel<Planpost & { fil: string }> rækker={poster} nøgle={(p) => `${p.fil}|${p.slags}|${p.id}`}
                        kolonner={[
                            { navn: "Hvad", vis: (p) => (p.slags === "scenarie" ? "Scenarie" : "Kørsel") },
                            { navn: "Navn", vis: (p) => p.navn },
                            { navn: "Værk", vis: (p) => p.vaerk },
                            { navn: "Udfald", vis: (p) => <Maerke tone={UDFALD[p.udfald].tone}>{UDFALD[p.udfald].tekst}</Maerke> },
                            { navn: "Rækker", tal: true, vis: (p) => (p.rækker ? p.rækker.toLocaleString("da-DK") : "–") },
                            { navn: "Hvorfor", vis: (p) => <span className="fs-lille">{p.grund ?? ""}</span> },
                        ]} />
                )}
            </div>
        </Kort>
    );
}
