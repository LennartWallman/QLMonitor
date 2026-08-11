<template>
  <div class="job-list-wrapper">
    <div class="header-container">
      <h2>Jobb på: {{ serverName || 'Ingen server vald' }}</h2>
      
      <div class="controls-container" v-if="!isLoading && jobs.length > 0">
        <!-- ⚙️ Checkbox för att visa/dölja systemjobb (Standard: Dolda) -->
        <label class="system-jobs-toggle">
          <input 
            type="checkbox" 
            v-model="showSystemJobs" 
            class="toggle-checkbox"
          />
          <span class="toggle-label">Visa även systemjobb</span>
        </label>
 
        <!-- 🔍 Sökfält för realtidssökning -->
        <div class="search-container">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="Sök på jobbnamn eller status..." 
            class="search-input"
            clearable
          />
          <button v-if="searchQuery" @click="searchQuery = ''" class="btn-clear-search">&times;</button>
        </div>
      </div>
    </div>
    <div v-if="isLoading" class="loading-message">Hämtar jobbdata...</div>
 
    <div v-if="!isLoading && sortedJobs.length > 0" class="table-card">
      <table class="jobs-table">
        <thead>
          <tr>
            <th class="status-col">Status</th>
            <th class="jobname-col">Jobbnamn</th>
            <th class="date-col">Senaste körning</th>
            <th class="date-col">Nästa körning</th>
            <th class="progress-col">Progress</th>
            <th class="ack-col">Kvitterad / Löst</th>
            <th class="actions-col">Åtgärder</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="job in sortedJobs" 
            :key="job.unique_id" 
            @click="openDetailsModal(job)" 
            class="clickable-row">
            <!-- 1. Status -->
            <td>
              <div :class="['status-cell', getStatusClass(job.LastRunStatus)]">
                <span class="status-dot"></span>
                <span>{{ job.LastRunStatus }}</span>
              </div>
            </td>
 
            <!-- 2. Jobbnamn -->
              <td class="job-name-cell">
                <div class="job-name-container">
                  <!-- Om det är ett rapportjobb, visa en rapport-ikon -->
                  <span v-if="job.ReportPath" class="report-icon" title="SSRS Rapport">📊</span>
                  <div class="job-name-text">
                    <span>{{ job.JobName }}</span>
                    <!-- Visa sökvägen till rapporten i mindre text under namnet -->
                    <small v-if="job.ReportPath" class="report-path">{{ job.ReportPath }}</small>
                  </div>
                </div>
              </td>
            
            <!-- 3. Senaste körning -->
            <td>{{ formatDateTime(job.LastRunDateTime) }}</td>
            
            <!-- 4. Nästa körning -->
            <td>{{ formatDateTime(job.NextRunDateTime) }}</td>
            
            <!-- 5. Progress -->
            <td>
              <div v-if="job.LastRunStatus === 'Executing' && job.TotalSteps" class="mini-progress">
                <div class="mini-progress-bar">
                  <div 
                    class="mini-progress-fill" 
                    :style="{width: `${(job.CurrentStep / job.TotalSteps) * 100}%`}">
                  </div>
                </div>
                <span class="mini-progress-text">{{ job.CurrentStep }} / {{ job.TotalSteps }}</span>
              </div>
              <span v-else>-</span>
            </td>
            
            <!-- 6. Kvitterad / Löst -->
            <td>
              <span v-if="job.AcknowledgedBy" class="acknowledged-tag">✓ Kvitterad av {{ job.AcknowledgedBy }}</span>
              <span v-else-if="job.HasSolution" class="solution-tag">💡 Lösning finns</span>
              <span v-else class="not-acknowledged">-</span>
            </td>
            
            <!-- 7. Åtgärder -->
            <td class="actions">
              <div class="actions-wrapper">
                <button v-if="job.LastRunStatus === 'Failed' && !job.AcknowledgedBy" @click.stop="openAcknowledgeModal(job)" class="btn-action btn-acknowledge">Kvittera</button>
                
                <button v-if="job.LastRunStatus === 'Failed'" @click.stop="openKnowledgeModal(job)" :class="['btn-action', 'btn-knowledge', { 'has-solution': job.HasSolution }]">
                  {{ job.HasSolution ? 'Visa Lösning' : 'Lägg till Lösning' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
 
    <p v-if="!isLoading && sortedJobs.length === 0 && serverName">Inga jobb hittades på denna server.</p>
 
    <!-- Modals -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showKnowledgeModal" class="modal-backdrop" @click.self="showKnowledgeModal = false">
          <div class="modal-content">
            <form @submit.prevent="submitKnowledge">
              <div class="modal-header">
                <h3>Spara lösning i kunskapsbasen</h3>
                <button type="button" @click="showKnowledgeModal = false" class="close-button">&times;</button>
              </div>
              <div class="modal-body">
                <p>Du dokumenterar en lösning för jobbet: <strong>{{ knowledgeForm.jobName }}</strong>.</p>
                
                <div v-if="knowledgeForm.errorCode" class="error-code-box">
                  <strong>Felnummer:</strong> {{ knowledgeForm.errorCode }}
                </div>
                
                <div class="form-group">
                  <label for="kb-author">Ditt namn/signatur:</label>
                  <input id="kb-author" type="text" v-model="knowledgeForm.author" class="form-input" required>
                </div>
                <div class="form-group">
                  <label for="kb-solution">Beskrivning av lösning:</label>
                  <textarea id="kb-solution" v-model="knowledgeForm.solutionNotes" class="form-textarea" rows="6" required></textarea>
                </div>
                <details open>
                  <summary>Frivillig information</summary>
                  <div class="form-group" style="margin-top: 1rem;">
                    <label for="kb-step">Specifikt steg:</label>
                    <input id="kb-step" type="text" v-model="knowledgeForm.stepName" class="form-input">
                  </div>
                  <div class="form-group">
                    <label for="kb-error">Felmeddelande:</label>
                    <textarea id="kb-error" v-model="knowledgeForm.errorMessage" class="form-textarea" rows="4"></textarea>
                  </div>
                </details>
              </div>
              <div class="modal-footer">
                <button type="button" @click="showKnowledgeModal = false" class="btn-secondary">Avbryt</button>
                <button type="submit" class="btn-submit">Spara lösning</button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
 
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAcknowledgeModal" class="modal-backdrop" @click.self="showAcknowledgeModal = false">
          <div class="modal-content">
            <form @submit.prevent="submitAcknowledgement">
              <div class="modal-header">
                <h3>Kvittera jobb</h3>
                <button type="button" @click="showAcknowledgeModal = false" class="close-button">&times;</button>
              </div>
              <div class="modal-body">
                <p>Du kvitterar jobbet: <strong>{{ ackForm.jobName }}</strong></p>
                <p style="color: #666; font-size: 0.9rem;">Detta signalerar till teamet att du arbetar med problemet.</p>
                <div class="form-group">
                  <label for="ack-user">Ditt namn/signatur:</label>
                  <input id="ack-user" type="text" v-model="ackForm.ackUser" class="form-input" required>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" @click="showAcknowledgeModal = false" class="btn-secondary">Avbryt</button>
                <button type="submit" class="btn-submit">Kvittera</button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
 
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showDetailsModal" class="modal-backdrop" @click.self="showDetailsModal = false">
          <div class="modal-content modal-large">
            <div class="modal-header">
              <h3>Jobbdetaljer: {{ selectedJobForDetails?.JobName }}</h3>
              <button type="button" @click="showDetailsModal = false" class="close-button">&times;</button>
            </div>
            <div class="modal-body" v-if="selectedJobForDetails">
              
              <!-- ✅ ANOMALIVARNINGAR -->
              <div v-if="jobAnomalies && (jobAnomalies.IsTooFast || jobAnomalies.IsTooSlow || jobAnomalies.IsUnusualRetry)" class="anomaly-warnings">
                <div v-if="jobAnomalies.IsTooFast" class="warning fast">
                  ⚡ <strong>Jobbet går ovanligt snabbt</strong><br>
                  Nuvarande: {{ formatDuration(jobAnomalies.CurrentDuration) }} | Normalt: {{ formatDuration(jobAnomalies.AvgDuration) }}
                </div>
                <div v-if="jobAnomalies.IsTooSlow" class="warning slow">
                  🐌 <strong>Jobbet går ovanligt långsamt</strong><br>
                  Nuvarande: {{ formatDuration(jobAnomalies.CurrentDuration) }} | Normalt: {{ formatDuration(jobAnomalies.AvgDuration) }}
                </div>
                <div v-if="jobAnomalies.IsUnusualRetry" class="warning retry">
                  🔄 <strong>Ovanligt många retries</strong><br>
                  Normalt: {{ jobAnomalies.NormalRetryPercent?.toFixed(1) }}%
                </div>
              </div>
 
              <!-- ✅ STEG-PROGRESS FÖR EXECUTING (STOR VERSION) -->
              <div v-if="selectedJobForDetails.LastRunStatus === 'Executing' && selectedJobForDetails.TotalSteps" class="progress-section">
                <h4>📊 Steg-progress</h4>
                <div class="progress-bar">
                  <div 
                    class="progress-fill" 
                    :style="{width: `${(selectedJobForDetails.CurrentStep / selectedJobForDetails.TotalSteps) * 100}%`}">
                    {{ selectedJobForDetails.CurrentStep }} / {{ selectedJobForDetails.TotalSteps }}
                  </div>
                </div>
              </div>
 
              <dl class="details-list">
                <dt>Status</dt>
                <dd>
                  <div :class="['status-cell', getStatusClass(selectedJobForDetails.LastRunStatus)]" style="font-weight: bold;">
                    <span class="status-dot"></span>
                    <span>{{ selectedJobForDetails.LastRunStatus }}</span>
                  </div>
                </dd>
                <dt>Senaste körning</dt>
                <dd>{{ formatDateTime(selectedJobForDetails.LastRunDateTime) }}</dd>
                <dt>Nästa körning</dt>
                <dd>{{ formatDateTime(selectedJobForDetails.NextRunDateTime) }}</dd>
                <dt>Jobbtyper</dt>
                <dd>{{ selectedJobForDetails.JobTypes || '-' }}</dd>
                <dt>Kategori</dt>
                <dd>{{ selectedJobForDetails.CategoryName || '-' }}</dd>
                <dt>Aktiverad</dt>
                <dd>{{ selectedJobForDetails.IsEnabled ? 'Ja' : 'Nej' }}</dd>
                <dt>Totalt antal steg</dt>
                <dd>{{ selectedJobForDetails.TotalSteps || '-' }}</dd>
                <dt v-if="selectedJobForDetails.ErrorCode">Felnummer</dt>
                <dd v-if="selectedJobForDetails.ErrorCode" style="color: #d32f2f; font-weight: bold;">
                  {{ selectedJobForDetails.ErrorCode }}
                </dd>
              </dl>
 
              <!-- ✅ MODERN VISUELL STEPPER -->
              <div class="details-section" v-if="jobSteps && jobSteps.length > 0">
                <h4>Körningsförlopp & Steg ({{ jobSteps.length }})</h4>
                
                <div class="stepper-container">
                  <div 
                    v-for="(step, index) in jobSteps" 
                    :key="step.step_id" 
                    :class="['step-row', { 'last-step': index === jobSteps.length - 1 }]"
                  >
                    <!-- Vänster: Tidslinje-linjen och status-noden -->
                    <div class="step-timeline">
                      <div :class="['step-node', getStepStatusClass(step.LastRunStatus)]" @click="toggleStepDetails(step.step_id)">
                        <span class="step-icon">{{ getStepIcon(step.subsystem) }}</span>
                      </div>
                      <!-- Kopplingslinje till nästa steg -->
                      <div 
                        v-if="index < jobSteps.length - 1" 
                        :class="['step-line', { 'line-success': step.LastRunStatus === 'Succeeded', 'line-failed': step.LastRunStatus === 'Failed' }]"
                      ></div>
                    </div>
 
                    <!-- Höger: Stegdetaljer i ett snyggt kort -->
                    <div 
                      :class="['step-details-card', { 'card-failed': step.LastRunStatus === 'Failed', 'card-expanded': expandedSteps.includes(step.step_id) }]"
                      @click="toggleStepDetails(step.step_id)"
                    >
                      <div class="step-header">
                        <div class="step-meta">
                          <span class="step-number">Steg {{ step.step_id }}</span>
                          <h5 class="step-name">
                            {{ step.step_name }}
                            <span v-if="step.command" class="expand-arrow">
                              {{ expandedSteps.includes(step.step_id) ? '▼' : '▶' }}
                            </span>
                          </h5>
                        </div>
                        <!-- Status Badge -->
                        <span :class="['status-badge', getStepStatusClass(step.LastRunStatus)]">
                          {{ step.LastRunStatus || 'Ej körd' }}
                        </span>
                      </div>
 
                      <div class="step-body">
                        <div class="meta-grid">
                          <div class="meta-item">
                            <span class="meta-label">Typ:</span>
                            <span class="meta-value type-tag">{{ step.subsystem }}</span>
                          </div>
                          <div class="meta-item" v-if="step.LastRunDuration">
                            <span class="meta-label">Körningstid:</span>
                            <span class="meta-value">{{ step.LastRunDuration }}</span>
                          </div>
                          <div class="meta-item" v-if="step.LastRunDateTime">
                            <span class="meta-label">Körd:</span>
                            <span class="meta-value">{{ formatDateTime(step.LastRunDateTime) }}</span>
                          </div>
                        </div>
                        
                        <!-- Expanderad T-SQL/SSIS-kod inuti kortet -->
                        <div v-if="expandedSteps.includes(step.step_id) && step.command" class="step-command-box" @click.stop>
                          <div class="command-header">
                            <strong>{{ step.subsystem === 'SSIS' ? '📦 SSIS Package Path' : '📝 T-SQL Command' }}</strong>
                            <button @click.stop="copyToClipboard(step.command)" class="btn-copy">📋 Kopiera</button>
                          </div>
                          <pre class="command-code">{{ step.command }}</pre>
                          <div v-if="step.database_name" class="command-meta">
                            <strong>Databas:</strong> {{ step.database_name }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
 
              <div class="details-section" v-if="selectedJobForDetails.ErrorMessage">
                <h4>Felmeddelande</h4>
                <pre class="error-message">{{ selectedJobForDetails.ErrorMessage }}</pre>
              </div>
 
                            <div class="details-section" v-if="selectedJobForDetails.LastRunStatus === 'Failed'">
                <h4>Historiska Lösningar (Kunskapsdatabas)</h4>
                
                <div v-if="isFetchingKnowledge">
                  <p>Hämtar historiska data...</p>
                </div>
                
                <div v-else>
                  <div v-if="knowledgeBaseEntries.length > 0">
                    <div v-for="entry in knowledgeBaseEntries" :key="entry.ID" class="kb-entry">
                      <pre class="kb-solution">{{ entry.SolutionNotes }}</pre>
                      <em class="kb-meta">Av: {{ entry.Author }} | Datum: {{ formatDateTime(entry.CreatedAt) }}</em>
                    </div>
                  </div>
                  <div v-else class="kb-no-entries">
                    Hittade inga tidigare lösningar för detta jobb i kunskapsdatabasen.
                  </div>
                </div>
              </div>
 
              <div class="details-section" v-if="selectedJobForDetails.LastRunStatus === 'Failed' && hasSsisMapping">
                <h4>📦 SSIS-felmeddelanden</h4>
 
                <div v-if="isFetchingSsisErrors">
                  <p>Hämtar SSIS-loggar...</p>
                </div>
 
                <div v-else>
                  <div v-if="ssisErrors.length > 0" class="ssis-error-list">
                    <div v-for="(err, index) in ssisErrors" :key="index" class="ssis-error-entry">
                      <div class="ssis-error-header">
                        <span class="ssis-error-time">{{ formatDateTime(err.message_time) }}</span>
                        <span v-if="err.subcomponent_name" class="ssis-error-component">{{ err.subcomponent_name }}</span>
                      </div>
                      <div v-if="err.package_path" class="ssis-error-path">{{ err.package_path }}</div>
                      <pre class="ssis-error-message">{{ err.message }}</pre>
                    </div>
                  </div>
                  <div v-else class="kb-no-entries">
                    Ingen detaljerad SSIS-loggning hittades för denna körning.
                  </div>
                </div>
              </div>
 
              <div class="details-section" v-if="selectedJobForDetails.Solution">
                <h4>Lösning</h4>
                <p class="solution-text">{{ selectedJobForDetails.Solution }}</p>
              </div>
            </div>
            <div class="modal-footer">
              <button 
                type="button" 
                @click="startJob(selectedJobForDetails)" 
                class="btn-submit btn-start-job">
                🚀 Kör jobb nu
              </button>
 
              <button type="button" @click="showDetailsModal = false" class="btn-secondary">Stäng</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
 
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { socketService } from '@/services/socketService'
 
// ✅ Props från App.vue
const props = defineProps({
  serverName: String
})
 
// ✅ State
const jobs = ref([])
const isLoading = ref(true)
const showAcknowledgeModal = ref(false)
const showKnowledgeModal = ref(false)
const showDetailsModal = ref(false)
const selectedJobForDetails = ref(null)
const jobSteps = ref([])
const knowledgeBaseEntries = ref([])
const isFetchingKnowledge = ref(false)
const jobAnomalies = ref(null)
const expandedSteps = ref([])
const searchQuery = ref('')
const showSystemJobs = ref(false)
const ssisErrors = ref([])
const isFetchingSsisErrors = ref(false)
const hasSsisMapping = ref(false) 
 
const ackForm = ref({ 
  jobName: '', 
  ackUser: 'Lennart Wallman(4G32)' 
})
 
const knowledgeForm = ref({ 
  jobId: null, 
  serverName: '', 
  jobName: '', 
  author: 'Lennart Wallman(4G32)', 
  solutionNotes: '', 
  stepName: '', 
  errorMessage: '',
  errorCode: ''
})
 
 
const sortedJobs = computed(() => {
  if (!jobs.value || jobs.value.length === 0) return []
  
  let filtered = jobs.value;
 
  // 1. ⚙️ Filtrera bort systemjobb om checkboxen INTE är markerad
  if (!showSystemJobs.value) {
    // Definiera vad som ska klassas som systemjobb
    const systemCategories = ['Systemjobb', '[Uncategorized (Local)]', 'REPL-Lidar'];
    
    filtered = filtered.filter(job => {
      const category = job.CategoryName ? job.CategoryName.trim() : '';
      const jobName = job.JobName ? job.JobName.toLowerCase() : '';
 
      // SÄKERHETSKONTROLL: Om det är ett rapportserver-jobb, dölj det ALDRIG
      const isReportServerJob = 
        category === 'Report Server' || 
        jobName.includes('ssrs') || 
        jobName.includes('report');
 
      if (isReportServerJob) {
        return true; // Visa alltid rapportjobb
      }
 
      // Annars, filtrera bort om det tillhör systemkategorierna
      return !systemCategories.includes(category);
    });
  }
 
  // 2. 🔍 Filtrera på sökfråga
  if (searchQuery.value.trim() !== '') {
    const query = searchQuery.value.toLowerCase().trim();
    filtered = filtered.filter(job => {
      const nameMatch = job.JobName ? job.JobName.toLowerCase().includes(query) : false;
      const statusMatch = job.LastRunStatus ? job.LastRunStatus.toLowerCase().includes(query) : false;
      return nameMatch || statusMatch;
    });
  }
 
  const jobsWithId = filtered.map((job, index) => ({ 
    ...job, 
    unique_id: `${job.JobID}-${index}` 
  }))
  
  return jobsWithId.sort((a, b) => {
    const getStatusPriority = (status) => {
      if (!status) return 99;
      const s = status.toLowerCase();
      if (s === 'executing' || s === 'in progress' || s === 'running') return 1;
      if (s === 'failed') return 2;
      if (s === 'succeeded') return 3;
      if (s === 'scheduled') return 4;
      return 5;
    }
 
    const priorityA = getStatusPriority(a.LastRunStatus);
    const priorityB = getStatusPriority(b.LastRunStatus);
 
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
 
    if (a.SortOrder !== undefined && b.SortOrder !== undefined) {
      if (a.SortOrder !== b.SortOrder) {
        return a.SortOrder - b.SortOrder;
      }
    }
    
    return (a.JobName || '').localeCompare(b.JobName || '');
  })
})
 
// ✅ Socket listener
const handleFullStatusUpdate = (data) => {
  if (data && data[props.serverName]) {
    const serverData = data[props.serverName];
    console.log(`📦 [JobList] fullStatusUpdate mottagen för ${props.serverName} med ${serverData.jobList?.length || 0} jobb.`)
    jobs.value = serverData.jobList || [];
    isLoading.value = false;
    return;
  }
  
  if (data?.jobs && Array.isArray(data.jobs)) {
    console.log(`📦 [JobList] fullStatusUpdate (fallback) mottagen med ${data.jobs.length} jobb.`)
    jobs.value = data.jobs;
    isLoading.value = false;
    return;
  }
 
  console.warn(`⚠️ [JobList] Mottog statusuppdatering men hittade ingen data för server: ${props.serverName}`, data);
}
 
// ✅ Watch for server changes
watch(() => props.serverName, (newServer) => {
  if (newServer) {
    console.log(`🔄 [JobList] Server ändrad till: ${newServer}`)
    isLoading.value = true
    jobs.value = []
    searchQuery.value = ''
  }
}, { immediate: true })
 
// ✅ Methods
const formatDateTime = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (isNaN(date)) return '-'
  return date.toLocaleString('sv-SE', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}
 
const formatDuration = (duration) => {
  if (!duration) return '00:00:00'
  const durationStr = duration.toString().padStart(6, '0')
  const hours = durationStr.substring(0, 2)
  const minutes = durationStr.substring(2, 4)
  const seconds = durationStr.substring(4, 6)
  return `${hours}:${minutes}:${seconds}`
}
 
const getStatusClass = (statusString) => {
  if (!statusString) {
    return 'status-unknown'
  }
  switch (statusString) {
    case 'Succeeded':
      return 'status-succeeded'
    case 'Failed':
      return 'status-failed'
    case 'Scheduled':
      return 'status-scheduled'
    case 'Disabled':
      return 'status-disabled'
    case 'Canceled':
      return 'status-canceled'
    case 'Executing':
    case 'In Progress':
    case 'Running':
      return 'status-running'
    default:
      return 'status-unknown'
  }
}
 
const getStepStatusClass = (status) => {
  if (status === 'Succeeded') return 'step-succeeded'
  if (status === 'Failed') return 'step-failed'
  return 'step-unknown'
}
 
// Mappa SQL Agent-stegtyper till snygga ikoner
const getStepIcon = (subsystem) => {
  if (!subsystem) return '⚙️'
  const s = subsystem.toLowerCase()
  if (s.includes('tsql') || s.includes('sql')) return '🗄️' // Databas
  if (s.includes('cmdexec') || s.includes('powershell') || s.includes('activexscript')) return '🖥️' // Skript/Terminal
  if (s.includes('ssis') || s.includes('dts')) return '📦' // Integration Services
  if (s.includes('analysis') || s.includes('as') || s.includes('analysisquery')) return '📊' // Analysis Services
  return '⚙️'
}
 
const openAcknowledgeModal = (job) => {
  ackForm.value.jobName = job.JobName
  showAcknowledgeModal.value = true
}
 
const openKnowledgeModal = async (job) => {
  knowledgeForm.value.jobId = job.JobID
  knowledgeForm.value.serverName = props.serverName
  knowledgeForm.value.jobName = job.JobName
  knowledgeForm.value.errorMessage = job.ErrorMessage || ''
  knowledgeForm.value.stepName = job.StepName || ''
  knowledgeForm.value.errorCode = job.ErrorCode || ''
  knowledgeForm.value.solutionNotes = ''
 
  if (job.HasSolution) {
    console.log('💡 Lösning finns, försöker hämta den...')
    try {
      const response = await fetch(`http://SLLBI01:3003/api/knowledge/${props.serverName}/${job.JobName}`)
      if (response.ok) {
        const entries = await response.json()
        if (entries.length > 0) {
          console.log('✅ Lösning hämtad, fyller i formuläret.')
          knowledgeForm.value.solutionNotes = entries[0].SolutionNotes
        }
      } else {
        console.error('❌ Kunde inte hämta befintlig lösning.')
      }
    } catch (error) {
      console.error('❌ Fel vid hämtning av lösning:', error)
    }
  }
  showKnowledgeModal.value = true
}
 
const openDetailsModal = async (job) => {
  console.log('🔍 [openDetailsModal] Klickade på jobb:', job)
 
  selectedJobForDetails.value = job
  showDetailsModal.value = true
  jobSteps.value = []
  knowledgeBaseEntries.value = []
  jobAnomalies.value = null
  ssisErrors.value = []
  hasSsisMapping.value = false
 
  // ✅ Hämta jobbsteg
  if (job.JobID) {
    try {
      console.log(`📡 [STEPS] Hämtar från: http://SLLBI01:3003/api/jobs/${props.serverName}/${job.JobID}/steps`)
      const response = await fetch(`http://SLLBI01:3003/api/jobs/${props.serverName}/${job.JobID}/steps`)
      if (response.ok) {
        jobSteps.value = await response.json()
        console.log('✅ [STEPS] Hämtade jobbsteg:', jobSteps.value)
      } else {
        console.error('❌ Kunde inte hämta jobbsteg')
      }
    } catch (error) {
      console.error('❌ Fel vid hämtning av jobbsteg:', error)
    }
  } else {
    console.warn('⚠️ [STEPS] Kan inte hämta steg, JobID saknas!')
  }
 
  // ✅ Hämta anomalidata
  if (job.JobID) {
    try {
      const anomalyResponse = await fetch(`http://SLLBI01:3003/api/job-anomalies/${job.JobID}`)
      if (anomalyResponse.ok) {
        jobAnomalies.value = await anomalyResponse.json()
        console.log('✅ [ANOMALIES] Hämtade anomalidata:', jobAnomalies.value)
      } else {
        console.error('❌ Kunde inte hämta anomalidata')
      }
    } catch (error) {
      console.error('❌ Fel vid hämtning av anomalidata:', error)
    }
  } else {
    console.warn('⚠️ [ANOMALIES] Kan inte hämta anomalier, JobID saknas!')
  }
 
  // ✅ Hämta kunskapsbasdata för misslyckade jobb
  if (job.LastRunStatus === 'Failed') {
    isFetchingKnowledge.value = true
    try {
      const knowledgeResponse = await fetch(`http://SLLBI01:3003/api/knowledge/${props.serverName}/${job.JobName}`)
      if (knowledgeResponse.ok) {
        knowledgeBaseEntries.value = await knowledgeResponse.json()
        console.log('✅ Hämtade historiska lösningar:', knowledgeBaseEntries.value)
      } else {
        console.error('❌ Kunde inte hämta historiska lösningar')
      }
    } catch (error) {
      console.error('❌ Fel vid hämtning av historiska lösningar:', error)
    } finally {
      isFetchingKnowledge.value = false
    }
  }
 
  // ✅ Hämta SSIS-felmeddelanden om jobbet har fallerat
  if (job.LastRunStatus === 'Failed') {
    isFetchingSsisErrors.value = true
    try {
      // Hitta SSIS-steget bland de redan hämtade jobbstegen
      const ssisStep = jobSteps.value.find(step =>
        step.subsystem && step.subsystem.toUpperCase() === 'SSIS'
      )
 
      if (ssisStep && ssisStep.command) {
        const jobStartTime = job.LastRunDateTime
        const url = `http://SLLBI01:3003/api/jobs/${props.serverName}/${encodeURIComponent(job.JobName)}/ssis-errors?jobStartTime=${encodeURIComponent(jobStartTime)}&command=${encodeURIComponent(ssisStep.command)}`
 
        console.log('📡 [SSIS] Anropar URL:', url)
        const ssisResponse = await fetch(url)
        console.log('📡 [SSIS] Statuskod:', ssisResponse.status)
 
        if (ssisResponse.ok) {
          const data = await ssisResponse.json()
          console.log('📡 [SSIS] Rådata från backend:', data)
          hasSsisMapping.value = data.hasMapping
          ssisErrors.value = data.errors || []
          console.log('✅ [SSIS] hasSsisMapping:', hasSsisMapping.value, '| Antal fel:', ssisErrors.value.length)
        } else {
          const errBody = await ssisResponse.text()
          console.error('❌ Kunde inte hämta SSIS-felmeddelanden. Status:', ssisResponse.status, 'Body:', errBody)
        }
      } else {
        console.log('ℹ️ [SSIS] Inget SSIS-steg hittades i jobbets steg — hoppar över.')
      }
    } catch (error) {
      console.error('❌ Fel vid hämtning av SSIS-felmeddelanden:', error)
    } finally {
      isFetchingSsisErrors.value = false
    }
  }
}
 
const submitAcknowledgement = async () => {
  try {
    const response = await fetch(`http://SLLBI01:3003/api/jobs/${props.serverName}/${ackForm.value.jobName}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledgedBy: ackForm.value.ackUser })
    })
 
    if (response.ok) {
      showAcknowledgeModal.value = false
    } else {
      const error = await response.json()
      alert('Kunde inte kvittera jobbet. Se konsolen för detaljer.')
    }
  } catch (error) {
    alert('Nätverksfel. Kontrollera att backend körs.')
  }
}
 
const submitKnowledge = async () => {
  try {
    socketService.emit('saveKnowledge', knowledgeForm.value)
    showKnowledgeModal.value = false
    alert('✅ Lösningen har sparats i kunskapsbasen!')
  } catch (error) {
    alert('❌ Kunde inte spara lösningen. Se konsolen för detaljer.')
  }
}
 
const startJob = (job) => {
  if (!job) return
  
  const confirmStart = confirm(`Är du säker på att du vill starta jobbet "${job.JobName}" på servern ${props.serverName}?`)
  if (!confirmStart) return
 
  socketService.emit('startJob', {
    serverName: props.serverName,
    jobName: job.JobName
  })
}
 
const handleJobStartedResult = (result) => {
  if (result.success) {
    alert(`✅ ${result.message}`)
    showDetailsModal.value = false
  } else {
    alert(`❌ Fel: ${result.message}`)
  }
}
 
const toggleStepDetails = (stepId) => {
  const index = expandedSteps.value.indexOf(stepId)
  if (index > -1) {
    expandedSteps.value.splice(index, 1)
  } else {
    expandedSteps.value.push(stepId)
  }
}
 
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    alert('✅ Kopierat till urklipp!')
  } catch (err) {
    alert('❌ Kunde inte kopiera till urklipp')
  }
} 
 
// ✅ Lifecycle hooks
onMounted(() => {
  socketService.on('fullStatusUpdate', handleFullStatusUpdate)
  socketService.on('jobStartedResult', handleJobStartedResult)
})
 
onBeforeUnmount(() => {
  socketService.off('fullStatusUpdate', handleFullStatusUpdate)
  socketService.off('jobStartedResult', handleJobStartedResult)
})
</script>
 
<style scoped>
.job-list-wrapper { 
  padding: 1rem; 
  background-color: var(--bg-app, #f5f5f5); 
  min-height: 100vh; 
  max-width: 100%; 
  overflow-x: hidden; 
  transition: background-color 0.3s ease;
}
.header-container { margin-bottom: 1rem; }
.header-container h2 { font-size: 1.5rem; color: var(--text-title, #333); font-weight: 600; }
.loading-message { text-align: center; padding: 2rem; font-size: 1.1rem; color: var(--text-muted, #666); }
.table-card { 
  background: var(--bg-card, white); 
  border-radius: 8px; 
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); 
  overflow-x: auto; 
  max-width: 100%; 
  border: 1px solid var(--border-color, #e0e0e0);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}
.jobs-table { 
  width: 100%; 
  border-collapse: collapse; /* Kollapsar kantlinjerna perfekt */
  font-size: 0.85rem; 
  table-layout: auto; 
}
.jobs-table thead { background-color: #1976d2; color: white; position: sticky; top: 0; z-index: 10; }
.jobs-table th { 
  padding: 0.75rem 1rem; 
  text-align: left; 
  font-weight: 600; 
  font-size: 0.85rem; 
  white-space: nowrap; 
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}
.jobs-table tbody tr { 
  border: none !important; /* Tar bort tr-kantlinjer */
  transition: background-color 0.2s; 
}
.jobs-table tbody tr:hover { background-color: var(--bg-app, #f5f5f5); }
.clickable-row { cursor: pointer; }
.jobs-table td { 
  padding: 0.75rem 1rem; 
  font-size: 0.85rem; 
  vertical-align: middle; 
  border-bottom: 1px solid var(--border-color, #e0e0e0); /* Sätter linjen direkt på td */
  color: var(--text-main, #333);
}
 
/* Fasta bredder för kolumnerna så inget hoppar */
.status-col { width: 110px; }
.jobname-col { width: auto; }
.date-col { width: 140px; }
.progress-col { width: 110px; }
.ack-col { width: 180px; }
.actions-col { width: 150px; }
 
/* Åtgärder-cellen */
.jobs-table td.actions {
  display: table-cell;
  text-align: left;
  white-space: nowrap;
}
.actions-wrapper {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
 
.status-cell { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; border-radius: 16px; font-weight: 500; font-size: 0.75rem; white-space: nowrap; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.status-failed { background-color: #ffebee; color: #c62828; }
.status-failed .status-dot { background-color: #c62828; }
.status-running { background-color: #fff3e0; color: #e65100; }
.status-running .status-dot { background-color: #e65100; animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.status-succeeded { background-color: #e8f5e9; color: #2e7d32; }
.status-succeeded .status-dot { background-color: #2e7d32; }
.status-scheduled { background-color: #e3f2fd; color: #1565c0; }
.status-scheduled .status-dot { background-color: #1565c0; }
.status-unknown { background-color: #f5f5f5; color: #757575; }
.status-unknown .status-dot { background-color: #757575; }
.status-disabled { background-color: #eceff1; color: #78909c; }
.status-disabled .status-dot { background-color: #78909c; }
.status-canceled { background-color: #fff8e1; color: #f57f17; }
.status-canceled .status-dot { background-color: #f57f17; }
.job-name-cell { font-weight: 500; color: #1976d2; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job-name-cell:hover { color: #1565c0; text-decoration: underline; cursor: pointer; }
 
/* Mini progress bar i tabellen */
.mini-progress { display: flex; align-items: center; gap: 0.5rem; }
.mini-progress-bar { width: 60px; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; }
.mini-progress-fill { height: 100%; background: linear-gradient(90deg, #1976d2, #42a5f5); transition: width 0.3s ease; }
.mini-progress-text { font-size: 0.75rem; color: var(--text-muted, #666); white-space: nowrap; }
 
/* Stor progress bar i detalj-modal */
.progress-section { margin-bottom: 2rem; padding: 1rem; background: var(--bg-app, #f9f9f9); border-radius: 8px; border: 1px solid var(--border-color, #e0e0e0); }
.progress-section h4 { margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--text-title, #333); }
.progress-bar { width: 100%; height: 32px; background: #e0e0e0; border-radius: 16px; overflow: hidden; position: relative; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #1976d2, #42a5f5); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.9rem; transition: width 0.5s ease; }
 
/* Anomalivarningar */
.anomaly-warnings { margin-bottom: 2rem; display: flex; flex-direction: column; gap: 0.75rem; }
.anomaly-warnings .warning { padding: 1rem; border-radius: 8px; border-left: 4px solid; font-size: 0.9rem; line-height: 1.6; }
.anomaly-warnings .warning.fast { background-color: #e3f2fd; border-color: #1976d2; color: #0d47a1; }
.anomaly-warnings .warning.slow { background-color: #fff3e0; border-color: #f57c00; color: #e65100; }
.anomaly-warnings .warning.retry { background-color: #fce4ec; border-color: #c2185b; color: #880e4f; }
 
.acknowledged-tag, .solution-tag { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 500; margin-right: 0.25rem; white-space: nowrap; }
.acknowledged-tag { background-color: #e3f2fd; color: #1976d2; }
.solution-tag { background-color: #f3e5f5; color: #7b1fa2; }
.not-acknowledged { color: var(--text-muted, #999); }
.actions { display: flex; gap: 0.25rem; flex-wrap: nowrap; }
.btn-action { padding: 0.4rem 0.7rem; border: none; border-radius: 4px; font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.btn-acknowledge { background-color: #1976d2; color: white; }
.btn-acknowledge:hover { background-color: #1565c0; }
.btn-knowledge { background-color: #7b1fa2; color: white; }
.btn-knowledge:hover { background-color: #6a1b9a; }
.btn-knowledge.has-solution { background-color: #9c27b0; }
.modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: var(--bg-card, white); color: var(--text-main, #333); border-radius: 8px; padding: 2rem; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); border: 1px solid var(--border-color, #e0e0e0); }
.modal-large { max-width: 900px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid var(--border-color, #e0e0e0); }
.modal-header h3 { margin: 0; font-size: 1.5rem; color: var(--text-title, #333); }
.close-button { background: none; border: none; font-size: 2rem; color: var(--text-muted, #999); cursor: pointer; line-height: 1; padding: 0; width: 32px; height: 32px; }
.close-button:hover { color: var(--text-title, #333); }
.modal-body { margin-bottom: 1.5rem; }
.form-group { margin-bottom: 1.5rem; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-muted, #555); }
.form-input, .form-textarea { width: 100%; padding: 0.75rem; border: 1px solid var(--border-color, #ddd); border-radius: 4px; font-size: 1rem; font-family: inherit; background-color: var(--bg-app, #fff); color: var(--text-main, #333); }
.form-textarea { resize: vertical; min-height: 100px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color, #e0e0e0); }
.btn-secondary, .btn-submit { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; font-size: 1rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
.btn-secondary { background-color: var(--border-color, #e0e0e0); color: var(--text-main, #333); }
.btn-secondary:hover { background-color: #d0d0d0; }
.btn-submit { background-color: #1976d2; color: white; }
.btn-submit:hover { background-color: #1565c0; }
.details-list { display: grid; grid-template-columns: 200px 1fr; gap: 1rem; margin-bottom: 2rem; }
.details-list dt { font-weight: 600; color: var(--text-muted, #555); }
.details-list dd { margin: 0; color: var(--text-main, #333); }
.details-section { margin-top: 2rem; padding-top: 2rem; border-top: 2px solid var(--border-color, #e0e0e0); }
.details-section h4 { margin-top: 0; margin-bottom: 1rem; font-size: 1.2rem; color: var(--text-title, #333); }
.error-message { background-color: #ffebee; color: #c62828; padding: 1rem; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 0.9rem; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto; }
.solution-text { background-color: #f3e5f5; color: #4a148c; padding: 1rem; border-radius: 4px; line-height: 1.6; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.3s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
details { margin-top: 1rem; padding: 1rem; background-color: var(--bg-app, #f9f9f9); border-radius: 4px; border: 1px solid var(--border-color, #e0e0e0); }
details summary { cursor: pointer; font-weight: 600; color: #1976d2; user-select: none; }
details summary:hover { color: #1565c0; }
.error-code-box { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 1rem; margin-bottom: 1.5rem; border-radius: 4px; font-size: 1rem; }
.error-code-box strong { color: #e65100; }
.kb-entry { border: 1px solid var(--border-color, #ddd); border-radius: 5px; margin-bottom: 1rem; background-color: var(--bg-card, #fff); box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.kb-solution { background-color: var(--bg-app, #f1f1f1); padding: 1rem; margin: 0; white-space: pre-wrap; word-wrap: break-word; color: var(--text-main, #333); font-family: 'Courier New', Courier, monospace; border-bottom: 1px solid var(--border-color, #ddd); }
.kb-meta { display: block; padding: 0.5rem 1rem; font-size: 0.85rem; color: var(--text-muted, #666); text-align: right; background-color: var(--bg-app, #f9f9f9); }
.kb-no-entries { padding: 1rem; text-align: center; color: var(--text-muted, #888); background-color: var(--bg-app, #f9f9f9); border-radius: 4px; border: 1px dashed var(--border-color, #ccc); }
 
/* Expanderbara steg-rader */
.expandable-row {
  transition: background-color 0.2s;
}
 
.expandable-row:hover {
  background-color: #e3f2fd !important;
}
 
.expand-icon {
  margin-left: 0.5rem;
  color: #1976d2;
  font-size: 0.8rem;
}
 
.step-details-row {
  background-color: #fafafa !important;
}
 
.step-details-row:hover {
  background-color: #fafafa !important;
}
 
.step-command-box {
  padding: 1rem;
  background: var(--bg-card, white);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  margin: 0.5rem;
}
 
.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #1976d2;
}
 
.command-header strong {
  color: #1976d2;
  font-size: 0.95rem;
}
 
.btn-copy {
  padding: 0.4rem 0.8rem;
  background-color: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
 
.btn-copy:hover {
  background-color: #1565c0;
  transform: translateY(-1px);
}
 
.command-code {
  background-color: var(--bg-app, #f5f5f5);
  padding: 1rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--text-main, #333);
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
  border: 1px solid var(--border-color, #e0e0e0);
}
 
.command-code::selection {
  background-color: #bfdbfe;
}
 
.command-meta {
  margin-top: 0.75rem;
  padding: 0.5rem;
  background-color: #e3f2fd;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #1565c0;
}
 
/* Sökfält Layout */
.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}
 
/* ✅ NYTT: Behållare för kontroller (Sök + Checkbox) */
.controls-container {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
 
/* ✅ NYTT: Styling för checkboxen */
.system-jobs-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  padding: 0.4rem 0.8rem;
  background: var(--bg-card, white);
  border: 1px solid var(--border-color, #ccc);
  border-radius: 20px;
  font-size: 0.85rem;
  color: var(--text-main, #333);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  transition: all 0.2s ease;
}
 
.system-jobs-toggle:hover {
  border-color: #1976d2;
  background-color: var(--bg-app, #f7faff);
}
 
.toggle-checkbox {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: #1976d2;
}
 
.toggle-label {
  font-weight: 500;
}
 
.search-container {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 350px;
}
 
.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted, #888);
  font-size: 0.9rem;
  pointer-events: none;
}
 
.search-input {
  width: 100%;
  padding: 0.6rem 2.5rem 0.6rem 2.2rem;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 20px;
  font-size: 0.85rem;
  outline: none;
  transition: all 0.2s ease-in-out;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
  background-color: var(--bg-card, #fff);
  color: var(--text-main, #333);
}
 
.search-input:focus {
  border-color: #1976d2;
  box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.15);
}
 
.btn-clear-search {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  font-size: 1.2rem;
  color: var(--text-muted, #999);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
 
.btn-clear-search:hover {
  color: var(--text-title, #333);
}
 
/* ==========================================================================
   MODERN STEPPER STYLING
   ========================================================================== */
.stepper-container {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 1rem;
}
 
.step-row {
  display: flex;
  gap: 1.25rem;
  position: relative;
}
 
/* Tidslinje och noder */
.step-timeline {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 40px;
  flex-shrink: 0;
}
 
.step-node {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  z-index: 2;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  cursor: pointer;
  transition: transform 0.2s ease;
}
 
.step-node:hover {
  transform: scale(1.1);
}
 
.step-line {
  width: 3px;
  flex-grow: 1;
  background-color: var(--border-color, #e0e0e0);
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
  z-index: 1;
  border-radius: 2px;
}
 
/* Kopplingslinjefärger */
.step-line.line-success {
  background-color: #2e7d32;
}
.step-line.line-failed {
  background-color: #c62828;
}
 
/* Stegkortet till höger */
.step-details-card {
  flex: 1;
  background: var(--bg-card, #fcfcfc);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  padding: 0.85rem 1.25rem;
  margin-bottom: 0.75rem;
  transition: all 0.2s ease;
  cursor: pointer;
  color: var(--text-main, #333);
}
 
.step-details-card:hover {
  border-color: #1976d2;
  background-color: var(--bg-app, #f7faff);
  box-shadow: 0 2px 8px rgba(25, 118, 210, 0.05);
}
 
.step-details-card.card-failed {
  border-color: #ffcdd2;
  background-color: #fff8f8;
}
 
.step-details-card.card-failed:hover {
  border-color: #ef5350;
  background-color: #ffebee;
}
 
.step-details-card.card-expanded {
  border-color: #1976d2;
  background-color: var(--bg-card, white);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}
 
/* Steg Header */
.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
 
.step-meta {
  display: flex;
  flex-direction: column;
}
 
.step-number {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted, #888);
  letter-spacing: 0.05em;
}
 
.step-name {
  margin: 0.1rem 0 0 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-title, #333);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
 
.expand-arrow {
  font-size: 0.75rem;
  color: #1976d2;
}
 
/* Meta Grid */
.meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-top: 0.5rem;
}
 
.meta-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
}
 
.meta-label {
  color: var(--text-muted, #666);
}
 
.meta-value {
  font-weight: 500;
  color: var(--text-main, #333);
}
 
.type-tag {
  background: var(--border-color, #e0e0e0);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-family: monospace;
  color: var(--text-main, #333);
}
 
/* Status Badges för Stepper */
.status-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}
 
/* Färgteman för noder och badges */
.step-node.step-succeeded, .status-badge.step-succeeded {
  background-color: #e8f5e9;
  color: #2e7d32;
}
.step-node.step-failed, .status-badge.step-failed {
  background-color: #ffebee;
  color: #c62828;
}
.step-node.step-unknown, .status-badge.step-unknown {
  background-color: var(--border-color, #f5f5f5);
  color: var(--text-muted, #757575);
}
 
/* T-SQL Command Box inuti kortet */
.step-command-box {
  margin-top: 1rem;
  border-top: 1px solid var(--border-color, #e0e0e0);
  padding-top: 1rem;
}
 
/* Responsivitet för mindre skärmar */
@media (max-width: 768px) {
  .header-container {
    flex-direction: column;
    align-items: flex-start;
  }
  .controls-container {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  .search-container {
    width: 100%;
    min-width: unset;
  }
  .system-jobs-toggle {
    width: 100%;
    justify-content: center;
  }
}
.job-name-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.ssis-error-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
 
.ssis-error-entry {
  border: 1px solid var(--border-color, #ffcdd2);
  border-radius: 6px;
  background-color: var(--bg-card, #fff8f8);
  overflow: hidden;
}
 
.ssis-error-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #ffebee;
  border-bottom: 1px solid #ffcdd2;
  font-size: 0.8rem;
}
 
.ssis-error-time {
  font-weight: 600;
  color: #c62828;
}
 
.ssis-error-component {
  background-color: #fff;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-size: 0.7rem;
  color: #757575;
  border: 1px solid var(--border-color, #e0e0e0);
}
 
.ssis-error-path {
  padding: 0.4rem 1rem 0 1rem;
  font-size: 0.75rem;
  color: var(--text-muted, #888);
  font-family: 'Courier New', monospace;
  word-break: break-all;
}
 
.ssis-error-message {
  margin: 0;
  padding: 0.75rem 1rem;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: #c62828;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>