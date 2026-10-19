-- Fjernvarme Businesscase — databaseskema version 1 (sqlite).
-- GENERERET af skema/byg.py fra skema/skema.json. Ret aldrig her; ret skema.json og kør byg.py.
-- Community-profilen: Fabric-udgavens database laves af Rayfin ud fra app/rayfin/data/*.ts (se SKEMA.md).

PRAGMA foreign_keys = OFF;  -- referencer er logiske og tjekkes af valider-db (SKEMA.md)

-- Vaerk
CREATE TABLE "Vaerks" (
    "id" CHAR(36) NOT NULL,
    "kode" VARCHAR(60) NOT NULL,
    "navn" VARCHAR(200) NOT NULL,
    "beskrivelse" VARCHAR(4000),
    "kilde" VARCHAR(4) NOT NULL,
    "kilde_fil" VARCHAR(300),
    "repo_commit" VARCHAR(40),
    "kopieret_fra_id" CHAR(36),
    "revision" INTEGER NOT NULL,
    "arkiveret" INTEGER NOT NULL,
    "oprettet_af" VARCHAR(200) NOT NULL,
    "aendret_af" VARCHAR(200) NOT NULL,
    "oprettet" CHAR(24) NOT NULL,
    "aendret" CHAR(24) NOT NULL,
    CONSTRAINT "PK_Vaerks" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_Vaerks_kode" UNIQUE ("kode"),
    CONSTRAINT "CK_Vaerks_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Vaerks_kode_minlen" CHECK (LENGTH(RTRIM("kode", ' ')) >= 1),
    CONSTRAINT "CK_Vaerks_navn_minlen" CHECK (LENGTH(RTRIM("navn", ' ')) >= 1),
    CONSTRAINT "CK_Vaerks_kilde" CHECK ("kilde" IN ('repo', 'app')),
    CONSTRAINT "CK_Vaerks_kopieret_fra_id_uuid" CHECK (LENGTH("kopieret_fra_id") = 36 AND "kopieret_fra_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Vaerks_arkiveret_bool" CHECK ("arkiveret" IN (0, 1)),
    CONSTRAINT "CK_Vaerks_oprettet_af_minlen" CHECK (LENGTH(RTRIM("oprettet_af", ' ')) >= 1),
    CONSTRAINT "CK_Vaerks_aendret_af_minlen" CHECK (LENGTH(RTRIM("aendret_af", ' ')) >= 1),
    CONSTRAINT "CK_Vaerks_oprettet_tid" CHECK ("oprettet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Vaerks_aendret_tid" CHECK ("aendret" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
);
CREATE INDEX "IX_Vaerks_kopieret_fra_id" ON "Vaerks" ("kopieret_fra_id");

-- VaerkParameter
CREATE TABLE "VaerkParameters" (
    "id" CHAR(36) NOT NULL,
    "vaerk_id" CHAR(36) NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "vaerdi_json" VARCHAR(4000) NOT NULL,
    "sektion" VARCHAR(60) NOT NULL,
    "objekt" VARCHAR(120),
    "kommentar" VARCHAR(2000),
    "bekraeft" INTEGER NOT NULL,
    "raekkefoelge" INTEGER NOT NULL,
    "aendret_af" VARCHAR(200) NOT NULL,
    "aendret" CHAR(24) NOT NULL,
    CONSTRAINT "PK_VaerkParameters" PRIMARY KEY ("id"),
    CONSTRAINT "CK_VaerkParameters_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_VaerkParameters_vaerk_id_uuid" CHECK (LENGTH("vaerk_id") = 36 AND "vaerk_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_VaerkParameters_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1),
    CONSTRAINT "CK_VaerkParameters_vaerdi_json_minlen" CHECK (LENGTH(RTRIM("vaerdi_json", ' ')) >= 1),
    CONSTRAINT "CK_VaerkParameters_sektion_minlen" CHECK (LENGTH(RTRIM("sektion", ' ')) >= 1),
    CONSTRAINT "CK_VaerkParameters_bekraeft_bool" CHECK ("bekraeft" IN (0, 1)),
    CONSTRAINT "CK_VaerkParameters_aendret_af_minlen" CHECK (LENGTH(RTRIM("aendret_af", ' ')) >= 1),
    CONSTRAINT "CK_VaerkParameters_aendret_tid" CHECK ("aendret" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
);
CREATE UNIQUE INDEX "UX_VaerkParameters_en_vaerdi_pr_sti" ON "VaerkParameters" ("vaerk_id", "sti");

-- Aendringslog
CREATE TABLE "Aendringslogs" (
    "id" CHAR(36) NOT NULL,
    "vaerk_id" CHAR(36) NOT NULL,
    "revision" INTEGER NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "handling" VARCHAR(5) NOT NULL,
    "gammel_json" VARCHAR(4000),
    "ny_json" VARCHAR(4000),
    "aendret_af" VARCHAR(200) NOT NULL,
    "tidspunkt" CHAR(24) NOT NULL,
    "anmodning_id" CHAR(36),
    CONSTRAINT "PK_Aendringslogs" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Aendringslogs_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Aendringslogs_vaerk_id_uuid" CHECK (LENGTH("vaerk_id") = 36 AND "vaerk_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Aendringslogs_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1),
    CONSTRAINT "CK_Aendringslogs_handling" CHECK ("handling" IN ('opret', 'ret', 'slet')),
    CONSTRAINT "CK_Aendringslogs_aendret_af_minlen" CHECK (LENGTH(RTRIM("aendret_af", ' ')) >= 1),
    CONSTRAINT "CK_Aendringslogs_tidspunkt_tid" CHECK ("tidspunkt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Aendringslogs_anmodning_id_uuid" CHECK (LENGTH("anmodning_id") = 36 AND "anmodning_id" NOT GLOB '*[^0-9a-f-]*')
);
CREATE INDEX "IX_Aendringslogs_vaerk_id" ON "Aendringslogs" ("vaerk_id");
CREATE INDEX "IX_Aendringslogs_anmodning_id" ON "Aendringslogs" ("anmodning_id");

-- Aendringsanmodning
CREATE TABLE "Aendringsanmodnings" (
    "id" CHAR(36) NOT NULL,
    "vaerk_id" CHAR(36) NOT NULL,
    "forventet_revision" INTEGER NOT NULL,
    "aendringer_json" VARCHAR(4000) NOT NULL,
    "anmodet_af" VARCHAR(200) NOT NULL,
    "anmodet" CHAR(24) NOT NULL,
    "status" VARCHAR(7) NOT NULL,
    "svar" VARCHAR(2000),
    CONSTRAINT "PK_Aendringsanmodnings" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Aendringsanmodnings_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Aendringsanmodnings_vaerk_id_uuid" CHECK (LENGTH("vaerk_id") = 36 AND "vaerk_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Aendringsanmodnings_aendringer_json_minlen" CHECK (LENGTH(RTRIM("aendringer_json", ' ')) >= 2),
    CONSTRAINT "CK_Aendringsanmodnings_anmodet_af_minlen" CHECK (LENGTH(RTRIM("anmodet_af", ' ')) >= 1),
    CONSTRAINT "CK_Aendringsanmodnings_anmodet_tid" CHECK ("anmodet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Aendringsanmodnings_status" CHECK ("status" IN ('ny', 'udfoert', 'afvist'))
);
CREATE INDEX "IX_Aendringsanmodnings_vaerk_id" ON "Aendringsanmodnings" ("vaerk_id");

-- Scenarie
CREATE TABLE "Scenaries" (
    "id" CHAR(36) NOT NULL,
    "vaerk_id" CHAR(36) NOT NULL,
    "navn" VARCHAR(200) NOT NULL,
    "beskrivelse" VARCHAR(4000),
    "reference_scenarie_id" CHAR(36),
    "periode_start" VARCHAR(20),
    "periode_slut" VARCHAR(20),
    "med_balancering" INTEGER NOT NULL,
    "balancing_method" VARCHAR(16),
    "mip_rel_gap" NUMERIC(18,10),
    "mip_abs_gap" NUMERIC(28,4),
    "tidsgraense_s" INTEGER,
    "ekstra_flag" VARCHAR(300),
    "heat_csv" VARCHAR(300),
    "arkiveret" INTEGER NOT NULL,
    "oprettet_af" VARCHAR(200) NOT NULL,
    "oprettet" CHAR(24) NOT NULL,
    CONSTRAINT "PK_Scenaries" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Scenaries_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Scenaries_vaerk_id_uuid" CHECK (LENGTH("vaerk_id") = 36 AND "vaerk_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Scenaries_navn_minlen" CHECK (LENGTH(RTRIM("navn", ' ')) >= 1),
    CONSTRAINT "CK_Scenaries_reference_scenarie_id_uuid" CHECK (LENGTH("reference_scenarie_id") = 36 AND "reference_scenarie_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Scenaries_med_balancering_bool" CHECK ("med_balancering" IN (0, 1)),
    CONSTRAINT "CK_Scenaries_balancing_method" CHECK ("balancing_method" IN ('legacy', 'activation_value')),
    CONSTRAINT "CK_Scenaries_arkiveret_bool" CHECK ("arkiveret" IN (0, 1)),
    CONSTRAINT "CK_Scenaries_oprettet_af_minlen" CHECK (LENGTH(RTRIM("oprettet_af", ' ')) >= 1),
    CONSTRAINT "CK_Scenaries_oprettet_tid" CHECK ("oprettet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
);
CREATE INDEX "IX_Scenaries_vaerk_id" ON "Scenaries" ("vaerk_id");
CREATE INDEX "IX_Scenaries_reference_scenarie_id" ON "Scenaries" ("reference_scenarie_id");

-- ScenarieAendring
CREATE TABLE "ScenarieAendrings" (
    "id" CHAR(36) NOT NULL,
    "scenarie_id" CHAR(36) NOT NULL,
    "type" VARCHAR(7) NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "vaerdi_json" VARCHAR(4000),
    "raekkefoelge" INTEGER NOT NULL,
    CONSTRAINT "PK_ScenarieAendrings" PRIMARY KEY ("id"),
    CONSTRAINT "CK_ScenarieAendrings_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_ScenarieAendrings_scenarie_id_uuid" CHECK (LENGTH("scenarie_id") = 36 AND "scenarie_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_ScenarieAendrings_type" CHECK ("type" IN ('set', 'enable', 'disable')),
    CONSTRAINT "CK_ScenarieAendrings_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1)
);
CREATE INDEX "IX_ScenarieAendrings_scenarie_id" ON "ScenarieAendrings" ("scenarie_id");

-- Bestilling
CREATE TABLE "Bestillings" (
    "id" CHAR(36) NOT NULL,
    "scenarie_id" CHAR(36) NOT NULL,
    "klient_noegle" VARCHAR(60) NOT NULL,
    "bestilt_af" VARCHAR(200) NOT NULL,
    "bestilt" CHAR(24) NOT NULL,
    CONSTRAINT "PK_Bestillings" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_Bestillings_klient_noegle" UNIQUE ("klient_noegle"),
    CONSTRAINT "CK_Bestillings_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Bestillings_scenarie_id_uuid" CHECK (LENGTH("scenarie_id") = 36 AND "scenarie_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Bestillings_klient_noegle_minlen" CHECK (LENGTH(RTRIM("klient_noegle", ' ')) >= 1),
    CONSTRAINT "CK_Bestillings_bestilt_af_minlen" CHECK (LENGTH(RTRIM("bestilt_af", ' ')) >= 1),
    CONSTRAINT "CK_Bestillings_bestilt_tid" CHECK ("bestilt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
);
CREATE INDEX "IX_Bestillings_scenarie_id" ON "Bestillings" ("scenarie_id");

-- Koersel
CREATE TABLE "Koersels" (
    "id" CHAR(36) NOT NULL,
    "bestilling_id" CHAR(36) NOT NULL,
    "scenarie_id" CHAR(36) NOT NULL,
    "vaerk_id" CHAR(36) NOT NULL,
    "vaerk_revision" INTEGER NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "fase" VARCHAR(200),
    "bestilt_af" VARCHAR(200) NOT NULL,
    "bestilt" CHAR(24) NOT NULL,
    "modtaget" CHAR(24),
    "startet" CHAR(24),
    "afsluttet" CHAR(24),
    "hjerteslag" CHAR(24),
    "annuller_anmodet" CHAR(24),
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
    "er_milp" INTEGER,
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
    CONSTRAINT "CK_Koersels_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Koersels_bestilling_id_uuid" CHECK (LENGTH("bestilling_id") = 36 AND "bestilling_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Koersels_scenarie_id_uuid" CHECK (LENGTH("scenarie_id") = 36 AND "scenarie_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Koersels_vaerk_id_uuid" CHECK (LENGTH("vaerk_id") = 36 AND "vaerk_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Koersels_input_hash_minlen" CHECK (LENGTH(RTRIM("input_hash", ' ')) >= 64),
    CONSTRAINT "CK_Koersels_status" CHECK ("status" IN ('koe', 'startet', 'koerer', 'indlaeser', 'faerdig', 'fejl', 'annulleret')),
    CONSTRAINT "CK_Koersels_bestilt_af_minlen" CHECK (LENGTH(RTRIM("bestilt_af", ' ')) >= 1),
    CONSTRAINT "CK_Koersels_bestilt_tid" CHECK ("bestilt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Koersels_modtaget_tid" CHECK ("modtaget" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Koersels_startet_tid" CHECK ("startet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Koersels_afsluttet_tid" CHECK ("afsluttet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Koersels_hjerteslag_tid" CHECK ("hjerteslag" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Koersels_annuller_anmodet_tid" CHECK ("annuller_anmodet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Koersels_kilde" CHECK ("kilde" IN ('app', 'notebook')),
    CONSTRAINT "CK_Koersels_er_milp_bool" CHECK ("er_milp" IN (0, 1))
);
CREATE INDEX "IX_Koersels_scenarie_id" ON "Koersels" ("scenarie_id");
CREATE INDEX "IX_Koersels_vaerk_id" ON "Koersels" ("vaerk_id");

-- KoerselInput
CREATE TABLE "KoerselInputs" (
    "id" CHAR(36) NOT NULL,
    "koersel_id" CHAR(36) NOT NULL,
    "sti" VARCHAR(400) NOT NULL,
    "vaerdi_json" VARCHAR(4000) NOT NULL,
    "kilde" VARCHAR(8) NOT NULL,
    CONSTRAINT "PK_KoerselInputs" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselInputs_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselInputs_koersel_id_uuid" CHECK (LENGTH("koersel_id") = 36 AND "koersel_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselInputs_sti_minlen" CHECK (LENGTH(RTRIM("sti", ' ')) >= 1),
    CONSTRAINT "CK_KoerselInputs_vaerdi_json_minlen" CHECK (LENGTH(RTRIM("vaerdi_json", ' ')) >= 1),
    CONSTRAINT "CK_KoerselInputs_kilde" CHECK ("kilde" IN ('vaerk', 'aendring', 'scenarie'))
);
CREATE UNIQUE INDEX "UX_KoerselInputs_en_vaerdi_pr_kilde_og_sti" ON "KoerselInputs" ("koersel_id", "kilde", "sti");

-- KoerselNoegletal
CREATE TABLE "KoerselNoegletals" (
    "id" CHAR(36) NOT NULL,
    "koersel_id" CHAR(36) NOT NULL,
    "gruppe" VARCHAR(60) NOT NULL,
    "objekt" VARCHAR(120),
    "marked" VARCHAR(20),
    "noegle" VARCHAR(120) NOT NULL,
    "vaerdi" NUMERIC(28,10),
    "enhed" VARCHAR(40),
    CONSTRAINT "PK_KoerselNoegletals" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselNoegletals_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselNoegletals_koersel_id_uuid" CHECK (LENGTH("koersel_id") = 36 AND "koersel_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselNoegletals_gruppe_minlen" CHECK (LENGTH(RTRIM("gruppe", ' ')) >= 1),
    CONSTRAINT "CK_KoerselNoegletals_noegle_minlen" CHECK (LENGTH(RTRIM("noegle", ' ')) >= 1)
);
CREATE INDEX "IX_KoerselNoegletals_koersel_id" ON "KoerselNoegletals" ("koersel_id");

-- KoerselMaaned
CREATE TABLE "KoerselMaaneds" (
    "id" CHAR(36) NOT NULL,
    "koersel_id" CHAR(36) NOT NULL,
    "maaned" VARCHAR(7) NOT NULL,
    "objekt" VARCHAR(120),
    "noegle" VARCHAR(120) NOT NULL,
    "vaerdi" NUMERIC(28,10),
    CONSTRAINT "PK_KoerselMaaneds" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselMaaneds_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselMaaneds_koersel_id_uuid" CHECK (LENGTH("koersel_id") = 36 AND "koersel_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselMaaneds_maaned_minlen" CHECK (LENGTH(RTRIM("maaned", ' ')) >= 1),
    CONSTRAINT "CK_KoerselMaaneds_noegle_minlen" CHECK (LENGTH(RTRIM("noegle", ' ')) >= 1)
);
CREATE INDEX "IX_KoerselMaaneds_koersel_id" ON "KoerselMaaneds" ("koersel_id");

-- KoerselTime
CREATE TABLE "KoerselTimes" (
    "id" CHAR(36) NOT NULL,
    "koersel_id" CHAR(36) NOT NULL,
    "tid" CHAR(24) NOT NULL,
    "varmelast_mw" NUMERIC(18,6) NOT NULL,
    "spotpris" NUMERIC(18,6),
    "t_ude" NUMERIC(18,6),
    "vaerdier_json" VARCHAR(4000) NOT NULL,
    CONSTRAINT "PK_KoerselTimes" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselTimes_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselTimes_koersel_id_uuid" CHECK (LENGTH("koersel_id") = 36 AND "koersel_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselTimes_tid_tid" CHECK ("tid" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_KoerselTimes_vaerdier_json_minlen" CHECK (LENGTH(RTRIM("vaerdier_json", ' ')) >= 1)
);
CREATE UNIQUE INDEX "UX_KoerselTimes_et_interval_pr_tid" ON "KoerselTimes" ("koersel_id", "tid");

-- Motor
CREATE TABLE "Motors" (
    "id" CHAR(36) NOT NULL,
    "model_commit" VARCHAR(40),
    "data_commit" VARCHAR(40),
    "sidste_jobstart" CHAR(24),
    "sidste_job_id" VARCHAR(100),
    "aendret" CHAR(24) NOT NULL,
    CONSTRAINT "PK_Motors" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Motors_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Motors_sidste_jobstart_tid" CHECK ("sidste_jobstart" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Motors_aendret_tid" CHECK ("aendret" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
);

-- Tidsserie
CREATE TABLE "Tidsseries" (
    "id" CHAR(36) NOT NULL,
    "vaerk_id" CHAR(36) NOT NULL,
    "rolle" VARCHAR(9) NOT NULL,
    "navn" VARCHAR(200) NOT NULL,
    "filnavn" VARCHAR(300) NOT NULL,
    "sti" VARCHAR(400),
    "sha256" VARCHAR(64),
    "oploesning" VARCHAR(10),
    "start" CHAR(24),
    "slut" CHAR(24),
    "antal_raekker" INTEGER,
    "antal_huller" INTEGER,
    "enhed" VARCHAR(20),
    "tidsstempel" VARCHAR(5) NOT NULL,
    "tidszone" VARCHAR(40) NOT NULL,
    "kilde" VARCHAR(9) NOT NULL,
    "status" VARCHAR(9) NOT NULL,
    "validering_json" VARCHAR(4000),
    "aktiv" INTEGER NOT NULL,
    "uploadet_af" VARCHAR(200) NOT NULL,
    "uploadet" CHAR(24) NOT NULL,
    CONSTRAINT "PK_Tidsseries" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Tidsseries_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Tidsseries_vaerk_id_uuid" CHECK (LENGTH("vaerk_id") = 36 AND "vaerk_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Tidsseries_rolle" CHECK ("rolle" IN ('varmelast', 'solprofil')),
    CONSTRAINT "CK_Tidsseries_navn_minlen" CHECK (LENGTH(RTRIM("navn", ' ')) >= 1),
    CONSTRAINT "CK_Tidsseries_filnavn_minlen" CHECK (LENGTH(RTRIM("filnavn", ' ')) >= 1),
    CONSTRAINT "CK_Tidsseries_start_tid" CHECK ("start" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Tidsseries_slut_tid" CHECK ("slut" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_Tidsseries_tidsstempel" CHECK ("tidsstempel" IN ('start', 'slut')),
    CONSTRAINT "CK_Tidsseries_tidszone_minlen" CHECK (LENGTH(RTRIM("tidszone", ' ')) >= 1),
    CONSTRAINT "CK_Tidsseries_kilde" CHECK ("kilde" IN ('csv', 'vaerksark', 'repo')),
    CONSTRAINT "CK_Tidsseries_status" CHECK ("status" IN ('validerer', 'gyldig', 'afvist')),
    CONSTRAINT "CK_Tidsseries_aktiv_bool" CHECK ("aktiv" IN (0, 1)),
    CONSTRAINT "CK_Tidsseries_uploadet_af_minlen" CHECK (LENGTH(RTRIM("uploadet_af", ' ')) >= 1),
    CONSTRAINT "CK_Tidsseries_uploadet_tid" CHECK ("uploadet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
);
CREATE UNIQUE INDEX "UX_Tidsseries_hoejst_en_aktiv" ON "Tidsseries" ("vaerk_id", "rolle") WHERE "aktiv" = 1;
CREATE INDEX "IX_Tidsseries_vaerk_id" ON "Tidsseries" ("vaerk_id");

-- Vaerksarkimport
CREATE TABLE "Vaerksarkimports" (
    "id" CHAR(36) NOT NULL,
    "filnavn" VARCHAR(300) NOT NULL,
    "sti" VARCHAR(400),
    "status" VARCHAR(7) NOT NULL,
    "vaerk_id" CHAR(36),
    "tidsserie_id" CHAR(36),
    "log" VARCHAR(4000),
    "fabric_job_id" VARCHAR(100),
    "timeslut" INTEGER,
    "uploadet_af" VARCHAR(200) NOT NULL,
    "uploadet" CHAR(24) NOT NULL,
    CONSTRAINT "PK_Vaerksarkimports" PRIMARY KEY ("id"),
    CONSTRAINT "CK_Vaerksarkimports_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Vaerksarkimports_filnavn_minlen" CHECK (LENGTH(RTRIM("filnavn", ' ')) >= 1),
    CONSTRAINT "CK_Vaerksarkimports_status" CHECK ("status" IN ('koe', 'koerer', 'faerdig', 'fejl')),
    CONSTRAINT "CK_Vaerksarkimports_vaerk_id_uuid" CHECK (LENGTH("vaerk_id") = 36 AND "vaerk_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Vaerksarkimports_tidsserie_id_uuid" CHECK (LENGTH("tidsserie_id") = 36 AND "tidsserie_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_Vaerksarkimports_timeslut_bool" CHECK ("timeslut" IN (0, 1)),
    CONSTRAINT "CK_Vaerksarkimports_uploadet_af_minlen" CHECK (LENGTH(RTRIM("uploadet_af", ' ')) >= 1),
    CONSTRAINT "CK_Vaerksarkimports_uploadet_tid" CHECK ("uploadet" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
);
CREATE INDEX "IX_Vaerksarkimports_vaerk_id" ON "Vaerksarkimports" ("vaerk_id");
CREATE INDEX "IX_Vaerksarkimports_tidsserie_id" ON "Vaerksarkimports" ("tidsserie_id");

-- Skemaversionen. Aktuel version = MAX(version); en migration indsætter sin egen række.
CREATE TABLE "_skema" (
    "version" INTEGER NOT NULL,
    CONSTRAINT "PK__skema" PRIMARY KEY ("version")
);
INSERT INTO "_skema" ("version") VALUES (1);
