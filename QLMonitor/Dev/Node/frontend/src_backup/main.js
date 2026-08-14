// Fil: Frontend/src/main.js
 
import { createApp } from 'vue';
import App from './App.vue';
import './assets/main.css';
import './style.css';
 
// Importera ApexCharts
import VueApexCharts from "vue3-apexcharts";
 
// === Importera ikoner från oh-vue-icons ===
import { OhVueIcon, addIcons } from "oh-vue-icons";
import { 
    FaTimes, 
    FaHourglassHalf, 
    FaArrowDown, 
    FaArrowUp, 
    FaDatabase 
} from "oh-vue-icons/icons/fa";
 
// === NYTT: Importera socketService ===
import { socketService } from './services/socketService';
 
// === Lägg till de ikoner vi vill använda i appen ===
addIcons(FaTimes, FaHourglassHalf, FaArrowDown, FaArrowUp, FaDatabase);
 
console.log('🚀 Startar SQL Monitor applikation...');
 
// === NYTT: Funktion som väntar på socket-anslutning ===
function waitForSocket() {
  return new Promise((resolve) => {
    console.log('🔌 Ansluter till backend...');
    socketService.connect();
    
    // Om redan ansluten
    if (socketService.isConnected()) {
      console.log('✅ Socket redan ansluten');
      resolve();
      return;
    }
    
    // Vänta på connect-event
    const onConnect = () => {
      console.log('✅ Socket ansluten - startar Vue-app');
      socketService.off('connect', onConnect);
      resolve();
    };
    
    socketService.on('connect', onConnect);
    
    // Timeout efter 5 sekunder - starta ändå
    setTimeout(() => {
      console.warn('⚠️ Socket-timeout (5s) - startar app ändå');
      socketService.off('connect', onConnect);
      resolve();
    }, 5000);
  });
}
 
// === NYTT: Starta appen när socket är redo ===
waitForSocket().then(() => {
  const app = createApp(App);
  
  app.use(VueApexCharts);
  
  // Registrera v-icon-komponenten globalt
  app.component("v-icon", OhVueIcon);
  
  app.mount('#app');
  
  console.log('✅ Vue-app monterad och redo');
});