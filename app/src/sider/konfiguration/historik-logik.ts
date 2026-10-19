// Ren logik til revisionsloggen (testet).

export interface LogRække { id: string; revision: number; sti: string; handling: string; gammel_json?: string | null; ny_json?: string | null; aendret_af: string; tidspunkt: Date | string }

export interface Revision { revision: number; tid: Date | string; af: string; antal: number; resume: string }

/** Én række pr. revision, nyeste først, med et kort resumé ("3 ret, 1 opret i units.halmkedel"). */
export function revisioner(log: readonly LogRække[]): Revision[] {
    const m = new Map<number, LogRække[]>();
    for (const r of log) m.set(r.revision, [...(m.get(r.revision) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([revision, rk]) => {
        const tæl = new Map<string, number>();
        for (const r of rk) tæl.set(r.handling, (tæl.get(r.handling) ?? 0) + 1);
        const objekter = [...new Set(rk.map((r) => r.sti.split(".").slice(0, r.sti.startsWith("units.") || r.sti.startsWith("storage.") ? 2 : 1).join(".")))];
        const hvor = objekter.length <= 2 ? ` i ${objekter.join(", ")}` : ` i ${objekter.length} afsnit`;
        return {
            revision, tid: rk[0].tidspunkt, af: rk[0].aendret_af, antal: rk.length,
            resume: `${[...tæl].map(([h, n]) => `${n} ${h}`).join(", ")}${revision === 1 && tæl.get("opret") === rk.length ? " (import)" : hvor}`,
        };
    });
}

/** Filtrerer på sti/enhed (delstreng, uden forskel på store/små bogstaver); importen (revision 1) kun på ønske. */
export function filtrerLog<T extends LogRække>(log: readonly T[], filter: string, medImport: boolean): T[] {
    const f = filter.trim().toLowerCase();
    return log.filter((r) => (medImport || r.revision > 1) && (!f || r.sti.toLowerCase().includes(f)));
}
