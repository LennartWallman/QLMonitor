<template>
  <div class="activity-monitor-container">
    <!-- Kontrollpanel -->
    <div class="monitor-controls card-bg">
      <div class="control-group">
        <h2 class="section-title">⚡ Aktivitetsmonitor (sp_WhoIsActive)</h2>
        <p class="section-subtitle">
          Visar sparad aktivitet och resurskrävande frågor på <strong>{{ serverName || 'Välj server' }}</strong>
          <span v-if="queryDuration > 0" class="query-duration-badge">
            ⏱️ Svarstid: <strong>{{ queryDuration }} ms</strong>
          </span>
        </p>
      </div>
      
      <div class="control-actions">
        <!-- 🕒 Tidsintervalls-väljare -->
        <div class="time-selector-group">
          <label class="control-label">Tidsintervall:</label>
          <select v-model="timeRange" @change="onTimeRangeChange" class="select-input">
            <option value="1h">Senaste timmen</option>
            <option value="24h">Senaste dygnet (24h)</option>
            <option value="3d">Senaste 3 dagarna</option>
            <option value="custom">Anpassat intervall...</option>
          </select>
        </div>
 
        <!-- Visas endast om "Anpassat" är valt -->
        <div v-if="timeRange === 'custom'" class="custom-time-inputs">
          <input type="datetime-local" v-model="customFrom" class="date-input" />
          <span class="date-separator">till</span>
          <input type="datetime-local" v-model="customTo" class="date-input" />
        </div>
 
        <!-- Sök / Filter -->
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Filtrera på login, program, SPID..." 
          class="search-input"
        />
 
        <!-- Visa sovande sessioner med öppna transaktioner -->
        <label class="checkbox-label">
          <input type="checkbox" v-model="showSleepingTrans" />
          <span>Visa sovande med trans.</span>
        </label>
 
        <!-- Uppdateringsindikator -->
        <button @click="fetchActivity" class="btn-refresh" :disabled="isLoading">
          <span :class="{ 'spin': isLoading }">🔄</span>
          <span>Hämta data</span>
        </button>
      </div>
    </div>
 
    <!-- Blockerings-varning (Visas om det finns aktiva blockeringar i den hämtade datan) -->
    <div v-if="blockersList.length > 0" class="alert-banner alert-danger">
      <div class="alert-icon">🚨</div>
      <div class="alert-content">
        <strong>Blockeringar upptäckta i urvalet!</strong>
        <span> {{ blockersList.length }} sessioner har blockerat andra processer under den valda tidsperioden. Klicka på blockeringsbadgarna i tabellen för att se de drabbade sessionerna.</span>
      </div>
    </div>
 
    <!-- Huvudtabell med sessioner -->
    <div class="monitor-grid">
      <div class="table-container card-bg">
        <div v-if="isLoading && sessions.length === 0" class="loading-state">
          <div class="spinner"></div>
          <p>Hämtar historisk aktivitet från {{ serverName }}...</p>
        </div>
 
        <div v-else-if="filteredSessions.length === 0" class="empty-state">
          <p>Inga sessioner hittades för det valda tidsintervallet. 💤</p>
        </div>
 
        <table v-else class="activity-table">
          <thead>
            <tr>
              <!-- Tidpunkt -->
              <th @click="setSort('collection_time')" class="sortable">Tidpunkt <span class="sort-arrow">{{ sortKey === 'collection_time' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('session_id')" class="sortable">SPID <span class="sort-arrow">{{ sortKey === 'session_id' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('login_name')" class="sortable">Användare <span class="sort-arrow">{{ sortKey === 'login_name' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('database_name')" class="sortable">Databas <span class="sort-arrow">{{ sortKey === 'database_name' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('CPU')" class="sortable text-right">CPU (ms) <span class="sort-arrow">{{ sortKey === 'CPU' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('reads')" class="sortable text-right">Läsningar <span class="sort-arrow">{{ sortKey === 'reads' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('writes')" class="sortable text-right">Skrivningar <span class="sort-arrow">{{ sortKey === 'writes' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('tempdb_current')" class="sortable text-right">TempDB <span class="sort-arrow">{{ sortKey === 'tempdb_current' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th @click="setSort('elapsed_time')" class="sortable">Körtid <span class="sort-arrow">{{ sortKey === 'elapsed_time' ? (sortDesc ? '▼' : '▲') : '' }}</span></th>
              <th>Status / Väntetyp</th>
              <th>SQL Fråga</th>
            </tr>
          </thead>
          <tbody>
            <!-- Vi använder <template v-for> för att kunna skjuta in extra rader dynamiskt under varje session -->
            <template v-for="session in filteredSessions" :key="session.collection_time + '-' + session.session_id">
              <tr 
                :class="{ 
                  'row-blocking': session.blocked_session_count > 0, 
                  'row-blocked': session.blocking_session_id > 0,
                  'row-sleeping': session.status === 'sleeping',
                  'row-expanded': isExpanded(session)
                }"
              >
                <!-- Tidpunkt -->
                <td class="font-mono text-small text-nowrap">
                  {{ formatDateTime(session.collection_time) }}
                </td>
   
                <!-- SPID med ev. blockerings-badge -->
                <td>
                  <div class="spid-cell">
                    <span class="spid-badge">{{ session.session_id }}</span>
                    
                    <!-- Klickbar badge om sessionen blockerar andra -->
                    <span 
                      v-if="session.blocked_session_count > 0" 
                      class="badge badge-danger badge-clickable" 
                      @click="toggleExpand(session)"
                      :title="'Klicka för att se de ' + session.blocked_session_count + ' sessioner som väntar'"
                    >
                      👑 Blockerar ({{ session.blocked_session_count }}) 
                      <span class="expand-indicator">{{ isExpanded(session) ? '▲' : '▼' }}</span>
                    </span>
                    
                    <span v-if="session.blocking_session_id > 0" class="badge badge-warning" :title="'Blockerad av SPID ' + session.blocking_session_id">
                      🛑 Blockas av {{ session.blocking_session_id }}
                    </span>
                  </div>
                </td>
                
                <!-- Användare & Program -->
                <td>
                  <div class="user-cell">
                    <span class="font-bold">{{ session.login_name }}</span>
                    <span class="text-muted text-small" :title="session.program_name">{{ truncateString(session.program_name, 25) }}</span>
                  </div>
                </td>
   
                <!-- Databas -->
                <td>
                  <span class="database-pill">{{ session.database_name || 'master' }}</span>
                </td>
   
                <!-- CPU -->
                <td class="text-right font-mono">{{ formatNumber(session.CPU) }}</td>
   
                <!-- Läsningar -->
                <td class="text-right font-mono">{{ formatNumber(session.reads) }}</td>
   
                <!-- Skrivningar -->
                <td class="text-right font-mono">{{ formatNumber(session.writes) }}</td>
   
                <!-- TempDB -->
                <td class="text-right font-mono" :class="{ 'text-warning': session.tempdb_current > 1000 }">
                  {{ formatNumber(session.tempdb_current) }}
                </td>
   
                <!-- Körtid -->
                <td class="font-mono text-small">{{ session.elapsed_time_formatted || formatTime(session.elapsed_time) }}</td>
   
                <!-- Status och Wait Info -->
                <td>
                  <div class="status-cell">
                    <span class="status-indicator" :class="'status-' + session.status"></span>
                    <span class="text-small font-bold">{{ session.status }}</span>
                    <span v-if="session.wait_info" class="wait-badge" :title="session.wait_info">
                      ⚠️ {{ truncateString(session.wait_info, 20) }}
                    </span>
                  </div>
                </td>
   
                <!-- SQL Text (Klickbar för att visa hela) -->
                <td>
                  <div class="sql-preview-cell" @click="openSqlModal(session)">
                    <code>{{ truncateString(session.sql_text || 'Ingen SQL tillgänglig (Kanske sovande transaktion)', 60) }}</code>
                    <span class="zoom-icon">🔍 Förstora</span>
                  </div>
                </td>
              </tr>
 
              <!-- EXPANDERAD RAD: Visar alla sessioner som är blockerade av denna session vid samma tidpunkt -->
              <tr v-if="isExpanded(session)" class="row-nested-container">
                <td colspan="11" class="nested-table-cell">
                  <div class="nested-wrapper">
                    <div class="nested-header">
                      <span>⚠️ Följande sessioner väntar på SPID <strong>{{ session.session_id }}</strong> vid denna tidpunkt:</span>
                    </div>
                    <div v-if="getBlockedSessionsBy(session).length === 0" class="nested-empty-state">
                      ℹ️ Den blockerade sessionen fastnade inte i historikinsamlingen vid denna tidpunkt. 
                      <br><span class="text-muted text-small">Detta är normalt om den blockerade frågan slutfördes snabbt eller filtrerades bort av övervakningsjobbet för att spara diskutrymme.</span>
                    </div>
 
                    <table v-else class="nested-table">
                      <thead>
                        <tr>
                          <th>SPID</th>
                          <th>Användare & Program</th>
                          <th>Databas</th>
                          <th class="text-right">CPU (ms)</th>
                          <th class="text-right">Körtid</th>
                          <th>Status / Väntetyp</th>
                          <th>Väntande SQL-fråga</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="blocked in getBlockedSessionsBy(session)" :key="blocked.session_id" class="nested-row">
                          <td class="font-mono">
                            <span class="arrow-indicator">↳ 🔴</span>
                            <span class="spid-badge nested-spid">{{ blocked.session_id }}</span>
                          </td>
                          <td>
                            <div class="user-cell">
                              <span class="font-bold">{{ blocked.login_name }}</span>
                              <span class="text-muted text-small">{{ truncateString(blocked.program_name, 35) }}</span>
                            </div>
                          </td>
                          <td><span class="database-pill">{{ blocked.database_name || 'master' }}</span></td>
                          <td class="text-right font-mono">{{ formatNumber(blocked.CPU) }}</td>
                          <td class="font-mono text-small">{{ blocked.elapsed_time_formatted || formatTime(blocked.elapsed_time) }}</td>
                          <td>
                            <div class="status-cell">
                              <span class="status-indicator status-suspended"></span>
                              <span class="text-small font-bold">{{ blocked.status }}</span>
                              <span v-if="blocked.wait_info" class="wait-badge" :title="blocked.wait_info">
                                ⚠️ {{ truncateString(blocked.wait_info, 30) }}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div class="sql-preview-cell" @click="openSqlModal(blocked)">
                              <code>{{ truncateString(blocked.sql_text || 'Ingen SQL tillgänglig', 60) }}</code>
                              <span class="zoom-icon">🔍 Förstora</span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
 
    <!-- MODAL: SQL-förstoring -->
    <div v-if="activeSqlModal" class="specs-modal-overlay" @click.self="closeSqlModal">
      <div class="specs-modal-card app-modal-card sql-modal">
        <div class="modal-header">
          <h4>📝 SQL-kod för SPID {{ activeSqlModal.session_id }} ({{ activeSqlModal.login_name }})</h4>
          <button class="btn-close-modal" @click="closeSqlModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="meta-grid">
            <div><strong>Tidpunkt:</strong> {{ formatDateTime(activeSqlModal.collection_time) }}</div>
            <div><strong>Databas:</strong> {{ activeSqlModal.database_name }}</div>
            <div><strong>Körtid:</strong> {{ formatTime(activeSqlModal.elapsed_time) }}</div>
            <div><strong>Program:</strong> {{ activeSqlModal.program_name }}</div>
          </div>
          <pre class="sql-code-block"><code>{{ activeSqlModal.sql_text || '-- Ingen SQL-text kunde hämtas' }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>
 
<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import axios from 'axios'
 
const props = defineProps({
  serverName: {
    type: String,
    required: true
  }
})
 
// State
const sessions = ref([])
const isLoading = ref(false)
const searchQuery = ref('')
const showSleepingTrans = ref(true)
const activeSqlModal = ref(null)
const expandedRows = ref(new Set()) // Håller koll på expanderade blockerande rader
const queryDuration = ref(0) // Sparar laddningstiden för den senaste körningen
 
// 🕒 Tidsintervalls-state (24h som default)
const timeRange = ref('24h')
const customFrom = ref('')
const customTo = ref('')
 
// Sortering (Sorterar på insamlingstid som default så vi ser det senaste först)
const sortKey = ref('collection_time')
const sortDesc = ref(true)
 
// Gemensam hjälpfunktion för att formatera Date-objekt till lokal ISO-sträng utan UTC-förskjutning (YYYY-MM-DDTHH:mm:ss)
const toLocalISOString = (date) => {
  const pad = (num) => num.toString().padStart(2, '0')
  return date.getFullYear() +
    '-' + pad(date.getMonth() + 1) +
    '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) +
    ':' + pad(date.getMinutes()) +
    ':' + pad(date.getSeconds())
}
 
// Hämta aktivitet från API med lokal tidszon och mät laddningstid
const fetchActivity = async () => {
  if (!props.serverName) return
  isLoading.value = true
  expandedRows.value.clear() // Nollställ expanderade rader vid ny hämtning
  
  let fromDate = new Date()
  let toDate = new Date()
 
  if (timeRange.value === '1h') {
    fromDate.setHours(fromDate.getHours() - 1)
  } else if (timeRange.value === '24h') {
    fromDate.setHours(fromDate.getHours() - 24)
  } else if (timeRange.value === '3d') {
    fromDate.setDate(fromDate.getDate() - 3)
  } else if (timeRange.value === 'custom') {
    fromDate = new Date(customFrom.value)
    toDate = new Date(customTo.value)
  }
 
  try {
    const params = {
      from: toLocalISOString(fromDate),
      to: toLocalISOString(toDate)
    }
    
    // Vi läser av headers för att få ut prestandan
    const response = await axios.get(`http://sllbi01:3003/api/server/${props.serverName}/activity`, { 
      params,
      headers: {
        // Skicka med Windows-användaren i anropet om den finns lagrad i sessionen
        'X-Windows-User': localStorage.getItem('sql-monitor-username') || ''
      }
    })
    
    // Läs av körtiden från vår anpassade HTTP-header
    const durationHeader = response.headers['x-query-duration-ms']
    if (durationHeader) {
      queryDuration.value = parseInt(durationHeader)
      
      // Skicka körtiden uppåt till App.vue via ett globalt fönsterevent så att debug-modalen kan visa den!
      window.dispatchEvent(new CustomEvent('sql-query-duration-updated', { 
        detail: { durationMs: queryDuration.value } 
      }))
    }
    
    sessions.value = response.data || []
  } catch (error) {
    console.error('Kunde inte hämta SQL-aktivitet:', error)
  } finally {
    isLoading.value = false
  }
}
 
// Hantera ändring av tidsintervall
const onTimeRangeChange = () => {
  if (timeRange.value !== 'custom') {
    fetchActivity()
  } else {
    // Sätt rimliga defaults för anpassat sökintervall i lokal tid (klipp bort sekunder för datetime-local fältet)
    const now = new Date()
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    customTo.value = toLocalISOString(now).slice(0, 16)
    customFrom.value = toLocalISOString(yesterday).slice(0, 16)
  }
}
 
// Bevaka serverbyten
watch(() => props.serverName, (newServer) => {
  if (newServer) {
    sessions.value = []
    fetchActivity()
  }
})
 
// Filtrering och Sortering logik
const filteredSessions = computed(() => {
  let result = [...sessions.value]
 
  // Filter 1: Sökfråga
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(s => 
      s.session_id.toString().includes(query) ||
      (s.login_name && s.login_name.toLowerCase().includes(query)) ||
      (s.program_name && s.program_name.toLowerCase().includes(query)) ||
      (s.database_name && s.database_name.toLowerCase().includes(query)) ||
      (s.sql_text && s.sql_text.toLowerCase().includes(query))
    )
  }
 
  // Filter 2: Sovande transaktioner
  if (!showSleepingTrans.value) {
    result = result.filter(s => s.status !== 'sleeping')
  }
 
  // Sortering
  result.sort((a, b) => {
    let modifier = sortDesc.value ? -1 : 1
    let valA = a[sortKey.value]
    let valB = b[sortKey.value]
 
    // Hantera nulls
    if (valA === null || valA === undefined) return 1 * modifier
    if (valB === null || valB === undefined) return -1 * modifier
 
    if (valA < valB) return -1 * modifier
    if (valA > valB) return 1 * modifier
    return 0
  })
 
  return result
})
 
// Hitta alla unika blockerare
const blockersList = computed(() => {
  return sessions.value.filter(s => s.blocked_session_count > 0)
})
 
// Hämta alla sessioner som är blockerade av en specifik session vid ungefär samma tidpunkt
const getBlockedSessionsBy = (parentSession) => {
  if (!parentSession || !parentSession.session_id) return []
  
  const parentTime = new Date(parentSession.collection_time).getTime()
 
  return sessions.value.filter(s => {
    // 1. Måste peka på vår förälders SPID
    if (Number(s.blocking_session_id) !== Number(parentSession.session_id)) {
      return false
    }
 
    // 2. Tillåt en tidsskillnad på upp till 3 sekunder (3000 ms) för att hantera små variationer i insamlingen
    const childTime = new Date(s.collection_time).getTime()
    const timeDiff = Math.abs(parentTime - childTime)
    
    return timeDiff <= 3000
  })
}
 
// Expandera / Stäng rad
const toggleExpand = (session) => {
  const key = `${session.collection_time}-${session.session_id}`
  if (expandedRows.value.has(key)) {
    expandedRows.value.delete(key)
  } else {
    expandedRows.value.add(key)
  }
}
 
const isExpanded = (session) => {
  return expandedRows.value.has(`${session.collection_time}-${session.session_id}`)
}
 
// Sorterings-trigger
const setSort = (key) => {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value
  } else {
    sortKey.value = key
    sortDesc.value = true
  }
}
 
// Modal-hantering
const openSqlModal = (session) => {
  activeSqlModal.value = session
}
const closeSqlModal = () => {
  activeSqlModal.value = null
}
 
// Hjälpfunktioner för formatering
const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  const parsed = Number(num)
  if (isNaN(parsed)) return '0'
  return new Intl.NumberFormat('sv-SE').format(parsed)
}
 
// NY/KORRIGERAD: Formaterar datum och tid snyggt i tabellen
const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('sv-SE', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
 
const formatTime = (val) => {
  if (val === null || val === undefined) return '00:00:00'
  
  // Om värdet redan är en formaterad sträng (t.ex. "00 00:00:02.150" från sp_WhoIsActive)
  if (typeof val === 'string') {
    if (val.startsWith('00 ')) {
      return val.substring(3)
    }
    return val
  }
 
  // Fallback om det är millisekunder (ett tal)
  const ms = Number(val)
  if (isNaN(ms)) return '00:00:00'
 
  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
 
  const pad = (n) => n.toString().padStart(2, '0')
  
  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
 
const truncateString = (str, num) => {
  if (!str) return ''
  if (str.length <= num) return str
  return str.slice(0, num) + '...'
}
 
onMounted(() => {
  fetchActivity()
})
</script>
 
<style scoped>
.activity-monitor-container {
  padding: 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
 
/* Snygg badge för laddningstiden */
.query-duration-badge {
  display: inline-block;
  margin-left: 1rem;
  font-size: 0.8rem;
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}
 
/* Kort-bakgrunder som ärver globala variabler */
.card-bg {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: var(--shadow);
  transition: background-color 0.3s, border-color 0.3s;
}
 
.monitor-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
}
 
.section-title {
  font-size: 1.25rem;
  font-weight: 800;
  margin: 0 0 0.25rem 0;
  color: var(--text-title);
}
 
.section-subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0;
}
 
.control-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
 
/* 🕒 Tidsväljare styling */
.time-selector-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
 
.control-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
}
 
.select-input, .date-input {
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.5rem;
  border-radius: 8px;
  font-size: 0.875rem;
  outline: none;
}
 
.custom-time-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
 
.date-separator {
  font-size: 0.875rem;
  color: var(--text-muted);
}
 
.search-input {
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  width: 200px;
  outline: none;
  transition: border-color 0.2s;
}
 
.search-input:focus {
  border-color: #3b82f6;
}
 
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  user-select: none;
}
 
.btn-refresh {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background-color 0.2s;
}
 
.btn-refresh:hover {
  background-color: #2563eb;
}
 
.spin {
  animation: spin 1.5s linear infinite;
}
 
/* Tabell-styling */
.table-container {
  overflow-x: auto;
  padding: 0;
}
 
.activity-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;
}
 
.activity-table th {
  background-color: var(--bg-app);
  padding: 1rem;
  font-weight: 700;
  color: var(--text-muted);
  border-bottom: 2px solid var(--border-color);
  user-select: none;
}
 
.activity-table th.sortable {
  cursor: pointer;
}
 
.activity-table th.sortable:hover {
  color: var(--text-main);
}
 
.activity-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}
 
/* Rad-effekter för blockeringar */
.row-blocking {
  background-color: rgba(239, 68, 68, 0.05) !important;
}
.row-blocked {
  background-color: rgba(245, 158, 11, 0.05) !important;
}
.row-sleeping {
  opacity: 0.75;
}
.row-expanded {
  border-left: 4px solid #ef4444;
}
 
.spid-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
 
.spid-badge {
  background-color: var(--border-color);
  color: var(--text-main);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  width: fit-content;
  font-family: monospace;
}
 
.database-pill {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
}
 
.status-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
 
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-running { background-color: #22c55e; }
.status-suspended { background-color: #ef4444; }
.status-sleeping { background-color: #94a3b8; }
 
.wait-badge {
  background-color: #fef3c7;
  color: #d97706;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
}
 
.sql-preview-cell {
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  max-width: 300px;
  overflow: hidden;
}
 
.sql-preview-cell code {
  font-family: monospace;
  font-size: 0.75rem;
  white-space: nowrap;
}
 
.zoom-icon {
  position: absolute;
  right: 4px;
  bottom: 2px;
  font-size: 0.65rem;
  color: #3b82f6;
  opacity: 0;
  transition: opacity 0.2s;
}
 
.sql-preview-cell:hover .zoom-icon {
  opacity: 1;
}
 
/* ============================================================================
   STYLING FÖR NÄSTAD BLOCKERINGSVY
   ============================================================================ */
.badge-clickable {
  cursor: pointer;
  user-select: none;
  transition: transform 0.1s, background-color 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.badge-clickable:hover {
  background-color: #fca5a5 !important;
  color: #7f1d1d !important;
  transform: translateY(-1px);
}
.expand-indicator {
  font-size: 0.6rem;
  opacity: 0.8;
}
 
.row-nested-container {
  background-color: rgba(15, 23, 42, 0.15) !important;
}
.nested-table-cell {
  padding: 0 !important;
  border-bottom: 2px solid #ef4444 !important;
}
.nested-wrapper {
  padding: 1rem 1.5rem 1.5rem 4rem;
  border-left: 4px solid #ef4444;
  animation: slideDown 0.2s ease-out;
}
.nested-header {
  font-size: 0.85rem;
  color: #ef4444;
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.nested-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.nested-table th {
  padding: 0.6rem 1rem;
  font-size: 0.75rem;
  background-color: rgba(30, 41, 59, 0.4);
  border-bottom: 1px solid var(--border-color);
}
.nested-table td {
  padding: 0.6rem 1rem !important;
  border-bottom: 1px solid var(--border-color) !important;
}
.nested-row:hover {
  background-color: rgba(239, 68, 68, 0.04) !important;
}
.arrow-indicator {
  font-weight: bold;
  margin-right: 4px;
  color: #ef4444;
}
.nested-spid {
  font-size: 0.75rem;
  padding: 1px 6px;
}
 
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
 
/* Modaler */
.sql-modal {
  width: 700px !important;
}
 
.modal-body {
  padding: 1.5rem;
}
 
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
  background-color: var(--bg-app);
  padding: 1rem;
  border-radius: 8px;
}
 
.sql-code-block {
  background-color: #1e293b;
  color: #f1f5f9;
  padding: 1.5rem;
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
  text-align: left;
}
 
.sql-code-block code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
}
 
/* Varningar */
.alert-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
}
 
.alert-danger {
  background-color: #fef2f2;
  border: 1px solid #fee2e2;
  color: #991b1b;
}
 
#app.dark-theme .alert-danger {
  background-color: #7f1d1d;
  border-color: #b91c1c;
  color: #fecaca;
}
 
.badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
}
 
.badge-danger { background-color: #fee2e2; color: #991b1b; }
.badge-warning { background-color: #fef3c7; color: #d97706; }
.text-nowrap { white-space: nowrap; }
 
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
 
/* Snygg mörk tabell-styling */
.table-container.card-bg {
  background-color: var(--bg-card) !important;
  color: var(--text-main) !important;
}
 
.activity-table tbody tr {
  background-color: var(--bg-card) !important;
  color: var(--text-main) !important;
  transition: background-color 0.2s;
}
 
.activity-table tbody tr:hover {
  background-color: var(--border-color) !important;
}
 
#app.dark-theme .user-cell .font-bold {
  color: #f1f5f9 !important;
}
 
#app.dark-theme .user-cell .text-muted {
  color: #94a3b8 !important;
}
 
/* ============================================================================
   KORREKT MODAL-STYLING (Centrerad över allt annat)
   ============================================================================ */
 
/* Bakgrunds-overlay som täcker hela skärmen */
.specs-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(15, 23, 42, 0.75); /* Halvtransparent mörk bakgrund */
  backdrop-filter: blur(4px); /* Snygg suddighetseffekt på bakomliggande innehåll */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999; /* Säkerställ att den ligger ovanpå tabellen och menyn */
  padding: 2rem;
}
 
/* Själva modal-kortet */
.specs-modal-card.sql-modal {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  width: 800px;
  max-width: 90%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: modalFadeIn 0.2s ease-out;
}
 
/* Header-sektionen i modalen */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(30, 41, 59, 0.5);
}
 
.modal-header h4 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-title);
}
 
/* Stäng-knappen (X) */
.btn-close-modal {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s;
}
 
.btn-close-modal:hover {
  color: #ef4444; /* Röd färg vid hovring */
}
 
/* Innehållet i modalen */
.modal-body {
  padding: 1.5rem;
  overflow-y: auto; /* Gör så att man kan skrolla inuti modalen om koden är lång */
}
 
/* Meta-datan (Tid, databas, körtid etc) */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem 1.5rem;
  margin-bottom: 1.25rem;
  font-size: 0.85rem;
  background-color: var(--bg-app);
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
 
.meta-grid div {
  color: var(--text-main);
}
 
.meta-grid strong {
  color: var(--text-muted);
  margin-right: 4px;
}
 
/* SQL-kodblocket */
.sql-code-block {
  background-color: #0f172a !important; /* Extra mörk bakgrund för koden */
  border: 1px solid #334155;
  color: #f1f5f9;
  padding: 1.25rem;
  border-radius: 8px;
  max-height: 350px;
  overflow-y: auto;
  margin: 0;
  text-align: left;
}
 
.sql-code-block code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
}
 
/* En mjuk animation när modalen öppnas */
@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
 
.nested-empty-state {
  background-color: var(--bg-app);
  border: 1px dashed var(--border-color);
  padding: 1rem;
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.4;
}
</style>