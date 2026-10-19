// Kopierer dokumenternes tekster ind i appen, så `npm run build` ikke har brug for modelrepoet.
//
//   node src/sider/dokumentation/_byg/kopier-indhold.mjs --modelrepo <sti til fjernvarme-businesscase> [--viden <sti til viden/>]
//        [--dfdata <mappe med df-data ved den pinnede commit> --dfdata-commit <sha>]   (kreditteksterne, se nedenfor)
//
// - Modelrepoets filer hentes med `git show <commit>:<sti>` — aldrig fra arbejdsmappen, som indeholder
//   utrackede filer (CLAUDE.md, doc/AUTOMATISERING.*) der ikke er en del af den pinnede udgivelse.
// - Commit og filliste læses fra viden/dokumentation_indeks.json (fv-ekspert), så der er én sandhed.
// - Skriver KUN under indhold/repo og indhold/viden. indhold/egne er håndskrevet og røres ikke.
// - Bytes kopieres uændret (LICENSE skal følge med uændret, MIT); linjeskift normaliseres ikke.
// Kør igen ved en bevidst opgradering af modelcommit eller når fv-ekspert har rettet en tekst.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const her = dirname(fileURLToPath(import.meta.url));
const indhold = resolve(her, "..", "indhold");

function arg(navn, standard) {
    const i = process.argv.indexOf(`--${navn}`);
    return i >= 0 ? process.argv[i + 1] : standard;
}

const modelrepo = arg("modelrepo");
// Standard: viden/ ligger ved siden af app/ i produktmappen.
const viden = resolve(arg("viden", resolve(her, "..", "..", "..", "..", "..", "viden")));
if (!modelrepo) { console.error("Mangler --modelrepo <sti>"); process.exit(2); }
if (!existsSync(join(viden, "dokumentation_indeks.json"))) { console.error(`Finder ikke ${viden}/dokumentation_indeks.json`); process.exit(2); }

const indeks = JSON.parse(readFileSync(join(viden, "dokumentation_indeks.json"), "utf8"));
const commit = indeks.model_commit;
if (!/^[0-9a-f]{40}$/.test(commit)) { console.error(`Ugyldig model_commit: ${commit}`); process.exit(2); }

function gitShow(sti) {
    return execFileSync("git", ["-C", modelrepo, "show", `${commit}:${sti}`], { maxBuffer: 64 * 1024 * 1024 });
}

// Filnavn i indhold/repo pr. dokument-id — skal passe med dokumenter.ts (`fil`).
const REPO_FIL = {
    readme: "readme.md", koersel: "koersel.md", budstrategi: "budstrategi.md", balancemarked: "balancemarked.md",
    varmelast_og_nettab: "varmelast_og_nettab.md", eget_vaerk: "eget_vaerk.md", workflow_claude: "workflow_claude.md",
    workflow_lokal: "workflow_lokal.md", contributing: "contributing.md", licens: "licens.txt",
};

rmSync(join(indhold, "repo"), { recursive: true, force: true });
rmSync(join(indhold, "viden"), { recursive: true, force: true });
mkdirSync(join(indhold, "repo"), { recursive: true });
mkdirSync(join(indhold, "viden", "information"), { recursive: true });

let n = 0;
for (const d of indeks.dokumenter) {
    if (d.kilde !== "modelrepo") continue;
    const fil = REPO_FIL[d.id];
    if (!fil) { console.log(`   (ikke bundtet: ${d.id} — ${d.format})`); continue; }
    writeFileSync(join(indhold, "repo", fil), gitShow(d.sti));
    console.log(`ok repo/${fil}  <- ${commit.slice(0, 7)}:${d.sti}`);
    n++;
}

// Information-emnerne: fv-ekspert's `information_sider` (rækkefølgen) + evt. filer, der ligger i mappen uden at stå på listen
// (fx en ny tekst fra fagansvarlig for data, før indekset er rettet) — de får en advarsel og kommer sidst.
const infoMappe = join(viden, "app_tekster", "information");
const listede = indeks.information_sider.filter((s) => /\/information\/[^/]+\.md$/.test(s));
const ulistede = (existsSync(infoMappe) ? readdirSync(infoMappe) : [])
    .filter((f) => f.endsWith(".md") && !listede.includes(`app_tekster/information/${f}`)).sort()
    .map((f) => `app_tekster/information/${f}`);
for (const u of ulistede) console.warn(`ADVARSEL ${u} står ikke i dokumentation_indeks.json:information_sider — bundtet alligevel (sidst).`);
const infoSider = [...listede, ...ulistede];

// Tekster fra viden/: appens dokumenter, informationssiderne, ordlisten, forsiden og begrænsningerne.
const VIDEN = [
    ["METODE.md", "METODE.md"],
    ["app_tekster/saadan_bruger_du_appen.md", "saadan_bruger_du_appen.md"],
    ["app_tekster/begraensninger.md", "begraensninger.md"],
    ["app_tekster/forside.md", "forside.md"],
    ["app_tekster/ordliste.md", "ordliste.md"],
    ["referencetal.json", "referencetal.json"],
    ...infoSider
        .map((s) => [s, `information/${s.split("/").pop()}`]),
];
for (const [fra, til] of VIDEN) {
    const kilde = join(viden, fra);
    if (!existsSync(kilde)) { console.error(`MANGLER ${kilde}`); process.exit(1); }
    mkdirSync(dirname(join(indhold, "viden", til)), { recursive: true });
    cpSync(kilde, join(indhold, "viden", til));
    console.log(`ok viden/${til}`);
    n++;
}

// Emneliste til Information-området: ét emne pr. nummereret fil. Id'et er filnavnet uden nummer
// (`11_fabric_og_kapacitet.md` -> `fabric-og-kapacitet`), titlen er filens første overskrift. Nye emner, som
// fv-ekspert tilføjer til `information_sider`, dukker dermed op uden kodeændring (emner.ts placerer dem i
// "Øvrige emner", og emner.spec.ts fortæller, at de mangler en gruppe).
const emner = infoSider
    .map((s, i) => {
        const navn = s.split("/").pop();
        // Nummeret er valgfrit: `data.md` (fv-data) har intet. Et emne uden nummer sorterer efter de nummererede, i indeksets rækkefølge.
        const m = /^(?:(\d+)_)?(.+)\.md$/.exec(navn);
        const tekst = readFileSync(join(viden, s), "utf8");
        const h1 = /^#\s+(.+?)\s*$/m.exec(tekst);
        if (!h1) { console.error(`Ingen overskrift i ${s}`); process.exit(1); }
        return { nr: m[1] ? Number(m[1]) : 1000 + i, id: m[2].replace(/_/g, "-"), fil: `information/${navn}`, titel: h1[1] };
    });
writeFileSync(join(indhold, "viden", "emner.json"), JSON.stringify({ model_commit: commit, emner }, null, 2) + "\n");
console.log(`ok viden/emner.json (${emner.length} emner)`);
n++;

// Kredit (Om og kredit): df-datas licenstekster ORDRET fra datarepoet ved den pinnede commit. `--dfdata` er en udpakning af
// datarepoet (mappenavnet er commit'en, som i fabric/_lokal/df-data/<sha>/). Uden flaget røres df-data-filerne ikke.
// Modelrepoets README-indledning (hvem modellen er udviklet sammen med) tages ved samme model_commit som resten.
const LINJESKIFT = /\r?\n/;
const kreditter = join(indhold, "kreditter");
mkdirSync(kreditter, { recursive: true });
writeFileSync(join(kreditter, "model_README_indledning.md"), gitShow("README.md").toString("utf8").split(LINJESKIFT).slice(2, 5).join("\n") + "\n");
console.log("ok kreditter/model_README_indledning.md");
n++;
const dfdata = arg("dfdata");
if (dfdata) {
    const sha = arg("dfdata-commit");
    if (!/^[0-9a-f]{40}$/.test(sha ?? "")) { console.error("--dfdata kræver --dfdata-commit <fuld sha>"); process.exit(2); }
    if (resolve(dfdata).split(/[\\/]/).pop() !== sha) { console.error(`${dfdata} er ikke en udpakning ved ${sha} (mappenavnet skal være commit'en).`); process.exit(2); }
    cpSync(join(dfdata, "LICENSE"), join(kreditter, "df-data_LICENSE.txt"));
    // README'ens afsnit "## Licens" gengives ordret (fra overskriften til næste overskrift).
    const readme = readFileSync(join(dfdata, "README.md"), "utf8").split(LINJESKIFT);
    const i = readme.findIndex((l) => /^##\s+Licens\s*$/.test(l));
    if (i < 0) { console.error("df-data/README.md har ikke et afsnit '## Licens'"); process.exit(1); }
    let j = readme.findIndex((l, k) => k > i && /^##\s/.test(l));
    if (j < 0) j = readme.length;
    writeFileSync(join(kreditter, "df-data_README_licens.md"), readme.slice(i, j).join("\n").trimEnd() + "\n");
    // README'ens to indledende afsnit (hvad repoet er, og hvor dataene kommer fra) — også ordret.
    const afsnit = [];
    let nu = [];
    for (let k = 1; k < readme.length && afsnit.length < 2; k++) {
        if (/^#/.test(readme[k])) break;
        if (readme[k].trim() === "") { if (nu.length) { afsnit.push(nu.join("\n")); nu = []; } continue; }
        nu.push(readme[k]);
    }
    writeFileSync(join(kreditter, "df-data_README_indledning.md"), afsnit.join("\n\n") + "\n");
    writeFileSync(join(kreditter, "df-data_commit.txt"), sha + "\n");
    console.log(`ok kreditter/df-data_* (df-data ${sha.slice(0, 7)})`);
    n += 4;
}

console.log(`${n} filer kopieret til ${indhold} (modelcommit ${commit.slice(0, 7)}).`);
