-- Migration 1 -> 2 (mssql). GENERERET af skema/byg.py — ret ikke her.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;  -- påkrævet for filtrerede indeks (sqlcmd slår det ellers fra)

-- KoerselTimeDel
CREATE TABLE [KoerselTimeDels] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [koersel_id] UNIQUEIDENTIFIER NOT NULL,
    [tid] DATETIME2(3) NOT NULL,
    [delnr] INT NOT NULL,
    [vaerdier_json] NVARCHAR(4000) NOT NULL,
    CONSTRAINT [PK_KoerselTimeDels] PRIMARY KEY ([id]),
    CONSTRAINT [CK_KoerselTimeDels_vaerdier_json_minlen] CHECK (LEN([vaerdier_json]) >= 1)
);
CREATE UNIQUE INDEX [UX_KoerselTimeDels_en_del_pr_nummer] ON [KoerselTimeDels] ([koersel_id], [tid], [delnr]);

INSERT INTO [_skema] ([version]) VALUES (2);
