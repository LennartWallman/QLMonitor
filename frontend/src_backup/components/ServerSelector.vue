<!-- ServerSelector.vue -->
<template>
  <div class="server-selector">
    <label for="server-select" class="server-label">Välj server:</label>
    <select 
      id="server-select" 
      :value="selectedServer"
      @change="handleChange"
      class="server-dropdown"
    >
      <option value="">-- Välj en server --</option>
      <option 
        v-for="server in servers" 
        :key="server.ServerName" 
        :value="server.ServerName"
      >
        {{ server.DisplayName || server.ServerName }}
      </option>
    </select>
  </div>
</template>
 
<script setup>
import { ref, onMounted, inject } from 'vue'
 
const servers = ref([])
const selectedServer = inject('selectedServer')
 
const emit = defineEmits(['serverChange'])
 
onMounted(async () => {
  try {
    const response = await fetch(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:3003/api/servers')
    const data = await response.json()
    
    console.log('📋 [ServerSelector] Servrar mottagna:', data)
    servers.value = data
    
    // Välj första servern automatiskt
    if (servers.value.length > 0 && !selectedServer.value) {
      const firstServer = servers.value[0].ServerName
      selectedServer.value = firstServer
      emit('serverChange', firstServer)
      console.log('✅ [ServerSelector] Auto-valde första server:', firstServer)
    }
  } catch (error) {
    console.error('❌ Kunde inte hämta servrar:', error)
  }
})
 
const handleChange = (event) => {
  const newServer = event.target.value
  
  if (!newServer) {
    console.log('⚠️ [ServerSelector] Ingen server vald')
    return
  }
  
  console.log('🔄 [ServerSelector] Valde server:', newServer)
  selectedServer.value = newServer
  emit('serverChange', newServer)
}
</script>
 
<style scoped>
.server-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
 
.server-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}
 
.server-dropdown {
  min-width: 250px;
  padding: 0.625rem 2.5rem 0.625rem 1rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: #1f2937;
  background-color: white;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}
 
.server-dropdown:hover {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
 
.server-dropdown:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}
 
.server-dropdown option {
  padding: 0.5rem;
  font-weight: 500;
}
 
@media (max-width: 768px) {
  .server-selector {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
 
  .server-dropdown {
    width: 100%;
    min-width: unset;
  }
}
</style>