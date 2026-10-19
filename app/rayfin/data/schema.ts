import { Vaerk } from './Vaerk.js';
import { VaerkParameter } from './VaerkParameter.js';
import { Aendringslog } from './Aendringslog.js';
import { Aendringsanmodning } from './Aendringsanmodning.js';
import { Scenarie } from './Scenarie.js';
import { ScenarieAendring } from './ScenarieAendring.js';
import { Bestilling } from './Bestilling.js';
import { Koersel } from './Koersel.js';
import { KoerselInput } from './KoerselInput.js';
import { KoerselNoegletal } from './KoerselNoegletal.js';
import { KoerselMaaned } from './KoerselMaaned.js';
import { KoerselTime } from './KoerselTime.js';
import { Motor } from './Motor.js';
import { Tidsserie } from './Tidsserie.js';
import { Vaerksarkimport } from './Vaerksarkimport.js';

export type FjvSchema = {
    Vaerk: Vaerk;
    VaerkParameter: VaerkParameter;
    Aendringslog: Aendringslog;
    Aendringsanmodning: Aendringsanmodning;
    Scenarie: Scenarie;
    ScenarieAendring: ScenarieAendring;
    Bestilling: Bestilling;
    Koersel: Koersel;
    KoerselInput: KoerselInput;
    KoerselNoegletal: KoerselNoegletal;
    KoerselMaaned: KoerselMaaned;
    KoerselTime: KoerselTime;
    Motor: Motor;
    Tidsserie: Tidsserie;
    Vaerksarkimport: Vaerksarkimport;
};

export const schema = [
    Vaerk, VaerkParameter, Aendringslog, Aendringsanmodning, Scenarie, ScenarieAendring,
    Bestilling, Koersel, KoerselInput, KoerselNoegletal, KoerselMaaned, KoerselTime, Motor, Tidsserie, Vaerksarkimport,
];
