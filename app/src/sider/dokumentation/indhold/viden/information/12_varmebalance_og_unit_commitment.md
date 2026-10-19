# Varmebalancen og start/stop (unit commitment)

## Varmebalancen

I hver time skal varmen gå op: **produktion + afladning af tanken − ladning af tanken = varmebehov**.
Med balancemarkedet trækkes den forventede varme fra, som ikke produceres, når en varmepumpe eller
elkedel aktiveres og stopper. (Kilde: rapport v4, bilag B)

Modellen vælger for hver time, hvor meget hver enhed producerer, inden for enhedens loft:

- fast nominel effekt (`p_max_heat`) for de fleste enheder,
- for varmepumpen med ydelsestabel: det mindste af nominel effekt og tabellens varme ved timens
  udetemperatur,
- for solvarme: det mindste af nominel effekt og solprofilen i den time.

(Kilde: src/model.py:155-194)

Produktionen må ligge under loftet; overskydende sol kan altså lades ligge, når tanken er fuld.
(Kilde: src/model.py:159-160)

## Start/stop — unit commitment

Nogle kedler kan ikke køre vilkårligt lavt eller tænde og slukke time for time: en halmkedel har
minimumslast og skal køre et antal timer, når den først er startet. Modellen beskriver det med
tænd/sluk-variable pr. time:

| Felt | Betydning |
|---|---|
| `p_min_heat` | laveste last, når enheden er tændt |
| `min_uptime` | timer enheden skal køre efter en start |
| `min_downtime` | timer enheden skal stå efter et stop |
| `start_cost` | omkostning pr. start |
| `initial_status` | tændt (1) eller slukket (0) i første time |

(Kilde: src/config.py:496-520; rapport v4, bilag B)

Felterne virker **kun**, når enheden har `uc_enabled: true`. Ellers kan enheden køre fra 0 til fuld
last i hver time. (Kilde: src/config.py:514-520)

Start/stop gør problemet til et heltalsproblem (MILP). Det er det, der gør et helår tungt: fra et halvt
minut til over et kvarter, afhængigt af hvor mange enheder der har start/stop og hvor lange
minimumstiderne er. (Kilde: doc/EGET_VAERK.md:124-129)

**Pas på starttilstanden.** Kedler, der er tændt ved periodens start og har minimumslast, kan om
sommeren give mere varme, end nettet aftager. Med en tank går det; uden tank bliver modellen
uløselig. Billund-casene starter derfor flis- og halmkedlen slukket 1. juli. (Kilde: rapport v4 §4.4;
README.md:131-133)
