//-----------------------------------------------------------------------
// Upload af et udfyldt værksark (modelrepoets doc/vaerksdata_skabelon.xlsx)
// — KONTRAKT §6d. Filen gemmes, og notebooken fjv_importer_vaerksark kører
// modelrepoets scripts/vaerksark_til_yaml.py uændret: et nyt værk (kilde
// "Appen") og, hvis arket har timedata, en tidsserie. Status vises her;
// importen kører i Fabric og tager typisk et par minutter.
//-----------------------------------------------------------------------

import { useState } from "react";
import { DataTilstand, Knap, Kort, Maerke } from "@/components/layout";
import { tidspunkt } from "@/lib/format";
import { opdaterAlt } from "@/lib/data/opdatering";
import { rutehref } from "@/lib/rute";
import { uploadVaerksark, useVaerksarkimporter, type VaerksarkimportRække } from "./tidsserie-kilde";
import { vaerksarkBudskab } from "./tidsserie-budskaber";
import { IMPORT_STATUS, tilBase64, vaerksarkFejl } from "./tidsserie-logik";
import { dkFri } from "./vis";

export function VaerksarkKort({ vaerker, bruger }: { vaerker: readonly { id: string; kode: string; navn: string }[]; bruger: string | undefined }) {
    const importer = useVaerksarkimporter();
    const [fil, setFil] = useState<File>();
    const [timeslut, setTimeslut] = useState(false);
    const [sender, setSender] = useState(false);
    const [svar, setSvar] = useState<{ ok: boolean; tekst: string }>();
    const filFejl = fil ? vaerksarkFejl(fil) : null;
    const kan = !!fil && !filFejl && !!bruger && !sender;
    const seneste = (importer.data ?? []).slice(0, 4);
    const aktive = seneste.filter((i) => i.status === "koe" || i.status === "koerer").length;

    const send = async () => {
        if (!fil) return;
        setSender(true); setSvar(undefined);
        try {
            const s = await uploadVaerksark(fil.name, tilBase64(await fil.arrayBuffer()), timeslut, bruger);
            setSvar({ ok: s.ok, tekst: s.svar });
            if (s.ok) { importer.genindlæs(); opdaterAlt(); }
        } catch (e) {
            setSvar({ ok: false, tekst: e instanceof Error ? e.message : String(e) });
        } finally { setSender(false); }
    };

    const budskab = importer.data === undefined ? undefined
        : seneste.length === 0 ? "Har værket udfyldt værksarket, oprettes værket direkte fra det."
            : vaerksarkBudskab(seneste[0], vaerker);

    return (
        <Kort titel="Upload værksark" afgraensning="nyt værk fra regneark" budskab={budskab}
            fod={<>Skabelonen er modelrepoets <span className="fjv-mono">doc/vaerksdata_skabelon.xlsx</span>. Importen kører modelrepoets <span className="fjv-mono">scripts/vaerksark_til_yaml.py</span> uændret og opretter et nyt værk (kilde Appen) — og en tidsserie, hvis arket har timedata.</>}>
            <div className="kf-formular">
                <label className="kf-slip">
                    <span>{fil ? <><strong>{fil.name}</strong> · {dkFri(fil.size / 1024, 0)} kB</> : "Udfyldt værksark (.xlsx)"}</span>
                    <span className="fjv-knap" data-variant="sekundaer">{fil ? "Vælg et andet ark" : "Vælg værksark"}</span>
                    <input className="kf-skjult" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Vælg værksark"
                        onChange={(e) => { setFil(e.target.files?.[0]); setSvar(undefined); }} />
                </label>
                {filFejl && <span className="kf-felt-fejl">{filFejl}</span>}
                <label className="kf-kontakt"><input type="checkbox" checked={timeslut} onChange={(e) => setTimeslut(e.target.checked)} />Tidsstemplerne i arkets timedata er timens slut</label>
                <div className="kf-handlinger">
                    <Knap onClick={send} disabled={!kan}>{sender ? "Sender…" : "Upload og importér"}</Knap>
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
