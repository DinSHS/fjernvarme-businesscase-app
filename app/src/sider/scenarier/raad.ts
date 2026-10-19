//-----------------------------------------------------------------------
// Et råd til en fejlet kørsel, ud fra fejlbeskeden. Teksterne er kogt ned fra
// viden/validering.md (fv-ekspert) — kilden står ved hvert råd. Fejlbeskeden
// selv vises altid ordret; rådet står under den.
//-----------------------------------------------------------------------

export interface Råd { tekst: string; kilde: string }

const RÅD: readonly { mønster: RegExp; råd: Råd }[] = [
    {
        mønster: /CoverageError|dækning|daekning|d.kker ikke/i,
        råd: {
            tekst: "Data dækker ikke hele perioden. Med balancering skal perioden ligge efter 4. marts 2025; DMI-områderne fyn og vestkyst mangler timer 28. februar 2026 (fyn også 1. januar 2026); df-data opdateres mandage, så de seneste dage mangler. Vælg en anden periode.",
            kilde: "validering.md §2",
        },
    },
    {
        mønster: /infeasible|kan ikke l.ses|ul.selig/i,
        råd: {
            tekst: "Modellen kunne ikke finde en drift, der dækker varmebehovet. Typiske årsager: driven-blokke større end eleffekten, driven uden tank om sommeren, eller kedler tændt ved start med minimumslast. Slår scenariet en enhed eller tanken fra, så prøv uden — eller sæt initial_status 0 på kedlerne i værket.",
            kilde: "validering.md §11 (src/solve.py:128-140)",
        },
    },
    {
        mønster: /hjerteslag|stoppede uden at afslutte/i,
        råd: {
            tekst: "Beregningen stoppede uden at melde tilbage — fx fordi kapaciteten blev sat på pause, eller jobbet blev stoppet i Fabric. Bestil kørslen igen.",
            kilde: "KONTRAKT §6",
        },
    },
    {
        mønster: /Ingen aktive produktionsenheder/i,
        råd: { tekst: "Scenariet slår alle enheder fra. Lad mindst én enhed være slået til.", kilde: "validering.md §5 (src/model.py:150)" },
    },
    {
        mønster: /production_profile|produktionsprofil|profil(en)? (mangler|d.kker)/i,
        råd: { tekst: "Produktionsprofilen (fx solvarme) dækker ikke perioden. Vælg en periode inden for profilens dækning.", kilde: "validering.md §2 (src/data_loader.py:996-1010)" },
    },
    {
        mønster: /heat.?csv|varmelastfil|Heat-CSV/i,
        råd: { tekst: "Varmelastfilen findes ikke eller passer ikke til perioden. Vælg en fil fra listen — Billunds målinger passer kun til Billund-værkerne.", kilde: "validering.md §9" },
    },
    {
        mønster: /TypeError|KeyError|ukendte? (n.gler|felt)/i,
        råd: { tekst: "Værket har et ukendt eller manglende felt. Ret værket under Konfiguration, og bestil igen.", kilde: "validering.md, indledningen" },
    },
    {
        mønster: /RuntimeError|netv.rk|klon/i,
        råd: { tekst: "Hentningen af df-data fejlede. Det er som regel forbigående — bestil igen om lidt.", kilde: "validering.md §11 (src/data_loader_github.py:123)" },
    },
];

/** Det, rådet kan målrettes efter: kørslens periode, balancering og værkets DMI-område. */
export interface Rådkontekst { medBalancering: boolean; start?: string; slut?: string; dmi?: string }

/**
 * Ved en dækningsfejl: de årsager, der faktisk passer på kørslen, i rækkefølge (validering.md §2,
 * 09_datadaekning.md). Tom liste = ingen af de kendte huller rammer perioden.
 */
export function dækningsårsager(k: Rådkontekst): string[] {
    const ud: string[] = [];
    const { start, slut } = k;
    if (!start || !slut) return ud;
    if (k.medBalancering && start < "2025-03-04") ud.push("Perioden begynder før 4. marts 2025, hvor ubalance- og mFRR-data begynder; med balancering skal perioden ligge efter.");
    if (k.medBalancering && slut >= "2026-09-04") ud.push("aFRR-data har et hul fra 4. september 2026; balancekørsler efter den dato stopper.");
    if ((k.dmi === "fyn" || k.dmi === "vestkyst") && start <= "2026-02-28" && "2026-02-28" <= slut) ud.push(`DMI-området ${k.dmi} mangler timer 28. februar 2026.`);
    if (k.dmi === "fyn" && start <= "2026-01-01" && "2026-01-01" <= slut) ud.push("DMI-området fyn mangler timer 1. januar 2026.");
    return ud;
}

export function rådFor(fejlbesked: string | null | undefined, kontekst?: Rådkontekst): Råd | undefined {
    if (!fejlbesked) return undefined;
    const r = RÅD.find((x) => x.mønster.test(fejlbesked))?.råd;
    if (r && r === RÅD[0].råd && kontekst) {
        const årsager = dækningsårsager(kontekst);
        if (årsager.length) return { tekst: `${årsager.join(" ")} Vælg en anden periode.`, kilde: r.kilde };
    }
    return r;
}
