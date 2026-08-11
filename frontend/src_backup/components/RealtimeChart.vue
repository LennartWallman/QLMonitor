<template>
  <div class="card chart-card">
    <h3 class="chart-title">{{ title }}</h3>
    <apexchart
      type="area"
      height="250"
      :options="chartOptions"
      :series="seriesData"
    ></apexchart>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  seriesData: {
    type: Array,
    required: true,
  },
  yaxisMax: {
    type: Number,
    default: undefined
  }
});

const chartOptions = computed(() => ({
  chart: {
    type: 'area',
    height: 250,
    zoom: { enabled: false },
    toolbar: { show: false },
    animations: {
      enabled: true,
      easing: 'linear',
      dynamicAnimation: {
        speed: 1000
      }
    }
  },
  // === NYTT: Lägger till en fyllning under linjen för snyggare utseende ===
  fill: {
    type: 'gradient',
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.7,
      opacityTo: 0.1,
      stops: [0, 100]
    }
  },
  dataLabels: { enabled: false },
  stroke: { 
    curve: 'smooth',
    width: 2
  },
  markers: { size: 0 },
  xaxis: {
    type: 'category',
    // === ÄNDRING: Säkerställer att tiden tolkas lokalt, inte UTC ===
    datetimeUTC: false,
    labels: {
      format: 'HH:mm:ss',
      style: {
        // === ÄNDRING: Tydligare färg och specifik teckenstorlek ===
        colors: '#6e6e6e', 
        fontSize: '12px'
      }
    }
  },
  yaxis: {
    max: props.yaxisMax,
    labels: {
      style: {
        // === ÄNDRING: Samma tydliga färg och storlek här ===
        colors: '#6e6e6e',
        fontSize: '12px'
      }
    }
  },
  grid: {
    // === ÄNDRING: Ljusare färg på stödlinjer för ljus bakgrund ===
    borderColor: '#e0e0e0',
    strokeDashArray: 4
  },
  tooltip: {
    x: {
      format: 'dd MMM HH:mm:ss'
    },
    theme: 'light' // Byt till 'light' för att matcha designen
  }
}));
</script>

<style scoped>
.chart-card {
  background-color: #ffffff;
  padding: 1rem 1.5rem; /* Lite mer luft på sidorna */
  border-radius: 8px;
  border: 1px solid #e7e7e7;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}

.chart-title {
  margin: 0 0 1rem 0;
  font-size: 1.1rem; /* Något större titel */
  font-weight: 600;
  color: #333;
}
</style>