# fjv_selvtest

Kører **modelrepoets egen pytest-suite i Fabric** (husets lektie: en grøn lokal suite
siger kun, at koden er konsistent med *den maskines* antagelser) og en røgtest
(`run_case.py cases/andeby.yaml --dummy`).

Undervejs måles runtime: Python-version, CPU, RAM, om `git` findes, og hvilke
pakkeversioner underprocessen faktisk fik efter `pip install -r requirements.txt`.

Resultat: `Files/_run/fjv_selvtest.json` (skrives uanset udfald). Notebooken
rejser til sidst, hvis noget fejlede, så jobstatus også bliver `Failed`.

Forventet: samme **total** som lokalt; fordelingen bestået/sprunget over må gerne
afvige, hvis en test er miljøafhængig — men så skal det stå i rapporten hvorfor.
