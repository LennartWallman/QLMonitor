SET NOCOUNT ON;
 
--------------------------------------------------------------------------------
-- Konfiguration
--------------------------------------------------------------------------------
DECLARE @OutputFolder NVARCHAR(260) = N'C:\Temp\Jobs\QLMonitor\';  -- ändra vid behov. Se till att det slutar med \
 
--------------------------------------------------------------------------------
-- Hjälp: skapa mapp om ej finns
--------------------------------------------------------------------------------
DECLARE @mkCmd NVARCHAR(2000) = N'IF NOT EXIST "' + @OutputFolder + N'" MKDIR "' + @OutputFolder + N'"';
DECLARE @cmdV VARCHAR(8000);
SET @cmdV = CONVERT(VARCHAR(8000), @mkCmd);
EXEC xp_cmdshell @cmdV, NO_OUTPUT;
 
--------------------------------------------------------------------------------
-- Lista med jobb att exportera
--------------------------------------------------------------------------------
DECLARE @Jobs TABLE (JobName SYSNAME);
INSERT INTO @Jobs (JobName) VALUES
    (N'Samla data'),
    (N'SQLMonitor - Kör DTA-analys'),
    (N'SQLMonitor - Rensa gamla filer'),
    (N'SQLMonitor - Starta Workload-insamling'),
    (N'SQLMonitor - Stoppa Workload-insamling');
 
--------------------------------------------------------------------------------
-- Cursor över jobb
--------------------------------------------------------------------------------
DECLARE @JobName SYSNAME;
DECLARE job_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT JobName FROM @Jobs;
OPEN job_cursor;
FETCH NEXT FROM job_cursor INTO @JobName;
 
WHILE @@FETCH_STATUS = 0
BEGIN
    ---------------------------------------------------------------------------
    -- Hämta metadata för jobbet
    ---------------------------------------------------------------------------
    DECLARE @job_id UNIQUEIDENTIFIER;
    SELECT @job_id = job_id FROM msdb.dbo.sysjobs WHERE [name] = @JobName;
 
    IF @job_id IS NOT NULL
    BEGIN
        DECLARE @script NVARCHAR(MAX) = N'';
        DECLARE @enabled TINYINT;
        DECLARE @description NVARCHAR(512);
        DECLARE @start_step_id INT;
        DECLARE @category_name SYSNAME;
        DECLARE @owner_login_name SYSNAME;
        DECLARE @notify_level_eventlog INT;
        DECLARE @notify_level_email INT;
        DECLARE @notify_level_netsend INT;
        DECLARE @notify_level_page INT;
        DECLARE @delete_level INT;
 
        SELECT
            @enabled = j.enabled,
            @description = j.description,
            @start_step_id = j.start_step_id,
            @category_name = ISNULL(c.name, N'[Uncategorized (Local)]'),
            @owner_login_name = SUSER_SNAME(j.owner_sid),
            @notify_level_eventlog = j.notify_level_eventlog,
            @notify_level_email = j.notify_level_email,
            @notify_level_netsend = j.notify_level_netsend,
            @notify_level_page = j.notify_level_page,
            @delete_level = j.delete_level
        FROM msdb.dbo.sysjobs j
        LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
        WHERE j.job_id = @job_id;
 
        -----------------------------------------------------------------------
        -- Bygg CREATE-skriptet (text)
        -----------------------------------------------------------------------
        SET @script = @script + N'USE [msdb];' + CHAR(13)+CHAR(10);
        SET @script = @script + N'GO' + CHAR(13)+CHAR(10)+CHAR(13)+CHAR(10);
        SET @script = @script + N'BEGIN TRANSACTION;' + CHAR(13)+CHAR(10);
        SET @script = @script + N'DECLARE @ReturnCode INT;' + CHAR(13)+CHAR(10);
        SET @script = @script + N'SELECT @ReturnCode = 0;' + CHAR(13)+CHAR(10) + CHAR(13)+CHAR(10);
 
        -- Category (skapa om saknas)
        IF NOT EXISTS (SELECT 1 FROM msdb.dbo.syscategories WHERE name = @category_name AND category_class = 1)
        BEGIN
            SET @script = @script + N'IF NOT EXISTS (SELECT name FROM msdb.dbo.syscategories WHERE name=N''' + REPLACE(@category_name,'''','''''') + N''' AND category_class=1) ' + CHAR(13)+CHAR(10)
                        + N'BEGIN' + CHAR(13)+CHAR(10)
                        + N'    EXEC @ReturnCode = msdb.dbo.sp_add_category @class=N''JOB'', @type=N''LOCAL'', @name=N''' + REPLACE(@category_name,'''','''''') + N''';' + CHAR(13)+CHAR(10)
                        + N'    IF (@@ERROR <> 0 OR @ReturnCode <> 0) GOTO QuitWithRollback;' + CHAR(13)+CHAR(10)
                        + N'END' + CHAR(13)+CHAR(10) + CHAR(13)+CHAR(10);
        END
 
        -- sp_add_job
        SET @script = @script + N'DECLARE @jobId BINARY(16);' + CHAR(13)+CHAR(10);
        SET @script = @script + N'EXEC @ReturnCode = msdb.dbo.sp_add_job @job_name=N''' + REPLACE(@JobName,'''','''''') + N''', ' + CHAR(13)+CHAR(10)
                    + N'    @enabled=' + CAST(ISNULL(@enabled,0) AS NVARCHAR(3)) + N',' + CHAR(13)+CHAR(10)
                    + N'    @notify_level_eventlog=' + CAST(ISNULL(@notify_level_eventlog,0) AS NVARCHAR(3)) + N',' + CHAR(13)+CHAR(10)
                    + N'    @notify_level_email=' + CAST(ISNULL(@notify_level_email,0) AS NVARCHAR(3)) + N',' + CHAR(13)+CHAR(10)
                    + N'    @notify_level_netsend=' + CAST(ISNULL(@notify_level_netsend,0) AS NVARCHAR(3)) + N',' + CHAR(13)+CHAR(10)
                    + N'    @notify_level_page=' + CAST(ISNULL(@notify_level_page,0) AS NVARCHAR(3)) + N',' + CHAR(13)+CHAR(10)
                    + N'    @delete_level=' + CAST(ISNULL(@delete_level,0) AS NVARCHAR(3)) + N',' + CHAR(13)+CHAR(10)
                    + N'    @description=N''' + ISNULL(REPLACE(@description,'''',''''''),N'') + N''',' + CHAR(13)+CHAR(10)
                    + N'    @category_name=N''' + REPLACE(@category_name,'''','''''') + N''',' + CHAR(13)+CHAR(10)
                    + N'    @owner_login_name=N''' + ISNULL(REPLACE(@owner_login_name,'''',''''''),N'') + N''', @job_id = @jobId OUTPUT;' + CHAR(13)+CHAR(10)
                    + N'IF (@@ERROR <> 0 OR @ReturnCode <> 0) GOTO QuitWithRollback;' + CHAR(13)+CHAR(10) + CHAR(13)+CHAR(10);
 
        -----------------------------------------------------------------------
        -- Jobbsteg
        -----------------------------------------------------------------------
        DECLARE @step_id INT, @step_name SYSNAME, @subsystem NVARCHAR(40), @command NVARCHAR(MAX),
                @on_success_action TINYINT, @on_fail_action TINYINT, @database_name SYSNAME,
                @retry_attempts INT, @retry_interval INT;
 
        DECLARE step_cursor CURSOR LOCAL FOR
            SELECT step_id, step_name, subsystem, command, on_success_action, on_fail_action, database_name, retry_attempts, retry_interval
            FROM msdb.dbo.sysjobsteps WHERE job_id = @job_id ORDER BY step_id;
 
        OPEN step_cursor;
        FETCH NEXT FROM step_cursor INTO @step_id, @step_name, @subsystem, @command, @on_success_action, @on_fail_action, @database_name, @retry_attempts, @retry_interval;
 
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @script = @script
                + N'EXEC @ReturnCode = msdb.dbo.sp_add_jobstep @job_id=@jobId, @step_name=N''' + REPLACE(ISNULL(@step_name,N''),'''','''''') + N''',' + CHAR(13)+CHAR(10)
                + N'    @step_id=' + CAST(@step_id AS NVARCHAR(10)) + N', @cmdexec_success_code=0, @on_success_action=' + CAST(ISNULL(@on_success_action,0) AS NVARCHAR(3)) + N',' + CHAR(13)+CHAR(10)
                + N'    @on_fail_action=' + CAST(ISNULL(@on_fail_action,0) AS NVARCHAR(3)) + N', @retry_attempts=' + CAST(ISNULL(@retry_attempts,0) AS NVARCHAR(5)) + N', @retry_interval=' + CAST(ISNULL(@retry_interval,0) AS NVARCHAR(5)) + N',' + CHAR(13)+CHAR(10)
                + N'    @subsystem=N''' + REPLACE(ISNULL(@subsystem,N''),'''','''''') + N''', @command=N''' + REPLACE(ISNULL(@command,N''),'''','''''') + N''',' + CHAR(13)+CHAR(10)
                + N'    @database_name=N''' + ISNULL(REPLACE(@database_name,'''',''''''),N'master') + N''', @flags=0;' + CHAR(13)+CHAR(10)
                + N'IF (@@ERROR <> 0 OR @ReturnCode <> 0) GOTO QuitWithRollback;' + CHAR(13)+CHAR(10) + CHAR(13)+CHAR(10);
 
            FETCH NEXT FROM step_cursor INTO @step_id, @step_name, @subsystem, @command, @on_success_action, @on_fail_action, @database_name, @retry_attempts, @retry_interval;
        END
 
        CLOSE step_cursor;
        DEALLOCATE step_cursor;
 
        -----------------------------------------------------------------------
        -- Koppla till server
        -----------------------------------------------------------------------
        SET @script = @script + N'EXEC @ReturnCode = msdb.dbo.sp_add_jobserver @job_id = @jobId, @server_name = N''' + REPLACE(@@SERVERNAME,'''','''''') + N''';' + CHAR(13)+CHAR(10)
                    + N'IF (@@ERROR <> 0 OR @ReturnCode <> 0) GOTO QuitWithRollback;' + CHAR(13)+CHAR(10) + CHAR(13)+CHAR(10);
 
        -----------------------------------------------------------------------
        -- Scheman (om finns)
        -----------------------------------------------------------------------
        DECLARE @schedule_id INT, @schedule_name SYSNAME, @enabled_sched TINYINT, @freq_type INT, @freq_interval INT,
                @freq_subday_type INT, @freq_subday_interval INT, @freq_relative_interval INT, @freq_recurrence_factor INT,
                @active_start_date INT, @active_end_date INT, @active_start_time INT, @active_end_time INT;
 
        DECLARE sched_cursor CURSOR LOCAL FOR
            SELECT s.schedule_id, s.name, s.enabled, s.freq_type, s.freq_interval, s.freq_subday_type,
                   s.freq_subday_interval, s.freq_relative_interval, s.freq_recurrence_factor,
                   s.active_start_date, s.active_end_date, s.active_start_time, s.active_end_time
            FROM msdb.dbo.sysschedules s
            INNER JOIN msdb.dbo.sysjobschedules js ON s.schedule_id = js.schedule_id
            WHERE js.job_id = @job_id;
 
        OPEN sched_cursor;
        FETCH NEXT FROM sched_cursor INTO @schedule_id, @schedule_name, @enabled_sched, @freq_type, @freq_interval, @freq_subday_type,
                                       @freq_subday_interval, @freq_relative_interval, @freq_recurrence_factor,
                                       @active_start_date, @active_end_date, @active_start_time, @active_end_time;
 
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @script = @script
                + N'EXEC @ReturnCode = msdb.dbo.sp_add_jobschedule @job_id = @jobId, @name = N''' + REPLACE(ISNULL(@schedule_name,N''),'''','''''') + N''', ' + CHAR(13)+CHAR(10)
                + N'    @enabled=' + CAST(ISNULL(@enabled_sched,0) AS NVARCHAR(3)) + N', @freq_type=' + CAST(ISNULL(@freq_type,0) AS NVARCHAR(10)) + N',' + CHAR(13)+CHAR(10)
                + N'    @freq_interval=' + CAST(ISNULL(@freq_interval,0) AS NVARCHAR(10)) + N', @freq_subday_type=' + CAST(ISNULL(@freq_subday_type,0) AS NVARCHAR(10)) + N',' + CHAR(13)+CHAR(10)
                + N'    @freq_subday_interval=' + CAST(ISNULL(@freq_subday_interval,0) AS NVARCHAR(10)) + N', @freq_relative_interval=' + CAST(ISNULL(@freq_relative_interval,0) AS NVARCHAR(10)) + N',' + CHAR(13)+CHAR(10)
                + N'    @freq_recurrence_factor=' + CAST(ISNULL(@freq_recurrence_factor,0) AS NVARCHAR(10)) + N', @active_start_date=' + CAST(ISNULL(@active_start_date,0) AS NVARCHAR(10)) + N',' + CHAR(13)+CHAR(10)
                + N'    @active_end_date=' + CAST(ISNULL(@active_end_date,0) AS NVARCHAR(10)) + N', @active_start_time=' + CAST(ISNULL(@active_start_time,0) AS NVARCHAR(10)) + N', @active_end_time=' + CAST(ISNULL(@active_end_time,0) AS NVARCHAR(10)) + N';' + CHAR(13)+CHAR(10)
                + N'IF (@@ERROR <> 0 OR @ReturnCode <> 0) GOTO QuitWithRollback;' + CHAR(13)+CHAR(10) + CHAR(13)+CHAR(10);
 
            FETCH NEXT FROM sched_cursor INTO @schedule_id, @schedule_name, @enabled_sched, @freq_type, @freq_interval, @freq_subday_type,
                                           @freq_subday_interval, @freq_relative_interval, @freq_recurrence_factor,
                                           @active_start_date, @active_end_date, @active_start_time, @active_end_time;
        END
 
        CLOSE sched_cursor;
        DEALLOCATE sched_cursor;
 
        -----------------------------------------------------------------------
        -- Slutför transaktionstext
        -----------------------------------------------------------------------
        SET @script = @script + N'EXEC @ReturnCode = msdb.dbo.sp_update_job @job_id = @jobId, @start_step_id = ' + CAST(ISNULL(@start_step_id,1) AS NVARCHAR(10)) + N';' + CHAR(13)+CHAR(10)
                    + N'IF (@@ERROR <> 0 OR @ReturnCode <> 0) GOTO QuitWithRollback;' + CHAR(13)+CHAR(10)
                    + N'' + CHAR(13)+CHAR(10)
                    + N'COMMIT TRANSACTION;' + CHAR(13)+CHAR(10)
                    + N'GOTO EndSave;' + CHAR(13)+CHAR(10)
                    + N'' + CHAR(13)+CHAR(10)
                    + N'QuitWithRollback:' + CHAR(13)+CHAR(10)
                    + N'    IF (@@TRANCOUNT > 0) ROLLBACK TRANSACTION;' + CHAR(13)+CHAR(10)
                    + N'' + CHAR(13)+CHAR(10)
                    + N'EndSave:' + CHAR(13)+CHAR(10)
                    + N'GO' + CHAR(13)+CHAR(10);
 
        -----------------------------------------------------------------------
        -- Skriv ut i SSMS-resultat (PRINT)
        -----------------------------------------------------------------------
        PRINT N'-- =============================================';
        PRINT N'-- Skript för jobb: ' + @JobName;
        PRINT N'-- =============================================';
        PRINT @script;
        PRINT N'';
 
        -----------------------------------------------------------------------
        -- Skriv skriptet till fil med hjälp av BCP (Säkert mot alla tecken/rader)
        -----------------------------------------------------------------------
        DECLARE @fileName NVARCHAR(500) = @OutputFolder + REPLACE(REPLACE(@JobName, ' ', '_'), N'-', N'_') + N'.sql';
 
        -- Skapa en temporär global tabell för att hålla skriptet under exporten
        IF OBJECT_ID('tempdb..##JobScriptTemp') IS NOT NULL 
            DROP TABLE ##JobScriptTemp;
 
        CREATE TABLE ##JobScriptTemp (ScriptText NVARCHAR(MAX));
        INSERT INTO ##JobScriptTemp (ScriptText) VALUES (@script);
 
        -- Bygg BCP-kommandot. Vi använder -w för Unicode (stödjer å, ä, ö) och -T för Trusted Connection
        DECLARE @bcpCmd VARCHAR(8000);
        SET @bcpCmd = 'bcp "SELECT ScriptText FROM ##JobScriptTemp" queryout "' + CONVERT(VARCHAR(8000), @fileName) + '" -T -w -S ' + @@SERVERNAME;
 
        -- Kör exporten
        EXEC xp_cmdshell @bcpCmd, NO_OUTPUT;
 
        -- Städa upp den temporära tabellen
        IF OBJECT_ID('tempdb..##JobScriptTemp') IS NOT NULL 
            DROP TABLE ##JobScriptTemp;
 
        PRINT N'Skrev fil: ' + @fileName;
        PRINT N'';
    END
    ELSE
    BEGIN
        PRINT N'Jobb ej hittat: ' + @JobName;
    END
 
    FETCH NEXT FROM job_cursor INTO @JobName;
END
 
CLOSE job_cursor;
DEALLOCATE job_cursor;
 
PRINT N'Klar.';