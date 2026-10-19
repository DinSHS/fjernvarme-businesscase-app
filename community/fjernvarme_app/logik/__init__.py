"""Den betroede logik for Fjernvarme Businesscase i Python (brief 21 pkt. 4, fv-port).

Tro port af Functions-logikken i ``app/rayfin/functions/src`` (TypeScript), så community-udgaven og
Fabric-udgaven ikke kan blive uenige om en hash, en grænse eller en valideringsregel. Bindingen er de
fælles testvektorer i ``skema/vektorer/``, genereret ved at KØRE TS-koden (``generer.mts``).

=================  ==================================================  =============================
Modul              Indhold                                             TS-kilde
=================  ==================================================  =============================
``jsjson``         JavaScripts semantik (tal, JSON, UTF-16, Date)      (implicit i al TS)
``regler``         frysning, input_hash, grænser, anmodninger,         ``logik.ts``, ``frysning.ts``,
                   værksændringer, nyt værk, modelkrav                 ``sti.ts``
``tidsserie``      upload-validering (via fv-data's orakel),           ``tidsserie.ts``
                   validering_json, tæt række, værkstræ
``zipkontrol``     værksarkets ZIP-katalog                             ``zip.ts``
``vaerksark``      uploadVaerksark-forløbet mod ``VaerksarkDeps``      ``vaerksark.ts``
``tjenester``      Functions-forløbene mod ``lager.BetroetLager``      ``function_app.ts``
``lager``          protokollen + ``UnikBrud``                          (``function_app.ts``' SQL)
``lager_minne``    hukommelsesudgaven = kørbar spec for protokollen    —
=================  ==================================================  =============================

Kun standardbiblioteket (+ ``fjv`` for oraklet). Ingen SQL, intet netværk.
"""

from .regler import (  # noqa: F401
    Afvisning, FARLIGE_SEGMENTER, GRAENSER, KODE_MOENSTER, KOERSEL_PRAEFIKS, MAKS_BLADE, MAKS_DELE, MAKS_JSON,
    MAKS_STI, MIN_DAEKNING_VARMELAST, MODEL_STANDARD, RESERVEREDE_KODER, SOLPROFIL_MARKOER, TIDSSERIE_VALG_PRAEFIKS,
    TILLADTE_FLAG, byg_frosset_input, effektiv_akse, frossen_sti, frossen_tidsserie, gyldig_sti, ikke_endelig,
    input_hash, laes_anmodning, laes_json, periode_doegn, planlaeg_parametre, saml_nyt_vaerk, som_float,
    tjek_modelkrav,
)
from .tidsserie import (  # noqa: F401
    MAKS_POSITIONER, MAKS_UPLOAD_BYTES, MAKS_VAERKSARK_BYTES, ForLangRaekke, sha256_bytes, sha256_hex, taet_raekke,
    vaerk_trae, valider_upload, validering_json,
)
from .zipkontrol import ZIP_GRAENSER, tjek_zip  # noqa: F401
from .vaerksark import behandl_vaerksark  # noqa: F401
