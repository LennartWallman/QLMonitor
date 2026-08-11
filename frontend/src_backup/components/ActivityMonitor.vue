<template>
  <div class="activity-monitor">
    
    <!-- Diagram-sektion -->
    <div class="charts-grid">
      <RealtimeChart 
        title="% Processor Time" 
        :series-data="cpuSeries" 
        :yaxis-max="100" 
      />
      <RealtimeChart 
        title="Waiting Tasks" 
        :series-data="waitingTasksSeries" 
      />
      
      <!-- Database I/O Chart -->
      <RealtimeChart 
        title="Database I/O (Pages/sec)" 
        :series-data="ioSeries" 
      />
      
      <!-- Batch Requests/sec Chart -->
      <RealtimeChart 
        title="Batch Requests/sec" 
        :series-data="batchRequestsSeries" 
      />
    </div>
 
    <!-- Pågående Aktiviteter -->
    <div class="active-queries-section">
      <h2>Pågående Aktiviteter ({{ activeQueries.length }})</h2>
      
      <div v-if="activeQueries.length === 0" class="empty-state">
        <p>Inga pågående queries just nu</p>
      </div>
      
      <div v-else class="table-wrapper">
        <table class="queries-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Status</th>
              <th>Blockerad av</th>
              <th>Databas</th>
              <th>Användare</th>
              <th>Värdnamn</th>
              <th>Varaktighet</th>
              <th>CPU (ms)</th>
              <th>Reads</th>
              <th>Writes</th>
              <th>Wait Type</th>
              <th>Query</th>
              <th>Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="query in activeQueries" 
              :key="getUniqueKey(query)"
              :class="getRowClass(query)"
            >
              <td class="session-id">{{ query.session_id }}</td>
              <td>
                <span 
                  class="status-badge" 
                  :class="getStatusClass(query.status)"
                >
                  {{ query.status || 'N/A' }}
                </span>
              </td>
              <td class="blocking-info">
                <span v-if="query.blocking_session_id > 0" class="blocked-badge">
                  🔒 {{ query.blocking_session_id }}
                </span>
                <span v-else>-</span>
              </td>
              <td class="database-name">{{ query.database_name || 'N/A' }}</td>
              <td class="username">{{ query.login_name || 'N/A' }}</td>
              <td class="hostname">{{ query.host_name || 'N/A' }}</td>
              <td class="duration">{{ formatDuration(query.duration_seconds) }}</td>
              <td class="cpu-time">{{ formatNumber(query.cpu_time) }}</td>
              <td class="reads">{{ formatNumber(query.reads) }}</td>
              <td class="writes">{{ formatNumber(query.writes) }}</td>
              <td class="wait-type">{{ query.wait_type || '-' }}</td>
              <td class="query-text">
                <div 
                  class="query-preview" 
                  :title="query.sql_text"
                  @click="showSqlCommand(query.sql_text)"
                >
                  {{ truncateQuery(query.sql_text) }}
                </div>
              </td>
              <td class="actions">
                <button 
                  @click="killSession(query.session_id)" 
                  class="kill-button"
                  title="Avbryt session"
                >
                  ⛔ Kill
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
 
    <!-- SQL Command Modal -->
    <div v-if="isSqlModalVisible" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>SQL Kommando</h3>
          <button @click="closeModal" class="close-button">&times;</button>
        </div>
        <div class="modal-body">
          <pre><code>{{ modalSqlText }}</code></pre>
        </div>
      </div>
    </div>
 
  </div>
</template>
 
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import RealtimeChart from './RealtimeChart.vue';
import { socketService } from '../services/socketService';
 
const props = defineProps({
  serverName: { type: String, required: true }
});
 
// State
const cpuHistory = ref([]);
const waitingTasksHistory = ref([]);
const pageReadsHistory = ref([]);
const pageWritesHistory = ref([]);
const batchRequestsHistory = ref([]);
const activeQueries = ref([]);
 
// ⭐ NYA: Spara föregående värden för delta-beräkning
const previousPageReads = ref(null);
const previousPageWrites = ref(null);
const previousBatchRequests = ref(null);
 
// Computed properties för chart-data
const cpuSeries = computed(() => [{ name: 'CPU %', data: cpuHistory.value }]);
const waitingTasksSeries = computed(() => [{ name: 'Waiting Tasks', data: waitingTasksHistory.value }]);
 
const ioSeries = computed(() => [
  { name: 'Page Reads/sec', data: pageReadsHistory.value },
  { name: 'Page Writes/sec', data: pageWritesHistory.value }
]);
 
const batchRequestsSeries = computed(() => [
  { name: 'Batch Requests/sec', data: batchRequestsHistory.value }
]);

// Modal state
const isSqlModalVisible = ref(false);
const modalSqlText = ref('');
 
// Hjälpfunktioner för tabellen
function getUniqueKey(query) {
  return `${query.session_id}-${query.sql_text?.substring(0, 50) || 'unknown'}`;
}
 
function getRowClass(query) {
  if (query.blocking_session_id > 0 && query.status === 'suspended') {
    return 'is-blocked-by-other';
  }
  if (query.is_blocking) {
    return 'is-blocking';
  }
  if (query.duration_seconds > 300) {
    return 'long-running';
  }
  return '';
}
 
function getStatusClass(status) {
  const statusLower = (status || '').toLowerCase();
  if (statusLower === 'running') return 'running';
  if (statusLower === 'suspended') return 'suspended';
  if (statusLower === 'sleeping') return 'sleeping';
  return 'unknown';
}
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
 
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('sv-SE');
}
 
function truncateQuery(sql) {
  if (!sql) return 'N/A';
  const maxLength = 80;
  return sql.length > maxLength ? sql.substring(0, maxLength) + '...' : sql;
}
 
function showSqlCommand(sqlText) {
  modalSqlText.value = sqlText || 'Ingen SQL-text tillgänglig';
  isSqlModalVisible.value = true;
}
 
function closeModal() {
  isSqlModalVisible.value = false;
  modalSqlText.value = '';
}
 
async function killSession(sessionId) {
  if (!confirm(`Är du säker på att du vill avbryta session ${sessionId}?`)) {
    return;
  }
  
  try {
    const response = await fetch(`http://localhost:3003/api/kill-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverName: props.serverName,
        sessionId: sessionId
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert(`✅ Session ${sessionId} avbruten`);
    } else {
      alert(`❌ Kunde inte avbryta session: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Fel vid kill session:', error);
    alert('❌ Fel vid kommunikation med servern');
  }
}
// Deduplicera queries
function deduplicateQueries(queries) {
  const seen = new Map();
  return queries.filter(q => {
    const key = `${q.session_id}-${q.sql_text}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}
 
// Event handlers
function handleFullStatusUpdate(allStatuses) {
  console.log('📦 [ActivityMonitor] fullStatusUpdate mottagen (används ej för queries)');
}
 
function handlePerformanceUpdate(data) {
  console.log('📊 [ActivityMonitor] performanceUpdate:', data);
  
  if (data.serverName !== props.serverName) return;
  
  const metrics = data.metrics;
  const timestamp = new Date(data.timestamp).toLocaleTimeString('sv-SE');
  
  // CPU (direkt värde)
  if (typeof metrics.cpu === 'number' && metrics.cpu >= 0 && metrics.cpu <= 100) {
    cpuHistory.value.push({ x: timestamp, y: metrics.cpu });
    if (cpuHistory.value.length > 50) cpuHistory.value.shift();
  }
  
  // Waiting Tasks (direkt värde)
  if (typeof metrics.waitingTasks === 'number' && metrics.waitingTasks >= 0) {
    waitingTasksHistory.value.push({ x: timestamp, y: metrics.waitingTasks });
    if (waitingTasksHistory.value.length > 50) waitingTasksHistory.value.shift();
  }
  
  // ⭐ PAGE READS - Beräkna delta
  if (typeof metrics.pageReads === 'number' && metrics.pageReads >= 0) {
    if (previousPageReads.value !== null && metrics.pageReads >= previousPageReads.value) {
      const delta = metrics.pageReads - previousPageReads.value;
      pageReadsHistory.value.push({ x: timestamp, y: delta });
      if (pageReadsHistory.value.length > 50) pageReadsHistory.value.shift();
    }
    previousPageReads.value = metrics.pageReads;
  }
  
  // ⭐ PAGE WRITES - Beräkna delta
  if (typeof metrics.pageWrites === 'number' && metrics.pageWrites >= 0) {
    if (previousPageWrites.value !== null && metrics.pageWrites >= previousPageWrites.value) {
      const delta = metrics.pageWrites - previousPageWrites.value;
      pageWritesHistory.value.push({ x: timestamp, y: delta });
      if (pageWritesHistory.value.length > 50) pageWritesHistory.value.shift();
    }
    previousPageWrites.value = metrics.pageWrites;
  }
  
  // ⭐ BATCH REQUESTS - Beräkna delta
  const batchReq = Number(metrics.batchRequests);
  if (typeof batchReq === 'number' && !isNaN(batchReq) && batchReq >= 0) {
    console.log('🟡 Batch Requests - Current:', batchReq, 'Previous:', previousBatchRequests.value);
    if (previousBatchRequests.value !== null && batchReq >= previousBatchRequests.value) {
      const delta = batchReq - previousBatchRequests.value;
      console.log('✅ Batch Requests Delta:', delta);
      batchRequestsHistory.value.push({ x: timestamp, y: delta });
      if (batchRequestsHistory.value.length > 50) batchRequestsHistory.value.shift();
    }
    previousBatchRequests.value = batchReq;
  }
} 
 
function handleActiveQueriesUpdate(data) {
  console.log('🔍 [ActivityMonitor] activeQueriesUpdate:', data.queries.length, 'queries');
  
  if (data.serverName !== props.serverName) return;
  
  const uniqueQueries = deduplicateQueries(data.queries);
  activeQueries.value = uniqueQueries;
}
 
// Watcher för server-byten
watch(() => props.serverName, (newServer, oldServer) => {
  console.log('🔄 [ActivityMonitor] Server ändrad:', oldServer, '→', newServer);
  
  // Rensa all historik
  cpuHistory.value = [];
  waitingTasksHistory.value = [];
  pageReadsHistory.value = [];
  pageWritesHistory.value = [];
  batchRequestsHistory.value = [];
  activeQueries.value = [];
  
  // ⭐ Återställ föregående värden
  previousPageReads.value = null;
  previousPageWrites.value = null;
  previousBatchRequests.value = null;
  
  // Avsluta prenumeration på gamla servern
  if (oldServer) {
    socketService.unsubscribeFromServer(oldServer);
  }
  
  // Prenumerera på nya servern
  if (newServer) {
    socketService.subscribeToServer(newServer);
  }
});
 
// Lifecycle hooks
onMounted(() => {
  console.log('✅ [ActivityMonitor] Monterad för server:', props.serverName);
  
  socketService.on('fullStatusUpdate', handleFullStatusUpdate);
  socketService.on('performanceUpdate', handlePerformanceUpdate);
  socketService.on('activeQueriesUpdate', handleActiveQueriesUpdate);
  
  if (props.serverName) {
    socketService.subscribeToServer(props.serverName);
  }
});
 
onUnmounted(() => {
  console.log('❌ [ActivityMonitor] Avmonterad');
  
  socketService.off('fullStatusUpdate', handleFullStatusUpdate);
  socketService.off('performanceUpdate', handlePerformanceUpdate);
  socketService.off('activeQueriesUpdate', handleActiveQueriesUpdate);
  
  if (props.serverName) {
    socketService.unsubscribeFromServer(props.serverName);
  }
});
</script>
 
<style scoped>
.activity-monitor {
  padding: 1rem;
}
 
/* Charts Grid */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
  margin-bottom: 2rem;
}
 
.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  min-height: 290px;
  font-size: 1rem;
  background-color: #2a2a2a;
  border-radius: 8px;
  border: 1px solid #444;
}
 
/* Active Queries Section */
.active-queries-section {
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}
 
.active-queries-section h2 {
  margin: 0 0 1.5rem 0;
  color: #4CAF50;
  font-size: 1.5rem;
}
 
.empty-state {
  text-align: center;
  padding: 3rem;
  color: #888;
  font-size: 1.1rem;
}
 
.table-wrapper {
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
  border-radius: 8px;
}
 
.queries-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
 
.queries-table thead {
  position: sticky;
  top: 0;
  background-color: #1a1a1a;
  z-index: 10;
}
 
.queries-table th {
  padding: 12px 10px;
  text-align: left;
  border-bottom: 2px solid #4CAF50;
  font-weight: 600;
  color: #4CAF50;
  white-space: nowrap;
}
 
.queries-table td {
  padding: 10px;
  border-bottom: 1px solid #444;
  vertical-align: top;
  color: #E0E0E0;
}
 
.queries-table tbody tr:hover {
  background-color: #333;
  cursor: pointer;
}
 
/* Row Classes */
.is-blocking {
  background-color: #8B0000 !important;
  font-weight: bold;
}
 
.is-blocked-by-other {
  background-color: #5a5a22 !important;
}
 
.long-running {
  background-color: #3a2a1a;
}
 
/* Cell Styling */
.session-id {
  font-weight: bold;
  color: #2196F3;
}
 
.database-name {
  color: #FFC107;
  font-weight: 500;
}
 
.username {
  color: #9C27B0;
}
 
.hostname {
  color: #888;
  font-size: 0.85rem;
}
 
.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
}
 
.status-badge.running {
  background-color: #4CAF50;
  color: white;
}
 
.status-badge.suspended {
  background-color: #FF9800;
  color: white;
}
 
.status-badge.sleeping {
  background-color: #607D8B;
  color: white;
}
 
.status-badge.unknown {
  background-color: #757575;
  color: white;
}
 
.blocked-badge {
  background-color: #f44336;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.8rem;
  font-weight: bold;
}
 
.duration {
  font-family: monospace;
  color: #03A9F4;
  font-weight: 500;
}
 
.cpu-time, .reads, .writes {
  font-family: monospace;
  text-align: right;
  color: #E0E0E0;
}
 
.wait-type {
  font-size: 0.85rem;
  color: #FF5722;
  font-weight: 500;
}
 
.query-preview {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: #E0E0E0;
  background-color: #1a1a1a;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
 
.query-preview:hover {
  background-color: #333;
  color: #4CAF50;
}
 
.kill-button {
  background-color: #e74c3c;
  color: white;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  font-weight: 600;
  transition: background-color 0.2s;
  font-size: 0.85rem;
}
 
.kill-button:hover {
  background-color: #c0392b;
}
 
.kill-button:active {
  transform: scale(0.95);
}
 
/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}
 
.modal-content {
  background-color: #2c3e50;
  padding: 25px;
  border-radius: 8px;
  width: 90%;
  max-width: 1000px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #34495e;
  box-shadow: 0 5px 25px rgba(0, 0, 0, 0.5);
}
 
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #34495e;
  padding-bottom: 15px;
  margin-bottom: 20px;
}
 
.modal-header h3 {
  margin: 0;
  color: #1abc9c;
  font-size: 1.4rem;
}
 
.close-button {
  background: none;
  border: none;
  font-size: 2.2rem;
  line-height: 1;
  color: #7f8c8d;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s ease;
}
 
.close-button:hover {
  color: #bdc3c7;
}
 
.modal-body {
  overflow-y: auto;
  color: #ecf0f1;
}
 
.modal-body pre {
  background-color: #22303f;
  padding: 15px;
  border-radius: 5px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #E0E0E0;
}
 
.modal-body code {
  color: #4CAF50;
}
 
/* Scrollbar Styling */
.table-wrapper::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
 
.table-wrapper::-webkit-scrollbar-track {
  background: #1a1a1a;
  border-radius: 5px;
}
 
.table-wrapper::-webkit-scrollbar-thumb {
  background: #4CAF50;
  border-radius: 5px;
}
 
.table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #45a049;
}
 
/* Responsiv design */
@media (max-width: 1200px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .query-preview {
    max-width: 300px;
  }
}
 
@media (max-width: 768px) {
  .queries-table {
    font-size: 0.8rem;
  }
  
  .queries-table th,
  .queries-table td {
    padding: 8px 6px;
  }
  
  .query-preview {
    max-width: 200px;
  }
}
</style>