"""fjv — regnemotoren for Fjernvarme Businesscase i Fabric.

Pakken kører i en Fabric **Python-notebook** (ikke Spark) og lokalt. Den er
bevidst stdlib + pyyaml: tredjepartsbibliotekerne (linopy, highspy, xarray …)
bruges kun af modelrepoets ``run_case.py``, som køres som en underproces i sit
eget miljø. Notebookens kerne røres derfor aldrig af modellens pakkeversioner.

Moduler:

=================  ==========================================================
``konstanter``     pinnede SHA'er og stier i lakehouset (KONTRAKT §4)
``runtime``        hent/udpak kode og df-data, byg kørselsmiljø, mål runtime
``flad``           case-YAML <-> blade (KONTRAKT §3.2) og ``afflad``
``byg_case``       værk + scenarie + ændringer -> case-dict + kommandolinje
``resultater``     run_case-output -> rækker til §3.6-3.9
``db``             skriv/læs appens Fabric SQL-database
=================  ==========================================================
"""
