<!-- App.vue - KOMPLETT UPPDATERAD VERSION -->
<template>
  <div id="app">
    <!-- Header -->
    <header class="app-header">
      <div class="header-content">
        <div class="logo-section">
          <div class="logo-icon">🗄️</div>
          <h1 class="app-title">SQL Monitor</h1>
        </div>
        
        <ServerSelector @serverChange="handleServerChange" />
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
      <!-- ✅ Skickar currentServer som props till alla komponenter -->
      <component 
        :is="currentTabComponent"
        :server-name="currentServer"
        :selected-server="currentServer"
      />
    </main>
  </div>
</template>
 
<script setup>
import { ref, computed, provide, watch, onMounted, onBeforeUnmount } from 'vue'
import ServerSelector from '@/components/ServerSelector.vue'
import JobList from '@/components/JobList.vue'
import ActivityMonitor from '@/components/ActivityMonitor.vue'
import DiskView from '@/views/DiskView.vue'
import MdwAnalysis from '@/views/MdwAnalysis.vue'
import { socketService } from '@/services/socketService'
 
// State
const activeTab = ref('jobs')
const currentServer = ref(null)
const socketConnected = ref(false)
 
// Tabs configuration
const tabs = [
  { id: 'jobs', label: 'Jobbkö', component: JobList },
  { id: 'activity', label: 'Aktivitetsmonitor', component: ActivityMonitor },
  { id: 'disks', label: 'Disk-övervakning', component: DiskView },
  { id: 'mdw', label: 'MDW Analys', component: MdwAnalysis }
]
 
// Computed
const currentTabComponent = computed(() => {
  const tab = tabs.find(t => t.id === activeTab.value)
  return tab ? tab.component : JobList
})
 
// Provide server state to child components
provide('selectedServer', currentServer)
provide('socketConnected', socketConnected)
 
// Watch for tab changes
watch(activeTab, (newTab) => {
  console.log('🔄 Aktiv flik ändrad till:', newTab)
})
 
// Watch for server changes
watch(currentServer, (newServer, oldServer) => {
  if (oldServer && oldServer !== newServer) {
    console.log(`🔄 Server ändrad: ${oldServer} → ${newServer}`)
    socketService.unsubscribeFromServer(oldServer)
  }
  
  if (newServer && socketConnected.value) {
    console.log(`📡 Prenumererar på server: ${newServer}`)
    socketService.subscribeToServer(newServer)
  }
})
 
// Handle server change from ServerSelector
const handleServerChange = (newServer) => {
  // Hantera både objekt och string
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
 
// Socket event listeners
const setupSocketListeners = () => {
  // Connection events
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
 
  socketService.on('reconnect_attempt', (attemptNumber) => {
    console.log('🔄 Återanslutningsförsök', attemptNumber)
  })
 
  socketService.on('reconnect_error', (error) => {
    console.error('❌ Återanslutningsfel:', error.message)
  })
 
  socketService.on('reconnect_failed', () => {
    console.error('❌ Återanslutning misslyckades')
  })
 
  // Data events
  socketService.on('fullStatusUpdate', (data) => {
    console.log('📦 fullStatusUpdate mottagen')
  })
 
  socketService.on('activeQueriesUpdate', (data) => {
    // Hanteras av ActivityMonitor
  })
 
  socketService.on('performanceUpdate', (data) => {
    // Hanteras av ActivityMonitor
  })
 
  socketService.on('jobStatusUpdate', (data) => {
    // Hanteras av JobList
  })
 
  socketService.on('diskStatusUpdate', (data) => {
    // Hanteras av DiskView
  })
 
  // Error events
  socketService.on('error', (error) => {
    console.error('❌ Socket-fel:', error)
  })
 
  socketService.on('subscription_error', (error) => {
    console.error('❌ Prenumerationsfel:', error)
  })
}
 
// Cleanup socket listeners
const cleanupSocketListeners = () => {
  socketService.off('connect')
  socketService.off('disconnect')
  socketService.off('connect_error')
  socketService.off('reconnect')
  socketService.off('reconnect_attempt')
  socketService.off('reconnect_error')
  socketService.off('reconnect_failed')
  socketService.off('fullStatusUpdate')
  socketService.off('activeQueriesUpdate')
  socketService.off('performanceUpdate')
  socketService.off('jobStatusUpdate')
  socketService.off('diskStatusUpdate')
  socketService.off('error')
  socketService.off('subscription_error')
}
 
// Lifecycle hooks
onMounted(() => {
  console.log('✅ App monterad')
  socketService.connect()
  setupSocketListeners()
  socketConnected.value = true
})
 
onBeforeUnmount(() => {
  console.log('👋 App avmonteras')
  cleanupSocketListeners()
  
  if (currentServer.value) {
    socketService.unsubscribeFromServer(currentServer.value)
  }
  
  socketService.disconnect()
})
</script>
 
<style scoped>
/* ============================================ */
/* GLOBAL LAYOUT */
/* ============================================ */
#app {
  min-height: 100vh;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
}
 
/* ============================================ */
/* HEADER */
/* ============================================ */
.app-header {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 1rem 2rem;
}
 
.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
 
.logo-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
 
.logo-icon {
  font-size: 2rem;
}
 
.app-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}
 
/* ============================================ */
/* NAVIGATION */
/* ============================================ */
.app-nav {
  background: white;
  border-bottom: 2px solid #e5e7eb;
  padding: 0 2rem;
}
 
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
  color: #6b7280;
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
 
/* ============================================ */
/* MAIN CONTENT */
/* ============================================ */
.app-main {
  flex: 1;
  overflow-y: auto;
}
 
/* ============================================ */
/* RESPONSIV DESIGN */
/* ============================================ */
@media (max-width: 768px) {
  .app-header {
    padding: 1rem;
  }
 
  .header-content {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
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
    font-size: 1.25rem;
  }
 
  .logo-icon {
    font-size: 1.5rem;
  }
}
 
@media (max-width: 480px) {
  .nav-tab {
    padding: 0.75rem 1rem;
  }
}
</style>