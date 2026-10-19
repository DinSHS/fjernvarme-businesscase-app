//-----------------------------------------------------------------------
// Informations forside: hvad modellen gør og ikke gør, i ét skærmbillede, med veje videre.
//-----------------------------------------------------------------------

import { useMemo } from "react";
import { DataTilstand, Gitter, Kort, Side } from "@/components/layout";
import type { Hentet } from "@/lib/data/hooks";
import { rutehref } from "@/lib/rute";
import { useMarkdown } from "../dokumentation/hjaelp";
import { LinkKnap } from "../dokumentation/komponenter";
import { Inl, MarkdownBlokke } from "../dokumentation/markdown/Markdown";
import { linkOmskriver } from "../dokumentation/markdown/links";
import { foersteSaetning, inlineTekst, udenTitel, type Blok } from "../dokumentation/markdown/parse";
import { useTekst } from "../dokumentation/tekster";
import { begraensninger } from "./begraensninger";
import { emneHref, gruppeInddelt, type Emne } from "./emner";
import { ordposter } from "./ordliste";
import { flertal } from "./tal";

const VEJE: readonly string[] = ["Metoden", "Balancemarkedet", "Værket og tallene"];
const intetLink = (href: string) => ({ href, ekstern: /^https?:/.test(href) });
/** "4 trin fra værk til sammenligning · 3 regler for tallene" — tæller listerne i selve forsideteksten. */
function forsideBudskab(blokke: readonly Blok[] | undefined): string | undefined {
    if (!blokke) return undefined;
    const lister = blokke.filter((b): b is Extract<Blok, { t: "liste" }> => b.t === "liste");
    const trin = lister.find((l) => l.ordnet)?.punkter.length;
    const regler = lister.find((l) => !l.ordnet)?.punkter.length;
    const dele = [trin ? `${trin} trin fra værk til sammenligning` : null, regler ? `${regler} regler for tallene` : null].filter(Boolean);
    return dele.length ? dele.join(" · ") : undefined;
}

const foersteLinje = (s: string) => foersteSaetning([{ t: "afsnit", b: [{ t: "tekst", v: s }] }]) ?? s;

/** Hvor mange begrænsninger forsiden nævner; resten står under "Kendte begrænsninger". */
const FREMVIST = 4;

export function Forside({ emner }: { emner: readonly Emne[] }) {
    const forside = useMarkdown("viden/forside.md");
    const begr = useMarkdown("viden/begraensninger.md");
    const ordliste = useMarkdown("viden/ordliste.md");
    const refJson = useTekst("viden/referencetal.json");
    const link = useMemo(() => linkOmskriver({ rute: "information", mappe: "" }), []);

    const antalOrd = ordliste.data ? ordposter(ordliste.data.blokke).length : undefined;
    const antalRef = useMemo(() => {
        if (refJson.tekst === undefined) return undefined;
        try { return (JSON.parse(refJson.tekst) as { grupper: { id: string; referencer: unknown[] }[] }).grupper.find((g) => g.id === "readme")?.referencer.length; } catch { return undefined; }
    }, [refJson.tekst]);
    const liste = begr.data ? begraensninger(begr.data.blokke) : [];

    const budskab = [
        `Modellen regner den billigste drift time for time over en periode — her står metoden, begreberne og de tal, den er prøvet mod`,
        antalOrd !== undefined && antalRef !== undefined ? `: ${flertal(emner.filter((e) => e.gruppe !== "Opslag").length, "emne", "emner")}, ${flertal(antalOrd, "fagord", "fagord")} og ${flertal(antalRef, "referencetal", "referencetal")}.` : ".",
    ].join("");

    return (
        <Side omraade="Information" titel="Metode og begreber" budskab={budskab}
            handlinger={(
                <>
                    <LinkKnap href={emneHref("ordliste")}>Ordliste</LinkKnap>
                    <LinkKnap href={emneHref("begraensninger")}>Kendte begrænsninger</LinkKnap>
                    <LinkKnap href={rutehref("dokumentation", "appens_metode")}>Hele metoden i dybden</LinkKnap>
                </>
            )}>
            <Gitter form="8-4">
                <Kort titel="Hvad modellen gør" afgraensning="kort fortalt"
                    budskab={forsideBudskab(forside.data?.blokke)}
                    fod="Skrevet til appen af fagsiden; kilderne står i teksten.">
                    <DataTilstand h={forside as Hentet<{ blokke: Blok[] }>} højde={260}>
                        {(d) => <MarkdownBlokke blokke={udenTitel(d.blokke)} link={link} />}
                    </DataTilstand>
                </Kort>
                <Kort titel="Hvad den ikke kan" afgraensning={`de ${FREMVIST} vigtigste af ${liste.length || "…"}`}
                    budskab={liste[0] ? `Først: ${foersteLinje(inlineTekst(liste[0].betyder))}` : undefined}
                    fod={<a className="fjv-lnk" href={emneHref("begraensninger")}>Se alle begrænsningerne →</a>}>
                    <DataTilstand h={begr as Hentet<{ blokke: Blok[] }>} højde={200}>
                        {() => (
                            <ul className="fjv-begr">
                                {liste.slice(0, FREMVIST).map((x, i) => (
                                    <li key={i}>
                                        <strong><Inl b={x.hvad} link={intetLink} /></strong>
                                        <span><Inl b={x.betyder} link={intetLink} /></span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </DataTilstand>
                </Kort>
            </Gitter>
            <Gitter form="4-4-4">
                {gruppeInddelt(emner).filter((g) => VEJE.includes(g.gruppe)).map((g) => (
                    <Kort key={g.gruppe} titel={g.gruppe} budskab={`${flertal(g.emner.length, "emne", "emner")}`}>
                        <ul className="fjv-veje">
                            {g.emner.map((e) => <li key={e.id}><a href={emneHref(e.id)}>{e.titel}</a></li>)}
                        </ul>
                    </Kort>
                ))}
            </Gitter>
        </Side>
    );
}
