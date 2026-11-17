//-----------------------------------------------------------------------
// Timeresultater for brede værker (runde 14b, skemaversion 2).
//
// KoerselTime.vaerdier_json kan højst være 4000 tegn. Målt ved 90fb16e fylder
// et værk med 40 elenheder og balancemarked ca. 21.000 tegn i én time, så
// notebooken deler timen: KoerselTime har de første kolonner, KoerselTimeDel
// resten som del 1, 2, … (fjv.resultater.del_op). Her sættes de sammen igen,
// så resten af appen ser én vaerdier_json pr. interval, som før.
//
// Sammensætningen sker på TEKSTEN: hver del er et kompakt JSON-objekt, og
// objekterne lægges sammen ved at forbinde deres indhold. Så når -0.0, 1.0 og
// 17 cifre frem som i modellens fil; JSON.parse + JSON.stringify ville skrive
// -0.0 som 0 og 1.0 som 1.
//
// Delene læses kun, når kørslens manifest_json har `time_dele` > 0: en smal
// kørsel koster ingen ekstra forespørgsel, og en Fabric-database, der endnu
// ikke har tabellen (skemaet er ikke udrullet), virker for alt andet.
//-----------------------------------------------------------------------

import type { FjvSchema } from "../../../rayfin/data/schema";
import { læs } from "./laes";

type Time = FjvSchema["KoerselTime"];
type TimeDel = FjvSchema["KoerselTimeDel"];

/** Antal KoerselTimeDel-rækker, kørslen har (`manifest_json.time_dele`); 0 for smalle og ældre kørsler. */
export function timedeleAntal(manifestJson: string | null | undefined): number {
    if (!manifestJson) return 0;
    try {
        const n = (JSON.parse(manifestJson) as { time_dele?: unknown }).time_dele;
        return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
    } catch {
        return 0;
    }
}

function indhold(json: string, hvor: string): string {
    if (!json.startsWith("{") || !json.endsWith("}")) throw new Error(`Intervaldata ${hvor} er ikke et JSON-objekt.`);
    return json.slice(1, -1);
}

/**
 * Sætter hvert intervals dele sammen: `{...KoerselTime.vaerdier_json, ...del 1, ...del 2, …}` som tekst. Intervaller
 * uden dele returneres uændret. Et hul i delene eller en del uden sit interval er en fejl, ikke et halvt interval.
 */
export function fletTimedele<T extends Pick<Time, "tid" | "vaerdier_json">>(timer: readonly T[], dele: readonly Pick<TimeDel, "tid" | "delnr" | "vaerdier_json">[]): T[] {
    if (dele.length === 0) return [...timer];
    const pr = new Map<number, Pick<TimeDel, "delnr" | "vaerdier_json">[]>();
    for (const d of dele) {
        const k = d.tid.getTime();
        pr.set(k, [...(pr.get(k) ?? []), d]);
    }
    const ud = timer.map((r) => {
        const mine = pr.get(r.tid.getTime());
        if (!mine) return r;
        pr.delete(r.tid.getTime());
        const hvor = r.tid.toISOString();
        const sorteret = [...mine].sort((a, b) => a.delnr - b.delnr);
        sorteret.forEach((d, i) => {
            if (d.delnr !== i + 1) throw new Error(`Intervaldata kl. ${hvor} er ufuldstændige: del ${i + 1} mangler.`);
        });
        const stykker = [indhold(r.vaerdier_json, `kl. ${hvor}`), ...sorteret.map((d) => indhold(d.vaerdier_json, `kl. ${hvor}, del ${d.delnr}`))]
            .filter((s) => s.length > 0);
        return { ...r, vaerdier_json: `{${stykker.join(",")}}` };
    });
    if (pr.size) {
        const t = new Date(Math.min(...pr.keys())).toISOString();
        throw new Error(`Intervaldata: en del kl. ${t} står uden sit interval.`);
    }
    return ud;
}

/**
 * Intervaldispatch i [fra, til) for én kørsel - KoerselTime og, for et bredt værk, KoerselTimeDel - sat sammen.
 * Kalderen sørger for vinduet (KONTRAKT §3.10: aldrig hele året); se `useTimer`.
 */
export async function læsTimer(koersel: Pick<FjvSchema["Koersel"], "id" | "manifest_json">, fra: Date, til: Date): Promise<Time[]> {
    const filter = { and: [{ koersel_id: { eq: koersel.id } }, { tid: { gte: fra } }, { tid: { lt: til } }] };
    const timer = await læs("KoerselTime", { filter, sortering: { tid: "asc" }, sidestørrelse: 1000 });
    if (timedeleAntal(koersel.manifest_json) === 0) return timer;
    const dele = await læs("KoerselTimeDel", { filter, sortering: { tid: "asc" }, sidestørrelse: 1000 });
    return fletTimedele(timer, dele);
}
