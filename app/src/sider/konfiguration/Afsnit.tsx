//-----------------------------------------------------------------------
// Fanerne uden for "Enheder": Lagre, Priser, El og tarif, Balancering,
// Varmelast, Tid/data/solver, Meta, Øvrige. Hver fane: et kort med en
// visualisering regnet af data + afsnittets felter (redigérbare).
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { Gitter, Kort, Maerke, Tabel } from "@/components/layout";
import { tidspunkt } from "@/lib/format";
import { BRAENDSEL, findFelt, type AfsnitId } from "./katalog";
import { lager, tal, tekst, type Afsnit, type Gruppering, type VistBlad } from "./gruppering";
import { balanceringBudskab, elBudskab, lagreBudskab, priserBudskab, tidBudskab, varmelastBudskab } from "./budskaber";
import { DAGTYPE_NAVN, ELAFGIFT_NET, laesTarif, type Tarif } from "./tarif";
import { FeltListe } from "./FeltListe";
import { ProfilGraf } from "./Grafer";
import type { RedigeringsTilstand } from "./useRedigering";
import { RedigerKnapper, RedigerSvar } from "./RedigerKnapper";
import { dk, dkFri, pctTekst } from "./vis";

interface Fælles { g: Gruppering; rt: RedigeringsTilstand; visAlle: boolean }

/** Afsnittets blade inkl. objekternes, i visningsrækkefølge. */
const afsnitsBlade = (a: Afsnit): VistBlad[] => [...a.blade, ...a.objekter.flatMap((o) => o.blade)];

/** Feltkortet alle faner deler: titel, budskab, Redigér/Gem, felterne. */
function Feltkort({ a, rt, visAlle, budskab, gruppe, valg }: Fælles & {
    a: Afsnit; budskab: string; gruppe?: (b: VistBlad) => string; valg?: (b: VistBlad) => readonly string[] | undefined;
}) {
    const blade = afsnitsBlade(a);
    const skjulte = blade.filter((b) => b.skjult).length;
    return (
        <Kort titel={a.def.navn} afgraensning={`${blade.length} felter${!visAlle && skjulte ? `, ${skjulte} skjult` : ""}`} budskab={budskab}
            handling={<RedigerKnapper rt={rt} />} fod={<RedigerSvar rt={rt} />}>
            <FeltListe blade={blade} visAlle={visAlle} red={rt.red} fund={rt.fund} gruppe={gruppe} valg={valg} />
        </Kort>
    );
}

/** Første del af stien under sektionen som gruppeoverskrift (`bid_strategy`, `nettab`, objektets navn). */
const underblok = (b: VistBlad) => {
    const d = b.sti.split(".");
    return d.length > 2 ? d[1] : "Generelt";
};

// ------------------------------------------------------------------ Lagre

export function Lagre({ g, rt, visAlle }: Fælles) {
    const a = g.efterId("lagre");
    const lagre = useMemo(() => a.objekter.map(lager), [a]);
    return (
        <>
            <Gitter>
                <Kort titel="Lagre" afgraensning={`${lagre.length} i værket`} budskab={lagreBudskab(lagre)}
                    fod="Kapacitet = volumen × 1,163 kWh/(m³·K) × ΔT / 1000, når e_max_mwh er tom (markeret 'beregnet'). Et tal i e_max_mwh vinder over volumen.">
                    <Tabel rækker={lagre} nøgle={(l) => l.navn} tom="Værket har intet varmelager."
                        kolonner={[
                            { navn: "Lager", vis: (l) => <span className="fjv-mono">{l.navn}</span> },
                            { navn: "Til", vis: (l) => <Maerke tone={l.til ? "ok" : "neutral"}>{l.til ? "Til" : "Fra"}</Maerke> },
                            { navn: "Volumen m³", vis: (l) => dkFri(l.volumen, 0), tal: true },
                            { navn: "ΔT K", vis: (l) => dkFri(l.deltaT, 1), tal: true },
                            { navn: "Kapacitet MWh", vis: (l) => <>{dk(l.kapacitet, 1)}{l.kapacitetBeregnet && <> <Maerke>beregnet</Maerke></>}</>, tal: true },
                            { navn: "Start MWh", vis: (l) => dkFri(l.eStart, 1), tal: true },
                            { navn: "Lade/aflade MW", vis: (l) => `${dkFri(l.pLad, 1)}/${dkFri(l.pAflad, 1)}`, tal: true },
                            { navn: "Tab pr. time", vis: (l) => pctTekst(l.tab, 3), tal: true },
                        ]} />
                </Kort>
            </Gitter>
            <Gitter>
                <Feltkort a={a} g={g} rt={rt} visAlle={visAlle} budskab="Alle lagrenes felter; kun de markerede er påkrævet af modellen." gruppe={underblok} />
            </Gitter>
        </>
    );
}

// ------------------------------------------------------------------ Priser

export function Priser({ g, rt, visAlle }: Fælles) {
    const a = g.efterId("priser");
    const v = rt.nu;
    const priser = a.objekter.map((o) => ({
        navn: o.navn,
        pris: tal(o.blade.find((b) => b.rel === "value")?.vaerdi_json),
        enhed: tekst(o.blade.find((b) => b.rel === "unit")?.vaerdi_json),
        bekraeft: o.blade.some((b) => b.bekraeft),
    }));
    return (
        <Gitter form="4-8">
            <Kort titel="Priser" afgraensning="ekskl. moms" budskab={priserBudskab(v)}
                fod="Brændselspriser er pr. MWh brændsel; 'unit' er dokumentation og læses ikke af modellen.">
                <Tabel rækker={priser} nøgle={(p) => p.navn}
                    kolonner={[
                        { navn: "Brændsel", vis: (p) => <>{BRAENDSEL[p.navn] ?? p.navn}{p.bekraeft && <> <Maerke tone="advarsel">[BEKRÆFT]</Maerke></>}</> },
                        { navn: "Pris", vis: (p) => dkFri(p.pris, 2), tal: true },
                        { navn: "Enhed", vis: (p) => p.enhed ?? "" },
                    ]} />
            </Kort>
            <Feltkort a={a} g={g} rt={rt} visAlle={visAlle} budskab="Prisen pr. brændsel og CO₂-kvoten." gruppe={(b) => BRAENDSEL[b.sti.split(".")[1]] ?? b.sti.split(".")[1]} />
        </Gitter>
    );
}

// ------------------------------------------------------------------ El og tarif

function Ugeskema({ t }: { t: Tarif }) {
    const trin = new Map(t.baand.map((b, i) => [b.navn, String(Math.min(i, 3))]));
    return (
        <div className="kf-uge-ramme">
            <div className="kf-uge" role="table" aria-label="Nettarif pr. time">
                <div />
                {Array.from({ length: 24 }, (_, i) => <div key={i} className="kf-uge-time">{i % 3 === 0 ? String(i).padStart(2, "0") : ""}</div>)}
                {t.saesoner.flatMap((s) => (["weekday", "weekend"] as const).map((dag) => [
                    <div key={`${s.navn}${dag}`} className="kf-uge-etiket" title={`${s.navn}, måneder ${s.maaneder.join(", ")}`}>{s.navn} · {DAGTYPE_NAVN[dag].toLowerCase()}</div>,
                    ...s.timer[dag].map((b, i) => (
                        <div key={`${s.navn}${dag}${i}`} className="kf-uge-celle" data-trin={b ? trin.get(b) ?? "x" : "x"}
                            title={`${s.navn}, ${DAGTYPE_NAVN[dag].toLowerCase()} kl. ${String(i).padStart(2, "0")}: ${b ?? "ikke dækket"}`} />
                    )),
                ]))}
            </div>
            <div className="kf-forklaring-raekke">
                {t.baand.map((b) => (
                    <span key={b.navn}><i className="kf-uge-celle" data-trin={trin.get(b.navn)} />{b.navn}: {dkFri(b.pris, 2)} kr./MWh</span>
                ))}
                {t.saesoner.map((s) => <span key={s.navn}>{s.navn}: måned {s.maaneder.join(", ")}</span>)}
            </div>
        </div>
    );
}

function elGruppe(b: VistBlad): string {
    const d = b.sti.split(".");
    if (d[0] === "grid") return "Nettilslutning";
    if (d[1] !== "tariff_consumption") return "Spotområde, flade satser og elafgift";
    if (d[2] === "fixed_components") return "Tarifprofil · faste tillæg";
    if (d[2] === "net_tariff" && d[3] === "bands") return "Tarifprofil · bånd";
    if (d[2] === "net_tariff" && d[3] === "seasons") return `Tarifprofil · sæson ${d[4]}`;
    return "Tarifprofil";
}

export function ElTarif({ g, rt, visAlle }: Fælles) {
    const a = g.efterId("el");
    const t = useMemo(() => laesTarif(rt.nu), [rt.nu]);
    const båndNavne = t.baand.map((b) => b.navn);
    const paritetOk = t.elafgiftNet === null || t.elafgift === t.elafgiftNet;
    return (
        <>
            <Gitter form="8-4">
                <Kort titel="Nettarif" afgraensning="bånd × sæson × hverdag/weekend" budskab={elBudskab(t, rt.nu)}
                    fod="Timerne er lokal tid; intervaller er halvåbne ('06-21' = time 6 til og med 20). Kilde: src/tariff.py.">
                    {!t.findes ? (
                        <p className="fjv-tilstand">Værket har ingen tarifprofil — modellen bruger den flade forbrugstarif ({dkFri(tal(rt.nu.get("electricity.tariff_consumption_flat")))} kr./MWh) hele året.</p>
                    ) : (
                        <>
                            {/* En ufuldstændig profil vises som det, den er — ikke som "ingen profil" (Codex K3-N7). */}
                            {t.saesoner.length > 0 && <Ugeskema t={t} />}
                            {t.fejl.length > 0 && (
                                <ul className="kf-fund">
                                    {t.fejl.map((f) => <li key={`${f.sti}|${f.besked}`}><Maerke tone="fejl">fejl</Maerke><span>{f.besked}</span></li>)}
                                </ul>
                            )}
                        </>
                    )}
                </Kort>
                <Kort titel="Elafgift" afgraensning="paritetsreglen"
                    budskab={paritetOk ? "electricity_tax og elafgift_net er ens — casen accepteres." : "electricity_tax og elafgift_net afviger — modellen afviser casen."}
                    fod="src/tariff.py:165-184: elafgift_net er dokumentation og indgår ikke i tariffen; electricity_tax lægges til separat. Findes elafgift_net, skal den være lig electricity_tax, ellers afvises casen.">
                    <div className="kf-tal-raekke">
                        <div><strong>{dkFri(t.elafgift, 2)}</strong><span>electricity_tax · kr./MWh</span></div>
                        <div><strong>{t.elafgiftNet === null ? "–" : dkFri(t.elafgiftNet, 2)}</strong><span>elafgift_net · kr./MWh</span></div>
                    </div>
                    <Maerke tone={paritetOk ? "ok" : "fejl"}>{paritetOk ? "Paritet overholdt" : "Paritet brudt"}</Maerke>
                    {t.faste.length > 0 && (
                        <Tabel rækker={[...t.faste.map((f) => ({ ...f, sum: false })), { navn: "I alt i tariffen", pris: t.fastSum, sum: true }]} nøgle={(f) => f.navn}
                            kolonner={[
                                { navn: "Fast tillæg", vis: (f) => (f.sum ? <strong>{f.navn}</strong>
                                    : f.navn === ELAFGIFT_NET ? <>{f.navn} <Maerke>dokumentation — ikke i summen</Maerke></> : f.navn) },
                                { navn: "kr./MWh", vis: (f) => (f.sum ? <strong>{dkFri(f.pris, 2)}</strong>
                                    : <span className={f.navn === ELAFGIFT_NET ? "kf-uden-virkning" : undefined}>{dkFri(f.pris, 2)}</span>), tal: true },
                            ]} />
                    )}
                    {t.billigsteTime !== null && (
                        <p className="fjv-brod">Profilens billigste time: {dk(t.billigsteTime, 1)} kr./MWh i tariffen + {dkFri(t.elafgift, 2)} kr./MWh elafgift = <strong>{dk(t.billigsteTime + (t.elafgift ?? 0), 1)} kr./MWh</strong>.</p>
                    )}
                </Kort>
            </Gitter>
            <Gitter>
                <Feltkort a={a} g={g} rt={rt} visAlle={visAlle} budskab="Spotområde, flade satser, elafgift og tarifprofilens bånd og tidsintervaller."
                    gruppe={elGruppe}
                    valg={(b) => (/\.seasons\.[^.]+\.(weekday|weekend)\./.test(b.sti) ? båndNavne : undefined)} />
            </Gitter>
        </>
    );
}

// ------------------------------------------------------------------ Varmelast

export function Varmelast({ g, rt, visAlle }: Fælles) {
    const a = g.efterId("varmelast");
    const prof = useMemo(() => {
        try {
            const v = JSON.parse(rt.nu.get("heat_load_params.baseline_profile_mw") ?? "[]") as unknown[];
            return v.filter((x): x is number => typeof x === "number");
        } catch { return []; }
    }, [rt.nu]);
    return (
        <>
            <Gitter form="8-4">
                <Kort titel="Grundprofil" afgraensning="MW pr. time (UTC), uden rumvarme" budskab={varmelastBudskab(rt.nu)}
                    fod={`${findFelt("heat_load_params.baseline_profile_mw")?.forklaring ?? ""} Rumvarmen lægges oven i ud fra udetemperaturen.`}>
                    <ProfilGraf værdier={prof} enhed="MW" />
                </Kort>
                <Kort titel="Temperaturafhængighed" afgraensning="graddøgnsmodellen"
                    budskab={`Under ${dkFri(tal(rt.nu.get("heat_load_params.t_ref")) ?? 15)} °C stiger lasten ${dkFri(tal(rt.nu.get("heat_load_params.gaf_mw_per_k")), 3)} MW pr. grad.`}
                    fod="Kilde: appens feltkatalog (modellens felter med forklaring); felterne kan rettes nedenfor.">
                    <div className="kf-tal-raekke">
                        <div><strong>{dkFri(tal(rt.nu.get("heat_load_params.gaf_mw_per_k")), 3)}</strong><span>GAF · MW/K</span></div>
                        <div><strong>{dkFri(tal(rt.nu.get("heat_load_params.t_ref")), 1)}</strong><span>t_ref · °C</span></div>
                        <div><strong>{dkFri(tal(rt.nu.get("heat_load_params.thermal_inertia_hours")), 0)}</strong><span>træghed · timer</span></div>
                    </div>
                    <div className="fjv-brod">
                        {["heat_load_params.gaf_mw_per_k", "heat_load_params.t_ref", "heat_load_params.thermal_inertia_hours"].map((s) => {
                            const p = findFelt(s);
                            return p ? <p key={s}><strong>{p.etiket}:</strong> {p.forklaring}</p> : null;
                        })}
                    </div>
                </Kort>
            </Gitter>
            <Gitter>
                <Feltkort a={a} g={g} rt={rt} visAlle={visAlle} budskab="Varmelastens parametre; avancerede nettabsfelter er skjult." gruppe={underblok} />
            </Gitter>
        </>
    );
}

// ------------------------------------------------------------------ øvrige faner

export function GenereltAfsnit({ id, g, rt, visAlle, vaerk }: Fælles & {
    id: Exclude<AfsnitId, "enheder" | "lagre" | "priser" | "el" | "varmelast">;
    vaerk: { kode: string; kilde: string; kilde_fil?: string | null; repo_commit?: string | null; revision: number; oprettet: Date | string; oprettet_af: string; aendret: Date | string; aendret_af: string };
}) {
    const a = g.efterId(id);
    const budskab = id === "balancering" ? balanceringBudskab(rt.nu)
        : id === "tid" ? tidBudskab(rt.nu)
        : id === "meta" ? `${vaerk.kilde === "repo" ? `Importeret fra ${vaerk.kilde_fil ?? "modelrepoet"}` : "Oprettet i appen"}; revision ${vaerk.revision}, senest ændret ${tidspunkt(vaerk.aendret)} af ${vaerk.aendret_af}.`
        : a.antal === 0 ? "Ingen felter uden for de kendte afsnit." : `${a.antal} felter ligger uden for de kendte afsnit.`;
    return (
        <>
            {id === "meta" && (
                <Gitter form="6-6">
                    <Kort titel="Værket" afgraensning="i appens database" budskab={`Kode ${vaerk.kode}, revision ${vaerk.revision}.`} fod="Koden er fast; et nyt værk oprettes som kopi.">
                        <Tabel rækker={[
                            ["Kode", vaerk.kode], ["Kilde", vaerk.kilde === "repo" ? "Modelrepo" : "Appen"], ["Kildefil", vaerk.kilde_fil ?? "–"],
                            ["Modelcommit", vaerk.repo_commit ?? "–"],
                        ]} nøgle={(r) => r[0]} kolonner={[{ navn: "Felt", vis: (r) => r[0] }, { navn: "Værdi", vis: (r) => <span className="fjv-mono">{r[1]}</span> }]} />
                    </Kort>
                    <Kort titel="Historik" afgraensning="oprettet og ændret" budskab={`Oprettet ${tidspunkt(vaerk.oprettet)}; senest ændret ${tidspunkt(vaerk.aendret)}.`} fod="Hele historikken står i revisionsloggen.">
                        <Tabel rækker={[["Oprettet", tidspunkt(vaerk.oprettet), vaerk.oprettet_af], ["Senest ændret", tidspunkt(vaerk.aendret), vaerk.aendret_af]]}
                            nøgle={(r) => r[0]} kolonner={[{ navn: "Hvad", vis: (r) => r[0] }, { navn: "Hvornår", vis: (r) => r[1] }, { navn: "Af", vis: (r) => r[2] }]} />
                    </Kort>
                </Gitter>
            )}
            <Gitter>
                <Feltkort a={a} g={g} rt={rt} visAlle={visAlle} budskab={budskab}
                    gruppe={id === "tid" || id === "meta" ? (b) => b.sti.split(".")[0] : underblok} />
            </Gitter>
        </>
    );
}
