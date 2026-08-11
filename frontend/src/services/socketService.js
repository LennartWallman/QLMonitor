// Fil: frontend/src/services/socketService.js
 
import { io } from "socket.io-client";
 
let socket;
 
export const socketService = {
 
  // Metod för att ansluta till servern
  connect() {
    // Anslut bara om vi inte redan har en aktiv anslutning
    if (socket && socket.connected) {
      console.log('✅ Socket redan ansluten');
      return;
    }
    
    // Hämta bas-URL:en från .env eller fallback
    let SERVER_URL = import.meta.env.VITE_API_URL || 'http://SLLBI01:3003';
    
    // SÄKERHETSÅTGÄRD: Om URL:en slutar på '/api', ta bort det för Socket.IO!
    if (SERVER_URL.endsWith('/api')) {
      SERVER_URL = SERVER_URL.slice(0, -4);
    } else if (SERVER_URL.endsWith('/api/')) {
      SERVER_URL = SERVER_URL.slice(0, -5);
    }
    
    // Logga för att bekräfta att vi ansluter till rätt ställe
    console.log(`🔌 Försöker ansluta till socket-server på: ${SERVER_URL}`);
    
    // Anslut till den specifika adressen
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    }); 
    
    socket.on("connect", () => {
      console.log("✅ Ansluten till backend via Socket.IO med ID:", socket.id);
    });
 
    socket.on("disconnect", () => {
      console.log("❌ Frånkopplad från backend.");
    });
 
    socket.on("connect_error", (error) => {
      console.error("🔴 Socket anslutningsfel:", error);
    });
  },
 
  // Metod för att koppla från
  disconnect() {
    if (socket) {
      socket.disconnect();
      console.log('👋 Socket frånkopplad');
    }
  },
 
  // ✅ GENERELL EMIT-METOD
  emit(eventName, data) {
    if (socket && socket.connected) {
      socket.emit(eventName, data);
      console.log(`📤 Skickar event: ${eventName}`, data);
    } else {
      console.error(`❌ Kan inte skicka ${eventName} - socket ej ansluten`);
    }
  },
 
  // Metod för att prenumerera på realtidsdata från en specifik server
  subscribeToServer(serverName) {
    if (socket && socket.connected) {
      socket.emit("subscribeToServer", { serverName });
      console.log(`📡 Prenumererar på server: ${serverName}`);
    } else {
      console.error('❌ Socket ej ansluten - kan inte prenumerera');
    }
  },
 
  // Metod för att avsluta en prenumeration
  unsubscribeFromServer(serverName) {
    if (socket && socket.connected) {
      socket.emit("unsubscribeFromServer", { serverName });
      console.log(`🔕 Avslutar prenumeration för: ${serverName}`);
    }
  },
 
  // En generell metod för att lyssna på events från servern
  on(eventName, callback) {
    if (socket) {
      socket.on(eventName, callback);
      console.log(`👂 Lyssnar på event: ${eventName}`);
    } else {
      console.warn(`⚠️ Socket saknas - kan inte lyssna på ${eventName}`);
    }
  },
 
  // Metod för att sluta lyssna på ett event
  off(eventName, callback) {
    if (socket) {
      if (callback) {
        socket.off(eventName, callback);
      } else {
        socket.off(eventName);
      }
      console.log(`🔇 Slutar lyssna på: ${eventName}`);
    }
  },
 
  // Metod för att spara lösningar
  saveKnowledge(solutionData) {
    if (socket && socket.connected) {
      socket.emit('save-knowledge', solutionData);
      console.log('💾 Skickar lösningsdata till backend:', solutionData);
    } else {
      console.error('❌ Socket ej ansluten. Kan inte spara lösning.');
    }
  },
 
  // Hjälpmetod för att kontrollera anslutningsstatus
  isConnected() {
    return socket && socket.connected;
  },
 
  // Hjälpmetod för att få socket-ID
  getSocketId() {
    return socket?.id || null;
  }
};