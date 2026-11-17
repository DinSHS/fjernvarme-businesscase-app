-- Migration 1 -> 2 (sqlite). GENERERET af skema/byg.py — ret ikke her.

PRAGMA foreign_keys = OFF;  -- referencer er logiske og tjekkes af valider-db (SKEMA.md)

-- KoerselTimeDel
CREATE TABLE "KoerselTimeDels" (
    "id" CHAR(36) NOT NULL,
    "koersel_id" CHAR(36) NOT NULL,
    "tid" CHAR(24) NOT NULL,
    "delnr" INTEGER NOT NULL,
    "vaerdier_json" VARCHAR(4000) NOT NULL,
    CONSTRAINT "PK_KoerselTimeDels" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselTimeDels_id_uuid" CHECK (LENGTH("id") = 36 AND "id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselTimeDels_koersel_id_uuid" CHECK (LENGTH("koersel_id") = 36 AND "koersel_id" NOT GLOB '*[^0-9a-f-]*'),
    CONSTRAINT "CK_KoerselTimeDels_tid_tid" CHECK ("tid" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
    CONSTRAINT "CK_KoerselTimeDels_vaerdier_json_minlen" CHECK (LENGTH(RTRIM("vaerdier_json", ' ')) >= 1)
);
CREATE UNIQUE INDEX "UX_KoerselTimeDels_en_del_pr_nummer" ON "KoerselTimeDels" ("koersel_id", "tid", "delnr");

INSERT INTO "_skema" ("version") VALUES (2);
