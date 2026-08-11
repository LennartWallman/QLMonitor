<template>
  <div class="disk-view-container" :class="{ 'dark-theme': isDarkMode }">
    <!-- Header med server-info -->
    <div class="view-header">
      <div class="header-content">
        <div class="header-left">
          <div class="icon-circle">
            <span class="icon">💾</span>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <h1 class="view-title">Disk-övervakning</h1>
              
              <!-- 👇 --- START: SVARSTIDSMÄTNING (TEMPLATE-INDIKATOR) --- -->
              <div v-if="lastResponseTime !== null" class="response-time-badge">
                <span class="pulse-icon">⏱️</span>
                <span>Svarstid: <strong>{{ lastResponseTime }} ms</strong></span>
              </div>
              <!-- 👆 --- END: SVARSTIDSMÄTNING (TEMPLATE-INDIKATOR) --- -->
            </div>
            <p v-if="selectedServer" class="server-name">
              {{ selectedServer }}
            </p>
          </div>
        </div>
      </div>
    </div>
 
    <!-- Laddning -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p class="loading-text">Laddar diskstatus...</p>
    </div>
 
    <!-- Felmeddelande -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">⚠️</span>
      <p class="error-text">{{ error }}</p>
    </div>
 
    <!-- Ingen server vald -->
    <div v-else-if="!selectedServer" class="empty-state">
      <span class="empty-icon">🖥️</span>
      <p class="empty-text">Välj en server för att se diskstatus</p>
    </div>
 
    <!-- Inga diskar hittades -->
    <div v-else-if="filteredDisks.length === 0" class="empty-state">
      <span class="empty-icon">💿</span>
      <p class="empty-text">Inga diskar hittades för {{ selectedServer }}</p>
    </div>
 
    <!-- Huvudinnehåll -->
    <div v-else class="content-area">
      <!-- Statistik-kort -->
      <div class="stats-grid">
        <div class="stat-card stat-blue">
          <div class="stat-content">
            <div class="stat-info">
              <p class="stat-label">Antal diskar</p>
              <p class="stat-value">{{ filteredDisks.length }}</p>
            </div>
            <div class="stat-icon">💾</div>
          </div>
        </div>
        <div class="stat-card stat-purple">
          <div class="stat-content">
            <div class="stat-info">
              <p class="stat-label">Totalt utrymme</p>
              <p class="stat-value">{{ formatSize(totalSpace) }}</p>
            </div>
            <div class="stat-icon">📊</div>
          </div>
        </div>
        <div class="stat-card stat-green">
          <div class="stat-content">
            <div class="stat-info">
              <p class="stat-label">Genomsnittlig användning</p>
              <p class="stat-value">{{ totalUsagePercentage.toFixed(1) }}%</p>
            </div>
            <div class="stat-icon">📈</div>
          </div>
        </div>
      </div>
 
      <!-- Disk-kort -->
      <div class="disks-grid" style="margin-bottom: 2rem;">
        <div 
          v-for="disk in filteredDisks" 
          :key="`${disk.ServerName}-${disk.DriveLetter}`"
          @click="openTrendModal(disk.ServerName, disk.DriveLetter)"
          class="disk-card-clickable-wrapper"
        >
          <DiskCard :disk="disk" />
        </div>
      </div>
 
      <!-- TABELLANALYSEN PLACERAD DIRECT UNDER DISK-KORTEN -->
      <DiskTableAnalysis :server-name="selectedServer.value || selectedServer" />
    </div> <!-- Slut på .content-area -->
 
    <!-- Modal för trendanalys -->
    <DiskTrendModal 
      :show="isModalOpen" 
      :server-name="selectedDisk.server"
      :drive-letter="selectedDisk.drive"
      @close="closeTrendModal"
    />
  </div>
</template>
 
<script setup>
import { ref, reactive, onMounted, computed, watch, inject } from 'vue';
import DiskCard from '@/components/DiskCard.vue';
import DiskTrendModal from '@/components/DiskTrendModal.vue';
import DiskTableAnalysis from '@/components/DiskTableAnalysis.vue';
import { getApiUrl } from '@/config/api';
 
// 👇 --- START: SVARSTIDSMÄTNING (IMPORTERA COMPOSABLE) ---
import { useResponseTime } from '@/composables/useResponseTime';
const { lastResponseTime, updateResponseTime } = useResponseTime();
// 👆 --- END: SVARSTIDSMÄTNING (IMPORTERA COMPOSABLE) ---
 
const diskSummary = ref([]);
const isLoading = ref(true);
const error = ref(null);
 
const selectedServer = inject('selectedServer');
const isDarkMode = inject('isDarkMode', ref(false)); 
 
const isModalOpen = ref(false);
const selectedDisk = reactive({ server: null, drive: null });
 
const filteredDisks = computed(() => {
  if (!selectedServer || !selectedServer.value) return [];
  return diskSummary.value
    .filter(disk => disk.ServerName === selectedServer.value)
    .sort((a, b) => a.DriveLetter.localeCompare(b.DriveLetter));
});
 
const totalSpace = computed(() => {
  return filteredDisks.value.reduce((sum, disk) => sum + disk.TotalMB, 0);
});
 
const totalUsagePercentage = computed(() => {
  if (totalSpace.value === 0) return 0;
  const totalUsed = filteredDisks.value.reduce((sum, disk) => sum + (disk.TotalMB - disk.FreeMB), 0);
  return (totalUsed / totalSpace.value) * 100;
});
 
const fetchDiskSummary = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/disks/summary`);
    if (!response.ok) throw new Error('Kunde inte hämta data.');
    
    // 👇 --- START: SVARSTIDSMÄTNING (REGISTRERA HEADERS) ---
    updateResponseTime(response.headers);
    // 👆 --- END: SVARSTIDSMÄTNING (REGISTRERA HEADERS) ---
 
    diskSummary.value = await response.json();
  } catch (err) {
    error.value = 'Ett fel uppstod vid hämtning av diskdata. Kontrollera att backend körs.';
    console.error('❌ Fel vid hämtning:', err);
  } finally {
    isLoading.value = false;
  }
};
 
watch(selectedServer, (newServer) => {
  if (newServer) fetchDiskSummary();
});
 
onMounted(() => {
  fetchDiskSummary();
});
 
const openTrendModal = (serverName, driveLetter) => {
  selectedDisk.server = serverName;
  selectedDisk.drive = driveLetter;
  isModalOpen.value = true;
};
 
const closeTrendModal = () => {
  isModalOpen.value = false;
};
 
const formatSize = (mb) => {
  if (mb === null || mb === undefined) return 'N/A';
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toFixed(1)} GB`;
  const tb = gb / 1024;
  return `${tb.toFixed(2)} TB`;
};
</script>
 
<style scoped>
.disk-card-clickable-wrapper {
  cursor: pointer;
}
 
/* 👇 --- START: SVARSTIDSMÄTNING (CSS-STYLING) --- */
.response-time-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  color: #94a3b8;
  font-family: 'Segoe UI', monospace;
  transition: all 0.3s ease;
  align-self: center;
}
#app.dark-theme .response-time-badge {
  background: rgba(15, 23, 42, 0.8);
  border-color: rgba(255, 255, 255, 0.05);
}
.response-time-badge strong {
  color: #38bdf8; /* Snygg ljusblå färg för millisekunderna */
}
/* 👆 --- END: SVARSTIDSMÄTNING (CSS-STYLING) --- */
 
/* ============================================ */
/* CONTAINER */
/* ============================================ */
.disk-view-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding-bottom: 2rem;
  transition: background 0.3s ease;
}
 
/* Anpassa bakgrunden i mörkt läge */
#app.dark-theme .disk-view-container {
  background: #0f172a; /* Matchar var(--bg-app) */
}
 
/* ============================================ */
/* HEADER */
/* ============================================ */
.view-header {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 2rem 2rem 1.5rem 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}
 
#app.dark-theme .view-header {
  background: #1e293b; /* Matchar var(--bg-card) */
  border-bottom-color: #334155;
}
 
.header-content {
  max-width: 1400px;
  margin: 0 auto;
}
 
.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}
 
.icon-circle {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
}
 
.icon-circle .icon {
  font-size: 2rem;
}
 
.view-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
  transition: color 0.3s ease;
}
 
#app.dark-theme .view-title {
  color: #ffffff;
}
 
.server-name {
  font-size: 0.95rem;
  color: #6b7280;
  margin: 0.25rem 0 0 0;
  font-weight: 500;
  transition: color 0.3s ease;
}
 
#app.dark-theme .server-name {
  color: #94a3b8;
}
 
/* ============================================ */
/* LOADING STATE */
/* ============================================ */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5rem 2rem;
}
 
.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
 
@keyframes spin {
  to { transform: rotate(360deg); }
}
 
.loading-text {
  margin-top: 1rem;
  color: #6b7280;
  font-size: 1rem;
  font-weight: 500;
}
 
#app.dark-theme .loading-text {
  color: #94a3b8;
}
 
/* ============================================ */
/* ERROR & EMPTY STATES */
/* ============================================ */
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5rem 2rem;
  text-align: center;
}
 
.error-icon,
.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}
 
.error-text {
  color: #dc2626;
  font-size: 1.125rem;
  font-weight: 500;
}
 
.empty-text {
  color: #6b7280;
  font-size: 1.125rem;
  font-weight: 500;
}
 
#app.dark-theme .empty-text {
  color: #94a3b8;
}
 
/* ============================================ */
/* CONTENT AREA */
/* ============================================ */
.content-area {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem;
}
 
/* ============================================ */
/* STATISTIK-KORT */
/* ============================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}
 
.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}
 
#app.dark-theme .stat-card {
  background: #1e293b; /* Matchar var(--bg-card) */
  border: 1px solid #334155;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}
 
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--card-color-1), var(--card-color-2));
}
 
.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.12);
}
 
.stat-blue {
  --card-color-1: #3b82f6;
  --card-color-2: #2563eb;
}
 
.stat-purple {
  --card-color-1: #8b5cf6;
  --card-color-2: #7c3aed;
}
 
.stat-green {
  --card-color-1: #10b981;
  --card-color-2: #059669;
}
 
.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
 
.stat-info {
  flex: 1;
}
 
.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 0.5rem 0;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: color 0.3s ease;
}
 
#app.dark-theme .stat-label {
  color: #94a3b8;
}
 
.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
  transition: color 0.3s ease;
}
 
#app.dark-theme .stat-value {
  color: #ffffff;
}
 
.stat-icon {
  font-size: 3rem;
  opacity: 0.15;
}
 
/* ============================================ */
/* DISK-GRID */
/* ============================================ */
.disks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}
 
/* ============================================ */
/* RESPONSIV DESIGN */
/* ============================================ */
@media (max-width: 768px) {
  .view-header {
    padding: 1.5rem 1rem;
  }
 
  .icon-circle {
    width: 50px;
    height: 50px;
  }
 
  .icon-circle .icon {
    font-size: 1.5rem;
  }
 
  .view-title {
    font-size: 1.5rem;
  }
 
  .content-area {
    padding: 0 1rem;
  }
 
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
 
  .disks-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
 
  .stat-value {
    font-size: 1.75rem;
  }
 
  .stat-icon {
    font-size: 2.5rem;
  }
}
 
@media (max-width: 480px) {
  .view-title {
    font-size: 1.25rem;
  }
 
  .server-name {
    font-size: 0.875rem;
  }
 
  .stat-card {
    padding: 1.25rem;
  }
}
</style>