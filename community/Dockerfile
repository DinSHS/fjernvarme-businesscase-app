# Fjernvarme Businesscase — community-udgaven i en container.
#
# Bygger på github.com/skj-1964/fjernvarme-businesscase (MIT) og github.com/skj-1964/df-data (CC BY 4.0).
# Modellens kode er IKKE i billedet: arbejderen henter den på den pinnede commit ved første kørsel (CREDITS.md).
#
# Byg fra repoets rod (kernen genbruges fra fabric/, skema/, viden/, offentlig/, LICENSES/):
#     cd app && npm ci && npm run build:community && cd ..     # frontenden til app/dist-rest (påkrævet her)
#     docker build -f community/Dockerfile -t fjernvarme-app .
#     docker run --rm -p 8000:8000 -v fjv-data:/data fjernvarme-app --demo
#
# Appen har intet login: udgiv kun porten til localhost, eller sæt en proxy med login foran (--bruger-header).

FROM python:3.13-slim AS byg
WORKDIR /src
COPY community/ community/
COPY fabric/fjv/ fabric/fjv/
COPY fabric/maaleregister.json fabric/
COPY skema/ skema/
COPY viden/data_krav.json viden/
COPY viden/vaerktoej/valider_tidsserie.py viden/vaerktoej/
COPY offentlig/kredit.json offentlig/
COPY LICENSES/ LICENSES/
COPY CREDITS.md NOTICE LICENSE ./
COPY app/dist-rest/ app/dist-rest/
RUN pip install --no-cache-dir setuptools wheel \
 && python community/pakke.py --ud /hjul

FROM python:3.13-slim
ENV PYTHONUTF8=1 PYTHONUNBUFFERED=1 FJV_DATA=/data FJV_VAERT=0.0.0.0 FJV_BRUGER=bruger@lokal
COPY --from=byg /hjul/ /hjul/
RUN pip install --no-cache-dir "$(ls /hjul/fjernvarme_app-*.whl)[model]" && rm -rf /hjul
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["python", "-m", "fjernvarme_app", "--ikke-aaben"]
