//-----------------------------------------------------------------------
// Appens version og commit, som vite.config.ts bager ind ved build (runde 13: arkivets Læs mig og manifest).
// Under test findes konstanterne ikke; så står der "ukendt".
//-----------------------------------------------------------------------

declare const __APP_VERSION__: string | undefined;
declare const __APP_COMMIT__: string | undefined;

export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "ukendt";
export const APP_COMMIT: string = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "ukendt";
