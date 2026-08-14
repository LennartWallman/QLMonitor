<script setup>
import { ref, watch } from 'vue';
 
const props = defineProps({
  serverName: String
});
 
const unusedIndexes = ref([]);
const isLoading = ref(true);
const error = ref(null);
const showModal = ref(false);
const generatedScript = ref('');
const selectedIndex = ref(null);
 
async function fetchUnusedIndexes(server) {
  if (!server) return;
 
  try {
    isLoading.value = true;
    error.value = null;
 
    const response = await fetch(`/api/mdw/unused-indexes?server=${server}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Nätverksfel');
    }
    
    const result = await response.json();
    console.log('📥 Oanvända Index Response:', result);
    
    unusedIndexes.value = Array.isArray(result) ? result : (result.data || []);
    console.log(`✅ Laddade ${unusedIndexes.value.length} oanvända index`);
 
  } catch (e) {
    console.error(`❌ Fel vid hämtning av oanvända index:`, e);
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
}
 
function generateDropScript(index) {
  selectedIndex.value = index;
  showModal.value = true;
  
  generatedScript.value = `-- ⚠️ VARNING: Detta tar bort indexet permanent!
-- Kontrollera att indexet verkligen inte används innan du kör detta.
-- Indexet har ${index.Writes} skrivningar men 0 läsningar.
 
USE [${index.DatabaseName || 'YourDatabaseName'}]; -- Byt ut mot rätt databas
GO
 
-- Backup-kommando (rekommenderas)
-- BACKUP DATABASE [${index.DatabaseName || 'YourDatabaseName'}] TO DISK = 'C:\\Backup\\BeforeDropIndex.bak';
 
-- Ta bort index
DROP INDEX [${index.IndexName}] ON [dbo].[${index.TableName}];
GO
 
-- Frigjort utrymme: ${index.IndexSizeMB} MB
-- Antal skrivningar som påverkades: ${index.Writes}`;
}
 
function closeModal() {
  showModal.value = false;
  generatedScript.value = '';
  selectedIndex.value = null;
}
 
function copyToClipboard() {
  navigator.clipboard.writeText(generatedScript.value);
  alert('✅ Skript kopierat till urklipp!');
}
 
function getRowClass(index) {
  if (index.IndexSizeMB > 1000) return 'large-index';
  if (index.Writes > 10000) return 'high-writes';
  return '';
}
 
watch(() => props.serverName, (newServer) => {
  if (newServer?.trim()) {
    console.log(`🔄 Laddar oanvända index för: ${newServer}`);
    fetchUnusedIndexes(newServer);
  }
}, { immediate: true });
 
</script>
 
<template>
  <div class="unused-indexes-container">
    <h2>Oanvända Index</h2>
    <p class="subtitle">
      Index som inte används för läsningar men kostar prestanda vid skrivningar. 
      Överväg att ta bort dem för att förbättra INSERT/UPDATE/DELETE-prestanda.
    </p>
 
    <div v-if="isLoading" class="loading-state">
      <p>Hämtar data från {{ serverName }}...</p>
    </div>
 
    <div v-else-if="error" class="error-state">
      <p>❌ {{ error }}</p>
    </div>
 
    <div v-else-if="unusedIndexes.length === 0" class="empty-state">
      <p>✅ Hittade inga oanvända index på {{ serverName }}. Bra jobbat!</p>
    </div>
 
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Tabell</th>
            <th>Index</th>
            <th>Storlek (MB)</th>
            <th>Skrivningar</th>
            <th>Läsningar</th>
            <th>Åtgärd</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="(index, i) in unusedIndexes" 
            :key="`${index.TableName}_${index.IndexName}_${i}`"
            :class="getRowClass(index)"
          >
            <td class="table-cell">{{ index.TableName }}</td>
            <td class="index-cell">{{ index.IndexName }}</td>
            <td class="size-cell">{{ Math.round(index.IndexSizeMB) }}</td>
            <td class="writes-cell">{{ index.Writes?.toLocaleString('sv-SE') || 0 }}</td>
            <td class="reads-cell">{{ index.Reads || 0 }}</td>
            <td>
              <button @click="generateDropScript(index)" class="drop-btn">
                🗑️ Generera DROP
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
 
    <!-- Modal för DROP-skript -->
    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>⚠️ DROP INDEX-skript</h3>
          <button @click="closeModal" class="close-btn">✖</button>
        </div>
        
        <div v-if="selectedIndex" class="index-details">
          <div class="detail-row warning">
            <strong>⚠️ VARNING:</strong> Detta tar bort indexet permanent!
          </div>
          <div class="detail-row">
            <strong>Tabell:</strong> {{ selectedIndex.TableName }}
          </div>
          <div class="detail-row">
            <strong>Index:</strong> {{ selectedIndex.IndexName }}
          </div>
          <div class="detail-row">
            <strong>Storlek:</strong> {{ Math.round(selectedIndex.IndexSizeMB) }} MB
          </div>
          <div class="detail-row">
            <strong>Skrivningar:</strong> {{ selectedIndex.Writes?.toLocaleString('sv-SE') }}
          </div>
          <div class="detail-row">
            <strong>Läsningar:</strong> {{ selectedIndex.Reads || 0 }}
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
.unused-indexes-container {
  font-family: sans-serif;
  padding: 2rem;
  background-color: #f9f9f9;
  border-radius: 8px;
}
 
h2 {
  color: #e74c3c;
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
  background-color: #fee;
  color: #333;
  font-weight: 600;
}
 
tbody tr {
  transition: background-color 0.2s;
}
 
tbody tr:hover {
  background-color: #ffe6e6;
}
 
.table-cell {
  font-family: 'Courier New', monospace;
  color: #34495e;
  font-weight: 500;
}
 
.index-cell {
  color: #9C27B0;
  font-weight: 500;
}
 
.size-cell {
  text-align: right;
  font-weight: bold;
  color: #e74c3c;
}
 
.writes-cell {
  text-align: right;
  color: #f39c12;
  font-weight: 600;
}
 
.reads-cell {
  text-align: right;
  color: #95a5a6;
}
 
/* Row highlighting */
.large-index {
  background-color: #ffe0e0 !important;
}
 
.high-writes {
  background-color: #fff4e0 !important;
}
 
.drop-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.3s, transform 0.1s;
}
 
.drop-btn:hover {
  background: #c0392b;
  transform: scale(1.05);
}
 
.drop-btn:active {
  transform: scale(0.95);
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
  background: #2a1a1a;
}
 
.modal-header h3 {
  margin: 0;
  color: #e74c3c;
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
 
.detail-row.warning {
  color: #e74c3c;
  font-size: 1em;
  padding: 10px;
  background: #3a1a1a;
  border-radius: 4px;
  margin-bottom: 15px;
}
 
.detail-row strong {
  color: #e74c3c;
  margin-right: 8px;
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