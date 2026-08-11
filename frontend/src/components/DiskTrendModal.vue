<!-- Fil: src/components/DiskTrendModal.vue -->
<template>
  <div v-if="show" class="modal-overlay" @click.self="closeModal">
    <!-- Modalens innehållspanel -->
    <div class="modal-container animate-scale-in">
      
      <!-- Rubrik och stäng-knapp -->
      <div class="modal-header">
        <h2 class="modal-title">
          Diskanalys: <span class="highlight">{{ driveLetter }}:</span> på <span class="highlight">{{ serverName }}</span>
        </h2>
        <button @click="closeModal" class="close-button">
          ✕
        </button>
      </div>
 
      <!-- Huvudinnehåll -->
      <div v-if="isLoading" class="modal-loading">
        <div class="spinner"></div>
        <p>Hämtar och analyserar historisk data...</p>
      </div>
      <div v-else-if="error" class="modal-error">
        <p>⚠️ {{ error }}</p>
      </div>
      
      <div v-else-if="trendData" class="modal-body">
        <!-- Progress bar sektion -->
        <div class="progress-section">
          <div class="progress-details">
            <span>Använt: {{ formatSize(usedMB) }}</span>
            <span>Ledigt: {{ formatSize(trendData.CurrentFreeMB) }}</span>
            <span>Totalt: {{ formatSize(trendData.TotalMB) }}</span>
          </div>
          <div class="progress-bar-bg">
            <div
              :class="['progress-bar-fill', progressBarColor]"
              :style="{ width: `${usagePercentage}%` }"
            ></div>
          </div>
          <div class="usage-text">{{ usagePercentage.toFixed(1) }}% använt</div>
        </div>
 
        <!-- Diagram-sektion -->
        <div class="chart-section">
          <TrendChart
              v-if="trendData.history && trendData.history.length > 1"
              :history="trendData.history"
              :total-m-b="trendData.TotalMB"
            />
          <div v-else class="no-chart-data">
            <p>Inte tillräckligt med historisk data för att rita ett trenddiagram ännu.</p>
          </div>
        </div>
 
        <!-- Kort med nyckeltal -->
        <div class="cards-grid">
          <!-- Prognos-kort -->
          <div class="info-card">
            <div class="card-icon">⏳</div>
            <div class="card-content">
              <h3 class="card-label">Prognos</h3>
              <template v-if="trendData.DaysUntilFull !== null">
                <p class="card-value text-red">{{ trendData.DaysUntilFull }} dagar</p>
                <p class="card-subtext">Beräknas vara full: {{ new Date(trendData.EstimatedFullDate).toLocaleDateString('sv-SE') }}</p>
              </template>
              <template v-else>
                <p class="card-value text-green">Stabil</p>
                <p class="card-subtext">Disken förväntas inte bli full inom överskådlig tid.</p>
              </template>
            </div>
          </div>
 
          <!-- Daglig förändring-kort -->
          <div class="info-card">
            <div class="card-icon">{{ trendData.MBChangePerDay > 0 ? '📈' : '📉' }}</div>
            <div class="card-content">
              <h3 class="card-label">Daglig Förändring</h3>
              <p :class="['card-value', trendData.MBChangePerDay > 0 ? 'text-red' : 'text-green']">
                {{ trendData.MBChangePerDay > 0 ? '+' : '' }}{{ (trendData.MBChangePerDay / 1024).toFixed(2) }} GB/dag
              </p>
              <p class="card-subtext">Baserat på historisk trend.</p>
            </div>
          </div>
          
          <!-- Datapunkter-kort -->
          <div class="info-card full-width">
            <div class="card-icon">🗄️</div>
            <div class="card-content">
              <h3 class="card-label">Analysunderlag</h3>
              <p class="card-text">{{ trendData.DataPoints }} sparade datapunkter analyserade.</p>
              <p class="card-subtext">
                Period: {{ new Date(trendData.FirstDate).toLocaleDateString('sv-SE') }} till {{ new Date(trendData.LastDate).toLocaleDateString('sv-SE') }}
              </p>
            </div>
          </div>
        </div>
 
        <!-- NY SEKTION: De 5 största databasfilerna på disken -->
        <div class="largest-files-section">
          <h3 class="section-title">
            <span class="section-icon">🗃️</span> De 5 största databasfilerna på {{ driveLetter }}:
          </h3>
 
          <div v-if="loadingFiles" class="files-loading">
            <div class="mini-spinner"></div>
            <span>Hämtar filinformation från {{ serverName }}...</span>
          </div>
 
          <div v-else-if="filesError" class="files-error">
            ⚠️ {{ filesError }}
          </div>
 
          <div v-else-if="largestFiles.length === 0" class="files-empty">
            Inga SQL Server-databasfiler (.mdf/.ldf) hittades på denna disk.
          </div>
 
          <div v-else class="files-list">
            <div 
              v-for="(file, index) in largestFiles" 
              :key="index" 
              class="file-item"
            >
              <div class="file-rank">{{ index + 1 }}</div>
              <div class="file-details">
                <div class="file-header-row">
                  <span class="file-db-name">{{ file.DatabaseName }}</span>
                  <span :class="['file-type-badge', file.FileType?.toLowerCase()]">
                    {{ file.FileType === 'ROWS' ? 'DATA' : 'LOGG' }}
                  </span>
                </div>
                <div class="file-path" :title="file.PhysicalName">
                  {{ truncatePath(file.PhysicalName) }}
                </div>
              </div>
              <div class="file-size">
                {{ formatSize(file.SizeMB) }}
              </div>
            </div>
          </div>
        </div>
 
      </div>
    </div>
  </div>
</template>
 
<script setup>
import { ref, watch, computed } from 'vue';
import TrendChart from './charts/TrendChart.vue';
 
const props = defineProps({
  show: Boolean,
  serverName: String,
  driveLetter: String
});
const emit = defineEmits(['close']);
 
const trendData = ref(null);
const isLoading = ref(false);
const error = ref(null);
 
// Nya states för filanalysen
const largestFiles = ref([]);
const loadingFiles = ref(false);
const filesError = ref(null);
 
const closeModal = () => {
  emit('close');
};
 
// Viktigt: Lyssna på förändringar i både "show", "serverName" och "driveLetter"
watch(
  () => [props.show, props.serverName, props.driveLetter],
  ([newShow, newServer, newDrive]) => {
    if (newShow && newServer && newDrive) {
      fetchTrendData(newServer, newDrive);
      fetchLargestFiles(newServer, newDrive); // Hämta även de största filerna
    }
  },
  { immediate: true }
);
 
const fetchTrendData = async (server, drive) => {
  isLoading.value = true;
  error.value = null;
  trendData.value = null;
  try {
    const response = await fetch(`http://SLLBI01:3003/api/servers/${server}/disks/${drive}/trend`);
    if (!response.ok) {
      throw new Error('Kunde inte hämta trendanalys.');
    }
    const data = await response.json();
    // Slå ihop summary-fälten med history till ett enda objekt
    trendData.value = {
      ...data.summary,
      history: data.history
    };
  } catch (err) {
    error.value = err.message;
    console.error("Fetch error:", err);
  } finally {
    isLoading.value = false;
  }
};
 
// Ny funktion för att hämta de 5 största filerna
const fetchLargestFiles = async (server, drive) => {
  loadingFiles.value = true;
  filesError.value = null;
  largestFiles.value = [];
 
  try {
    const url = `http://SLLBI01:3003/api/disks/largest-files?server=${encodeURIComponent(server)}&drive=${encodeURIComponent(drive)}`;
    console.log(`[DiskTrendModal] Hämtar största filer från: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Servern svarade med status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`[DiskTrendModal] ✅ Mottog ${data.length} filer för ${server} (${drive}:)`, data);
    largestFiles.value = data;
  } catch (err) {
    console.error('❌ [DiskTrendModal] Fel vid hämtning av största filer:', err);
    filesError.value = `Kunde inte läsa databasfiler: ${err.message}`;
  } finally {
    loadingFiles.value = false;
  }
};
 
const usagePercentage = computed(() => {
  if (!trendData.value) return 0;
  return ((trendData.value.TotalMB - trendData.value.CurrentFreeMB) / trendData.value.TotalMB) * 100;
});
 
const usedMB = computed(() => {
  if (!trendData.value) return 0;
  return trendData.value.TotalMB - trendData.value.CurrentFreeMB;
});
 
const progressBarColor = computed(() => {
  if (usagePercentage.value > 90) return 'bar-red';
  if (usagePercentage.value > 75) return 'bar-yellow';
  return 'bar-green';
});
 
const formatSize = (mb) => {
  if (mb === null || mb === undefined) return 'N/A';
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toFixed(1)} GB`;
  const tb = gb / 1024;
  return `${tb.toFixed(2)} TB`;
};
 
// Korta ner långa Windows-sökvägar snyggt i mitten
const truncatePath = (path) => {
  if (!path) return '';
  if (path.length <= 50) return path;
  return path.substring(0, 18) + '...' + path.substring(path.length - 28);
};
</script>
 
<style scoped>
/* ============================================ */
/* MODAL OVERLAY & CONTAINER */
/* ============================================ */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(15, 23, 42, 0.75); /* Mörk transparent bakgrund */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999; /* Se till att den ligger överst av allt */
  padding: 1.5rem;
  backdrop-filter: blur(4px); /* Snygg suddig bakgrund */
}
 
.modal-container {
  background-color: var(--bg-card-custom);
  color: var(--text);
  border-radius: 16px;
  box-shadow: var(--shadow);
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  transition: background-color 0.3s, color 0.3s, border-color 0.3s;
}
 
/* ============================================ */
/* HEADER */
/* ============================================ */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
}
 
.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-h);
  margin: 0;
}
 
.highlight {
  color: var(--accent); /* Ljusblå / lila accentfärg */
}
 
.close-button {
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.5rem;
  line-height: 1;
  transition: color 0.2s;
}
 
.close-button:hover {
  color: var(--text-h);
}
 
/* ============================================ */
/* LOADING & ERROR STATES */
/* ============================================ */
.modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: var(--text);
}
 
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}
 
@keyframes spin {
  to { transform: rotate(360deg); }
}
 
.modal-error {
  padding: 3rem;
  text-align: center;
  color: #f87171;
}
 
/* ============================================ */
/* BODY CONTENT */
/* ============================================ */
.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
 
/* Progress bar */
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
 
.progress-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  color: var(--text);
}
 
.progress-bar-bg {
  width: 100%;
  height: 12px;
  background-color: var(--code-bg);
  border-radius: 9999px;
  overflow: hidden;
}
 
.progress-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.5s ease-out;
}
 
.bar-red { background-color: #ef4444; }
.bar-yellow { background-color: #f59e0b; }
.bar-green { background-color: #10b981; }
 
.usage-text {
  text-align: center;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-h);
}
 
/* Diagram */
.chart-section {
  background-color: var(--code-bg);
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid var(--border);
  min-height: 200px;
}
 
.no-chart-data {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  opacity: 0.7;
  text-align: center;
}
 
/* Cards Grid */
.cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
 
.info-card {
  background-color: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
 
.full-width {
  grid-column: span 2;
}
 
.card-icon {
  font-size: 1.5rem;
  line-height: 1;
}
 
.card-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
 
.card-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text);
  opacity: 0.7;
  margin: 0;
  font-weight: 700;
}
 
.card-value {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-h);
}
 
.card-text {
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  color: var(--text-h);
}
 
.card-subtext {
  font-size: 0.75rem;
  color: var(--text);
  opacity: 0.6;
  margin: 0;
}
 
.text-red { color: #f87171; }
.text-green { color: #4ade80; }
 
/* ============================================ */
/* STYLING FÖR NYA SEKTIONEN: STÖRSTA FILER */
/* ============================================ */
.largest-files-section {
  background-color: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
}
 
.section-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-h);
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
 
.section-icon {
  font-size: 1.2rem;
}
 
/* Laddningsindikator */
.files-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem 0;
  color: var(--text);
  font-size: 0.9rem;
}
 
.mini-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
 
/* Listobjekt */
.files-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
 
.file-item {
  display: flex;
  align-items: center;
  background: var(--bg-card-custom);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  transition: background-color 0.2s ease;
}
 
.file-item:hover {
  background-color: var(--accent-bg);
}
 
.file-rank {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text);
  opacity: 0.6;
  width: 28px;
}
 
.file-details {
  flex: 1;
  min-width: 0; /* Förhindrar text overflow */
  padding-right: 1rem;
}
 
.file-header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
}
 
.file-db-name {
  font-weight: 600;
  color: var(--text-h);
  font-size: 0.95rem;
}
 
/* Badges för DATA (.mdf) och LOGG (.ldf) */
.file-type-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  text-transform: uppercase;
}
 
.file-type-badge.rows {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}
 
.file-type-badge.log {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
 
.file-path {
  font-size: 0.75rem;
  color: var(--text);
  opacity: 0.7;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
 
.file-size {
  font-size: 1.05rem;
  font-weight: 700;
  color: #4ade80; /* Grön färg för storleken */
  white-space: nowrap;
}
 
.files-error {
  color: #f87171;
  font-size: 0.85rem;
  text-align: center;
  padding: 1rem;
}
 
.files-empty {
  color: var(--text);
  opacity: 0.8;
  font-size: 0.85rem;
  text-align: center;
  padding: 1rem;
}
 
/* Animationer */
@keyframes scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.animate-scale-in {
  animation: scale-in 0.15s ease-out forwards;
}
 
@media (max-width: 640px) {
  .cards-grid {
    grid-template-columns: 1fr;
  }
  .full-width {
    grid-column: span 1;
  }
}
</style>