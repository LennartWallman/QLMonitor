# Software Architecture Document (SAD) - monitoring-app
 
## 1. Introduktion
Detta dokument beskriver arkitekturen för **monitoring-app**, en applikation designad för att övervaka SQL Server-prestanda och visualisera data (bland annat via `sp_whoisactive`).
 
## 2. Arkitekturöversikt
Systemet är uppbyggt som en klassisk klient-server-applikation:
 
```
+------------------+          +------------------+          +------------------+
|                  |   HTTP   |                  |   T-SQL  |                  |
|  React Frontend  | -------> |  Node.js Backend | -------> |    SQL Server    |
|                  |          |                  |          |                  |
+------------------+          +------------------+          +------------------+
```
 
*   **Frontend:** React-baserat webbgränssnitt som visualiserar insamlad data och realtidsstatus.
*   **Backend:** Node.js-applikation (Express) som hanterar schemalagd datainsamling, API-ändpunkter och databaskopplingar.
*   **Databas:** SQL Server där prestandadata samlas in (bland annat med hjälp av `sp_whoisactive`).
 
## 3. Teknologistack
Baserat på projektets konfiguration används följande teknologier:
 
### Backend & Runtime
*   **Runtime:** Node.js
*   **Huvudbibliotek:** `axios`, `chart.js`, `chartjs-adapter-date-fns`, `cors`, `dotenv`, `express`, `express-ntlm`, `mssql`, `node-cron`, `nodemailer`, `oh-vue-icons`, `react-chartjs-2`, `socket.io`
 
### Processhantering
*   Projektet innehåller en `ecosystem.config.js` vilket indikerar att **PM2** används för driftsättning och processhantering i produktionsmiljö.
 
---
*Genererad automatiskt den: 2026-08-12*
