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
          <TrendChart v-if="trendData.history && trendData.history.length > 1" :history="trendData.history" />
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
 
const closeModal = () => {
  emit('close');
};
 
// Viktigt: Lyssna på förändringar i både "show", "serverName" och "driveLetter"
watch(
  () => [props.show, props.serverName, props.driveLetter],
  ([newShow, newServer, newDrive]) => {
    if (newShow && newServer && newDrive) {
      fetchTrendData(newServer, newDrive);
    }
  },
  { immediate: true }
);
 
const fetchTrendData = async (server, drive) => {
  isLoading.value = true;
  error.value = null;
  trendData.value = null;
  try {
    const response = await fetch(`http://localhost:3003/api/servers/${server}/disks/${drive}/trend`);
    if (!response.ok) {
      throw new Error('Kunde inte hämta trendanalys.');
    }
    trendData.value = await response.json();
  } catch (err) {
    error.value = err.message;
    console.error("Fetch error:", err);
  } finally {
    isLoading.value = false;
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
</script>
 
<style scoped>
/* ============================================ */
/* MODAL OVERLAY & CONTAINER (Ersätter Tailwind) */
/* ============================================ */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(15, 23, 42, 0.85); /* Mörk transparent bakgrund */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999; /* Se till att den ligger överst av allt */
  padding: 1.5rem;
  backdrop-filter: blur(4px); /* Snygg suddig bakgrund */
}
 
.modal-container {
  background-color: #1e293b; /* Slate-800 */
  color: #f8fafc;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  border: 1px solid #334155;
}
 
/* ============================================ */
/* HEADER */
/* ============================================ */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #334155;
}
 
.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #94a3b8;
  margin: 0;
}
 
.highlight {
  color: #38bdf8; /* Ljusblå */
}
 
.close-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.5rem;
  line-height: 1;
  transition: color 0.2s;
}
 
.close-button:hover {
  color: #f1f5f9;
}
 
/* ============================================ */
/* LOADING & ERROR STATES */
/* ============================================ */
.modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: #94a3b8;
}
 
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #334155;
  border-top-color: #38bdf8;
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
  color: #94a3b8;
}
 
.progress-bar-bg {
  width: 100%;
  height: 12px;
  background-color: #334155;
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
}
 
/* Diagram */
.chart-section {
  background-color: #0f172a;
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid #1e293b;
  min-height: 200px;
}
 
.no-chart-data {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  text-align: center;
}
 
/* Cards Grid */
.cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
 
.info-card {
  background-color: #0f172a;
  border: 1px solid #334155;
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
  color: #64748b;
  margin: 0;
  font-weight: 700;
}
 
.card-value {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}
 
.card-text {
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
}
 
.card-subtext {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}
 
.text-red { color: #f87171; }
.text-green { color: #4ade80; }
 
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