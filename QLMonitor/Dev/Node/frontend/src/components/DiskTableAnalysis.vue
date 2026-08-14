<template>
  <div class="table-analysis-container">
    <div class="analysis-header-section">
      <div class="header-title-group">
        <span class="header-icon">📊</span>
        <div>
          <h3>Djuphamn & Tabellanalys</h3>
          <p class="subtitle">Analysera vilka tabeller och index som tar mest plats på {{ serverName }}</p>
        </div>
      </div>
 
      <!-- Databasväljare -->
      <div class="db-selector-wrapper">
        <label for="db-select">Välj databas:</label>
        <div class="select-container">
          <select 
            id="db-select" 
            v-model="selectedDatabase" 
            @change="loadTableSizes"
            :disabled="loadingDatabases || loadingTables"
          >
            <option value="" disabled>-- Välj en databas --</option>
            <option 
              v-for="db in databases" 
              :key="db.DatabaseName" 
              :value="db.DatabaseName"
            >
              {{ db.DatabaseName }} {{ db.IsEnabled ? '' : '(Query Store ej aktiv)' }}
            </option>
          </select>
          <span class="select-arrow">▼</span>
        </div>
      </div>
    </div>
 
    <!-- Laddningsindikator för databaser -->
    <div v-if="loadingDatabases" class="status-box loading">
      <div class="spinner"></div>
      <span>Hämtar tillgängliga databaser...</span>
    </div>
 
    <!-- Felmeddelande -->
    <div v-else-if="error" class="status-box error-box">
      <span class="error-icon">⚠️</span>
      <div class="error-content">
        <h4>Ett fel uppstod</h4>
        <p>{{ error }}</p>
      </div>
      <button class="retry-btn" @click="initializeComponent">Försök igen</button>
    </div>
 
    <!-- Ingen databas vald än -->
    <div v-else-if="!selectedDatabase" class="status-box info-box">
      <span class="info-icon">💡</span>
      <span>Välj en databas i menyn ovan för att analysera tabellstorlekar.</span>
    </div>
 
    <!-- Laddar tabeller -->
    <div v-else-if="loadingTables" class="status-box loading">
      <div class="spinner"></div>
      <span>Analyserar tabellstrukturer och beräknar storlekar...</span>
    </div>
 
    <!-- Tabellpresentation -->
    <div v-else class="table-results-wrapper">
      <div class="table-meta-summary">
        <span class="meta-item">Visar de <b>{{ tableSizes.length }}</b> största tabellerna</span>
        <span class="meta-item">Totalt lagringsutrymme i urvalet: <b>{{ formatSize(totalSelectedSpace) }}</b></span>
      </div>
 
      <div class="table-scroll-container">
        <table class="custom-analysis-table">
          <thead>
            <tr>
              <th class="col-name">Tabellnamn</th>
              <th class="col-rows text-right">Rader</th>
              <th class="col-distribution">Utrymmesfördelning (Data / Index)</th>
              <th class="col-size text-right">Data</th>
              <th class="col-size text-right">Index</th>
              <th class="col-size text-right">Oanvänt</th>
              <th class="col-size text-right highlight-col">Totalt reserverat</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="table in tableSizes" :key="table.SchemaName + '.' + table.TableName" class="table-row">
              <!-- Tabell & Schema -->
              <td class="col-name">
                <div class="table-identity">
                  <span class="schema-badge">{{ table.SchemaName }}</span>
                  <span class="table-name-text" :title="table.SchemaName + '.' + table.TableName">
                    {{ table.TableName }}
                  </span>
                </div>
              </td>
 
              <!-- Radantal -->
              <td class="col-rows text-right font-mono">
                {{ formatRows(table.NumRows) }}
              </td>
 
              <!-- Visuell fördelning (Data vs Index) -->
              <td class="col-distribution">
                <div class="distribution-bar-wrapper" title="Grön = Data, Lila = Index, Mörkgrå = Oanvänt">
                  <div 
                    class="dist-segment data-segment" 
                    :style="{ width: getPercentOfTotal(table.DataSpaceMB, table.ReservedSpaceMB) + '%' }"
                  ></div>
                  <div 
                    class="dist-segment index-segment" 
                    :style="{ width: getPercentOfTotal(table.IndexSizeMB, table.ReservedSpaceMB) + '%' }"
                  ></div>
                  <div 
                    class="dist-segment unused-segment" 
                    :style="{ width: getPercentOfTotal(table.UnusedSpaceMB, table.ReservedSpaceMB) + '%' }"
                  ></div>
                </div>
              </td>
 
              <!-- Storlekar -->
              <td class="col-size text-right font-mono text-muted">
                {{ formatSize(table.DataSpaceMB) }}
              </td>
              <td class="col-size text-right font-mono text-purple">
                {{ formatSize(table.IndexSizeMB) }}
              </td>
              <td class="col-size text-right font-mono text-dim">
                {{ formatSize(table.UnusedSpaceMB) }}
              </td>
              <td class="col-size text-right font-mono highlight-col font-bold">
                {{ formatSize(table.ReservedSpaceMB) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
 
<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import axios from 'axios';
 
const props = defineProps({
  serverName: {
    type: String,
    required: true
  }
});
 
const databases = ref([]);
const selectedDatabase = ref('');
const tableSizes = ref([]);
const loadingDatabases = ref(false);
const loadingTables = ref(false);
const error = ref(null);
 
// Beräkna totalt reserverat utrymme för de laddade tabellerna
const totalSelectedSpace = computed(() => {
  return tableSizes.value.reduce((sum, table) => sum + (table.ReservedSpaceMB || 0), 0);
});
 
// Initiera komponenten och hämta databaser
const initializeComponent = async () => {
  if (!props.serverName) return;
  
  loadingDatabases.value = true;
  error.value = null;
  databases.value = [];
  selectedDatabase.value = '';
  tableSizes.value = [];
 
  try {
    // Vi återanvänder din befintliga query-store-status endpoint för att hämta databaslistan!
    const response = await axios.get(
      `http://sllbi01:3003/api/server/${encodeURIComponent(props.serverName)}/query-store-status`,
      { withCredentials: true }
    );
    
    if (response.data && response.data.databases) {
      databases.value = response.data.databases;
    } else {
      error.value = "Kunde inte hämta databaslistan från servern.";
    }
  } catch (err) {
    console.error("Fel vid laddning av databaser:", err);
    error.value = err.response?.data?.error || err.message || "Ett okänt fel uppstod vid anslutning till servern.";
  } finally {
    loadingDatabases.value = false;
  }
};
 
// Hämta tabellstorlekar för vald databas
const loadTableSizes = async () => {
  if (!props.serverName || !selectedDatabase.value) return;
 
  loadingTables.value = true;
  error.value = null;
  tableSizes.value = [];
 
  try {
    const response = await axios.get(
      `http://sllbi01:3003/api/server/${encodeURIComponent(props.serverName)}/database/${encodeURIComponent(selectedDatabase.value)}/table-sizes`,
      { withCredentials: true }
    );
    tableSizes.value = response.data || [];
  } catch (err) {
    console.error("Fel vid hämtning av tabellstorlekar:", err);
    error.value = `Kunde inte läsa tabellstorlekar för [${selectedDatabase.value}]: ` + (err.response?.data?.error || err.message);
  } finally {
    loadingTables.value = false;
  }
};
 
// Hjälpfunktion: Beräkna procentandel av totalt utrymme för segmenten
const getPercentOfTotal = (value, total) => {
  if (!total || !value) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
};
 
// Formatera radantal
const formatRows = (rows) => {
  if (rows === null || rows === undefined) return '0';
  return Number(rows).toLocaleString('sv-SE');
};
 
// Formatera storlek (indata är i MB)
const formatSize = (mb) => {
  if (mb === null || mb === undefined) return '0 MB';
  if (mb < 1024) return `${mb.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} GB`;
  const tb = gb / 1024;
  return `${tb.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} TB`;
};
 
// Ladda om ifall servern ändras
watch(() => props.serverName, () => {
  initializeComponent();
});
 
onMounted(() => {
  initializeComponent();
});
</script>
 
<style scoped>
.table-analysis-container {
  background: var(--bg-card-custom, #151d30);
  border-radius: 16px;
  padding: 1.5rem;
  border: 2px solid var(--border, #1e293b);
  box-shadow: var(--shadow);
  margin-top: 1.5rem;
}
 
/* Header */
.analysis-header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border, #1e293b);
}
 
.header-title-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}
 
.header-icon {
  font-size: 2rem;
}
 
.header-title-group h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-h, #ffffff);
  margin: 0 0 0.25rem 0;
}
 
.subtitle {
  font-size: 0.875rem;
  color: var(--text, #94a3b8);
  margin: 0;
  opacity: 0.8;
}
 
/* Select Dropdown */
.db-selector-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
}
 
.db-selector-wrapper label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-h, #ffffff);
}
 
.select-container {
  position: relative;
  min-width: 240px;
}
 
.select-container select {
  width: 100%;
  padding: 0.625rem 2.5rem 0.625rem 1rem;
  background: var(--code-bg, #0f172a);
  border: 1px solid var(--border, #1e293b);
  border-radius: 8px;
  color: var(--text-h, #ffffff);
  font-weight: 600;
  font-size: 0.875rem;
  appearance: none;
  cursor: pointer;
  transition: all 0.2s ease;
}
 
.select-container select:focus {
  outline: none;
  border-color: var(--accent, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
 
.select-arrow {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  color: var(--text, #94a3b8);
  pointer-events: none;
}
 
/* Statuslådor */
.status-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 2rem;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 12px;
  border: 1px dashed var(--border, #1e293b);
  color: var(--text, #94a3b8);
  font-size: 0.95rem;
}
 
.loading .spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(59, 130, 246, 0.1);
  border-top-color: var(--accent, #3b82f6);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
 
@keyframes spin {
  to { transform: rotate(360deg); }
}
 
.error-box {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
  color: #f87171;
  flex-direction: column;
  text-align: center;
  padding: 2rem;
}
 
.error-icon {
  font-size: 2.5rem;
}
 
.error-content h4 {
  margin: 0 0 0.5rem 0;
  font-weight: 700;
}
 
.error-content p {
  margin: 0;
  font-size: 0.875rem;
  opacity: 0.9;
}
 
.retry-btn {
  margin-top: 1rem;
  padding: 0.5rem 1.25rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
 
.retry-btn:hover {
  background: #dc2626;
}
 
/* Resultat & Tabell */
.table-meta-summary {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  color: var(--text, #94a3b8);
  margin-bottom: 1rem;
  padding: 0 0.25rem;
}
 
.table-scroll-container {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid var(--border, #1e293b);
}
 
.custom-analysis-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;
  background: rgba(15, 23, 42, 0.2);
}
 
.custom-analysis-table th {
  background: var(--code-bg, #0f172a);
  padding: 1rem;
  font-weight: 600;
  color: var(--text-h, #ffffff);
  border-bottom: 1px solid var(--border, #1e293b);
  letter-spacing: 0.5px;
}
 
.custom-analysis-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--border, #1e293b);
  color: var(--text, #94a3b8);
  vertical-align: middle;
}
 
.table-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
 
/* Kolumnspecifika stilar */
.col-name { min-width: 250px; }
.col-rows { width: 120px; }
.col-distribution { min-width: 200px; }
.col-size { width: 110px; }
.highlight-col {
  background: rgba(255, 255, 255, 0.015);
}
 
.text-right { text-align: right; }
.font-mono { font-family: monospace; font-size: 0.9rem; }
.font-bold { font-weight: 700; }
 
.text-muted { color: #10b981; } /* Data = Grön */
.text-purple { color: #a78bfa; } /* Index = Lila */
.text-dim { color: #64748b; } /* Oanvänt = Grå */
 
/* Tabellidentitet (Schema + Tabellnamn) */
.table-identity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
 
.schema-badge {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text, #94a3b8);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}
 
.table-name-text {
  font-weight: 600;
  color: var(--text-h, #ffffff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
 
/* Progress bar för utrymmesfördelning */
.distribution-bar-wrapper {
  display: flex;
  height: 8px;
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
}
 
.dist-segment {
  height: 100%;
  transition: width 0.3s ease;
}
 
.data-segment {
  background: #10b981; /* Grön */
}
 
.index-segment {
  background: #8b5cf6; /* Lila */
}
 
.unused-segment {
  background: #475569; /* Mörkgrå */
}
 
@media (max-width: 768px) {
  .analysis-header-section {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .db-selector-wrapper {
    width: 100%;
    justify-content: space-between;
  }
}
</style>