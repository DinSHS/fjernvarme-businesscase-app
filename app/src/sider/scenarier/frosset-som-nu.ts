//-----------------------------------------------------------------------
// Er det, der NU skal bestilles, det samme som en ældre kørsels FROSNE input?
//
// Fjerde rettelsesrunde i runde 15, punkt 2. Et bestillingsforsøg husker et fingeraftryk af det, klienten SÅ, da der
// blev klikket (logik.ts › bestillingsaftryk). Serveren fryser det, der er GEMT. Er scenariet gemt i en anden fane
// inden klikket, er de to forskellige: fanen husker A, kørslen fryser B. Efter en genindlæsning ser klienten B, tror
// indholdet er ændret siden forsøget og bestilte før en kørsel mere — med samme indhold som den første.
//
// Aftrykket er derfor kun en formodning. Beviset er kørslens frosne input, sammenlignet på samme måde som genbrug af
// en reference (NytScenarie.tsx › useGenbrugeligReference): klientens forudsigelse af de frosne ikke-værks-rækker
// (`forventetFrosset`) over for kørslens (`frosset`, uden pins), og samme værksrevision — værkets blade fryses ved
// revisionen. Motorens pins er ikke med, som de heller ikke er i aftrykket: en genoptaget bestilling får også den
// kørsel, der står, uanset pins.
//
// Værkets tidsserier hentes her, ved klikket, og ikke fra sidens tilstand: de aktive serier fryses med, og
// prøvekørslens side kender dem ikke.
//
// KASTER, når kørslen eller dens input ikke kan læses. "Ved ikke" er hverken ens eller forskelligt: ens ville
// kvittere for en kørsel af noget andet, forskelligt ville give to kørsler af det samme.
//-----------------------------------------------------------------------

import { læs, læsÉn } from "@/lib/data/laes";
import { forventetFrosset, frosset, sammeKort, type Blade, type Scenariefelter, type Ændring } from "./logik";

export async function frossetSomNu(
    koerselId: string, vaerk: { id: string; revision: number }, ændringer: readonly Ændring[], felter: Scenariefelter, blade: Blade,
): Promise<boolean> {
    const [kørsel, rækker, serier] = await Promise.all([
        læsÉn("Koersel", koerselId),
        læs("KoerselInput", { filter: { koersel_id: { eq: koerselId } } }),
        læs("Tidsserie", { filter: { vaerk_id: { eq: vaerk.id } } }),
    ]);
    // Enhver bestilling fryser mindst `_koersel.med_balancering`; en kørsel uden rækker er ikke læst, ikke tom.
    if (!kørsel || !rækker.length) throw new Error("kørslens frosne input findes ikke eller kan ikke læses");
    if (kørsel.vaerk_revision !== vaerk.revision) return false;
    return sammeKort(forventetFrosset(ændringer, felter, blade, serier), frosset(rækker));
}
