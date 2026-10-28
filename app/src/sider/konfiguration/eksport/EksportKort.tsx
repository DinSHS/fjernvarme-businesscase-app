//-----------------------------------------------------------------------
// #/konfiguration/<kode>/eksport — værket som udfyldt værksark (runde 12).
// Arket bygges i browseren (begge udgaver, intet Fabric-job), og listen
// "ikke med i arket" vises, FØR arket hentes: felter, skabelonen ikke kan
// bære, eller som modelscriptet sætter selv. Aldrig tavst tab.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { useHent } from "@/lib/data/hooks";
import { Gitter, Knap, Kort, Maerke } from "@/components/layout";
import { dkFri, visFelt } from "../vis";
import type { Eksport } from "./eksporter";
import type { Tab } from "./kort";
import { gruppe, tabEtiket } from "./visning";
import type { Vaerkhoved } from "./hent";

/** Eksporten — lazy-loadet, så xlsx-koden (fflate) og skabelonen kun hentes af den, der eksporterer. */
async function lavEksport(v: Vaerkhoved): Promise<Eksport> {
    const [{ eksporter }, { hentEksportkilde, hentSkabelon }] = await Promise.all([import("./eksporter"), import("./hent")]);
    return eksporter(await hentEksportkilde(v), await hentSkabelon());
}

export function EksportKort({ vaerk }: { vaerk: Vaerkhoved }) {
    // Samme nøgle = samme værk og revision; en ny revision eller "Opdatér" bygger arket igen.
    const h = useHent(`eksport:${vaerk.id}:${vaerk.revision}`, () => lavEksport(vaerk));
    const e = h.data;
    const fejl = h.fejl?.message;

    const grupper = useMemo(() => {
        const m = new Map<string, Tab[]>();
        for (const t of e?.plan.ikkeMed ?? []) m.set(gruppe(t.sti), [...(m.get(gruppe(t.sti)) ?? []), t]);
        return [...m.entries()];
    }, [e]);

    const hent = () => {
        if (!e) return;
        const url = URL.createObjectURL(new Blob([e.bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const a = document.createElement("a");
        a.href = url; a.download = e.filnavn;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };

    if (fejl) {
        return (
            <Gitter>
                <Kort titel="Eksportér værksark" afgraensning={`${vaerk.kode} · revision ${vaerk.revision}`}
                    budskab="Værket kan ikke eksporteres til værksarket."
                    fod="Skabelonen er modelrepoets vaerksdata_skabelon.xlsx ved den pinnede commit; arket skal kunne læses af scripts/vaerksark_til_yaml.py uændret.">
                    <p className="kf-svar" data-tone="fejl" role="alert">{fejl}</p>
                </Kort>
            </Gitter>
        );
    }
    const p = e?.plan;
    const n = p?.ikkeMed.length ?? 0;
    const serier = p?.serier ?? [];
    return (
        <Gitter>
            <Kort titel="Eksportér værksark" afgraensning={`${vaerk.kode} · revision ${vaerk.revision}`}
                budskab={!p ? "Arket bygges …" : n === 0
                    ? "Hele værket kan stå i værksarket; modelscriptet læser det tilbage uden tab."
                    : `${n} ${n === 1 ? "felt er" : "felter er"} ikke med i arket, eller får modelscriptets egen værdi — se listen, før du henter arket.`}
                handling={e && <Knap onClick={hent}>Hent {e.filnavn}</Knap>}
                fod={<>Arket er modelrepoets <span className="fjv-mono">vaerksdata_skabelon.xlsx</span> (ved den pinnede commit) udfyldt med værket; vejledning, dropdowns og formatering er skabelonens. Ret det i Excel, og upload det under <em>Konfiguration › Upload værksark</em>: appen genkender arket og gemmer dine ændringer som revision {vaerk.revision + 1} af {vaerk.navn}. Felterne på listen beholder deres værdi ved genupload; uploades arket som et nyt værk, får de modelscriptets værdi.</>}>
                {p && (
                    <ul className="kf-fund" aria-label="Indhold i arket">
                        <li><Maerke tone="ok">med</Maerke><span>Anlæg, tanke, varmepumpernes målepunkter, priser, eltarif, DMI-område og priszone.</span></li>
                        {serier.map((s) => (
                            <li key={s.rolle}>
                                <Maerke tone={s.med ? (s.udenfor ? "advarsel" : "ok") : "advarsel"}>{s.med ? "med" : "ikke med"}</Maerke>
                                <span>{s.rolle === "varmelast" ? "Målt varmelast (Timedata)" : "Målt solvarme (arket Solvarme)"}: {dkFri(s.med, 0)} timer{s.udenfor ? `; ${dkFri(s.udenfor, 0)} timer er ikke med` : ""}{s.grund ? ` — ${s.grund}` : ""}.</span>
                            </li>
                        ))}
                        {!serier.some((s) => s.rolle === "varmelast") && <li><Maerke>syntese</Maerke><span>Ingen aktiv målt varmelast: Timedata er tom, og årsproduktionen (B3) er sat, så modelscriptet skalerer samme varmelastparametre som værket har, hvis de er Andebys × en faktor.</span></li>}
                        {p.noter.map((x) => <li key={x}><Maerke tone="advarsel">bemærk</Maerke><span>{x}</span></li>)}
                        {p.udfyldes.length > 0 && (
                            <li>
                                <Maerke tone="advarsel">udfyldes</Maerke>
                                <details>
                                    <summary>{dkFri(p.udfyldes.length, 0)} {p.udfyldes.length === 1 ? "time" : "timer"} i solprofilen, som modelscriptet selv udfylder ved upload som nyt værk</summary>
                                    <table aria-label="Timer, modelscriptet udfylder">
                                        <thead><tr><th>Time (UTC, start)</th><th>MW, som scriptet skriver</th><th>Hvordan</th></tr></thead>
                                        <tbody>
                                            {p.udfyldes.map((u) => (
                                                <tr key={u.ms}>
                                                    <td>{new Date(u.ms).toISOString().slice(0, 16).replace("T", " ")}</td>
                                                    <td data-tal="true">{u.v.toFixed(6).replace(".", ",")}</td>
                                                    <td>{u.hvordan === "nat" ? "nattetime i enden: 0" : "lineært mellem nabotimerne"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </details>
                            </li>
                        )}
                    </ul>
                )}
            </Kort>
            {p && n > 0 && (
                <Kort titel="Ikke med i arket" afgraensning={`${n} felter i ${grupper.length} grupper`}
                    budskab="Værkets værdi til venstre, modelscriptets ved upload som nyt værk til højre. Ved genupload som revision røres disse felter ikke."
                    fod="Listen er regnet i browseren ud fra modelscriptets egne regler; gaten kører scriptet på eksporten af hvert værk i kataloget og kræver, at listen er præcis forskellen (viden/vaerktoej/tjek_eksport_rundtur.py).">
                    <div className="kf-ikke-med">
                        {grupper.map(([g, liste]) => (
                            <details key={g} open={grupper.length <= 6}>
                                <summary><strong>{g}</strong> · {liste.length} {liste.length === 1 ? "felt" : "felter"}{liste[0].grund ? ` — ${liste[0].grund}` : ""}</summary>
                                <table>
                                    <thead><tr><th>Felt</th><th>Værket</th><th>Modelscriptet</th></tr></thead>
                                    <tbody>
                                        {liste.map((t) => (
                                            <tr key={t.sti}>
                                                <td>{tabEtiket(t.sti)} <span className="kf-sti">{t.sti}</span></td>
                                                <td>{t.værk === null ? "–" : visFelt(t.værk)}</td>
                                                <td>{t.script === null ? "ikke med" : visFelt(t.script)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </details>
                        ))}
                    </div>
                </Kort>
            )}
        </Gitter>
    );
}
