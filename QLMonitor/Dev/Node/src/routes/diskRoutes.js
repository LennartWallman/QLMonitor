// ============================================================================
// DISK MONITORING ROUTES
// ============================================================================
 
const express = require('express');
const router = express.Router();
const monitor = require('../monitor');
const sql = require('mssql'); // Importera mssql för att kunna använda parametriserade typer
 
// Hämta senaste diskstatus för alla servrar
router.get('/summary', async (req, res) => {
    try {
        const pool = monitor.getPool('config');
        const query = `
            WITH LatestEntries AS (
                SELECT
                    ServerName,
                    DriveLetter,
                    TotalMB,
                    FreeMB,
                    Timestamp AS LogTime,
                    ROW_NUMBER() OVER(PARTITION BY ServerName, DriveLetter ORDER BY Timestamp DESC) as rn
                FROM DiskUsageHistory
            )
            SELECT
                ServerName,
                DriveLetter,
                TotalMB,
                FreeMB,
                LogTime
            FROM LatestEntries
            WHERE rn = 1
            ORDER BY ServerName, DriveLetter;
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (error) {
        console.error('❌ Fel vid hämtning av disk-summary:', error);
        res.status(500).json({ error: error.message });
    }
});
 
// Hämta diskhistorik för en specifik server
router.get('/history/:serverName', async (req, res) => {
    try {
        const { serverName } = req.params;
        const data = await monitor.getDiskUsageHistory(serverName);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /history route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// Hämta trendanalys för en disk
router.get('/trend/:serverName/:driveLetter', async (req, res) => {
    try {
        const { serverName, driveLetter } = req.params;
        const trendData = await monitor.getDiskUsageTrend(serverName, driveLetter);
        if (trendData) {
            res.json(trendData);
        } else {
            res.status(404).json({ message: 'Ingen trenddata kunde beräknas.' });
        }
    } catch (error) {
        console.error('❌ Fel i /trend route:', error);
        res.status(500).json({ message: 'Internt serverfel vid hämtning av disktrend.' });
    }
});
 
// NY ENDPOINT: Hämta de 5 största databasfilerna på vald disk från målservern
router.get('/largest-files', async (req, res) => {
    try {
        const { server, drive } = req.query;
 
        if (!server || !drive) {
            return res.status(400).json({ error: 'Parametrarna "server" och "drive" krävs.' });
        }
 
        console.log(`[Largest Files] Begäran mottagen för server: "${server}", disk: "${drive}:"`);
 
        // Hämta anslutningspoolen direkt från monitor.connectionPools Map:en
        let pool = monitor.connectionPools.get(server);
 
        // Om det inte hittas direkt, prova att söka skiftlägesoberoende i Map:en
        if (!pool) {
            for (let [key, value] of monitor.connectionPools.entries()) {
                if (key.toLowerCase() === server.toLowerCase()) {
                    pool = value;
                    console.log(`[Largest Files] Hittade matchande pool via skiftlägesoberoende sökning: "${key}"`);
                    break;
                }
            }
        }
 
        if (!pool || !pool.connected) {
            console.error(`❌ [Largest Files] Ingen aktiv anslutningspool hittades i connectionPools för: "${server}"`);
            return res.status(404).json({ error: `Kunde inte hitta en aktiv anslutning till servern: ${server}` });
        }
 
        console.log(`✅ [Largest Files] Använder aktiv realtidspool för server: "${server}"`);
 
        // SQL-fråga som körs direkt mot målserverns anslutningspool
        const query = `
            SELECT TOP 5 
                DB_NAME(database_id) AS DatabaseName,
                name AS LogicalName,
                physical_name AS PhysicalName,
                CAST((size * 8.0) / 1024.0 AS DECIMAL(18,2)) AS SizeMB,
                type_desc AS FileType
            FROM sys.master_files
            WHERE physical_name LIKE @drivePattern
            ORDER BY size DESC;
        `;
 
        const result = await pool.request()
            .input('drivePattern', sql.VarChar, `${drive}:%`)
            .query(query);
 
        res.json(result.recordset);
    } catch (error) {
        console.error(`❌ Fel vid hämtning av största filer för ${req.query.server} (${req.query.drive}:):`, error);
        res.status(500).json({ error: 'Kunde inte hämta filinformation från SQL Server.' });
    }
});
 
module.exports = router;