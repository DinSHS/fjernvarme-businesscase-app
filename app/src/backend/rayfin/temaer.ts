//-----------------------------------------------------------------------
// Fabric-udgaven: de LOKALE temaer fra src/styles/temaer/privat/ (en installations eget tema og uofficielle temaer; mappen er
// git-ignoreret). Findes mappen ikke, er listen bare tom, og standarden falder til de neutrale temaer.
//-----------------------------------------------------------------------

import type { TemaFil } from "@/styles/tema-kerne";

export const UDGAVETEMAER: readonly TemaFil[] = Object.values(
    import.meta.glob<TemaFil>("../../styles/temaer/privat/*.json", { eager: true, import: "default" }),
);
