//-----------------------------------------------------------------------
// #/konfiguration — alle værker, og de tre veje til et nyt værk: guiden
// "Nyt værk fra bunden", "Kopiér værk" og "Upload værksark" (KONTRAKT §6d).
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { DataTilstand, Gitter, Knap, Kort, Maerke, Side, StatusMaerke, Tabel } from "@/components/layout";
import { useKoersler, useObjekttal, useVaerker } from "@/lib/data/hooks";
import { kopierVaerk } from "@/lib/data/skriv";
import { opdaterAlt } from "@/lib/data/opdatering";
import { tidspunkt } from "@/lib/format";
import { MAKS } from "../../../rayfin/data/fjv.constants";
import type { OmraadeProps } from "../typer";
import { NAVN_MOENSTER } from "./redigering";
import { RESERVEREDE_KODER } from "./nyt-vaerk";
import { rutehref } from "@/lib/rute";
import { senesteKoersel } from "./oversigt-logik";
import { VaerksarkKort } from "./Vaerksark";
import { NYT_VAERK_SKABELON } from "./nyt-vaerk.data";

export default function Oversigt({ gåTil, bruger }: OmraadeProps) {
    const [medArkiverede, setMedArkiverede] = useState(false);
    const vaerker = useVaerker(medArkiverede);
    const koersler = useKoersler();
    // Fundamentets optælling (ét pagineret kald for alle værker; et objekt uden enabled-blad tæller som slået til).
    const objekter = useObjekttal();

    const tal = useMemo(() => objekter.data ?? new Map<string, { enheder: number; enhederTil: number; lagre: number }>(), [objekter.data]);
    const seneste = useMemo(() => senesteKoersel(koersler.data ?? []), [koersler.data]);

    const liste = vaerker.data ?? [];
    const fraRepo = liste.filter((v) => v.kilde === "repo").length;
    const sidst = [...liste].sort((a, b) => +new Date(b.aendret) - +new Date(a.aendret))[0];
    const budskab = vaerker.data
        ? liste.length === 0
            ? "Der er ingen værker endnu — de importeres af notebooken fjv_importer_vaerker."
            : `${liste.length} ${liste.length === 1 ? "værk" : "værker"}: ${fraRepo} importeret fra modelrepoet, ${liste.length - fraRepo} oprettet i appen. Senest ændret: ${sidst.navn} (${tidspunkt(sidst.aendret)}).`
        : undefined;

    return (
        <Side omraade="Konfiguration" titel="Værker" budskab={budskab}
            handlinger={<a className="fjv-knap" href={rutehref("konfiguration", "nyt")}>Nyt værk fra bunden</a>}>
            <Gitter>
                <Kort titel="Værker" afgraensning={medArkiverede ? "inkl. arkiverede" : "aktive"}
                    budskab={vaerker.data && objekter.data ? budskabForTabel(liste.map((v) => tal.get(v.id))) : undefined}
                    handling={<label className="kf-kontakt"><input type="checkbox" checked={medArkiverede} onChange={(e) => setMedArkiverede(e.target.checked)} />Vis arkiverede</label>}
                    fod="Klik på et værk for at se og redigere det. Enheder = slået til / i alt.">
                    <DataTilstand h={vaerker}>
                        {(rækker) => (
                            <Tabel rækker={rækker} nøgle={(v) => v.kode} onVælg={(v) => gåTil(`konfiguration/${v.kode}`)}
                                tom="Ingen værker endnu — de importeres af notebooken fjv_importer_vaerker."
                                kolonner={[
                                    { navn: "Kode", vis: (v) => <span className="fjv-mono">{v.kode}</span> },
                                    { navn: "Navn", vis: (v) => <>{v.navn}{v.arkiveret && <> <Maerke>arkiveret</Maerke></>}</> },
                                    { navn: "Kilde", vis: (v) => <Maerke>{v.kilde === "repo" ? "Modelrepo" : "Appen"}</Maerke> },
                                    { navn: "Rev.", vis: (v) => v.revision, tal: true },
                                    { navn: "Enheder", vis: (v) => { const t = tal.get(v.id); return t ? `${t.enhederTil}/${t.enheder}` : "–"; }, tal: true },
                                    { navn: "Lagre", vis: (v) => tal.get(v.id)?.lagre ?? "–", tal: true },
                                    { navn: "Seneste kørsel", vis: (v) => { const k = seneste.get(v.id); return k ? <>{tidspunkt(k.bestilt)} <StatusMaerke status={k.status} /></> : "Ingen"; } },
                                    // Runde 12: arket hentes fra værkets eksportfane (listen "ikke med i arket" vises først).
                                    { navn: "Værksark", vis: (v) => <a className="fjv-knap" data-variant="sekundaer" href={rutehref("konfiguration", v.kode, "eksport")}
                                        onClick={(e) => e.stopPropagation()} aria-label={`Eksportér værksark (.xlsx) for ${v.navn}`}>Eksportér (.xlsx)</a> },
                                ]} />
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
            <Gitter form="4-4-4">
                <NytVaerkKort />
                <KopierKort vaerker={liste} bruger={bruger} gåTil={gåTil} />
                <VaerksarkKort vaerker={liste} bruger={bruger} />
            </Gitter>
        </Side>
    );
}

function budskabForTabel(t: ({ enheder: number; enhederTil: number; lagre: number } | undefined)[]): string {
    const e = t.reduce((s, x) => s + (x?.enheder ?? 0), 0);
    const l = t.reduce((s, x) => s + (x?.lagre ?? 0), 0);
    return `I alt ${e} enheder og ${l} lagre på tværs af værkerne.`;
}

function NytVaerkKort() {
    const blade = NYT_VAERK_SKABELON?.blade ?? [];
    const bekræft = blade.filter((b) => b.bekraeft).length;
    return (
        <Kort titel="Nyt værk fra bunden" afgraensning="guide i 7 trin"
            budskab={blade.length ? `Guiden starter fra skabelonens ${blade.length} felter (${bekræft} er skøn, der skal bekræftes) og slutter med en prøvekørsel på 2 døgn.` : "Skabelonen mangler — guiden kan ikke bruges."}
            fod="Navn, klima og priszone, varmebehov, enheder, lager, priser og tarif — og et overblik, før værket oprettes.">
            <div className="kf-handlinger"><a className="fjv-knap" href={rutehref("konfiguration", "nyt")}>Start guiden</a></div>
        </Kort>
    );
}

function KopierKort({ vaerker, bruger, gåTil }: { vaerker: { id: string; kode: string; navn: string; revision: number }[]; bruger: string | undefined; gåTil: (s: string) => void }) {
    const [fraId, setFraId] = useState("");
    const [kode, setKode] = useState("");
    const [navn, setNavn] = useState("");
    const [sender, setSender] = useState(false);
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string }>();
    const fra = vaerker.find((v) => v.id === fraId) ?? vaerker[0];
    const kodeFejl = kode && (!NAVN_MOENSTER.test(kode) ? "Kun små bogstaver, cifre og _." : kode.length > MAKS.kode ? `Højst ${MAKS.kode} tegn.` : vaerker.some((v) => v.kode === kode) ? "Koden er i brug." : RESERVEREDE_KODER.includes(kode) ? "Koden er reserveret af appen." : null);
    const kan = !!fra && !!kode && !kodeFejl && !!navn.trim() && !!bruger && !sender;

    const kopiér = async () => {
        if (!fra) return;
        setSender(true); setSvar(undefined);
        try {
            const r = await kopierVaerk(fra, kode, navn.trim(), bruger);
            if (r.ok && r.status === "udfoert") {
                setSvar({ ok: true, tekst: r.svar });
                opdaterAlt();
                gåTil(`konfiguration/${kode}`);
            } else setSvar({ ok: false, tekst: r.svar || "Kopien blev afvist." });
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { setSender(false); }
    };

    return (
        <Kort titel="Kopiér værk" afgraensning="nyt værk"
            budskab={fra ? `Et nyt værk oprettes som kopi af ${fra.navn} (revision ${fra.revision}) og starter på revision 1.` : "Der er intet værk at kopiere."}
            fod={<>Kopien får kilde 'Appen' og har ingen kildefil i modelrepoet; dens scenarier og kørsler starter forfra. Har du intet værk at kopiere fra: <a href={rutehref("konfiguration", "nyt")}>Nyt værk fra bunden</a>.</>}>
            <div className="kf-formular">
                <label>Kopiér fra
                    <select className="fjv-felt" value={fra?.id ?? ""} onChange={(e) => setFraId(e.target.value)}>
                        {vaerker.map((v) => <option key={v.id} value={v.id}>{v.navn} ({v.kode})</option>)}
                    </select>
                </label>
                <label>Ny kode <small>små bogstaver, cifre og _ — fx {fra ? `${fra.kode}_kopi` : "mit_vaerk"}</small>
                    <input className="fjv-felt" value={kode} maxLength={MAKS.kode} aria-invalid={kodeFejl ? true : undefined}
                        onChange={(e) => setKode(e.target.value.trim())} />
                    {kodeFejl && <span className="kf-felt-fejl">{kodeFejl}</span>}
                </label>
                <label>Navn
                    <input className="fjv-felt" value={navn} maxLength={MAKS.navn} onChange={(e) => setNavn(e.target.value)} />
                </label>
                <div className="kf-handlinger">
                    <Knap onClick={kopiér} disabled={!kan}>{sender ? "Kopierer…" : "Kopiér værk"}</Knap>
                    {!bruger && <span className="kf-kilde">Kræver en indlogget bruger.</span>}
                </div>
                {svar && <p className="kf-svar" data-tone={svar.ok ? "ok" : "fejl"} role="status">{svar.tekst}</p>}
            </div>
        </Kort>
    );
}
