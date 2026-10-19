//-----------------------------------------------------------------------
// Intervaldispatch-kortet: vælg et vindue (≤ 31 døgn, KONTRAKT §3.10) og se
// stablet varmeproduktion pr. enhed, varmelast, tankniveau og spotpris med
// fælles tidsakse. Med en anden kørsel (b) vises to paneler på SAMME skala.
//-----------------------------------------------------------------------

import { useMemo, useState } from "react";
import { DataTilstand, Kort, Tabel } from "@/components/layout";
import { useTimer } from "@/lib/data/hooks";
import { tal } from "@/lib/format";
import { balanceIVindue, dispatchPunkter, vinduer, type DispatchPunkt, type Time } from "./beregn";
import type { Pakke } from "./data";
import { N_MINUS_1 } from "./tekster";
import { dec } from "./fmt";
import { dispatchSkala } from "./graf-hjaelp";
import { Dispatch, Forklaring, LagerForklaring, type Serie } from "./grafer";

function energiPrEnhed(p: readonly DispatchPunkt[]): Map<string, number> {
    const m = new Map<string, number>();
    const dt = p.length > 1 ? (p[1].tid.getTime() - p[0].tid.getTime()) / 3_600_000 : 1;
    for (const x of p) for (const [n, v] of Object.entries(x.prod)) m.set(n, (m.get(n) ?? 0) + v * dt);
    return m;
}

function vinduesBudskab(p: readonly DispatchPunkt[], vindue: string): string {
    if (p.length === 0) return `Ingen intervaldata i ${vindue.toLowerCase()}.`;
    const e = energiPrEnhed(p);
    const total = [...e.values()].reduce((a, b) => a + b, 0);
    const [størst] = [...e.entries()].sort((a, b) => b[1] - a[1]);
    const spot = p.map((x) => x.spot).filter((v): v is number => v != null);
    const dele: string[] = [];
    if (størst && total > 0) dele.push(`${størst[0]} dækker ${dec((størst[1] / total) * 100, 0)} % af varmen`);
    if (spot.length) dele.push(`spotprisen ligger mellem ${tal(Math.min(...spot))} og ${tal(Math.max(...spot))} kr./MWh`);
    return `${vindue}: ${dele.join("; ")}.`;
}

export default function DispatchKort({ a, b, pladser }: { a: Pakke; b?: Pakke; pladser: Map<string, number> }) {
    const valg = useMemo(() => vinduer(a.profil.periode_start, a.profil.periode_slut), [a.profil.periode_start, a.profil.periode_slut]);
    const [i, setI] = useState(0);
    const v = valg[Math.min(i, valg.length - 1)];
    const ta = useTimer(a.k.id, v?.fra, v?.til);
    const tb = useTimer(b?.k.id, v?.fra, v?.til);
    const pa = useMemo(() => dispatchPunkter(ta.data ?? []), [ta.data]);
    const pb = useMemo(() => dispatchPunkter(tb.data ?? []), [tb.data]);
    const skala = useMemo(() => dispatchSkala(pa, pb), [pa, pb]);

    // Stablingsorden: største producent i perioden nederst (begge kørsler).
    const producenter = useMemo(() => {
        const sum = new Map<string, number>();
        for (const e of [...a.samlet.enheder, ...(b?.samlet.enheder ?? [])]) sum.set(e.navn, (sum.get(e.navn) ?? 0) + (e.produktion_mwh ?? 0));
        for (const p of [...pa, ...pb]) for (const n of Object.keys(p.prod)) if (!sum.has(n)) sum.set(n, 0);
        return [...sum.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([navn]): Serie => ({ navn, plads: pladser.get(navn) ?? 0 }));
    }, [a.samlet.enheder, b?.samlet.enheder, pa, pb, pladser]);
    const lagre = useMemo(() => [...new Set([...a.samlet.lagre.map((l) => l.navn), ...(b?.samlet.lagre.map((l) => l.navn) ?? [])])], [a.samlet.lagre, b?.samlet.lagre]);

    const bal = useMemo(() => (b || !a.samlet.balance ? null : balanceIVindue((ta.data ?? []) as Time[])), [a.samlet.balance, b, ta.data]);

    const budskab = !v ? "Kørslen har ingen kendt periode — intervaldata kan ikke vises." : ta.data
        ? b ? (() => {
            const ea = energiPrEnhed(pa), eb = energiPrEnhed(pb);
            const navne = [...new Set([...ea.keys(), ...eb.keys()])];
            const ds = navne.map((n) => [n, (eb.get(n) ?? 0) - (ea.get(n) ?? 0)] as const).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
            if (!ds.length || Math.abs(ds[0][1]) < 0.5) return `${v.etiket}: samme dispatch i begge kørsler.`;
            return `${v.etiket}: største forskel er ${ds[0][0]} med ${ds[0][1] > 0 ? "+" : "−"}${tal(Math.abs(ds[0][1]))} MWh i scenariet.`;
        })() : vinduesBudskab(pa, v.etiket)
        : undefined;

    return (
        <Kort titel="Intervaldispatch" afgraensning={b ? "samme vindue og samme skala i begge kørsler" : "pr. interval, dansk tid"}
            budskab={budskab}
            handling={valg.length > 0 && (
                <div className="fjv-a-filtre"><label>Vindue
                    <select className="fjv-felt" value={Math.min(i, valg.length - 1)} onChange={(e) => setI(Number(e.target.value))}>
                        {valg.map((x, j) => <option key={x.etiket} value={j}>{x.etiket}</option>)}
                    </select>
                </label></div>
            )}
            fod={<>{N_MINUS_1} Vinduet hentes for sig (højst 31 døgn ad gangen). Hold markøren over grafen for tal.</>}>
            <Forklaring serier={producenter} ekstra={<><span><i className="fjv-a-streg" />Varmelast</span><LagerForklaring lagre={lagre} /></>} />
            {!b && (
                <DataTilstand h={ta} højde={320}>
                    {() => pa.length ? <Dispatch punkter={pa} enheder={producenter} lagre={lagre} skala={skala} /> : <p className="fjv-tilstand">Ingen intervaldata i vinduet.</p>}
                </DataTilstand>
            )}
            {b && (
                <div className="fjv-a-to">
                    <div>
                        <div className="fjv-a-panel-titel">Reference</div>
                        <DataTilstand h={ta} højde={320}>
                            {() => pa.length ? <Dispatch punkter={pa} enheder={producenter} lagre={lagre} skala={skala} /> : <p className="fjv-tilstand">Ingen intervaldata i vinduet.</p>}
                        </DataTilstand>
                    </div>
                    <div>
                        <div className="fjv-a-panel-titel">Scenarie</div>
                        <DataTilstand h={tb} højde={320}>
                            {() => pb.length ? <Dispatch punkter={pb} enheder={producenter} lagre={lagre} skala={skala} /> : <p className="fjv-tilstand">Ingen intervaldata i vinduet.</p>}
                        </DataTilstand>
                    </div>
                </div>
            )}
            {bal && (
                <>
                    <div className="fjv-a-panel-titel">Balanceindtægt i vinduet, pr. marked og produkt (kr.)</div>
                    <Tabel rækker={[["aFRR", bal.afrr], ["mFRR", bal.mfrr]] as const} nøgle={(r) => r[0]} kolonner={[
                        { navn: "Marked", vis: (r) => r[0] },
                        { navn: "Kapacitet", vis: (r) => tal(r[1].kapacitet), tal: true },
                        { navn: "Aktivering, netto", vis: (r) => tal(r[1].aktivering_netto), tal: true },
                        { navn: "Aktivering, brutto", vis: (r) => tal(r[1].aktivering_brutto), tal: true },
                    ]} />
                </>
            )}
        </Kort>
    );
}
