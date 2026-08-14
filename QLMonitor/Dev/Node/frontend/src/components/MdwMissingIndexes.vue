<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({
  serverName: String
});

// ✅ REACTIVE STATE - DESSA SAKNADES!
const missingIndexes = ref([]);
const isLoading = ref(true);
const error = ref(null);
const showModal = ref(false);
const generatedScript = ref('');
const loadingScript = ref(false);
const selectedIndex = ref(null);

async function fetchMissingIndexes(server) {
  if (!server) return;
 
  try {
    isLoading.value = true;
    error.value = null;
 
    const API_BASE_URL = import.meta.env.VITE_API_URL;
    const response = await fetch(`${API_BASE_URL}/api/mdw/missing-indexes?server=${server}`);
    
    if (!response.ok) {
      // Om servern skickar ett HTML-fel (som 404), undvik att parsa som JSON
      if (response.headers.get("content-type")?.includes("text/html")) {
          throw new Error(`Servern svarade med ett fel (HTTP ${response.status}). Kontrollera backend-loggarna.`);
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Nätverksfel');
    }
    
    const result = await response.json();
    console.log('📥 API Response:', result);
    
    missingIndexes.value = Array.isArray(result) ? result : (result.data || []);
    
    console.log(`✅ Laddade ${missingIndexes.value.length} saknade index`);
 
  } catch (e) {
    console.error(`❌ Fel vid hämtning av saknade index:`, e);
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
}

async function generateScript(index) {
  selectedIndex.value = index;
  loadingScript.value = true;
  showModal.value = true;
  generatedScript.value = 'Genererar skript...';
  
  try {
    console.log('🔍 Index data:', index);
    
    if (!index.TableName || index.TableName === 'null' || index.TableName === 'OKÄND_TABELL') {
      generatedScript.value = 'Fel: Tabellnamn saknas i data från SQL Server.\n\nKontrollera att din Missing Indexes-query returnerar korrekt TableName.';
      return;
    }
    
    const params = new URLSearchParams({
      serverName: props.serverName,
      dbName: index.DatabaseName,
      schemaName: index.SchemaName || 'dbo',
      tableName: index.TableName,
      equality: index.equality_columns || '',
      inequality: index.inequality_columns || '',
      included: index.included_columns || '',
      impact: index.ImpactScore
    });
    
    console.log('📤 Skickar params:', Object.fromEntries(params));
    
    const API_BASE_URL = import.meta.env.VITE_API_URL;
    const response = await fetch(`${API_BASE_URL}/api/generate-index-script?${params}`);
 
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || 'Kunde inte generera skript');
    }
    
    const data = await response.json();
    generatedScript.value = data.script;
  } catch (err) {
    console.error('❌ Fel:', err);
    generatedScript.value = `Fel: ${err.message}`;
  } finally {
    loadingScript.value = false;
  }
}

function closeModal() {
  showModal.value = false;
  generatedScript.value = '';
  selectedIndex.value = null;
}

function copyToClipboard() {
  navigator.clipboard.writeText(generatedScript.value);
  alert('Skript kopierat!');
}

// Watch för serverändring
watch(() => props.serverName, (newServer) => {
  if (newServer?.trim()) {
    console.log(`🔄 Laddar missing indexes för: ${newServer}`);
    fetchMissingIndexes(newServer);
  }
}, { immediate: true });

</script>

<template>
  <div class="missing-indexes-container">
    <h2>Mest värdefulla saknade index</h2>
    <p class="subtitle">Visar de 25 indexförslag som skulle ge störst prestandaförbättring. Klicka på en rad för att generera CREATE INDEX-skript.</p>

    <div v-if="isLoading" class="loading-state">
      <p>Hämtar data från {{ serverName }}...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>❌ {{ error }}</p>
    </div>

    <div v-else-if="missingIndexes.length === 0" class="empty-state">
      <p>✅ Hittade inga saknade index på {{ serverName }}. Allt ser bra ut!</p>
    </div>

    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Impact</th>
            <th>Databas</th>
            <th>Schema</th>
            <th>Tabell</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="(index, i) in missingIndexes" 
            :key="`${index.TableName}_${i}`"
            @click="generateScript(index)"
            class="clickable-row"
          >
            <td class="impact-cell">{{ Math.round(index.ImpactScore) }}</td>
            <td class="database-cell">{{ index.DatabaseName }}</td>
            <td class="schema-cell">{{ index.SchemaName }}</td>
            <td class="table-cell">{{ index.TableName }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal för skript -->
    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Genererat CREATE INDEX-skript</h3>
          <button @click="closeModal" class="close-btn">✖</button>
        </div>
        
        <div v-if="selectedIndex" class="index-details">
          <div class="detail-row">
            <strong>Databas:</strong> {{ selectedIndex.DatabaseName }}
          </div>
          <div class="detail-row">
            <strong>Schema:</strong> {{ selectedIndex.SchemaName }}
          </div>
          <div class="detail-row">
            <strong>Tabell:</strong> {{ selectedIndex.TableName }}
          </div>
          <div class="detail-row">
            <strong>Impact Score:</strong> {{ Math.round(selectedIndex.ImpactScore) }}
          </div>
          <div v-if="selectedIndex.equality_columns" class="detail-row">
            <strong>Jämlikhet (WHERE...=):</strong> 
            <code>{{ selectedIndex.equality_columns }}</code>
          </div>
          <div v-if="selectedIndex.inequality_columns" class="detail-row">
            <strong>Ojämlikhet (WHERE...>):</strong> 
            <code>{{ selectedIndex.inequality_columns }}</code>
          </div>
          <div v-if="selectedIndex.included_columns" class="detail-row">
            <strong>Inkludera (INCLUDE):</strong> 
            <code>{{ selectedIndex.included_columns }}</code>
          </div>
        </div>
        
        <div class="modal-body">
          <pre class="script-display">{{ generatedScript }}</pre>
        </div>
        <div class="modal-footer">
          <button @click="copyToClipboard" class="copy-btn">📋 Kopiera</button>
          <button @click="closeModal" class="close-btn-footer">Stäng</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.missing-indexes-container {
  font-family: sans-serif;
  padding: 2rem;
  background-color: #f9f9f9;
  border-radius: 8px;
}

h2 {
  color: #333;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  margin-top: 0;
  margin-bottom: 2rem;
  font-size: 0.9rem;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

th, td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

thead th {
  background-color: #eef2f7;
  color: #333;
  font-weight: 600;
}

.clickable-row {
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

.clickable-row:hover {
  background-color: #e3f2fd;
  transform: scale(1.01);
}

.clickable-row:active {
  transform: scale(0.99);
}

.impact-cell {
  font-weight: bold;
  font-size: 1.1em;
  color: #2c3e50;
  min-width: 100px;
}

.database-cell {
  font-weight: bold;
  color: #2980b9;
}

.schema-cell {
  color: #16a085;
  font-weight: 500;
}

.table-cell {
  font-family: 'Courier New', Courier, monospace;
  color: #34495e;
}

.loading-state, .error-state, .empty-state {
  text-align: center;
  padding: 2rem;
  color: #777;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: #4CAF50;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 1.5em;
  cursor: pointer;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #fff;
}

.index-details {
  padding: 15px 20px;
  background: #2a2a2a;
  border-bottom: 1px solid #333;
}

.detail-row {
  margin-bottom: 8px;
  color: #ccc;
  font-size: 0.9em;
}

.detail-row strong {
  color: #4CAF50;
  margin-right: 8px;
}

.detail-row code {
  background: #1e1e1e;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  color: #f8f8f2;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.script-display {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 15px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
}

.modal-footer {
  padding: 20px;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.copy-btn {
  background: #2196F3;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.copy-btn:hover {
  background: #0b7dda;
}

.close-btn-footer {
  background: #666;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.close-btn-footer:hover {
  background: #555;
}
</style>
