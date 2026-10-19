//-----------------------------------------------------------------------
// Om og kredit (#/dokumentation/om): fuld kreditering af den oprindelige case, licenstekster, pinnede commits — og
// en klar sætning om, at appen er en brugerflade TIL modellen. Teksterne fra modelrepoet og df-data er bundtet ORDRET
// (indhold/kreditter og indhold/repo), aldrig omskrevet.
//-----------------------------------------------------------------------

import { useMemo, type ReactNode } from "react";
import { Gitter, Kort, Side } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import { LinkKnap } from "./komponenter";
import { MarkdownBlokke } from "./markdown/Markdown";
import { linkOmskriver } from "./markdown/links";
import { parsMarkdown } from "./markdown/parse";
import { DATAREPO, MODELREPO, githubUrl } from "./kilde";
import { BRUGERFLADE_TIL_MODELLEN, FORFATTERENS, FORFATTER_URL, IKKE_DISTRIBUERET, INGEN_GODKENDELSE, commitHref, dataNote, licensLinje } from "./kredit";
import { useTekst } from "./tekster";
import "./dokumentation.css";

const link = linkOmskriver({ rute: "dokumentation/om", mappe: "" });

function Md({ kilde }: { kilde: string | undefined }) {
    const blokke = useMemo(() => (kilde ? parsMarkdown(kilde) : []), [kilde]);
    return kilde ? <MarkdownBlokke blokke={blokke} link={link} /> : <div className="fjv-skelet" style={{ height: 60 }} aria-busy="true" />;
}

function Licenstekst({ titel, tekst }: { titel: string; tekst: string | undefined }) {
    return (
        <details className="fjv-licens">
            <summary>{titel}</summary>
            {tekst ? <pre className="fjv-md-pre" tabIndex={0}>{tekst}</pre> : <div className="fjv-skelet" style={{ height: 80 }} aria-busy="true" />}
        </details>
    );
}

function Raekke({ hvad, children }: { hvad: string; children: ReactNode }) {
    return <tr><th scope="row">{hvad}</th><td>{children}</td></tr>;
}

export function OmOgKredit() {
    const modelLicens = useTekst("repo/licens.txt").tekst;
    const modelIndledning = useTekst("kreditter/model_README_indledning.md").tekst;
    const dataLicens = useTekst("kreditter/df-data_LICENSE.txt").tekst;
    const dataLicensAfsnit = useTekst("kreditter/df-data_README_licens.md").tekst;
    const dataIndledning = useTekst("kreditter/df-data_README_indledning.md").tekst;
    const readme = useTekst("repo/readme.md").tekst;

    const copyright = /^Copyright \(c\)/;
    const modelCopyright = licensLinje(modelLicens, copyright);
    const dataCopyright = licensLinje(dataLicens, copyright);
    const dataKilde = readme?.match(/Kilden er\s+api\.sysapp\.dk[^.]*\./)?.[0].replace(/\s+/g, " "); // "Kilden er api.sysapp.dk, og Energi Data Service bruges til kontrol."

    return (
        <Side omraade="Dokumentation" titel="Om og kredit"
            budskab={`Appen er en brugerflade til den åbne driftsmodel fjernvarme-businesscase — modellen, metoden, valideringen og referencetallene er forfatterens. Pinnet ved model ${MODELREPO.kort} og data ${DATAREPO.kort}.`}
            handlinger={<LinkKnap href={rutehref("dokumentation")}>← Alle dokumenter</LinkKnap>}>
            <Gitter form="8-4">
                <Kort titel="Hvad appen er — og ikke er" afgraensning="en brugerflade til modellen"
                    budskab="Brugerfladen er appens; modellen, dataene og metoden er andres, og de krediteres her."
                    fod="Dokumenterne under Dokumentation og teksterne under Information er skrevet til appen med afsæt i modellens README, dokumentation og rapport v4, og de henviser til dem; hvor modellens egne dokumenter vises, står kilde og licens under dem.">
                    <div className="fjv-md fjv-brod">
                        <p><strong>{BRUGERFLADE_TIL_MODELLEN}</strong></p>
                        <p>{FORFATTERENS}</p>
                        <p>{IKKE_DISTRIBUERET}</p>
                        <p>{INGEN_GODKENDELSE}</p>
                    </div>
                </Kort>
                <Kort titel="Pinnede versioner" budskab="Hvilken udgave af modellen og af dataene appen afhænger af."
                    fod="Datarepoet opdateres om mandagen; den pinnede version skiftes bevidst, og hver kørsel gemmer den version, den faktisk brugte (se Information → Data og datadækning).">
                    <div className="fjv-tabelrul">
                        <table className="fjv-tabel fjv-md-tabel" data-layout="tabel">
                            <tbody>
                                <Raekke hvad="Model">
                                    <a className="fjv-lnk" href={MODELREPO.url} target="_blank" rel="noopener noreferrer">{MODELREPO.navn}</a><br />
                                    commit <a className="fjv-lnk fjv-mono" href={commitHref(MODELREPO.url, MODELREPO.commit)} target="_blank" rel="noopener noreferrer">{MODELREPO.commit}</a><br />
                                    licens {MODELREPO.licens}
                                </Raekke>
                                <Raekke hvad="Data">
                                    <a className="fjv-lnk" href={DATAREPO.url} target="_blank" rel="noopener noreferrer">{DATAREPO.navn}</a><br />
                                    commit <a className="fjv-lnk fjv-mono" href={commitHref(DATAREPO.url, DATAREPO.commit)} target="_blank" rel="noopener noreferrer">{DATAREPO.commit}</a><br />
                                    licens: scripts MIT; dataene CC BY 4.0 (se nedenfor)
                                </Raekke>
                            </tbody>
                        </table>
                    </div>
                </Kort>
            </Gitter>
            <Gitter form="6-6">
                <Kort titel="Kredit — modellen" afgraensning={MODELREPO.navn}
                    budskab="Modellen er udviklet sammen med Billund Fjernvarme og Dansk Fjernvarme og frigivet under MIT."
                    fod={<>Citat fra modelrepoets README ved commit {MODELREPO.kort}. <a className="fjv-lnk" href={githubUrl("README.md")} target="_blank" rel="noopener noreferrer">Åbn README</a> · <a className="fjv-lnk" href={githubUrl("doc/rapport_billund_v4.pdf")} target="_blank" rel="noopener noreferrer">Rapport v4 (PDF)</a></>}>
                    <Md kilde={modelIndledning} />
                    <div className="fjv-md fjv-brod">
                        <p>Original case: <a className="fjv-lnk" href={MODELREPO.url} target="_blank" rel="noopener noreferrer">{MODELREPO.navn}</a> — af <a className="fjv-lnk" href={FORFATTER_URL} target="_blank" rel="noopener noreferrer">skj-1964</a>.</p>
                        {modelCopyright && <p>Ophavsret ifølge licensen: <span className="fjv-mono">{modelCopyright}</span></p>}
                        <p>Metoden, antagelserne, valideringen mod Billunds afregning og referencetallene (Spor A, Spor B, Andeby) stammer fra modellen og rapport v4. Appen viser dem og regner med modellen; den har ikke fundet på dem.</p>
                    </div>
                </Kort>
                <Kort titel="Kredit — data" afgraensning={DATAREPO.navn}
                    budskab="Markeds- og vejrdata kommer fra datarepoet df-data — og dets oprindelige kilder er Energinet og DMI."
                    fod={<>Citat fra df-datas README og LICENSE ved commit {DATAREPO.kort}. <a className="fjv-lnk" href={DATAREPO.url} target="_blank" rel="noopener noreferrer">Åbn df-data</a></>}>
                    <Md kilde={dataIndledning} />
                    {dataKilde && <div className="fjv-md fjv-brod"><p>Modelrepoet skriver om kilden: <q>{dataKilde}</q></p></div>}
                    <Md kilde={dataLicensAfsnit} />
                    {dataNote(dataLicens) && <div className="fjv-md fjv-brod"><p lang="en"><q>{dataNote(dataLicens)}</q></p></div>}
                    {dataCopyright && <div className="fjv-md fjv-brod"><p>Ophavsret ifølge licensen: <span className="fjv-mono">{dataCopyright}</span></p></div>}
                </Kort>
            </Gitter>
            <Gitter form="6-6">
                <Kort titel="Licenstekst — modellen" afgraensning="MIT"
                    budskab="Licensteksten følger med alle dokumenter, der er hentet fra modelrepoet, uændret."
                    fod="Samme tekst som Dokumentation → Licens (MIT).">
                    <Licenstekst titel="Vis hele licensteksten" tekst={modelLicens} />
                </Kort>
                <Kort titel="Licenstekst — df-data" afgraensning="MIT + note om CC BY 4.0"
                    budskab="df-data redistribuerer Energinets og DMI's offentlige data uændret på samme vilkår."
                    fod="Gengivet ordret fra datarepoets LICENSE.">
                    <Licenstekst titel="Vis hele licensteksten" tekst={dataLicens} />
                </Kort>
            </Gitter>
        </Side>
    );
}
