<!-- Fil: src/components/Heartbeat.vue (GENERISK ÖVERVAKNING AV SYSTEMPULSAR / HEARTBEATS) -->
<template>
  <div class="heartbeats-grid">
    <div 
      v-for="system in systems" 
      :key="system.systemName"
      class="heartbeat-card" 
      :class="{ 'dark-theme': isDarkMode, [system.healthStatus.toLowerCase()]: true }"
    >
      <div class="card-header">
        <div class="system-info">
          <div class="title-row">
            <h3>💓 {{ system.systemName }}</h3>
            <span class="version-badge">v{{ system.appVersion }}</span>
          </div>
          <!-- 🖥️ Servernamn visas här under systemnamnet om det finns tillgängligt -->
          <div 
            v-if="system.serverName && system.serverName !== 'UNKNOWN'" 
            class="server-badge"
          >
            🖥️ {{ system.serverName }}
          </div>
        </div>
        <!-- Pulserande statuslampa -->
        <div class="status-indicator">
          <span class="pulse-dot" :class="system.healthStatus.toLowerCase()"></span>
          <span class="status-text">{{ system.healthStatus }}</span>
        </div>
      </div>
 
      <div class="card-body">
        <div class="metric-row">
          <span class="label">Senaste livstecken:</span>
          <span class="value font-mono">{{ formatTime(system.lastHeartbeat) }}</span>
        </div>
        <div class="metric-row">
          <span class="label">Tid sedan puls:</span>
          <span class="value font-mono" :class="{ 'text-danger': system.secondsSinceLast > 300 }">
            {{ formatDuration(system.secondsSinceLast) }}
          </span>
        </div>
        <div class="status-message">
          <p>{{ system.message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
 
<script>
import { ref, onMounted, onUnmounted, inject } from 'vue';
 
export default {
  name: 'Heartbeat',
  setup() {
    const systems = ref([]);
    const isDarkMode = inject('isDarkMode', ref(false));
    let intervalId = null;
 
    const fetchHeartbeats = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL;
        const response = await fetch(`${API_BASE_URL}/api/monitoring/heartbeats`);
        if (response.ok) {
          systems.value = await response.json();
        }
      } catch (error) {
        console.error('❌ Kunde inte hämta hjärtslag:', error);
      }
    };
 
    const formatTime = (dateStr) => {
      if (!dateStr) return 'Aldrig';
      const d = new Date(dateStr);
      return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
 
    const formatDuration = (seconds) => {
      if (seconds === null || seconds === undefined) return 'N/A';
      if (seconds < 60) return `${seconds} sekunder sedan`;
      const minutes = Math.floor(seconds / 60);
      const remainingSecs = seconds % 60;
      return `${minutes}m ${remainingSecs}s sedan`;
    };
 
    onMounted(() => {
      fetchHeartbeats();
      // Uppdatera automatiskt var 10:e sekund
      intervalId = setInterval(fetchHeartbeats, 10000);
    });
 
    onUnmounted(() => {
      if (intervalId) clearInterval(intervalId);
    });
 
    return {
      systems,
      isDarkMode,
      formatTime,
      formatDuration
    };
  }
};
</script>
 
<style scoped>
/* Grid-system som anpassar sig efter antalet kort */
.heartbeats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  padding: 10px 0;
}
 
.heartbeat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  /* 👇 Den tunna blå ramen och den subtila blå skuggan/glowet */
  border: 1px solid #3b82f6;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 
              0 0 15px rgba(59, 130, 246, 0.15);
  
  /* Vi behåller en tjockare vänsterkant för att snabbt kunna färgkoda statusen (grön/gul/röd) */
  border-left: 6px solid #10b981; 
  transition: all 0.3s ease;
}
 
/* Färgkodning på vänsterkanten baserat på status */
.heartbeat-card.ok { border-left-color: #10b981; }
.heartbeat-card.warning { border-left-color: #f59e0b; }
.heartbeat-card.error { border-left-color: #ef4444; }
 
/* Mörkt läge */
.heartbeat-card.dark-theme {
  background: #1e293b;
  /* 👇 Samma snygga blå ram och glow i mörkt läge */
  border: 1px solid #3b82f6;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 
              0 10px 10px -5px rgba(0, 0, 0, 0.15),
              0 0 15px rgba(59, 130, 246, 0.15);
}
 
.system-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
 
.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
 
.system-info h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}
 
.heartbeat-card.dark-theme .system-info h3 {
  color: #f8fafc;
}
 
.version-badge {
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
 
.heartbeat-card.dark-theme .version-badge {
  background: #334155;
  color: #94a3b8;
}
 
.server-badge {
  font-size: 11px;
  font-weight: 500;
  color: #475569;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}
 
.heartbeat-card.dark-theme .server-badge {
  color: #cbd5e1;
  background: #1e293b;
  border-color: #334155;
}
 
/* Pulserande statuslampa */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}
 
.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
 
.pulse-dot.ok {
  background-color: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: pulse-green 2s infinite;
}
 
.pulse-dot.warning {
  background-color: #f59e0b;
  box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
  animation: pulse-orange 2s infinite;
}
 
.pulse-dot.error {
  background-color: #ef4444;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  animation: pulse-red 2s infinite;
}
 
.status-text {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
}
 
.heartbeat-card.dark-theme .status-text {
  color: #cbd5e1;
}
 
/* Metriker */
.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
 
.metric-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}
 
.metric-row .label {
  color: #64748b;
}
 
.heartbeat-card.dark-theme .metric-row .label {
  color: #94a3b8;
}
 
.metric-row .value {
  font-weight: 600;
  color: #1e293b;
}
 
.heartbeat-card.dark-theme .metric-row .value {
  color: #f8fafc;
}
 
.font-mono {
  font-family: 'Courier New', Courier, monospace;
}
 
.text-danger {
  color: #ef4444 !important;
}
 
.status-message {
  margin-top: 10px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 13px;
  color: #475569;
}
 
.heartbeat-card.dark-theme .status-message {
  background: #0f172a;
  color: #cbd5e1;
}
 
.status-message p {
  margin: 0;
}
 
/* Animationer för de pulserande lamporna */
@keyframes pulse-green {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}
 
@keyframes pulse-orange {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}
 
@keyframes pulse-red {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
</style>