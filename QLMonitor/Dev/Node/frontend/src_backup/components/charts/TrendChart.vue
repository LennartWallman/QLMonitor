<!-- Fil: src/components/charts/TrendChart.vue -->
<template>
  <div class="bg-gray-700 p-4 rounded-lg">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
 
<script setup>
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler, // Importera Filler för att kunna fylla under linjen
} from 'chart.js';
 
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);
 
const props = defineProps({
  history: {
    type: Array,
    required: true,
  },
});
 
const chartData = computed(() => {
  const labels = props.history.map(item => new Date(item.CaptureDate).toLocaleDateString('sv-SE'));
  const dataPoints = props.history.map(item => ((item.TotalMB - item.FreeMB) / 1024).toFixed(2)); // Använt utrymme i GB
 
  return {
    labels,
    datasets: [
      {
        label: 'Använt utrymme (GB)',
        backgroundColor: 'rgba(54, 162, 235, 0.4)', // En blå färg med transparens
        borderColor: 'rgb(54, 162, 235)',
        borderWidth: 2,
        pointBackgroundColor: 'rgb(54, 162, 235)',
        tension: 0.3, // Gör linjen lite mjukare
        fill: true, // Fyll området under linjen
        dataPoints,
      },
    ],
  };
});
 
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: false, // Börja inte alltid på noll för att se trenden bättre
      title: {
        display: true,
        text: 'Använt (GB)',
        color: '#cbd5e1'
      },
      ticks: {
        color: '#cbd5e1'
      }
    },
    x: {
      ticks: {
        color: '#cbd5e1'
      }
    }
  },
  plugins: {
    legend: {
      display: false, // Dölj legendan, vi har bara en dataserie
    },
    title: {
      display: true,
      text: 'Historisk användning',
      color: '#fff',
      font: {
        size: 16
      }
    }
  }
};
</script>