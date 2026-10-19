// sammenlign.mjs — skema.json mod Rayfins egen analyse af entiteterne (rayfin_analyse.mjs).
//
// `forskelle(skema, analyse)` giver en liste af læsbare forskelle; tom liste = enige. Sammenlignet for
// mssql (Fabric-databasen) OG postgresql (Rayfins anden dialekt), så en skabelon i skema.json's
// `typer.<t>.rayfin` ikke kan være rigtig for den ene og forkert for den anden:
//   entiteter og tabelnavne · kolonner i rækkefølge · dbType · nullable · PK · unik · CHECK-udtryk ·
//   decoratorens max/min/værdier/precision/scale · rettigheder inkl. create-policy og update-undtagelser.

const VAERDI_NOEGLER = { text: ["max", "min"], set: ["vaerdier"], decimal: ["precision", "scale"] };

function skabelon(s, k) {
    return s
        .replace("{max}", String(k.max))
        .replace("{laengste}", k.type === "set" ? String(Math.max(...k.vaerdier.map((v) => v.length))) : "")
        .replace("{precision}", String(k.precision))
        .replace("{scale}", String(k.scale));
}

function citer(navn, dialekt) {
    return dialekt === "mssql" ? `[${navn}]` : `"${navn}"`;
}

/** Rayfins eget CHECK-udtryk (samme som fjv_skema.rayfin_check). */
export function rayfinCheck(k, dialekt) {
    const q = citer(k.navn, dialekt);
    if (k.type === "set") return `${q} IN (${k.vaerdier.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`;
    if (k.type === "text" && k.min) return `${dialekt === "mssql" ? "LEN" : "LENGTH"}(${q}) >= ${k.min}`;
    return null;
}

/** skema.json's `klient` -> Rayfins rettighedsliste for rollen `authenticated`. */
export function rayfinRettigheder(klient) {
    const ud = [];
    for (const handling of ["create", "read", "update", "delete"]) {
        const v = klient[handling];
        if (v === false || v === undefined) continue;
        if (v === true) { ud.push(handling); continue; }
        if (handling === "create" && v.policy) {
            const led = v.policy.map((b) => (b.lig === "$bruger" ? `@claims.email eq @item.${b.felt}` : `@item.${b.felt} eq '${b.lig}'`));
            ud.push({ action: "create", policy: { database: led.length === 1 ? led[0] : led.map((l) => `(${l})`).join(" and ") } });
        } else if (handling === "update" && v.undtaget) {
            ud.push({ action: "update", fields: { exclude: [...v.undtaget].sort(), include: ["*"] } });
        } else {
            ud.push({ ukendt: handling, v });
        }
    }
    return ud;
}

const nøgle = (a) => (typeof a === "string" ? a : a.action ?? JSON.stringify(a));
const normRet = (liste) =>
    [...liste]
        .map((a) => (typeof a === "object" && a.fields ? { ...a, fields: { ...a.fields, exclude: [...a.fields.exclude].sort() } } : a))
        .sort((x, y) => nøgle(x).localeCompare(nøgle(y)))
        .map((a) => JSON.stringify(a));

function metaVaerdier(m) {
    if (!m) return {};
    const ud = {};
    if ("max" in m) ud.max = m.max;
    if ("min" in m) ud.min = m.min;
    if ("enum" in m) ud.vaerdier = m.enum;
    if ("precision" in m) ud.precision = m.precision;
    if ("scale" in m) ud.scale = m.scale;
    return ud;
}

export function forskelle(skema, analyse) {
    const ud = [];
    for (const [dialekt, { entiteter }] of Object.entries(analyse.dialekter)) {
        const r = Object.fromEntries(entiteter.map((e) => [e.entitet, e]));
        const s = Object.fromEntries(skema.tabeller.map((t) => [t.entitet, t]));
        for (const e of Object.keys(s)) if (!r[e]) ud.push(`${dialekt}: ${e} står i skema.json, men er ikke en Rayfin-entitet`);
        for (const e of Object.keys(r)) if (!s[e]) ud.push(`${dialekt}: Rayfin-entiteten ${e} mangler i skema.json`);
        for (const [e, t] of Object.entries(s)) {
            const re = r[e];
            if (!re) continue;
            if (re.tabel !== t.tabel) ud.push(`${dialekt}: ${e}: tabel ${t.tabel} i skemaet, ${re.tabel} hos Rayfin`);
            const sk = t.kolonner.map((k) => k.navn);
            const rk = re.felter.map((f) => f.navn);
            if (JSON.stringify(sk) !== JSON.stringify(rk)) ud.push(`${dialekt}: ${e}: kolonner [${sk}] i skemaet, [${rk}] hos Rayfin`);
            const rf = Object.fromEntries(re.felter.map((f) => [f.navn, f]));
            for (const k of t.kolonner) {
                const f = rf[k.navn];
                if (!f) continue;
                const h = `${dialekt}: ${e}.${k.navn}`;
                const type = skabelon(skema.typer[k.type].rayfin[dialekt], k);
                if (f.dbType !== type) ud.push(`${h}: type ${type} i skemaet, ${f.dbType} hos Rayfin`);
                if (f.nullable !== k.nullable) ud.push(`${h}: nullable ${k.nullable} i skemaet, ${f.nullable} hos Rayfin`);
                if (f.pk !== Boolean(k.pk)) ud.push(`${h}: pk ${Boolean(k.pk)} i skemaet, ${f.pk} hos Rayfin`);
                if (f.unik !== Boolean(k.unik)) ud.push(`${h}: unik ${Boolean(k.unik)} i skemaet, ${f.unik} hos Rayfin`);
                const chk = rayfinCheck(k, dialekt);
                if ((f.check ?? null) !== chk) ud.push(`${h}: CHECK ${chk} i skemaet, ${f.check} hos Rayfin`);
                const forventet = {};
                for (const n of VAERDI_NOEGLER[k.type] ?? []) if (n in k) forventet[n] = k[n];
                const faktisk = metaVaerdier(f.meta);
                if (JSON.stringify(forventet) !== JSON.stringify(faktisk)) {
                    ud.push(`${h}: ${JSON.stringify(forventet)} i skemaet, ${JSON.stringify(faktisk)} i decoratoren`);
                }
            }
            const sr = normRet(rayfinRettigheder(t.klient));
            const rr = normRet(re.rettigheder.authenticated ?? []);
            const roller = Object.keys(re.rettigheder).filter((x) => x !== "authenticated");
            if (roller.length) ud.push(`${dialekt}: ${e}: Rayfin har roller ud over authenticated: ${roller}`);
            if (JSON.stringify(sr) !== JSON.stringify(rr)) ud.push(`${dialekt}: ${e}: rettigheder ${sr.join(" ")} i skemaet, ${rr.join(" ")} hos Rayfin`);
        }
    }
    return ud;
}
