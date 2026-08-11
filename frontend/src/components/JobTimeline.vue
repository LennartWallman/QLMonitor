<template>
  <div class="job-timeline-card">
    <div class="card-header">
      <div class="header-title">
        <span class="icon">📅</span>
        <h3>Gantt-schema (Tidslinje - Senaste 24h)</h3>
      </div>
      <div class="legend">
        <!-- Nya förklaringar för bakgrundszonerna -->
        <span class="legend-item"><span class="legend-zone-box empty-zone-box"></span> Ledig lucka</span>
        <span class="legend-item"><span class="legend-zone-box rush-zone-box"></span> Rusningstrafik (≥4 jobb)</span>
        <span class="legend-item"><span class="badge success"></span> OK</span>
        <span class="legend-item"><span class="badge danger"></span> Misslyckad</span>
        <span class="legend-item"><span class="badge warning"></span> Avbruten</span>
        <span class="legend-item"><span class="badge info"></span> Körs nu</span>
      </div>
    </div>
 
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Hämtar tidslinjedata...</p>
    </div>
 
    <div v-else-if="error" class="error-state">
      <p>❌ {{ error }}</p>
      <button @click="fetchHistory" class="retry-btn">Försök igen</button>
    </div>
 
    <div v-else-if="timelineJobs.length === 0" class="empty-state">
      <p>Inga jobb har körts under de senaste 24 timmarna.</p>
    </div>
 
    <div v-else class="timeline-container">
      <!-- Tidsaxel (Timmar) -->
      <div class="time-axis">
        <div class="axis-spacer"></div>
        <div class="axis-hours">
          <div 
            v-for="hour in hours" 
            :key="hour" 
            class="hour-tick"
            :style="{ left: `${getHourPositionPercent(hour)}%` }"
          >
            <span class="hour-label">{{ formatHourLabel(hour) }}</span>
          </div>
        </div>
      </div>
 
      <!-- Jobbrader samt bakgrundszoner -->
      <div class="timeline-rows-wrapper">
        
        <!-- NYTT: BAKGRUNDSZONER FÖR BELASTNING -->
        <div class="density-zones-overlay">
          <div 
            v-for="(zone, index) in densityZones" 
            :key="index"
            :class="['density-zone', zone.type]"
            :style="{ left: zone.left + '%', width: zone.width + '%' }"
            :title="zone.type === 'empty' 
              ? `Ledig lucka (${zone.startTime} - ${zone.endTime})` 
              : `Rusningstrafik: ${zone.jobCount} jobb aktiva (${zone.startTime} - ${zone.endTime})`"
          ></div>
        </div>
 
        <!-- Jobbrader -->
        <div class="timeline-rows">
          <div 
            v-for="jobGroup in groupedJobs" 
            :key="jobGroup.jobId" 
            class="timeline-row"
          >
            <!-- Vänsterkolumn: Jobbnamn -->
            <div class="job-meta" :title="jobGroup.jobName">
              <span class="job-name">{{ jobGroup.jobName }}</span>
            </div>
   
            <!-- Högerkolumn: Spelplanen där staplarna ritas -->
                        <!-- Högerkolumn: Spelplanen där staplarna ritas -->
            <div class="bar-container">
              <!-- Vertikala gridlinjer för varje timme -->
              <div 
                v-for="hour in hours" 
                :key="'grid-' + hour" 
                class="grid-line"
                :style="{ left: `${getHourPositionPercent(hour)}%` }"
              ></div>
   
              <!-- Jobbkörningar (staplarna) -->
              <div 
                v-for="(run, index) in jobGroup.runs" 
                :key="index"
                class="timeline-bar"
                :class="getStatusClass(run.status)"
                :style="getBarStyles(run)"
                :data-tooltip="getTooltipText(jobGroup.jobName, run)"
              >
                <!-- Texten inuti är nu helt borttagen för en renare design -->
              </div>
            </div>
          </div>
        </div>
 
      </div>
    </div>
  </div>
</template>
 
<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import axios from 'axios';
 
const props = defineProps({
  serverName: {
    type: String,
    required: true
  }
});
 
const loading = ref(true);
const error = ref(null);
const timelineJobs = ref([]);
 
// Tidsfönster: Nuvarande tidpunkt och 24 timmar bakåt
const timeRange = ref({
  start: Date.now() - 24 * 60 * 60 * 1000,
  end: Date.now()
});
 
// Generera de 24 timmarna för tidsaxeln
const hours = computed(() => {
  const list = [];
  const startHour = new Date(timeRange.value.start);
  startHour.setMinutes(0, 0, 0); // Runda ner till närmsta timme
 
  for (let i = 0; i <= 24; i += 2) { // Visa varannan timme för att undvika trängsel
    list.push(new Date(startHour.getTime() + i * 60 * 60 * 1000));
  }
  return list;
});
 
// Gruppera körningar per unikt jobId och filtrera bort system/bakgrundsjobb
const groupedJobs = computed(() => {
  const groups = {};
  
  timelineJobs.value.forEach(job => {
    // Hoppa över collection_set-jobb så att de inte visas i listan överhuvudtaget
    if (job.jobName.toLowerCase().includes('collection_set')) {
      return;
    }
 
    if (!groups[job.jobId]) {
      groups[job.jobId] = {
        jobId: job.jobId,
        jobName: job.jobName,
        runs: []
      };
    }
    groups[job.jobId].runs.push(job);
  });
  
  return Object.values(groups);
});
 
// Beräkna belastningszoner (exkluderar bakgrundsjobb för en renare tidslinje)
const densityZones = computed(() => {
  if (!timelineJobs.value || timelineJobs.value.length === 0) return [];
 
  const events = [];
  const startLimit = timeRange.value.start;
  const endLimit = timeRange.value.end;
 
  // 1. Samla start- och slutpunkter för relevanta jobb (ignorera collection_sets)
  timelineJobs.value.forEach(job => {
    // Hoppa över system/bakgrundsjobb i belastningsberäkningen
    if (job.jobName.toLowerCase().includes('collection_set')) {
      return;
    }
 
    const start = Math.max(startLimit, job.startTime);
    const end = Math.min(endLimit, job.endTime || Date.now());
 
    if (start < end) {
      events.push({ time: start, type: 1 });
      events.push({ time: end, type: -1 });
    }
  });
 
  if (events.length === 0) return [];
 
  // Sortera händelser kronologiskt
  events.sort((a, b) => a.time - b.time);
 
  const zones = [];
  let activeCount = 0;
  let currentZoneStart = startLimit;
 
  // Tröskel för rusningstrafik (exklusive systemjobb)
  const RUSH_HOUR_THRESHOLD = 3; 
 
  // 2. Svep över tidslinjen
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const nextTime = event.time;
    const prevCount = activeCount;
 
    activeCount += event.type;
 
    if (nextTime > currentZoneStart) {
      let zoneType = 'normal';
      if (prevCount === 0) {
        zoneType = 'empty';
      } else if (prevCount >= RUSH_HOUR_THRESHOLD) {
        zoneType = 'rush';
      }
 
      if (zoneType !== 'normal') {
        const leftPct = ((currentZoneStart - startLimit) / (endLimit - startLimit)) * 100;
        const widthPct = ((nextTime - currentZoneStart) / (endLimit - startLimit)) * 100;
 
        zones.push({
          left: Math.max(0, Math.min(100, leftPct)),
          width: Math.max(0, Math.min(100, widthPct)),
          type: zoneType,
          jobCount: prevCount,
          startTime: new Date(currentZoneStart).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
          endTime: new Date(nextTime).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        });
      }
    }
    currentZoneStart = nextTime;
  }
 
  // Sista biten fram till "nu"
  if (currentZoneStart < endLimit) {
    let zoneType = activeCount === 0 ? 'empty' : (activeCount >= RUSH_HOUR_THRESHOLD ? 'rush' : 'normal');
    if (zoneType !== 'normal') {
      const leftPct = ((currentZoneStart - startLimit) / (endLimit - startLimit)) * 100;
      const widthPct = ((endLimit - currentZoneStart) / (endLimit - startLimit)) * 100;
 
      zones.push({
        left: Math.max(0, Math.min(100, leftPct)),
        width: Math.max(0, Math.min(100, widthPct)),
        type: zoneType,
        jobCount: activeCount,
        startTime: new Date(currentZoneStart).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
        endTime: new Date(endLimit).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      });
    }
  }
 
  return zones;
});
 
// Hämta datan från vårt nya API-endpoint
const fetchHistory = async () => {
  if (!props.serverName) return;
  loading.value = true;
  error.value = null;
  try {
    // Uppdatera tidsfönstret vid varje laddning
    timeRange.value = {
      start: Date.now() - 24 * 60 * 60 * 1000,
      end: Date.now()
    };
    
    const response = await axios.get(`http://sllbi01:3003/api/servers/${props.serverName}/jobs/history24h`);
    timelineJobs.value = response.data;
  } catch (err) {
    console.error('Kunde inte hämta tidslinje:', err);
    error.value = 'Kunde inte ladda tidslinjedata från servern.';
  } finally {
    loading.value = false;
  }
};
 
// Beräkna positioner i procent för tidsaxeln och staplarna
const getHourPositionPercent = (date) => {
  const totalDuration = timeRange.value.end - timeRange.value.start;
  const elapsed = date.getTime() - timeRange.value.start;
  return (elapsed / totalDuration) * 100;
};
 
const getBarStyles = (run) => {
  const totalDuration = timeRange.value.end - timeRange.value.start;
  
  // Begränsa tiderna inom vårt 24h-fönster
  const start = Math.max(run.startTime, timeRange.value.start);
  const end = Math.min(run.endTime || Date.now(), timeRange.value.end);
  
  const leftPercent = ((start - timeRange.value.start) / totalDuration) * 100;
  const widthPercent = ((end - start) / totalDuration) * 100;
  
  return {
    left: `${leftPercent}%`,
    // Ge extremt korta jobb en minsta bredd (t.ex. 0.6%) så att de syns i schemat
    width: `${Math.max(widthPercent, 0.6)}%`
  };
};
 
// Hjälpmetoder för formatering och klasser
const formatHourLabel = (date) => {
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};
 
const getStatusClass = (status) => {
  switch (status) {
    case 'Succeeded': return 'bar-success';
    case 'Failed': return 'bar-danger';
    case 'Canceled': return 'bar-warning';
    case 'Running': return 'bar-info';
    default: return 'bar-unknown';
  }
};
 
const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};
 
const getTooltipText = (jobName, run) => {
  const startStr = new Date(run.startTime).toLocaleTimeString('sv-SE');
  const endStr = run.endTime ? new Date(run.endTime).toLocaleTimeString('sv-SE') : 'Körs nu';
  return `${jobName}\nStatus: ${run.status}\nTid: ${startStr} - ${endStr}\nVaraktighet: ${formatDuration(run.durationSeconds)}`;
};
 
// Ladda om data om vi byter server i vyn
watch(() => props.serverName, () => {
  fetchHistory();
});
 
onMounted(() => {
  fetchHistory();
  // Polla tidslinjen var 60:e sekund för att hålla den vid liv
  const interval = setInterval(fetchHistory, 60000);
  return () => clearInterval(interval);
});
</script>
 
<style scoped>
.job-timeline-card {
  background: var(--bg-card-custom);
  border-radius: 8px;
  box-shadow: var(--shadow);
  padding: 16px 20px 8px 20px; /* Optimerat tomrum i botten */
  margin-bottom: 15px; /* Minskat marginal nedåt */
  border: 1px solid var(--border);
  align-self: flex-start; /* Hindrar yttre flexboxar från att sträcka ut kortet */
  transition: background-color 0.3s, border-color 0.3s;
}
 
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding-bottom: 15px;
  margin-bottom: 20px;
}
 
.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
 
.header-title h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-h);
  font-weight: 600;
}
 
.legend {
  display: flex;
  gap: 15px;
  font-size: 13px;
  align-items: center;
}
 
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}
 
.badge {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
 
/* Snygga och klara färger som fungerar i både mörkt och ljust läge */
.badge.success, .bar-success { background-color: #2ecc71; }
.badge.danger, .bar-danger { background-color: #e74c3c; }
.badge.warning, .bar-warning { background-color: #f39c12; }
.badge.info, .bar-info { background-color: #3498db; }
 
/* Små rutor i förklaringen för bakgrundszoner */
.legend-zone-box {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  display: inline-block;
}
.empty-zone-box {
  background-color: rgba(46, 204, 113, 0.15);
  border: 1px dashed rgba(46, 204, 113, 0.6);
}
.rush-zone-box {
  background-color: rgba(231, 76, 60, 0.15);
  border: 1px dashed rgba(231, 76, 60, 0.6);
}
 
/* Tidslinje Layout */
.timeline-container {
  display: flex;
  flex-direction: column;
  position: relative;
  background-color: var(--bg-card-custom);
}
 
.time-axis {
  display: flex;
  height: 30px;
  border-bottom: 2px solid var(--border);
  position: relative;
  margin-bottom: 10px;
}
 
.axis-spacer {
  width: 250px; /* Samma bredd som job-meta kolumnen */
  flex-shrink: 0;
}
 
.axis-hours {
  flex-grow: 1;
  position: relative;
  height: 100%;
}
 
.hour-tick {
  position: absolute;
  transform: translateX(-50%);
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
 
.hour-tick::after {
  content: '';
  width: 1px;
  height: 6px;
  background-color: var(--border);
  align-self: center;
}
 
.hour-label {
  font-size: 11px;
  color: var(--text);
  margin-bottom: 4px;
  font-weight: 500;
}
 
/* Omslutande container för rader och bakgrundszoner */
.timeline-rows-wrapper {
  position: relative;
  background-color: var(--bg-card-custom);
}
 
/* Overlay för bakgrundszonerna - FLYTTAD TILL Z-INDEX 10 SÅ DEN SYNS OVANPÅ RADERNA */
.density-zones-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Startar där bar-containern börjar (250px från vänster) */
  left: 250px; 
  right: 5px; /* Matchar scrollbar-padding i .timeline-rows */
  pointer-events: none; /* Gör att klick passerar igenom till jobb-staplarna */
  z-index: 10; /* Ligger framför radbakgrunderna men bakom staplarna (som har z-index 15+) */
}
 
.density-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  transition: all 0.2s ease;
}
 
/* Grön zon: Inga jobb körs (Ökad opacitet för mörkt läge) */
.density-zone.empty {
  background-color: rgba(46, 204, 113, 0.06); 
  border-left: 1px dashed rgba(46, 204, 113, 0.15);
  border-right: 1px dashed rgba(46, 204, 113, 0.15);
}
 
/* Röd zon: Många jobb körs samtidigt (Ökad opacitet för mörkt läge) */
.density-zone.rush {
  background-color: rgba(231, 76, 60, 0.08); 
  border-left: 1px dashed rgba(231, 76, 60, 0.2);
  border-right: 1px dashed rgba(231, 76, 60, 0.2);
}
 
/* Rader */
.timeline-rows {
  max-height: 60vh; /* Dynamisk höjd istället för hårdkodade 500px */
  height: auto;
  overflow-y: auto;
  padding-right: 5px;
  position: relative;
  z-index: 5; /* Ligger bakom zonerna */
}
 
.timeline-row {
  display: flex;
  align-items: center;
  height: 38px;
  border-bottom: 1px solid var(--border);
  background-color: transparent; /* Gör raderna genomskinliga så zonerna syns */
}
 
.timeline-row:hover {
  background-color: var(--accent-bg);
}
 
.job-meta {
  width: 250px;
  flex-shrink: 0;
  padding-right: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-color: var(--bg-card-custom); /* Täcker över zonerna i vänstermarginalen */
  z-index: 25; /* Högre än zonerna så att jobbnamnen alltid är läsbara */
  height: 100%;
  display: flex;
  align-items: center;
}
 
.job-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-h);
}
 
.bar-container {
  flex-grow: 1;
  position: relative;
  height: 24px;
  background-color: var(--code-bg); /* Matchar din mörka/ljusa bakgrund för kod/fält */
  border-radius: 4px;
  overflow: visible; /* Gör att hover-bubblan tillåts ritas utanför spåret */
  z-index: 6;
}
 
/* Gridlinjer i bakgrunden */
.grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: var(--border);
  pointer-events: none;
}
 
/* Staplarna */
.timeline-bar {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, box-shadow 0.1s;
  box-shadow: inset 0 -1px 0 rgba(0,0,0,0.1);
  z-index: 20; /* Högre än zonerna (som har 10) så de är klickbara och synliga */
}
 
.timeline-bar:hover {
  transform: scaleY(1.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 50; /* Ser till att den aktiva stapeln hamnar överst */
}
 
/* ============================================================================
   NY DESIGN: ANIMERAD HOVER-BUBBLA (TOOLTIP)
   ============================================================================ */
 
/* Standard: Bubblans text och låda (ovanför stapeln) */
.timeline-bar::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 140%; /* Placerar bubblan ovanför stapeln */
  left: 50%;
  transform: translateX(-50%) scale(0.85);
  background-color: #111217; /* Snygg, djup mörk bakgrund */
  color: #f3f4f6;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
  font-family: var(--sans);
  font-weight: 500;
  white-space: pre-line; /* Respekterar radbrytningar (\n) i texten */
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 9999;
  width: max-content;
  max-width: 250px;
  text-align: left;
}
 
/* Standard: Den lilla pilen i botten på bubblan */
.timeline-bar::before {
  content: '';
  position: absolute;
  bottom: 120%;
  left: 50%;
  transform: translateX(-50%) scale(0.85);
  border-width: 6px;
  border-style: solid;
  border-color: #111217 transparent transparent transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 9999;
}
 
/* Visa bubblan och pilen vid hover med en mjuk uppåt-tonande animation */
.timeline-bar:hover::after {
  opacity: 1;
  transform: translateX(-50%) translateY(-2px) scale(1);
}
 
.timeline-bar:hover::before {
  opacity: 1;
  transform: translateX(-50%) translateY(-2px) scale(1);
}
 
/* ============================================================================
   SMART FIX: VISA BUBBLAN NEDÅT PÅ DE 4 ÖVERSTA RADERNA FÖR ATT UNDVIKA KLIPPNING
   ============================================================================ */
 
/* Ändra positionen för bubblan på de 4 översta raderna så den hamnar under stapeln */
.timeline-row:nth-child(-n+4) .timeline-bar::after {
  bottom: auto;
  top: 140%; /* Under stapeln */
}
 
/* Ändra pilen på de 4 översta raderna så den pekar uppåt istället */
.timeline-row:nth-child(-n+4) .timeline-bar::before {
  bottom: auto;
  top: 120%; /* Under stapeln */
  border-color: transparent transparent #111217 transparent; /* Vänd pilen uppåt */
}
 
/* Justera animationen för de 4 översta raderna så den tonar mjukt nedåt istället */
.timeline-row:nth-child(-n+4) .timeline-bar:hover::after {
  transform: translateX(-50%) translateY(2px) scale(1);
}
 
.timeline-row:nth-child(-n+4) .timeline-bar:hover::before {
  transform: translateX(-50%) translateY(2px) scale(1);
}
 
/* Laddning & Fel */
.loading-state, .error-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: var(--text);
}
 
.spinner {
  border: 3px solid var(--border);
  border-top: 3px solid var(--accent);
  border-radius: 50%;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}
 
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
 
.retry-btn {
  margin-top: 10px;
  padding: 6px 16px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>