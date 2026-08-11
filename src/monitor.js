// Fil: src/monitor.js
console.log('--- NY OPTIMERAD VERSION AV MONITOR.JS LADDAD ---', new Date().toISOString());
 
const sql = require('mssql'); 
 
const { sendEmail } = require('./emailService'); // NYTT: Importerar vår e-posttjänst
 
// ============================================================================
// CENTRALA ANSLUTNINGSPOOLER
// ============================================================================
const connectionPools = new Map();
let configDbPool;
 
const serverStatus = {};
let servers = [];
let io = null;
 
const setIo = (socketIoInstance) => {
    io = socketIoInstance;
    console.log('[Monitor] Socket.IO-instans har mottagits och är redo.');
};
 
const configDbConfig = {
    user: process.env.CONFIG_DB_USER,
    password: process.env.CONFIG_DB_PASSWORD,
    server: process.env.CONFIG_DB_HOST,
    database: process.env.CONFIG_DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        useUTC: false, // <-- LÄGG TILL DENNA RAD
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
};
 
// ============================================================================
// HJÄLPFUNKTIONER
// ============================================================================
function findServerByName(serverName) {
    if (!servers || servers.length === 0) return null;
    return servers.find(s => s.ServerName === serverName || s.displayName === serverName || s.host === serverName);
}
 
function createServerConfig(server) {
    const baseConfig = {
         options: { encrypt: false, trustServerCertificate: true, useUTC: false },
        connectionTimeout: 60000,
        requestTimeout: 60000
    };
    if (server.ConnectionString && server.ConnectionString.trim() !== '') {
        const connStringParts = {};
        server.ConnectionString.split(';').forEach(part => {
            const [key, value] = part.split('=');
            if (key && value) connStringParts[key.trim()] = value.trim();
        });
        return {
            ...baseConfig,
            server: connStringParts['Server'] || connStringParts['Data Source'] || server.ServerName,
            database: connStringParts['Database'] || connStringParts['Initial Catalog'] || 'msdb',
            user: connStringParts['User Id'] || connStringParts['UID'] || server.dbUser,
            password: connStringParts['Password'] || connStringParts['PWD'] || server.dbPassword
        };
    }
    return {
        ...baseConfig,
        server: server.ServerName,
        database: 'msdb',
        user: server.dbUser,
        password: server.dbPassword
    };
}
 
function getPool(poolType = 'management') {
    if (poolType === 'management' || poolType === 'config') {
        if (!configDbPool || !configDbPool.connected) {
            throw new Error('Management database pool är inte tillgänglig');
        }
        return configDbPool;
    }
    
    const mdwServerName = process.env.MDW_SERVER;
    if (!mdwServerName) {
        throw new Error('MDW_SERVER är inte konfigurerad i .env');
    }
    
    const mdwServerConfig = findServerByName(mdwServerName);
    if (!mdwServerConfig) {
        throw new Error(`MDW server ${mdwServerName} hittades inte i konfigurationen`);
    }
    
    const pool = connectionPools.get(mdwServerConfig.ServerName);
    if (!pool || !pool.connected) {
        throw new Error(`Pool för MDW server ${mdwServerName} är inte tillgänglig`);
    }
    
    return pool;
}
 
async function loadServerConfiguration() {
    try {
        console.log('[Pool Manager] Ansluter till central konfigurationsdatabas...');
        configDbPool = await new sql.ConnectionPool(configDbConfig).connect();
        console.log('[Pool Manager] ✅ Anslutning till konfigurationsdatabasen lyckades.');
 
        const result = await configDbPool.request().query(`
            SELECT 
                id, 
                displayName, 
                host AS ServerName, 
                dbUser, 
                dbPassword, 
                isEnabled, 
                ConnectionString, 
                ISNULL(Environment, 'Okänd') AS Environment, -- <-- SÄKERHETSKONTROLL HÄR
                MonitorJobs,
                MonitorDisk,
                EmailNotificationsEnabled,
                JobCheckIntervalSeconds,
                DiskCheckIntervalSeconds
            FROM [Configurationsdb].[dbo].[MonitoredServers] 
            WHERE isEnabled = 1
        `);
        
        const loadedServers = result.recordset.map(s => ({ ...s, ConnectionConfig: createServerConfig(s) }));
        servers.length = 0;
        servers.push(...loadedServers);
        console.log(`✅ Konfiguration laddad för ${servers.length} servrar.`);
 
        for (const server of servers) {
            try {
                if (connectionPools.has(server.ServerName)) {
                    await connectionPools.get(server.ServerName).close();
                }
                console.log(`[Pool Manager] Skapar anslutningspool för ${server.ServerName}...`);
                const pool = new sql.ConnectionPool(server.ConnectionConfig);
                await pool.connect();
                connectionPools.set(server.ServerName, pool);
                console.log(`[Pool Manager] ✅ Pool för ${server.ServerName} är ansluten och redo.`);
            } catch (err) {
                console.error(`[Pool Manager] ❌ Kunde INTE skapa pool för ${server.ServerName}:`, err.message);
            }
        }
    } catch (err) {
        console.error('❌ FATALT FEL: Kunde inte ladda serverkonfiguration:', err);
        throw err;
    }
}
 
async function _updateFullJobStatus(server) {
    try {
        const pool = connectionPools.get(server.ServerName);
        if (!pool || !pool.connected) {
            console.warn(`[Full Job Status] Pool for ${server.ServerName} is not available. Skipping.`);
            return;
        }
 
        const jobDetailsResult = await pool.request().execute('msdb.dbo.usp_GetJobDetails');
        const jobs = jobDetailsResult.recordset;
 
        // =======================================================================
        // === DEBUG: Koden är nu på RÄTT plats och använder RÄTT variabelnamn ===
        // =======================================================================
        console.log(`--- SQL SORTERINGSKONTROLL FÖR ${server.ServerName} ---`);
        if (jobs && jobs.length > 0) {
          jobs.slice(0, 15).forEach(job => { // Loggar 15 rader för säkerhets skull
            console.log(`Status: ${job.LastRunStatus.padEnd(12)} | Jobb: ${job.JobName}`);
          });
        } else {
          console.log('Inga jobb returnerades från SQL.');
        }
        console.log('----------------------------------------------------');
        // =======================================================================
 
        const configPool = getPool('config');
        const [acksResult, solutionsResult] = await Promise.all([
            configPool.request().execute('dbo.usp_GetAllAcknowledgements'),
            configPool.request().execute('dbo.usp_GetAllSolutions')
        ]);
 
        const ackMap = new Map(
            acksResult.recordset.map(ack => [ack.ServerName + ack.JobName, ack])
        );
        const solutionMap = new Map(
            solutionsResult.recordset.map(sol => [sol.ServerName + sol.JobName, sol])
        );
 
        const enrichedJobs = jobs.map(job => {
            const jobKey = server.ServerName + job.JobName;
            const ackData = ackMap.get(jobKey);
            const solutionData = solutionMap.get(jobKey);
 
            return {
                ...job,
                CategoryName: job.CategoryName ? job.CategoryName.trim() : '[Uncategorized (Local)]', // Säkerställ att kategori skickas till frontend
                AcknowledgedBy: ackData ? ackData.AcknowledgedBy : null,
                AcknowledgedAt: ackData ? ackData.AcknowledgedAt : null,
                HasSolution: !!solutionData,
                SolutionNotes: solutionData ? solutionData.SolutionNotes : null
            };
        });
 
        if (serverStatus[server.ServerName]) {
            serverStatus[server.ServerName].jobList = enrichedJobs;
        }
 
    } catch (err) {
        console.error(`[Full Job Status] Fel för ${server.ServerName}: ${err.message}`);
        if (serverStatus[server.ServerName]) {
            serverStatus[server.ServerName].error = `Kunde inte hämta full jobbstatus: ${err.message}`;
            serverStatus[server.ServerName].jobList = [];
        }
    }
}
 
// ============================================================================
// 🧠 BAKEGRUNDSINSAMLING: Hämta minne, belastning, TempDB och loggutrymme (7 dagar)
// ============================================================================
async function collectAndSaveMemoryHistory() {
    console.log('🧠 [Monitor] Startar insamling av system- och minneshistorik...');
    
    let centralPool;
    try {
        centralPool = getPool('management'); 
    } catch (poolErr) {
        console.error('❌ [Monitor] Kunde inte hitta central databasanslutning ("management"):', poolErr.message);
        return;
    }
 
    for (const server of servers) {
        if (!server.isEnabled) continue;
        const serverName = server.ServerName;
        
        try {
            const serverPool = connectionPools.get(serverName);
            if (!serverPool || !serverPool.connected) continue;
 
            // ----------------------------------------------------------------
            // 1. HÄMTA MINNESDATA
            // ----------------------------------------------------------------
            const memoryQuery = `
                SELECT 
                    osm.total_physical_memory_kb / 1024 AS Total_Server_Memory_MB,
                    osm.available_physical_memory_kb / 1024 AS Available_Server_Memory_MB,
                    osm.system_memory_state_desc AS Server_Memory_State,
                    pm.physical_memory_in_use_kb / 1024 AS SQL_Used_Memory_MB,
                    pm.memory_utilization_percentage AS SQL_Memory_Utilization_Percent,
                    MAX(CASE WHEN counter_name = 'Target Server Memory (KB)' THEN cntr_value / 1024 END) AS SQL_Target_Memory_MB,
                    MAX(CASE WHEN counter_name = 'Total Server Memory (KB)' THEN cntr_value / 1024 END) AS SQL_Allocated_Memory_MB
                FROM sys.dm_os_sys_memory osm
                CROSS JOIN sys.dm_os_process_memory pm
                CROSS JOIN sys.dm_os_performance_counters pc
                WHERE pc.object_name LIKE '%:Memory Manager%'
                  AND pc.counter_name IN ('Target Server Memory (KB)', 'Total Server Memory (KB)')
                GROUP BY 
                    osm.total_physical_memory_kb, 
                    osm.available_physical_memory_kb, 
                    osm.system_memory_state_desc, 
                    pm.physical_memory_in_use_kb, 
                    pm.memory_utilization_percentage;
            `;
            const memoryResult = await serverPool.request().query(memoryQuery);
            
            if (memoryResult.recordset.length > 0) {
                const data = memoryResult.recordset[0];
                await centralPool.request()
                    .input('ServerName', sql.NVarChar(128), serverName)
                    .input('Total_Server_Memory_MB', sql.Int, data.Total_Server_Memory_MB)
                    .input('Available_Server_Memory_MB', sql.Int, data.Available_Server_Memory_MB)
                    .input('Server_Memory_State', sql.NVarChar(128), data.Server_Memory_State)
                    .input('SQL_Used_Memory_MB', sql.Int, data.SQL_Used_Memory_MB)
                    .input('SQL_Memory_Utilization_Percent', sql.Int, data.SQL_Memory_Utilization_Percent)
                    .input('SQL_Target_Memory_MB', sql.Int, data.SQL_Target_Memory_MB)
                    .input('SQL_Allocated_Memory_MB', sql.Int, data.SQL_Allocated_Memory_MB)
                    .query(`
                        INSERT INTO dbo.ServerMemoryHistory (
                            ServerName, Total_Server_Memory_MB, Available_Server_Memory_MB, 
                            Server_Memory_State, SQL_Used_Memory_MB, SQL_Memory_Utilization_Percent, 
                            SQL_Target_Memory_MB, SQL_Allocated_Memory_MB
                        ) VALUES (
                            @ServerName, @Total_Server_Memory_MB, @Available_Server_Memory_MB, 
                            @Server_Memory_State, @SQL_Used_Memory_MB, @SQL_Memory_Utilization_Percent, 
                            @SQL_Target_Memory_MB, @SQL_Allocated_Memory_MB
                        )
                    `);
            }
 
            // ----------------------------------------------------------------
            // 2. HÄMTA SYSTEMBELASTNING & TEMPDB
            // ----------------------------------------------------------------
            const activityQuery = `
                SELECT 
                    (SELECT COUNT(*) FROM sys.dm_exec_sessions WITH (NOLOCK) WHERE is_user_process = 1) AS UserConnections,
                    (SELECT cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK) WHERE counter_name = 'Batch Requests/sec' AND object_name LIKE '%SQL Statistics%') AS BatchRequests,
                    (SELECT SUM(size * 8.0 / 1024.0) FROM tempdb.sys.database_files WITH (NOLOCK) WHERE type_desc = 'ROWS') AS TempDB_Total_MB,
                    (SELECT SUM(FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024.0) FROM tempdb.sys.database_files WITH (NOLOCK) WHERE type_desc = 'ROWS') AS TempDB_Used_MB
            `;
            const activityResult = await serverPool.request().query(activityQuery);
            
            if (activityResult.recordset.length > 0) {
                const act = activityResult.recordset[0];
                const totalMb = act.TempDB_Total_MB || 1;
                const usedMb = act.TempDB_Used_MB || 0;
                const usedPercent = ((usedMb / totalMb) * 100).toFixed(2);
 
                await centralPool.request()
                    .input('ServerName', sql.NVarChar(128), serverName)
                    .input('UserConnections', sql.Int, act.UserConnections)
                    .input('BatchRequestsPerSec', sql.Int, act.BatchRequests || 0)
                    .input('TempDB_Total_MB', sql.Int, Math.round(totalMb))
                    .input('TempDB_Used_MB', sql.Int, Math.round(usedMb))
                    .input('TempDB_Used_Percent', sql.Decimal(5, 2), usedPercent)
                    .query(`
                        INSERT INTO dbo.ServerActivityHistory (
                            ServerName, UserConnections, BatchRequestsPerSec, 
                            TempDB_Total_MB, TempDB_Used_MB, TempDB_Used_Percent
                        ) VALUES (
                            @ServerName, @UserConnections, @BatchRequestsPerSec, 
                            @TempDB_Total_MB, @TempDB_Used_MB, @TempDB_Used_Percent
                        )
                    `);
            }
 
            // ----------------------------------------------------------------
            // 3. HÄMTA TRANSAKTIONSLOGG-UTRYMME (Per Databas)
            // ----------------------------------------------------------------
            const logSpaceQuery = `
                SELECT 
                    database_id,
                    name AS DatabaseName,
                    CAST(FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024.0 AS DECIMAL(18,2)) AS UsedMB,
                    CAST(size * 8.0 / 1024.0 AS DECIMAL(18,2)) AS TotalMB
                FROM sys.master_files
                WHERE type_desc = 'LOG' 
                  AND DB_NAME(database_id) NOT IN ('master', 'model', 'msdb');
            `;
            const logResult = await serverPool.request().query(logSpaceQuery);
            
            for (const dbLog of logResult.recordset) {
                const totalLogMb = dbLog.TotalMB || 1;
                const usedLogMb = dbLog.UsedMB || 0;
                const logPercent = ((usedLogMb / totalLogMb) * 100).toFixed(2);
 
                await centralPool.request()
                    .input('ServerName', sql.NVarChar(128), serverName)
                    .input('DatabaseName', sql.NVarChar(128), dbLog.DatabaseName)
                    .input('LogSize_MB', sql.Decimal(18, 2), totalLogMb)
                    .input('LogSpaceUsed_Percent', sql.Decimal(5, 2), logPercent)
                    .query(`
                        INSERT INTO dbo.DatabaseLogSpaceHistory (
                            ServerName, DatabaseName, LogSize_MB, LogSpaceUsed_Percent, Status
                        ) VALUES (
                            @ServerName, @DatabaseName, @LogSize_MB, @LogSpaceUsed_Percent, 0
                        )
                    `);
            }
 
            console.log(`✅ [Monitor] Sparade all systemhistorik för ${serverName}`);
 
        } catch (err) {
            console.error(`❌ [Monitor] Misslyckades att spara systemhistorik för ${serverName}:`, err.message);
        }
    }
 
    // 4. Rensa all data äldre än 7 dagar
    try {
        await centralPool.request().query(`
            DELETE FROM dbo.ServerMemoryHistory WHERE CollectionTime < DATEADD(day, -7, GETDATE());
            DELETE FROM dbo.ServerActivityHistory WHERE CollectionTime < DATEADD(day, -7, GETDATE());
            DELETE FROM dbo.DatabaseLogSpaceHistory WHERE CollectionTime < DATEADD(day, -7, GETDATE());
        `);
        console.log('🧹 [Monitor] Rensade all 7-dagars historik.');
    } catch (err) {
        console.error('❌ [Monitor] Fel vid rensning av historik:', err.message);
    }
}
 
// ============================================================================
// 📡 NYTT: KONTROLLERA OM SQL SERVER AGENT KÖRS PÅ ALLA SERVRAR
// ============================================================================
async function checkSqlAgents() {
    console.log('📡 [Monitor] Startar kontroll av SQL Server Agent på alla servrar...');
    
    let centralPool;
    try {
        centralPool = getPool('management');
    } catch (poolErr) {
        console.error('❌ [Monitor] Kunde inte hitta central databasanslutning för Agent-status:', poolErr.message);
        return;
    }
 
    for (const server of servers) {
        if (!server.isEnabled) continue;
 
        let status = 'FAILED';
        let message = 'Kunde inte ansluta till SQL Server.';
 
        try {
            const serverPool = connectionPools.get(server.ServerName);
            if (!serverPool || !serverPool.connected) {
                throw new Error('Anslutningspoolen är inte aktiv.');
            }
 
            // Korrigerad query: använder servicename (eller service_name på nyare SQL-versioner)
            const agentQuery = `
                SELECT status_desc 
                FROM sys.dm_server_services 
                WHERE servicename LIKE 'SQL Server Agent%' ;
            `;
            const agentResult = await serverPool.request().query(agentQuery);
            const agentStatus = agentResult.recordset[0]?.status_desc;
 
            if (agentStatus === 'Running') {
                status = 'OK';
                message = 'SQL Server Agent körs normalt.';
            } else {
                status = 'FAILED';
                message = `SQL Server Agent rapporterar status: ${agentStatus || 'Okänd/Ej installerad'}`;
            }
        } catch (err) {
            status = 'FAILED';
            message = `Anslutningsfel: ${err.message}`;
        }
 
        // Skriv till [SQLMonitor].[dbo].[SystemStatus] så att din Debug-modal uppdateras
        try {
            await centralPool.request()
                .input("SystemName", sql.NVarChar(100), `SQL Agent - ${server.displayName || server.ServerName}`)
                .input("ServerName", sql.NVarChar(100), server.ServerName)
                .input("Status", sql.NVarChar(50), status)
                .input("Message", sql.NVarChar(500), message)
                .input("AppVersion", sql.NVarChar(50), 'SQL Agent Monitor')
                .query(`
                    MERGE [SQLMonitor].[dbo].[SystemStatus] AS Target
                    USING (SELECT @SystemName AS SystemName, @ServerName AS ServerName) AS Source
                    ON (Target.SystemName = Source.SystemName)
                    WHEN MATCHED THEN
                        UPDATE SET 
                            LastHeartbeat = GETDATE(),
                            [Status] = @Status,
                            AppVersion = @AppVersion,
                            [message] = @Message
                    WHEN NOT MATCHED THEN
                        INSERT (SystemName, ServerName, LastHeartbeat, AppVersion, [Status], [message])
                        VALUES (Source.SystemName, Source.ServerName, GETDATE(), @AppVersion, @Status, @Message);
                `);
        } catch (dbErr) {
            console.error(`❌ [Monitor] Misslyckades att spara Agent-status för ${server.ServerName} i SystemStatus:`, dbErr.message);
        }
    }
    console.log('✅ [Monitor] Kontroll av SQL Server Agent slutförd.');
}
 
async function startMonitoring() { // GÖR OM FUNKTIONEN TILL ASYNC
    console.log('🚀 Startar monitoring av SQL Server-jobb och prestanda...');
 
    // Denna inre funktion är redan perfekt, ingen ändring här
    const runMonitoringCycle = async () => {
        const updatePromises = servers.map(async (serverConfig) => {
            const serverName = serverConfig.ServerName;
            try {
                if (!serverConfig.MonitorJobs) {
                    return;
                }
 
                if (!serverStatus[serverName]) {
                    serverStatus[serverName] = { 
                        serverName: serverConfig.ServerName,
                        displayName: serverConfig.displayName || serverConfig.ServerName,
                        // Om Environment är NULL eller saknas i databasen, sätt till 'Okänd'
                        environment: serverConfig.Environment || 'Okänd', 
                        jobList: [],
                        blockings: [], // 🚀 NYTT (Fas 2)
                        tempDb: null,   // 🚀 NYTT (Fas 2)
                        error: null 
                    };
                }
                
                await _updateFullJobStatus(serverConfig);
 
                const jobList = serverStatus[serverName]?.jobList || [];
                const configPool = getPool('config');
                
                for (const job of jobList) {
    if (job.LastRunStatus === 'Failed' && job.instance_id) {
        try {
            // =======================================================================
            // 🚨 FILTER LOGIK FÖR SYSTEMKATEGORIER (MED RAPPORT-UNDANTAG)
            // =======================================================================
            const category = job.CategoryName ? job.CategoryName.trim() : '';
            const jobName = job.JobName ? job.JobName.toLowerCase() : '';
            const errorMessage = job.LastRunMessage || 'No error message available';
            
            const ignoredCategories = ['Systemjobb', '[Uncategorized (Local)]', 'REPL-Lidar'];
            
            // Kolla om jobbet tillhör rapportservern
            const isReportServerJob = 
                category === 'Report Server' || 
                jobName.includes('ssrs') || 
                jobName.includes('report');
            
            // Kolla om detta jobb tillhör en ignorerad kategori
            const isIgnoredCategory = ignoredCategories.includes(category);
            // Kolla om felet beror på en deadlock (SQL Error 1205)
            const isDeadlock = errorMessage.includes('1205') || errorMessage.toLowerCase().includes('deadlock');
            
            // Om det är ett systemjobb, MEN INTE ett rapportjobb och INTE en deadlock -> Ignorera larmet
            if (isIgnoredCategory && !isReportServerJob && !isDeadlock) {
                console.log(`ℹ️ Ignorerar fallerat systemjobb: "${job.JobName}" på ${serverName} (Kategori: ${category})`);
                continue; 
            }
            // ======================================================================= 
            const request = configPool.request()
                .input('ServerName', sql.NVarChar(128), serverName)
                .input('JobName', sql.NVarChar(128), job.JobName)
                .input('InstanceId', sql.Int, job.instance_id)
                .input('ErrorMessage', sql.NVarChar(sql.MAX), errorMessage);
 
            const result = await request.execute('dbo.usp_LogAndCheckSystemAlert');
            const shouldSend = result.recordset[0]?.AlertShouldBeSent;
 
            if (shouldSend) {
                if (serverConfig.EmailNotificationsEnabled) {
                    console.log(`✅ Nytt fallerat jobb: ${job.JobName} på ${serverName}. Skickar e-post...`);
                    
                    // Escape HTML för säkerhet
                    const escapeHtml = (text) => {
                        if (!text) return '';
                        return text.toString()
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '<')
                            .replace(/>/g, '>')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
                    };
 
                    const subject = `🚨 SQL Jobb-varning: ${job.JobName} har fallerat på ${serverName}`;
                    
                    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background-color: #f4f4f4; 
            margin: 0; 
            padding: 20px; 
            line-height: 1.6;
        }
        .container { 
            max-width: 700px; 
            margin: 0 auto; 
            background-color: #ffffff; 
            border-radius: 8px; 
            overflow: hidden; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
        }
        .header { 
            background: linear-gradient(135deg, #1e88e5 0%, #1565c0 100%);
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
        }
        .logo {
            max-width: 200px;
            height: auto;
            margin-bottom: 15px;
        }
        .header h1 { 
            margin: 0; 
            font-size: 24px; 
            font-weight: 600;
        }
        .alert-badge {
            display: inline-block;
            background-color: #ff5252;
            color: white;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            margin-top: 10px;
        }
        .content { 
            padding: 30px; 
        }
        .content h2 {
            color: #d32f2f;
            margin-top: 0;
            font-size: 22px;
            border-bottom: 2px solid #d32f2f;
            padding-bottom: 10px;
        }
        .info-box { 
            background-color: #f9f9f9; 
            border-left: 4px solid #1976d2; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 4px;
        }
        .info-row { 
            margin: 10px 0; 
            display: flex;
            align-items: baseline;
        }
        .label { 
            font-weight: bold; 
            color: #333; 
            min-width: 160px;
            flex-shrink: 0;
        }
        .value { 
            color: #555; 
            word-break: break-word;
        }
        .error-section {
            margin: 25px 0;
        }
        .error-section h3 {
            color: #d32f2f;
            margin-bottom: 10px;
            font-size: 16px;
        }
        .error-message { 
            background-color: #fff3e0; 
            border: 2px solid #ff9800; 
            padding: 15px; 
            border-radius: 6px; 
            font-family: 'Courier New', monospace; 
            font-size: 13px; 
            color: #e65100; 
            white-space: pre-wrap; 
            word-wrap: break-word;
            max-height: 300px;
            overflow-y: auto;
        }
        .action-section {
            background-color: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 20px;
            margin: 25px 0;
            border-radius: 4px;
        }
        .action-section h3 {
            color: #1565c0;
            margin-top: 0;
            font-size: 16px;
        }
        .action-section ol {
            margin: 10px 0;
            padding-left: 20px;
        }
        .action-section li {
            margin: 8px 0;
            color: #555;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button { 
            display: inline-block; 
            padding: 14px 32px; 
            background: linear-gradient(135deg, #1e88e5 0%, #1565c0 100%);
            color: white !important; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 600;
            font-size: 15px;
            box-shadow: 0 2px 8px rgba(30, 136, 229, 0.3);
            transition: transform 0.2s;
        }
        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(30, 136, 229, 0.4);
        }
        .footer { 
            background-color: #f5f5f5; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #777; 
            border-top: 1px solid #e0e0e0;
        }
        .footer p {
            margin: 5px 0;
        }
        .timestamp { 
            color: #999; 
            font-size: 11px; 
            font-style: italic;
        }
        .severity-high {
            color: #d32f2f;
            font-weight: bold;
        }
        @media only screen and (max-width: 600px) {
            .content { padding: 20px; }
            .info-row { flex-direction: column; }
            .label { min-width: auto; margin-bottom: 5px; }
            .button { padding: 12px 24px; font-size: 14px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="https://i.imgur.com/YourLogoHere.png" alt="QL Monitor" class="logo">
            <h1>SQL Server Monitoring System</h1>
            <div class="alert-badge">🚨 JOBB-VARNING</div>
        </div>
        
        <div class="content">
            <h2>Jobb har fallerat</h2>
            
            <div class="info-box">
                <div class="info-row">
                    <span class="label">🖥️ Server:</span>
                    <span class="value"><strong>${escapeHtml(serverName)}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">🌍 Miljö:</span>
                    <span class="value">${escapeHtml(serverConfig.Environment || 'Okänd')}</span>
                </div>
                <div class="info-row">
                    <span class="label">📋 Jobbnamn:</span>
                    <span class="value">${escapeHtml(job.JobName)}</span>
                </div>
                <div class="info-row">
                    <span class="label">🔧 Steg som fallerade:</span>
                    <span class="value">${escapeHtml(job.StepName || 'Okänt steg')}</span>
                </div>
                <div class="info-row">
                    <span class="label">🕐 Tidpunkt:</span>
                    <span class="value">${escapeHtml(job.LastRunDate || 'Okänd')}</span>
                </div>
                <div class="info-row">
                    <span class="label">⏱️ Varaktighet:</span>
                    <span class="value">${escapeHtml(job.Duration || 'Okänd')}</span>
                </div>
                <div class="info-row">
                    <span class="label">🆔 Instance ID:</span>
                    <span class="value">${job.instance_id}</span>
                </div>
            </div>
 
            <div class="error-section">
                <h3>❌ Felmeddelande:</h3>
                <div class="error-message">${escapeHtml(job.LastRunMessage || 'Inget felmeddelande tillgängligt')}</div>
            </div>
 
            <div class="action-section">
                <h3>📌 Rekommenderade åtgärder:</h3>
                <ol>
                    <li>Logga in i SQL Server Monitoring Dashboard via knappen nedan</li>
                    <li>Kontrollera fullständig jobbhistorik och steg-för-steg-detaljer</li>
                    <li>Granska felmeddelandet och eventuella tidigare liknande incidenter</li>
                    <li>Åtgärda problemet enligt dokumenterad lösning (om tillgänglig)</li>
                    <li>Kvittera felet i systemet när det är åtgärdat</li>
                </ol>
            </div>
 
            <div class="button-container">
                <a href="http://sllbi01:5173/server/${encodeURIComponent(serverName)}" class="button">
                    🔍 Visa i Monitor Dashboard
                </a>
            </div>
 
            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px; font-style: italic;">
                Behöver du hjälp? Kontakta din DBA eller IT-support.
            </p>
        </div>
        
        <div class="footer">
            <p><strong>QL Monitor</strong> - SQL Server Monitoring System</p>
            <p>Detta är ett automatiskt meddelande. Svara inte på detta e-postmeddelande.</p>
            <p class="timestamp">Skickat: ${new Date().toLocaleString('sv-SE', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            })}</p>
        </div>
    </div>
</body>
</html>
`;
                    
                    sendEmail(subject, html);
                } else {
                    console.log(`⚠️ Nytt fallerat jobb: ${job.JobName}, men EmailNotificationsEnabled = 0.`);
                }
            }
        } catch (dbErr) {
            console.error(`❌ Kunde inte kontrollera/logga avisering för ${job.JobName}: ${dbErr.message}`);
        }
    }
}
                
                // 🔍 Hämtar prestanda, frågor, blockeringar och TempDB-status parallellt!
                const [performanceData, activeQueries, blockings, tempDb] = await Promise.all([
                    getPerformanceMetrics(serverName),
                    getActiveQueries(serverName),
                    getActiveBlockings(serverName), // 🚀 NYTT (Fas 2)
                    getTempDbSpace(serverName)      // 🚀 NYTT (Fas 2)
                ]);
                
                // Spara ner hälsodata i serverStatus-objektet så datan finns tillgänglig
                if (serverStatus[serverName]) {
                    serverStatus[serverName].blockings = blockings;
                    serverStatus[serverName].tempDb = tempDb;
                }
                
                if (io) {
                    io.to(serverName).emit('performanceUpdate', { serverName, timestamp: new Date().toISOString(), metrics: performanceData });
                    io.to(serverName).emit('activeQueriesUpdate', { serverName, timestamp: new Date().toISOString(), queries: activeQueries });
                    
                    // 🚀 NYTT (Fas 2): Skicka ut realtidsuppdateringar för Server-hälsa till prenumeranter
                    io.to(serverName).emit('serverHealthUpdate', { 
                        serverName, 
                        timestamp: new Date().toISOString(), 
                        blockings, 
                        tempDb 
                    });
                }
 
            } catch (err) {
                console.error(`❌ Monitoring-fel för ${serverName}:`, err.message);
                if (serverStatus[serverName]) serverStatus[serverName].error = err.message;
            }
        });
 
        await Promise.all(updatePromises);
        
        // 📡 NYTT: Kör kontrollen av SQL Server Agenter i slutet av varje övervakningscykel
        await checkSqlAgents();
 
        if (io) io.emit('fullStatusUpdate', serverStatus);
    };
 
    // === VÄNTA PÅ ATT FÖRSTA KÖRNINGEN BLIR KLAR ===
    console.log('🔄 Kör initial datainsamling...');
    await runMonitoringCycle();
    await checkDiskUsage(); // Antar att checkDiskUsage också är async
    await collectAndSaveMemoryHistory(); // Kör en direkt insamling av minneshistorik vid start
    console.log('✅ Initial datainsamling slutförd.');
 
    // === Starta de separata timers EFTER att första körningen är klar ===
    // 🚀 OPTIMERING: Sänkt frekvens från 10 sekunder till 60 sekunder för att skona CPU och TempDB
    setInterval(runMonitoringCycle, 60000);
    setInterval(checkDiskUsage, 60000);
    
    // 🧠 Starta insamlingen av minneshistorik var 10:e minut (600000 ms)
    setInterval(collectAndSaveMemoryHistory, 10 * 60 * 1000);
 
    console.log('✅ Monitoring-loopar aktiva (Jobb och SQL Agent var 60s, Disk var 60s, Minneshistorik var 10m)');
}
 
const getStatus = () => serverStatus;
 
async function getActivity(serverName, from, to) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
 
    // Om vi har tidsfilter (from/to), hämtar vi historisk data från vår centrala loggtabell
    if (from && to) {
        try {
            const configPool = getPool('config'); // Använd den centrala poolen där WhoWasActive ligger
            
            let timeFilterClause = 'collection_time BETWEEN @from AND @to';
            const request = configPool.request();
 
            // Beräkna tidsskillnaden i timmar för att se om vi kan använda de färdiga indexerade flaggorna
            const fromDate = new Date(from);
            const toDate = new Date(to);
            const hoursDiff = Math.abs(toDate - fromDate) / 36e5;
 
            // Optimering: Om tidsintervallet matchar våra standardval, använd bit-flaggorna direkt för max prestanda
            if (hoursDiff <= 1.1 && toDate >= new Date(Date.now() - 5 * 60 * 1000)) {
                timeFilterClause = 'is_last_1h = 1';
            } else if (hoursDiff <= 24.1 && toDate >= new Date(Date.now() - 5 * 60 * 1000)) {
                timeFilterClause = 'is_last_24h = 1';
            } else if (hoursDiff <= 72.1 && toDate >= new Date(Date.now() - 5 * 60 * 1000)) {
                timeFilterClause = 'is_last_3d = 1';
            } else {
                // Fallback för anpassat intervall (Custom)
                request.input('from', sql.DateTime, fromDate);
                request.input('to', sql.DateTime, toDate);
            }
 
            // Vi ställer nu frågan mot den optimerade vyn och sätter en TOP 2000 gräns som extra skyddsnät
            const query = `
                SELECT TOP 2000
                    collection_time,
                    session_id,
                    login_name,
                    program_name,
                    database_name,
                    CPU,
                    reads,
                    writes,
                    tempdb_current,
                    elapsed_time_formatted,
                    status,
                    wait_info,
                    sql_text,
                    blocking_session_id,
                    blocked_session_count
                FROM [Configurationsdb].[dbo].[V_WhoWasActive_Critical] WITH (NOLOCK)
                WHERE ServerName = @serverName 
                  AND ${timeFilterClause}
                ORDER BY collection_time DESC;
            `;
 
            request.input('serverName', sql.NVarChar(128), serverName);
            
            const result = await request.query(query);
            return result.recordset;
        } catch (err) {
            console.error(`[getActivity - Historik] Fel vid hämtning av historik för ${serverName}:`, err.message);
            throw err;
        }
    }
 
    // --- FALLBACK: Realtidsdata ---
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    
    try {
        const result = await pool.request().query(`
            SELECT 
                GETDATE() AS collection_time,
                s.session_id, s.status, s.login_name, s.host_name, s.program_name, 
                DB_NAME(r.database_id) AS database_name, r.wait_time, r.wait_type, 
                r.blocking_session_id, r.cpu_time AS CPU, r.total_elapsed_time AS elapsed_time, 
                r.logical_reads AS reads, r.writes,
                (SELECT SUM(user_objects_alloc_page_count + internal_objects_alloc_page_count) 
                 FROM sys.dm_db_task_space_usage WITH (NOLOCK) WHERE session_id = s.session_id) AS tempdb_current,
                SUBSTRING(qt.text, (r.statement_start_offset/2)+1, 
                    ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(qt.text) 
                    ELSE r.statement_end_offset END - r.statement_start_offset)/2)+1) AS sql_text 
            FROM sys.dm_exec_sessions s WITH (NOLOCK)
            LEFT JOIN sys.dm_exec_requests r WITH (NOLOCK) ON s.session_id = r.session_id 
            OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) qt 
            WHERE s.session_id > 50 
            ORDER BY s.session_id;
        `);
        return result.recordset;
    } catch (err) {
        console.error(`[getActivity - Realtid] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getPerformanceMetrics(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) return { cpu: 0, waitingTasks: 0, pageReads: 0, pageWrites: 0, batchRequests: 0, userConnections: 0, error: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) return { cpu: 0, waitingTasks: 0, pageReads: 0, pageWrites: 0, batchRequests: 0, userConnections: 0, error: `Pool for ${serverName} is not available` };
    
    try {
        // 🚀 OPTIMERING: Mycket snabbare och skonsammare CPU-fråga mot ringbufferten
        const cpuQuery = `
            WITH LastRecord AS (
                SELECT TOP (1) 
                    CONVERT(xml, record) AS TargetRecord
                FROM sys.dm_os_ring_buffers WITH (NOLOCK)
                WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR' 
                  AND record LIKE '%<SystemHealth>%'
                ORDER BY [timestamp] DESC
            )
            SELECT 
                ISNULL(TargetRecord.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int'), 0) AS cpu,
                (SELECT COUNT(*) FROM sys.dm_os_waiting_tasks WITH (NOLOCK)) AS waitingTasks, 
                (SELECT COUNT(*) FROM sys.dm_exec_sessions WITH (NOLOCK) WHERE is_user_process = 1) AS userConnections
            FROM LastRecord;
        `;
        
        const ioQuery = `
            SELECT 
                SUM(CASE WHEN counter_name = 'Page reads/sec' THEN cntr_value ELSE 0 END) AS page_reads,
                SUM(CASE WHEN counter_name = 'Page writes/sec' THEN cntr_value ELSE 0 END) AS page_writes
            FROM sys.dm_os_performance_counters WITH (NOLOCK)
            WHERE counter_name IN ('Page reads/sec', 'Page writes/sec') AND object_name LIKE '%Buffer Manager%';
        `;
        
        const batchQuery = `
            SELECT cntr_value FROM sys.dm_os_performance_counters WITH (NOLOCK)
            WHERE counter_name = 'Batch Requests/sec' AND object_name LIKE '%SQL Statistics%';
        `;
        
        const [cpuResult, ioResult, batchResult] = await Promise.all([
            pool.request().query(cpuQuery),
            pool.request().query(ioQuery),
            batchQuery ? pool.request().query(batchQuery) : Promise.resolve({ recordset: [] })
        ]);
        
        const basicMetrics = cpuResult.recordset[0] || { cpu: 0, waitingTasks: 0, userConnections: 0 };
        const ioMetrics = ioResult.recordset[0] || { page_reads: 0, page_writes: 0 };
        const batchRequests = Number(batchResult.recordset[0]?.cntr_value) || 0;
        
        return {
            cpu: Number(basicMetrics.cpu) || 0,
            waitingTasks: Number(basicMetrics.waitingTasks) || 0,
            pageReads: Number(ioMetrics.page_reads) || 0,
            pageWrites: Number(ioMetrics.page_writes) || 0,
            batchRequests: batchRequests,
            userConnections: Number(basicMetrics.userConnections) || 0
        };
        
    } catch (error) {
        console.error(`[getPerformanceMetrics] Fel för ${serverName}:`, error.message);
        return { cpu: 0, waitingTasks: 0, pageReads: 0, pageWrites: 0, batchRequests: 0, userConnections: 0, error: error.message };
    }
}
 
async function getFileStats(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        const query = `
            SELECT 
                d.name AS DatabaseName, mf.name AS LogicalFileName, mf.physical_name AS PhysicalPath, 
                LEFT(mf.physical_name, 3) AS Drive, CAST((mf.size * 8.0 / 1024) AS DECIMAL(10, 2)) AS FileSizeMB, 
                CAST(vs.total_bytes / 1073741824.0 AS DECIMAL(10, 2)) AS TotalDriveGB, 
                CAST(vs.available_bytes / 1073741824.0 AS DECIMAL(10, 2)) AS FreeDriveGB, 
                CAST(vs.available_bytes * 100.0 / vs.total_bytes AS DECIMAL(5, 2)) AS PercentFree 
            FROM sys.master_files AS mf WITH (NOLOCK)
            JOIN sys.databases AS d WITH (NOLOCK) ON mf.database_id = d.database_id 
            CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) AS vs 
            ORDER BY DatabaseName, mf.physical_name;
        `;
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getFileStats] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getMissingIndexes(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        const query = `
            SELECT TOP 25 
                CAST((migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans)) AS DECIMAL(18,2)) AS ImpactScore, 
                COALESCE(OBJECT_NAME(mid.object_id, mid.database_id), 'OKÄND_TABELL') AS TableName, 
                COALESCE(OBJECT_SCHEMA_NAME(mid.object_id, mid.database_id), 'dbo') AS SchemaName, 
                DB_NAME(mid.database_id) AS DatabaseName, mid.equality_columns, mid.inequality_columns, 
                mid.included_columns, migs.user_seeks, migs.user_scans 
            FROM sys.dm_db_missing_index_group_stats AS migs WITH (NOLOCK)
            INNER JOIN sys.dm_db_missing_index_groups AS mig WITH (NOLOCK) ON migs.group_handle = mig.index_group_handle 
            INNER JOIN sys.dm_db_missing_index_details AS mid WITH (NOLOCK) ON mig.index_handle = mid.index_handle 
            WHERE DB_NAME(mid.database_id) NOT IN ('master', 'msdb', 'tempdb', 'model', 'distribution', 'ReportServer', 'ReportServerTempDB') 
            AND OBJECT_NAME(mid.object_id, mid.database_id) IS NOT NULL 
            ORDER BY ImpactScore DESC;
        `;
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`❌ [getMissingIndexes] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getUnusedIndexes(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        const query = `
            SELECT TOP 50 
                o.name AS TableName, i.name AS IndexName, 
                CAST((SUM(a.used_pages) * 8.0 / 1024) AS DECIMAL(18,2)) AS IndexSizeMB, 
                ISNULL(ius.user_updates, 0) AS Writes, 
                ISNULL(ius.user_seeks + ius.user_scans + ius.user_lookups, 0) AS Reads 
            FROM sys.indexes i WITH (NOLOCK)
            INNER JOIN sys.objects o WITH (NOLOCK) ON i.object_id = o.object_id 
            INNER JOIN sys.partitions p WITH (NOLOCK) ON i.object_id = p.object_id AND i.index_id = p.index_id 
            INNER JOIN sys.allocation_units a WITH (NOLOCK) ON p.partition_id = a.container_id 
            LEFT JOIN sys.dm_db_index_usage_stats ius WITH (NOLOCK) ON i.object_id = ius.object_id 
                AND i.index_id = ius.index_id AND ius.database_id = DB_ID() 
            WHERE o.is_ms_shipped = 0 AND i.type_desc IN ('NONCLUSTERED') AND i.is_primary_key = 0 
            AND i.is_unique = 0 AND ISNULL(ius.user_seeks, 0) = 0 AND ISNULL(ius.user_scans, 0) = 0 
            AND ISNULL(ius.user_lookups, 0) = 0 AND p.rows > 0 
            GROUP BY o.name, i.name, ius.user_updates, ius.user_seeks, ius.user_scans, ius.user_lookups 
            ORDER BY IndexSizeMB DESC;
        `;
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getUnusedIndexes] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function killSession(serverName, sessionId) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        await pool.request().query(`KILL ${sessionId}`);
        return { success: true, message: `Session ${sessionId} har terminerats.` };
    } catch (err) {
        console.error(`[killSession] Fel för ${serverName}:`, err.message);
        throw new Error(`Kunde inte terminera sessionen. Kontrollera behörigheter. Fel: ${err.message}`);
    }
}
 
async function generateIndexScript(params) {
    const { serverName, dbName, schemaName, tableName, equality, inequality, included, impact } = params;
    try {
        const pool = getPool('management');
        const result = await pool.request()
            .input('DatabaseName', sql.NVarChar(128), dbName)
            .input('SchemaName', sql.NVarChar(128), schemaName || 'dbo')
            .input('TableName', sql.NVarChar(128), tableName)
            .input('EqualityColumns', sql.NVarChar(sql.MAX), equality || null)
            .input('InequalityColumns', sql.NVarChar(sql.MAX), inequality || null)
            .input('IncludedColumns', sql.NVarChar(sql.MAX), included || null)
            .input('ImpactScore', sql.BigInt, parseInt(impact) || 0)
            .execute('dbo.usp_GenerateIndexScript');
        if (result.recordset && result.recordset.length > 0) {
            return { success: true, script: result.recordset[0].IndexScript };
        } else {
            throw new Error('Stored procedure returnerade inget skript');
        }
    } catch (err) {
        console.error('❌ Fel vid generering av indexskript:', err.message);
        throw err;
    }
}
 
async function getMdwDiskUsage(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const mdwPool = getPool('mdw');
    try {
        const serverInstanceShortName = serverConfig.ConnectionConfig.server.split('.')[0].toUpperCase();
        const query = `
            WITH L AS (
                SELECT TOP 1 s.snapshot_id, s.snapshot_time 
                FROM MDW.core.snapshots s WITH (NOLOCK)
                INNER JOIN MDW.snapshots.disk_usage du WITH (NOLOCK) ON s.snapshot_id = du.snapshot_id 
                WHERE s.instance_name = @ServerName 
                ORDER BY s.snapshot_time DESC
            ) 
            SELECT 
                ls.snapshot_time as collection_time, df.database_name, 
                (df.dbsize / 1024.0) AS data_file_mb, (df.logsize / 1024.0) AS log_file_mb 
            FROM L ls 
            JOIN MDW.snapshots.disk_usage df WITH (NOLOCK) ON ls.snapshot_id = df.snapshot_id 
            ORDER BY df.database_name;
        `;
        const result = await mdwPool.request().input('ServerName', sql.VarChar, serverInstanceShortName).query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getMdwDiskUsage] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getMdwQueryStats(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        const query = `
            SELECT TOP 50 
                CAST(t.text AS NVARCHAR(MAX)) AS query_text, qs.execution_count, 
                CAST(qs.total_worker_time / 1000.0 AS DECIMAL(18,2)) AS total_cpu_ms, 
                CAST(qs.total_elapsed_time / 1000.0 AS DECIMAL(18,2)) AS total_duration_ms, 
                qs.total_logical_reads, qs.total_physical_reads, 
                CAST(qs.total_worker_time / qs.execution_count / 1000.0 AS DECIMAL(18,2)) AS avg_cpu_ms, 
                qs.last_execution_time 
            FROM sys.dm_exec_query_stats qs WITH (NOLOCK)
            CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t 
            ORDER BY qs.total_worker_time DESC;
        `;
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getMdwQueryStats] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getMdwQueryStatsByIO(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        const query = `
            SELECT TOP 50 
                SUBSTRING(t.text, 1, 200) AS query_text, qs.execution_count, 
                CAST(qs.total_worker_time / 1000.0 AS DECIMAL(18,2)) AS total_cpu_ms, 
                CAST(qs.total_elapsed_time / 1000.0 AS DECIMAL(18,2)) AS total_duration_ms, 
                qs.total_logical_reads, qs.total_physical_reads, 
                CAST(qs.total_logical_reads / qs.execution_count AS BIGINT) AS avg_logical_reads, 
                qs.last_execution_time 
            FROM sys.dm_exec_query_stats qs WITH (NOLOCK)
            CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t 
            ORDER BY qs.total_logical_reads DESC;
        `;
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getMdwQueryStatsByIO] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getMdwCpuHistory(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const mdwPool = getPool('mdw');
    try {
        const serverInstanceShortName = serverConfig.ConnectionConfig.server.split('.')[0].toUpperCase();
        
        const query = `
            SELECT
                CONVERT(varchar, pc.collection_time, 120) as snapshot_time,
                pc.formatted_value AS CpuPercentage
            FROM MDW.core.snapshots s WITH (NOLOCK)
            INNER JOIN MDW.snapshots.performance_counters pc WITH (NOLOCK) ON s.snapshot_id = pc.snapshot_id
            WHERE s.instance_name = @ServerName AND pc.performance_object_name = 'Processor'
                AND pc.performance_counter_name = '% Processor Time' AND pc.performance_instance_name = '_Total'
                AND s.snapshot_time >= DATEADD(day, -7, GETDATE())
            ORDER BY pc.collection_time;
        `;
        
        const result = await mdwPool.request().input('ServerName', sql.VarChar, serverInstanceShortName).query(query);
        
        const formattedData = result.recordset.map(row => ({
            snapshot_time: row.snapshot_time,
            CpuPercentage: parseFloat(row.CpuPercentage) || 0
        }));
        
        return formattedData;
    } catch (err) {
        console.error(`[getMdwCpuHistory] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getMdwMemoryHistory(serverName) {
    const pool = await getPool(serverName); 
    
    const query = `
        WITH RingBufferMemory AS (
            SELECT 
                EventTime,
                Record.value('(./Record/MemoryRecord/AvailablePhysicalMemory)[1]', 'bigint') / 1024 AS AvailablePhysicalMemory_MB,
                Record.value('(./Record/MemoryRecord/TotalPhysicalMemory)[1]', 'bigint') / 1024 AS TotalPhysicalMemory_MB
            FROM (
                SELECT 
                    DATEADD(ms, -1 * (g.ms_ticks - [timestamp]), GETDATE()) AS EventTime,
                    CONVERT(xml, record) AS Record
                FROM sys.dm_os_ring_buffers r
                CROSS JOIN sys.dm_os_sys_info g
                WHERE r.ring_buffer_type = N'RING_BUFFER_SYSTEM'
                  AND record LIKE '%<SystemMemoryState>%'
            ) AS Tab
        )
        SELECT 
            EventTime AS timestamp,
            TotalPhysicalMemory_MB AS total_ram,
            (TotalPhysicalMemory_MB - AvailablePhysicalMemory_MB) AS used_ram,
            ROUND(((TotalPhysicalMemory_MB - AvailablePhysicalMemory_MB) * 100.0) / TotalPhysicalMemory_MB, 2) AS memory_percent
        FROM RingBufferMemory
        ORDER BY EventTime ASC;
    `;
 
    const result = await pool.request().query(query);
    return result.recordset;
}
 
async function getMdwDatabaseGrowth(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const mdwPool = getPool('mdw');
    try {
        const serverInstanceShortName = serverConfig.ConnectionConfig.server.split('.')[0].toUpperCase();
        const query = `
            WITH TopDatabases AS (
                SELECT du.database_name, (du.dbsize + du.logsize) AS last_size,
                    ROW_NUMBER() OVER(PARTITION BY du.database_name ORDER BY s.snapshot_time DESC) as rn
                FROM MDW.core.snapshots s WITH (NOLOCK)
                INNER JOIN MDW.snapshots.disk_usage du WITH (NOLOCK) ON s.snapshot_id = du.snapshot_id
                WHERE s.instance_name = @ServerName
            ),
            RankedDatabases AS (
                SELECT database_name, DENSE_RANK() OVER(ORDER BY last_size DESC) as db_rank
                FROM TopDatabases WHERE rn = 1
            )
            SELECT
                CONVERT(varchar, s.snapshot_time, 120) as snapshot_time, du.database_name,
                (SUM(du.dbsize) + SUM(du.logsize)) / 1024.0 AS TotalSizeMB
            FROM MDW.core.snapshots s WITH (NOLOCK)
            INNER JOIN MDW.snapshots.disk_usage du WITH (NOLOCK) ON s.snapshot_id = du.snapshot_id
            WHERE s.instance_name = @ServerName AND s.snapshot_time >= DATEADD(month, -6, GETDATE())
                AND du.database_name IN (SELECT database_name FROM RankedDatabases WHERE db_rank <= 10)
            GROUP BY s.snapshot_time, du.database_name
            ORDER BY du.database_name, s.snapshot_time;
        `;
        const result = await mdwPool.request().input('ServerName', sql.VarChar, serverInstanceShortName).query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getMdwDatabaseGrowth] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getMdwWaitStatsHistory(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const mdwPool = getPool('mdw');
    try {
        const serverInstanceShortName = serverConfig.ConnectionConfig.server.split('.')[0].toUpperCase();
        const query = `
            WITH WaitStats AS (
                SELECT 
                    s.snapshot_time, ws.wait_type, ws.wait_time_ms, 
                    LAG(ws.wait_time_ms, 1, 0) OVER(PARTITION BY ws.wait_type ORDER BY s.snapshot_time) as previous_wait_time_ms 
                FROM MDW.core.snapshots s WITH (NOLOCK)
                INNER JOIN MDW.snapshots.os_wait_stats ws WITH (NOLOCK) ON s.snapshot_id = ws.snapshot_id 
                WHERE s.instance_name = @ServerName AND s.snapshot_time >= DATEADD(day, -1, GETDATE()) 
                    AND ws.wait_type NOT IN ('BROKER_EVENTHANDLER', 'BROKER_RECEIVE_WAITFOR', 'BROKER_TASK_STOP', 'BROKER_TO_FLUSH', 'BROKER_TRANSMITTER', 'CHECKPOINT_QUEUE', 'CHKPT', 'CLR_AUTO_EVENT', 'CLR_MANUAL_EVENT', 'CLR_SEMAPHORE', 'DBMIRROR_DBM_EVENT', 'DBMIRROR_EVENTS_QUEUE', 'DBMIRROR_WORKER_QUEUE', 'DBMIRRORING_CMD', 'DIRTY_PAGE_POLL', 'DISPATCHER_QUEUE_SEMAPHORE', 'EXECSYNC', 'FSAGENT', 'FT_IFTS_SCHEDULER_IDLE_WAIT', 'FT_IFTSHC_MUTEX', 'HADR_CLUSAPI_CALL', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION', 'HADR_LOGCAPTURE_WAIT', 'HADR_NOTIFICATION_DEQUEUE', 'HADR_TIMER_TASK', 'HADR_WORK_QUEUE', 'KSOURCE_WAKEUP', 'LAZYWRITER_SLEEP', 'LOGMGR_QUEUE', 'ONDEMAND_TASK_QUEUE', 'PWAIT_ALL_COMPONENTS_INITIALIZED', 'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP', 'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP', 'REQUEST_FOR_DEADLOCK_SEARCH', 'RESOURCE_QUEUE', 'SERVER_IDLE_CHECK', 'SLEEP_BPOOL_FLUSH', 'SLEEP_DBSTARTUP', 'SLEEP_DCOMSTARTUP', 'SLEEP_MASTERDBREADY', 'SLEEP_MASTERMDREADY', 'SLEEP_MASTERUPGRADED', 'SLEEP_MSDBSTARTUP', 'SLEEP_SYSTEMTASK', 'SLEEP_TASK', 'SLEEP_TEMPDBSTARTUP', 'SNI_HTTP_ACCEPT', 'SP_SERVER_DIAGNOSTICS_SLEEP', 'SQLTRACE_BUFFER_FLUSH', 'SQLTRACE_INCREMENTAL_FLUSH_SLEEP', 'SQLTRACE_WAIT_ENTRIES', 'WAIT_FOR_RESULTS', 'WAITFOR', 'WAITFOR_TASKSHUTDOWN', 'WAIT_XTP_HOST_WAIT', 'WAIT_XTP_OFFLINE_CKPT_NEW_LOG', 'WAIT_XTP_CKPT_CLOSE', 'XE_DISPATCHER_WAIT', 'XE_TIMER_EVENT')
            ) 
            SELECT TOP 20 wait_type, SUM(wait_time_ms - previous_wait_time_ms) AS total_wait_time_ms_delta 
            FROM WaitStats WHERE wait_time_ms > previous_wait_time_ms 
            GROUP BY wait_type 
            ORDER BY total_wait_time_ms_delta DESC;
        `;
        const result = await mdwPool.request().input('ServerName', sql.VarChar, serverInstanceShortName).query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getMdwWaitStatsHistory] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getMdwServerActivity(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const mdwPool = getPool('mdw');
    try {
        const shortName = serverConfig.ServerName.split('.')[0].toUpperCase();
        const query = `
            WITH L AS (
                SELECT TOP 1 s.snapshot_id, s.snapshot_time 
                FROM MDW.core.snapshots s WITH (NOLOCK)
                INNER JOIN MDW.snapshots.active_sessions_and_requests asr WITH (NOLOCK) ON s.snapshot_id = asr.snapshot_id 
                WHERE s.instance_name = @ServerName ORDER BY s.snapshot_time DESC
            ) 
            SELECT 
                ls.snapshot_time as collection_time, asr.session_id, asr.login_name, asr.host_name, asr.program_name, 
                asr.database_name, asr.request_status as status, asr.request_cpu_time as cpu_time, 
                asr.request_total_elapsed_time as total_elapsed_time, asr.wait_duration_ms as wait_time, 
                asr.wait_type, asr.blocking_session_id, asr.command, 
                SUBSTRING(st.text, (asr.statement_start_offset / 2) + 1, 
                    ((CASE asr.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) ELSE asr.statement_end_offset END - asr.statement_start_offset) / 2) + 1) AS sql_text 
            FROM L ls 
            JOIN MDW.snapshots.active_sessions_and_requests asr WITH (NOLOCK) ON ls.snapshot_id = asr.snapshot_id 
            OUTER APPLY sys.dm_exec_sql_text(asr.sql_handle) AS st 
            WHERE asr.session_id IS NOT NULL 
            ORDER BY asr.request_cpu_time DESC;
        `;
        const result = await mdwPool.request().input('ServerName', sql.NVarChar, shortName).query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getMdwServerActivity] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function saveKnowledgeBaseEntry(entry) {
    if (!configDbPool || !configDbPool.connected) throw { statusCode: 503, message: `Config DB pool is not available` };
    try {
        const request = configDbPool.request();
        request.input('ServerName', sql.NVarChar, entry.serverName);
        request.input('JobName', sql.NVarChar, entry.jobName);
        request.input('StepName', sql.NVarChar, entry.stepName);
        request.input('ErrorMessage', sql.NVarChar, entry.errorMessage);
        request.input('SolutionNotes', sql.NVarChar, entry.solutionNotes);
        request.input('Author', sql.NVarChar, entry.author);
        const query = `
            INSERT INTO dbo.IncidentKnowledgeBase (ServerName, JobName, StepName, ErrorMessage, SolutionNotes, Author) 
            VALUES (@ServerName, @JobName, @StepName, @ErrorMessage, @SolutionNotes, @Author);
        `;
        await request.query(query);
        return { success: true, message: 'Lösning sparad.' };
    } catch (err) {
        console.error(`[saveKnowledgeBaseEntry] Fel:`, err.message);
        throw err;
    }
}
 
async function getKnowledgeBaseEntries(serverName, jobName) {
    if (!configDbPool || !configDbPool.connected) throw { statusCode: 503, message: `Config DB pool is not available` };
    try {
        const request = configDbPool.request();
        request.input('ServerName', sql.NVarChar, serverName);
        request.input('JobName', sql.NVarChar, jobName);
        const query = `
            SELECT ID, SolutionNotes, Author, CreatedAt 
            FROM dbo.IncidentKnowledgeBase 
            WHERE ServerName = @ServerName AND JobName = @JobName 
            ORDER BY CreatedAt DESC;
        `;
        const result = await request.query(query);
        return result.recordset;
    } catch (err) {
        console.error(`[getKnowledgeBaseEntries] Fel:`, err.message);
        throw err;
    }
}
 
async function getJobDetailsForServer(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        const result = await pool.request().execute('usp_GetJobDetails');
        return result.recordset;
    } catch (err) {
        console.error(`[getJobDetailsForServer] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getJobSteps(serverName, jobId) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverName} is not available` };
    try {
        const result = await pool.request()
            .input('jobId', sql.UniqueIdentifier, jobId)
            .query(`
                SELECT 
                    step_id AS StepId, step_name AS StepName, subsystem AS Subsystem, 
                    command AS Command, database_name AS DatabaseName 
                FROM msdb.dbo.sysjobsteps WITH (NOLOCK)
                WHERE job_id = @jobId ORDER BY step_id
            `);
        return result.recordset;
    } catch (err) {
        console.error(`[getJobSteps] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function acknowledgeJob(serverName, jobName, acknowledgedBy) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = getPool('config');
    try {
        await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .input('JobName', sql.NVarChar(128), jobName)
            .input('AcknowledgedBy', sql.NVarChar(128), acknowledgedBy)
            .execute('usp_AcknowledgeJob');
        return { success: true };
    } catch (err) {
        console.error(`[acknowledgeJob] Fel:`, err.message);
        throw err;
    }
}
 
async function getJobAcknowledgement(serverName, jobName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = getPool('config');
    try {
        const result = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .input('JobName', sql.NVarChar(128), jobName)
            .execute('usp_GetJobAcknowledgement');
        return result.recordset[0] || null;
    } catch (err) {
        console.error(`[getJobAcknowledgement] Fel:`, err.message);
        throw err;
    }
}
 
async function upsertIncidentKnowledge(body) {
    const { serverName, jobName, stepName, errorMessage, errorCode, solutionNotes, author } = body;
    const pool = getPool('config');
    try {
        await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .input('JobName', sql.NVarChar(128), jobName)
            .input('StepName', sql.NVarChar(128), stepName || null)
            .input('ErrorMessage', sql.NVarChar(sql.MAX), errorMessage)
            .input('ErrorCode', sql.NVarChar(50), errorCode || null)
            .input('SolutionNotes', sql.NVarChar(sql.MAX), solutionNotes)
            .input('Author', sql.NVarChar(128), author)
            .execute('usp_UpsertIncidentKnowledge');
        return { success: true };
    } catch (err) {
        console.error(`[upsertIncidentKnowledge] Fel:`, err.message);
        throw err;
    }
}
 
async function getIncidentKnowledge(serverName, jobName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = getPool('config');
    try {
        const result = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .input('JobName', sql.NVarChar(128), jobName)
            .execute('usp_GetIncidentKnowledge');
        return result.recordset;
    } catch (err) {
        console.error(`[getIncidentKnowledge] Fel:`, err.message);
        throw err;
    }
}
 
async function getActiveQueries(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) {
        return [];
    }
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) {
        return [];
    }
    try {
        const query = `
            SELECT 
                s.session_id, s.status, r.blocking_session_id, 
                COALESCE(DB_NAME(r.database_id), DB_NAME(s.database_id)) AS database_name, 
                s.login_name, s.host_name, s.program_name, r.wait_type, r.wait_time, 
                r.cpu_time, r.logical_reads AS reads, r.writes, 
                DATEDIFF(MINUTE, s.last_request_start_time, GETDATE()) AS duration_minutes,
                qt.text AS sql_text 
            FROM sys.dm_exec_sessions AS s WITH (NOLOCK)
            LEFT JOIN sys.dm_exec_connections AS c WITH (NOLOCK) ON s.session_id = c.session_id 
            LEFT JOIN sys.dm_exec_requests AS r WITH (NOLOCK) ON s.session_id = r.session_id 
            OUTER APPLY sys.dm_exec_sql_text(COALESCE(r.sql_handle, c.most_recent_sql_handle)) AS qt 
            WHERE s.is_user_process = 1 AND s.session_id <> @@SPID;
        `;
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`❌ [getActiveQueries] Fel vid hämtning av frågor för ${serverName}:`, err.message);
        return []; 
    }
}
 
async function getJobStepsWithHistory(serverName, jobId) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverConfig.ServerName} is not available` };
    
    try {
        const query = `
            SELECT 
                js.step_id, js.step_name, js.subsystem, js.command, js.database_name,
                js.on_success_action, js.on_fail_action,
                (SELECT TOP 1 CASE jh.run_status WHEN 0 THEN 'Failed' WHEN 1 THEN 'Succeeded' WHEN 2 THEN 'Retry' WHEN 3 THEN 'Canceled' ELSE 'Unknown' END
                 FROM msdb.dbo.sysjobhistory jh WITH (NOLOCK)
                 WHERE jh.job_id = js.job_id AND jh.step_id = js.step_id ORDER BY jh.run_date DESC, jh.run_time DESC) AS LastRunStatus,
                (SELECT TOP 1 jh.message FROM msdb.dbo.sysjobhistory jh WITH (NOLOCK)
                 WHERE jh.job_id = js.job_id AND jh.step_id = js.step_id ORDER BY jh.run_date DESC, jh.run_time DESC) AS LastMessage,
                (SELECT TOP 1 RIGHT('0' + CAST(jh.run_duration / 10000 AS VARCHAR), 2) + ':' + RIGHT('0' + CAST((jh.run_duration % 10000) / 100 AS VARCHAR), 2) + ':' + RIGHT('0' + CAST(jh.run_duration % 100 AS VARCHAR), 2)
                 FROM msdb.dbo.sysjobhistory jh WITH (NOLOCK)
                 WHERE jh.job_id = js.job_id AND jh.step_id = js.step_id ORDER BY jh.run_date DESC, jh.run_time DESC) AS LastRunDuration,
                (SELECT TOP 1 msdb.dbo.agent_datetime(jh.run_date, jh.run_time)
                 FROM msdb.dbo.sysjobhistory jh WITH (NOLOCK)
                 WHERE jh.job_id = js.job_id AND jh.step_id = js.step_id ORDER BY jh.run_date DESC, jh.run_time DESC) AS LastRunDateTime
            FROM msdb.dbo.sysjobsteps js WITH (NOLOCK)
            WHERE js.job_id = @jobId ORDER BY js.step_id;
        `;
        
        const result = await pool.request()
            .input('jobId', sql.UniqueIdentifier, jobId)
            .query(query);
        
        return result.recordset;
    } catch (err) {
        console.error(`[getJobStepsWithHistory] Fel för ${serverName}:`, err.message);
        throw err;
    }
}

// ============================================================================
// 📦 SSIS: HÄMTA FELMEDDELANDEN FRÅN SSISDB FÖR ETT MISSLYCKAT JOBB
// ============================================================================
async function getSsisErrorDetails(serverName, command, jobStartTime) {
  // Parsa SSIS-sökvägen ur SQL Agent-kommandot
  // Exempel: /ISSERVER "\"\SSISDB\RLK\RLK_Heroma\Main_Import.dtsx\"" /SERVER PWRSEDWDB01 ...
  const match = command.match(/\\SSISDB\\([^\\]+)\\([^\\]+)\\([^\\]+)\.dtsx/i);
  if (!match) {
    return { hasMapping: false, errors: [] };
  }
 
  const [, folderName, projectName, packageName] = match;
 
  const pool = await getConnectionPool(serverName); // din befintliga connection-hantering
  const request = pool.request();
 
  request.input('folderName', sql.NVarChar, folderName);
  request.input('projectName', sql.NVarChar, projectName);
  request.input('packageName', sql.NVarChar, packageName + '.dtsx');
  request.input('startWindow', sql.DateTime, new Date(new Date(jobStartTime).getTime() - 5 * 60000)); // 5 min marginal innan
  request.input('endWindow', sql.DateTime, new Date(new Date(jobStartTime).getTime() + 4 * 60 * 60000)); // 4h marginal efter
 
  // Hitta rätt execution_id inom tidsfönstret
  const execResult = await request.query(`
    SELECT TOP 1 execution_id, status, start_time, end_time
    FROM SSISDB.catalog.executions
    WHERE folder_name = @folderName
      AND project_name = @projectName
      AND package_name = @packageName
      AND start_time BETWEEN @startWindow AND @endWindow
    ORDER BY start_time DESC
  `);
 
  if (execResult.recordset.length === 0) {
    return { hasMapping: true, errors: [], noExecutionFound: true };
  }
 
  const executionId = execResult.recordset[0].execution_id;
 
  // Hämta faktiska fel-meddelanden för denna execution
  const errRequest = pool.request();
  errRequest.input('executionId', sql.BigInt, executionId);
 
  const errResult = await errRequest.query(`
    SELECT 
      message_time,
      message_type,
      message,
      package_name,
      event_name,
      subcomponent_name
    FROM SSISDB.catalog.event_messages
    WHERE operation_id = @executionId
      AND message_type = 120  -- Error
    ORDER BY message_time ASC
  `);
 
  return {
    hasMapping: true,
    executionId,
    errors: errResult.recordset
  };
}

// ============================================================================
// METOD FÖR DISKUTRYMME - NU MED HISTORIKLOGGNING
// ============================================================================
async function checkDiskUsage() {
    console.log('🔄 Startar kontroll av diskutrymme...');
    const allDrivesData = [];
 
    for (const server of servers) {
        if (!server.isEnabled || !server.MonitorDisk) {
            continue;
        }
 
        const pool = connectionPools.get(server.ServerName);
        if (!pool || !pool.connected) {
            console.error(`[Disk Usage] Pool för ${server.ServerName} är inte tillgänglig.`);
            allDrivesData.push({ serverName: server.ServerName, drives: [], error: 'Anslutningspool ej tillgänglig' });
            continue;
        }
 
        try {
            const query = `
                SELECT DISTINCT 
                    vs.volume_mount_point AS Drive,
                    CAST(vs.total_bytes / 1024.0 / 1024.0 AS BIGINT) AS TotalMB,
                    CAST(vs.available_bytes / 1024.0 / 1024.0 AS BIGINT) AS FreeMB
                FROM sys.master_files AS mf
                CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) AS vs;
            `;
            const result = await pool.request().query(query);
            
            const drives = result.recordset.map(drive => ({
                drive: drive.Drive.charAt(0),
                totalMB: drive.TotalMB,
                freeMB: drive.FreeMB
            }));
 
            allDrivesData.push({
                serverName: server.ServerName,
                drives: drives.map(d => ({
                    drive: d.drive,
                    freeGB: (d.freeMB / 1024).toFixed(2)
                }))
            });
 
            const configPool = getPool('config');
            for (const drive of drives) {
                try {
                    await configPool.request()
                        .input('ServerName', sql.NVarChar(128), server.ServerName)
                        .input('DriveLetter', sql.Char(1), drive.drive)
                        .input('FreeMB', sql.Int, drive.freeMB)
                        .input('TotalMB', sql.BigInt, drive.totalMB)
                        .execute('usp_LogDiskUsage');
                } catch (dbErr) {
                    console.error(`[DB Log] Kunde inte logga diskdata för ${server.ServerName}:${drive.drive}:`, dbErr.message);
                }
            }
 
        } catch (err) {
            console.error(`[Disk Usage] Fel för ${server.ServerName}:`, err.message);
            allDrivesData.push({ serverName: server.ServerName, drives: [], error: 'Kunde inte köra query' });
        }
    }
  
    if (io) {
        io.emit('diskUsageUpdate', allDrivesData);
    }
}
 
async function getDiskUsageHistory(serverName) {
    console.log(`[API] Hämtar diskhistorik för ${serverName}...`);
    try {
        const pool = getPool('config');
        const result = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .query(`
                SELECT DriveLetter, FreeMB, Timestamp
                FROM dbo.DiskUsageHistory WITH (NOLOCK)
                WHERE ServerName = @ServerName AND Timestamp >= DATEADD(day, -7, GETDATE())
                ORDER BY Timestamp DESC;
            `);
        return result.recordset;
    } catch (err) {
        console.error(`[getDiskUsageHistory] Fel vid hämtning av historik för ${serverName}:`, err.message);
        throw err;
    }
} 
 
async function getDiskUsageTrend(serverName, driveLetter) {
    console.log(`[API] Hämtar disktrend för ${serverName} - ${driveLetter}...`);
    try {
        const pool = getPool('config');
 
        // Hämta sammanfattning (befintlig SP, oförändrad)
        const summaryResult = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .input('DriveLetter', sql.Char(1), driveLetter)
            .execute('usp_GetDiskUsageTrend');
 
        const summary = summaryResult.recordset[0] || null;
 
        // Hämta hela historiken (ny funktion, se nedan)
        const history = await getDiskUsageTrendHistory(serverName, driveLetter);
 
        return {
            summary,
            history
        };
    } catch (err) {
        console.error(`[getDiskUsageTrend] Fel vid hämtning av trend för ${serverName} - ${driveLetter}:`, err.message);
        throw err;
    }
}
 
async function getDiskUsageTrendHistory(serverName, driveLetter) {
    console.log(`[API] Hämtar full disktrend-historik för ${serverName} - ${driveLetter}...`);
    try {
        const pool = getPool('config');
        const result = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .input('DriveLetter', sql.Char(1), driveLetter)
            .query(`
                SELECT 
                    ServerName,
                    DriveLetter,
                    FreeMB,
                    TotalMB,
                    (TotalMB - FreeMB) AS UsedMB,
                    Timestamp
                FROM dbo.DiskUsageHistory WITH (NOLOCK)
                WHERE ServerName = @ServerName 
                  AND DriveLetter = @DriveLetter
                ORDER BY Timestamp ASC;
            `);
        return result.recordset;
    } catch (err) {
        console.error(`[getDiskUsageTrendHistory] Fel vid hämtning av historik för ${serverName} - ${driveLetter}:`, err.message);
        throw err;
    }
}
 
async function getJobHistory24h(serverName) {
    // Säkerställ att vi har ett servernamn
    if (!serverName) throw { statusCode: 400, message: 'Server name is required' };
 
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} not found` };
    
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool for ${serverConfig.ServerName} is not available` };
 
    try {
        const query = `
            WITH ActiveJobs AS (
                SELECT 
                    j.[job_id],
                    j.[name] AS [job_name],
                    sja.[start_execution_date] AS [start_time],
                    GETDATE() AS [end_time], 
                    'Running' AS [status]
                FROM msdb.dbo.sysjobs j WITH (NOLOCK)
                INNER JOIN msdb.dbo.sysjobactivity sja WITH (NOLOCK) ON j.[job_id] = sja.[job_id]
                WHERE sja.[start_execution_date] IS NOT NULL 
                  AND sja.[stop_execution_date] IS NULL
                  AND sja.[session_id] = (SELECT MAX([session_id]) FROM msdb.dbo.sysjobactivity WITH (NOLOCK))
            ),
            HistoricalJobs AS (
                SELECT 
                    j.[job_id],
                    j.[name] AS [job_name],
                    msdb.dbo.agent_datetime(jh.[run_date], jh.[run_time]) AS [start_time],
                    DATEADD(SECOND, 
                        (jh.[run_duration]/10000 * 3600) + ((jh.[run_duration]%10000)/100 * 60) + (jh.[run_duration]%100), 
                        msdb.dbo.agent_datetime(jh.[run_date], jh.[run_time])
                    ) AS [end_time],
                    CASE jh.[run_status]
                        WHEN 0 THEN 'Failed'
                        WHEN 1 THEN 'Succeeded'
                        WHEN 2 THEN 'Retry'
                        WHEN 3 THEN 'Canceled'
                        ELSE 'Unknown'
                    END AS [status]
                FROM msdb.dbo.sysjobs j WITH (NOLOCK)
                INNER JOIN msdb.dbo.sysjobhistory jh WITH (NOLOCK) ON j.[job_id] = jh.[job_id]
                WHERE jh.[step_id] = 0 
                  AND msdb.dbo.agent_datetime(jh.[run_date], jh.[run_time]) >= DATEADD(HOUR, -24, GETDATE())
            ),
            CombinedJobs AS (
                SELECT * FROM ActiveJobs
                UNION ALL
                SELECT * FROM HistoricalJobs
            )
            SELECT 
                [job_id] AS jobId,
                [job_name] AS jobName,
                [start_time] AS startTime,
                [end_time] AS endTime,
                [status],
                DATEDIFF(SECOND, [start_time], [end_time]) AS durationSeconds
            FROM CombinedJobs
            ORDER BY [start_time] ASC;
        `;
 
        const result = await pool.request().query(query);
        
        return result.recordset.map(row => ({
            jobId: row.jobId,
            jobName: row.jobName,
            startTime: row.startTime ? new Date(row.startTime).getTime() : null,
            endTime: row.endTime ? new Date(row.endTime).getTime() : null,
            status: row.status,
            durationSeconds: row.durationSeconds
        }));
 
    } catch (err) {
        console.error(`[getJobHistory24h] Fel vid hämtning av 24h-historik för ${serverName}:`, err.message);
        throw err;
    }
}
 
// 🚀 NYTT: Starta ett SQL Agent-jobb på en specifik server
async function startSqlAgentJob(serverName, jobName) {
    console.log(`📡 [Monitor] Försöker starta jobb "${jobName}" på ${serverName}...`);
    
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} hittades inte` };
    
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool för ${serverName} är inte tillgänglig` };
 
    try {
        const request = pool.request();
        request.input('job_name', sql.NVarChar(128), jobName);
        
        await request.execute('msdb.dbo.sp_start_job');
        
        console.log(`✅ [Monitor] Jobb "${jobName}" startat framgångsrikt på ${serverName}`);
        return { success: true };
    } catch (err) {
        console.error(`❌ [Monitor] Fel vid körning av sp_start_job på ${serverName}:`, err.message);
        throw err;
    }
}
 
// ============================================================================
// 🔍 NYTT (Fas 2): HÄMTA AKTIVA BLOCKERINGAR
// ============================================================================
async function getActiveBlockings(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) return [];
    
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) return [];
 
    try {
        const query = `
            SELECT 
                r.session_id AS SessionId,
                r.blocking_session_id AS BlockingSessionId,
                s.login_name AS LoginName,
                s.host_name AS HostName,
                DB_NAME(r.database_id) AS DatabaseName,
                r.status AS RequestStatus,
                r.cpu_time AS CpuTimeMs,
                r.total_elapsed_time AS ElapsedTimeMs,
                SUBSTRING(st.text, (r.statement_start_offset/2)+1,   
                    ((CASE r.statement_end_offset   
                        WHEN -1 THEN DATALENGTH(st.text)  
                        ELSE r.statement_end_offset   
                      END - r.statement_start_offset)/2) + 1) AS ActiveQuery
            FROM sys.dm_exec_requests r WITH (NOLOCK)
            JOIN sys.dm_exec_sessions s WITH (NOLOCK) ON r.session_id = s.session_id
            OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) st
            WHERE r.blocking_session_id <> 0 
               OR r.session_id IN (SELECT DISTINCT blocking_session_id FROM sys.dm_exec_requests WHERE blocking_session_id <> 0);
        `;
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`❌ [Blockings] Fel vid hämtning för ${serverName}:`, err.message);
        return [];
    }
}
 
// ============================================================================
// 💾 NYTT (Fas 2): KONTROLLERA TEMPDB-UTRYMME
// ============================================================================
async function getTempDbSpace(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) return null;
    
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) return null;
 
    try {
        const query = `
            SELECT 
                SUM(size * 8.0 / 1024.0) AS TotalSizeMB,
                SUM(FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024.0) AS UsedSizeMB,
                SUM((size - FILEPROPERTY(name, 'SpaceUsed')) * 8.0 / 1024.0) AS FreeSizeMB,
                CAST((SUM(FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024.0) / SUM(size * 8.0 / 1024.0)) * 100.0 AS DECIMAL(5,2)) AS UsedPercent
            FROM tempdb.sys.database_files WITH (NOLOCK)
            WHERE type_desc = 'ROWS';
        `;
        const result = await pool.request().query(query);
        return result.recordset[0] || null;
    } catch (err) {
        console.error(`❌ [TempDB] Fel vid hämtning för ${serverName}:`, err.message);
        return null;
    }
}
 
// ============================================================================
// 📊 PERFORMANCE COUNTERS (RAW + AGGREGERAD DATA)
// ============================================================================
async function getMdwPerformanceCounters(serverName, options = {}, argEndDate, argCounterInstanceId) {
    try {
        let startDate, endDate, counterInstanceId;
        
        if (options && typeof options === 'object' && !argEndDate) {
            startDate = options.startDate;
            endDate = options.endDate;
            counterInstanceId = options.counterInstanceId;
        } else {
            startDate = options; 
            endDate = argEndDate;
            counterInstanceId = argCounterInstanceId;
        }
 
        console.log(`📊 [MDW] Hämtar performance counters för ${serverName}:`, { 
            startDate, 
            endDate, 
            counterInstanceId 
        });
 
        const serverConfig = findServerByName(serverName);
        if (!serverConfig) {
            throw { statusCode: 404, message: `Server ${serverName} hittades inte i konfigurationen` };
        }
 
        const mdwPool = getPool('mdw');
        if (!mdwPool || !mdwPool.connected) {
            throw new Error('Anslutningspoolen för MDW är inte tillgänglig eller ansluten.');
        }
 
        const defaultStartDate = new Date(Date.now() - 24 * 60 * 60 * 1000); 
        const defaultEndDate = new Date();
 
        const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
        const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
 
        console.log(`🔍 [MDW] Kör SQL-fråga för tidsspann: ${queryStartDate.toISOString()} till ${queryEndDate.toISOString()}`);
 
        const query = `
            SELECT TOP 1000
                performance_counter_instance_id,
                snapshot_id,
                collection_time,
                formatted_value,
                min_value,
                max_value,
                avg_value,
                sample_count,
                data_source,
                sample_interval_seconds
            FROM [MDW].[snapshots].[performance_counter_values_unified] WITH (NOLOCK)
            WHERE collection_time >= @StartDate
              AND collection_time <= @EndDate
              AND (@CounterInstanceId IS NULL OR performance_counter_instance_id = @CounterInstanceId)
            ORDER BY collection_time DESC;
        `;
 
        const request = mdwPool.request();
        request.timeout = 30000; 
 
        const result = await request
            .input('StartDate', sql.DateTime, queryStartDate)
            .input('EndDate', sql.DateTime, queryEndDate)
            .input('CounterInstanceId', sql.Int, counterInstanceId || null)
            .query(query);
 
        const rawData = result.recordset.filter(r => r.data_source === 'Raw');
        const aggregatedData = result.recordset.filter(r => r.data_source === 'Aggregated');
 
        console.log(`✅ [MDW] Hämtade ${result.recordset.length} rader (${rawData.length} raw, ${aggregatedData.length} aggregated)`);
 
        return {
            raw: rawData,
            aggregated: aggregatedData,
            combined: result.recordset,
            summary: {
                totalRows: result.recordset.length,
                rawRows: rawData.length,
                aggregatedRows: aggregatedData.length,
                dateRange: {
                    start: queryStartDate.toISOString(),
                    end: queryEndDate.toISOString()
                }
            }
        };
 
    } catch (err) {
        console.error(`❌ [MDW] Fel vid hämtning av performance counters för ${serverName}:`, err.message);
        throw err;
    }
}
 
async function getServerSpecs(serverName) {
    const serverConfig = findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} hittades inte` };
    
    const pool = connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool för ${serverName} är inte tillgänglig` };
 
    try {
        const query = `
            SELECT 
                cpu_count AS LogicalCPUs,
                (cpu_count / hyperthread_ratio) AS PhysicalCores,
                CAST(physical_memory_kb / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalRAM_GB,
                (SELECT CAST(value_in_use AS INT) / 1024 FROM sys.configurations WHERE name = 'max server memory (MB)') AS MaxSqlMemory_GB,
                sqlserver_start_time AS SQLStartTime,
                DATEDIFF(DAY, sqlserver_start_time, GETDATE()) AS UptimeDays,
                @@VERSION AS SqlVersionRaw,
                SERVERPROPERTY('Edition') AS SqlEdition,
                SERVERPROPERTY('Collation') AS SqlCollation,
                SERVERPROPERTY('ProductLevel') AS SqlProductLevel,
                (SELECT windows_release FROM sys.dm_os_windows_info) AS OSRelease,
                (SELECT windows_service_pack_level FROM sys.dm_os_windows_info) AS OSServicePack,
                (SELECT os_language_version FROM sys.dm_os_windows_info) AS OSLanguage
            FROM sys.dm_os_sys_info WITH (NOLOCK);
        `;
 
        const result = await pool.request().query(query);
        const raw = result.recordset[0];
 
        let friendlyVersion = 'SQL Server';
        if (raw.SqlVersionRaw) {
            const match = raw.SqlVersionRaw.match(/Microsoft SQL Server (\d+)/);
            if (match) {
                friendlyVersion = `SQL Server ${match[1]}`;
            }
        }
 
        let diskInfo = [];
        try {
            const diskQuery = `
                SELECT DISTINCT 
                    vs.volume_mount_point AS Drive,
                    CAST(vs.total_bytes / 1073741824.0 AS DECIMAL(10,2)) AS TotalGB,
                    CAST(vs.available_bytes / 1073741824.0 AS DECIMAL(10,2)) AS FreeGB,
                    CAST((vs.available_bytes * 100.0) / vs.total_bytes AS DECIMAL(5,2)) AS PercentFree
                FROM sys.master_files AS mf WITH (NOLOCK)
                CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) AS vs;
            `;
            const diskResult = await pool.request().query(diskQuery);
            diskInfo = diskResult.recordset;
        } catch (diskErr) {
            console.warn(`[getServerSpecs] Kunde inte hämta diskar för ${serverName}:`, diskErr.message);
        }
 
        return {
            serverName: serverConfig.ServerName,
            displayName: serverConfig.displayName || serverConfig.ServerName,
            environment: serverConfig.Environment || 'Okänd',
            hardware: {
                logicalCPUs: raw.LogicalCPUs,
                physicalCores: raw.PhysicalCores,
                totalRAM_GB: raw.TotalRAM_GB,
                maxSqlMemory_GB: raw.MaxSqlMemory_GB || 'Obegränsat'
            },
            software: {
                sqlVersion: friendlyVersion,
                sqlEdition: raw.SqlEdition,
                sqlProductLevel: raw.SqlProductLevel,
                sqlCollation: raw.SqlCollation,
                osVersion: `Windows Server (Release ${raw.OSRelease})`,
                osServicePack: raw.OSServicePack,
                uptimeDays: raw.UptimeDays,
                startTime: raw.SQLStartTime
            },
            disks: diskInfo
        };
 
    } catch (err) {
        console.error(`❌ [getServerSpecs] Fel för ${serverName}:`, err.message);
        throw err;
    }
}
 
// ============================================================================
// 📊 SSRS-rapporter (Fas 4)
// ============================================================================
async function getSSRSReports() {
    if (!configDbPool || !configDbPool.connected) {
        throw new Error('Config DB pool är inte tillgänglig');
    }
    try {
        const result = await configDbPool.request().query(`
            SELECT ID, ReportName, Description, ReportURL 
            FROM dbo.SSRSReports 
            WHERE IsEnabled = 1 
            ORDER BY SortOrder ASC, ReportName ASC
        `);
        return result.recordset;
    } catch (err) {
        console.error('❌ [getSSRSReports] Fel vid hämtning av SSRS-rapporter:', err.message);
        throw err;
    }
}
 
// ============================================================================
// 📊 TABELLSTORLEKAR (Djuphamn i diskutnyttjande)
// ============================================================================
async function getTableSizes(serverName, dbName) {
    // 🧹 Rensa bort eventuell domänändelse (t.ex. .gaia.sll.se) för att hitta rätt poolnyckel
    const cleanServerName = serverName.split('.')[0];
    
    const serverConfig = findServerByName(cleanServerName) || findServerByName(serverName);
    if (!serverConfig) throw { statusCode: 404, message: `Server ${serverName} hittades inte` };
    
    // Försök hitta poolen med det rena namnet först, därefter det fullständiga
    const pool = connectionPools.get(cleanServerName) || connectionPools.get(serverConfig.ServerName);
    if (!pool || !pool.connected) throw { statusCode: 503, message: `Pool för ${serverName} är inte tillgänglig` };
 
    try {
        const query = `
            USE [${dbName}];
            
            SELECT TOP 50
                t.name AS TableName,
                s.name AS SchemaName,
                p.rows AS NumRows,
                CAST(ROUND(((SUM(a.total_pages) * 8) / 1024.0), 2) AS DECIMAL(18,2)) AS ReservedSpaceMB,
                CAST(ROUND(((SUM(a.used_pages) * 8) / 1024.0), 2) AS DECIMAL(18,2)) AS DataSpaceMB,
                CAST(ROUND(((SUM(a.total_pages) - SUM(a.used_pages)) * 8 / 1024.0), 2) AS DECIMAL(18,2)) AS UnusedSpaceMB,
                CAST(ROUND(((SUM(a.used_pages) - SUM(a.data_pages)) * 8 / 1024.0), 2) AS DECIMAL(18,2)) AS IndexSizeMB
            FROM sys.tables t
            INNER JOIN sys.indexes i ON t.object_id = i.object_id
            INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
            INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
            LEFT OUTER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE t.is_ms_shipped = 0 AND i.object_id > 255
            GROUP BY t.name, s.name, p.rows
            ORDER BY ReservedSpaceMB DESC;
        `;
 
        const result = await pool.request().query(query);
        return result.recordset;
    } catch (err) {
        console.error(`❌ [Table Sizes] Fel vid hämtning för ${serverName}.${dbName}:`, err.message);
        throw err;
    }
}
 
// ============================================================================
// EXPORTER
// ============================================================================
module.exports = {
    loadServerConfiguration,
    startMonitoring,
    setIo,
    servers,
    getStatus,
    getPool,
    connectionPools,
    getActivity,
    getPerformanceMetrics,
    getFileStats,
    getMissingIndexes,
    getUnusedIndexes,
    killSession,
    generateIndexScript,
    getMdwDiskUsage,
    getMdwQueryStats,
    getMdwServerActivity,
    getMdwQueryStatsByIO,
    getMdwCpuHistory,
    getMdwMemoryHistory,
    getMdwDatabaseGrowth,
    getMdwWaitStatsHistory,
    getMdwPerformanceCounters, 
    saveKnowledgeBaseEntry,
    getKnowledgeBaseEntries,
    getJobDetailsForServer,
    getJobSteps,
    getJobStepsWithHistory,
    acknowledgeJob,
    getJobAcknowledgement,
    upsertIncidentKnowledge,
    getIncidentKnowledge,
    getActiveQueries,
    checkDiskUsage,
    getDiskUsageHistory,
    getDiskUsageTrend,
    getDiskUsageTrendHistory,
    getJobHistory24h,
    startSqlAgentJob,
    getActiveBlockings, 
    getTempDbSpace,
    getServerSpecs,
    getSSRSReports,
    collectAndSaveMemoryHistory, 
    checkSqlAgents, 
    getTableSizes,
    getSsisErrorDetails
};