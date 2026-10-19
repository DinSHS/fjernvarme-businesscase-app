/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Rayfin API base URL (e.g. http://localhost:5168). */
  readonly VITE_RAYFIN_API_URL?: string;
  /** Rayfin publishable key (pk-...). */
  readonly VITE_RAYFIN_PUBLISHABLE_KEY?: string;
  /** Fabric workspace ID — maps to FabricAuthOptions.workspaceId. */
  readonly VITE_FABRIC_WORKSPACE_ID?: string;
  /** Fabric/Rayfin item ID — maps to FabricAuthOptions.projectId. */
  readonly VITE_FABRIC_ITEM_ID?: string;
  /** Fabric portal base URL (e.g. https://app.fabric.microsoft.com/). */
  readonly VITE_FABRIC_PORTAL_URL?: string;
  /** Hvilken backend bundlen bygges til: `rayfin` (Fabric, standard) eller `rest` (community). Læses af vite.config.ts. */
  readonly VITE_BACKEND?: "rayfin" | "rest";
  /** rest: API'ets grundadresse; tom = samme oprindelse som siden (serveren serverer frontenden). */
  readonly VITE_REST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}