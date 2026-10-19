// Ren logik til værksoversigten (testet).

/** Seneste kørsel pr. værk (efter bestillingstidspunkt). */
export function senesteKoersel<K extends { vaerk_id: string; bestilt: Date | string }>(koersler: readonly K[]): Map<string, K> {
    const m = new Map<string, K>();
    for (const k of koersler) {
        const f = m.get(k.vaerk_id);
        if (!f || +new Date(k.bestilt) > +new Date(f.bestilt)) m.set(k.vaerk_id, k);
    }
    return m;
}
