-- Migration 1 -> 2 (postgresql). GENERERET af skema/byg.py — ret ikke her.

-- KoerselTimeDel
CREATE TABLE "KoerselTimeDels" (
    "id" UUID NOT NULL,
    "koersel_id" UUID NOT NULL,
    "tid" TIMESTAMP(3) NOT NULL,
    "delnr" INTEGER NOT NULL,
    "vaerdier_json" VARCHAR(4000) NOT NULL,
    CONSTRAINT "PK_KoerselTimeDels" PRIMARY KEY ("id"),
    CONSTRAINT "CK_KoerselTimeDels_vaerdier_json_minlen" CHECK (LENGTH(RTRIM("vaerdier_json", ' ')) >= 1)
);
CREATE UNIQUE INDEX "UX_KoerselTimeDels_en_del_pr_nummer" ON "KoerselTimeDels" ("koersel_id", "tid", "delnr");

INSERT INTO "_skema" ("version") VALUES (2);
