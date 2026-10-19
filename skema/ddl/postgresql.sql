-- Fjernvarme Businesscase — databaseskema version 1 (postgresql).
-- GENERERET af skema/byg.py fra skema/skema.json. Ret aldrig her; ret skema.json og kør byg.py.
-- Community-profilen: Fabric-udgavens database laves af Rayfin ud fra app/rayfin/data/*.ts (se SKEMA.md).

-- Vaerk
CREATE TABLE "Vaerks" (
    "id" UUID NOT NULL,
    "kode" VARCHAR(60) NOT NULL,
    "navn" VARCHAR(200) NOT NULL,
    "beskrivelse" VARCHAR(4000),
    "kilde" VARCHAR(4) NOT NULL,
    "kilde_fil" VARCHAR(300),
    "repo_commit" VARCHAR(40),
    "kopieret_fra_id" UUID,
    "revision" INTEGER NOT NULL,
    "arkiveret" BOOLEAN NOT NULL,
    "oprettet_af" VARCHAR(200) NOT NULL,
    "aendret_af" VARCHAR(200) NOT NULL,
    "oprettet" TIMESTAMP(3) NOT NULL,
    "aendret" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PK_Vaerks" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_Vaerks_kode" UNIQUE ("kode"),
    CONSTRAINT "CK_Vaerks_kode_minlen" CHECK (LENGTH(RTRIM("kode", ' ')) >= 1),
    CONSTRAINT "CK_Vaerks_navn_minlen" CHECK (LENGTH(RTRIM("navn", ' ')) >= 1),
    CONSTRAINT "CK_Vaerks_kilde" CHECK ("kilde" IN ('repo', 'app')),
    CONSTRAINT "CK_Vaerks_oprettet_af_minlen" CHECK (LENGTH(RTRIM("oprettet_af", ' ')) >= 1),
    CONSTRAINT "CK_Vaerks_aendret_af_minlen" CHECK (LENGTH(RTRIM("aendret_af", ' ')) >= 1)
);
CREATE INDEX "IX_Vaerks_kopieret_fra_id" ON "Vaerks" ("kopieret_fra_id");

-- VaerkParameter
CREATE TABLE "VaerkParameters" (
    "id" UUID NOT NULL,
    "vaerk_id" UUID NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "vaerdi_json" VARCHAR(4000) NOT NULL,
    "sektion" VARCHAR(60) NOT NULL,
    "objekt" VARCHAR(120),
    "kommentar" VARCHAR(2000),
    "bekraeft" BOOLEAN NOT NULL,
    "raekkefoelge" INTEGER NOT NULL,
    "aendret_af" VARCHAR(200) NOT NULL,
    "aendret" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PK_VaerkParameters" PRIMARY KEY ("id"),
    CONSTRAINT "CK_VaerkParameters_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1),
    CONSTRAINT "CK_VaerkParameters_vaerdi_json_minlen" CHECK (LENGTH(RTRIM("vaerdi_json", ' ')) >= 1),
    CONSTRAINT "CK_VaerkParameters_sektion_minlen" CHECK (LENGTH(RTRIM("sektion", ' ')) >= 1),
    CONSTRAINT "CK_VaerkParameters_aendret_af_minlen" CHECK (LENGTH(RTRIM("aendret_af", ' ')) >= 1)
);
CREATE UNIQUE INDEX "UX_VaerkParameters_en_vaerdi_pr_sti" ON "VaerkParameters" ("vaerk_id", "sti");

-- Aendringslog
CREATE TABLE "Aendringslogs" (
    "id" UUID NOT NULL,
    "vaerk_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "handling" VARCHAR(5) NOT NULL,
    "gammel_json" VARCHAR(4000),
    "ny_json" VARCHAR(4000),
    "aendret_af" VARCHAR(200) NOT NULL,
    "tidspunkt" TIMESTAMP(3) NOT NULL,
    "anmodning_id" UUID,
    CONSTRAINT "PK_Aendringslogs" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Aendringslogs_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1),
    CONSTRAINT "CK_Aendringslogs_handling" CHECK ("handling" IN ('opret', 'ret', 'slet')),
    CONSTRAINT "CK_Aendringslogs_aendret_af_minlen" CHECK (LENGTH(RTRIM("aendret_af", ' ')) >= 1)
);
CREATE INDEX "IX_Aendringslogs_vaerk_id" ON "Aendringslogs" ("vaerk_id");
CREATE INDEX "IX_Aendringslogs_anmodning_id" ON "Aendringslogs" ("anmodning_id");

-- Aendringsanmodning
CREATE TABLE "Aendringsanmodnings" (
    "id" UUID NOT NULL,
    "vaerk_id" UUID NOT NULL,
    "forventet_revision" INTEGER NOT NULL,
    "aendringer_json" VARCHAR(4000) NOT NULL,
    "anmodet_af" VARCHAR(200) NOT NULL,
    "anmodet" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(7) NOT NULL,
    "svar" VARCHAR(2000),
    CONSTRAINT "PK_Aendringsanmodnings" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Aendringsanmodnings_aendringer_json_minlen" CHECK (LENGTH(RTRIM("aendringer_json", ' ')) >= 2),
    CONSTRAINT "CK_Aendringsanmodnings_anmodet_af_minlen" CHECK (LENGTH(RTRIM("anmodet_af", ' ')) >= 1),
    CONSTRAINT "CK_Aendringsanmodnings_status" CHECK ("status" IN ('ny', 'udfoert', 'afvist'))
);
CREATE INDEX "IX_Aendringsanmodnings_vaerk_id" ON "Aendringsanmodnings" ("vaerk_id");

-- Scenarie
CREATE TABLE "Scenaries" (
    "id" UUID NOT NULL,
    "vaerk_id" UUID NOT NULL,
    "navn" VARCHAR(200) NOT NULL,
    "beskrivelse" VARCHAR(4000),
    "reference_scenarie_id" UUID,
    "periode_start" VARCHAR(20),
    "periode_slut" VARCHAR(20),
    "med_balancering" BOOLEAN NOT NULL,
    "balancing_method" VARCHAR(16),
    "mip_rel_gap" NUMERIC(18,10),
    "mip_abs_gap" NUMERIC(28,4),
    "tidsgraense_s" INTEGER,
    "ekstra_flag" VARCHAR(300),
    "heat_csv" VARCHAR(300),
    "arkiveret" BOOLEAN NOT NULL,
    "oprettet_af" VARCHAR(200) NOT NULL,
    "oprettet" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PK_Scenaries" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Scenaries_navn_minlen" CHECK (LENGTH(RTRIM("navn", ' ')) >= 1),
    CONSTRAINT "CK_Scenaries_balancing_method" CHECK ("balancing_method" IN ('legacy', 'activation_value')),
    CONSTRAINT "CK_Scenaries_oprettet_af_minlen" CHECK (LENGTH(RTRIM("oprettet_af", ' ')) >= 1)
);
CREATE INDEX "IX_Scenaries_vaerk_id" ON "Scenaries" ("vaerk_id");
CREATE INDEX "IX_Scenaries_reference_scenarie_id" ON "Scenaries" ("reference_scenarie_id");

-- ScenarieAendring
CREATE TABLE "ScenarieAendrings" (
    "id" UUID NOT NULL,
    "scenarie_id" UUID NOT NULL,
    "type" VARCHAR(7) NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "vaerdi_json" VARCHAR(4000),
    "raekkefoelge" INTEGER NOT NULL,
    CONSTRAINT "PK_ScenarieAendrings" PRIMARY KEY ("id"),
    CONSTRAINT "CK_ScenarieAendrings_type" CHECK ("type" IN ('set', 'enable', 'disable')),
    CONSTRAINT "CK_ScenarieAendrings_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1)
);
CREATE INDEX "IX_ScenarieAendrings_scenarie_id" ON "ScenarieAendrings" ("scenarie_id");

-- Bestilling
CREATE TABLE "Bestillings" (
    "id" UUID NOT NULL,
    "scenarie_id" UUID NOT NULL,
    "klient_noegle" VARCHAR(60) NOT NULL,
    "bestilt_af" VARCHAR(200) NOT NULL,
    "bestilt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PK_Bestillings" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_Bestillings_klient_noegle" UNIQUE ("klient_noegle"),
    CONSTRAINT "CK_Bestillings_klient_noegle_minlen" CHECK (LENGTH(RTRIM("klient_noegle", ' ')) >= 1),
    CONSTRAINT "CK_Bestillings_bestilt_af_minlen" CHECK (LENGTH(RTRIM("bestilt_af", ' ')) >= 1)
);
CREATE INDEX "IX_Bestillings_scenarie_id" ON "Bestillings" ("scenarie_id");

-- Koersel
CREATE TABLE "Koersels" (
    "id" UUID NOT NULL,
    "bestilling_id" UUID NOT NULL,
    "scenarie_id" UUID NOT NULL,
    "vaerk_id" UUID NOT NULL,
    "vaerk_revision" INTEGER NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "fase" VARCHAR(200),
    "bestilt_af" VARCHAR(200) NOT NULL,
    "bestilt" TIMESTAMP(3) NOT NULL,
    "modtaget" TIMESTAMP(3),
    "startet" TIMESTAMP(3),
    "afsluttet" TIMESTAMP(3),
    "hjerteslag" TIMESTAMP(3),
    "annuller_anmodet" TIMESTAMP(3),
    "forsoeg" INTEGER NOT NULL,
    "arbejder_id" VARCHAR(100),
    "fabric_job_id" VARCHAR(100),
    "kilde" VARCHAR(8) NOT NULL,
    "model_commit" VARCHAR(40),
    "data_commit" VARCHAR(40),
    "miljoe_json" VARCHAR(4000),
    "case_sti" VARCHAR(400),
    "output_sti" VARCHAR(400),
    "output_stem" VARCHAR(400),
    "oploesning" VARCHAR(10),
    "interval_min" INTEGER,
    "antal_interval_model" INTEGER,
    "antal_interval_csv" INTEGER,
    "solve_status" VARCHAR(60),
    "er_milp" BOOLEAN,
    "objektiv_dkk" NUMERIC(28,4),
    "oensket_rel_gap" NUMERIC(18,10),
    "oensket_abs_gap" NUMERIC(28,4),
    "opnaaet_gap" NUMERIC(18,10),
    "best_bound" NUMERIC(28,4),
    "loesetid_s" NUMERIC(18,3),
    "fejlbesked" VARCHAR(4000),
    "manifest_json" VARCHAR(4000),
    CONSTRAINT "PK_Koersels" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_Koersels_bestilling_id" UNIQUE ("bestilling_id"),
    CONSTRAINT "CK_Koersels_input_hash_minlen" CHECK (LENGTH(RTRIM("input_hash", ' ')) >= 64),
    CONSTRAINT "CK_Koersels_status" CHECK ("status" IN ('koe', 'startet', 'koerer', 'indlaeser', 'faerdig', 'fejl', 'annulleret')),
    CONSTRAINT "CK_Koersels_bestilt_af_minlen" CHECK (LENGTH(RTRIM("bestilt_af", ' ')) >= 1),
    CONSTRAINT "CK_Koersels_kilde" CHECK ("kilde" IN ('app', 'notebook'))
);
CREATE INDEX "IX_Koersels_scenarie_id" ON "Koersels" ("scenarie_id");
CREATE INDEX "IX_Koersels_vaerk_id" ON "Koersels" ("vaerk_id");

-- KoerselInput
CREATE TABLE "KoerselInputs" (
    "id" UUID NOT NULL,
    "koersel_id" UUID NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "vaerdi_json" VARCHAR(4000) NOT NULL,
    "kilde" VARCHAR(8) NOT NULL,
    CONSTRAINT "PK_KoerselInputs" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselInputs_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1),
    CONSTRAINT "CK_KoerselInputs_vaerdi_json_minlen" CHECK (LENGTH(RTRIM("vaerdi_json", ' ')) >= 1),
    CONSTRAINT "CK_KoerselInputs_kilde" CHECK ("kilde" IN ('vaerk', 'aendring', 'scenarie'))
);
CREATE UNIQUE INDEX "UX_KoerselInputs_en_vaerdi_pr_kilde_og_sti" ON "KoerselInputs" ("koersel_id", "kilde", "sti");

-- KoerselNoegletal
CREATE TABLE "KoerselNoegletals" (
    "id" UUID NOT NULL,
    "koersel_id" UUID NOT NULL,
    "gruppe" VARCHAR(60) NOT NULL,
    "objekt" VARCHAR(120),
    "marked" VARCHAR(20),
    "noegle" VARCHAR(120) NOT NULL,
    "vaerdi" NUMERIC(28,10),
    "enhed" VARCHAR(40),
    CONSTRAINT "PK_KoerselNoegletals" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselNoegletals_gruppe_minlen" CHECK (LENGTH(RTRIM("gruppe", ' ')) >= 1),
    CONSTRAINT "CK_KoerselNoegletals_noegle_minlen" CHECK (LENGTH(RTRIM("noegle", ' ')) >= 1)
);
CREATE INDEX "IX_KoerselNoegletals_koersel_id" ON "KoerselNoegletals" ("koersel_id");

-- KoerselMaaned
CREATE TABLE "KoerselMaaneds" (
    "id" UUID NOT NULL,
    "koersel_id" UUID NOT NULL,
    "maaned" VARCHAR(7) NOT NULL,
    "objekt" VARCHAR(120),
    "noegle" VARCHAR(120) NOT NULL,
    "vaerdi" NUMERIC(28,10),
    CONSTRAINT "PK_KoerselMaaneds" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselMaaneds_maaned_minlen" CHECK (LENGTH(RTRIM("maaned", ' ')) >= 1),
    CONSTRAINT "CK_KoerselMaaneds_noegle_minlen" CHECK (LENGTH(RTRIM("noegle", ' ')) >= 1)
);
CREATE INDEX "IX_KoerselMaaneds_koersel_id" ON "KoerselMaaneds" ("koersel_id");

-- KoerselTime
CREATE TABLE "KoerselTimes" (
    "id" UUID NOT NULL,
    "koersel_id" UUID NOT NULL,
    "tid" TIMESTAMP(3) NOT NULL,
    "varmelast_mw" NUMERIC(18,6) NOT NULL,
    "spotpris" NUMERIC(18,6),
    "t_ude" NUMERIC(18,6),
    "vaerdier_json" VARCHAR(4000) NOT NULL,
    CONSTRAINT "PK_KoerselTimes" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselTimes_vaerdier_json_minlen" CHECK (LENGTH(RTRIM("vaerdier_json", ' ')) >= 1)
);
CREATE UNIQUE INDEX "UX_KoerselTimes_et_interval_pr_tid" ON "KoerselTimes" ("koersel_id", "tid");

-- Motor
CREATE TABLE "Motors" (
    "id" UUID NOT NULL,
    "model_commit" VARCHAR(40),
    "data_commit" VARCHAR(40),
    "sidste_jobstart" TIMESTAMP(3),
    "sidste_job_id" VARCHAR(100),
    "aendret" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PK_Motors" PRIMARY KEY ("id")
);

-- Tidsserie
CREATE TABLE "Tidsseries" (
    "id" UUID NOT NULL,
    "vaerk_id" UUID NOT NULL,
    "rolle" VARCHAR(9) NOT NULL,
    "navn" VARCHAR(200) NOT NULL,
    "filnavn" VARCHAR(300) NOT NULL,
    "sti" VARCHAR(400),
    "sha256" VARCHAR(64),
    "oploesning" VARCHAR(10),
    "start" TIMESTAMP(3),
    "slut" TIMESTAMP(3),
    "antal_raekker" INTEGER,
    "antal_huller" INTEGER,
    "enhed" VARCHAR(20),
    "tidsstempel" VARCHAR(5) NOT NULL,
    "tidszone" VARCHAR(40) NOT NULL,
    "kilde" VARCHAR(9) NOT NULL,
    "status" VARCHAR(9) NOT NULL,
    "validering_json" VARCHAR(4000),
    "aktiv" BOOLEAN NOT NULL,
    "uploadet_af" VARCHAR(200) NOT NULL,
    "uploadet" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PK_Tidsseries" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Tidsseries_rolle" CHECK ("rolle" IN ('varmelast', 'solprofil')),
    CONSTRAINT "CK_Tidsseries_navn_minlen" CHECK (LENGTH(RTRIM("navn", ' ')) >= 1),
    CONSTRAINT "CK_Tidsseries_filnavn_minlen" CHECK (LENGTH(RTRIM("filnavn", ' ')) >= 1),
    CONSTRAINT "CK_Tidsseries_tidsstempel" CHECK ("tidsstempel" IN ('start', 'slut')),
    CONSTRAINT "CK_Tidsseries_tidszone_minlen" CHECK (LENGTH(RTRIM("tidszone", ' ')) >= 1),
    CONSTRAINT "CK_Tidsseries_kilde" CHECK ("kilde" IN ('csv', 'vaerksark', 'repo')),
    CONSTRAINT "CK_Tidsseries_status" CHECK ("status" IN ('validerer', 'gyldig', 'afvist')),
    CONSTRAINT "CK_Tidsseries_uploadet_af_minlen" CHECK (LENGTH(RTRIM("uploadet_af", ' ')) >= 1)
);
CREATE UNIQUE INDEX "UX_Tidsseries_hoejst_en_aktiv" ON "Tidsseries" ("vaerk_id", "rolle") WHERE "aktiv";
CREATE INDEX "IX_Tidsseries_vaerk_id" ON "Tidsseries" ("vaerk_id");

-- Vaerksarkimport
CREATE TABLE "Vaerksarkimports" (
    "id" UUID NOT NULL,
    "filnavn" VARCHAR(300) NOT NULL,
    "sti" VARCHAR(400),
    "status" VARCHAR(7) NOT NULL,
    "vaerk_id" UUID,
    "tidsserie_id" UUID,
    "log" VARCHAR(4000),
    "fabric_job_id" VARCHAR(100),
    "timeslut" BOOLEAN,
    "uploadet_af" VARCHAR(200) NOT NULL,
    "uploadet" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PK_Vaerksarkimports" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Vaerksarkimports_filnavn_minlen" CHECK (LENGTH(RTRIM("filnavn", ' ')) >= 1),
    CONSTRAINT "CK_Vaerksarkimports_status" CHECK ("status" IN ('koe', 'koerer', 'faerdig', 'fejl')),
    CONSTRAINT "CK_Vaerksarkimports_uploadet_af_minlen" CHECK (LENGTH(RTRIM("uploadet_af", ' ')) >= 1)
);
CREATE INDEX "IX_Vaerksarkimports_vaerk_id" ON "Vaerksarkimports" ("vaerk_id");
CREATE INDEX "IX_Vaerksarkimports_tidsserie_id" ON "Vaerksarkimports" ("tidsserie_id");

-- Skemaversionen. Aktuel version = MAX(version); en migration indsætter sin egen række.
CREATE TABLE "_skema" (
    "version" INTEGER NOT NULL,
    CONSTRAINT "PK__skema" PRIMARY KEY ("version")
);
INSERT INTO "_skema" ("version") VALUES (1);
