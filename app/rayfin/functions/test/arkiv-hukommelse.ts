//-----------------------------------------------------------------------
// Testhjælp (runde 13): en database i hukommelsen med arkivets lager-grænseflade og et lille, syntetisk
// datasæt (værk, reference/scenarie-par, én færdig kørsel med 250 timer). Bruges af arkiv.spec.ts og af
// browserens rundturstest (src/lib/arkiv). Ingen virkelige værksdata.
//-----------------------------------------------------------------------

import {
    børnetilstandAf, inputHashRen, KOERSEL_BOERN, kolonnenavne, NIL_UUID, type ArkivLager, type ArkivTx, type ImportTabel, type InputRad, type Kanonisk, type LogRad,
} from "../src/arkiv";

export type Række = Record<string, unknown>;
export type Tabeller = Record<string, Map<string, Række>>;

export const TABELNAVNE = ["Vaerk", "VaerkParameter", "Aendringslog", "Aendringsanmodning", "Scenarie", "ScenarieAendring", "Bestilling",
    "Koersel", "KoerselInput", "KoerselNoegletal", "KoerselMaaned", "KoerselTime", "Tidsserie"] as const;

export function tomDb(): Tabeller {
    return Object.fromEntries(TABELNAVNE.map((t) => [t, new Map<string, Række>()]));
}

export function kopiDb(db: Tabeller): Tabeller {
    return Object.fromEntries(Object.entries(db).map(([t, m]) => [t, new Map([...m].map(([k, v]) => [k, { ...v }]))]));
}

const fraKanonisk = (tabel: ImportTabel, r: readonly Kanonisk[]): Række =>
    Object.fromEntries(kolonnenavne(tabel).map((k, i) => [k, r[i]]));

const låseregister = new WeakMap<Tabeller, Map<string, Promise<void>>>();

export interface Lagervalg {
    /** Kast efter n indsatte rækker (en afbrudt import). */
    afbrydEfter?: number;
    /** Kaldes før hver indsættelse (en test kan sætte transaktionen på pause her). */
    førIndsæt?: (tabel: string) => Promise<void>;
    /** Uden låse pr. kørsel — kun til at vise, at testen af K10-F3 fanger fejlen. */
    udenKørselslås?: boolean;
}

/**
 * Lageret over en hukommelses-db med READ COMMITTED som SQL Server: læsninger ser det committede, skrivninger samles
 * og committes til sidst (rollback ved fejl), og `låsKørsler` er en rigtig, ventende lås pr. kørsels-id (som
 * sp_getapplock), der holdes til transaktionen slutter.
 */
export function hukommelsesLager(db: Tabeller, valg: Lagervalg = {}): ArkivLager & { indsatte: number } {
    const lager = {
        indsatte: 0,
        læsAnmodning: async (id: string) => {
            const a = db.Aendringsanmodning.get(id);
            return a ? { id, vaerk_id: String(a.vaerk_id), aendringer_json: String(a.aendringer_json), anmodet_af: String(a.anmodet_af), status: String(a.status), svar: (a.svar as string) ?? null } : null;
        },
        afvisAnmodning: async (id: string, tekst: string) => {
            const a = db.Aendringsanmodning.get(id);
            if (a && a.status === "ny") { a.status = "afvist"; a.svar = tekst; }
        },
        iTransaktion: async <T,>(fn: (tx: ArkivTx) => Promise<T>): Promise<T> => {
            const skrevet: [string, string, Række][] = [];
            const frigiv: (() => void)[] = [];
            const reg = låseregister.get(db) ?? new Map<string, Promise<void>>();
            låseregister.set(db, reg);
            const rækker = (t: string) => [...db[t].values()];
            const tx: ArkivTx = {
                låsAnmodning: async (id) => ({ status: String(db.Aendringsanmodning.get(id)?.status), svar: (db.Aendringsanmodning.get(id)?.svar as string) ?? null }),
                låsKørsler: async (ider) => {
                    if (valg.udenKørselslås) return;
                    for (const id of ider) {
                        while (reg.has(id)) await reg.get(id);
                        let slip!: () => void;
                        reg.set(id, new Promise<void>((r) => (slip = r)));
                        frigiv.push(() => { reg.delete(id); slip(); });
                    }
                },
                hent: async (tabel, ider) => ider.map((i) => db[tabel].get(i)).filter((x): x is Række => !!x).map((x) => ({ ...x })),
                indsæt: async (tabel, nye) => {
                    if (valg.førIndsæt) await valg.førIndsæt(tabel);
                    for (const r of nye) {
                        if (valg.afbrydEfter !== undefined && lager.indsatte >= valg.afbrydEfter) throw new Error("forbindelsen blev afbrudt (test)");
                        if (db[tabel].has(r[0] as string) || skrevet.some(([t, id]) => t === tabel && id === r[0])) throw new Error(`PK-brud ${tabel} ${String(r[0])}`);
                        skrevet.push([tabel, r[0] as string, fraKanonisk(tabel, r)]);
                        lager.indsatte++;
                    }
                },
                børneside: async (k, tabel, fra, antal) => rækker(tabel).filter((r) => r.koersel_id === k)
                    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1)).slice(fra, fra + antal).map((x) => ({ ...x })),
                input: async (k) => rækker("KoerselInput").filter((r) => r.koersel_id === k)
                    .map((r) => ({ kilde: String(r.kilde), sti: String(r.sti), vaerdi_json: String(r.vaerdi_json) })),
                vaerkHistorik: async (v) => ({
                    revision: Number(db.Vaerk.get(v)?.revision ?? 0),
                    blade: rækker("VaerkParameter").filter((r) => r.vaerk_id === v).map((r) => ({ sti: String(r.sti), vaerdi_json: String(r.vaerdi_json) })),
                    log: rækker("Aendringslog").filter((r) => r.vaerk_id === v) as unknown as LogRad[],
                }),
                tidsserier: async (v) => rækker("Tidsserie").filter((r) => r.vaerk_id === v && r.status === "gyldig").map((r) => ({ rolle: String(r.rolle), sha256: String(r.sha256) })),
                udfoer: async (id, svar) => { skrevet.push(["Aendringsanmodning", id, { ...db.Aendringsanmodning.get(id)!, status: "udfoert", svar }]); },
            };
            try {
                const ud = await fn(tx);
                for (const [t, id, r] of skrevet) db[t].set(id, r);          // commit
                return ud;
            } finally {
                for (const f of frigiv) f();
            }
        },
    };
    return lager;
}

/** Opretter en anmodning som klienten (DAB) ville: egen e-mail, status ny, nil-uuid som værk. */
export function opretAnmodning(db: Tabeller, aendringer_json: string, af = "test@example.org"): string {
    const id = crypto.randomUUID();
    db.Aendringsanmodning.set(id, { id, vaerk_id: NIL_UUID, forventet_revision: 0, aendringer_json, anmodet_af: af, anmodet: new Date().toISOString(), status: "ny", svar: null });
    return id;
}

// ------------------------------------------------------------------ syntetisk datasæt

export const ID = {
    vaerk: "11111111-1111-4111-8111-111111111111",
    reference: "22222222-2222-4222-8222-222222222222",
    scenarie: "33333333-3333-4333-8333-333333333333",
    bestilling: "44444444-4444-4444-8444-444444444444",
    koersel: "55555555-5555-4555-8555-555555555555",
    tidsserie: "66666666-6666-4666-8666-666666666666",
};

const uuid = (n: number, præfiks = "a") => `${præfiks.repeat(8)}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const TIDSSERIE_SHA = "ab".repeat(32);

/** Andeby-lignende syntetisk værk med to revisioner og én færdig kørsel på revision 2. */
export function eksempelDb(antalTimer = 250, medReference = false): Tabeller {
    const db = tomDb();
    const t0 = "2026-10-01T08:00:00.000Z";
    db.Vaerk.set(ID.vaerk, { id: ID.vaerk, kode: "andeby", navn: "Andeby", beskrivelse: null, kilde: "repo", kilde_fil: "cases/andeby.yaml", repo_commit: null, kopieret_fra_id: null, revision: 3, arkiveret: false, oprettet_af: "a@example.org", aendret_af: "a@example.org", oprettet: t0, aendret: t0 });
    const blade: [string, string][] = [["prices.straw.value", "250.0"], ["units.halmkedel.p_max", "5.0"], ["storage.tank.enabled", "true"]];
    blade.forEach(([sti, v], i) => db.VaerkParameter.set(uuid(i, "b"), { id: uuid(i, "b"), vaerk_id: ID.vaerk, sti, vaerdi_json: v, sektion: sti.split(".")[0], objekt: null, kommentar: null, bekraeft: false, raekkefoelge: i, aendret_af: "a@example.org", aendret: t0 }));
    // revision 2: halmprisen 200 -> 250 (nu); revision 3: tankens kapacitet tilføjet og fjernet igen = samme parametre som 2? Nej:
    // revision 3 ændrer p_max 4 -> 5. Kørslen er bygget på revision 2 (straw 250, p_max 4).
    db.Aendringslog.set(uuid(1, "c"), { id: uuid(1, "c"), vaerk_id: ID.vaerk, revision: 2, sti: "prices.straw.value", handling: "ret", gammel_json: "200.0", ny_json: "250.0", aendret_af: "a@example.org", tidspunkt: t0, anmodning_id: null });
    db.Aendringslog.set(uuid(2, "c"), { id: uuid(2, "c"), vaerk_id: ID.vaerk, revision: 3, sti: "units.halmkedel.p_max", handling: "ret", gammel_json: "4.0", ny_json: "5.0", aendret_af: "a@example.org", tidspunkt: t0, anmodning_id: null });
    db.Tidsserie.set(ID.tidsserie, { id: ID.tidsserie, vaerk_id: ID.vaerk, rolle: "varmelast", navn: "Målt 2026", filnavn: "maalt.csv", sti: "Files/x.csv", sha256: TIDSSERIE_SHA, oploesning: "1h", start: t0, slut: t0, antal_raekker: 10, antal_huller: 0, enhed: "MW", tidsstempel: "start", tidszone: "UTC", kilde: "csv", status: "gyldig", validering_json: "{}", aktiv: true, uploadet_af: "a@example.org", uploadet: t0 });

    const scenarie = (id: string, navn: string, reference: string | null) => ({
        id, vaerk_id: ID.vaerk, navn, beskrivelse: "syntetisk", reference_scenarie_id: reference, periode_start: "2026-01-05", periode_slut: "2026-01-06",
        med_balancering: false, balancing_method: null, mip_rel_gap: 0.0002, mip_abs_gap: 100, tidsgraense_s: 600, ekstra_flag: null, heat_csv: null,
        arkiveret: false, oprettet_af: "a@example.org", oprettet: t0,
    });
    db.Scenarie.set(ID.reference, scenarie(ID.reference, "Reference", null));
    db.Scenarie.set(ID.scenarie, scenarie(ID.scenarie, "Uden tank", ID.reference));
    db.ScenarieAendring.set(uuid(1, "d"), { id: uuid(1, "d"), scenarie_id: ID.scenarie, type: "disable", sti: "tank", vaerdi_json: null, raekkefoelge: 0 });
    db.ScenarieAendring.set(uuid(2, "d"), { id: uuid(2, "d"), scenarie_id: ID.scenarie, type: "set", sti: "_tidsserie.varmelast", vaerdi_json: JSON.stringify(ID.tidsserie), raekkefoelge: 1 });
    db.Bestilling.set(ID.bestilling, { id: ID.bestilling, scenarie_id: ID.scenarie, klient_noegle: "k-1", bestilt_af: "a@example.org", bestilt: t0 });

    const input: InputRad[] = [
        { kilde: "vaerk", sti: "prices.straw.value", vaerdi_json: "250.0" },
        { kilde: "vaerk", sti: "units.halmkedel.p_max", vaerdi_json: "4.0" },
        { kilde: "vaerk", sti: "storage.tank.enabled", vaerdi_json: "true" },
        { kilde: "aendring", sti: "storage.tank.enabled", vaerdi_json: "false" },
        { kilde: "scenarie", sti: "_koersel.tidsserie.varmelast", vaerdi_json: JSON.stringify({ id: ID.tidsserie, sha256: TIDSSERIE_SHA }) },
    ];
    input.forEach((r, i) => db.KoerselInput.set(uuid(i, "e"), { id: uuid(i, "e"), koersel_id: ID.koersel, ...r }));
    db.KoerselNoegletal.set(uuid(1, "f"), { id: uuid(1, "f"), koersel_id: ID.koersel, gruppe: "objektiv", objekt: null, marked: null, noegle: "objektiv_dkk", vaerdi: 867031.23, enhed: "DKK" });
    db.KoerselNoegletal.set(uuid(2, "f"), { id: uuid(2, "f"), koersel_id: ID.koersel, gruppe: "lager", objekt: "tank", marked: null, noegle: "dual", vaerdi: null, enhed: null });
    db.KoerselMaaned.set(uuid(1, "9"), { id: uuid(1, "9"), koersel_id: ID.koersel, maaned: "2026-01", objekt: "halmkedel", noegle: "varme_mwh", vaerdi: 123.4567890123 });
    db.KoerselMaaned.set(uuid(2, "9"), { id: uuid(2, "9"), koersel_id: ID.koersel, maaned: "periode", objekt: null, noegle: "varme_mwh", vaerdi: 123.4567890123 });
    const start = Date.UTC(2026, 2, 28, 22, 0, 0);    // hen over sommertidens start (29. marts 01:00 UTC)
    for (let i = 0; i < antalTimer; i++) {
        const id = uuid(i, "7");
        db.KoerselTime.set(id, {
            id, koersel_id: ID.koersel, tid: new Date(start + i * 3_600_000).toISOString(), varmelast_mw: 3.5 + (i % 7) / 10, spotpris: i % 5 === 0 ? null : -12.25 + i,
            t_ude: 1.5, vaerdier_json: JSON.stringify({ p_halmkedel_mw: (i % 4) * 1.25, soc_tank_mwh: null, solgt: i % 2 === 0 }),
        });
    }
    db.Koersel.set(ID.koersel, {
        id: ID.koersel, bestilling_id: ID.bestilling, scenarie_id: ID.scenarie, vaerk_id: ID.vaerk, vaerk_revision: 2, input_hash: inputHashRen(input),
        status: "faerdig", fase: "Færdig", bestilt_af: "a@example.org", bestilt: t0, modtaget: "2026-10-01T08:00:01.123Z", startet: t0, afsluttet: "2026-10-01T08:03:00.000Z",
        hjerteslag: null, annuller_anmodet: null, forsoeg: 1, arbejder_id: "w1", fabric_job_id: null, kilde: "app", model_commit: "e".repeat(40), data_commit: "1".repeat(40),
        miljoe_json: "{\"python\":\"3.11\"}", case_sti: null, output_sti: null, output_stem: null, oploesning: "1h", interval_min: 60, antal_interval_model: antalTimer + 1,
        antal_interval_csv: antalTimer, solve_status: "optimal", er_milp: true, objektiv_dkk: 867031.23, oensket_rel_gap: 0.0002, oensket_abs_gap: 100,
        opnaaet_gap: 0.00011, best_bound: 866950.5, loesetid_s: 12.345, fejlbesked: null, manifest_json: "{}",
    });
    if (medReference) tilføjReferencekørsel(db);
    return db;
}

export const REF_KOERSEL = "88888888-8888-4888-8888-888888888888";
export const REF_BESTILLING = "99999999-9999-4999-8999-999999999999";

/** En færdig kørsel af referencescenariet (samme input uden ændringen), så parret kan sammenlignes. */
function tilføjReferencekørsel(db: Tabeller): void {
    const k = { ...db.Koersel.get(ID.koersel)! };
    const ny = (gammel: string) => `${gammel.slice(0, 9)}9999${gammel.slice(13)}`;
    db.Bestilling.set(REF_BESTILLING, { id: REF_BESTILLING, scenarie_id: ID.reference, klient_noegle: "k-ref", bestilt_af: "a@example.org", bestilt: k.bestilt });
    const input: InputRad[] = [];
    for (const r of [...db.KoerselInput.values()].filter((x) => x.koersel_id === ID.koersel && x.kilde !== "aendring")) {
        db.KoerselInput.set(ny(String(r.id)), { ...r, id: ny(String(r.id)), koersel_id: REF_KOERSEL });
        input.push({ kilde: String(r.kilde), sti: String(r.sti), vaerdi_json: String(r.vaerdi_json) });
    }
    for (const t of ["KoerselNoegletal", "KoerselMaaned", "KoerselTime"] as const) {
        for (const r of [...db[t].values()].filter((x) => x.koersel_id === ID.koersel)) {
            const kopi: Række = { ...r, id: ny(String(r.id)), koersel_id: REF_KOERSEL };
            if (typeof kopi.vaerdi === "number") kopi.vaerdi = kopi.vaerdi + 170;
            db[t].set(String(kopi.id), kopi);
        }
    }
    db.Koersel.set(REF_KOERSEL, { ...k, id: REF_KOERSEL, bestilling_id: REF_BESTILLING, scenarie_id: ID.reference, input_hash: inputHashRen(input), objektiv_dkk: 867201.23, best_bound: 867120.5 });
}

/** Tabellens rækker i arkivets kanoniske form (sorteret som i databasen). */
export function rækkerFra(db: Tabeller, tabel: ImportTabel, filter: (r: Række) => boolean = () => true): Kanonisk[][] {
    return [...db[tabel].values()].filter(filter).map((r) => kolonnenavne(tabel).map((k) => (r[k] ?? null) as Kanonisk));
}

/** Arkivets forventede rækker (antal og sha256 pr. undertabel) for kørslerne, som klienten sender dem i en Koersel-del. */
export function forventetFor(kilde: Tabeller, koersler: readonly (readonly Kanonisk[])[]) {
    return Object.fromEntries(koersler.map((k) => [k[0] as string, børnetilstandAf(Object.fromEntries(KOERSEL_BOERN.map((b) =>
        [b, rækkerFra(kilde, b, (x) => x.koersel_id === k[0])])) as never)]));
}

/** Databasens egne rækketal (som Function arkivTal), til eksportens fuldstændighedstjek i testene. */
export function tællerFor(db: Tabeller) {
    return async (ider: readonly string[]) => {
        const tæl = (t: string, f: (r: Række) => boolean) => [...db[t].values()].filter(f).length;
        const scenarier = Object.fromEntries(ider.map((id) => [id, {
            ScenarieAendring: tæl("ScenarieAendring", (r) => r.scenarie_id === id), Bestilling: tæl("Bestilling", (r) => r.scenarie_id === id),
            Koersel: tæl("Koersel", (r) => r.scenarie_id === id),
        }]));
        const kør = [...db.Koersel.values()].filter((k) => ider.includes(String(k.scenarie_id)));
        const koersler = Object.fromEntries(kør.map((k) => [String(k.id), Object.fromEntries(KOERSEL_BOERN.map((b) => [b, tæl(b, (r) => r.koersel_id === k.id)]))]));
        const vids = new Set([...ider.map((id) => String(db.Scenarie.get(id)?.vaerk_id)), ...kør.map((k) => String(k.vaerk_id))]);
        const vaerker = Object.fromEntries([...vids].map((v) => [v, { Aendringslog: tæl("Aendringslog", (r) => r.vaerk_id === v), Tidsserie: tæl("Tidsserie", (r) => r.vaerk_id === v) }]));
        return { ok: true, scenarier, koersler: koersler as never, vaerker };
    };
}
