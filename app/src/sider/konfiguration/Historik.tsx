//-----------------------------------------------------------------------
// Revisionslog (#/konfiguration/<kode>/log), "Ændringer siden en kørsel"
// (#/konfiguration/<kode>/aendringer/<koersel_id>) og "Kildefil".
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { DataTilstand, Gitter, Kort, Maerke, StatusMaerke, Tabel } from "@/components/layout";
import { useAendringsanmodninger, useAendringslog, useKildeYaml, useKoersler, useKoerselInput } from "@/lib/data/hooks";
import { tidspunkt } from "@/lib/format";
import { diffKoersel, koerselsTillaeg } from "./diff";
import { findFelt } from "./katalog";
import { rekonstruerYaml } from "./yaml";
import type { Blad } from "./gruppering";
import { visFelt } from "./vis";
import { filtrerLog, revisioner } from "./historik-logik";

interface VaerkInfo { id: string; kode: string; navn: string; revision: number; kilde: string; kilde_fil?: string | null }

const etiket = (sti: string) => findFelt(sti)?.etiket;

// ------------------------------------------------------------------ revisionslog

export function Revisionslog({ vaerk }: { vaerk: VaerkInfo }) {
    const log = useAendringslog(vaerk.id);
    const anmodninger = useAendringsanmodninger(vaerk.id);
    const [filter, setFilter] = useState("");
    const [visImport, setVisImport] = useState(false);
    const revs = useMemo(() => revisioner(log.data ?? []), [log.data]);
    const rækker = useMemo(() => filtrerLog(log.data ?? [], filter, visImport), [log.data, filter, visImport]);
    const seneste = revs[0];
    const budskab = log.data
        ? revs.length <= 1
            ? `Ingen ændringer siden importen (revision ${vaerk.revision}).`
            : `${revs.length - 1} ${revs.length === 2 ? "ændring" : "ændringer"} siden importen; senest revision ${seneste.revision} af ${seneste.af} ${tidspunkt(seneste.tid)} (${seneste.antal} ${seneste.antal === 1 ? "felt" : "felter"}).`
        : undefined;

    return (
        <>
            <Gitter>
                <Kort titel="Ændringer" afgraensning={visImport ? "alle revisioner" : "efter importen"} budskab={budskab}
                    handling={<label className="kf-kontakt"><input type="checkbox" checked={visImport} onChange={(e) => setVisImport(e.target.checked)} />Vis importen</label>}
                    fod="Revision 1 er importen af kildefilen (ét 'opret' pr. blad). Hver gem giver én ny revision.">
                    <div className="kf-formular">
                        <label>Filtrér på sti eller enhed <small>fx units.halmkedel eller prices</small>
                            <input className="fjv-felt" value={filter} onChange={(e) => setFilter(e.target.value)} />
                        </label>
                    </div>
                    <DataTilstand h={log}>
                        {() => (
                            <Tabel rækker={rækker.slice(0, 500)} nøgle={(r) => r.id}
                                tom={filter ? "Ingen ændringer matcher filteret." : visImport ? "Loggen er tom." : "Ingen ændringer siden importen."}
                                kolonner={[
                                    { navn: "Rev.", vis: (r) => r.revision, tal: true },
                                    { navn: "Hvornår", vis: (r) => tidspunkt(r.tidspunkt) },
                                    { navn: "Af", vis: (r) => r.aendret_af },
                                    { navn: "Handling", vis: (r) => <Maerke tone={r.handling === "slet" ? "fejl" : r.handling === "opret" ? "ok" : "neutral"}>{r.handling}</Maerke> },
                                    { navn: "Felt", vis: (r) => <>{etiket(r.sti) && <span className="kf-feltnavn">{etiket(r.sti)} </span>}<div className="kf-sti">{r.sti}</div></> },
                                    { navn: "Gammel → ny", vis: (r) => <span className="kf-vaerdi" data-lang="true"><span className="kf-foer">{r.gammel_json == null ? "" : visFelt(r.gammel_json)}</span> → <span className="kf-nu">{r.ny_json == null ? "(slettet)" : visFelt(r.ny_json)}</span></span> },
                                ]} />
                        )}
                    </DataTilstand>
                    {rækker.length > 500 && <p className="kf-kilde">Viser de første 500 af {rækker.length}; filtrér for at se resten.</p>}
                </Kort>
            </Gitter>
            <Gitter form="6-6">
                <Kort titel="Revisioner" afgraensning="pr. gem" budskab={log.data ? `${revs.length} ${revs.length === 1 ? "revision" : "revisioner"}; værket er på revision ${vaerk.revision}.` : undefined}
                    fod="En revision er én anmodning udført i én transaktion.">
                    <DataTilstand h={log}>
                        {() => (
                            <Tabel rækker={revs} nøgle={(r) => String(r.revision)}
                                kolonner={[
                                    { navn: "Rev.", vis: (r) => r.revision, tal: true },
                                    { navn: "Hvornår", vis: (r) => tidspunkt(r.tid) },
                                    { navn: "Af", vis: (r) => r.af },
                                    { navn: "Felter", vis: (r) => r.antal, tal: true },
                                    { navn: "Hvad", vis: (r) => r.resume },
                                ]} />
                        )}
                    </DataTilstand>
                </Kort>
                <Kort titel="Anmodninger" afgraensning="status og svar"
                    budskab={anmodninger.data ? (anmodninger.data.length ? `${anmodninger.data.filter((a) => a.status === "afvist").length} af ${anmodninger.data.length} anmodninger er afvist.` : "Ingen anmodninger endnu — importen gik uden om dem.") : undefined}
                    fod="Svaret er udfoerAendring's egen tekst, ordret.">
                    <DataTilstand h={anmodninger}>
                        {(rk) => (
                            <Tabel rækker={rk} nøgle={(a) => a.id} tom="Ingen anmodninger."
                                kolonner={[
                                    { navn: "Anmodet", vis: (a) => tidspunkt(a.anmodet) },
                                    { navn: "Af", vis: (a) => a.anmodet_af },
                                    { navn: "Status", vis: (a) => <Maerke tone={a.status === "udfoert" ? "ok" : a.status === "afvist" ? "fejl" : "advarsel"}>{a.status === "udfoert" ? "udført" : a.status}</Maerke> },
                                    { navn: "Forv. rev.", vis: (a) => a.forventet_revision, tal: true },
                                    { navn: "Svar", vis: (a) => a.svar ?? "" },
                                ]} />
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
        </>
    );
}

// ------------------------------------------------------------------ ændringer siden en kørsel

export function AendringerSidenKoersel({ vaerk, blade, koerselId, gåTil }: { vaerk: VaerkInfo; blade: readonly Blad[]; koerselId: string | undefined; gåTil: (s: string) => void }) {
    const koersler = useKoersler({ vaerkId: vaerk.id });
    const valgt = koersler.data?.find((k) => k.id === koerselId) ?? koersler.data?.find((k) => k.status === "faerdig") ?? koersler.data?.[0];
    const input = useKoerselInput(valgt?.id);
    const diff = useMemo(() => (input.data ? diffKoersel(input.data, blade) : undefined), [input.data, blade]);
    const tillæg = useMemo(() => (input.data ? koerselsTillaeg(input.data) : []), [input.data]);
    const n = (art: string) => diff?.filter((d) => d.art === art).length ?? 0;
    const budskab = !valgt ? undefined : !diff ? undefined
        : input.data!.length === 0 ? "Kørslen har intet frosset input (kørt før frysningen fandtes) — den kan ikke sammenlignes."
        : diff.length === 0
            ? `Værkets blade er uændrede siden kørslen (revision ${valgt.vaerk_revision}) — med samme model- og datacommit kan resultatet genskabes.`
            : `${diff.length} ${diff.length === 1 ? "blad er" : "blade er"} ændret siden kørslen (revision ${valgt.vaerk_revision} → ${vaerk.revision}): ${n("ændret")} ændret, ${n("tilføjet")} tilføjet, ${n("fjernet")} fjernet.`;

    return (
        <>
            <Gitter form="4-8">
                <Kort titel="Kørsler" afgraensning="af dette værk" budskab={koersler.data ? (koersler.data.length ? `${koersler.data.length} kørsler; vælg én at sammenligne med.` : "Værket er ikke kørt endnu.") : undefined}
                    fod="Sammenligningen bruger kørslens frosne input (KoerselInput, kilde = værk).">
                    <DataTilstand h={koersler}>
                        {(rk) => (
                            <Tabel rækker={rk} nøgle={(k) => k.id} valgt={valgt?.id} onVælg={(k) => gåTil(`konfiguration/${vaerk.kode}/aendringer/${k.id}`)}
                                tom="Ingen kørsler."
                                kolonner={[
                                    { navn: "Bestilt", vis: (k) => tidspunkt(k.bestilt) },
                                    { navn: "Status", vis: (k) => <StatusMaerke status={k.status} /> },
                                    { navn: "Rev.", vis: (k) => k.vaerk_revision, tal: true },
                                ]} />
                        )}
                    </DataTilstand>
                </Kort>
                <Kort titel="Ændringer siden kørslen" afgraensning={valgt ? `${tidspunkt(valgt.bestilt)} · revision ${valgt.vaerk_revision}` : "ingen kørsel valgt"} budskab={budskab}
                    fod={valgt ? <>Model {valgt.model_commit?.slice(0, 7) ?? "–"} · data {valgt.data_commit?.slice(0, 7) ?? "–"}. Tekstlig sammenligning: 12 og 12,0 er forskellige værdier for modellen.</> : undefined}>
                    {valgt ? (
                        <DataTilstand h={input}>
                            {() => (
                                <Tabel rækker={diff ?? []} nøgle={(d) => d.sti} tom="Ingen forskelle."
                                    kolonner={[
                                        { navn: "Felt", vis: (d) => <>{etiket(d.sti) && <span className="kf-feltnavn">{etiket(d.sti)}</span>}<div className="kf-sti">{d.sti}</div></> },
                                        { navn: "Ændring", vis: (d) => <Maerke tone={d.art === "fjernet" ? "fejl" : d.art === "tilføjet" ? "ok" : "advarsel"}>{d.art}</Maerke> },
                                        { navn: "Ved kørslen", vis: (d) => <span className="kf-vaerdi" data-lang="true">{d.før == null ? "–" : visFelt(d.før)}</span>, tal: true },
                                        { navn: "Nu", vis: (d) => <span className="kf-vaerdi" data-lang="true">{d.nu == null ? "–" : visFelt(d.nu)}</span>, tal: true },
                                    ]} />
                            )}
                        </DataTilstand>
                    ) : <p className="fjv-tilstand">Værket er ikke kørt endnu.</p>}
                </Kort>
            </Gitter>
            {valgt && tillæg.length > 0 && (
                <Gitter>
                    <Kort titel="Kørslens tillæg" afgraensning="scenariets ændringer og særlige felter"
                        budskab={`Kørslen lagde ${tillæg.length} ${tillæg.length === 1 ? "værdi" : "værdier"} oven i værket.`}
                        fod="_koersel.* er kommandolinjeflag (periode, balancering); de øvrige er case-stier, som erstattede værkets værdi.">
                        <Tabel rækker={tillæg} nøgle={(r) => `${r.kilde}:${r.sti}`}
                            kolonner={[
                                { navn: "Kilde", vis: (r) => <Maerke>{r.kilde === "aendring" ? "ændring" : r.kilde}</Maerke> },
                                { navn: "Sti", vis: (r) => <span className="kf-sti">{r.sti}</span> },
                                { navn: "Værdi", vis: (r) => <span className="kf-vaerdi" data-lang="true">{visFelt(r.vaerdi_json)}</span>, tal: true },
                            ]} />
                    </Kort>
                </Gitter>
            )}
        </>
    );
}

// ------------------------------------------------------------------ kildefil

export function Kildefil({ vaerk, blade }: { vaerk: VaerkInfo; blade: readonly Blad[] }) {
    const kilde = useKildeYaml(vaerk.id);
    const [rekonstrueret, setRekonstrueret] = useState(false);
    const yaml = useMemo(() => rekonstruerYaml(blade, [
        `Rekonstrueret af appen ud fra databasens blade — værk ${vaerk.kode}, revision ${vaerk.revision}.`,
        "Kommentarerne er dem, importen gemte pr. felt; sektionsoverskrifter fra den oprindelige fil er ikke med.",
    ]), [blade, vaerk.kode, vaerk.revision]);
    const original = kilde.data?.ok ? kilde.data.tekst : undefined;
    const vis = rekonstrueret || !original ? yaml : original;
    const budskab = kilde.data === undefined && !kilde.fejl ? undefined
        : original && !rekonstrueret
            ? `Den oprindelige ${vaerk.kilde_fil ?? "kildefil"} (${(kilde.data!.bytes ?? original.length).toLocaleString("da-DK")} tegn)${vaerk.revision > 1 ? ` — værket er siden ændret (revision ${vaerk.revision}); den rekonstruerede viser de nuværende værdier.` : "; værket er uændret siden importen."}`
            : `Rekonstrueret YAML med de nuværende værdier (${blade.length} felter)${original ? "." : ` — ${kilde.data?.fejl ?? kilde.fejl?.message ?? "der er ingen oprindelig kildefil"}.`}`;
    return (
        <Gitter>
            <Kort titel="Kildefil" afgraensning={original && !rekonstrueret ? "som importeret" : "rekonstrueret"} budskab={budskab}
                handling={original ? <label className="kf-kontakt"><input type="checkbox" checked={rekonstrueret} onChange={(e) => setRekonstrueret(e.target.checked)} />Vis rekonstrueret</label> : undefined}
                fod="Kun til visning. Ændringer laves i fanerne; den oprindelige fil i lakehouset røres aldrig.">
                {kilde.data === undefined && !kilde.fejl ? <div className="fjv-skelet" style={{ height: 240 }} aria-busy="true" /> : <pre className="kf-pre" data-layout="kildefil">{vis}</pre>}
            </Kort>
        </Gitter>
    );
}
