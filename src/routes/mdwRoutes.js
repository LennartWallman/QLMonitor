const express = require('express');
const router = express.Router();
const sql = require('mssql'); 
const monitor = require('../monitor');
 
// Disk usage
router.get('/disk-usage', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwDiskUsage(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /disk-usage route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// Query stats (CPU)
router.get('/query-stats', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwQueryStats(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /query-stats route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// Query stats (I/O)
router.get('/query-stats-io', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwQueryStatsByIO(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /query-stats-io route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// Server activity
router.get('/server-activity', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwServerActivity(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /server-activity route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// CPU history
router.get('/cpu-history', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwCpuHistory(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /cpu-history route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});

// Memory history
router.get('/memory-history', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwMemoryHistory(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /memory-history route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});

// Database growth
router.get('/database-growth', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwDatabaseGrowth(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /database-growth route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// Wait stats history
router.get('/wait-stats', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwWaitStatsHistory(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /wait-stats route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});

// 🆕 Performance counter values (RAW + AGGREGERAD DATA)
router.get('/performance-counters', async (req, res) => {
    try {
        const { server, startDate, endDate, counterInstanceId } = req.query;
        
        if (!server) {
            return res.status(400).json({ error: 'Server parameter saknas' });
        }
        
        console.log('📊 [MDW] Hämtar performance counter data för:', { 
            server, 
            startDate, 
            endDate, 
            counterInstanceId 
        });
        
        const data = await monitor.getMdwPerformanceCounters(server, {
            startDate,
            endDate,
            counterInstanceId
        });
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Fel i /performance-counters route:', error);
        res.status(error.statusCode || 500).json({ 
            error: error.message || 'Internt serverfel' 
        });
    }
});

// Missing indexes
router.get('/missing-indexes', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMissingIndexes(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /missing-indexes route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// ⭐ Unused indexes
router.get('/unused-indexes', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) {
            return res.status(400).json({ error: 'Server parameter saknas' });
        }
        
        const data = await monitor.getUnusedIndexes(server);
        res.json(data);
        
    } catch (error) {
        console.error('❌ Fel i /unused-indexes route:', error);
        res.status(error.statusCode || 500).json({ 
            error: error.message || 'Internt serverfel'
        });
    }
});
 
// Database growth (duplicate?)
router.get('/db-growth', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwDatabaseGrowth(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /db-growth route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
// Query stats by I/O (duplicate?)
router.get('/query-stats-by-io', async (req, res) => {
    try {
        const { server } = req.query;
        if (!server) return res.status(400).json({ error: 'Server parameter saknas' });
        const data = await monitor.getMdwQueryStatsByIO(server);
        res.json(data);
    } catch (error) {
        console.error('❌ Fel i /query-stats-by-io route:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internt serverfel' });
    }
});
 
router.get('/server/:serverName/specs', async (req, res) => {
    try {
        const { serverName } = req.params;
        const specs = await monitor.getServerSpecs(serverName);
        res.json(specs);
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});
 
// Generate CREATE INDEX Script
router.get('/generate-create-index', async (req, res) => {
  const { server, database, schema, table, equalityCols, inequalityCols, includedCols } = req.query;
  
  console.log('📝 [MDW] Genererar CREATE INDEX för:', { server, database, schema, table });
  
  try {
    const configPool = monitor.getPool('config');
    
    console.log('📞 [Config] Anropar stored procedure: usp_GenerateIndexScript');
    const result = await configPool.request()
      .input('DatabaseName', sql.NVarChar(128), database)
      .input('SchemaName', sql.NVarChar(128), schema || 'dbo')
      .input('TableName', sql.NVarChar(128), table)
      .input('EqualityColumns', sql.NVarChar(sql.MAX), equalityCols || null)
      .input('InequalityColumns', sql.NVarChar(sql.MAX), inequalityCols || null)
      .input('IncludedColumns', sql.NVarChar(sql.MAX), includedCols || null)
      .execute('dbo.usp_GenerateIndexScript');
    
    console.log('✅ [Config] Stored procedure kördes framgångsrikt');
    console.log('📋 [Config] Resultat:', result.recordset);
    
    const script = result.recordset[0]?.IndexScript || 'Kunde inte generera script';
    
    res.json({ script });
    
  } catch (error) {
    console.error('❌ [Config] Fel vid generering av CREATE INDEX:', error);
    console.error('❌ [Config] Error stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});
 
module.exports = router;