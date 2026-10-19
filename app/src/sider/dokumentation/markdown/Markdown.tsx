//-----------------------------------------------------------------------
// Renderer for markdown-træet fra parse.ts. Bygger React-elementer — aldrig HTML-strenge —
// så kildens indhold ikke kan blive til markup. Ekstern link åbnes i ny fane med
// rel="noopener noreferrer"; interne links omskrives af `link` (se links.ts).
//-----------------------------------------------------------------------

import { Fragment, type ReactNode } from "react";
import { ANKER_PREFIX, type Blok, type Inline } from "./parse";
import "./markdown.css";

export interface LinkSvar { href: string; ekstern: boolean }
export type LinkOmskriver = (href: string) => LinkSvar;

/** Inline-træ som React-noder (til sider, der selv bygger afsnit af markdown-dele). */
export function Inl({ b, link }: { b: readonly Inline[]; link: LinkOmskriver }): ReactNode {
    return b.map((n, i) => {
        switch (n.t) {
            case "tekst": return <Fragment key={i}>{n.v}</Fragment>;
            case "kode": return <code key={i} className="fjv-md-kode">{n.v}</code>;
            case "fed": return <strong key={i}><Inl b={n.b} link={link} /></strong>;
            case "kursiv": return <em key={i}><Inl b={n.b} link={link} /></em>;
            case "streg": return <s key={i}><Inl b={n.b} link={link} /></s>;
            case "br": return <br key={i} />;
            case "link": {
                const l = link(n.href);
                return l.ekstern
                    ? <a key={i} href={l.href} target="_blank" rel="noopener noreferrer"><Inl b={n.b} link={link} /></a>
                    : <a key={i} href={l.href}><Inl b={n.b} link={link} /></a>;
            }
        }
    });
}

function Bl({ b, link }: { b: Blok; link: LinkOmskriver }): ReactNode {
    switch (b.t) {
        case "overskrift": {
            const Tag = (b.niveau <= 2 ? "h3" : b.niveau === 3 ? "h4" : "h5") as "h3" | "h4" | "h5";
            return <Tag id={ANKER_PREFIX + b.id} data-niveau={b.niveau} className="fjv-md-h"><Inl b={b.b} link={link} /></Tag>;
        }
        case "afsnit": return <p><Inl b={b.b} link={link} /></p>;
        case "kode": return <pre className="fjv-md-pre" tabIndex={0}><code>{b.v}</code></pre>;
        case "citat": return <blockquote className="fjv-md-citat"><Blokke b={b.b} link={link} /></blockquote>;
        case "streg": return <hr className="fjv-md-streg" />;
        case "liste": {
            const Tag = b.ordnet ? "ol" : "ul";
            return (
                <Tag start={b.ordnet && b.start !== 1 ? b.start : undefined}>
                    {b.punkter.map((p, i) => <li key={i}><Blokke b={p} link={link} tæt /></li>)}
                </Tag>
            );
        }
        case "tabel":
            return (
                <div className="fjv-tabelrul">
                    <table className="fjv-tabel fjv-md-tabel" data-layout="tabel">
                        <thead>
                            <tr>{b.hoved.map((h, i) => <th key={i} className={b.just[i] === "hojre" ? "fjv-h" : undefined}><Inl b={h} link={link} /></th>)}</tr>
                        </thead>
                        <tbody>
                            {b.raekker.map((r, i) => (
                                <tr key={i}>{r.map((c, j) => <td key={j} className={b.just[j] === "hojre" ? "fjv-h" : undefined}><Inl b={c} link={link} /></td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
    }
}

/** `tæt`: et listepunkts eneste afsnit vises uden afsnitsmellemrum. */
function Blokke({ b, link, tæt }: { b: readonly Blok[]; link: LinkOmskriver; tæt?: boolean }): ReactNode {
    return b.map((x, i) => (
        <Fragment key={i}>
            {tæt && b.length === 1 && x.t === "afsnit" ? <Inl b={x.b} link={link} /> : <Bl b={x} link={link} />}
        </Fragment>
    ));
}

export function MarkdownBlokke({ blokke, link }: { blokke: readonly Blok[]; link: LinkOmskriver }) {
    return <div className="fjv-md fjv-brod"><Blokke b={blokke} link={link} /></div>;
}
