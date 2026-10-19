//-----------------------------------------------------------------------
// Redigeringstilstand for ét værk: udkast, validering af udkastet og
// afsendelse som ÉN anmodning (gemVaerksaendringer) med værkets revision.
//-----------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import { gemVaerksaendringer, type Parameterændring } from "@/lib/data/skriv";
import { opdaterAlt } from "@/lib/data/opdatering";
import { opslag, type Blad } from "./gruppering";
import { validerVaerk, type Fund } from "./validering";
import { anmodningsLængde, anvend, ændringerFraUdkast, MAKS_ANMODNING, type Kladde } from "./redigering";

export interface Svar { tone: "ok" | "fejl"; tekst: string; konflikt?: boolean }

const nøgle = (f: Fund) => `${f.sti}|${f.besked}`;

/** Fejl der findes efter ændringerne, men ikke før — kun de blokerer (et importeret værk med en arvet fejl kan stadig rettes). */
export function nyeFejl(før: readonly Fund[], efter: readonly Fund[]): Fund[] {
    const gamle = new Set(før.filter((f) => f.alvor === "fejl").map(nøgle));
    return efter.filter((f) => f.alvor === "fejl" && !gamle.has(nøgle(f)));
}

export function useRedigering(vaerk: { id: string; revision: number } | undefined, blade: readonly Blad[] | undefined, bruger: string | undefined) {
    const [aktiv, setAktiv] = useState(false);
    const [udkast, setUdkast] = useState<Map<string, Kladde>>(new Map());
    const [svar, setSvar] = useState<Svar | undefined>();
    const [sender, setSender] = useState(false);

    const nu = useMemo(() => opslag(blade ?? []), [blade]);
    const grundFund = useMemo(() => validerVaerk(nu), [nu]);
    const { ændringer, fejl: inputFejl } = useMemo(() => ændringerFraUdkast(udkast, nu), [udkast, nu]);
    const effektiv = useMemo(() => anvend(nu, ændringer), [nu, ændringer]);
    const fund = useMemo(() => (ændringer.length ? validerVaerk(effektiv) : grundFund), [ændringer, effektiv, grundFund]);
    const blokerende = useMemo(() => nyeFejl(grundFund, fund), [grundFund, fund]);

    const sæt = useCallback((sti: string, k: Kladde | null) => {
        setUdkast((m) => { const n = new Map(m); if (k) n.set(sti, k); else n.delete(sti); return n; });
    }, []);

    /** Sender ændringer som én anmodning. Returnerer true ved succes. */
    const send = useCallback(async (æ: readonly Parameterændring[]): Promise<boolean> => {
        if (!vaerk) return false;
        setSvar(undefined);
        if (anmodningsLængde(æ) > MAKS_ANMODNING) {
            setSvar({ tone: "fejl", tekst: `For mange ændringer i én gem (over ${MAKS_ANMODNING} tegn). Gem i flere omgange.` });
            return false;
        }
        setSender(true);
        try {
            const r = await gemVaerksaendringer(vaerk, æ, bruger);
            if (r.ok && r.status === "udfoert") {
                setSvar({ tone: "ok", tekst: `${r.svar}${r.revision ? ` Værket er nu revision ${r.revision}.` : ""}` });
                opdaterAlt();
                return true;
            }
            // Ordret fra udfoerAendring — fx revisionskonflikten.
            setSvar({ tone: "fejl", tekst: r.svar || "Ændringen blev afvist.", konflikt: /revision/i.test(r.svar ?? "") });
            return false;
        } catch (e) {
            setSvar({ tone: "fejl", tekst: e instanceof Error ? e.message : String(e) });
            return false;
        } finally {
            setSender(false);
        }
    }, [vaerk, bruger]);

    const gem = useCallback(async () => {
        if (await send(ændringer)) { setUdkast(new Map()); setAktiv(false); }
    }, [send, ændringer]);

    const start = useCallback(() => { setAktiv(true); setSvar(undefined); }, []);
    const fortryd = useCallback(() => { setUdkast(new Map()); setAktiv(false); setSvar(undefined); }, []);

    return {
        red: { aktiv, udkast, sæt },
        ændringer, inputFejl, fund, grundFund, blokerende, effektiv, nu,
        svar, sender, send, gem, start, fortryd, setSvar,
    };
}

export type RedigeringsTilstand = ReturnType<typeof useRedigering>;
