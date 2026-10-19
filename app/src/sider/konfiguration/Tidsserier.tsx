//-----------------------------------------------------------------------
// #/konfiguration/<kode>/tidsserier[/ny | /<id>] — værkets EGNE tidsserier
// (målt varmelast, målt solvarme), KONTRAKT §6d. Markeds- og vejrdata
// (spot, aFRR, mFRR, ubalance, DMI) kommer fra df-data og uploades ikke.
//
//   tidsserier        liste + "hvad bruger værket nu?"
//   tidsserier/ny     upload af en CSV: træk-og-slip, forhåndsvisning,
//                     forhåndstjek og analyse af filen, før den sendes
//   tidsserier/<id>   én serie: metadata, backendens validering,
//                     aktivering og analysen
//-----------------------------------------------------------------------

import { useMemo, useState, type DragEvent } from "react";
import { DataTilstand, Gitter, Knap, Kort, Maerke, Tabel } from "@/components/layout";
import { tidspunkt } from "@/lib/format";
import { opdaterAlt } from "@/lib/data/opdatering";
import { rutehref } from "@/lib/rute";
import type { FjvSchema } from "../../../rayfin/data/schema";
import { MAKS } from "../../../rayfin/data/fjv.constants";
import { læsTabel, tidTekst, valider } from "./tidsserie-validering";
import { DATAKRAV } from "./datakrav.data";
import { fraPunkter } from "./serie";
import {
    aktiverTidsserie, uploadTidsserie, useTidsserieVaerdier, useTidsserier, type Enhed, type Rolle, type TidsserieRække,
} from "./tidsserie-kilde";
import { dkTid, KILDE_NAVN, listeBudskab, læsValidering, ROLLE_NAVN, STATUS_NAVN } from "./tidsserie-budskaber";
import { TidsserieAnalyse } from "./TidsserieAnalyse";
import { afkod, brugerNu, MAKS_UPLOAD_BYTES, SOLPROFIL_MARKØR, værkstræ } from "./tidsserie-logik";
import { dkFri } from "./vis";

type Vaerk = FjvSchema["Vaerk"];
type Blad = FjvSchema["VaerkParameter"];

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : NaN);

export function TidsserieFane({ vaerk, blade, valg, gåTil, bruger }: {
    vaerk: Vaerk; blade: readonly Blad[]; valg: string | undefined; gåTil: (s: string) => void; bruger: string | undefined;
}) {
    const rækker = useTidsserier(vaerk.id);
    const kort = useMemo(() => new Map(blade.map((b) => [b.sti, b.vaerdi_json])), [blade]);
    if (valg === "ny") return <Upload vaerk={vaerk} blade={kort} gåTil={gåTil} bruger={bruger} eksisterende={rækker.data ?? []} />;
    if (valg) {
        return (
            <DataTilstand h={rækker} højde={240}>
                {(alle) => {
                    const r = alle.find((x) => x.id === valg);
                    return r ? <Detalje key={r.id} vaerk={vaerk} r={r} blade={kort} bruger={bruger} alle={alle} genindlæs={rækker.genindlæs} />
                        : <Gitter><Kort titel="Tidsserien findes ikke" budskab={`Værket har ingen tidsserie med id ${valg}.`}><a href={rutehref("konfiguration", vaerk.kode, "tidsserier")}>Til værkets tidsserier</a></Kort></Gitter>;
                }}
            </DataTilstand>
        );
    }
    return (
        <>
            <Gitter form="8-4">
                <Kort titel="Tidsserier" afgraensning="værkets egne data" budskab={rækker.data ? listeBudskab(rækker.data) : undefined}
                    handling={<a className="fjv-knap" href={rutehref("konfiguration", vaerk.kode, "tidsserier", "ny")}>Upload CSV</a>}
                    fod="En upload gemmes uforanderligt (samme indhold = samme fil). Klik på en række for analysen og for at aktivere den.">
                    <DataTilstand h={rækker}>
                        {(liste) => (
                            <Tabel<TidsserieRække> rækker={liste} nøgle={(r) => r.id} onVælg={(r) => gåTil(`konfiguration/${vaerk.kode}/tidsserier/${r.id}`)}
                                tom="Ingen tidsserier endnu. Upload en målt varmelast eller solprofil som CSV."
                                kolonner={[
                                    { navn: "Rolle", vis: (r) => ROLLE_NAVN[r.rolle] ?? r.rolle },
                                    { navn: "Navn", vis: (r) => <>{r.navn}{r.aktiv && r.status === "gyldig" && <> <Maerke tone="ok">aktiv</Maerke></>}</> },
                                    { navn: "Kilde", vis: (r) => <Maerke>{KILDE_NAVN[r.kilde] ?? r.kilde}</Maerke> },
                                    { navn: "Periode", vis: (r) => (r.start && r.slut ? `${dkTid(ms(r.start), false)} – ${dkTid(ms(r.slut), false)}` : "–") },
                                    { navn: "Opl.", vis: (r) => r.oploesning ?? "–" },
                                    { navn: "Huller", vis: (r) => (r.antal_huller ?? null) === null ? "–" : dkFri(r.antal_huller!), tal: true },
                                    { navn: "Status", vis: (r) => <Maerke tone={r.status === "gyldig" ? "ok" : r.status === "afvist" ? "fejl" : "advarsel"}>{STATUS_NAVN[r.status] ?? r.status}</Maerke> },
                                    { navn: "Uploadet", vis: (r) => tidspunkt(r.uploadet) },
                                ]} />
                        )}
                    </DataTilstand>
                </Kort>
                <BrugerNu blade={kort} rækker={rækker.data} />
            </Gitter>
        </>
    );
}

function BrugerNu({ blade, rækker }: { blade: ReadonlyMap<string, string>; rækker: readonly TidsserieRække[] | undefined }) {
    const b = brugerNu(blade, rækker ?? []);
    const område = (() => { try { return JSON.parse(blade.get("data.dmi_area") ?? "null") as string | null; } catch { return null; } })();
    const zone = (() => { try { return JSON.parse(blade.get("data.price_zone") ?? "null") as string | null; } catch { return null; } })();
    const varmeTekst = b.varme.length === 1 ? `målt varmelast "${b.varme[0].navn}"` : b.varme.length > 1 ? `${b.varme.length} aktive varmelaster — det må højst være én` : "varmelastmodellen (syntetisk)";
    return (
        <Kort titel="Hvad bruger værket nu?" afgraensning="uden scenarie" budskab={`Kørsler bruger ${varmeTekst}.`}
            fod="Et scenarie kan vælge en anden af værkets tidsserier eller varmelastmodellen. Kørslens side viser altid det fulde datagrundlag.">
            <div className="kf-noegletal">
                <div><strong>{b.varme.length === 1 ? b.varme[0].navn : "Syntetisk"}</strong><span>varmelast{b.varme.length === 1 ? "" : " — værkets parametre + DMI"}</span></div>
                {b.profiler.length === 0 && <div><strong>Ingen</strong><span>solprofil (ingen enhed har en profil)</span></div>}
                {b.profiler.map((p) => (
                    <div key={p.enhed}>
                        <strong>{p.sti === SOLPROFIL_MARKØR ? (b.sol.length === 1 ? b.sol[0].navn : "Mangler") : p.sti.replace(/^data\//, "")}</strong>
                        <span>solprofil for {p.enhed}{p.sti === SOLPROFIL_MARKØR ? (b.sol.length === 1 ? " (værkets tidsserie)" : " — værkets tidsserie, men ingen er aktiv; kørsler afvises") : " (fil i modelrepoet)"}</span>
                    </div>
                ))}
                <div><strong>{område ?? "–"} · {zone ?? "–"}</strong><span>DMI-område · priszone (df-data)</span></div>
            </div>
            <p className="kf-kilde">Spotpris, aFRR, mFRR, ubalance og DMI-temperatur kommer fra df-data og uploades ikke.</p>
        </Kort>
    );
}

// ------------------------------------------------------------------ én serie

function Detalje({ vaerk, r, blade, bruger, alle, genindlæs }: {
    vaerk: Vaerk; r: TidsserieRække; blade: ReadonlyMap<string, string>; bruger: string | undefined; alle: readonly TidsserieRække[]; genindlæs: () => void;
}) {
    const værdier = useTidsserieVaerdier(r.status === "gyldig" ? r.id : undefined);
    const v = læsValidering(r.validering_json);
    const [sender, setSender] = useState(false);
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string }>();
    const andenAktiv = alle.find((x) => x.id !== r.id && x.rolle === r.rolle && x.aktiv && x.status === "gyldig");
    const skift = async (aktiv: boolean) => {
        setSender(true); setSvar(undefined);
        try {
            const s = await aktiverTidsserie(vaerk.id, r.id, aktiv, bruger);
            setSvar({ ok: s.ok, tekst: s.svar });
            if (s.ok) { genindlæs(); opdaterAlt(); }
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { setSender(false); }
    };
    const rolleNavn = ROLLE_NAVN[r.rolle].toLowerCase();
    return (
        <>
            <Gitter form="8-4">
                <Kort titel={r.navn} afgraensning={`${ROLLE_NAVN[r.rolle]} · ${KILDE_NAVN[r.kilde]}`}
                    budskab={r.status === "gyldig"
                        ? `${r.aktiv ? "Aktiv" : "Ikke aktiv"} ${rolleNavn}: ${dkFri(r.antal_raekker ?? 0)} ${r.oploesning === "15min" ? "kvarterer" : "timer"} fra ${r.start ? dkTid(ms(r.start), false) : "–"} til ${r.slut ? dkTid(ms(r.slut), false) : "–"}${r.antal_huller ? `, ${dkFri(r.antal_huller)} huller` : ", ingen huller"}.`
                        : r.status === "afvist" ? "Filen blev afvist og kan ikke bruges i en kørsel — se grunden til højre." : "Filen valideres."}
                    handling={<a className="fjv-knap" data-variant="sekundaer" href={rutehref("konfiguration", vaerk.kode, "tidsserier")}>Alle tidsserier</a>}>
                    <div className="kf-noegletal">
                        <div><strong>{r.filnavn}</strong><span>oprindelig fil</span></div>
                        <div><strong>{r.tidsstempel === "slut" ? "Timens slut" : "Timens start"} · {r.tidszone === "UTC" ? "UTC" : r.tidszone === "Europe/Copenhagen" ? "dansk tid" : r.tidszone}</strong><span>tidsstempler i kilden (gemt som UTC, timens start)</span></div>
                        <div><strong>{r.enhed ?? "MW"} · {r.oploesning ?? "–"}</strong><span>enhed · opløsning</span></div>
                        <div><strong>{r.uploadet_af}</strong><span>{tidspunkt(r.uploadet)}</span></div>
                    </div>
                    {r.sha256 && <p className="kf-kilde">sha256 <span className="kf-hash">{r.sha256}</span>{r.sti ? <> · <span className="kf-hash">{r.sti}</span></> : null}</p>}
                </Kort>
                <Kort titel="Validering og brug" afgraensning="backendens kontrol"
                    budskab={v ? (v.fejl.length ? `${v.fejl.length} ${v.fejl.length === 1 ? "fejl" : "fejl"}: ${v.fejl[0]}` : v.advarsler.length ? `Gyldig med ${v.advarsler.length} ${v.advarsler.length === 1 ? "advarsel" : "advarsler"}.` : "Gyldig uden advarsler.") : STATUS_NAVN[r.status]}
                    fod={r.status === "afvist" ? "En afvist fil gemmes ikke og kan ikke aktiveres. Ret filen, og upload den igen — forhåndstjekket viser fejlen, før du sender." : r.rolle === "varmelast" ? "Den aktive varmelast bruges af kørsler, hvis scenariet ikke vælger andet. Deaktivér for at gå tilbage til varmelastmodellen." : "Den aktive solprofil bruges for værkets solenhed, når værket peger på sin solprofil-tidsserie."}>
                    {v && (v.fejl.length + v.advarsler.length > 0) && (
                        <ul className="kf-fund">
                            {v.fejl.map((f) => <li key={`f${f}`}><Maerke tone="fejl">fejl</Maerke><span>{f}</span></li>)}
                            {v.advarsler.map((f) => <li key={`a${f}`}><Maerke tone="advarsel">advarsel</Maerke><span>{f}</span></li>)}
                        </ul>
                    )}
                    {v && v.tal.length > 0 && (
                        <div className="kf-noegletal">{v.tal.map(([k, x]) => <div key={k}><strong>{x}</strong><span>{k}</span></div>)}</div>
                    )}
                    {r.status === "gyldig" && (
                        <div className="kf-handlinger">
                            {r.aktiv
                                ? <Knap sekundaer onClick={() => skift(false)} disabled={sender || !bruger}>{sender ? "Gemmer…" : r.rolle === "varmelast" ? "Deaktivér (brug varmelastmodellen)" : "Deaktivér"}</Knap>
                                : <Knap onClick={() => skift(true)} disabled={sender || !bruger}>{sender ? "Gemmer…" : `Gør til værkets ${rolleNavn}`}</Knap>}
                            {!r.aktiv && andenAktiv && <span className="kf-kilde">Erstatter "{andenAktiv.navn}".</span>}
                        </div>
                    )}
                    {svar && <p className="kf-svar" data-tone={svar.ok ? "ok" : "fejl"} role="status">{svar.tekst}</p>}
                </Kort>
            </Gitter>
            {r.status === "gyldig" && (
                <DataTilstand h={værdier} højde={300}>
                    {(serie) => <TidsserieAnalyse key={r.id} serie={serie} rolle={r.rolle} navn={r.navn} blade={blade} />}
                </DataTilstand>
            )}
        </>
    );
}

// ------------------------------------------------------------------ upload

interface Fil { navn: string; tekst: string; data: Uint8Array; bytes: number; tegnsæt: string }
type Tz = "UTC" | "Europe/Copenhagen";
const ENHEDER = Object.entries(DATAKRAV.enheder) as [string, { visning: string }][];
const NIVEAU_TONE = { fejl: "fejl", advarsel: "advarsel", info: "neutral" } as const;

function Upload({ vaerk, blade, gåTil, bruger, eksisterende }: {
    vaerk: Vaerk; blade: ReadonlyMap<string, string>; gåTil: (s: string) => void; bruger: string | undefined; eksisterende: readonly TidsserieRække[];
}) {
    const [fil, setFil] = useState<Fil>();
    const [filFejl, setFilFejl] = useState<string>();
    const [over, setOver] = useState(false);
    const [rolle, setRolle] = useState<Rolle>("varmelast");
    const [navn, setNavn] = useState("");
    // data_krav: tidszone, tidsstempel og enhed vælges AKTIVT — ingen forvalgt værdi.
    const [stempel, setStempel] = useState<"start" | "slut" | "">("");
    const [tidszone, setTidszone] = useState<Tz | "">("");
    const [enhed, setEnhed] = useState<Enhed | "">("");
    const [kolonne, setKolonne] = useState<string | null>(null);
    const [sender, setSender] = useState(false);
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string; id?: string }>();

    const træ = useMemo(() => værkstræ(blade), [blade]);
    const tabel = useMemo(() => (fil ? læsTabel(fil.tekst) : null), [fil]);
    const mangler = [!tidszone && "tidszone", !stempel && "tidsstempel", !enhed && "enhed"].filter((x): x is string => !!x);
    // Uden valg regnes foreløbigt med UTC / timens start / MW, så filen kan ses — men den kan ikke sendes.
    // Filens bytes, ikke den afkodede tekst: præcis det, backend får (inkl. fundet kodning_cp1252).
    const r = useMemo(() => (fil ? valider(fil.data, rolle, {
        tidszone: tidszone || "UTC", tidsstempel: stempel || "start", enhed: enhed || "MW", kolonne, vaerk: træ,
    }) : null), [fil, rolle, tidszone, stempel, enhed, kolonne, træ]);
    const fund = r?.validering.fund ?? [];
    const fejl = fund.filter((f) => f.niveau === "fejl");
    // Et spænd, som huller har pustet op, lægges ikke ud (K5-F2) — forklaringen vises i stedet for analysen.
    const [serie, serieFejl] = useMemo((): [ReturnType<typeof fraPunkter>, string | null] => {
        if (r?.status !== "gyldig") return [null, null];
        try { return [fraPunkter(r.punkter), null]; } catch (e) { return [null, e instanceof Error ? e.message : String(e)]; }
    }, [r]);
    const navnFejl = navn.trim().length > MAKS.navn ? `Højst ${MAKS.navn} tegn.` : null;
    const kan = !!fil && r?.status === "gyldig" && mangler.length === 0 && !!navn.trim() && !navnFejl && !!bruger && !sender;
    const v = r?.validering;
    const tidKol = v?.tidskolonne as string | undefined, værdiKol = v?.vaerdikolonne as string | undefined;

    const vælg = async (f: File | undefined) => {
        setSvar(undefined); setFilFejl(undefined); setKolonne(null);
        if (!f) return;
        if (f.size > MAKS_UPLOAD_BYTES) { setFilFejl(`Filen er ${dkFri(f.size / 1_000_000, 1)} MB; højst ${dkFri(MAKS_UPLOAD_BYTES / 1_000_000, 1)} MB kan sendes.`); return; }
        if (/\.xlsx?$/i.test(f.name)) { setFilFejl("Det er et regneark. Gem det som CSV — eller upload et udfyldt værksark under Konfiguration → Værker."); return; }
        const buf = await f.arrayBuffer();
        const { tekst, tegnsæt } = afkod(buf);
        setFil({ navn: f.name, tekst, data: new Uint8Array(buf), bytes: f.size, tegnsæt });
        if (!navn.trim()) setNavn(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, MAKS.navn));
    };
    const slip = (e: DragEvent) => { e.preventDefault(); setOver(false); void vælg(e.dataTransfer.files?.[0]); };

    const send = async () => {
        if (!fil || !r || !tidszone || !stempel || !enhed) return;
        setSender(true); setSvar(undefined);
        try {
            const s = await uploadTidsserie({
                vaerkId: vaerk.id, rolle, navn: navn.trim(), filnavn: fil.navn, bytes: fil.data,
                tidsstempel: stempel, tidszone, enhed, kolonne,
            }, bruger);
            setSvar({ ok: s.ok && s.status === "gyldig", tekst: s.svar, id: s.tidsserie_id });
            if (s.ok) opdaterAlt();
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { setSender(false); }
    };

    const forhånd = tabel?.rækker.slice(0, 8) ?? [];
    const samme = r?.status === "gyldig"
        ? eksisterende.find((x) => x.rolle === rolle && x.status === "gyldig" && x.start && tidTekst(ms(x.start)) === v?.start && x.antal_raekker === v?.antal_raekker)
        : undefined;
    const budskab = !fil ? "Træk en CSV-fil hertil, eller vælg den. Intet sendes, før du trykker Upload."
        : r?.status !== "gyldig" ? `Filen kan ikke bruges: ${fejl[0]?.besked ?? "ingen serie."}`
            : `${dkFri(Number(v?.kilde_raekker))} rækker (${v?.kilde_oploesning === "15min" ? "kvarterværdier, midlet til timer" : "timeværdier"}) fra ${String(v?.start).slice(0, 16).replace("T", " ")} UTC${mangler.length ? ` — foreløbig: vælg ${mangler.join(", ")}` : ""}.`;

    return (
        <>
            <Gitter form="8-4">
                <Kort titel="Upload en tidsserie" afgraensning="CSV" budskab={budskab}
                    handling={<a className="fjv-knap" data-variant="sekundaer" href={rutehref("konfiguration", vaerk.kode, "tidsserier")}>Annullér</a>}
                    fod={<>Én kolonne med tidsstempler (fx <span className="fjv-mono">timestamp</span>, <span className="fjv-mono">tidspunkt</span>) og én med værdier pr. time eller kvarter. Komma, semikolon eller tabulator; dansk decimalkomma forstås; linjer med # springes over. Højst {dkFri(MAKS_UPLOAD_BYTES / 1_000_000, 1)} MB.</>}>
                    <label className="kf-slip" data-over={over ? "true" : undefined}
                        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={slip}>
                        <span>{fil ? <><strong>{fil.navn}</strong> · {dkFri(fil.bytes / 1024, 0)} kB · {fil.tegnsæt}</> : "Slip filen her"}</span>
                        <span className="fjv-knap" data-variant="sekundaer">{fil ? "Vælg en anden fil" : "Vælg fil"}</span>
                        <input className="kf-skjult" type="file" accept=".csv,.txt,text/csv" aria-label="Vælg CSV-fil" onChange={(e) => void vælg(e.target.files?.[0])} />
                    </label>
                    {filFejl && <p className="kf-svar" data-tone="fejl" role="alert">{filFejl}</p>}
                    {tabel && forhånd.length > 0 && (
                        <div className="kf-tabelramme">
                            <table aria-label="De første rækker i filen">
                                <thead><tr><th>linje</th>{tabel.kolonner.map((k, i) => <th key={i}>{k}{k === tidKol ? " · tid" : k === værdiKol ? " · værdi" : ""}</th>)}</tr></thead>
                                <tbody>
                                    {forhånd.map(([nr, række]) => (
                                        <tr key={nr}><td>{nr}</td>{tabel.kolonner.map((k, i) => <td key={i} data-tal={k === værdiKol ? "true" : undefined}>{række[i] ?? ""}</td>)}</tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {r?.normaliseret && (
                        <p className="kf-kilde">Gemmes som (UTC, timens start, MW): <span className="fjv-mono">{r.normaliseret.split("\n").slice(1, 4).join(" · ")} …</span></p>
                    )}
                </Kort>
                <Kort titel="Indstillinger og forhåndstjek" afgraensning="samme regler som appen"
                    budskab={!fil ? "Vælg en fil." : mangler.length ? `Vælg ${mangler.join(", ")} — det gættes ikke.` : fejl.length ? `${fejl.length} ${fejl.length === 1 ? "fejl" : "fejl"} skal rettes i filen eller valgene.` : `Klar til upload${fund.some((f) => f.niveau === "advarsel") ? " med advarsler" : ""}.`}
                    fod="Forhåndstjekket er fv-data's regler (data_krav.json), kørt i browseren. Appen validerer filen igen ved upload, og den validering står på tidsserien bagefter.">
                    <div className="kf-formular">
                        <label>Hvad er det?
                            <select className="fjv-felt" value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)}>
                                <option value="varmelast">Varmelast — målt produktion ab værk</option>
                                <option value="solprofil">Solprofil — målt solvarme</option>
                            </select>
                        </label>
                        <label>Navn
                            <input className="fjv-felt" value={navn} maxLength={MAKS.navn} onChange={(e) => setNavn(e.target.value)} aria-invalid={navnFejl ? true : undefined} />
                            {navnFejl && <span className="kf-felt-fejl">{navnFejl}</span>}
                        </label>
                        <label>Tidszone i filen <small>{tidKol === "hour_dk" ? "kolonnen hedder hour_dk" : "UTC eller dansk tid?"}</small>
                            <select className="fjv-felt" value={tidszone} onChange={(e) => setTidszone(e.target.value as Tz)} aria-invalid={fil && !tidszone ? true : undefined}>
                                <option value="" disabled>Vælg …</option>
                                <option value="UTC">UTC (som modellen)</option>
                                <option value="Europe/Copenhagen">Dansk lokaltid (sommer-/vintertid)</option>
                            </select>
                        </label>
                        <label>Tidsstemplet angiver
                            <select className="fjv-felt" value={stempel} onChange={(e) => setStempel(e.target.value as "start" | "slut")} aria-invalid={fil && !stempel ? true : undefined}>
                                <option value="" disabled>Vælg …</option>
                                <option value="start">timens start (01:00 = kl. 01–02)</option>
                                <option value="slut">timens slut (01:00 = kl. 00–01)</option>
                            </select>
                        </label>
                        <label>Enhed
                            <select className="fjv-felt" value={enhed} onChange={(e) => setEnhed(e.target.value as Enhed)} aria-invalid={fil && !enhed ? true : undefined}>
                                <option value="" disabled>Vælg …</option>
                                {ENHEDER.map(([k, e]) => <option key={k} value={k}>{e.visning}</option>)}
                            </select>
                        </label>
                        {tabel && tabel.kolonner.length > 2 && (
                            <label>Værdikolonne
                                <select className="fjv-felt" value={kolonne ?? værdiKol ?? ""} onChange={(e) => setKolonne(e.target.value)}>
                                    {tabel.kolonner.filter((k) => k !== tidKol).map((k) => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </label>
                        )}
                    </div>
                    {fund.length > 0 && (
                        <ul className="kf-fund">
                            {fund.map((f) => <li key={f.kode}><Maerke tone={NIVEAU_TONE[f.niveau]}>{f.niveau}</Maerke><span>{f.besked}</span></li>)}
                        </ul>
                    )}
                    {samme && <p className="kf-kilde">Værket har allerede en gyldig {ROLLE_NAVN[rolle].toLowerCase()} med samme start og antal timer: "{samme.navn}".</p>}
                    <div className="kf-handlinger">
                        <Knap onClick={send} disabled={!kan}>{sender ? "Sender…" : "Upload"}</Knap>
                        {!bruger && <span className="kf-kilde">Kræver en indlogget bruger.</span>}
                    </div>
                    {svar && (
                        <p className="kf-svar" data-tone={svar.ok ? "ok" : "fejl"} role="status">
                            {svar.tekst}{svar.id && <> <a href={rutehref("konfiguration", vaerk.kode, "tidsserier", svar.id)} onClick={(e) => { e.preventDefault(); gåTil(`konfiguration/${vaerk.kode}/tidsserier/${svar.id}`); }}>Se tidsserien</a></>}
                        </p>
                    )}
                </Kort>
            </Gitter>
            {serieFejl && <Gitter><Kort titel="Analyse af filen" afgraensning="før upload" budskab={serieFejl} /></Gitter>}
            {serie && <TidsserieAnalyse key={`${fil?.navn}|${tidszone}|${stempel}|${enhed}|${kolonne}|${rolle}`} serie={serie} rolle={rolle} navn={navn.trim() || "Filen"} blade={blade} kompakt />}
        </>
    );
}
