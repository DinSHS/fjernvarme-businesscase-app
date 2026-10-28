// @vitest-environment node
// Runde 12: uploadVaerksark som revision (genupload af et ark, appen har eksporteret). Basis-arket bindes af sin sha256,
// gemmes ved siden af arket, og værkets revision tjekkes FØR noget gemmes — en konflikt skriver hverken fil eller import.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/tidsserie";
import { behandlVaerksark, type AnmodningsRad, type VaerksarkDeps, type VaerkRad } from "../src/vaerksark";

const ARK = Buffer.from(readFileSync(new URL("./vektorer/skabelon_uaendret.xlsx", import.meta.url))).toString("base64");
const ID = "77777777-7777-4777-8777-777777777777";
const VID = "55555555-5555-4555-8555-555555555555";

function falsk(a: Partial<AnmodningsRad>, basis: string, vaerk: VaerkRad | undefined) {
    const filer: string[] = [], opret: unknown[] = [], afvist: string[] = [];
    const anm: AnmodningsRad = {
        id: ID.toUpperCase(), status: "ny", svar: null, anmodet_af: "a@b.dk", vaerk_id: VID.toUpperCase(), forventet_revision: 3,
        aendringer_json: JSON.stringify([{ handling: "upload_vaerksark", filnavn: "andeby_rev3.xlsx", sha256: sha256Hex(ARK), basis_sha256: sha256Hex(basis) }]), ...a,
    };
    const d: VaerksarkDeps = {
        læsAnmodning: async () => anm,
        læsImport: async () => ({ id: ID, status: "koe", fabric_job_id: null, log: null }),
        læsVaerk: async (id) => (id === VID ? vaerk : undefined),
        skrivFil: async (sti) => { filer.push(sti); },
        opretImport: async (_a, upload, sti) => { opret.push({ upload, sti }); return "oprettet"; },
        reserverJobstart: async () => true,
        bindJob: async () => {},
        startJob: async () => ({ ok: true, jobId: "job", status: 202 }),
        afvisAnmodning: async (_id, tekst) => { afvist.push(tekst); },
    };
    return { d, filer, opret, afvist };
}

describe("uploadVaerksark som revision (runde 12)", () => {
    const V: VaerkRad = { id: VID, kode: "andeby", revision: 3, arkiveret: false };

    it("samme revision: arket og basis gemmes, importen oprettes med basis-bindingen", async () => {
        const f = falsk({}, ARK, V);
        const r = await behandlVaerksark(f.d, ID, ARK, ARK);
        expect(r).toMatchObject({ ok: true, status: "koe", import_id: ID });
        expect(f.filer).toEqual([`fjv/uploads/${ID}.xlsx`, `fjv/uploads/${ID}_basis.xlsx`]);
        expect(f.opret).toEqual([{ upload: expect.objectContaining({ basis_sha256: sha256Hex(ARK) }), sti: `Files/fjv/uploads/${ID}.xlsx` }]);
    });
    it("værket er ændret siden eksporten: afvist med forklaring, intet gemt", async () => {
        const f = falsk({}, ARK, { ...V, revision: 4 });
        const r = await behandlVaerksark(f.d, ID, ARK, ARK);
        expect(r.status).toBe("afvist");
        expect(r.svar).toMatch(/ændret, siden arket blev eksporteret \(revision 3 → 4\)\. Intet er gemt — eksportér værket igen/);
        expect(f.filer).toEqual([]);
        expect(f.opret).toEqual([]);
    });
    it("værket findes ikke, eller er arkiveret: afvist", async () => {
        expect((await behandlVaerksark(falsk({}, ARK, undefined).d, ID, ARK, ARK)).svar).toMatch(/findes ikke længere/);
        expect((await behandlVaerksark(falsk({}, ARK, { ...V, arkiveret: true }).d, ID, ARK, ARK)).svar).toMatch(/arkiveret/);
    });
    it("basis passer ikke med sha256, mangler, eller kommer uden revision: afvist før noget gemmes", async () => {
        const f = falsk({}, ARK, V);
        expect((await behandlVaerksark(f.d, ID, ARK, "")).svar).toMatch(/Basis-arket passer ikke/);
        const uden = falsk({ aendringer_json: JSON.stringify([{ handling: "upload_vaerksark", filnavn: "a.xlsx", sha256: sha256Hex(ARK) }]) }, ARK, V);
        expect((await behandlVaerksark(uden.d, ID, ARK, ARK)).svar).toMatch(/hører kun til en genupload som revision/);
        expect([...f.filer, ...uden.filer]).toEqual([]);
    });
});
