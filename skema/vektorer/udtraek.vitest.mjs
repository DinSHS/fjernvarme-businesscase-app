// vitest-konfiguration for udtraek.mjs: TS-testene for de betroede funktioner, med optag.setup.mts.
// Et rent objekt (ingen import af 'vitest/config'), fordi filen ligger uden for app/node_modules.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const her = fileURLToPath(new URL(".", import.meta.url));
const app = resolve(process.env.FJV_APP_DIR ?? resolve(her, "..", "..", "app"));

export default {
    root: app,
    test: {
        environment: "node",
        globals: true,
        include: ["rayfin/functions/test/**/*.spec.ts"],
        setupFiles: [resolve(her, "optag.setup.mts")],
        // Én proces: optagelserne skrives til samme fil i rækkefølge.
        fileParallelism: false,
    },
    oxc: { target: "es2022" },
    resolve: { alias: { "@": resolve(app, "src") } },
};
