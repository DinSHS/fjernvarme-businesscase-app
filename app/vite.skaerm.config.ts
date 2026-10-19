//-----------------------------------------------------------------------
// Vite-config KUN til skærmbilleder (skaermbilleder/tag.mjs): appen med
// fixture-data og uden Fabric-auth. `@/lib/rayfin-client` peges på
// skaermbilleder/harness/falsk-klient.ts. Bruges aldrig af `npm run build`.
//-----------------------------------------------------------------------

import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { resolve } from "path";
import { backendAlias } from "./backend.config";

const rod = import.meta.dirname;

export default defineConfig({
    root: resolve(rod, "skaermbilleder/harness"),
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: [
            { find: /^@\/lib\/rayfin-client$/, replacement: resolve(rod, "skaermbilleder/harness/falsk-klient.ts") },
            // Harnessen er den falske Rayfin-klient, altså rayfin-mappen (rest-udgaven fotograferes mod en kørende server).
            backendAlias(rod, "rayfin"),
            { find: "@", replacement: resolve(rod, "src") },
        ],
    },
    oxc: { target: "es2022" },
    build: {
        // FJV_BYG=<mappe> giver hver agent sin egen build (to samtidige builds overskrev hinanden — fv-doku).
        outDir: process.env.FJV_BYG ? resolve(process.env.FJV_BYG) : resolve(rod, "skaermbilleder/.byg"),
        emptyOutDir: true,
        cssCodeSplit: false, // som produktionen (vite.config.ts)
        target: "es2022",
        minify: false,
        reportCompressedSize: false,
    },
});
