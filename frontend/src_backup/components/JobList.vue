<!-- JobList.vue - KOMPLETT UPPDATERAD VERSION -->
<template>
  <div class="job-list-wrapper">
    <div class="header-container">
      <h2>Jobb på: {{ serverName || 'Ingen server vald' }}</h2>
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
            <td>
              <div :class="['status-cell', getStatusClass(job.LastRunStatus)]">
                <span class="status-dot"></span>
                <span>{{ job.LastRunStatus }}</span>
              </div>
            </td>
            <td class="job-name-cell">{{ job.JobName }}</td>
            <td>{{ formatDateTime(job.LastRunDateTime) }}</td>
            <td>{{ formatDateTime(job.NextRunDateTime) }}</td>
            <td>
              <span v-if="job.AcknowledgedBy" class="acknowledged-tag">✓ Kvitterad av {{ job.AcknowledgedBy }}</span>
              <span v-else-if="job.HasSolution" class="solution-tag">💡 Lösning finns</span>
              <span v-else class="not-acknowledged">-</span>
            </td>
            <td class="actions">
              <button v-if="job.LastRunStatus === 'Failed' && !job.AcknowledgedBy" @click.stop="openAcknowledgeModal(job)" class="btn-action btn-acknowledge">Kvittera</button>
              
              <button v-if="job.LastRunStatus === 'Failed'" @click.stop="openKnowledgeModal(job)" :class="['btn-action', 'btn-knowledge', { 'has-solution': job.HasSolution }]">
                {{ job.HasSolution ? 'Visa Lösning' : 'Lägg till Lösning' }}
              </button>
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
 
      <Transition name="modal">
        <div v-if="showDetailsModal" class="modal-backdrop" @click.self="showDetailsModal = false">
          <div class="modal-content modal-large">
            <div class="modal-header">
              <h3>Jobbdetaljer: {{ selectedJobForDetails?.JobName }}</h3>
              <button type="button" @click="showDetailsModal = false" class="close-button">&times;</button>
            </div>
            <div class="modal-body" v-if="selectedJobForDetails">
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
 
              <div class="details-section" v-if="jobSteps && jobSteps.length > 0">
                <h4>Jobbsteg ({{ jobSteps.length }})</h4>
                <table class="steps-table">
                  <thead>
                    <tr>
                      <th>Steg</th>
                      <th>Namn</th>
                      <th>Typ</th>
                      <th>Status</th>
                      <th>Körningstid</th>
                      <th>Senaste körning</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="step in jobSteps" :key="step.step_id" :class="{'failed-step': step.LastRunStatus === 'Failed'}">
                      <td>{{ step.step_id }}</td>
                      <td><strong>{{ step.step_name }}</strong></td>
                      <td>{{ step.subsystem }}</td>
                      <td>
                        <span :class="['step-status', getStepStatusClass(step.LastRunStatus)]">
                          {{ step.LastRunStatus || 'Ej körd' }}
                        </span>
                      </td>
                      <td>{{ step.LastRunDuration || '-' }}</td>
                      <td>{{ formatDateTime(step.LastRunDateTime) }}</td>
                    </tr>
                  </tbody>
                </table>
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
 
              <div class="details-section" v-if="selectedJobForDetails.Solution">
                <h4>Lösning</h4>
                <p class="solution-text">{{ selectedJobForDetails.Solution }}</p>
              </div>
            </div>
            <div class="modal-footer">
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
 
// ✅ Computed
const sortedJobs = computed(() => {
  if (!jobs.value) return []
  return jobs.value.map((job, index) => ({ 
    ...job, 
    unique_id: `${job.job_id}-${index}` 
  }))
})
 
// ✅ Socket listener - NU ENDAST EN!
const handleFullStatusUpdate = (data) => {
  console.log(`📦 [JobList] fullStatusUpdate mottagen med ${data.jobs?.length || 0} jobb.`)
  if (data?.jobs && Array.isArray(data.jobs)) {
    jobs.value = data.jobs
  } else {
    // Om vi får en uppdatering utan jobb (t.ex. bara diskdata)
    // behåll den gamla listan om den finns, annars rensa.
    if (!jobs.value || jobs.value.length === 0) {
      jobs.value = [];
    }
  }
  isLoading.value = false
}
 
// ✅ Watch for server changes
watch(() => props.serverName, (newServer) => {
  if (newServer) {
    console.log(`🔄 [JobList] Server ändrad till: ${newServer}`)
    isLoading.value = true
    jobs.value = [] // Rensa listan direkt vid byte
    // INGET BEHOV AV ATT BEGÄRA DATA, DET SKER AUTOMATISKT VID PRENUMERATION
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
 
const openAcknowledgeModal = (job) => {
  ackForm.value.jobName = job.JobName
  showAcknowledgeModal.value = true
}
 
const openKnowledgeModal = async (job) => {
  knowledgeForm.value.jobId = job.job_id
  knowledgeForm.value.serverName = props.serverName
  knowledgeForm.value.jobName = job.JobName
  knowledgeForm.value.errorMessage = job.ErrorMessage || ''
  knowledgeForm.value.stepName = job.StepName || ''
  knowledgeForm.value.errorCode = job.ErrorCode || ''
  knowledgeForm.value.solutionNotes = ''
 
  if (job.HasSolution) {
    console.log('💡 Lösning finns, försöker hämta den...')
    try {
      const response = await fetch(`http://localhost:3003/api/knowledge/${props.serverName}/${job.JobName}`)
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
 
  try {
    const response = await fetch(`http://localhost:3003/api/jobs/${props.serverName}/${job.job_id}/steps`)
    if (response.ok) {
      jobSteps.value = await response.json()
      console.log('✅ Hämtade jobbsteg:', jobSteps.value)
    } else {
      console.error('❌ Kunde inte hämta jobbsteg')
    }
  } catch (error) {
    console.error('❌ Fel vid hämtning av jobbsteg:', error)
  }
 
  if (job.LastRunStatus === 'Failed') {
    isFetchingKnowledge.value = true
    try {
      const knowledgeResponse = await fetch(`http://localhost:3003/api/knowledge/${props.serverName}/${job.JobName}`)
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
}
 
const submitAcknowledgement = async () => {
  console.log('📝 Kvitterar jobb:', ackForm.value.jobName)
  
  try {
    const response = await fetch(`http://localhost:3003/api/jobs/${props.serverName}/${ackForm.value.jobName}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledgedBy: ackForm.value.ackUser })
    })
 
    if (response.ok) {
      console.log('✅ Jobb kvitterat')
      showAcknowledgeModal.value = false
      // INGET BEHOV AV ATT BEGÄRA DATA, BACKEND SKICKAR EN UPPDATERING AUTOMATISKT
    } else {
      const error = await response.json()
      console.error('❌ Kunde inte kvittera jobb:', error)
      alert('Kunde inte kvittera jobbet. Se konsolen för detaljer.')
    }
  } catch (error) {
    console.error('❌ Nätverksfel vid kvittering:', error)
    alert('Nätverksfel. Kontrollera att backend körs.')
  }
}
 
const submitKnowledge = async () => {
  console.log('💾 Sparar kunskap:', knowledgeForm.value)
  
  try {
    const response = await fetch(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:3003/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(knowledgeForm.value)
    })
 
    if (response.ok) {
      console.log('✅ Lösning sparad i kunskapsbasen')
      showKnowledgeModal.value = false
      // INGET BEHOV AV ATT BEGÄRA DATA, BACKEND SKICKAR EN UPPDATERING AUTOMATISKT
    } else {
      const error = await response.json()
      console.error('❌ Kunde inte spara lösning:', error)
      alert('Kunde inte spara lösningen. Se konsolen för detaljer.')
    }
  } catch (error) {
    console.error('❌ Nätverksfel vid sparning av kunskap:', error)
    alert('Nätverksfel. Kontrollera att backend körs.')
  }
}
 
// ✅ Lifecycle hooks
onMounted(() => {
  console.log('✅ [JobList] Komponent monterad')
  
  // Registrera den enda socket listener vi behöver
  socketService.on('fullStatusUpdate', handleFullStatusUpdate)
})
 
onBeforeUnmount(() => {
  console.log('👋 [JobList] Komponent avmonteras')
  
  // Ta bort socket listener
  socketService.off('fullStatusUpdate', handleFullStatusUpdate)
})
</script>
 
<style scoped>
.job-list-wrapper { padding: 1rem; background-color: #f5f5f5; min-height: 100vh; max-width: 100%; overflow-x: hidden; }
.header-container { margin-bottom: 1rem; }
.header-container h2 { font-size: 1.5rem; color: #333; font-weight: 600; }
.loading-message { text-align: center; padding: 2rem; font-size: 1.1rem; color: #666; }
.table-card { background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); overflow-x: auto; max-width: 100%; }
.jobs-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; table-layout: auto; }
.jobs-table thead { background-color: #1976d2; color: white; position: sticky; top: 0; z-index: 10; }
.jobs-table th { padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; font-size: 0.85rem; white-space: nowrap; }
.jobs-table tbody tr { border-bottom: 1px solid #e0e0e0; transition: background-color 0.2s; }
.jobs-table tbody tr:hover { background-color: #f5f5f5; }
.clickable-row { cursor: pointer; }
.jobs-table td { padding: 0.75rem 0.5rem; font-size: 0.85rem; vertical-align: middle; }
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
.acknowledged-tag, .solution-tag { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 500; margin-right: 0.25rem; white-space: nowrap; }
.acknowledged-tag { background-color: #e3f2fd; color: #1976d2; }
.solution-tag { background-color: #f3e5f5; color: #7b1fa2; }
.not-acknowledged { color: #999; }
.actions { display: flex; gap: 0.25rem; flex-wrap: nowrap; }
.btn-action { padding: 0.4rem 0.7rem; border: none; border-radius: 4px; font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.btn-acknowledge { background-color: #1976d2; color: white; }
.btn-acknowledge:hover { background-color: #1565c0; }
.btn-knowledge { background-color: #7b1fa2; color: white; }
.btn-knowledge:hover { background-color: #6a1b9a; }
.btn-knowledge.has-solution { background-color: #9c27b0; }
.modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; border-radius: 8px; padding: 2rem; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); }
.modal-large { max-width: 900px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid #e0e0e0; }
.modal-header h3 { margin: 0; font-size: 1.5rem; color: #333; }
.close-button { background: none; border: none; font-size: 2rem; color: #999; cursor: pointer; line-height: 1; padding: 0; width: 32px; height: 32px; }
.close-button:hover { color: #333; }
.modal-body { margin-bottom: 1.5rem; }
.form-group { margin-bottom: 1.5rem; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #555; }
.form-input, .form-textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; font-family: inherit; }
.form-textarea { resize: vertical; min-height: 100px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 1rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; }
.btn-secondary, .btn-submit { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; font-size: 1rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
.btn-secondary { background-color: #e0e0e0; color: #333; }
.btn-secondary:hover { background-color: #d0d0d0; }
.btn-submit { background-color: #1976d2; color: white; }
.btn-submit:hover { background-color: #1565c0; }
.details-list { display: grid; grid-template-columns: 200px 1fr; gap: 1rem; margin-bottom: 2rem; }
.details-list dt { font-weight: 600; color: #555; }
.details-list dd { margin: 0; color: #333; }
.details-section { margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #e0e0e0; }
.details-section h4 { margin-top: 0; margin-bottom: 1rem; font-size: 1.2rem; color: #333; }
.error-message { background-color: #ffebee; color: #c62828; padding: 1rem; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 0.9rem; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto; }
.solution-text { background-color: #f3e5f5; color: #4a148c; padding: 1rem; border-radius: 4px; line-height: 1.6; }
.steps-table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; }
.steps-table thead { background-color: #f5f5f5; }
.steps-table th { padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.9rem; color: #555; border-bottom: 2px solid #e0e0e0; }
.steps-table tbody tr { border-bottom: 1px solid #e0e0e0; transition: background-color 0.2s; }
.steps-table tbody tr:hover { background-color: #fafafa; }
.steps-table tbody tr.failed-step { background-color: #ffebee; }
.steps-table tbody tr.failed-step:hover { background-color: #ffcdd2; }
.steps-table td { padding: 0.75rem; font-size: 0.9rem; }
.step-status { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.8rem; font-weight: 500; }
.step-succeeded { background-color: #e8f5e9; color: #2e7d32; }
.step-failed { background-color: #ffebee; color: #c62828; }
.step-unknown { background-color: #f5f5f5; color: #757575; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.3s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
details { margin-top: 1rem; padding: 1rem; background-color: #f9f9f9; border-radius: 4px; border: 1px solid #e0e0e0; }
details summary { cursor: pointer; font-weight: 600; color: #1976d2; user-select: none; }
details summary:hover { color: #1565c0; }
.error-code-box { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 1rem; margin-bottom: 1.5rem; border-radius: 4px; font-size: 1rem; }
.error-code-box strong { color: #e65100; }
.kb-entry { border: 1px solid #ddd; border-radius: 5px; margin-bottom: 1rem; background-color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.kb-solution { background-color: #f1f1f1; padding: 1rem; margin: 0; white-space: pre-wrap; word-wrap: break-word; color: #333; font-family: 'Courier New', Courier, monospace; border-bottom: 1px solid #ddd; }
.kb-meta { display: block; padding: 0.5rem 1rem; font-size: 0.85rem; color: #666; text-align: right; background-color: #f9f9f9; }
.kb-no-entries { padding: 1rem; text-align: center; color: #888; background-color: #f9f9f9; border-radius: 4px; border: 1px dashed #ccc; }
</style>