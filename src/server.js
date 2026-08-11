// ============================================================================
// SQL SERVER MONITOR - Express Server
// ============================================================================
 
require('dotenv').config();
 
const cors = require('cors');
const express = require('express');
const path = require('path');
const http = require('http');
const sql = require('mssql');
const { Server } = require("socket.io");
const ntlm = require('express-ntlm');
 
const monitor = require('./monitor');
const { sendEmail } = require('./emailService');
const mdwRoutes = require('./routes/mdwRoutes');
const diskRoutes = require('./routes/diskRoutes');
const debugRoutes = require('./routes/debug');
const authRouter = require('./routes/auth');
const trackActiveUser = require('./Middleware/activeUsers');
const { touch } = require('./services/activeUsersTracker');
 
const app = express();
const server = http.createServer(app);
 
// ============================================================================
// CORS & SOCKET.IO CONFIGURATION (Viktigt för NTLM / Alt. 2)
// ============================================================================
 
const allowedOrigins = [
    "http://localhost:5173",
    "http://SLLBI01:5173",
    "http://sllbi01:5173"
];
 
const corsOptions = {
    origin: function (origin, callback) {
        // Tillåt förfrågningar utan origin (t.ex. mobilappar, curl) eller om de matchar våra tillåtna
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Ej tillåten av CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Windows-User'],
    exposedHeaders: ['X-Query-Duration-MS'], // Gör att Vue kan läsa svarstiden!
    credentials: true // Tillåter webbläsaren att skicka med Windows-autentiseringen (NTLM)
};
 
// Applicera CORS globalt först av allt!
app.use(cors(corsOptions));
 
// Konfigurera Socket.IO med samma CORS-inställningar
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});
 
// ============================================================================
// ⏱️ GLOBAL SVARSTIDSMÄTNING & API-DEBUGGER (De 10 senaste anropen)
// ============================================================================
const apiLogLimit = 10;
const recentApiCalls = [];
 
app.use((req, res, next) => {
    // Ignorera interna socket.io-anrop
    if (req.path.startsWith('/socket.io')) {
        return next();
    }
 
    const startTime = Date.now();
 
    // Spara undan den ursprungliga res.send för att kunna fånga upp när svaret skickas
    const originalSend = res.send;
    res.send = function (body) {
        const durationMs = Date.now() - startTime;
        
        // Sätt headern så att ALLA API-svar innehåller svarstiden globalt
        res.setHeader('X-Query-Duration-MS', durationMs.toString());
 
        // Spara endast API-anrop (inte statiska filer eller hälso-pings om du vill undvika brus)
        if (req.path.startsWith('/api/') && !req.path.includes('/debug/recent-calls')) {
            const logEntry = {
                timestamp: new Date().toLocaleTimeString('sv-SE'),
                method: req.method,
                path: req.path,
                query: req.query,
                statusCode: res.statusCode,
                durationMs: durationMs
            };
 
            // Lägg till först i listan och begränsa till de 10 senaste
            recentApiCalls.unshift(logEntry);
            if (recentApiCalls.length > apiLogLimit) {
                recentApiCalls.pop();
            }
        }
 
        return originalSend.apply(res, arguments);
    };
 
    next();
});
 
// ============================================================================
// MIDDLEWARE (I RÄTT ORDNING)
// ============================================================================
 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(trackActiveUser);
 
// ============================================================================
// KOPPLA IN EXTERNA ROUTE-FILER
// ============================================================================
 
app.use('/api/mdw', mdwRoutes);
app.use('/api/disks', diskRoutes);
app.use('/api/debug', debugRoutes);
 
// 👤 ENDAST auth-routen kör tyst Windows-autentisering (NTLM) i bakgrunden!
app.use('/api/auth', ntlm({
    allowAnonymous: true 
}), authRouter);  
 
// 👤 NY: Lättviktig endpoint som identifierar Windows-användaren via NTLM
app.get('/api/whoami-track', ntlm({ allowAnonymous: true }), (req, res) => {
    let username = null;
 
    if (req.ntlm && req.ntlm.Authenticated) {
        username = req.ntlm.UserName; // 👈 Bara användarnamnet, ingen domän
    }
 
    if (username) {
        touch(username);
    }
 
    res.json({ user: username || 'Okänd (anonym)' });
});
 
app.get('/api/mdw/generate-create-index', async (req, res) => {
  const { server, database, schema, table, equalityCols, inequalityCols, includedCols } = req.query;
  
  console.log('📝 [MDW] Genererar CREATE INDEX för:', { server, database, schema, table });
  
  try {
    const config = {
      server: server,
      database: 'MDW',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      authentication: {
        type: 'default',
        options: {
          userName: process.env.DB_USER,
          password: process.env.DB_PASSWORD
        }
      }
    };
    
    const pool = await sql.connect(config);
    
    const result = await pool.request()
      .input('DatabaseName', sql.NVarChar(128), database)
      .input('SchemaName', sql.NVarChar(128), schema || 'dbo')
      .input('TableName', sql.NVarChar(128), table)
      .input('EqualityColumns', sql.NVarChar(sql.MAX), equalityCols || null)
      .input('InequalityColumns', sql.NVarChar(sql.MAX), inequalityCols || null)
      .input('IncludedColumns', sql.NVarChar(sql.MAX), includedCols || null)
      .execute('usp_GenerateCreateIndexScript');
    
    const script = result.recordset[0]?.CreateIndexScript || 'Kunde inte generera script';
    
    res.json({ script });
  } catch (error) {
    console.error('❌ [MDW] Fel vid generering av CREATE INDEX:', error);
    res.status(500).json({ error: error.message });
  }
});
 
const requireSuperUser = require('./middleware/requireSuperUser');
const { getPool } = require('./monitor');
 
// Hämta alla användare (endast SU)
app.get('/api/admin/users', ntlm({ allowAnonymous: true }), requireSuperUser, async (req, res) => {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT Username, DisplayName, Email, Phone, Role, IsActive, AddedDate, Notes
        FROM dbo.AuthorizedUsers
        ORDER BY DisplayName
    `);
    res.json(result.recordset);
});
 
// Lägg till/uppdatera användare (endast SU)
app.post('/api/admin/users', ntlm({ allowAnonymous: true }), requireSuperUser, async (req, res) => {
    const { username, displayName, email, phone, role, isActive, notes } = req.body;
    const pool = await getPool();
 
    await pool.request()
        .input('username', sql.NVarChar, username)
        .input('displayName', sql.NVarChar, displayName)
        .input('email', sql.NVarChar, email)
        .input('phone', sql.NVarChar, phone)
        .input('role', sql.NVarChar, role)
        .input('isActive', sql.Bit, isActive)
        .input('notes', sql.NVarChar, notes)
        .query(`
            MERGE dbo.AuthorizedUsers AS target
            USING (SELECT @username AS Username) AS source
            ON target.Username = source.Username
            WHEN MATCHED THEN
                UPDATE SET DisplayName=@displayName, Email=@email, Phone=@phone,
                           Role=@role, IsActive=@isActive, Notes=@notes
            WHEN NOT MATCHED THEN
                INSERT (Username, DisplayName, Email, Phone, Role, IsActive, Notes)
                VALUES (@username, @displayName, @email, @phone, @role, @isActive, @notes);
        `);
 
    res.json({ success: true });
});
 
// Ta bort användare (endast SU)
app.delete('/api/admin/users/:username', ntlm({ allowAnonymous: true }), requireSuperUser, async (req, res) => {
    const pool = await getPool();
    await pool.request()
        .input('username', sql.NVarChar, req.params.username)
        .query(`DELETE FROM dbo.AuthorizedUsers WHERE Username = @username`);
    res.json({ success: true });
});
 
// Endpoint för frontend att kolla om inloggad användare är SU (för att visa/dölja knappen)
app.get('/api/admin/check-role', ntlm({ allowAnonymous: true }), async (req, res) => {
    const { getUserRole } = require('./services/authorizedUsers');
    if (!req.ntlm || !req.ntlm.Authenticated) {
        return res.json({ role: null });
    }
    const userInfo = await getUserRole(req.ntlm.UserName);
    res.json({ role: userInfo?.Role || null, isActive: userInfo?.IsActive || false });
});
 
// ============================================================================
// API ENDPOINTS (Helt öppna och blixtsnabba!)
// ============================================================================
 
app.get('/api/servers', (req, res) => {
    const serverList = monitor.servers.map(s => ({
        ServerName: s.ServerName,
        DisplayName: s.displayName,
        Environment: s.Environment
    }));
    res.json(serverList);
});
 
// Endpoint för att hämta de 10 senaste API-anropen till Debug-modalen
app.get('/api/debug/recent-calls', (req, res) => {
    res.json(recentApiCalls);
});
 
// ============================================================================
// 💓 SYSTEMPULS (HEARTBEATS)
// ============================================================================
app.get('/api/monitoring/heartbeats', async (req, res) => {
    try {
        const pool = monitor.getPool('management');
        
        if (!pool) {
            return res.status(503).json({ error: "Ingen anslutning till övervakningsdatabasen ('management')" });
        }
 
        const query = `
            SELECT 
                SystemName,
                ServerName,
                LastHeartbeat,
                AppVersion,
                [Status],
                [message],
                DATEDIFF(SECOND, LastHeartbeat, GETDATE()) AS SecondsSinceLastHeartbeat
            FROM [SQLMonitor].[dbo].[SystemStatus]
            ORDER BY SystemName ASC;
        `;
 
        const result = await pool.request().query(query);
        
        const heartbeats = result.recordset.map(row => {
            const isStale = row.SecondsSinceLastHeartbeat > 300;
            const isRunning = row.Status === 'RUNNING' || row.Status === 'OK';
            
            let healthStatus = 'OK';
            let message = row.message || 'Tjänsten snurrar på som den ska.';
 
            if (!isRunning) {
                healthStatus = 'ERROR';
                message = row.message || `Tjänsten rapporterar status: ${row.Status}`;
            } else if (isStale) {
                healthStatus = 'WARNING';
                message = `Hjärtslag är föråldrat. Senaste livstecken var för ${Math.round(row.SecondsSinceLastHeartbeat / 60)} minuter sedan.`;
            }
 
            return {
                systemName: row.SystemName,
                serverName: row.ServerName || null,
                lastHeartbeat: row.LastHeartbeat,
                appVersion: row.AppVersion,
                reportedStatus: row.Status,
                secondsSinceLast: row.SecondsSinceLastHeartbeat,
                healthStatus: healthStatus,
                message: message
            };
        });
 
        res.json(heartbeats);
    } catch (error) {
        console.error('❌ [Heartbeat API] Fel vid hämtning:', error.message);
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// 📥 MOTTAG STATUSRAPPORTERING FRÅN POWERSHELL / AGENTER
// ============================================================================
app.post('/api/systempulse/report', async (req, res) => {
    const { systemName, serverName, status, message } = req.body;
 
    if (!systemName || !status) {
        return res.status(400).json({ error: "Parametrarna 'systemName' och 'status' krävs." });
    }
 
    try {
        const pool = monitor.getPool('management');
        if (!pool) {
            return res.status(503).json({ error: "Ingen anslutning till övervakningsdatabasen ('management')" });
        }
 
        const previous = await pool.request()
            .input("SystemName", sql.NVarChar(100), systemName)
            .input("ServerName", sql.NVarChar(100), serverName || null)
            .query(`
                SELECT TOP 1 [Status]
                FROM [SQLMonitor].[dbo].[SystemStatus]
                WHERE SystemName = @SystemName
                  AND (ServerName = @ServerName OR (ServerName IS NULL AND @ServerName IS NULL))
            `);
 
        const previousStatus = previous.recordset[0]?.Status || null;
 
        await pool.request()
            .input("SystemName", sql.NVarChar(100), systemName)
            .input("ServerName", sql.NVarChar(100), serverName || null)
            .input("Status", sql.NVarChar(50), status)
            .input("Message", sql.NVarChar(500), message || null)
            .query(`
                MERGE [SQLMonitor].[dbo].[SystemStatus] AS Target
                USING (SELECT @SystemName AS SystemName, @ServerName AS ServerName) AS Source
                ON (Target.SystemName = Source.SystemName AND (Target.ServerName = Source.ServerName OR (Target.ServerName IS NULL AND Source.ServerName IS NULL)))
                WHEN MATCHED THEN
                    UPDATE SET 
                        LastHeartbeat = GETDATE(),
                        [Status] = @Status,
                        AppVersion = 'OS Service',
                        [message] = @Message
                WHEN NOT MATCHED THEN
                    INSERT (SystemName, ServerName, LastHeartbeat, AppVersion, [Status], [message])
                    VALUES (Source.SystemName, Source.ServerName, GETDATE(), 'OS Service', @Status, @Message);
            `);
 
        const statusChanged = previousStatus !== null && previousStatus !== status;
 
        if (statusChanged) {
            const isRecovery = status === 'OK' && previousStatus !== 'OK';
            const subject = isRecovery
                ? `✅ ÅTERSTÄLLD: ${systemName}${serverName ? ' (' + serverName + ')' : ''}`
                : `🔴 STATUSÄNDRING: ${systemName}${serverName ? ' (' + serverName + ')' : ''} → ${status}`;
 
            const html = `
                <h2>${isRecovery ? 'Systemet har återhämtat sig' : 'Statusändring upptäckt'}</h2>
                <table cellpadding="6" style="border-collapse:collapse;">
                    <tr><td><b>System:</b></td><td>${systemName}</td></tr>
                    <tr><td><b>Server:</b></td><td>${serverName || '-'}</td></tr>
                    <tr><td><b>Föregående status:</b></td><td>${previousStatus}</td></tr>
                    <tr><td><b>Ny status:</b></td><td>${status}</td></tr>
                    <tr><td><b>Meddelande:</b></td><td>${message || '-'}</td></tr>
                    <tr><td><b>Tidpunkt:</b></td><td>${new Date().toLocaleString('sv-SE')}</td></tr>
                </table>
            `;
 
            sendEmail(subject, html).catch(mailError => {
                console.error("⚠️ [E-post] Kunde inte skicka statusmail:", mailError.message);
            });
        }
 
        res.status(200).json({ success: true, message: "Status uppdaterad framgångsrikt." });
    } catch (error) {
        console.error("❌ API-fel vid statusrapportering:", error.message);
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// 🖥️ SERVER SPECIFIKATIONER
// ============================================================================
app.get('/api/server/:serverName/specs', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        console.log(`📡 [API] Hämtar serverspecifikationer för: ${serverName}`);
        
        const specs = await monitor.getServerSpecs(serverName);
        res.json(specs);
    } catch (error) {
        console.error(`❌ [API] Fel vid hämtning av specifikationer för ${req.params.serverName}:`, error.message);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});
 
// ============================================================================
// 🧠 MINNESSTATUS (REAL-TID)
// ============================================================================
app.get('/api/server/:serverName/memory', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        console.log(`📡 [API] Hämtar minnesstatus för: ${serverName}`);
        
        const pool = monitor.getPool(serverName);
        if (!pool) {
            return res.status(404).json({ error: `Kunde inte hitta anslutningspool för server: ${serverName}` });
        }
 
        const query = `
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
 
        const result = await pool.request().query(query);
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ error: "Ingen minnesdata kunde returneras från servern" });
        }
    } catch (error) {
        console.error(`❌ [API] Fel vid hämtning av minnesstatus för ${req.params.serverName}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// 📊 MINNESHISTORIK (7 DAGAR)
// ============================================================================
app.get('/api/server/:serverName/memory-history', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        console.log(`📡 [API] Hämtar minneshistorik för: ${serverName}`);
        
        const pool = monitor.getPool('management');
        if (!pool) {
            return res.status(500).json({ error: "Ingen anslutning till centrala databasen ('management')" });
        }
 
        const result = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .query(`
                SELECT 
                    CollectionTime AS timestamp,
                    Total_Server_Memory_MB,
                    Available_Server_Memory_MB,
                    SQL_Used_Memory_MB,
                    SQL_Memory_Utilization_Percent,
                    SQL_Target_Memory_MB,
                    SQL_Allocated_Memory_MB
                FROM dbo.ServerMemoryHistory
                WHERE ServerName = @ServerName
                  AND CollectionTime >= DATEADD(day, -7, GETDATE())
                ORDER BY CollectionTime ASC
            `);
 
        res.json(result.recordset);
    } catch (error) {
        console.error(`❌ [API] Fel vid hämtning av minneshistorik för ${req.params.serverName}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// 📊 AKTIVITETSHISTORIK & TEMPDB
// ============================================================================
app.get('/api/server/:serverName/activity-history', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        const pool = monitor.getPool('management');
        if (!pool) return res.status(500).json({ error: "Ingen anslutning till centrala databasen" });
 
        const result = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .query(`
                SELECT 
                    CollectionTime AS timestamp,
                    UserConnections,
                    BatchRequestsPerSec,
                    TempDB_Total_MB,
                    TempDB_Used_MB,
                    TempDB_Used_Percent
                FROM dbo.ServerActivityHistory
                WHERE ServerName = @ServerName
                  AND CollectionTime >= DATEADD(day, -7, GETDATE())
                ORDER BY CollectionTime ASC
            `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// 💾 TRANSAKTIONSLOGG-HISTORIK
// ============================================================================
app.get('/api/server/:serverName/log-history', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        const pool = monitor.getPool('management');
        if (!pool) return res.status(500).json({ error: "Ingen anslutning till centrala databasen" });
 
        const result = await pool.request()
            .input('ServerName', sql.NVarChar(128), serverName)
            .query(`
                SELECT 
                    CollectionTime AS timestamp,
                    DatabaseName,
                    LogSize_MB,
                    LogSpaceUsed_Percent
                FROM dbo.DatabaseLogSpaceHistory
                WHERE ServerName = @ServerName
                  AND CollectionTime >= DATEADD(day, -7, GETDATE())
                ORDER BY CollectionTime ASC
            `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// SQL AGENT JOBS
// ============================================================================
app.get('/api/jobs/:serverName', async (req, res) => {
    try {
        const { serverName } = req.params;
        const jobs = await monitor.getJobDetailsForServer(serverName); 
        res.json(jobs);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
});
 
app.get('/api/jobs/:serverName/:jobId/steps', async (req, res) => {
    try {
        const { serverName, jobId } = req.params;
        const steps = await monitor.getJobStepsWithHistory(serverName, jobId);
        res.json(steps);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
});
 
app.get('/api/servers/:serverName/jobs/history24h', async (req, res) => {
    try {
        const { serverName } = req.params;
        console.log(`📊 [API] Hämtar 24h-historik för server: ${serverName}`);
        const history = await monitor.getJobHistory24h(serverName);
        res.json(history);
    } catch (error) {
        console.error(`❌ [API] Fel vid hämtning av 24h-historik för ${req.params.serverName}:`, error.message);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});
 
app.get('/api/job-anomalies/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const pool = monitor.getPool('management');
        
        const result = await pool.request()
            .input('jobId', sql.UniqueIdentifier, jobId)
            .query(`
                SELECT 
                    IsTooFast,
                    IsTooSlow,
                    IsUnusualRetry,
                    CurrentDuration,
                    AvgDuration,
                    NormalRetryPercent
                FROM vw_JobAnomalies
                WHERE job_id = @jobId
            `);
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.json({
                IsTooFast: false,
                IsTooSlow: false,
                IsUnusualRetry: false,
                CurrentDuration: null,
                AvgDuration: null,
                NormalRetryPercent: null
            });
        }
    } catch (error) {
        console.error('❌ [Anomali] Fel vid hämtning:', error.message);
        res.status(500).json({ error: 'Kunde inte hämta anomalidata' });
    }
});
 
// 🛠️ UPPDATERAD EXPRESS ROUTE: Matchar /api/jobs/:serverName/:jobName/ssis-errors
app.get('/api/jobs/:serverName/:jobName/ssis-errors', async (req, res) => {
    try {
        const { serverName, jobName } = req.params; // Tar nu även emot jobName (t.ex. "Ladda RLK HEROMA")
        const { jobStartTime, command } = req.query;
 
        if (!command || !jobStartTime) {
            return res.status(400).json({ error: "Parametrarna 'command' och 'jobStartTime' krävs." });
        }
 
        console.log(`📡 [API] Hämtar ssis-errors för server: ${serverName}, jobb: ${jobName}`);
        const ssisErrors = await getSsisErrorDetails(serverName, command, jobStartTime);
        res.json(ssisErrors);
    } catch (error) {
        console.error('❌ [API ssis-errors] Fel:', error.message);
        res.status(500).json({ error: error.message });
    }
});
 
async function getSsisErrorDetails(serverName, command, jobStartTime) {
  try {
    // 1. Avkoda kommandot ordentligt
    const decodedCommand = decodeURIComponent(command).replace(/\\"/g, '"');
    console.log('🔍 [SSIS-Parser] Avkodat kommando:', decodedCommand);
 
    let folderName = null;
    let projectName = null;
    let packageName = null;
 
    // 2. Normalisera alla snedstreck till enkla backslashes
    const normalizedCommand = decodedCommand.replace(/\\+/g, '\\').replace(/\/+/g, '\\');
    
    // Sök efter SSIS-sökvägen
    const ssisdbMatch = normalizedCommand.match(/\\SSISDB\\([^\\]+)\\([^\\]+)\\([^\\"\s]+)/i);
 
    if (ssisdbMatch) {
      folderName = ssisdbMatch[1];
      projectName = ssisdbMatch[2];
      packageName = ssisdbMatch[3];
      
      if (!packageName.toLowerCase().endsWith('.dtsx')) {
        packageName = packageName + '.dtsx';
      }
    }
 
    if (!folderName || !projectName || !packageName) {
      console.log('❌ [SSIS-Parser] Kunde inte extrahera sökvägar från kommandot:', normalizedCommand);
      return { hasMapping: false, errors: [] };
    }
 
    console.log(`🎯 [SSIS-Parser] Matchat: Folder=${folderName}, Project=${projectName}, Package=${packageName}`);
    
    const cleanServerName = serverName.split('.')[0].toUpperCase();
    
    // 3. 🕒 Tidszons-justering: Skapa ett exakt DateTimeOffset-objekt
    // Vi skickar UTC-tiden direkt som ett Date-objekt. mssql-drivern konverterar det 
    // korrekt till SQL Servers DATETIMEOFFSET.
    const jobStartOffset = new Date(jobStartTime); 
    
    console.log(`🕒 [SSIS-Parser] Skickar exakt tidpunkt (UTC) till SQL Server: ${jobStartOffset.toISOString()}`);
    console.log(`🔍 [SSIS-Parser] Hämtar SSIS-fel via Linked Server för ${cleanServerName}`);
 
    const pool = monitor.getPool('management'); 
    if (!pool) {
      console.error(`❌ [SSIS-Parser] Hittade ingen aktiv pool för 'management'`);
      return { hasMapping: false, errors: [] };
    }
 
    // Anropa proceduren med DateTimeOffset-parametern
    const result = await pool.request()
      .input('TargetServer', sql.NVarChar(128), cleanServerName)
      .input('FolderName', sql.NVarChar(128), folderName)
      .input('ProjectName', sql.NVarChar(128), projectName)
      .input('PackageName', sql.NVarChar(128), packageName)
      .input('JobStartTime', sql.DateTimeOffset, jobStartOffset) // Ändrat till sql.DateTimeOffset!
      .execute('dbo.usp_GetRemoteSsisErrorDetails');
 
    const records = result.recordset;
    console.log(`📊 [SSIS-Parser] SP-Resultat antal rader från databasen:`, records ? records.length : 0);
 
    // Om vi fick tillbaka vår "Hittade ingen matchande körning"-rad (ExecutionFound = 0)
    if (records.length > 0 && (records[0].ExecutionFound === false || records[0].ExecutionFound === 0)) {
      console.log('ℹ️ [SSIS-Parser] Proceduren hittade ingen körning i SSISDB.');
      return {
        hasMapping: true,
        errors: [],
        noExecutionFound: true
      };
    }
 
    return {
      hasMapping: true,
      executionId: records[0]?.ExecutionId || null,
      errors: records
    };
 
  } catch (err) {
    console.error(`❌ [SSIS-Parser] Kritisk krasch i parsern:`, err.message);
    return {
      hasMapping: true,
      errors: [{
        message_time: new Date(),
        subcomponent_name: 'Parser-Krasch',
        message: `Internt fel i Node.js-parsern: ${err.message}`
      }]
    };
  }
}
 
// ============================================================================
// DISK TRENDS
// ============================================================================
app.get('/api/servers/:serverName/disks/:driveLetter/trend', async (req, res) => {
    try {
        const { serverName, driveLetter } = req.params;
        const trendData = await monitor.getDiskUsageTrend(serverName, driveLetter);
        
        if (trendData && (trendData.summary || (trendData.history && trendData.history.length > 0))) {
            res.json(trendData);
        } else {
            res.status(404).json({ message: 'Ingen trenddata kunde beräknas.' });
        }
    } catch (error) {
        console.error(`[API TREND] Fel: ${error.message}`);
        res.status(500).json({ message: 'Internt serverfel vid hämtning av disktrend.' });
    }
});
 
app.get('/api/status', (req, res) => {
    res.json(monitor.getStatus());
});
 
// ============================================================================
// ⚡ AKTIVITET (sp_WhoIsActive) MED PRESTANDAMÄTNING
// ============================================================================
app.get('/api/server/:serverName/activity', trackActiveUser, async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        const { from, to } = req.query;
        
        const startTime = Date.now();
        const activity = await monitor.getActivity(serverName, from, to);
        const durationMs = Date.now() - startTime;
        
        res.setHeader('X-Query-Duration-MS', durationMs.toString());
        res.json(activity); 
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});
 
app.get('/api/performance', async (req, res) => {
    try {
        const { server: serverName } = req.query;
        if (!serverName) return res.status(400).json({ error: 'Servernamn saknas' });
        const metrics = await monitor.getPerformanceMetrics(serverName);
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ 
            cpu: 0, 
            waitingTasks: 0, 
            pageReads: 0,
            pageWrites: 0,
            batchRequests: 0,
            userConnections: 0, 
            error: error.message 
        });
    }
});
 
app.get('/api/generate-index-script', async (req, res) => {
    try {
        const data = await monitor.generateIndexScript(req.query);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Internt serverfel vid generering av skript.', details: err.message });
    }
});
 
app.get('/api/filesizes', async (req, res) => {
    try {
        const { server: serverName } = req.query;
        if (!serverName) return res.status(400).json({ error: 'Servernamn saknas' });
        const data = await monitor.getFileStats(serverName);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// 📊 TABELLSTORLEKAR (Djuphamn i diskutnyttjande)
// ============================================================================
app.get('/api/server/:serverName/database/:dbName/table-sizes', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        const dbName = decodeURIComponent(req.params.dbName);
        
        console.log(`📡 [API] Hämtar tabellstorlekar för: ${serverName} -> ${dbName}`);
        
        const sizes = await monitor.getTableSizes(serverName, dbName);
        res.json(sizes);
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});
 
// ============================================================================
// KUNSKAPSBAS (INCIDENTS)
// ============================================================================
app.get('/api/knowledge/:serverName/:jobName', async (req, res) => {
    try {
        const { serverName, jobName } = req.params;
        const result = await monitor.getIncidentKnowledge(serverName, jobName);
        res.json(result);
    } catch (err) {
        res.status(err.statusCode || 500).send({ message: err.message });
    }
});
 
app.post('/api/knowledge', async (req, res) => {
    try {
        const result = await monitor.upsertIncidentKnowledge(req.body);
        res.json(result);
    } catch (err) {
        res.status(err.statusCode || 500).send({ message: err.message });
    }
});
 
// ============================================================================
// SESSION MANAGEMENT & ACKNOWLEDGEMENTS
// ============================================================================
app.post('/api/kill-session', async (req, res) => {
    try {
        const { server: serverName, sessionId } = req.body;
        const result = await monitor.killSession(serverName, sessionId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
 
app.post('/api/jobs/:serverName/:jobName/acknowledge', async (req, res) => {
    try {
        const { serverName, jobName } = req.params;
        const { acknowledgedBy } = req.body;
        const result = await monitor.acknowledgeJob(serverName, jobName, acknowledgedBy);
        res.json(result);
    } catch (err) {
        res.status(err.statusCode || 500).send({ message: err.message });
    }
});
 
app.get('/api/jobs/:serverName/:jobName/acknowledgement', async (req, res) => {
    try {
        const { serverName, jobName } = req.params;
        const result = await monitor.getJobAcknowledgement(serverName, jobName);
        res.json(result);
    } catch (err) {
        res.status(err.statusCode || 500).send({ message: err.message });
    }
});
 
app.get('/api/reports', async (req, res) => {
    try {
        const reports = await monitor.getSSRSReports();
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: 'Kunde inte hämta rapporter: ' + err.message });
    }
});
 
// ============================================================================
// 🚨 TEAMS TEST ALERTS
// ============================================================================
app.post('/api/test-teams-alert', async (req, res) => {
    const { sendTeamsAlert } = require('./services/notificationService');
    const { serverName } = req.body;
    const targetServer = serverName || 'SLLBI01';
 
    const fakeJob = {
        JobId: '13595ea9-a4d8-472a-8f2f-91abd5a87be7',
        JobName: 'obxt.P_DAGLIGA_RAPPORTER_OBXT',
        CategoryName: 'REPL-Merge',
        LastRunDateTime: new Date(),
        ErrorCode: 1205,
        ErrorMessage: 'Transaction (Process ID 85) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.'
    };
    
    try {
        await sendTeamsAlert(fakeJob, targetServer);
        res.status(200).json({ success: true, message: `Testlarm skickat till Teams för servern ${targetServer}!` });
    } catch (error) {
        console.error('❌ Fel vid manuellt testlarm:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
 
// ============================================================================
// 🔍 QUERY STORE SUPPORT CHECK
// ============================================================================
app.get('/api/server/:serverName/query-store-status', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        const cleanServerName = serverName.split('.')[0];
        const pool = monitor.connectionPools.get(cleanServerName) || monitor.connectionPools.get(serverName);
        
        if (!pool || !pool.connected) {
            return res.status(503).json({ error: "Ingen aktiv anslutning till servern" });
        }
 
        const versionResult = await pool.request().query(`
            SELECT 
                CAST(SERVERPROPERTY('ProductMajorVersion') AS INT) AS MajorVersion,
                CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50)) AS ProductVersion
        `);
        
        const majorVersion = versionResult.recordset[0].MajorVersion;
        const productVersion = versionResult.recordset[0].ProductVersion;
 
        // Hämta ALLTID online-databaser oavsett SQL Server-version
        const dbResult = await pool.request().query(`
            SELECT 
                name AS DatabaseName,
                CAST(CASE WHEN name NOT IN ('master', 'model', 'msdb', 'tempdb') THEN 1 ELSE 0 END AS BIT) AS IsUserDb
            FROM sys.databases
            WHERE state_desc = 'ONLINE'
        `);
 
        // Om SQL Server är äldre än 2016 (v13), returnera databaser men markera Query Store som ej stött
        if (majorVersion < 13) {
            return res.json({ 
                supported: false, 
                productVersion: productVersion,
                reason: `Servern kör SQL Server v${productVersion} (Query Store kräver SQL Server 2016 / v13 eller nyare)`,
                databases: dbResult.recordset.map(db => ({
                    DatabaseName: db.DatabaseName,
                    IsEnabled: 0 // Query Store kan inte vara aktivt på SQL 2014
                }))
            });
        }
 
        // För SQL Server 2016+ kollar vi om Query Store faktiskt är påslaget
        const qStoreResult = await pool.request().query(`
            DECLARE @sql NVARCHAR(MAX) = '
            SELECT 
                name AS DatabaseName,
                is_query_store_on AS IsEnabled
            FROM sys.databases
            WHERE name NOT IN (''master'', ''model'', ''msdb'', ''tempdb'')
              AND state_desc = ''ONLINE'''
            EXEC sp_executesql @sql
        `);
 
        res.json({
            supported: true,
            productVersion: productVersion,
            databases: qStoreResult.recordset
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// 🔥 QUERY STORE REGRESSED QUERIES
// ============================================================================
app.get('/api/server/:serverName/query-store-regressed', async (req, res) => {
    try {
        const serverName = decodeURIComponent(req.params.serverName);
        const dbName = req.query.database;
        
        if (!dbName) return res.status(400).json({ error: "Parameter 'database' krävs" });
 
        // 🧹 Rensa bort eventuell domänändelse för att hitta rätt anslutningspool
        const cleanServerName = serverName.split('.')[0];
        const pool = monitor.connectionPools.get(cleanServerName) || monitor.connectionPools.get(serverName);
        if (!pool || !pool.connected) return res.status(503).json({ error: "Ingen anslutning till servern" });
 
        const query = `
            USE [${dbName}];
            
            SELECT TOP 15
                q.query_id AS QueryId,
                CAST(qt.query_sql_text AS NVARCHAR(MAX)) AS QueryText,
                rs_recent.avg_duration AS RecentAvgDuration_ms,
                rs_historic.avg_duration AS HistoricAvgDuration_ms,
                CAST((rs_recent.avg_duration / NULLIF(rs_historic.avg_duration, 0)) AS DECIMAL(10,2)) AS PerformanceDropRatio,
                rs_recent.count_executions AS RecentExecutions,
                rs_recent.avg_cpu AS total_cpu_ms,
                rs_recent.count_executions AS execution_count,
                rs_recent.avg_duration AS total_duration_ms,
                CAST(rs_recent.avg_logical_reads AS BIGINT) AS total_logical_reads,
                CAST(rs_recent.avg_logical_writes AS BIGINT) AS total_logical_writes
            FROM sys.query_store_query q
            JOIN sys.query_store_query_text qt ON q.query_text_id = qt.query_text_id
            JOIN (
                SELECT 
                    query_id, 
                    AVG(avg_duration) / 1000.0 AS avg_duration, 
                    AVG(avg_cpu_time) / 1000.0 AS avg_cpu,
                    AVG(avg_logical_io_reads) AS avg_logical_reads,
                    AVG(avg_logical_io_writes) AS avg_logical_writes,
                    SUM(count_executions) AS count_executions
                FROM sys.query_store_runtime_stats r
                JOIN sys.query_store_plan p ON p.plan_id = r.plan_id
                WHERE r.execution_type = 0 
                  AND r.last_execution_time >= DATEADD(hour, -24, GETUTCDATE())
                GROUP BY query_id
            ) rs_recent ON q.query_id = rs_recent.query_id
            JOIN (
                SELECT query_id, AVG(avg_duration) / 1000.0 AS avg_duration
                FROM sys.query_store_runtime_stats r
                JOIN sys.query_store_plan p ON p.plan_id = r.plan_id
                WHERE r.execution_type = 0 
                  AND r.last_execution_time BETWEEN DATEADD(day, -7, GETUTCDATE()) AND DATEADD(hour, -24, GETUTCDATE())
                GROUP BY query_id
            ) rs_historic ON q.query_id = rs_historic.query_id
            WHERE (rs_recent.avg_duration / NULLIF(rs_historic.avg_duration, 0)) >= 1.5
            ORDER BY PerformanceDropRatio DESC;
        `;
 
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
 
// ============================================================================
// SOCKET.IO EVENTS
// ============================================================================
monitor.setIo(io);
 
io.on('connection', (socket) => {
    console.log(`✅ Användare anslöt via Socket.IO [ID: ${socket.id}]`);
    socket.emit('initialStatus', monitor.getStatus());
 
    socket.on('subscribeToServer', (data) => {
        const serverName = typeof data === 'string' ? data : data.serverName;
        
        socket.rooms.forEach(room => { 
            if (room !== socket.id) socket.leave(room); 
        });
        
        socket.join(serverName);
        console.log(`📡 Socket ${socket.id} prenumererar på: ${serverName}`);
        
        try {
            const status = monitor.getStatus();
            const serverData = status[serverName];
            
            if (serverData) {
                const dataForFrontend = {
                    ...serverData,
                    jobList: serverData.jobList || [],
                    jobs: serverData.jobList || []
                };
     
                console.log(`✅ Skickar fullStatusUpdate for ${serverName} med ${dataForFrontend.jobs.length} jobb.`);
                socket.emit('fullStatusUpdate', dataForFrontend);
            } else {
                console.log(`⚠️ Ingen data hittades för ${serverName}. Skickar tom data.`);
                socket.emit('fullStatusUpdate', { jobs: [], jobList: [], disks: [], performance: {} });
            }
        } catch (error) {
            console.error('❌ Fel vid hämtning av initial data:', error);
        }
    });
 
    socket.on('unsubscribeFromServer', (serverName) => {
        socket.leave(serverName);
        console.log(`📴 Socket ${socket.id} avprenumererar från: ${serverName}`);
    });
 
    socket.on('saveKnowledge', async (data) => {
      try {
        console.log('Mottog "saveKnowledge" via Socket.IO med data:', data);
        await monitor.upsertIncidentKnowledge(data);
        console.log(`Lösning sparades framgångsrikt för jobb: ${data.jobName}`);
      } catch (error) {
        console.error('❌ Fel vid sparning av kunskap via Socket.IO:', error);
      }
    });
 
    socket.on('startJob', async (data) => {
      const { serverName, jobName } = data;
      console.log(`⚡ [Socket] Begäran om att starta jobb "${jobName}" på server "${serverName}"`);
 
      if (!serverName || !jobName) {
        socket.emit('jobStartedResult', { 
          success: false, 
          message: 'Servernamn eller jobbnamn saknas.' 
        });
        return;
      }
 
      try {
        const result = await monitor.startSqlAgentJob(serverName, jobName);
        socket.emit('jobStartedResult', { 
          success: true, 
          message: `Jobbet "${jobName}" har startats framgångsrikt på ${serverName}.` 
        });
      } catch (error) {
        console.error(`❌ [Socket] Misslyckades att starta jobb "${jobName}" på ${serverName}:`, error.message);
        socket.emit('jobStartedResult', { 
          success: false, 
          message: `Kunde inte starta jobbet: ${error.message}` 
        });
      }
    });
 
    socket.on('disconnect', () => {
        console.log(`❌ Användare kopplade från [ID: ${socket.id}]`);
    });
});
 
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    next();
});
 
// ============================================================================
// --- ÖVERVAKNING AV POCKETBASE (RESURSPLANERING) ---
// ============================================================================
const monitorPocketBase = async () => {
    const systemName = 'Resursplanering';
    const serverName = 'SLLBI01';
    const pocketBaseHealthUrl = 'http://127.0.0.1:8090/api/health';
 
    let status = 'FAILED';
    let message = 'Det gick inte att ansluta till PocketBase API.';
    let appVersion = 'PocketBase';
 
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
 
        const response = await fetch(pocketBaseHealthUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            if (data.code === 200) {
                status = 'OK';
                message = data.message || 'API is healthy.';
            } else {
                status = 'WARNING';
                message = `PocketBase svarade med kod: ${data.code}`;
            }
        } else {
            status = 'FAILED';
            message = `PocketBase svarade med HTTP-status: ${response.status}`;
        }
    } catch (error) {
        status = 'FAILED';
        if (error.name === 'AbortError') {
            message = 'Anslutningen till PocketBase tog för lång tid (Timeout).';
        } else {
            message = `Anslutningsfel: ${error.message}`;
        }
    }
 
    try {
        const pool = monitor.getPool('management');
        
        if (!pool) {
            console.error(`❌ Övervakning: Kunde inte hämta db-poolen för 'management'. Databasen kanske inte är ansluten än.`);
            return;
        }
 
        await pool.request()
            .input("SystemName", sql.NVarChar(100), systemName)
            .input("ServerName", sql.NVarChar(100), serverName)
            .input("Status", sql.NVarChar(50), status)
            .input("Message", sql.NVarChar(500), message)
            .input("AppVersion", sql.NVarChar(50), appVersion)
            .query(`
                MERGE [SQLMonitor].[dbo].[SystemStatus] AS Target
                USING (SELECT @SystemName AS SystemName, @ServerName AS ServerName) AS Source
                ON (Target.SystemName = Source.SystemName AND Target.ServerName = Source.ServerName)
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
        console.log(`📊 Övervakning: Status för ${systemName} uppdaterad till [${status}]`);
    } catch (dbError) {
        console.error(`❌ Misslyckades att write PocketBase-status till databasen:`, dbError);
    }
};
 
// ============================================================================
// SERVER START
// ============================================================================
async function startApp() {
    try {
        await monitor.loadServerConfiguration();
        await monitor.startMonitoring();
        const PORT = process.env.PORT || 3003;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Backend API-server startad på http://0.0.0.0:${PORT}`);
            console.log(`🌐 Tillgänglig via: http://SLLBI01:${PORT}`);
            
            console.log(`⏱️ Schemalägger övervakning av PocketBase om 5 sekunder...`);
            setTimeout(() => {
                monitorPocketBase();
                setInterval(monitorPocketBase, 30000);
            }, 5000);
        });
    } catch (error) {
        console.error('❌ FATALT FEL: Kunde inte starta applikationen.', error);
        process.exit(1);
    }
}
startApp();