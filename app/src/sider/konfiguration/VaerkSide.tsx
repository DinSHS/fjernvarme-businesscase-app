//-----------------------------------------------------------------------
// #/konfiguration/<kode>[/<fane>[/<valg>]] — ét værk set som et værk:
// faner pr. afsnit (enheder, lagre, priser …), revisionslog, ændringer
// siden en kørsel og kildefil. Ét fælles udkast på tværs af fanerne, så
// "Gem" altid er ÉN anmodning med alle ændrede blade.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { DataTilstand, Gitter, Kort, Maerke, Side } from "@/components/layout";
import { useScenarieAendringerForVaerk, useVaerker, useVaerkParametre } from "@/lib/data/hooks";
import { rutehref } from "@/lib/rute";
import { AFSNIT, afsnitFor, type AfsnitId } from "./katalog";
import { enhed, grupper, lager } from "./gruppering";
import { vaerkBudskab } from "./budskaber";
import { useRedigering } from "./useRedigering";
import { Enheder } from "./Enheder";
import { ElTarif, GenereltAfsnit, Lagre, Priser, Varmelast } from "./Afsnit";
import { AendringerSidenKoersel, Kildefil, Revisionslog } from "./Historik";
import { NyEnhed } from "./NyEnhed";
import { KomIGang } from "./KomIGang";
import { TidsserieFane } from "./Tidsserier";

const EKSTRA = [
    { id: "tidsserier", navn: "Tidsserier" },
    { id: "log", navn: "Revisionslog" },
    { id: "aendringer", navn: "Ændringer siden kørsel" },
    { id: "kilde", navn: "Kildefil" },
] as const;

export function VaerkSide({ kode, fane, valg, gåTil, bruger }: { kode: string; fane: string | undefined; valg: string | undefined; gåTil: (s: string) => void; bruger: string | undefined }) {
    const vaerker = useVaerker(true);
    const vaerk = vaerker.data?.find((v) => v.kode === kode);
    const parametre = useVaerkParametre(vaerk?.id);
    // Alle værkets scenariers ændringer, inkl. arkiverede scenarier (så "Fjern enhed" også ser gamle referencer).
    const scenarieAendringer = useScenarieAendringerForVaerk(vaerk?.id);
    const [visAlle, setVisAlle] = useState(false);
    const rt = useRedigering(vaerk, parametre.data, bruger);

    const g = useMemo(() => grupper(parametre.data ?? []), [parametre.data]);
    const enheder = useMemo(() => g.efterId("enheder").objekter.map(enhed), [g]);
    const lagre = useMemo(() => g.efterId("lagre").objekter.map(lager), [g]);
    const aktiv = fane ?? "enheder";

    if (vaerker.data && !vaerk) {
        return (
            <Side omraade="Konfiguration" titel="Værket findes ikke" budskab={`Der er intet værk med koden "${kode}".`}>
                <Kort titel="Værker" budskab="Gå tilbage til oversigten og vælg et værk."><a href={rutehref("konfiguration")}>Til værksoversigten</a></Kort>
            </Side>
        );
    }

    const kladderPrAfsnit = new Map<string, number>();
    for (const sti of rt.red.udkast.keys()) {
        const a = afsnitFor(sti.split(".")[0]);
        kladderPrAfsnit.set(a, (kladderPrAfsnit.get(a) ?? 0) + 1);
    }
    const faner = [
        ...AFSNIT.filter((a) => a.id !== "oevrige" || g.oevrige > 0).map((a) => ({ id: a.id as string, navn: a.navn, antal: g.efterId(a.id).antal })),
        ...EKSTRA.map((e) => ({ ...e, antal: undefined as number | undefined })),
    ];
    const grundFejl = rt.grundFund.filter((f) => f.alvor === "fejl");
    const grundAdv = rt.grundFund.filter((f) => f.alvor === "advarsel");

    return (
        <Side omraade="Konfiguration" titel={vaerk?.navn ?? kode}
            budskab={parametre.data ? vaerkBudskab(g, enheder, lagre) : undefined}
            handlinger={<>
                <a className="fjv-knap" data-variant="sekundaer" href={rutehref("konfiguration")}>Alle værker</a>
                <label className="kf-kontakt"><input type="checkbox" checked={visAlle} onChange={(e) => setVisAlle(e.target.checked)} />Vis alle felter</label>
                {vaerk && <Maerke>{vaerk.kode} · revision {vaerk.revision}</Maerke>}
                {rt.red.aktiv && <Maerke tone="advarsel">Redigerer — {rt.ændringer.length} {rt.ændringer.length === 1 ? "ændring" : "ændringer"} i udkastet</Maerke>}
            </>}>
            <nav className="kf-faner" aria-label="Værkets afsnit">
                {faner.map((f) => (
                    <a key={f.id} href={rutehref("konfiguration", kode, f.id)} aria-current={aktiv === f.id || (aktiv === "ny-enhed" && f.id === "enheder") ? "page" : undefined}>
                        {f.navn}{f.antal !== undefined && <span className="kf-antal">{f.antal}</span>}{kladderPrAfsnit.get(f.id) ? " •" : ""}
                    </a>
                ))}
            </nav>
            {rt.grundFund.length > 0 && !["log", "aendringer", "kilde", "tidsserier"].includes(aktiv) && (
                <Gitter>
                    <Kort titel="Kontrol af værket" afgraensning="klientens regler"
                        budskab={grundFejl.length ? `${grundFejl.length} ${grundFejl.length === 1 ? "fejl" : "fejl"} gør, at modellen afviser casen; ${grundAdv.length} advarsler.` : `Ingen fejl; ${grundAdv.length} ${grundAdv.length === 1 ? "advarsel" : "advarsler"}.`}
                        fod="Reglerne er modellens egne (viden/validering.md). Backend og modellen har det sidste ord.">
                        <ul className="kf-fund">
                            {rt.grundFund.map((f) => (
                                <li key={`${f.sti}|${f.besked}`}>
                                    <Maerke tone={f.alvor === "fejl" ? "fejl" : "advarsel"}>{f.alvor}</Maerke>
                                    <span><span className="kf-sti">{f.sti}</span> {f.besked}</span>
                                </li>
                            ))}
                        </ul>
                    </Kort>
                </Gitter>
            )}
            <DataTilstand h={parametre} højde={320}>
                {(blade) => {
                    if (!vaerk) return null;
                    const fælles = { g, rt, visAlle };
                    switch (aktiv as AfsnitId | "log" | "aendringer" | "kilde" | "ny-enhed" | "kom-i-gang" | "tidsserier") {
                        case "kom-i-gang": return <KomIGang vaerk={vaerk} g={g} bruger={bruger} gåTil={gåTil} />;
                        case "enheder":
                            return <Enheder {...fælles} kode={kode} valgt={valg} blade={blade} gåTil={gåTil}
                                scenarieAendringer={scenarieAendringer.data?.map((x) => x.aendring)}
                                scenarier={[...new Map((scenarieAendringer.data ?? []).map((x) => [x.scenarie.id, { id: x.scenarie.id, navn: x.scenarie.navn }])).values()]} />;
                        case "ny-enhed": return <NyEnhed kode={kode} blade={blade} rt={rt} gåTil={gåTil} />;
                        case "lagre": return <Lagre {...fælles} />;
                        case "priser": return <Priser {...fælles} />;
                        case "el": return <ElTarif {...fælles} />;
                        case "varmelast": return <Varmelast {...fælles} />;
                        case "balancering": case "tid": case "meta": case "oevrige":
                            return <GenereltAfsnit {...fælles} id={aktiv as "balancering"} vaerk={vaerk} />;
                        case "tidsserier": return <TidsserieFane vaerk={vaerk} blade={blade} valg={valg} gåTil={gåTil} bruger={bruger} />;
                        case "log": return <Revisionslog vaerk={vaerk} />;
                        case "aendringer": return <AendringerSidenKoersel vaerk={vaerk} blade={blade} koerselId={valg} gåTil={gåTil} />;
                        case "kilde": return <Kildefil vaerk={vaerk} blade={blade} />;
                        default:
                            return <Kort titel="Ukendt fane" budskab={`Der er ingen fane "${aktiv}".`}><a href={rutehref("konfiguration", kode)}>Til værkets enheder</a></Kort>;
                    }
                }}
            </DataTilstand>
        </Side>
    );
}
