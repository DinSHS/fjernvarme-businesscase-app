//-----------------------------------------------------------------------
// Omskrivning af links i bundtede dokumenter (regel fra viden/dokumentation_indeks.json):
//   * link til et dokument, der er bundtet            -> intern visning  #/dokumentation/<id>[#anker]
//   * link til en fil, der ikke bundtes               -> GitHub ved den pinnede commit
//   * #anker i samme dokument                          -> #/<område>/<side>#anker (hash-routing bevares)
//   * link der allerede er en appsti (#/…)             -> uændret
//   * http(s)/mailto                                   -> uændret, åbnes i ny fane
// Relative stier opløses mod dokumentets egen mappe i modelrepoet.
//-----------------------------------------------------------------------

import { DOKUMENTER, type Dok } from "../dokumenter";
import { githubUrl } from "../kilde";
import type { LinkOmskriver, LinkSvar } from "./Markdown";

/** Normaliserer en repo-sti: fjerner `./`, opløser `../`; `undefined` hvis den peger uden for repoet. */
export function normaliserSti(sti: string): string | undefined {
    const ud: string[] = [];
    for (const del of sti.split("/")) {
        if (del === "" || del === ".") continue;
        if (del === "..") { if (ud.length === 0) return undefined; ud.pop(); continue; }
        ud.push(del);
    }
    return ud.join("/") + (sti.endsWith("/") && ud.length ? "/" : "");
}

const ER_ABSOLUT = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Repo-sti -> dokument-id for de dokumenter, der er bundtet som tekst. */
const BUNDTET_SOM_STI = new Map<string, Dok>(
    DOKUMENTER.filter((d) => d.kilde === "modelrepo" && d.fil).map((d) => [d.sti, d]),
);

/**
 * Filer, som modelrepoets egne tekster stadig linker til på den gamle plads. Målt ved eef950a: README, CONTRIBUTING og
 * EGET_VAERK peger på `doc/vaerksdata_skabelon.xlsx` og `doc/*.docx`, men filerne er flyttet. Uden omdirigering giver
 * linket 404 på GitHub. Fjern en linje, når modelrepoet selv har rettet linket.
 */
export const FLYTTEDE_FILER: ReadonlyMap<string, string> = new Map([
    ["doc/vaerksdata_skabelon.xlsx", "vaerksdata_skabelon.xlsx"],
    ["doc/rapport_billund_v4.docx", "doc/arkiv/rapport_billund_v4.docx"],
    ["doc/notat_bestyrelse_datasikkerhed.docx", "doc/arkiv/notat_bestyrelse_datasikkerhed.docx"],
]);

export interface LinkKontekst {
    /** Rute for siden, hvor teksten vises, uden anker: `dokumentation/readme`. */
    rute: string;
    /** Mappe i modelrepoet, relative links opløses mod (tom = repoets rod). */
    mappe: string;
}

/** Linkets endelige mål — ren funktion, testes uden React. */
export function omskrivLink(href: string, k: LinkKontekst): LinkSvar {
    const h = href.trim();
    if (h === "") return { href: "#", ekstern: false };
    if (h.startsWith("#/")) return { href: h, ekstern: false };
    if (ER_ABSOLUT.test(h)) return { href: h, ekstern: true };
    if (h.startsWith("#")) return { href: `#/${k.rute}${h}`, ekstern: false };

    const [stiDel, ...ankerDele] = h.split("#");
    const anker = ankerDele.length ? ankerDele.join("#") : undefined;
    const opløst = stiDel.startsWith("/") ? normaliserSti(stiDel) : normaliserSti(`${k.mappe}/${stiDel}`);
    if (opløst === undefined) return { href: githubUrl("", "tree"), ekstern: true };
    const sti = FLYTTEDE_FILER.get(opløst) ?? opløst;

    const dok = BUNDTET_SOM_STI.get(sti);
    if (dok) return { href: `#/dokumentation/${dok.id}${anker ? `#${anker}` : ""}`, ekstern: false };

    if (sti.endsWith("/")) return { href: githubUrl(sti, "tree"), ekstern: true };
    if (/\.(xlsx|docx)$/i.test(sti)) return { href: githubUrl(sti, "raw"), ekstern: true };
    return { href: githubUrl(sti, "blob", anker), ekstern: true };
}

export function linkOmskriver(k: LinkKontekst): LinkOmskriver {
    return (href) => omskrivLink(href, k);
}

/** Kontekst for et dokument: repodokumenter opløser mod deres egen mappe, appens tekster mod repoets rod. */
export function kontekstFor(d: Dok): LinkKontekst {
    const mappe = d.kilde === "modelrepo" ? d.sti.split("/").slice(0, -1).join("/") : "";
    return { rute: `dokumentation/${d.id}`, mappe };
}
