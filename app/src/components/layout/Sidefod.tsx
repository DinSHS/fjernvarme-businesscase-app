//-----------------------------------------------------------------------
// Appens sidefod: den faste kreditlinje på ALLE sider (brief 21 punkt 8).
// Skallen ejer placeringen og layout-hooken data-layout="kreditlinje" (som
// tjek_offentlig.py og layout-tjekket ser efter); teksten og linkene ejes af
// Dokumentation (src/sider/dokumentation/kredit.ts). Sidefod, ikke sidehoved:
// ingen navne eller logoer i toppen (brief 22).
//-----------------------------------------------------------------------

import { Kreditlinje } from "@/sider/dokumentation/Kreditlinje";

export function Sidefod() {
    return (
        <div className="fjv-sidefod" data-layout="kreditlinje">
            <Kreditlinje />
        </div>
    );
}
