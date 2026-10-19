//-----------------------------------------------------------------------
// Faste koordinater for de betroede funktioner — SKABELON til den offentlige udgave.
//
// Denne fil erstatter `app/rayfin/functions/src/konfig.ts` i den offentlige eksport
// (offentlig/regler.json -> "erstat"). Den rigtige fil indeholder en installations
// workspace-, database-, notebook- og lakehouse-id'er og er privat for den installation.
//
// Fabric-adapteren (Rayfin Functions) er kun relevant, hvis du kører kernen i Microsoft
// Fabric. Community-udgaven bruger i stedet REST-backenden i `community/` og læser ikke
// denne fil. Udfyld værdierne ved din egen udrulning; en tom streng betyder "ikke sat",
// og de betroede funktioner afviser så at køre i stedet for at gætte.
//-----------------------------------------------------------------------

export const WORKSPACE_ID = "";

/** Appens egen SQL-database. */
export const SQL_SERVER = "";
export const SQL_DATABASE = "";

/** Notebook-item'et der arbejder køen (`fjv_koer_scenarie`). Tom = ingen arbejder startes automatisk. */
export const ARBEJDER_NOTEBOOK_ID = "";

/**
 * Det faste id på Motor-tabellens ene række. SKAL være lig MOTOR_ID i rayfin/data/fjv.constants.ts —
 * rayfin/functions/test/registrering.spec.ts kontrollerer det. Ikke tenant-specifikt.
 */
export const MOTOR_ID = "00000000-0000-4000-8000-00000000f001";

export const FABRIC_API = "https://api.fabric.microsoft.com/v1";

/** Lakehouse `fjv_lakehouse`: `Files/fjv/vaerker/<kode>/kilde.yaml` = værkets oprindelige YAML. */
export const LAKEHOUSE_ID = "";
export const ONELAKE_DFS = "https://onelake.dfs.fabric.microsoft.com";

/** Notebooken `fjv_importer_vaerksark`. Tom = importen lægges i kø, men der startes intet job. */
export const IMPORTER_NOTEBOOK_ID = "";
