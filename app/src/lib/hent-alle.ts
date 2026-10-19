//-----------------------------------------------------------------------
// Henter ALLE rækker fra en Rayfin-entitet.
//
// ⚠️ Der SKAL pagineres: `execute()` sender ingen `first:` og får derfor kun
// DAB's standardside på 100 rækker — et værk har ~300 parametre, og en kørsel
// op til 35.039 intervaller. Der løkkes til `hasNextPage` er falsk, med et loft
// så en server der altid svarer `hasNextPage = true` ikke hænger appen.
//-----------------------------------------------------------------------

/** Den del af Rayfins forespørgselsbygger vi bruger — strukturelt, så den kan testes. */
export interface Sideforespørgsel<T> {
    first(n: number): Sideforespørgsel<T>;
    after(markør: string): Sideforespørgsel<T>;
    executePaginated(): Promise<{ items: T[]; hasNextPage: boolean; endCursor?: string | null }>;
}

/** DAB tillader op til 100.000 pr. side; 500 holder svarene små og antallet af kald lavt. */
export const SIDESTØRRELSE = 500;
export const MAKS_SIDER = 500;

export async function hentAlle<T>(start: () => Sideforespørgsel<T>, sidestørrelse = SIDESTØRRELSE): Promise<T[]> {
    const alle: T[] = [];
    let markør: string | undefined;

    for (let side = 0; side < MAKS_SIDER; side++) {
        let f = start().first(sidestørrelse);
        if (markør) f = f.after(markør);

        const svar = await f.executePaginated();
        alle.push(...svar.items);

        if (!svar.hasNextPage || !svar.endCursor) return alle;
        markør = svar.endCursor;
    }

    throw new Error(
        `Kunne ikke hente alle rækker: stoppede efter ${MAKS_SIDER} sider (${alle.length} rækker). ` +
        `Svarer serveren altid hasNextPage?`,
    );
}
