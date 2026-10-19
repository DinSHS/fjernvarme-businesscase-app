-- Fjernvarme Businesscase — databaseskema version 1 (mssql).
-- GENERERET af skema/byg.py fra skema/skema.json. Ret aldrig her; ret skema.json og kør byg.py.
-- Community-profilen: Fabric-udgavens database laves af Rayfin ud fra app/rayfin/data/*.ts (se SKEMA.md).

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;  -- påkrævet for filtrerede indeks (sqlcmd slår det ellers fra)

-- Vaerk
CREATE TABLE [Vaerks] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [kode] NVARCHAR(60) NOT NULL,
    [navn] NVARCHAR(200) NOT NULL,
    [beskrivelse] NVARCHAR(4000),
    [kilde] NVARCHAR(4) NOT NULL,
    [kilde_fil] NVARCHAR(300),
    [repo_commit] NVARCHAR(40),
    [kopieret_fra_id] UNIQUEIDENTIFIER,
    [revision] INT NOT NULL,
    [arkiveret] BIT NOT NULL,
    [oprettet_af] NVARCHAR(200) NOT NULL,
    [aendret_af] NVARCHAR(200) NOT NULL,
    [oprettet] DATETIME2(3) NOT NULL,
    [aendret] DATETIME2(3) NOT NULL,
    CONSTRAINT [PK_Vaerks] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_Vaerks_kode] UNIQUE ([kode]),
    CONSTRAINT [CK_Vaerks_kode_minlen] CHECK (LEN([kode]) >= 1),
    CONSTRAINT [CK_Vaerks_navn_minlen] CHECK (LEN([navn]) >= 1),
    CONSTRAINT [CK_Vaerks_kilde] CHECK ([kilde] COLLATE Latin1_General_100_BIN2 IN ('repo', 'app')),
    CONSTRAINT [CK_Vaerks_oprettet_af_minlen] CHECK (LEN([oprettet_af]) >= 1),
    CONSTRAINT [CK_Vaerks_aendret_af_minlen] CHECK (LEN([aendret_af]) >= 1)
);
CREATE INDEX [IX_Vaerks_kopieret_fra_id] ON [Vaerks] ([kopieret_fra_id]);

-- VaerkParameter
CREATE TABLE [VaerkParameters] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [vaerk_id] UNIQUEIDENTIFIER NOT NULL,
    [sti] NVARCHAR(400) NOT NULL,
    [vaerdi_json] NVARCHAR(4000) NOT NULL,
    [sektion] NVARCHAR(60) NOT NULL,
    [objekt] NVARCHAR(120),
    [kommentar] NVARCHAR(2000),
    [bekraeft] BIT NOT NULL,
    [raekkefoelge] INT NOT NULL,
    [aendret_af] NVARCHAR(200) NOT NULL,
    [aendret] DATETIME2(3) NOT NULL,
    CONSTRAINT [PK_VaerkParameters] PRIMARY KEY ([id]),
    CONSTRAINT [CK_VaerkParameters_sti_minlen] CHECK (LEN([sti]) >= 1),
    CONSTRAINT [CK_VaerkParameters_vaerdi_json_minlen] CHECK (LEN([vaerdi_json]) >= 1),
    CONSTRAINT [CK_VaerkParameters_sektion_minlen] CHECK (LEN([sektion]) >= 1),
    CONSTRAINT [CK_VaerkParameters_aendret_af_minlen] CHECK (LEN([aendret_af]) >= 1)
);
CREATE UNIQUE INDEX [UX_VaerkParameters_en_vaerdi_pr_sti] ON [VaerkParameters] ([vaerk_id], [sti]);

-- Aendringslog
CREATE TABLE [Aendringslogs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [vaerk_id] UNIQUEIDENTIFIER NOT NULL,
    [revision] INT NOT NULL,
    [sti] NVARCHAR(400) NOT NULL,
    [handling] NVARCHAR(5) NOT NULL,
    [gammel_json] NVARCHAR(4000),
    [ny_json] NVARCHAR(4000),
    [aendret_af] NVARCHAR(200) NOT NULL,
    [tidspunkt] DATETIME2(3) NOT NULL,
    [anmodning_id] UNIQUEIDENTIFIER,
    CONSTRAINT [PK_Aendringslogs] PRIMARY KEY ([id]),
    CONSTRAINT [CK_Aendringslogs_sti_minlen] CHECK (LEN([sti]) >= 1),
    CONSTRAINT [CK_Aendringslogs_handling] CHECK ([handling] COLLATE Latin1_General_100_BIN2 IN ('opret', 'ret', 'slet')),
    CONSTRAINT [CK_Aendringslogs_aendret_af_minlen] CHECK (LEN([aendret_af]) >= 1)
);
CREATE INDEX [IX_Aendringslogs_vaerk_id] ON [Aendringslogs] ([vaerk_id]);
CREATE INDEX [IX_Aendringslogs_anmodning_id] ON [Aendringslogs] ([anmodning_id]);

-- Aendringsanmodning
CREATE TABLE [Aendringsanmodnings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [vaerk_id] UNIQUEIDENTIFIER NOT NULL,
    [forventet_revision] INT NOT NULL,
    [aendringer_json] NVARCHAR(4000) NOT NULL,
    [anmodet_af] NVARCHAR(200) NOT NULL,
    [anmodet] DATETIME2(3) NOT NULL,
    [status] NVARCHAR(7) NOT NULL,
    [svar] NVARCHAR(2000),
    CONSTRAINT [PK_Aendringsanmodnings] PRIMARY KEY ([id]),
    CONSTRAINT [CK_Aendringsanmodnings_aendringer_json_minlen] CHECK (LEN([aendringer_json]) >= 2),
    CONSTRAINT [CK_Aendringsanmodnings_anmodet_af_minlen] CHECK (LEN([anmodet_af]) >= 1),
    CONSTRAINT [CK_Aendringsanmodnings_status] CHECK ([status] COLLATE Latin1_General_100_BIN2 IN ('ny', 'udfoert', 'afvist'))
);
CREATE INDEX [IX_Aendringsanmodnings_vaerk_id] ON [Aendringsanmodnings] ([vaerk_id]);

-- Scenarie
CREATE TABLE [Scenaries] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [vaerk_id] UNIQUEIDENTIFIER NOT NULL,
    [navn] NVARCHAR(200) NOT NULL,
    [beskrivelse] NVARCHAR(4000),
    [reference_scenarie_id] UNIQUEIDENTIFIER,
    [periode_start] NVARCHAR(20),
    [periode_slut] NVARCHAR(20),
    [med_balancering] BIT NOT NULL,
    [balancing_method] NVARCHAR(16),
    [mip_rel_gap] DECIMAL(18,10),
    [mip_abs_gap] DECIMAL(28,4),
    [tidsgraense_s] INT,
    [ekstra_flag] NVARCHAR(300),
    [heat_csv] NVARCHAR(300),
    [arkiveret] BIT NOT NULL,
    [oprettet_af] NVARCHAR(200) NOT NULL,
    [oprettet] DATETIME2(3) NOT NULL,
    CONSTRAINT [PK_Scenaries] PRIMARY KEY ([id]),
    CONSTRAINT [CK_Scenaries_navn_minlen] CHECK (LEN([navn]) >= 1),
    CONSTRAINT [CK_Scenaries_balancing_method] CHECK ([balancing_method] COLLATE Latin1_General_100_BIN2 IN ('legacy', 'activation_value')),
    CONSTRAINT [CK_Scenaries_oprettet_af_minlen] CHECK (LEN([oprettet_af]) >= 1)
);
CREATE INDEX [IX_Scenaries_vaerk_id] ON [Scenaries] ([vaerk_id]);
CREATE INDEX [IX_Scenaries_reference_scenarie_id] ON [Scenaries] ([reference_scenarie_id]);

-- ScenarieAendring
CREATE TABLE [ScenarieAendrings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [scenarie_id] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(7) NOT NULL,
    [sti] NVARCHAR(400) NOT NULL,
    [vaerdi_json] NVARCHAR(4000),
    [raekkefoelge] INT NOT NULL,
    CONSTRAINT [PK_ScenarieAendrings] PRIMARY KEY ([id]),
    CONSTRAINT [CK_ScenarieAendrings_type] CHECK ([type] COLLATE Latin1_General_100_BIN2 IN ('set', 'enable', 'disable')),
    CONSTRAINT [CK_ScenarieAendrings_sti_minlen] CHECK (LEN([sti]) >= 1)
);
CREATE INDEX [IX_ScenarieAendrings_scenarie_id] ON [ScenarieAendrings] ([scenarie_id]);

-- Bestilling
CREATE TABLE [Bestillings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [scenarie_id] UNIQUEIDENTIFIER NOT NULL,
    [klient_noegle] NVARCHAR(60) NOT NULL,
    [bestilt_af] NVARCHAR(200) NOT NULL,
    [bestilt] DATETIME2(3) NOT NULL,
    CONSTRAINT [PK_Bestillings] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_Bestillings_klient_noegle] UNIQUE ([klient_noegle]),
    CONSTRAINT [CK_Bestillings_klient_noegle_minlen] CHECK (LEN([klient_noegle]) >= 1),
    CONSTRAINT [CK_Bestillings_bestilt_af_minlen] CHECK (LEN([bestilt_af]) >= 1)
);
CREATE INDEX [IX_Bestillings_scenarie_id] ON [Bestillings] ([scenarie_id]);

-- Koersel
CREATE TABLE [Koersels] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [bestilling_id] UNIQUEIDENTIFIER NOT NULL,
    [scenarie_id] UNIQUEIDENTIFIER NOT NULL,
    [vaerk_id] UNIQUEIDENTIFIER NOT NULL,
    [vaerk_revision] INT NOT NULL,
    [input_hash] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [fase] NVARCHAR(200),
    [bestilt_af] NVARCHAR(200) NOT NULL,
    [bestilt] DATETIME2(3) NOT NULL,
    [modtaget] DATETIME2(3),
    [startet] DATETIME2(3),
    [afsluttet] DATETIME2(3),
    [hjerteslag] DATETIME2(3),
    [annuller_anmodet] DATETIME2(3),
    [forsoeg] INT NOT NULL,
    [arbejder_id] NVARCHAR(100),
    [fabric_job_id] NVARCHAR(100),
    [kilde] NVARCHAR(8) NOT NULL,
    [model_commit] NVARCHAR(40),
    [data_commit] NVARCHAR(40),
    [miljoe_json] NVARCHAR(4000),
    [case_sti] NVARCHAR(400),
    [output_sti] NVARCHAR(400),
    [output_stem] NVARCHAR(400),
    [oploesning] NVARCHAR(10),
    [interval_min] INT,
    [antal_interval_model] INT,
    [antal_interval_csv] INT,
    [solve_status] NVARCHAR(60),
    [er_milp] BIT,
    [objektiv_dkk] DECIMAL(28,4),
    [oensket_rel_gap] DECIMAL(18,10),
    [oensket_abs_gap] DECIMAL(28,4),
    [opnaaet_gap] DECIMAL(18,10),
    [best_bound] DECIMAL(28,4),
    [loesetid_s] DECIMAL(18,3),
    [fejlbesked] NVARCHAR(4000),
    [manifest_json] NVARCHAR(4000),
    CONSTRAINT [PK_Koersels] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_Koersels_bestilling_id] UNIQUE ([bestilling_id]),
    CONSTRAINT [CK_Koersels_input_hash_minlen] CHECK (LEN([input_hash]) >= 64),
    CONSTRAINT [CK_Koersels_status] CHECK ([status] COLLATE Latin1_General_100_BIN2 IN ('koe', 'startet', 'koerer', 'indlaeser', 'faerdig', 'fejl', 'annulleret')),
    CONSTRAINT [CK_Koersels_bestilt_af_minlen] CHECK (LEN([bestilt_af]) >= 1),
    CONSTRAINT [CK_Koersels_kilde] CHECK ([kilde] COLLATE Latin1_General_100_BIN2 IN ('app', 'notebook'))
);
CREATE INDEX [IX_Koersels_scenarie_id] ON [Koersels] ([scenarie_id]);
CREATE INDEX [IX_Koersels_vaerk_id] ON [Koersels] ([vaerk_id]);

-- KoerselInput
CREATE TABLE [KoerselInputs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [koersel_id] UNIQUEIDENTIFIER NOT NULL,
    [sti] NVARCHAR(400) NOT NULL,
    [vaerdi_json] NVARCHAR(4000) NOT NULL,
    [kilde] NVARCHAR(8) NOT NULL,
    CONSTRAINT [PK_KoerselInputs] PRIMARY KEY ([id]),
    CONSTRAINT [CK_KoerselInputs_sti_minlen] CHECK (LEN([sti]) >= 1),
    CONSTRAINT [CK_KoerselInputs_vaerdi_json_minlen] CHECK (LEN([vaerdi_json]) >= 1),
    CONSTRAINT [CK_KoerselInputs_kilde] CHECK ([kilde] COLLATE Latin1_General_100_BIN2 IN ('vaerk', 'aendring', 'scenarie'))
);
CREATE UNIQUE INDEX [UX_KoerselInputs_en_vaerdi_pr_kilde_og_sti] ON [KoerselInputs] ([koersel_id], [kilde], [sti]);

-- KoerselNoegletal
CREATE TABLE [KoerselNoegletals] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [koersel_id] UNIQUEIDENTIFIER NOT NULL,
    [gruppe] NVARCHAR(60) NOT NULL,
    [objekt] NVARCHAR(120),
    [marked] NVARCHAR(20),
    [noegle] NVARCHAR(120) NOT NULL,
    [vaerdi] DECIMAL(28,10),
    [enhed] NVARCHAR(40),
    CONSTRAINT [PK_KoerselNoegletals] PRIMARY KEY ([id]),
    CONSTRAINT [CK_KoerselNoegletals_gruppe_minlen] CHECK (LEN([gruppe]) >= 1),
    CONSTRAINT [CK_KoerselNoegletals_noegle_minlen] CHECK (LEN([noegle]) >= 1)
);
CREATE INDEX [IX_KoerselNoegletals_koersel_id] ON [KoerselNoegletals] ([koersel_id]);

-- KoerselMaaned
CREATE TABLE [KoerselMaaneds] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [koersel_id] UNIQUEIDENTIFIER NOT NULL,
    [maaned] NVARCHAR(7) NOT NULL,
    [objekt] NVARCHAR(120),
    [noegle] NVARCHAR(120) NOT NULL,
    [vaerdi] DECIMAL(28,10),
    CONSTRAINT [PK_KoerselMaaneds] PRIMARY KEY ([id]),
    CONSTRAINT [CK_KoerselMaaneds_maaned_minlen] CHECK (LEN([maaned]) >= 1),
    CONSTRAINT [CK_KoerselMaaneds_noegle_minlen] CHECK (LEN([noegle]) >= 1)
);
CREATE INDEX [IX_KoerselMaaneds_koersel_id] ON [KoerselMaaneds] ([koersel_id]);

-- KoerselTime
CREATE TABLE [KoerselTimes] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [koersel_id] UNIQUEIDENTIFIER NOT NULL,
    [tid] DATETIME2(3) NOT NULL,
    [varmelast_mw] DECIMAL(18,6) NOT NULL,
    [spotpris] DECIMAL(18,6),
    [t_ude] DECIMAL(18,6),
    [vaerdier_json] NVARCHAR(4000) NOT NULL,
    CONSTRAINT [PK_KoerselTimes] PRIMARY KEY ([id]),
    CONSTRAINT [CK_KoerselTimes_vaerdier_json_minlen] CHECK (LEN([vaerdier_json]) >= 1)
);
CREATE UNIQUE INDEX [UX_KoerselTimes_et_interval_pr_tid] ON [KoerselTimes] ([koersel_id], [tid]);

-- Motor
CREATE TABLE [Motors] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [model_commit] NVARCHAR(40),
    [data_commit] NVARCHAR(40),
    [sidste_jobstart] DATETIME2(3),
    [sidste_job_id] NVARCHAR(100),
    [aendret] DATETIME2(3) NOT NULL,
    CONSTRAINT [PK_Motors] PRIMARY KEY ([id])
);

-- Tidsserie
CREATE TABLE [Tidsseries] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [vaerk_id] UNIQUEIDENTIFIER NOT NULL,
    [rolle] NVARCHAR(9) NOT NULL,
    [navn] NVARCHAR(200) NOT NULL,
    [filnavn] NVARCHAR(300) NOT NULL,
    [sti] NVARCHAR(400),
    [sha256] NVARCHAR(64),
    [oploesning] NVARCHAR(10),
    [start] DATETIME2(3),
    [slut] DATETIME2(3),
    [antal_raekker] INT,
    [antal_huller] INT,
    [enhed] NVARCHAR(20),
    [tidsstempel] NVARCHAR(5) NOT NULL,
    [tidszone] NVARCHAR(40) NOT NULL,
    [kilde] NVARCHAR(9) NOT NULL,
    [status] NVARCHAR(9) NOT NULL,
    [validering_json] NVARCHAR(4000),
    [aktiv] BIT NOT NULL,
    [uploadet_af] NVARCHAR(200) NOT NULL,
    [uploadet] DATETIME2(3) NOT NULL,
    CONSTRAINT [PK_Tidsseries] PRIMARY KEY ([id]),
    CONSTRAINT [CK_Tidsseries_rolle] CHECK ([rolle] COLLATE Latin1_General_100_BIN2 IN ('varmelast', 'solprofil')),
    CONSTRAINT [CK_Tidsseries_navn_minlen] CHECK (LEN([navn]) >= 1),
    CONSTRAINT [CK_Tidsseries_filnavn_minlen] CHECK (LEN([filnavn]) >= 1),
    CONSTRAINT [CK_Tidsseries_tidsstempel] CHECK ([tidsstempel] COLLATE Latin1_General_100_BIN2 IN ('start', 'slut')),
    CONSTRAINT [CK_Tidsseries_tidszone_minlen] CHECK (LEN([tidszone]) >= 1),
    CONSTRAINT [CK_Tidsseries_kilde] CHECK ([kilde] COLLATE Latin1_General_100_BIN2 IN ('csv', 'vaerksark', 'repo')),
    CONSTRAINT [CK_Tidsseries_status] CHECK ([status] COLLATE Latin1_General_100_BIN2 IN ('validerer', 'gyldig', 'afvist')),
    CONSTRAINT [CK_Tidsseries_uploadet_af_minlen] CHECK (LEN([uploadet_af]) >= 1)
);
CREATE UNIQUE INDEX [UX_Tidsseries_hoejst_en_aktiv] ON [Tidsseries] ([vaerk_id], [rolle]) WHERE [aktiv] = 1;
CREATE INDEX [IX_Tidsseries_vaerk_id] ON [Tidsseries] ([vaerk_id]);

-- Vaerksarkimport
CREATE TABLE [Vaerksarkimports] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [filnavn] NVARCHAR(300) NOT NULL,
    [sti] NVARCHAR(400),
    [status] NVARCHAR(7) NOT NULL,
    [vaerk_id] UNIQUEIDENTIFIER,
    [tidsserie_id] UNIQUEIDENTIFIER,
    [log] NVARCHAR(4000),
    [fabric_job_id] NVARCHAR(100),
    [timeslut] BIT,
    [uploadet_af] NVARCHAR(200) NOT NULL,
    [uploadet] DATETIME2(3) NOT NULL,
    CONSTRAINT [PK_Vaerksarkimports] PRIMARY KEY ([id]),
    CONSTRAINT [CK_Vaerksarkimports_filnavn_minlen] CHECK (LEN([filnavn]) >= 1),
    CONSTRAINT [CK_Vaerksarkimports_status] CHECK ([status] COLLATE Latin1_General_100_BIN2 IN ('koe', 'koerer', 'faerdig', 'fejl')),
    CONSTRAINT [CK_Vaerksarkimports_uploadet_af_minlen] CHECK (LEN([uploadet_af]) >= 1)
);
CREATE INDEX [IX_Vaerksarkimports_vaerk_id] ON [Vaerksarkimports] ([vaerk_id]);
CREATE INDEX [IX_Vaerksarkimports_tidsserie_id] ON [Vaerksarkimports] ([tidsserie_id]);

-- Skemaversionen. Aktuel version = MAX(version); en migration indsætter sin egen række.
CREATE TABLE [_skema] (
    [version] INT NOT NULL,
    CONSTRAINT [PK__skema] PRIMARY KEY ([version])
);
INSERT INTO [_skema] ([version]) VALUES (1);
