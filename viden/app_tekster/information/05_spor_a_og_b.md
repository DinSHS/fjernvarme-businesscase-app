# Spor A og Spor B

To måder at regne balancemarkedet på, til to forskellige spørgsmål.

| | Spor A — normativ | Spor B — beskrivende |
|---|---|---|
| Spørgsmål | Hvad *kunne* værket tjene med fuld tilgængelighed? | Hvad gav modellen med den reservation, værket faktisk stillede til rådighed? |
| Reservation | frit inden for lofterne og en kapacitetsprisgate | værkets egen reserverede mængde pr. marked og måned som loft |
| Brug | **øvre grænse**, ikke en prognose | validering mod afregning; forudsiger ikke |

(Kilde: doc/BALANCEMARKED.md:112-120)

**Hvorfor Spor A kun er et loft:** uden Billunds eget månedsloft reserverede modellen 3–8 gange mere,
end Billund faktisk gjorde. Den bindende begrænsning for et værk er budadfærd og tilgængelighed,
ikke optimeringen. (Kilde: rapport v4 §2.2; README.md:121-122)

**Hvorfor Spor B ikke forudsiger:** dets vigtigste input er værkets faktiske adfærd i samme periode.
Månedsloftet beskriver ét værk i én periode og kan ikke overføres til andre værker eller perioder.
(Kilde: rapport v4 §2.2; doc/BALANCEMARKED.md:155-156)

**Valideringen:** Spor B mod Billunds afregning for marts–juni 2026 ramte 121 % (aFRR 108 %, mFRR
132 %). mFRR-kapaciteten ligger 39 % for højt, fordi modellen kender kapacitetsprisen på forhånd og
samler reservationen i få, dyre timer. (Kilde: rapport v4 §5.2)

**Andeby** har aktiveringsmekanismerne fra valideringen, men ikke Billunds månedslofter. Andebys
balancetal er derfor et potentiale ved fuld tilgængelighed — sig det, når tallene vises.
(Kilde: cases/andeby.yaml:454-458)
