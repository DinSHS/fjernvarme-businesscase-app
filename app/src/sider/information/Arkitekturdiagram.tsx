//-----------------------------------------------------------------------
// Arkitekturen som inline SVG: app -> Functions -> notebook -> database (+ lakehouse).
// Farver og skriftstørrelser kun via tokens (diagram.css). To tegninger — bred og smal —
// fordi tekst i et skaleret SVG ellers bliver ulæselig på mobil; CSS viser den ene.
// Pilene er nummereret, og tallene forklares i en liste under tegningen (ikke i tegningen).
//-----------------------------------------------------------------------

import "./diagram.css";

const TRIN: readonly { nr: number; tekst: string }[] = [
    { nr: 1, tekst: "Du retter et værk eller bestiller en kørsel i appen. Ændringen går til en Function." },
    { nr: 2, tekst: "Functionen skriver i databasen i én transaktion: værksændringen, eller en kørsel med frosset input." },
    { nr: 3, tekst: "Functionen starter notebooken gennem Fabrics jobs-API, hvis ingen arbejder allerede regner." },
    { nr: 4, tekst: "Notebooken læser det frosne input og skriver resultaterne tilbage i databasen." },
    { nr: 5, tekst: "Notebooken henter modelkode og data fra lakehouset og lægger rå uddata dér." },
    { nr: 6, tekst: "Appen læser resultater og status direkte fra databasen. Modellen kører aldrig i browseren." },
];

interface Kasse { id: string; x: number; y: number; w: number; h: number; titel: string; linjer: string[] }

function Boks({ k }: { k: Kasse }) {
    return (
        <g>
            <rect className="fjv-dia-boks" x={k.x} y={k.y} width={k.w} height={k.h} rx={8} />
            <text className="fjv-dia-titel" x={k.x + 14} y={k.y + 24}>{k.titel}</text>
            {k.linjer.map((l, i) => <text key={l} className="fjv-dia-tekst" x={k.x + 14} y={k.y + 43 + i * 15}>{l}</text>)}
        </g>
    );
}

function Pil({ d, id, begge }: { d: string; id: string; begge?: boolean }) {
    return <path className="fjv-dia-pil" d={d} markerEnd={`url(#${id})`} markerStart={begge ? `url(#${id})` : undefined} fill="none" />;
}

function Nr({ nr, x, y }: { nr: number; x: number; y: number }) {
    return (
        <g>
            <circle className="fjv-dia-nr" cx={x} cy={y} r={10} />
            <text className="fjv-dia-nr-tal" x={x} y={y + 4} textAnchor="middle">{nr}</text>
        </g>
    );
}

function Spids({ id }: { id: string }) {
    return (
        <defs>
            <marker id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="fjv-dia-spids" />
            </marker>
        </defs>
    );
}

const APP = (x: number, y: number, w: number): Kasse => ({ id: "app", x, y, w, h: 74, titel: "Appen", linjer: ["Fabric App i browseren", "viser, retter, bestiller"] });
const FUNK = (x: number, y: number, w: number): Kasse => ({ id: "fn", x, y, w, h: 74, titel: "Functions", linjer: ["kører som appens ejer", "fryser input, starter notebook"] });
const NB = (x: number, y: number, w: number): Kasse => ({ id: "nb", x, y, w, h: 74, titel: "Notebook", linjer: ["fjv_koer_scenarie", "Python og HiGHS, én ad gangen"] });
const DB = (x: number, y: number, w: number): Kasse => ({ id: "db", x, y, w, h: 74, titel: "App-databasen", linjer: ["Fabric SQL-database", "værker, scenarier, kørsler, resultater"] });
const LH = (x: number, y: number, w: number): Kasse => ({ id: "lh", x, y, w, h: 74, titel: "Lakehouse", linjer: ["fjv_lakehouse", "modelkode, df-data, rå uddata"] });

function Bred() {
    const a = APP(10, 20, 200), f = FUNK(300, 20, 200), n = NB(590, 20, 200), d = DB(10, 220, 490), l = LH(590, 220, 200);
    return (
        <svg className="fjv-dia-bred" viewBox="0 0 800 314" role="img" aria-labelledby="dia-bred-t dia-bred-b" preserveAspectRatio="xMidYMid meet">
            <title id="dia-bred-t">Arkitektur</title>
            <desc id="dia-bred-b">Appen sender til Functions, som skriver i databasen og starter notebooken. Notebooken læser og skriver i databasen og i lakehouset. Appen læser fra databasen.</desc>
            <Spids id="dia-b" />
            {[a, f, n, d, l].map((k) => <Boks key={k.id} k={k} />)}
            <Pil id="dia-b" d="M210,57 H300" />
            <Pil id="dia-b" d="M400,94 V220" />
            <Pil id="dia-b" d="M500,57 H590" />
            <Pil id="dia-b" begge d="M620,94 V180 H470 V220" />
            <Pil id="dia-b" begge d="M690,94 V220" />
            <Pil id="dia-b" d="M110,220 V94" />
            <Nr nr={1} x={255} y={57} /><Nr nr={2} x={400} y={157} /><Nr nr={3} x={545} y={57} />
            <Nr nr={4} x={545} y={180} /><Nr nr={5} x={690} y={157} /><Nr nr={6} x={110} y={157} />
        </svg>
    );
}

function Smal() {
    const x = 18, w = 304;
    const a = APP(x, 8, w), f = FUNK(x, 122, w), d = DB(x, 236, w), n = NB(x, 350, w), l = LH(x, 464, w);
    return (
        <svg className="fjv-dia-smal" viewBox="0 0 340 546" role="img" aria-labelledby="dia-smal-t dia-smal-b" preserveAspectRatio="xMidYMid meet">
            <title id="dia-smal-t">Arkitektur</title>
            <desc id="dia-smal-b">Appen sender til Functions, som skriver i databasen og starter notebooken. Notebooken læser og skriver i databasen og i lakehouset. Appen læser fra databasen.</desc>
            <Spids id="dia-s" />
            {[a, f, d, n, l].map((k) => <Boks key={k.id} k={k} />)}
            <Pil id="dia-s" d="M170,82 V122" />
            <Pil id="dia-s" d="M170,196 V236" />
            <Pil id="dia-s" d={`M${x + w},159 H331 V387 H${x + w}`} />
            <Pil id="dia-s" begge d="M170,310 V350" />
            <Pil id="dia-s" begge d="M170,424 V464" />
            <Pil id="dia-s" d={`M${x},273 H9 V45 H${x}`} />
            <Nr nr={1} x={170} y={102} /><Nr nr={2} x={170} y={216} /><Nr nr={3} x={331} y={273} />
            <Nr nr={4} x={170} y={330} /><Nr nr={5} x={170} y={444} /><Nr nr={6} x={9} y={159} />
        </svg>
    );
}

export function Arkitekturdiagram() {
    return (
        <div className="fjv-dia">
            <Bred />
            <Smal />
            <ol className="fjv-dia-trin">
                {TRIN.map((t) => <li key={t.nr}><span className="fjv-dia-trin-nr">{t.nr}</span><span>{t.tekst}</span></li>)}
            </ol>
        </div>
    );
}
