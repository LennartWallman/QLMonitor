<template>
  <div id="app" :class="{ 'dark-theme': isDarkMode }">
    <!-- Header -->
    <header class="app-header">
      <div class="header-content">
        <div class="logo-section">
          <img src="/SQLDashboard.png" alt="S" class="logo-as-s" />
          <h1 class="app-title">
            <span class="title-ql">QL</span> <span class="title-monitor">Monitor</span>
          </h1>
        </div>
        
        <div class="header-actions">
          <!-- 👤 Visning av inloggad Windows-användare -->
          <div class="user-display-pill" :title="'Inloggad som ' + currentUser">
            <span class="user-icon">👤</span>
            <span class="user-name-text">{{ currentUser }}</span>
          </div>
 
          <!-- 👑 Endast synlig för SuperUsers -->
          <button 
            v-if="isSuperUser"
            @click="showUserAdmin = true" 
            class="btn-theme-toggle"
            title="Hantera användare (endast SuperUser)"
          >
            <span>⚙️</span>
          </button>
 
          <!-- 🌓 Tema-växlare (Mörkt/Ljust läge) -->
          <button 
            @click="toggleTheme" 
            class="btn-theme-toggle"
            :title="isDarkMode ? 'Byt till ljust läge' : 'Byt till mörkt läge'"
          >
            <span class="theme-icon">{{ isDarkMode ? '☀️' : '🌙' }}</span>
          </button>
 
          <!-- 🚨 Skicka testlarm till Teams -->
          <button 
            v-if="currentServer"
            @click="triggerTeamsTestAlert" 
            :disabled="isSendingAlert"
            class="btn-test-alert"
            :class="{ 'is-loading': isSendingAlert }"
            title="Skicka ett simulerat testlarm för denna server till Teams"
          >
            <span class="icon">🚨</span>
            <span>{{ isSendingAlert ? 'Skickar...' : 'Testa Teams' }}</span>
          </button>
 
          <!-- 🐛 Debug-widget (NY) -->
          <div class="server-info-widget">
            <div 
              class="info-pill" 
              @click="toggleDebugModal"
              title="Visa aktiva sessioner och debug-information"
            >
              <span class="info-icon">🐛</span>
              <span class="info-text">Debug</span>
            </div>
 
            <!-- MODAL: Visas ovanpå allt annat -->
            <div v-if="showDebugModal" class="specs-modal-overlay" @click.self="closeDebugModal">
              <div class="specs-modal-card app-modal-card" style="width: 550px; max-width: 95%;">
                <div class="modal-header">
                  <h4>🐛 Debug-information</h4>
                  <button class="btn-close-modal" @click="closeDebugModal">✕</button>
                </div>
                
                <div class="dropdown-body" v-if="debugInfo">
                  <!-- AKTIVA ANVÄNDARE -->
                  <div class="specs-section">
                    <h5>👤 Aktiva sessioner (2 min)</h5>
                    <div v-if="debugInfo.users && debugInfo.users.length > 0">
                      <div v-for="user in debugInfo.users" :key="user.username" class="spec-row" style="margin-bottom: 0.75rem;">
                        <span class="spec-label font-bold text-primary">{{ user.username }}</span>
                        <span class="spec-value text-small text-muted">
                          {{ user.currentAction || 'Aktiv' }}
                        </span>
                      </div>
                    </div>
                    <div class="text-muted text-small text-center" style="padding: 1rem 0;" v-else>
                      Inga aktiva användare registrerade.
                    </div>
                  </div>
   
                  <hr class="divider" />
   
                  <!-- SERVERSTATISTIK -->
                  <div class="specs-section">
                    <h5>⚙️ API Status</h5>
                    <div class="spec-row">
                      <span class="spec-label">Aktiva användare:</span>
                      <span class="spec-value">{{ debugInfo.count || 0 }} st</span>
                    </div>
                    <div class="spec-row" v-if="lastResponseTime !== null">
                      <!-- 👇 --- START: SVARSTIDSMÄTNING (SENASTE SVARSTID I DEBUG) --- -->
                      <span class="spec-label">Senaste svarstid (Global):</span>
                      <span class="spec-value text-success font-bold">{{ lastResponseTime }} ms</span>
                      <!-- 👆 --- END: SVARSTIDSMÄTNING (SENASTE SVARSTID I DEBUG) --- -->
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">Server Tid (UTC):</span>
                      <span class="spec-value font-mono text-small">{{ debugInfo.serverTimeUtc ? new Date(debugInfo.serverTimeUtc).toLocaleTimeString('sv-SE') : '-' }}</span>
                    </div>
                  </div>
 
                  <hr class="divider" />
 
                  <!-- 👇 --- START: SVARSTIDSMÄTNING (DE 10 SENASTE API-ANROPEN I TEMPLATE) --- -->
                  <div class="specs-section">
                    <h5>⏱️ De 10 senaste API-anropen</h5>
                    <div class="api-calls-table-container">
                      <table class="api-calls-table">
                        <thead>
                          <tr>
                            <th>Tid</th>
                            <th>Metod</th>
                            <th>Endpoint</th>
                            <th>Status</th>
                            <th>Svarstid</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="call in recentApiCalls" :key="call.timestamp + call.path">
                            <td class="time">{{ call.timestamp }}</td>
                            <td>
                              <span :class="['method-badge', call.method]">{{ call.method }}</span>
                            </td>
                            <td class="path" :title="call.path">{{ call.path }}</td>
                            <td>
                              <span :class="['status-badge', 'status-' + call.statusCode]">{{ call.statusCode }}</span>
                            </td>
                            <td class="duration">{{ call.durationMs }} ms</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <!-- 👆 --- END: SVARSTIDSMÄTNING (DE 10 SENASTE API-ANROPEN I TEMPLATE) --- -->
                </div>
                <div class="dropdown-body text-center text-muted" v-else-if="isLoadingDebug">
                  🔄 Laddar debug-information...
                </div>
                <div class="dropdown-body text-center text-danger" v-else>
                  ⚠️ Kunde inte hämta debug-information.
                </div>
              </div>
            </div>
          </div>
 
          <!-- 🖥️ Serverinfo-widget -->
          <div v-if="currentServer" class="server-info-widget">
            <div 
              class="info-pill" 
              @click="toggleSpecsDropdown"
            >
              <span class="info-icon">🖥️</span>
              <span class="info-text">Specifikationer</span>
            </div>
 
            <!-- MODAL: Visas ovanpå allt annat -->
            <div v-if="showSpecsDetails" class="specs-modal-overlay" @click.self="closeSpecsDetails">
              <div class="specs-modal-card app-modal-card">
                <div class="modal-header">
                  <h4>🖥️ Systemkonfiguration för {{ currentServer }}</h4>
                  <button class="btn-close-modal" @click="closeSpecsDetails">✕</button>
                </div>
                
                <div class="dropdown-body" v-if="serverSpecs">
                  <!-- HÅRDVARA -->
                  <div class="specs-section">
                    <h5>⚙️ Hårdvara</h5>
                    <div class="spec-row">
                      <span class="spec-label">Processorer:</span>
                      <span class="spec-value">{{ serverSpecs.hardware?.logicalCPUs }} vCPUs ({{ serverSpecs.hardware?.physicalCores }} kärnor)</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">RAM-minne:</span>
                      <span class="spec-value">{{ serverSpecs.hardware?.totalRAM_GB }} GB</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">SQL Max Minne:</span>
                      <span class="spec-value">{{ serverSpecs.hardware?.maxSqlMemory_GB }} GB</span>
                    </div>
                  </div>
   
                  <hr class="divider" />
   
                  <!-- SYSTEM & VERSIONER -->
                  <div class="specs-section">
                    <h5>🖥️ System & Versioner</h5>
                    <div class="spec-row">
                      <span class="spec-label">SQL Version:</span>
                      <span class="spec-value" :title="serverSpecs.software?.sqlEdition">{{ serverSpecs.software?.sqlVersion }}</span>
                    </div>
                    <div class="spec-row" v-if="serverSpecs.software?.sqlEdition">
                      <span class="spec-label">SQL Edition:</span>
                      <span class="spec-value text-primary font-bold">{{ serverSpecs.software?.sqlEdition }}</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">OS Version:</span>
                      <span class="spec-value">{{ serverSpecs.software?.osVersion }}</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">Uptime:</span>
                      <span class="spec-value text-success font-bold">{{ serverSpecs.software?.uptimeDays }} dagar</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">Collation:</span>
                      <span class="spec-value font-mono text-small">{{ serverSpecs.software?.sqlCollation }}</span>
                    </div>
                  </div>   
                  <hr class="divider" />
   
                  <!-- DISKAR -->
                  <div class="specs-section">
                    <h5>💾 Diskar</h5>
                    <div v-for="disk in serverSpecs.disks" :key="disk.Drive" class="disk-spec-item">
                      <div class="disk-meta">
                        <span class="font-bold">{{ disk.Drive }}</span>
                        <span>{{ disk.FreeGB }} GB ledigt av {{ disk.TotalGB }} GB</span>
                      </div>
                      <div class="progress-bar-bg">
                        <div 
                          class="progress-bar-fill" 
                          :style="{ width: (100 - disk.PercentFree) + '%' }" 
                          :class="disk.PercentFree < 15 ? 'bg-danger' : disk.PercentFree < 30 ? 'bg-warning' : 'bg-success'"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="dropdown-body text-center text-muted" v-else-if="isLoadingSpecs">
                  🔄 Laddar serverkonfiguration...
                </div>
                <div class="dropdown-body text-center text-danger" v-else>
                  ⚠️ Kunde inte hämta specifikationer.
                </div>
              </div>
            </div>
          </div>
 
          <!-- 🚀 Serverhälsa-widget -->
          <div v-if="currentServer" class="server-health-widget">
            <div 
              class="status-pill" 
              :class="healthStatusClass"
              @click="showHealthDetails = !showHealthDetails"
            >
              <span class="pulse-dot"></span>
              <span class="status-text">Hälsa: {{ healthLabel }}</span>
            </div>
 
            <!-- Dropdown-panel vid klick -->
            <div v-if="showHealthDetails" class="health-dropdown" v-click-outside="closeHealthDetails">
              <div class="dropdown-header">
                <h4>Hälsostatus för {{ currentServer }}</h4>
              </div>
              
              <div class="dropdown-body">
                <!-- BLOCKERINGAR -->
                <div class="health-section">
                  <div class="section-title">
                    <span>🔒 Blockeringar:</span>
                    <span :class="activeBlockings.length > 0 ? 'badge-danger' : 'badge-success'">
                      {{ activeBlockings.length }} st
                    </span>
                  </div>
                  <div v-if="activeBlockings.length > 0" class="blocking-list">
                    <div v-for="block in activeBlockings" :key="block.SessionId" class="blocking-item">
                      <strong>SPID {{ block.SessionId }}</strong> blockeras av <strong>SPID {{ block.BlockingSessionId }}</strong>
                      <div class="query-preview" :title="block.ActiveQuery">
                        {{ block.ActiveQuery || 'Ingen SQL-text tillgänglig' }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-success text-small">Inga aktiva blockeringar just nu.</div>
                </div>
 
                <hr class="divider" />
 
                <!-- TEMPDB -->
                <div class="health-section">
                  <div class="section-title">
                    <span>💾 TempDB Status:</span>
                    <span :class="tempDbPercent > 80 ? 'text-danger font-bold' : tempDbPercent > 50 ? 'text-warning font-bold' : 'text-success'">
                      {{ tempDbPercent }}%
                    </span>
                  </div>
                  <div class="progress-bar-bg">
                    <div 
                      class="progress-bar-fill" 
                      :style="{ width: tempDbPercent + '%' }" 
                      :class="tempDbPercent > 80 ? 'bg-danger' : tempDbPercent > 50 ? 'bg-warning' : 'bg-success'"
                    ></div>
                  </div>
                  <div v-if="tempDb" class="tempdb-details">
                    <span>Använt: {{ (tempDb.UsedSizeMB / 1024).toFixed(2) }} GB</span>
                    <span>Totalt: {{ (tempDb.TotalSizeMB / 1024).toFixed(2) }} GB</span>
                  </div>
                  <div v-else class="text-muted text-small">Väntar på TempDB-data...</div>
                </div>
              </div>
            </div>
          </div>
 
          <ServerSelector @serverChange="handleServerChange" />
        </div>
      </div>
    </header>
 
    <!-- Navigation -->
    <nav class="app-nav">
      <div class="nav-content">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['nav-tab', { active: activeTab === tab.id }]"
        >
          {{ tab.label }}
        </button>
      </div>
    </nav>
 
    <!-- Main Content -->
    <main class="app-main">
      <!-- Om vi är på den nya systempuls-fliken, vill vi visa den i en snygg container med lite padding -->
      <div v-if="activeTab === 'heartbeats'" class="heartbeat-tab-container">
        <div class="tab-header">
          <h2>💓 Systempuls & Applikationsstatus</h2>
          <p class="tab-subtitle">Realtidsövervakning av bakgrundstjänster och integrationsmotorer anslutna till SQLMonitor.</p>
        </div>
        <component 
          :is="currentTabComponent"
          :server-name="currentServer"
          :selected-server="currentServer"
        />
      </div>
      
      <!-- Övriga flikar visas som vanligt -->
      <component 
        v-else
        :is="currentTabComponent"
        :server-name="currentServer"
        :selected-server="currentServer"
      />
    </main>
 
    <!-- 🏷️ NYTT: Diskret versionsvattenstämpel (RC1) -->
    <div class="app-watermark">
      SQL-Mon 0.9 RC1
    </div>
 
    <!-- 👑 Användarhanterings-modal (endast SU) -->
    <UserAdminModal 
      v-if="showUserAdmin"
      @close="showUserAdmin = false" 
    />
  </div>
</template>
 
<script setup>
import { ref, computed, provide, watch, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
axios.defaults.withCredentials = true;
import ServerSelector from '@/components/ServerSelector.vue'
import JobList from '@/components/JobList.vue'
import JobTimeline from '@/components/JobTimeline.vue'
import ActivityMonitor from '@/components/ActivityMonitor.vue'
import DiskView from '@/views/DiskView.vue'
import MdwAnalysis from '@/views/MdwAnalysis.vue'
import ReportsView from '@/views/ReportsView.vue'
import Heartbeat from '@/components/Heartbeat.vue'
import UserAdminModal from '@/components/UserAdminModal.vue'
import { socketService } from '@/services/socketService'
import { useResponseTime } from '@/composables/useResponseTime';
const { lastResponseTime, recentApiCalls, fetchRecentCalls, updateResponseTime } = useResponseTime();
 
// State
const activeTab = ref('jobs')
const currentServer = ref(null)
const socketConnected = ref(false)
const isSendingAlert = ref(false)
const currentUser = ref('Laddar...')
 
// 👑 SuperUser-hantering
const isSuperUser = ref(false)
const showUserAdmin = ref(false)
 
// 🌓 Tema-tillstånd
const isDarkMode = ref(false)
 
// 🚀 Realtids-hälsodata
const activeBlockings = ref([])
const tempDb = ref(null)
const showHealthDetails = ref(false)
 
// 🖥️ Server specifikationer state
const serverSpecs = ref(null)
const showSpecsDetails = ref(false)
const isLoadingSpecs = ref(false)
 
// 🐛 Debug state (NYTT)
const showDebugModal = ref(false)
const debugInfo = ref(null)
const isLoadingDebug = ref(false)
let debugInterval = null
 
// Tabs configuration
const tabs = [
  { id: 'jobs', label: 'Jobbkö', component: JobList },
  { id: 'timeline', label: 'Tidslinje (24h)', component: JobTimeline },
  { id: 'activity', label: 'Aktivitetsmonitor', component: ActivityMonitor },
  { id: 'disks', label: 'Disk-övervakning', component: DiskView },
  { id: 'mdw', label: 'MDW Analys', component: MdwAnalysis },
  { id: 'reports', label: 'Rapporter', component: ReportsView },
  { id: 'heartbeats', label: 'Systempuls 💓', component: Heartbeat }
]
 
// Computed
const currentTabComponent = computed(() => {
  const tab = tabs.find(t => t.id === activeTab.value)
  return tab ? tab.component : JobList
})
 
const tempDbPercent = computed(() => {
  return tempDb.value ? Math.round(tempDb.value.UsedPercent) : 0
})
 
// Dynamisk färgklass för hälsoknappen
const healthStatusClass = computed(() => {
  if (activeBlockings.value.length > 0) {
    return 'status-danger'
  }
  if (tempDbPercent.value > 80) {
    return 'status-warning'
  }
  return 'status-success'
})
 
const healthLabel = computed(() => {
  if (activeBlockings.value.length > 0) return 'Blockeringar!'
  if (tempDbPercent.value > 80) return 'TempDB full!'
  return 'OK'
})
 
// Provide server state and theme state to child components
provide('selectedServer', currentServer)
provide('socketConnected', socketConnected)
provide('isDarkMode', isDarkMode)
 
// Watch for tab changes
watch(activeTab, (newTab) => {
  console.log('🔄 Aktiv flik ändrad till:', newTab)
})
 
// Watch for server changes
watch(currentServer, (newServer, oldServer) => {
  if (oldServer && oldServer !== newServer) {
    console.log(`🔄 Server ändrad: ${oldServer} → ${newServer}`)
    socketService.unsubscribeFromServer(oldServer)
    activeBlockings.value = []
    tempDb.value = null
    showHealthDetails.value = false
    
    // Nollställ serverinfo vid serverbyte
    serverSpecs.value = null
    showSpecsDetails.value = false
  }
  
  if (newServer && socketConnected.value) {
    console.log(`📡 Prenumererar på server: ${newServer}`)
    socketService.subscribeToServer(newServer)
  }
})
 
// Funktioner
const fetchServerSpecs = async (server) => {
  if (!server) return
  isLoadingSpecs.value = true
  try {
    const response = await axios.get(`http://sllbi01:3003/api/server/${server}/specs`)
    serverSpecs.value = response.data
  } catch (error) {
    console.error('Misslyckades att hämta serverspecifikationer:', error)
    serverSpecs.value = null
  } finally {
    isLoadingSpecs.value = false
  }
}
 
const toggleSpecsDropdown = () => {
  showSpecsDetails.value = !showSpecsDetails.value
  if (showSpecsDetails.value && !serverSpecs.value) {
    fetchServerSpecs(currentServer.value)
  }
}
 
const closeSpecsDetails = () => {
  showSpecsDetails.value = false
}
 
// Kolla om inloggad användare är SuperUser (styr om admin-knappen visas)
const checkSuperUserRole = async () => {
  try {
    const response = await axios.get('http://sllbi01:3003/api/admin/check-role')
    isSuperUser.value = response.data.role === 'SU'
  } catch (error) {
    console.error('Kunde inte kontrollera SU-roll:', error)
    isSuperUser.value = false
  }
}
 
// Hämta debug-info från API (NYTT)
const fetchDebugInfo = async () => {
  try {
    const response = await axios.get('http://sllbi01:3003/api/debug/debug-info')
    debugInfo.value = response.data
  } catch (error) {
    console.error('Misslyckades att hämta debug-info:', error)
  }
}
 
const toggleDebugModal = async () => {
  showDebugModal.value = !showDebugModal.value
  if (showDebugModal.value) {
    isLoadingDebug.value = true
    await fetchDebugInfo()
    
    // 👇 --- START: SVARSTIDSMÄTNING (HÄMTA HISTORIK VID ÖPPNING) ---
    await fetchRecentCalls('http://sllbi01:3003')
    // 👆 --- END: SVARSTIDSMÄTNING (HÄMTA HISTORIK VID ÖPPNING) ---
 
    isLoadingDebug.value = false
    
    // Starta polling var 5:e sekund för realtidsuppdatering av sessioner och API-anrop
    debugInterval = setInterval(async () => {
      await fetchDebugInfo()
      // 👇 --- START: SVARSTIDSMÄTNING (POLLA LOGGAR) ---
      await fetchRecentCalls('http://sllbi01:3003')
      // 👆 --- END: SVARSTIDSMÄTNING (POLLA LOGGAR) ---
    }, 5000)
  } else {
    clearInterval(debugInterval)
  }
}
 
const closeDebugModal = () => {
  showDebugModal.value = false
  clearInterval(debugInterval)
}
 
const handleServerChange = (newServer) => {
  const serverName = typeof newServer === 'string' 
    ? newServer 
    : newServer?.ServerName || newServer?.serverName
  
  if (!serverName || typeof serverName !== 'string') {
    console.log('❌ Ogiltigt servernamn:', newServer)
    return
  }
  
  console.log('🔄 [handleServerChange] Bytte till server:', serverName)
  currentServer.value = serverName
}
 
const closeHealthDetails = () => {
  showHealthDetails.value = false
}
 
const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value
  localStorage.setItem('sql-monitor-theme', isDarkMode.value ? 'dark' : 'light')
}
 
const triggerTeamsTestAlert = async () => {
  if (!currentServer.value) return
  
  isSendingAlert.value = true
  try {
    const response = await axios.post('http://sllbi01:3003/api/test-teams-alert', {
      serverName: currentServer.value
    })
    alert(`✅ ${response.data.message || 'Testlarm skickat till Teams!'}`)
  } catch (error) {
    console.error('Misslyckades att trigga testlarm:', error)
    alert('❌ Det gick inte att skicka testlarmet. Kontrollera att din backend är igång på port 3003.')
  } finally {
    isSendingAlert.value = false
  }
}
 
const setupSocketListeners = () => {
  socketService.on('connect', () => {
    console.log('✅ Socket ansluten')
    socketConnected.value = true
    
    if (currentServer.value) {
      socketService.subscribeToServer(currentServer.value)
    }
  })
 
  socketService.on('disconnect', (reason) => {
    console.log('❌ Socket frånkopplad:', reason)
    socketConnected.value = false
  })
 
  socketService.on('connect_error', (error) => {
    console.error('❌ Socket anslutningsfel:', error.message)
    socketConnected.value = false
  })
 
  socketService.on('reconnect', (attemptNumber) => {
    console.log('🔄 Återansluten efter', attemptNumber, 'försök')
    socketConnected.value = true
    
    if (currentServer.value) {
      socketService.subscribeToServer(currentServer.value)
    }
  })
 
  socketService.on('serverHealthUpdate', (data) => {
    if (data.serverName === currentServer.value) {
      activeBlockings.value = data.blockings || []
      tempDb.value = data.tempDb || null
    }
  })
 
  socketService.on('fullStatusUpdate', (data) => {
    console.log('📦 fullStatusUpdate mottagen')
    const serverData = data[currentServer.value] || data
    if (serverData) {
      activeBlockings.value = serverData.blockings || []
      tempDb.value = serverData.tempDb || null
    }
  })
}
 
const cleanupSocketListeners = () => {
  socketService.off('connect')
  socketService.off('disconnect')
  socketService.off('connect_error')
  socketService.off('reconnect')
  socketService.off('serverHealthUpdate')
  socketService.off('fullStatusUpdate')
}
 
const vClickOutside = {
  mounted(el, binding) {
    el.clickOutsideEvent = (event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event)
      }
    }
    document.body.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el) {
    document.body.removeEventListener('click', el.clickOutsideEvent)
  }
}
 
const fetchWindowsUser = async () => {
  try {
    const response = await axios.get('http://sllbi01:3003/api/auth/whoami')
    currentUser.value = response.data.username
    localStorage.setItem('sql-monitor-username', response.data.username)
    console.log('👤 Identifierad Windows-användare:', response.data.username)
  } catch (error) {
    console.error('Kunde inte identifiera Windows-användare:', error)
    currentUser.value = 'Gäst'
  }
}
 
const handleQueryDurationUpdate = (event) => {
  if (event.detail && event.detail.durationMs) {
    lastResponseTime.value = event.detail.durationMs
  }
}
 
let presenceInterval = null
 
async function trackPresence() {
  try {
    await axios.get('http://sllbi01:3003/api/whoami-track')
  } catch (e) {
    console.warn('Kunde inte rapportera närvaro:', e)
  }
}
 
onMounted(() => {
  console.log('✅ App monterad')
  
  fetchWindowsUser()
  checkSuperUserRole()
 
  trackPresence()
  presenceInterval = setInterval(trackPresence, 60000)
 
  axios.interceptors.response.use(response => {
    if (response.headers) {
      updateResponseTime(response.headers);
    }
    return response;
  }, error => {
    if (error.response && error.response.headers) {
      updateResponseTime(error.response.headers);
    }
    return Promise.reject(error);
  });
 
  window.addEventListener('sql-query-duration-updated', handleQueryDurationUpdate)
  
  const savedTheme = localStorage.getItem('sql-monitor-theme')
  if (savedTheme === 'dark') {
    isDarkMode.value = true
  }
 
  socketService.connect()
  setupSocketListeners()
  socketConnected.value = true
})
 
onBeforeUnmount(() => {
  clearInterval(presenceInterval)
  console.log('👋 App avmonteras')
  cleanupSocketListeners()
  clearInterval(debugInterval)
  window.removeEventListener('sql-query-duration-updated', handleQueryDurationUpdate)
  
  if (currentServer.value) {
    socketService.unsubscribeFromServer(currentServer.value)
  }
  
  socketService.disconnect()
})
</script>
 
<style scoped>
/* 👇 --- START: SVARSTIDSMÄTNING (CSS-STYLING FOR LOGG-TABELL OCH BADGES) --- */
.api-calls-table-container {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 10px;
  max-height: 250px;
  overflow-y: auto;
}
#app:not(.dark-theme) .api-calls-table-container {
  background: #f8fafc;
  border-color: #e2e8f0;
}
.api-calls-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  text-align: left;
}
.api-calls-table th {
  background: #1e293b;
  color: #94a3b8;
  padding: 6px 10px;
  font-weight: 600;
  position: sticky;
  top: 0;
}
#app:not(.dark-theme) .api-calls-table th {
  background: #e2e8f0;
  color: #475569;
}
.api-calls-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #1e293b;
  color: #cbd5e1;
}
#app:not(.dark-theme) .api-calls-table td {
  border-bottom-color: #e2e8f0;
  color: #334155;
}
.method-badge {
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: bold;
  font-size: 9px;
}
.method-badge.GET { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.method-badge.POST { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
 
.status-badge {
  font-weight: 600;
}
.status-badge.status-200 { color: #10b981; }
.status-badge.status-500 { color: #ef4444; }
 
.duration {
  font-family: monospace;
  font-weight: bold;
  color: #38bdf8;
}
.path {
  font-family: monospace;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 👆 --- END: SVARSTIDSMÄTNING (CSS-STYLING FOR LOGG-TABELL OCH BADGES) --- */
 
/* ============================================================================
   🎨 THEME VARIABLES (Hanterar både ljust och mörkt läge)
   ============================================================================ */
#app {
  --bg-app: #f9fafb;
  --bg-card: #ffffff;
  --bg-header: #ffffff;
  --border-color: #e5e7eb;
  --text-main: #1f2937;
  --text-muted: #6b7280;
  --text-title: #1e293b;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
 
  min-height: 100vh;
  background: var(--bg-app);
  color: var(--text-main);
  display: flex;
  flex-direction: column;
  transition: background-color 0.3s ease, color 0.3s ease;
  position: relative; /* För vattenstämpeln */
}
 
/* Spara din befintliga CSS-kod nedan oförändrad */
#app.dark-theme {
  --bg-app: #0f172a; /* Slate 900 */
  --bg-card: #1e293b; /* Slate 800 */
  --bg-header: #1e293b;
  --border-color: #334155; /* Slate 700 */
  --text-main: #f1f5f9; /* Slate 100 */
  --text-muted: #94a3b8; /* Slate 400 */
  --text-title: #ffffff;
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}
 
.app-header {
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow);
  padding: 1rem 2rem;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}
 
.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
 
.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
 
/* 👤 Användar-pill styling */
.user-display-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.825rem;
  font-weight: 600;
  color: var(--text-main);
  user-select: none;
}
 
.logo-section {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}
 
.logo-as-s {
  height: 46px;
  width: auto;
  object-fit: contain;
  /* Gör vit bakgrund transparent i ljust läge */
  mix-blend-mode: multiply; 
  margin-right: -4px;
  transition: filter 0.3s ease;
}
 
#app.dark-theme .logo-as-s {
  filter: invert(1) hue-rotate(180deg) brightness(1.1) contrast(1.1);
  mix-blend-mode: screen;
}
 
.app-title {
  font-size: 1.875rem;
  font-weight: 800;
  margin: 0;
  display: flex;
  align-items: center;
  letter-spacing: -0.5px;
  line-height: 1;
}
 
.title-ql {
  background: linear-gradient(135deg, #3b82f6 0%, #00a2e8 100%);
  display: inline-block;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: #3b82f6;
}
 
.title-monitor {
  color: var(--text-title);
  margin-left: 0.3rem;
  transition: color 0.3s ease;
}
 
.app-nav {
  background: var(--bg-card);
  border-bottom: 2px solid var(--border-color);
  padding: 0 2rem;
  transition: background-color 0.3s ease, border-color 0.3s ease}
 
.nav-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  gap: 0.5rem;
}
 
.nav-tab {
  padding: 1rem 1.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
 
.nav-tab:hover {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}
 
.nav-tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}
 
.app-main {
  flex: 1;
  overflow-y: auto;
}
 
.heartbeat-tab-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}
 
.tab-header {
  margin-bottom: 1.5rem;
}
 
.tab-header h2 {
  margin: 0 0 6px 0;
  font-size: 22px;
  color: var(--text-title);
}
 
.tab-header p {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}
 
.btn-theme-toggle {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.5rem;
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 1.1rem;
}
 
.btn-theme-toggle:hover {
  transform: scale(1.05);
  background: var(--border-color);
}
 
.app-watermark {
  position: fixed;
  bottom: 12px;
  right: 16px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  opacity: 0.4;
  pointer-events: none;
  z-index: 9999;
  letter-spacing: 0.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  transition: opacity 0.2s ease;
}
 
#app:hover .app-watermark {
  opacity: 0.7;
}
 
.btn-test-alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}
 
#app.dark-theme .btn-test-alert {
  background-color: #451a03;
  color: #fecaca;
  border-color: #7f1d1d;
}
 
.btn-test-alert:hover:not(:disabled) {
  background-color: #fee2e2;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
 
#app.dark-theme .btn-test-alert:hover:not(:disabled) {
  background-color: #7f1d1d;
}
 
.btn-test-alert:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
 
.btn-test-alert.is-loading .icon {
  animation: spin 1s linear infinite;
}
 
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
 
.server-health-widget {
  position: relative;
  display: inline-block;
}
 
.status-pill {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;
  transition: all 0.2s ease;
  user-select: none;
}
 
.status-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
 
.status-success {
  background-color: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}
#app.dark-theme .status-success {
  background-color: #064e3b;
  color: #a7f3d0;
  border-color: #047857;
}
.status-success .pulse-dot { background-color: #22c55e; }
 
.status-warning {
  background-color: #fffbeb;
  color: #92400e;
  border: 1px solid #fef3c7;
}
#app.dark-theme .status-warning {
  background-color: #78350f;
  color: #fde68a;
  border-color: #d97706;
}
.status-warning .pulse-dot { background-color: #f59e0b; }
 
.status-danger {
  background-color: #fef2f2;
  color: #991b1b;
  border: 1px solid #fee2e2;
}
#app.dark-theme .status-danger {
  background-color: #7f1d1d;
  color: #fecaca;
  border-color: #b91c1c;
}
.status-danger .pulse-dot { 
  background-color: #ef4444; 
  animation: pulse 1.5s infinite;
}
 
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}
 
@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
 
.health-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  width: 340px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  z-index: 1000;
  color: var(--text-main);
  text-align: left;
  overflow: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}
 
.dropdown-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-app);
}
 
.dropdown-header h4 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-title);
}
 
.dropdown-body {
  padding: 1rem;
}
 
.health-section {
  margin-bottom: 0.5rem;
}
 
.section-title {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}
 
.divider {
  border: 0;
  border-top: 1px solid var(--border-color);
  margin: 1rem 0;
}
 
.progress-bar-bg {
  height: 8px;
  background-color: var(--bg-app);
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 6px;
}
 
.progress-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
 
.bg-success { background-color: #22c55e; }
.bg-warning { background-color: #f59e0b; }
.bg-danger { background-color: #ef4444; }
 
.tempdb-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-muted);
}
 
.blocking-list {
  max-height: 140px;
  overflow-y: auto;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 0.75rem;
  margin-top: 6px;
}
 
#app.dark-theme .blocking-list {
  background-color: #451a03;
  border-color: #7f1d1d;
}
 
.blocking-item {
  font-size: 0.75rem;
  margin-bottom: 8px;
  border-bottom: 1px solid #fee2e2;
  padding-bottom: 6px;
}
 
#app.dark-theme .blocking-item {
  border-bottom-color: #7f1d1d;
}
 
.blocking-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
 
.query-preview {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background-color: #fca5a5;
  color: #7f1d1d;
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.7rem;
}
 
#app.dark-theme .query-preview {
  background-color: #7f1d1d;
  color: #fecaca;
}
 
.text-success { color: #166534; }
#app.dark-theme .text-success { color: #4ade80; }
.text-danger { color: #991b1b; }
#app.dark-theme .text-danger { color: #fca5a5; }
.text-warning { color: #92400e; }
#app.dark-theme .text-warning { color: #fde68a; }
.text-muted { color: var(--text-muted); }
.text-small { font-size: 0.75rem; }
.font-bold { font-weight: 700; }
 
.badge-danger {
  background-color: #fee2e2;
  color: #991b1b;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
}
 
#app.dark-theme .badge-danger {
  background-color: #7f1d1d;
  color: #fecaca;
}
 
.badge-success {
  background-color: #dcfce7;
  color: #15803d;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
}
 
#app.dark-theme .badge-success {
  background-color: #064e3b;
  color: #a7f3d0;
}
 
.server-info-widget {
  display: inline-block;
}
 
.info-pill {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;
  transition: all 0.2s ease;
  user-select: none;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}
 
.info-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  background-color: var(--border-color);
}
 
.info-icon {
  margin-right: 6px;
}
 
.specs-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
}
 
.specs-modal-card {
  width: 420px;
  max-width: 90%;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  animation: modalFadeIn 0.2s ease-out;
}
 
.app-modal-card {
  border: 1px solid #3b82f6 !important;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 
              0 10px 10px -5px rgba(0, 0, 0, 0.15),
              0 0 15px rgba(59, 130, 246, 0.15) !important;
}
 
@keyframes modalFadeIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
 
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-app);
}
 
.modal-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-title);
}
 
.btn-close-modal {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  transition: all 0.2s;
}
 
.btn-close-modal:hover {
  background-color: var(--border-color);
  color: var(--text-main);
}
 
.specs-section {
  padding: 0.25rem 0;
}
 
.specs-section h5 {
  margin: 0 0 0.75rem 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
 
.spec-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}
 
.spec-label {
  color: var(--text-muted);
}
 
.spec-value {
  font-weight: 600;
}
 
.disk-spec-item {
  margin-bottom: 0.75rem;
}
 
.disk-spec-item:last-child {
  margin-bottom: 0;
}
 
.disk-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  margin-bottom: 4px;
}
 
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
 
@media (max-width: 768px) {
  .app-header {
    padding: 1rem;
  }
 
  .header-content {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }
 
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
 
  .app-nav {
    padding: 0 1rem;
  }
 
  .nav-content {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
 
  .nav-tab {
    padding: 0.875rem 1.25rem;
    font-size: 0.875rem;
  }
 
  .app-title {
    font-size: 1.5rem;
  }
}
 
@media (max-width: 480px) {
  .nav-tab {
    padding: 0.75rem 1rem;
  }
}
</style>