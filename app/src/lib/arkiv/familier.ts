//-----------------------------------------------------------------------
// Scenarie-familier (runde 13): arkivets enhed. Let modul uden xlsx/fflate, så siderne kan bruge det uden at
// hente regnearkskoden (den lazy-loades først ved eksport/import).
//-----------------------------------------------------------------------

import { ArkivAfvisning } from "../../../rayfin/functions/src/arkiv";
/** Det, familierne bygges af (Scenarie-rækken eller arkivets). */
export interface ScenarieNøgle { id: string; reference_scenarie_id?: string | null; navn: string }

/** Scenarie-familierne: sammenhængende grupper via reference_scenarie_id (begge veje). Sorteret efter navn. */
export function familier(scenarier: readonly ScenarieNøgle[]): string[][] {
    const naboer = new Map<string, Set<string>>(scenarier.map((s) => [s.id, new Set<string>()]));
    for (const s of scenarier) {
        if (s.reference_scenarie_id && naboer.has(s.reference_scenarie_id)) {
            naboer.get(s.id)!.add(s.reference_scenarie_id);
            naboer.get(s.reference_scenarie_id)!.add(s.id);
        }
    }
    const navn = new Map(scenarier.map((s) => [s.id, s.navn]));
    const set = new Set<string>();
    const ud: string[][] = [];
    for (const s of scenarier) {
        if (set.has(s.id)) continue;
        const gruppe: string[] = [];
        const kø = [s.id];
        while (kø.length) {
            const x = kø.pop()!;
            if (set.has(x)) continue;
            set.add(x);
            gruppe.push(x);
            kø.push(...naboer.get(x)!);
        }
        ud.push(gruppe.sort((a, b) => navn.get(a)!.localeCompare(navn.get(b)!, "da")));
    }
    return ud.sort((a, b) => navn.get(a[0])!.localeCompare(navn.get(b[0])!, "da"));
}

/** Et scenaries familie (inkl. referencekæden og scenarier, der bruger det som reference). */
export function familieFor(id: string, scenarier: readonly ScenarieNøgle[]): string[] {
    const f = familier(scenarier).find((g) => g.includes(id));
    if (!f) throw new ArkivAfvisning(`Scenariet ${id} findes ikke.`);
    return f;
}
