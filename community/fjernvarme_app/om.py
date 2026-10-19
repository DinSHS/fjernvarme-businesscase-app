"""``GET /api/om`` — fuld kredit til den oprindelige case (brief 21 punkt 8).

Faktaene kommer fra ``offentlig/kredit.json`` (hentet ordret fra de to repoer ved de pinnede commits) og
licensteksterne fra ``LICENSES/``; de pinnede commits fra motoren (``fjv.konstanter``) og databasens
Motor-række. Intet her antyder, at forfatteren, Billund Fjernvarme eller Dansk Fjernvarme står bag appen.
"""

from __future__ import annotations

import json

from . import __version__, miljoe

SAETNING = ("Denne app er en brugerflade til fjernvarme-businesscase-modellen. Metoden, valideringen og "
            "referencetallene er forfatterens; appen ændrer ikke modellen, men kører den uændret på en pinnet "
            "commit. Appen er ikke udviklet, godkendt eller støttet af forfatteren, Billund Fjernvarme eller "
            "Dansk Fjernvarme.")
KREDITLINJE = ("Bygger på fjernvarme-businesscase af skj-1964 (MIT), udviklet med Billund Fjernvarme og "
               "Dansk Fjernvarme · data fra df-data")


def _kredit() -> dict:
    return json.loads(miljoe.ressource("offentlig/kredit.json").read_text(encoding="utf-8"))


def _licens(sti: str) -> str | None:
    try:
        return miljoe.ressource(sti).read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def om(app=None) -> dict:
    from fjv import konstanter as K
    k = _kredit()
    pins = {"model_commit": K.MODEL_COMMIT, "data_commit": K.DF_DATA_SHA, "kilde": "motorens pin"}
    if app is not None:
        from . import lokal_lager as LL
        try:
            pins = LL.motor_pins(app.db)
        except Exception:
            pass
    model, data = k["model"], k["data"]
    return {
        "kreditlinje": KREDITLINJE,
        "saetning": SAETNING,
        "model": {"repo": model["repo"], "url": model["url"], "licens": model["licens"],
                  "ophavsret": model["ophavsret"], "commit": pins["model_commit"],
                  "commit_url": f"{model['url']}/tree/{pins['model_commit']}",
                  "licenstekst": _licens(model["licensfil"])},
        "data": {"repo": data["repo"], "url": data["url"], "licens": data["licens"],
                 "ophavsret": data["ophavsret"], "commit": pins["data_commit"],
                 "commit_url": f"{data['url']}/tree/{pins['data_commit']}",
                 "licenstekst": _licens(data["licensfil"]),
                 "kilder": k.get("kilder", [])},
        "forfatter": k.get("forfatter"),
        "udviklet_med": k.get("partnere", []),
        "distribution": ("Modellens kode distribueres ikke med appen: den hentes som zip fra GitHub på den "
                         "pinnede commit, når den første kørsel startes."),
        "app": {"udgave": "community", "version": __version__},
    }
