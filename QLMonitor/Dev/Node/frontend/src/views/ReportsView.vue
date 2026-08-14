<!-- src/views/ReportsView.vue -->
<template>
  <div class="reports-container">
    <!-- Vänsterpanel: Rapportlista -->
    <div class="reports-sidebar">
      <div class="sidebar-header">
        <h3>📊 SSRS-rapporter</h3>
        <p>Välj en rapport för att öppna den.</p>
      </div>
      
      <div class="report-list">
        <button 
          v-for="report in reports" 
          :key="report.ID"
          @click="selectReport(report)"
          :class="['report-item', { active: selectedReport?.ID === report.ID }]"
        >
          <div class="report-icon">📈</div>
          <div class="report-info">
            <span class="report-title">{{ report.ReportName }}</span>
            <span class="report-desc">{{ report.Description }}</span>
          </div>
        </button>
      </div>
    </div>
 
    <!-- Högerpanel: Detaljer och Öppna-knapp -->
    <div class="reports-viewer">
      <div v-if="selectedReport" class="viewer-wrapper">
        <div class="report-card">
          <div class="card-icon">📊</div>
          <h2>{{ selectedReport.ReportName }}</h2>
          <p class="card-desc">{{ selectedReport.Description }}</p>
          
          <div class="info-box">
            <p><strong>URL:</strong> <code>{{ formattedReportURL }}</code></p>
            <p>ℹ️ Rapporten öppnas i en ny flik för att säkerställa att Windows-inloggning (SSO) och alla funktioner fungerar utan begränsningar.</p>
          </div>
 
          <a 
            :href="formattedReportURL" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="btn-open-report"
          >
            🚀 Öppna rapport i ny flik
          </a>
        </div>
      </div>
      
      <div v-else class="no-report-selected">
        <div class="empty-state">
          <span class="empty-icon">📊</span>
          <h3>Ingen rapport vald</h3>
          <p>Välj en rapport i listan till vänster för att visa detaljer.</p>
        </div>
      </div>
    </div>
  </div>
</template>
 
<script setup>
import { ref, computed, onMounted } from 'vue'
 
const reports = ref([])
const selectedReport = ref(null)
 
const fetchReports = async () => {
  try {
    const response = await fetch('http://SLLBI01:3003/api/reports')
    if (response.ok) {
      reports.value = await response.json()
      if (reports.value.length > 0) {
        selectedReport.value = reports.value[0]
      }
    }
  } catch (err) {
    console.error('❌ Kunde inte hämta rapporter:', err)
  }
}
 
const selectReport = (report) => {
  selectedReport.value = report
}
 
const formattedReportURL = computed(() => {
  if (!selectedReport.value) return ''
  
  let url = selectedReport.value.ReportURL
  
  // Vi sätter rc:Parameters=True så att parametrarna alltid är utfällda i den nya fliken!
  if (!url.includes('rc:Parameters=')) {
    url += url.includes('?') ? '&rc:Parameters=True' : '?rc:Parameters=True'
  } else {
    url = url.replace('rc:Parameters=Collapsed', 'rc:Parameters=True')
    url = url.replace('rc:Parameters=False', 'rc:Parameters=True')
  }
  
  return url
})
 
onMounted(() => {
  fetchReports()
})
</script>
 
<style scoped>
.reports-container {
  display: flex;
  height: calc(100vh - 120px);
  background: #f9fafb;
}
 
.reports-sidebar {
  width: 320px;
  background: white;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
 
.sidebar-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}
 
.sidebar-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
}
 
.sidebar-header p {
  margin: 0;
  font-size: 0.875rem;
  color: #6b7280;
}
 
.report-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
 
.report-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  width: 100%;
}
 
.report-item:hover {
  background: #f3f4f6;
}
 
.report-item.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}
 
.report-icon {
  font-size: 1.5rem;
}
 
.report-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
 
.report-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: #1f2937;
}
 
.report-item.active .report-title {
  color: #2563eb;
}
 
.report-desc {
  font-size: 0.8rem;
  color: #6b7280;
}
 
/* Viewer / Card */
.reports-viewer {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  padding: 2rem;
}
 
.viewer-wrapper {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  padding: 3rem;
  max-width: 600px;
  width: 100%;
  text-align: center;
}
 
.report-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}
 
.card-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}
 
.report-card h2 {
  margin: 0 0 1rem 0;
  font-size: 1.75rem;
  color: #111827;
}
 
.card-desc {
  color: #4b5563;
  font-size: 1.1rem;
  margin-bottom: 2rem;
  line-height: 1.5;
}
 
.info-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.25rem;
  text-align: left;
  margin-bottom: 2rem;
  width: 100%;
}
 
.info-box p {
  margin: 0 0 0.75rem 0;
  font-size: 0.9rem;
  color: #374151;
}
 
.info-box p:last-child {
  margin: 0;
  color: #6b7280;
}
 
.info-box code {
  background: #f3f4f6;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.85rem;
  word-break: break-all;
}
 
.btn-open-report {
  display: inline-block;
  background: #2563eb;
  color: white;
  font-weight: 600;
  font-size: 1.1rem;
  padding: 1rem 2rem;
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.2s ease;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
}
 
.btn-open-report:hover {
  background: #1d4ed8;
}
 
/* Empty State */
.no-report-selected {
  text-align: center;
}
 
.empty-state {
  max-width: 360px;
}
 
.empty-icon {
  font-size: 3.5rem;
  display: block;
  margin-bottom: 1rem;
}
 
.empty-state h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #374151;
}
 
.empty-state p {
  color: #6b7280;
  font-size: 0.875rem;
}
</style>