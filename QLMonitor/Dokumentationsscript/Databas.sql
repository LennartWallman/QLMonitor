SET NOCOUNT ON;
 
--------------------------------------------------------------------------------
-- Konfiguration
--------------------------------------------------------------------------------
DECLARE @DatabaseName SYSNAME = N'SQLMonitor';             -- Ändra till din databas
DECLARE @OutputFolder NVARCHAR(260) = N'C:\Temp\Jobs\QLMonitor\SQLMonitor\'; -- Ändra vid behov (måste sluta med \)
 
--------------------------------------------------------------------------------
-- Skapa mappar för de olika objekttyperna
--------------------------------------------------------------------------------
DECLARE @FolderProcs NVARCHAR(500) = @OutputFolder + N'Stored_Procedures\';
DECLARE @FolderViews NVARCHAR(500) = @OutputFolder + N'Views\';
DECLARE @FolderTables NVARCHAR(500) = @OutputFolder + N'Tables\';
DECLARE @FolderLinks NVARCHAR(500) = @OutputFolder + N'Linked_Servers\';
 
DECLARE @cmdV VARCHAR(8000);
-- Skapa rot- och undermappar
SET @cmdV = CONVERT(VARCHAR(8000), N'IF NOT EXIST "' + @FolderProcs + N'" MKDIR "' + @FolderProcs + N'"');
EXEC xp_cmdshell @cmdV, NO_OUTPUT;
SET @cmdV = CONVERT(VARCHAR(8000), N'IF NOT EXIST "' + @FolderViews + N'" MKDIR "' + @FolderViews + N'"');
EXEC xp_cmdshell @cmdV, NO_OUTPUT;
SET @cmdV = CONVERT(VARCHAR(8000), N'IF NOT EXIST "' + @FolderTables + N'" MKDIR "' + @FolderTables + N'"');
EXEC xp_cmdshell @cmdV, NO_OUTPUT;
SET @cmdV = CONVERT(VARCHAR(8000), N'IF NOT EXIST "' + @FolderLinks + N'" MKDIR "' + @FolderLinks + N'"');
EXEC xp_cmdshell @cmdV, NO_OUTPUT;
 
--------------------------------------------------------------------------------
-- 1. EXPORTERA STORED PROCEDURES & VIEWS (Definitioner finns i sys.sql_modules)
--------------------------------------------------------------------------------
DECLARE @ObjectName SYSNAME, @ObjectType CHAR(2), @Definition NVARCHAR(MAX);
DECLARE @sqlGetObjects NVARCHAR(MAX) = N'
    SELECT o.name, o.type, m.definition
    FROM [' + @DatabaseName + N'].sys.objects o
    INNER JOIN [' + @DatabaseName + N'].sys.sql_modules m ON o.object_id = m.object_id
    WHERE o.type IN (''P'', ''V'') AND o.is_ms_shipped = 0';
 
-- Vi använder en temporär tabell för att loopa igenom objekten
IF OBJECT_ID('tempdb..#DbObjects') IS NOT NULL DROP TABLE #DbObjects;
CREATE TABLE #DbObjects (ObjectName SYSNAME, ObjectType CHAR(2), Definition NVARCHAR(MAX));
INSERT INTO #DbObjects EXEC sp_executesql @sqlGetObjects;
 
DECLARE obj_cursor CURSOR LOCAL FAST_FORWARD FOR 
    SELECT ObjectName, ObjectType, Definition FROM #DbObjects;
 
OPEN obj_cursor;
FETCH NEXT FROM obj_cursor INTO @ObjectName, @ObjectType, @Definition;
 
WHILE @@FETCH_STATUS = 0
BEGIN
    DECLARE @TargetFolder NVARCHAR(500) = CASE WHEN @ObjectType = 'P' THEN @FolderProcs ELSE @FolderViews END;
    DECLARE @fileName NVARCHAR(500) = @TargetFolder + @ObjectName + N'.sql';
 
    -- Spara definitionen i en global temp-tabell för BCP
    IF OBJECT_ID('tempdb..##ObjScriptTemp') IS NOT NULL DROP TABLE ##ObjScriptTemp;
    CREATE TABLE ##ObjScriptTemp (ScriptText NVARCHAR(MAX));
    INSERT INTO ##ObjScriptTemp VALUES (@Definition);
 
    -- BCP-export
    DECLARE @bcpCmd VARCHAR(8000) = 'bcp "SELECT ScriptText FROM ##ObjScriptTemp" queryout "' + CONVERT(VARCHAR(8000), @fileName) + '" -T -w -S ' + @@SERVERNAME;
    EXEC xp_cmdshell @bcpCmd, NO_OUTPUT;
 
    FETCH NEXT FROM obj_cursor INTO @ObjectName, @ObjectType, @Definition;
END
CLOSE obj_cursor;
DEALLOCATE obj_cursor;
 
 
--------------------------------------------------------------------------------
-- 2. EXPORTERA TABELLER (Genererar en grundläggande CREATE TABLE-syntax)
--------------------------------------------------------------------------------
-- Tabeller har ingen färdig textdefinition i SQL Server, så vi bygger en dynamisk generator
IF OBJECT_ID('tempdb..#TablesToScript') IS NOT NULL DROP TABLE #TablesToScript;
CREATE TABLE #TablesToScript (TableName SYSNAME);
 
DECLARE @sqlGetTables NVARCHAR(MAX) = N'
    SELECT name FROM [' + @DatabaseName + N'].sys.tables WHERE is_ms_shipped = 0';
INSERT INTO #TablesToScript EXEC sp_executesql @sqlGetTables;
 
DECLARE @TableName SYSNAME;
DECLARE table_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT TableName FROM #TablesToScript;
OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @TableName;
 
WHILE @@FETCH_STATUS = 0
BEGIN
    DECLARE @tableScript NVARCHAR(MAX) = N'CREATE TABLE [' + @TableName + N'] (' + CHAR(13)+CHAR(10);
    
    -- Hämta kolumner (detta bygger en standard-definition av kolumner och datatyper)
    IF OBJECT_ID('tempdb..#Columns') IS NOT NULL DROP TABLE #Columns;
    CREATE TABLE #Columns (ColId INT, ColDef NVARCHAR(MAX));
 
    DECLARE @sqlGetCols NVARCHAR(MAX) = N'
        SELECT 
            column_id,
            ''    ['' + c.name + ''] '' + 
            t.name + 
            CASE 
                WHEN t.name IN (''varchar'', ''char'', ''nvarchar'', ''nchar'') THEN ''('' + CASE WHEN c.max_length = -1 THEN ''MAX'' ELSE CAST(c.max_length / CASE WHEN t.name LIKE ''n%'' THEN 2 ELSE 1 END AS VARCHAR(10)) END + '')''
                WHEN t.name IN (''decimal'', ''numeric'') THEN ''('' + CAST(c.precision AS VARCHAR(5)) + '','' + CAST(c.scale AS VARCHAR(5)) + '')''
                ELSE ''''
            END + 
            CASE WHEN c.is_nullable = 1 THEN '' NULL'' ELSE '' NOT NULL'' END
        FROM [' + @DatabaseName + N'].sys.columns c
        INNER JOIN [' + @DatabaseName + N'].sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(''' + @DatabaseName + N'.dbo.' + @TableName + N''')';
    
    INSERT INTO #Columns EXEC sp_executesql @sqlGetCols;
 
    -- Sätt ihop kolumnerna till ett CREATE TABLE-skript
    SELECT @tableScript = @tableScript + ColDef + N',' + CHAR(13)+CHAR(10)
    FROM #Columns ORDER BY ColId;
 
    -- Ta bort sista kommat och stäng parentesen
    SET @tableScript = SUBSTRING(@tableScript, 1, LEN(@tableScript) - 3) + CHAR(13)+CHAR(10) + N');';
 
    -- Exportera tabellskriptet
    DECLARE @tableFileName NVARCHAR(500) = @FolderTables + @TableName + N'.sql';
    
    IF OBJECT_ID('tempdb..##TableScriptTemp') IS NOT NULL DROP TABLE ##TableScriptTemp;
    CREATE TABLE ##TableScriptTemp (ScriptText NVARCHAR(MAX));
    INSERT INTO ##TableScriptTemp VALUES (@tableScript);
 
    DECLARE @bcpTableCmd VARCHAR(8000) = 'bcp "SELECT ScriptText FROM ##TableScriptTemp" queryout "' + CONVERT(VARCHAR(8000), @tableFileName) + '" -T -w -S ' + @@SERVERNAME;
    EXEC xp_cmdshell @bcpTableCmd, NO_OUTPUT;
 
    FETCH NEXT FROM table_cursor INTO @TableName;
END
CLOSE table_cursor;
DEALLOCATE table_cursor;
 
 
--------------------------------------------------------------------------------
-- 3. EXPORTERA LÄNKADE SERVRAR (Linked Servers)
--------------------------------------------------------------------------------
IF OBJECT_ID('tempdb..#LinkedServers') IS NOT NULL DROP TABLE #LinkedServers;
CREATE TABLE #LinkedServers (srvname SYSNAME, provider NVARCHAR(128), datasource NVARCHAR(4000), catalog NVARCHAR(128));
INSERT INTO #LinkedServers
SELECT name, provider, data_source, catalog FROM sys.servers WHERE is_linked = 1;
 
DECLARE @SrvName SYSNAME, @Provider NVARCHAR(128), @DataSource NVARCHAR(4000), @Catalog NVARCHAR(128);
DECLARE link_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT srvname, provider, datasource, catalog FROM #LinkedServers;
OPEN link_cursor;
FETCH NEXT FROM link_cursor INTO @SrvName, @Provider, @DataSource, @Catalog;
 
WHILE @@FETCH_STATUS = 0
BEGIN
    DECLARE @linkScript NVARCHAR(MAX) = N'-- =========================================================================' + CHAR(13)+CHAR(10)
        + N'-- Skript för att skapa länkad server: ' + @SrvName + CHAR(13)+CHAR(10)
        + N'-- =========================================================================' + CHAR(13)+CHAR(10)+CHAR(13)+CHAR(10)
        + N'IF EXISTS (SELECT srv.name FROM sys.servers srv WHERE srv.name = N''' + @SrvName + N''')' + CHAR(13)+CHAR(10)
        + N'    EXEC master.dbo.sp_dropserver @server=N''' + @SrvName + N''', @droplogins=''droplogins'';' + CHAR(13)+CHAR(10)+CHAR(13)+CHAR(10)
        + N'EXEC master.dbo.sp_addlinkedserver ' + CHAR(13)+CHAR(10)
        + N'    @server = N''' + @SrvName + N''',' + CHAR(13)+CHAR(10)
        + N'    @srvproduct = N'''',' + CHAR(13)+CHAR(10)
        + N'    @provider = N''' + ISNULL(@Provider, N'SQLNCLI') + N''',' + CHAR(13)+CHAR(10)
        + N'    @datasrc = N''' + ISNULL(@DataSource, N'') + N''''
        + CASE WHEN @Catalog IS NOT NULL THEN N',' + CHAR(13)+CHAR(10) + N'    @catalog = N''' + @Catalog + N'''' ELSE N'' END + N';' + CHAR(13)+CHAR(10)+CHAR(13)+CHAR(10)
        + N'-- OBS: Lösenord och inloggningsmappningar (sp_addlinkedsrvlogin) måste konfigureras manuellt av säkerhetsskäl.' + CHAR(13)+CHAR(10);
 
    DECLARE @linkFileName NVARCHAR(500) = @FolderLinks + REPLACE(@SrvName, '\', '_') + N'.sql';
 
    IF OBJECT_ID('tempdb..##LinkScriptTemp') IS NOT NULL DROP TABLE ##LinkScriptTemp;
    CREATE TABLE ##LinkScriptTemp (ScriptText NVARCHAR(MAX));
    INSERT INTO ##LinkScriptTemp VALUES (@linkScript);
 
    DECLARE @bcpLinkCmd VARCHAR(8000) = 'bcp "SELECT ScriptText FROM ##LinkScriptTemp" queryout "' + CONVERT(VARCHAR(8000), @linkFileName) + '" -T -w -S ' + @@SERVERNAME;
    EXEC xp_cmdshell @bcpLinkCmd, NO_OUTPUT;
 
    FETCH NEXT FROM link_cursor INTO @SrvName, @Provider, @DataSource, @Catalog;
END
CLOSE link_cursor;
DEALLOCATE link_cursor;
 
--------------------------------------------------------------------------------
-- Städa upp
--------------------------------------------------------------------------------
IF OBJECT_ID('tempdb..##ObjScriptTemp') IS NOT NULL DROP TABLE ##ObjScriptTemp;
IF OBJECT_ID('tempdb..##TableScriptTemp') IS NOT NULL DROP TABLE ##TableScriptTemp;
IF OBJECT_ID('tempdb..##LinkScriptTemp') IS NOT NULL DROP TABLE ##LinkScriptTemp;
 
PRINT N'Export klar! Kontrollera mappen: ' + @OutputFolder;