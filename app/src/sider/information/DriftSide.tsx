//-----------------------------------------------------------------------
// To emner om driftsforholdene: datadækning (hvilke data og versioner kørslerne bruger) og
// "hvor regnes der" (arkitektur, prøvekapacitet, kø).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, Gitter, Kort, Maerke } from "@/components/layout";
import { useKoersler } from "@/lib/data/hooks";
import { tidspunkt } from "@/lib/format";
import { DATAREPO_URL, MODELREPO } from "../dokumentation/kilde";
import { EmneRamme } from "./EmneRamme";
import { EmneTekstKort } from "./EmneSide";
import { useEmneTekst } from "./emneTekst";
import { Arkitekturdiagram } from "./Arkitekturdiagram";
import { KAPACITET, dageTilUdloeb, koeoversigt, kortSha, udloebsTekst, versioner } from "./drift";
import type { Emne } from "./emner";
import { flertal } from "./tal";

interface Props { emne: Emne; emner: readonly Emne[]; anker: string | undefined }

export function DatadaekningSide({ emne, emner, anker }: Props) {
    const tekst = useEmneTekst(emne, anker);
    const koersler = useKoersler();
    const v = useMemo(() => (koersler.data ? versioner(koersler.data) : undefined), [koersler.data]);
    const seneste = v?.[0];
    const budskab = v
        ? v.length === 0
            ? "Ingen kørsel har endnu gemt, hvilken version af data den brugte."
            : `${flertal(v.reduce((n, x) => n + x.antal, 0), "kørsel", "kørsler")} er regnet på ${flertal(v.length, "version", "versioner")} af koden og data; den seneste bruger df-data ${kortSha(seneste?.data)}.`
        : tekst.budskab;

    return (
        <EmneRamme emne={emne} emner={emner} budskab={budskab}>
            <Gitter form="6-6">
                <EmneTekstKort emne={emne} emner={emner} tekst={tekst} />
                <Kort titel="Versioner i kørslerne" afgraensning="kode og data"
                    budskab={v ? (v.length > 1 ? `Kørslerne er ikke regnet på samme version — sammenlign kun kørsler med ens versioner.` : "Alle kørsler bruger samme version af kode og data.") : undefined}
                    fod={<>df-data opdateres hver mandag; notebooken bruger en bestemt version, som skiftes bevidst. Hver kørsel gemmer de fulde versionsnumre. Kilder: <a className="fjv-lnk" href={DATAREPO_URL} target="_blank" rel="noopener noreferrer">df-data</a> · <a className="fjv-lnk" href={MODELREPO.url} target="_blank" rel="noopener noreferrer">modelrepoet</a>.</>}>
                    <DataTilstand h={koersler} højde={160}>
                        {() => v && v.length > 0 ? (
                            <div className="fjv-tabelrul">
                                <table className="fjv-tabel" data-layout="tabel">
                                    <thead><tr><th>df-data</th><th>Modelkode</th><th className="fjv-h">Kørsler</th><th>Seneste</th></tr></thead>
                                    <tbody>
                                        {v.map((x) => (
                                            <tr key={`${x.model}|${x.data}`}>
                                                <td className="fjv-mono">{kortSha(x.data)}</td><td className="fjv-mono">{kortSha(x.model)}</td>
                                                <td className="fjv-h">{x.antal}</td><td>{tidspunkt(x.seneste)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="fjv-tilstand">Ingen kørsel har gemt versioner endnu.</p>}
                    </DataTilstand>
                </Kort>
            </Gitter>
        </EmneRamme>
    );
}

export function FabricSide({ emne, emner, anker }: Props) {
    const tekst = useEmneTekst(emne, anker);
    const koersler = useKoersler();
    const nu = useMemo(() => new Date(), []);
    const dage = dageTilUdloeb(nu);
    const q = useMemo(() => (koersler.data ? koeoversigt(koersler.data) : undefined), [koersler.data]);
    const færdige = koersler.data?.filter((k) => k.status === "faerdig").length;

    return (
        <EmneRamme emne={emne} emner={emner} budskab={udloebsTekst(nu)}>
            <Gitter form="12">
                <Kort titel="Hvor regnes der" afgraensning="arkitektur"
                    budskab={færdige !== undefined ? `${flertal(færdige, "færdig kørsel", "færdige kørsler")} — alle regnet i notebooken; browseren har kun bestilt og læst.` : "Modellen regner i notebooken, aldrig i browseren."}>
                    <Arkitekturdiagram />
                </Kort>
            </Gitter>
            <Gitter form="6-6">
                <EmneTekstKort emne={emne} emner={emner} tekst={tekst} />
                <div className="fjv-emne-hoved">
                    <Kort titel="Prøvekapaciteten" afgraensning={KAPACITET.navn}
                        budskab={dage >= 0 ? `Udløber om ${dage} dage — omkring 7. december 2026.` : `Udløb for ${-dage} dage siden — omkring 7. december 2026.`}
                        fod="Startet 8. oktober 2026. Udløbsdatoen er cirka: den skal bekræftes af Fabric-administratoren. Hvad der sker med appen, databasen og de gemte kørsler ved udløb, er endnu ikke afklaret.">
                        <p className="fjv-brod">
                            {dage > 14 ? <Maerke tone="ok">{dage} dage tilbage</Maerke> : dage >= 0 ? <Maerke tone="advarsel">{dage} dage tilbage</Maerke> : <Maerke tone="fejl">udløbet</Maerke>}
                            {" "}Uden en betalt kapacitet kan der ikke regnes nye kørsler.
                        </p>
                    </Kort>
                    <Kort titel="Køen lige nu" afgraensning="én solver ad gangen"
                        budskab={q ? (q.regner === 0 && q.venter === 0 ? "Intet regner, og ingen venter." : `${flertal(q.regner, "kørsel regner", "kørsler regner")}, ${q.venter} venter i kø.`) : undefined}
                        fod="Tallet er øjebliksbilledet, da siden blev åbnet — tryk Opdatér for at hente det igen.">
                        <DataTilstand h={koersler} højde={60}>
                            {() => <p className="fjv-brod">Hver bruger kan højst have 3 ventende bestillinger; en periode må højst være 366 døgn, og tidsgrænsen højst 3.600 sekunder.</p>}
                        </DataTilstand>
                    </Kort>
                </div>
            </Gitter>
        </EmneRamme>
    );
}
