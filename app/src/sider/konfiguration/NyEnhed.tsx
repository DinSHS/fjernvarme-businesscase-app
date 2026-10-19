//-----------------------------------------------------------------------
// #/konfiguration/<kode>/ny-enhed — ny enhed fra enhedstypens skabelon
// (viden/enhedstyper.json): vælg type, navn, udfyld de påkrævede felter.
// Én anmodning med `opret` for alle bladene.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Gitter, Knap, Kort, Tabel } from "@/components/layout";
import { BRAENDSEL, ENHEDSTYPER, findFelt } from "./katalog";
import { objektnavne, type Blad } from "./gruppering";
import { anvend, nyEnhed, tjekNavn } from "./redigering";
import { nyeFejl, type RedigeringsTilstand } from "./useRedigering";
import { validerVaerk } from "./validering";
import { redigerbarTekst, visFelt } from "./vis";

/** Felterne formularen spørger om (resten tages fra skabelonen og kan rettes bagefter). */
const SPØRG = ["p_max_heat", "p_min_heat", "alpha", "eta_fuel_to_heat", "var_om", "start_cost", "uc_enabled", "min_uptime", "min_downtime", "initial_status"];

export function NyEnhed({ kode, blade, rt, gåTil }: { kode: string; blade: readonly Blad[]; rt: RedigeringsTilstand; gåTil: (s: string) => void }) {
    const typer = Object.entries(ENHEDSTYPER);
    const [type, setType] = useState(typer[0][0]);
    const [navn, setNavn] = useState("");
    const [værdier, setVærdier] = useState<Map<string, string>>(new Map());
    const t = ENHEDSTYPER[type];
    const skabelon = useMemo(() => new Map(t.skabelon.map((s) => [s.sti, s.vaerdi_json])), [t]);
    const felter = SPØRG.filter((f) => skabelon.has(f));
    const optaget = useMemo(() => objektnavne(blade), [blade]);
    const navnFejl = navn ? tjekNavn(navn, optaget) : null;

    const input = useMemo(() => {
        const m = new Map(værdier);
        if (!m.has("fuel")) m.set("fuel", t.fuel[0]);
        return m;
    }, [værdier, t]);
    const plan = useMemo(() => (navn && !navnFejl ? nyEnhed(type, navn, input) : null), [type, navn, navnFejl, input]);
    const nyFund = useMemo(() => {
        if (!plan || plan.fejl.length) return [];
        return nyeFejl(rt.grundFund, validerVaerk(anvend(rt.nu, plan.ændringer)));
    }, [plan, rt.grundFund, rt.nu]);
    const kan = !!plan && plan.fejl.length === 0 && nyFund.length === 0 && !rt.sender;

    const vælgType = (ny: string) => { setType(ny); setVærdier(new Map()); };
    const sæt = (f: string, v: string) => setVærdier((m) => new Map(m).set(f, v));
    const opret = async () => {
        if (plan && (await rt.send(plan.ændringer))) gåTil(`konfiguration/${kode}/enheder/${navn}`);
    };

    return (
        <Gitter form="8-4">
            <Kort titel="Ny enhed" afgraensning={t.navn}
                budskab={plan ? `${plan.ændringer.length} felter oprettes under units.${navn} i én ændring.` : "Vælg type og navn; felterne starter med typens skabelonværdier."}
                fod="Skabelonens tal er pladsholdere (viden/enhedstyper.json) — erstat dem med værkets egne. Øvrige felter kan rettes bagefter under Enheder.">
                <div className="kf-formular" data-spalter="2">
                    <label>Type
                        <select className="fjv-felt" value={type} onChange={(e) => vælgType(e.target.value)}>
                            {typer.map(([k, x]) => <option key={k} value={k}>{x.navn}</option>)}
                        </select>
                    </label>
                    <label>Navn <small>små bogstaver, cifre og _ — fx vp_ny</small>
                        <input className="fjv-felt" value={navn} aria-invalid={navnFejl ? true : undefined} onChange={(e) => setNavn(e.target.value.trim())} />
                        {navnFejl && <span className="kf-felt-fejl">{navnFejl}</span>}
                    </label>
                    <label>Brændsel
                        <select className="fjv-felt" value={input.get("fuel")} onChange={(e) => sæt("fuel", e.target.value)} disabled={t.fuel.length < 2}>
                            {t.fuel.map((f) => <option key={f} value={f}>{BRAENDSEL[f] ?? f}</option>)}
                        </select>
                    </label>
                    {felter.map((f) => {
                        const post = findFelt(`units.x.${f}`);
                        const gammel = skabelon.get(f)!;
                        const fejl = plan?.fejl.find((x) => x.sti === f)?.besked;
                        if (gammel === "true" || gammel === "false") {
                            const på = (værdier.get(f) ?? redigerbarTekst(gammel)) === "ja";
                            return (
                                <label key={f}>{post?.etiket ?? f}
                                    <span className="kf-kontakt"><input type="checkbox" checked={på} onChange={(e) => sæt(f, e.target.checked ? "ja" : "nej")} />{på ? "Ja" : "Nej"}</span>
                                </label>
                            );
                        }
                        return (
                            <label key={f}>{post?.etiket ?? f}{post?.enhed && <small>{post.enhed}{t.paakraevede.includes(f) ? " · påkrævet" : ""}</small>}
                                <input className="fjv-felt kf-tal-input" inputMode="decimal" aria-invalid={fejl ? true : undefined}
                                    value={værdier.get(f) ?? redigerbarTekst(gammel)} onChange={(e) => sæt(f, e.target.value)} />
                                {fejl && <span className="kf-felt-fejl">{fejl}</span>}
                            </label>
                        );
                    })}
                </div>
                {nyFund.length > 0 && <div className="kf-fund">{nyFund.map((x) => <span key={x.sti + x.besked} className="kf-felt-fejl">{x.besked}</span>)}</div>}
                <div className="kf-handlinger">
                    <Knap onClick={opret} disabled={!kan}>{rt.sender ? "Opretter…" : "Opret enhed"}</Knap>
                    <Knap sekundaer onClick={() => gåTil(`konfiguration/${kode}/enheder`)}>Annullér</Knap>
                    {rt.svar && <span className="kf-svar" data-tone={rt.svar.tone}>{rt.svar.tekst}</span>}
                </div>
            </Kort>
            <Kort titel={t.navn} afgraensning="typen" budskab={t.beskrivelse} fod="Kilde: viden/enhedstyper.json (src/config.py:492).">
                <div className="fjv-brod">{t.noter.map((n) => <p key={n}>{n}</p>)}</div>
                <Tabel rækker={t.skabelon.filter((s) => !SPØRG.includes(s.sti) && s.sti !== "fuel" && s.sti !== "type")} nøgle={(s) => s.sti}
                    kolonner={[
                        { navn: "Fra skabelonen", vis: (s) => findFelt(`units.x.${s.sti}`)?.etiket ?? s.sti },
                        { navn: "Værdi", vis: (s) => <span className="kf-vaerdi" data-lang="true">{visFelt(s.vaerdi_json)}</span>, tal: true },
                    ]} />
            </Kort>
        </Gitter>
    );
}
