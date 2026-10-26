//-----------------------------------------------------------------------
// Område a) Dokumentation — modelrepoets vejledninger (bundtet ved den pinnede commit) og appens egne.
//
//   #/dokumentation                    indeks over alle dokumenter
//   #/dokumentation/<id>               læsevisning med indholdsfortegnelse
//   #/dokumentation/<id>#<anker>       samme, rullet til en overskrift
//
// Hash-routing bruger sit eget `#`, så ankeret står efter ruteleddets `#` (se delAnker).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, Gitter, Kort, Maerke, Side } from "@/components/layout";
import type { Hentet } from "@/lib/data/hooks";
import { rutehref } from "@/lib/rute";
import type { OmraadeProps } from "../typer";
import { Arkitekturdiagram } from "../information/Arkitekturdiagram";
import { DOKUMENTER, GRUPPER, dokument, erLaesbar, type Dok } from "./dokumenter";
import { KILDELINJE, MODELREPO, githubUrl } from "./kilde";
import { delAnker, useMarkdown, useRulTilAnker } from "./hjaelp";
import { Indholdsliste, LinkKnap } from "./komponenter";
import { MarkdownBlokke } from "./markdown/Markdown";
import { kontekstFor, linkOmskriver } from "./markdown/links";
import { laesetid, overskrifter, type Blok } from "./markdown/parse";
import { OmOgKredit } from "./OmOgKredit";
import "./dokumentation.css";

const dokHref = (id: string, anker?: string) => rutehref("dokumentation", anker ? `${id}#${anker}` : id);

export default function Dokumentation({ sti }: OmraadeProps) {
    const [id, anker] = delAnker(sti[0]);
    if (!id) return <Indeks />;
    if (id === "om") return <OmOgKredit />;
    const dok = dokument(id);
    if (!dok) return <UkendtDokument id={id} />;
    return erLaesbar(dok) ? <Laesevisning dok={dok} anker={anker} /> : <Eksternt dok={dok} />;
}

//-- indeks ---------------------------------------------------------------

function DokPost({ d }: { d: Dok }) {
    const eksternt = !erLaesbar(d);
    return (
        <li className="fjv-dok-post">
            <a className="fjv-dok-titel" href={dokHref(d.id)}>{d.titel}</a>
            {eksternt && <> <Maerke>{d.format === "pdf" ? "PDF på GitHub" : "Excel · download"}</Maerke></>}
            {d.valgfri && <> <Maerke>valgfri</Maerke></>}
            <span className="fjv-dok-hvad">{d.beskrivelse}</span>
        </li>
    );
}

function GruppeKort({ gruppe, udeladt }: { gruppe: string; udeladt?: string[] }) {
    const dok = DOKUMENTER.filter((d) => d.gruppe === gruppe && !udeladt?.includes(d.id));
    const laes = dok.filter(erLaesbar).length;
    const nu = dok.length === 1 ? "dokument" : "dokumenter";
    const budskab = laes === dok.length
        ? `${dok.length} ${nu}, ${dok.length === 1 ? "det kan" : "alle kan"} læses her`
        : `${dok.length} ${nu} — ${laes} kan læses her, ${dok.length - laes} åbnes på GitHub`;
    return (
        <Kort titel={gruppe} budskab={budskab}>
            <ul className="fjv-dok-liste">{dok.map((d) => <DokPost key={d.id} d={d} />)}</ul>
        </Kort>
    );
}

function Indeks() {
    const laes = DOKUMENTER.filter(erLaesbar).length;
    const grupper = GRUPPER.filter((g) => DOKUMENTER.some((d) => d.gruppe === g));
    const licens = dokument("licens")!;
    return (
        <Side omraade="Dokumentation" titel="Vejledninger og dokumentation"
            budskab={`${DOKUMENTER.length} dokumenter i ${grupper.length} grupper: ${laes} kan læses her i appen, resten åbnes på GitHub — alle ved modelversion ${MODELREPO.kort}.`}>
            <Gitter form="4-4-4">
                <GruppeKort gruppe="Kom i gang" />
                <GruppeKort gruppe="Appen" />
                <GruppeKort gruppe="Modellen" />
            </Gitter>
            <Gitter form="4-4-4">
                <GruppeKort gruppe="Brug" />
                <GruppeKort gruppe="Balancemarked" />
                <GruppeKort gruppe="Værket" />
            </Gitter>
            <Gitter form="6-6">
                <GruppeKort gruppe="Baggrund" udeladt={["licens"]} />
                <Kort titel="Om og kredit" budskab={`Appen er en brugerflade til modellen. Dokumenterne er hentet ved én bestemt udgivelse, ${MODELREPO.kort}, og er ${MODELREPO.licens}-licenseret.`}
                    fod="Ikke med: arkiverede rapporter, udviklernes interne notater og udkast, der ikke hører til udgivelsen.">
                    <div className="fjv-brod">
                        <p>Dokumenterne er offentlige og kommer fra <a className="fjv-lnk" href={MODELREPO.url} target="_blank" rel="noopener noreferrer">{MODELREPO.navn}</a>,
                            commit <span className="fjv-mono">{MODELREPO.kort}</span>. Licensteksten følger med uændret: <a className="fjv-lnk" href={dokHref(licens.id)}>{licens.titel}</a>. <a className="fjv-lnk" href={dokHref("om")}>Om og kredit</a> har den fulde kreditering, licenstekster og pinnede versioner.</p>
                        <p>Hvor README har nyere tal end rapporten, har README forrang. De værker og tal, du selv opretter i appen, er <strong>ikke</strong> offentlige
                            og skrives aldrig tilbage til det åbne repo.</p>
                    </div>
                </Kort>
            </Gitter>
        </Side>
    );
}

//-- læsevisning ----------------------------------------------------------

function kildeFod(d: Dok) {
    if (d.kilde === "modelrepo") {
        return (
            <>
                {KILDELINJE} · <a className="fjv-lnk" href={githubUrl(d.sti)} target="_blank" rel="noopener noreferrer">Åbn på GitHub</a>
                {d.note && <> · {d.note}</>}
            </>
        );
    }
    if (d.kilde === "viden") return <>Skrevet til appen af fagsiden; kilderne står i teksten.{d.note && <> {d.note}</>}</>;
    return <>Skrevet til appen; kilderne står i teksten.</>;
}

function Laesevisning({ dok, anker }: { dok: Dok; anker: string | undefined }) {
    const md = useMarkdown(dok.fil);
    const link = useMemo(() => linkOmskriver(kontekstFor(dok)), [dok]);
    useRulTilAnker(anker, dok.id, md.data !== undefined);

    const alle = md.data ? overskrifter(md.data.blokke) : [];
    const toc = alle.filter((o) => o.niveau >= 2 && o.niveau <= 3);
    const stat = md.data ? { ...laesetid(md.data.tekst), afsnit: alle.filter((o) => o.niveau === 2).length } : undefined;
    const budskab = stat
        ? `${stat.ord.toLocaleString("da-DK")} ord · ca. ${stat.minutter} min. læsning${stat.afsnit > 0 ? ` · ${stat.afsnit} afsnit` : ""}`
        : undefined;

    const knapper = (
        <>
            <LinkKnap href={rutehref("dokumentation")}>← Alle dokumenter</LinkKnap>
            {dok.kilde === "modelrepo" && <LinkKnap href={githubUrl(dok.sti)} ekstern>Åbn på GitHub</LinkKnap>}
        </>
    );
    const tekst = (
        <Kort titel={dok.titel} afgraensning={dok.gruppe} budskab={budskab} fod={kildeFod(dok)}>
            {dok.rettelse && (
                <p className="fjv-dok-rettelse" role="note"><strong>Rettelse i forhold til kilden:</strong> {dok.rettelse}</p>
            )}
            <DataTilstand h={md as Hentet<{ blokke: Blok[] }>} højde={320}>
                {(d) => <MarkdownBlokke blokke={d.blokke} link={link} />}
            </DataTilstand>
        </Kort>
    );

    return (
        <Side omraade="Dokumentation" titel={dok.titel} budskab={dok.beskrivelse} handlinger={knapper}>
            {dok.diagram && (
                <Kort titel="Overblik" afgraensning="arkitektur" budskab="Appen læser og bestiller; Functions og notebooken skriver; modellen regner kun i notebooken.">
                    <Arkitekturdiagram />
                </Kort>
            )}
            {toc.length > 0 ? (
                <Gitter form="3-9">
                    <Kort titel="Indhold" budskab={`${toc.length} afsnit`}>
                        <Indholdsliste etiket="Indhold" grupper={[{ punkter: toc.map((o) => ({
                            id: o.id, tekst: o.tekst, href: dokHref(dok.id, o.id), niveau: o.niveau === 2 ? 1 : 2,
                        })) }]} />
                    </Kort>
                    {tekst}
                </Gitter>
            ) : (
                <Gitter form="12">{tekst}</Gitter>
            )}
        </Side>
    );
}

//-- PDF, regneark og ukendt id -------------------------------------------

function Eksternt({ dok }: { dok: Dok }) {
    const pdf = dok.format === "pdf";
    const href = githubUrl(dok.sti, pdf ? "blob" : "raw");
    return (
        <Side omraade="Dokumentation" titel={dok.titel} budskab={dok.beskrivelse}
            handlinger={<LinkKnap href={rutehref("dokumentation")}>← Alle dokumenter</LinkKnap>}>
            <Gitter form="12">
                <Kort titel={dok.titel} afgraensning={dok.gruppe}
                    budskab={pdf ? "Filen bundtes ikke i appen — den åbnes på GitHub ved modelversionen." : "Regnearket hentes direkte fra GitHub ved modelversionen."}
                    fod={<>{KILDELINJE}{dok.note && <> · {dok.note}</>}</>}>
                    <div className="fjv-brod">
                        <p>{dok.beskrivelse}</p>
                        <p><LinkKnap href={href} ekstern sekundaer={false}>{pdf ? "Åbn PDF på GitHub" : "Hent regnearket"}</LinkKnap></p>
                    </div>
                </Kort>
            </Gitter>
        </Side>
    );
}

function UkendtDokument({ id }: { id: string }) {
    return (
        <Side omraade="Dokumentation" titel="Dokumentet findes ikke" budskab={`Der er intet dokument med navnet «${id}».`}
            handlinger={<LinkKnap href={rutehref("dokumentation")}>← Alle dokumenter</LinkKnap>}>
            <Gitter form="12">
                <Kort titel="Prøv et af disse" budskab="Dokumentindekset har ændret sig, eller linket er forkert.">
                    <ul className="fjv-dok-liste">
                        {DOKUMENTER.map((d) => <li key={d.id}><a className="fjv-lnk" href={dokHref(d.id)}>{d.titel}</a></li>)}
                    </ul>
                </Kort>
            </Gitter>
        </Side>
    );
}
