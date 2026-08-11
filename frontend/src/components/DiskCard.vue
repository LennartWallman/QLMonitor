<template>
  <div class="disk-card" @click="$emit('click')">
    <!-- Header med disk-bokstav -->
    <div class="disk-header">
      <div class="disk-letter-badge" :class="getStatusClass(usagePercent)">
        <span class="disk-letter">{{ disk.DriveLetter }}</span>
      </div>
      <div class="disk-status-indicator" :class="getStatusClass(usagePercent)">
        <span class="status-dot"></span>
        <span class="status-text">{{ getStatusText(usagePercent) }}</span>
      </div>
    </div>
 
    <!-- Progress bar -->
    <div class="progress-container">
      <div class="progress-bar-wrapper">
        <div 
          class="progress-bar" 
          :class="getStatusClass(usagePercent)"
          :style="{ width: usagePercent + '%' }"
        >
          <div class="progress-shine"></div>
        </div>
      </div>
      <div class="progress-label">
        <span class="usage-percent">{{ usagePercent.toFixed(1) }}%</span>
        <span class="usage-text">använt</span>
      </div>
    </div>
 
    <!-- Disk-information -->
    <div class="disk-info">
      <div class="info-row">
        <div class="info-item">
          <span class="info-icon">💾</span>
          <div class="info-content">
            <span class="info-label">Använt</span>
            <span class="info-value">{{ formatSize(usedSpace) }}</span>
          </div>
        </div>
        <div class="info-item">
          <span class="info-icon">📦</span>
          <div class="info-content">
            <span class="info-label">Ledigt</span>
            <span class="info-value">{{ formatSize(disk.FreeMB) }}</span>
          </div>
        </div>
      </div>
 
      <div class="info-row">
        <div class="info-item full-width">
          <span class="info-icon">📊</span>
          <div class="info-content">
            <span class="info-label">Total kapacitet</span>
            <span class="info-value-large">{{ formatSize(disk.TotalMB) }}</span>
          </div>
        </div>
      </div>
    </div>
 
    <!-- Footer med server-namn -->
    <div class="disk-footer">
      <span class="server-label">{{ disk.ServerName }}</span>
      <span class="click-hint">Klicka för trendanalys →</span>
    </div>
 
    <!-- Hover-effekt overlay -->
    <div class="hover-overlay"></div>
  </div>
</template>
 
<script setup>
import { computed } from 'vue';
 
const props = defineProps({
  disk: {
    type: Object,
    required: true
  }
});
 
// Beräkna använt utrymme
const usedSpace = computed(() => {
  return props.disk.TotalMB - props.disk.FreeMB;
});
 
// Beräkna användning i procent
const usagePercent = computed(() => {
  if (props.disk.TotalMB === 0) return 0;
  return ((usedSpace.value / props.disk.TotalMB) * 100);
});
 
// Få status-klass baserat på användning
const getStatusClass = (percent) => {
  if (percent >= 90) return 'status-critical';
  if (percent >= 75) return 'status-warning';
  return 'status-healthy';
};
 
// Få status-text
const getStatusText = (percent) => {
  if (percent >= 90) return 'Kritisk';
  if (percent >= 75) return 'Varning';
  return 'Bra';
};
 
// Formatera storlek
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
/* DISK CARD */
/* ============================================ */
.disk-card {
  background: var(--bg-card-custom);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: var(--shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  border: 2px solid var(--border);
}
 
.disk-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  border-color: var(--accent);
}
 
.disk-card:hover .hover-overlay {
  opacity: 1;
}
 
.disk-card:hover .click-hint {
  opacity: 1;
  transform: translateX(0);
}
 
.hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, var(--accent-bg) 0%, rgba(118, 75, 162, 0.03) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}
 
/* ============================================ */
/* HEADER */
/* ============================================ */
.disk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}
 
.disk-letter-badge {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 700;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.3s ease;
}
 
.disk-card:hover .disk-letter-badge {
  transform: scale(1.1) rotate(-5deg);
}
 
.disk-letter-badge.status-healthy {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}
 
.disk-letter-badge.status-warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}
 
.disk-letter-badge.status-critical {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}
 
.disk-status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}
 
.disk-status-indicator.status-healthy {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
 
.disk-status-indicator.status-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
 
.disk-status-indicator.status-critical {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
 
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s ease-in-out infinite;
}
 
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
 
.status-text {
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
 
/* ============================================ */
/* PROGRESS BAR */
/* ============================================ */
.progress-container {
  margin-bottom: 1.5rem;
}
 
.progress-bar-wrapper {
  width: 100%;
  height: 12px;
  background: var(--code-bg);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0.5rem;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}
 
.progress-bar {
  height: 100%;
  border-radius: 10px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
 
.progress-bar.status-healthy {
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
}
 
.progress-bar.status-warning {
  background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
}
 
.progress-bar.status-critical {
  background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
}
 
.progress-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: shine 2s ease-in-out infinite;
}
 
@keyframes shine {
  0% {
    left: -100%;
  }
  50%, 100% {
    left: 100%;
  }
}
 
.progress-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
 
.usage-percent {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-h);
}
 
.usage-text {
  font-size: 0.875rem;
  color: var(--text);
  font-weight: 500;
}
 
/* ============================================ */
/* DISK INFO */
/* ============================================ */
.disk-info {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
 
.info-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
 
.info-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
 
.info-item.full-width {
  grid-column: 1 / -1;
}
 
.info-icon {
  font-size: 1.5rem;
  opacity: 0.7;
}
 
.info-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
 
.info-label {
  font-size: 0.75rem;
  color: var(--text);
  opacity: 0.7;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
 
.info-value {
  font-size: 1rem;
  color: var(--text-h);
  font-weight: 600;
}
 
.info-value-large {
  font-size: 1.25rem;
  color: var(--text-h);
  font-weight: 700;
}
 
/* ============================================ */
/* FOOTER */
/* ============================================ */
.disk-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
 
.server-label {
  font-size: 0.875rem;
  color: var(--text);
  opacity: 0.8;
  font-weight: 500;
}
 
.click-hint {
  font-size: 0.75rem;
  color: var(--accent);
  font-weight: 600;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.3s ease;
}
 
/* ============================================ */
/* RESPONSIV DESIGN */
/* ============================================ */
@media (max-width: 480px) {
  .disk-card {
    padding: 1.25rem;
  }
 
  .disk-letter-badge {
    width: 50px;
    height: 50px;
    font-size: 1.5rem;
  }
 
  .usage-percent {
    font-size: 1.25rem;
  }
 
  .info-value-large {
    font-size: 1.125rem;
  }
 
  .info-row {
    grid-template-columns: 1fr;
  }
}
</style>