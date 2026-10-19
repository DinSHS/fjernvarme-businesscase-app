//-----------------------------------------------------------------------
// Forhåndstjek af et uploadet værksark (.xlsx = ZIP) FØR det gemmes og importen startes (K5-F3).
//
// Den komprimerede størrelse begrænser ikke importens hukommelse: Codex målte en skabelon med en harmløs
// 8 MiB XML-kommentar på 29.225 bytes, som openpyxl indlæste med ca. 50 MB allokeret. Her læses ZIP'ens
// centrale katalog (uden at pakke noget ud), og arket afvises ved for mange medlemmer, for stor samlet eller
// enkelt udpakket størrelse, et urimeligt komprimeringsforhold eller ZIP64. Ren logik, ingen node:-import.
//-----------------------------------------------------------------------

/**
 * SAMME tal som motorens `fjv/vaerksark.py` (fv-fabric2/fv-fabric3, K5-F3), så brugeren får svaret straks og ikke
 * først i importens log. Skabelonen: 15 dele, 98 kB udpakket, største 19 kB.
 */
export const ZIP_GRAENSER = {
    medlemmer: 200,
    udpakketIAlt: 32 * 1024 * 1024,
    stoersteMedlem: 16 * 1024 * 1024,
    /** Forhold udpakket/komprimeret for et medlem over `forholdFra` bytes. Rigtig regneark-XML ligger på ca. 10–20. */
    forhold: 100,
    forholdFra: 1024 * 1024,
} as const;

export interface ZipTjek { ok: boolean; fejl?: string; medlemmer?: number; udpakket?: number; stoerste?: number }

/** Læser ZIP'ens centrale katalog og håndhæver ZIP_GRAENSER. Pakker intet ud. */
export function tjekZip(b: Uint8Array): ZipTjek {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const G = ZIP_GRAENSER;
    // End of central directory: signatur 0x06054b50, højst 65.535 bytes kommentar fra slutningen.
    let eocd = -1;
    for (let i = b.byteLength - 22; i >= Math.max(0, b.byteLength - 22 - 65_535); i--) {
        if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return { ok: false, fejl: 'Filen er ikke et gyldigt Excel-ark (ZIP-kataloget mangler).' };
    const antal = v.getUint16(eocd + 10, true);
    const cdStørrelse = v.getUint32(eocd + 12, true);
    const cdStart = v.getUint32(eocd + 16, true);
    if (antal === 0xffff || cdStart === 0xffffffff || cdStørrelse === 0xffffffff) return { ok: false, fejl: 'Excel-arket bruger ZIP64 — det understøttes ikke (et værksark er langt under 4 GB).' };
    if (antal > G.medlemmer) return { ok: false, fejl: `Excel-arket har ${antal} dele (højst ${G.medlemmer}); det ligner ikke et værksark.` };
    if (cdStart + cdStørrelse > eocd) return { ok: false, fejl: 'Filen er ikke et gyldigt Excel-ark (ZIP-kataloget er beskadiget).' };
    let p = cdStart, udpakket = 0, største = 0;
    for (let n = 0; n < antal; n++) {
        if (p + 46 > eocd || v.getUint32(p, true) !== 0x02014b50) return { ok: false, fejl: 'Filen er ikke et gyldigt Excel-ark (ZIP-kataloget er beskadiget).' };
        const komp = v.getUint32(p + 20, true), ud = v.getUint32(p + 24, true);
        const navnLgd = v.getUint16(p + 28, true), ekstraLgd = v.getUint16(p + 30, true), kommLgd = v.getUint16(p + 32, true);
        if (komp === 0xffffffff || ud === 0xffffffff) return { ok: false, fejl: 'Excel-arket bruger ZIP64 — det understøttes ikke.' };
        if (ud > G.forholdFra && ud > G.forhold * Math.max(1, komp)) {
            const navn = new TextDecoder().decode(b.subarray(p + 46, p + 46 + navnLgd));
            return { ok: false, fejl: `Delen "${navn}" pakker ud til ${ud} bytes fra ${komp} (forhold over ${G.forhold}:1) — arket afvises af sikkerhedshensyn.` };
        }
        udpakket += ud; største = Math.max(største, ud);
        p += 46 + navnLgd + ekstraLgd + kommLgd;
    }
    if (største > G.stoersteMedlem) return { ok: false, fejl: `En del af Excel-arket er ${største} bytes udpakket (højst ${G.stoersteMedlem}).` };
    if (udpakket > G.udpakketIAlt) return { ok: false, fejl: `Excel-arket er ${udpakket} bytes udpakket (højst ${G.udpakketIAlt}).` };
    return { ok: true, medlemmer: antal, udpakket, stoerste: største };
}
