//-----------------------------------------------------------------------
// "Data i denne kørsel" (KONTRAKT §6d sidste punkt; brief 18): kørslens fulde
// datagrundlag, frosset ved bestillingen. Linjerne og deres tekster er
// fv-datas (data_krav.json → data_i_koersel); udfyldningen er datagrundlag.ts.
//-----------------------------------------------------------------------

import { Kort } from "@/components/layout";
import { datagrundlag } from "./datagrundlag";
import type { Pakke } from "./data";
import { Fakta } from "./dele";

export function DataIKoersel({ d }: { d: Pakke }) {
    const linjer = datagrundlag(d.k, d.vaerkNavn, d.profil, d.input, d.tidsserienavne);
    const v = (etiket: string) => linjer.find((x) => x.etiket === etiket);
    const bal = v("Balancemarked");
    const budskab = [
        v("Spotpris")?.vaerdi, v("Udetemperatur")?.vaerdi,
        bal ? (bal.med ? `balancemarked ${bal.vaerdi.replace(/^aFRR, mFRR-kapacitet, mFRR-aktivering og ubalancepris for /, "")}` : "intet balancemarked") : null,
        v("Varmelast") ? `varmelast: ${v("Varmelast")!.vaerdi}` : null,
    ].filter(Boolean).join(" · ");
    const fodnoter = linjer.filter((x) => x.fodnote).map((x) => `${x.etiket}: ${x.fodnote}`);
    return (
        <Kort titel="Data i denne kørsel" afgraensning="frosset ved bestillingen" budskab={budskab ? `Indgik: ${budskab}.` : undefined}
            fod={<>Alt her er læst af kørslen og dens frosne input — ikke af værket, som det ser ud nu. En tidsseries navn slås op; sha256 er det frosne.
                {fodnoter.length > 0 && <> {fodnoter.join(" ")}</>}</>}>
            <Fakta par={linjer.map((x) => [x.etiket, (
                <span key={x.etiket} className={x.med ? undefined : "fjv-a-svag"} title={x.fuld ?? undefined} data-data-linje={x.etiket}>{x.vaerdi}</span>
            )] as const)} />
        </Kort>
    );
}
