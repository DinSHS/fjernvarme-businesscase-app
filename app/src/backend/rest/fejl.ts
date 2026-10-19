//-----------------------------------------------------------------------
// Community-udgaven: serverens fejl er allerede danske (`{ fejl: { kode, besked } }`), så de gives uændret videre.
//-----------------------------------------------------------------------

export async function berigFejl(fejl: unknown): Promise<Error> {
    return fejl instanceof Error ? fejl : new Error(String(fejl));
}
