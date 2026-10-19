// Vite-config til skærmbilleder af Dokumentation og Information — som vite.skaerm.config.ts (fundamentet), men
// bygger til en EGEN mappe (FJV_BYG), så to agenter, der bygger skærmbilleder samtidig, ikke overskriver hinandens
// skaermbilleder/.byg midt i en måling.
//
//   FJV_BYG=<mappe> npx vite build --config src/sider/dokumentation/_byg/skaerm.vite.mjs
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { resolve } from "node:path";

const app = resolve(import.meta.dirname, "..", "..", "..", "..");
const ud = process.env.FJV_BYG;
if (!ud) throw new Error("Sæt FJV_BYG til den mappe, der bygges til.");

export default defineConfig({
    root: resolve(app, "skaermbilleder/harness"),
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: [
            { find: /^@\/lib\/rayfin-client$/, replacement: resolve(app, "skaermbilleder/harness/falsk-klient.ts") },
            { find: "@", replacement: resolve(app, "src") },
        ],
    },
    oxc: { target: "es2022" },
    build: { outDir: resolve(ud), emptyOutDir: true, target: "es2022", minify: false, reportCompressedSize: false },
});
