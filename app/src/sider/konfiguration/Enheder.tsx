//-----------------------------------------------------------------------
// Fanen "Enheder": én række pr. enhed, den valgte enheds felter (redigér,
// fjern) og varmepumpens COP-tabel som tabel + kurve.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Gitter, Knap, Kort, Maerke, Tabel } from "@/components/layout";
import { rutehref } from "@/lib/rute";
import { BRAENDSEL, ENHEDSTYPER, enhedstypeNavn } from "./katalog";
import { enhed, type Blad, type Gruppering, type Objekt } from "./gruppering";
import { copTekst, enhedBudskab, enhederBudskab } from "./budskaber";
import { CopKurve } from "./Grafer";
import { FeltListe } from "./FeltListe";
import { fjernObjekt, scenarieReferencer } from "./redigering";
import type { RedigeringsTilstand } from "./useRedigering";
import { RedigerKnapper, RedigerSvar } from "./RedigerKnapper";
import { dk, dkFri } from "./vis";

export interface ScenarieRef { id: string; navn: string }

export function Enheder({ g, rt, visAlle, kode, valgt, blade, scenarieAendringer, scenarier, gåTil }: {
    g: Gruppering; rt: RedigeringsTilstand; visAlle: boolean; kode: string; valgt: string | undefined;
    blade: readonly Blad[];
    scenarieAendringer: readonly { scenarie_id: string; type: string; sti: string }[] | undefined;
    scenarier: readonly ScenarieRef[];
    gåTil: (s: string) => void;
}) {
    const objekter = g.efterId("enheder").objekter;
    const enheder = useMemo(() => objekter.map(enhed), [objekter]);
    const valgtObj: Objekt | undefined = objekter.find((o) => o.navn === valgt) ?? objekter[0];
    const e = valgtObj ? enhed(valgtObj) : undefined;
    const type = e?.type ? ENHEDSTYPER[e.type] : undefined;

    return (
        <>
            <Gitter>
                <Kort titel="Enheder" afgraensning={`${enheder.length} i værket`} budskab={enhederBudskab(enheder)}
                    handling={<Knap sekundaer onClick={() => gåTil(`konfiguration/${kode}/ny-enhed`)}>Ny enhed</Knap>}
                    fod="Klik på en enhed for at se og redigere alle dens felter. Virkn. = virkningsgrad η (brændsel → varme). Effekt i MW varme; solvarmens maks. er nameplate — loftet er profilen. Balance: kun aktive el-enheder byder (doc/BALANCEMARKED.md:7-8); grå flag har ingen virkning.">
                    <Tabel rækker={enheder} nøgle={(x) => x.navn} valgt={valgtObj?.navn}
                        onVælg={(x) => gåTil(`konfiguration/${kode}/enheder/${x.navn}`)}
                        tom="Værket har ingen enheder."
                        kolonner={[
                            { navn: "Enhed", vis: (x) => <span className="fjv-mono">{x.navn}</span> },
                            { navn: "Type", vis: (x) => enhedstypeNavn(x.type ?? undefined) },
                            { navn: "Til", vis: (x) => <Maerke tone={x.til ? "ok" : "neutral"}>{x.til ? "Til" : "Fra"}</Maerke> },
                            { navn: "Min–maks MW", vis: (x) => `${dkFri(x.pMin, 2)}–${dkFri(x.pMax, 2)}`, tal: true },
                            { navn: "Virkn. / COP", vis: (x) => (x.cop.length ? `${dk(x.cop[0].cop, 2)}–${dk(x.cop[x.cop.length - 1].cop, 2)}` : x.copFraAlpha !== null ? dk(x.copFraAlpha, 2) : x.eta !== null ? dkFri(x.eta, 3) : "–"), tal: true },
                            { navn: "Brændsel", vis: (x) => (x.fuel ? BRAENDSEL[x.fuel] ?? x.fuel : "–") },
                            { navn: "Var. D&V kr./MWh", vis: (x) => dkFri(x.varOm, 2), tal: true },
                            { navn: "Start kr.", vis: (x) => dkFri(x.startCost, 0), tal: true },
                            { navn: "Min. op/ned t", vis: (x) => (x.uc ? `${dkFri(x.minOp)}/${dkFri(x.minNed)}` : "–"), tal: true },
                            { navn: "Balance", vis: (x) => {
                                const flag = [x.afrr && "aFRR", x.mfrr && "mFRR"].filter(Boolean).join(", ");
                                if (!flag) return "–";
                                if (x.kanByde && x.til) return flag;
                                // Flaget står i casen, men virker ikke: kun el-enheder byder, og en slukket enhed byder ikke.
                                const hvorfor = x.fuel !== "electricity" ? "kun el-enheder byder" : "enheden er slået fra";
                                return <span className="kf-uden-virkning" title={`Ingen virkning: ${hvorfor} (doc/BALANCEMARKED.md:7-8).`}>{flag} · ingen virkning</span>;
                            } },
                        ]} />
                </Kort>
            </Gitter>
            {valgtObj && e && (
                <Gitter form="8-4">
                    <Kort titel={valgtObj.navn} afgraensning={enhedstypeNavn(e.type ?? undefined)} budskab={enhedBudskab(e)}
                        handling={<RedigerKnapper rt={rt} />}
                        fod={<RedigerSvar rt={rt} />}>
                        <FeltListe blade={valgtObj.blade} visAlle={visAlle} red={rt.red} fund={rt.fund}
                            gruppe={(b) => (b.rel.includes(".") ? b.rel.split(".")[0] : "Enheden")} />
                        {rt.red.aktiv && <FjernEnhed navn={valgtObj.navn} blade={blade} rt={rt}
                            scenarieAendringer={scenarieAendringer} scenarier={scenarier} efter={() => gåTil(`konfiguration/${kode}/enheder`)} />}
                    </Kort>
                    {e.copType ? (
                        <Kort titel="COP-kurve" afgraensning={`${valgtObj.navn} · ${e.copType === "table" ? "målt tabel" : "lineær"}`}
                            budskab={copTekst(e) ? `${copTekst(e)}.` : "Kurven har ingen punkter."}
                            fod="COP = varme / el i hvert målepunkt. Mellem punkterne interpoleres varme og el hver for sig; uden for holdes yderværdien.">
                            {e.cop.length > 0 && (
                                <>
                                    <CopKurve punkter={e.cop} />
                                    <Tabel rækker={e.cop} nøgle={(p) => String(p.t_ambient)}
                                        kolonner={[
                                            { navn: "Ude °C", vis: (p) => dkFri(p.t_ambient, 1), tal: true },
                                            { navn: "Varme MW", vis: (p) => dkFri(p.heat_mw, 3), tal: true },
                                            { navn: "El MW", vis: (p) => dkFri(p.el_mw, 3), tal: true },
                                            { navn: "COP", vis: (p) => dk(p.cop, 2), tal: true },
                                        ]} />
                                </>
                            )}
                        </Kort>
                    ) : (
                        <Kort titel="Om typen" afgraensning={type?.navn ?? "ukendt type"}
                            budskab={type ? (type.kan_byde_balance ? "Typen kan byde i balancemarkedet." : "Typen kan ikke byde i balancemarkedet (kun el-enheder kan).") : "Typen findes ikke i enhedstyperne."}
                            fod={<>Kilde: viden/enhedstyper.json · <a href={rutehref("information")}>Om metoden</a></>}>
                            {type && (
                                <div className="fjv-brod">
                                    <p>{type.beskrivelse}</p>
                                    {type.noter.map((n) => <p key={n}>{n}</p>)}
                                    <p>Påkrævede felter: <span className="fjv-mono">{type.paakraevede.join(", ")}</span></p>
                                </div>
                            )}
                        </Kort>
                    )}
                </Gitter>
            )}
        </>
    );
}

function FjernEnhed({ navn, blade, rt, scenarieAendringer, scenarier, efter }: {
    navn: string; blade: readonly Blad[]; rt: RedigeringsTilstand;
    scenarieAendringer: readonly { scenarie_id: string; type: string; sti: string }[] | undefined;
    scenarier: readonly ScenarieRef[]; efter: () => void;
}) {
    const [åben, setÅben] = useState(false);
    const plan = useMemo(() => fjernObjekt("units", navn, blade), [navn, blade]);
    const refs = scenarieAendringer ? [...scenarieReferencer("units", navn, scenarieAendringer)] : undefined;
    const navne = (refs ?? []).map((id) => scenarier.find((s) => s.id === id)?.navn ?? id);
    if (!åben) return <div className="kf-handlinger"><Knap sekundaer onClick={() => setÅben(true)}>Fjern enheden…</Knap></div>;
    return (
        <div className="fjv-brod" role="group" aria-label="Fjern enhed">
            <p><strong>Fjern {navn}?</strong> {plan.ændringer.length - plan.medslettes.length} felter slettes
                {plan.medslettes.length > 0 && <> sammen med {plan.medslettes.length} balanceringslofter for enheden</>}. Ændringen logges og kan ses i revisionsloggen.</p>
            {refs === undefined && <p className="kf-kilde">Tjekker scenarier…</p>}
            {navne.length > 0 && <p className="kf-svar" data-tone="fejl">Kan ikke fjernes: scenarierne {navne.join(", ")} bruger enheden. Ret eller arkivér dem først.</p>}
            {plan.nævnt.length > 0 && <p className="kf-svar" data-tone="fejl">Enheden er nævnt i {plan.nævnt.join(", ")} — ret dem først, ellers afviser modellen casen.</p>}
            <div className="kf-handlinger">
                <Knap disabled={refs === undefined || navne.length > 0 || plan.nævnt.length > 0 || rt.sender}
                    onClick={async () => { if (await rt.send(plan.ændringer)) { rt.fortryd(); efter(); } }}>Fjern {navn}</Knap>
                <Knap sekundaer onClick={() => setÅben(false)}>Annullér</Knap>
            </div>
        </div>
    );
}
