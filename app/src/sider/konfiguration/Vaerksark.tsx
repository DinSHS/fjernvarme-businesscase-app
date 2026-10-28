//-----------------------------------------------------------------------
// Upload af et udfyldt værksark (modelrepoets vaerksdata_skabelon.xlsx, i repoets rod)
// — KONTRAKT §6d. Filen gemmes, og notebooken fjv_importer_vaerksark kører
// modelrepoets scripts/vaerksark_til_yaml.py uændret: et nyt værk (kilde
// "Appen") og, hvis arket har timedata, en tidsserie. Status vises her;
// importen kører i Fabric og tager typisk et par minutter.
//
// Runde 12: et ark, appen har eksporteret (skjult ark `_app`), genkendes.
// Findes værket, vises forskellen mod en ny eksport af værkets revision FØR
// bekræftelse, og arket gemmes som revision N+1 af samme værk. Er værket
// ændret siden eksporten, afvises arket (eksportér igen) — ingen tavs
// overskrivning. Uden markering, eller findes værket ikke: et nyt værk.
//-----------------------------------------------------------------------

import { useState } from "react";
import { DataTilstand, Knap, Kort, Maerke } from "@/components/layout";
import { tidspunkt } from "@/lib/format";
import { opdaterAlt } from "@/lib/data/opdatering";
import { rutehref } from "@/lib/rute";
import { uploadVaerksark, useVaerksarkimporter, type VaerksarkimportRække } from "./tidsserie-kilde";
import { vaerksarkBudskab } from "./tidsserie-budskaber";
import { IMPORT_STATUS, tilBase64, vaerksarkFejl } from "./tidsserie-logik";
import { dk, dkFri } from "./vis";
import type { Uploadanalyse } from "./eksport/analyse";

type Vaerkrad = { id: string; kode: string; navn: string; revision: number };

/** Analysen af arket — lazy-loadet (xlsx-læseren og eksporten hentes først, når et ark vælges). */
async function analyser(bytes: Uint8Array, vaerker: readonly Vaerkrad[]): Promise<Uploadanalyse> {
    const { analyserUpload } = await import("./eksport/analyse");
    return analyserUpload(bytes, vaerker);
}

export function VaerksarkKort({ vaerker, bruger }: { vaerker: readonly Vaerkrad[]; bruger: string | undefined }) {
    const importer = useVaerksarkimporter();
    const [fil, setFil] = useState<File>();
    const [timeslut, setTimeslut] = useState(false);
    const [sender, setSender] = useState(false);
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string }>();
    const [analyse, setAnalyse] = useState<Uploadanalyse>();
    const [analyseFejl, setAnalyseFejl] = useState<string>();
    const filFejl = fil ? vaerksarkFejl(fil) : null;
    const læser = !!fil && !filFejl && !analyse && !analyseFejl;
    const revision = analyse?.art === "revision" ? analyse : undefined;
    const blokeret = analyse?.art === "konflikt" || analyse?.art === "anden_eksport" || analyse?.art === "ingen_aendringer";
    const kan = !!fil && !filFejl && !!analyse && !blokeret && !!bruger && !sender;
    const seneste = (importer.data ?? []).slice(0, 4);
    const aktive = seneste.filter((i) => i.status === "koe" || i.status === "koerer").length;

    const vælg = async (f: File | undefined) => {
        setFil(f); setSvar(undefined); setAnalyse(undefined); setAnalyseFejl(undefined);
        if (!f || vaerksarkFejl(f)) return;
        try {
            setAnalyse(await analyser(new Uint8Array(await f.arrayBuffer()), vaerker));
        } catch (e) {
            setAnalyseFejl(e instanceof Error ? e.message : String(e));
        }
    };

    const send = async () => {
        if (!fil) return;
        setSender(true); setSvar(undefined);
        try {
            const b64 = tilBase64(new Uint8Array(await fil.arrayBuffer()));
            // En revision sammenlignes med en eksport, der er stemplet med timens START i UTC — derfor intet --timeslut.
            const s = revision
                ? await uploadVaerksark(fil.name, b64, false, bruger, { vaerkId: revision.vaerk.id, revision: revision.vaerk.revision, basisBase64: tilBase64(revision.basis) })
                : await uploadVaerksark(fil.name, b64, timeslut, bruger);
            setSvar({ ok: s.ok, tekst: s.svar });
            if (s.ok) { importer.genindlæs(); opdaterAlt(); }
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { setSender(false); }
    };

    const budskab = importer.data === undefined ? undefined
        : seneste.length === 0 ? "Har værket udfyldt værksarket, oprettes værket direkte fra det. Et ark, appen har eksporteret, gemmes som en ny revision af værket."
            : vaerksarkBudskab(seneste[0], vaerker);

    return (
        <Kort titel="Upload værksark" afgraensning="nyt værk eller ny revision" budskab={budskab}
            fod={<>Skabelonen er modelrepoets <span className="fjv-mono">vaerksdata_skabelon.xlsx</span> (i repoets rod). Importen kører modelrepoets <span className="fjv-mono">scripts/vaerksark_til_yaml.py</span> uændret og opretter et nyt værk (kilde Appen) — og en tidsserie, hvis arket har timedata. Et ark, appen har eksporteret (<em>værk › Eksportér værksark</em>), gemmes i stedet som en ny revision af værket: kun det, du har ændret i arket, ændres.</>}>
            <div className="kf-formular">
                <label className="kf-slip">
                    <span>{fil ? <><strong>{fil.name}</strong> · {dkFri(fil.size / 1024, 0)} kB</> : "Udfyldt værksark (.xlsx)"}</span>
                    <span className="fjv-knap" data-variant="sekundaer">{fil ? "Vælg et andet ark" : "Vælg værksark"}</span>
                    <input className="kf-skjult" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Vælg værksark"
                        onChange={(e) => { void vælg(e.target.files?.[0]); }} />
                </label>
                {filFejl && <span className="kf-felt-fejl">{filFejl}</span>}
                {læser && <p className="kf-kilde" role="status">Læser arket …</p>}
                {analyseFejl && <p className="kf-svar" data-tone="fejl" role="alert">Arket kunne ikke læses: {analyseFejl}</p>}
                {analyse && <Analyse a={analyse} />}
                {!revision && !blokeret && (
                    <label className="kf-kontakt"><input type="checkbox" checked={timeslut} onChange={(e) => setTimeslut(e.target.checked)} />Tidsstemplerne i arkets timedata er timens slut</label>
                )}
                <div className="kf-handlinger">
                    {!blokeret && (
                        <Knap onClick={send} disabled={!kan}>
                            {sender ? "Sender…" : revision ? `Gem som revision ${revision.vaerk.revision + 1} af ${revision.vaerk.navn}` : "Upload og importér"}
                        </Knap>
                    )}
                    {aktive > 0 && <Knap sekundaer onClick={importer.genindlæs}>Opdatér status</Knap>}
                    {!bruger && <span className="kf-kilde">Kræver en indlogget bruger.</span>}
                </div>
                {svar && <p className="kf-svar" data-tone={svar.ok ? "ok" : "fejl"} role="status">{svar.tekst}</p>}
            </div>
            <DataTilstand h={importer} højde={60}>
                {() => seneste.length === 0 ? null : (
                    <ul className="kf-fund" aria-label="Seneste importer">
                        {seneste.map((i) => <ImportLinje key={i.id} i={i} vaerker={vaerker} />)}
                    </ul>
                )}
            </DataTilstand>
        </Kort>
    );
}

/** Det, analysen fandt — før noget sendes. */
function Analyse({ a }: { a: Uploadanalyse }) {
    if (a.art === "nyt") {
        return a.grund ? <p className="kf-svar" role="status"><Maerke>nyt værk</Maerke> {a.grund}</p> : null;
    }
    const eksport = <a href={rutehref("konfiguration", a.vaerk.kode, "eksport")}>Eksportér {a.vaerk.navn} igen</a>;
    if (a.art === "konflikt") {
        return (
            <p className="kf-svar" data-tone="fejl" role="alert" data-tilstand="konflikt">
                Arket er eksporteret fra {a.vaerk.navn} revision {a.arkRevision}, men værket er siden ændret (nu revision {a.vaerk.revision}). Intet bliver gemt — en upload ville skrive hen over de nyere ændringer. {eksport}, og læg dine ændringer ind i det nye ark.
            </p>
        );
    }
    if (a.art === "anden_eksport") {
        return (
            <p className="kf-svar" data-tone="fejl" role="alert" data-tilstand="anden_eksport">
                Arket passer ikke med en ny eksport af {a.vaerk.navn} revision {a.vaerk.revision} (lavet af en anden udgave af appen, eller værkets tidsserier er skiftet siden). Intet bliver gemt. {eksport}, og læg dine ændringer ind i det nye ark.
            </p>
        );
    }
    if (a.art === "ingen_aendringer") {
        return <p className="kf-svar" data-tone="ok" role="status" data-tilstand="ingen_aendringer">Ingen ændringer: arket er det samme som {a.vaerk.navn} revision {a.vaerk.revision}. Der er intet at gemme.</p>;
    }
    const f = a.forskel;
    return (
        <div className="kf-diff" data-tilstand="revision">
            <p className="kf-svar" role="status">
                Arket er eksporteret fra <strong>{a.vaerk.navn}</strong> revision {a.vaerk.revision}. Disse ændringer gemmes som revision {a.vaerk.revision + 1} — felter, arket ikke bærer, røres ikke:
            </p>
            {f.felter.length > 0 && (
                <table aria-label="Ændringer i arket">
                    <thead><tr><th>Hvor</th><th>Felt</th><th>Før</th><th>Nu</th></tr></thead>
                    <tbody>
                        {f.felter.map((x) => (
                            <tr key={`${x.hvor}|${x.felt}`}><td>{x.hvor}</td><td>{x.felt}</td><td data-tal="true">{x.før}</td><td data-tal="true"><ins>{x.nu}</ins></td></tr>
                        ))}
                    </tbody>
                </table>
            )}
            {f.serier.map((s) => (
                <p key={s.rolle} className="kf-kilde">
                    {s.rolle === "varmelast" ? "Varmelast (Timedata)" : "Solvarme (arket Solvarme)"}: {timer(s.ændret)} ændret, {timer(s.tilføjet)} tilføjet, {timer(s.fjernet)} fjernet; sum i arket {dk(s.sumFør, 3)} → {dk(s.sumNu, 3)} GWh. Værkets {s.rolle} får en ny version med de ændrede timer.
                </p>
            ))}
        </div>
    );
}

const timer = (n: number) => `${dkFri(n, 0)} ${n === 1 ? "time" : "timer"}`;

function ImportLinje({ i, vaerker }: { i: VaerksarkimportRække; vaerker: readonly { id: string; kode: string; navn: string }[] }) {
    const s = IMPORT_STATUS[i.status] ?? { tekst: i.status, tone: "neutral" as const };
    const v = vaerker.find((x) => x.id === i.vaerk_id);
    return (
        <li>
            <Maerke tone={s.tone}>{s.tekst}</Maerke>
            <span>
                {i.filnavn} · {tidspunkt(i.uploadet)}
                {v && <> · <a href={rutehref("konfiguration", v.kode)}>{v.navn}</a>{i.tidsserie_id && <> · <a href={rutehref("konfiguration", v.kode, "tidsserier", i.tidsserie_id)}>tidsserien</a></>}</>}
                {i.log && <details><summary>Log</summary><pre className="kf-pre">{i.log}</pre></details>}
            </span>
        </li>
    );
}
