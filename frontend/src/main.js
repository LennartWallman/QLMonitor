// Fil: Frontend/src/main.js
 
import { createApp } from 'vue';
import App from './App.vue';
import './assets/main.css';
import './style.css';
 
// Importera Axios och konfigurera det globalt direkt vid start
import axios from 'axios';
axios.defaults.withCredentials = true;
 
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
 
// === Importera socketService ===
import { socketService } from './services/socketService';
 
// === Lägg till de ikoner vi vill använda i appen ===
addIcons(FaTimes, FaHourglassHalf, FaArrowDown, FaArrowUp, FaDatabase);
 
console.log('🚀 Startar SQL Monitor applikation...');
 
// === Funktion som tvingar fram NTLM-handskakningen ===
function performNtlmHandshake() {
  console.log('👤 Initierar Windows-autentisering (NTLM)...');
  
  // Vi tillåter 401-statuskoder under handskakningen så att Axios inte kraschar
  // när webbläsaren och IIS/Node förhandlar om NTLM-nycklarna.
  return axios.get('http://sllbi01:3003/api/auth/whoami', {
    validateStatus: (status) => (status >= 200 && status < 300) || status === 401
  })
  .then((res) => {
    // Om vi fick en 401, betyder det att handskakningen påbörjades.
    // Vi gör ett omedelbart uppföljningsanrop nu när webbläsaren har fått sin NTLM-token.
    if (res.status === 401) {
      console.log('🔑 Utför NTLM-handskakning steg 2...');
      return axios.get('http://sllbi01:3003/api/auth/whoami');
    }
    return res;
  })
  .then((response) => {
    let loggedInUser = 'Gäst';
    if (response.data && response.data.user) {
      loggedInUser = response.data.user;
    }
    console.log(`👤 Identifierad Windows-användare: ${loggedInUser}`);
    sessionStorage.setItem('loggedinUser', loggedInUser);
    return loggedInUser;
  })
  .catch((err) => {
    console.warn('⚠️ Windows-handskakning misslyckades eller körs lokalt:', err.message);
    sessionStorage.setItem('loggedinUser', 'Gäst');
    return 'Gäst';
  });
}
 
// === Startsekvens ===
performNtlmHandshake()
  .then((user) => {
    // Nu när NTLM är HELT KLART, ansluter vi socket
    return new Promise((resolve) => {
      console.log('🔌 Ansluter till backend...');
      socketService.connect();
      
      if (socketService.isConnected()) {
        console.log('✅ Socket redan ansluten');
        resolve(user);
        return;
      }
      
      const onConnect = () => {
        console.log('✅ Socket ansluten - startar Vue-app');
        socketService.off('connect', onConnect);
        resolve(user);
      };
      
      socketService.on('connect', onConnect);
      
      setTimeout(() => {
        console.warn('⚠️ Socket-timeout (5s) - startar app ändå');
        socketService.off('connect', onConnect);
        resolve(user);
      }, 5000);
    });
  })
  .then((user) => {
    // NU monterar vi Vue-appen, inte en millisekund innan!
    const app = createApp(App);
    
    app.use(VueApexCharts);
    app.component("v-icon", OhVueIcon);
    
    // Gör användaren tillgänglig globalt i Vue
    app.provide('currentUser', user);
    
    app.mount('#app');
    console.log('✅ Vue-app monterad och redo');
  });