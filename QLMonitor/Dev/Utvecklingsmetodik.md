# Utvecklingsmetodik & Komma igång
 
## 1. Projektstruktur
Här är en översikt av hur källkoden är organiserad:
 
*   `frontend/` - Innehåller React-applikationen (gränssnittet).
*   `src/` - Backend-källkod (API, databaskopplingar och insamlingslogik).
*   `QLMonitor/` - Obsidian-valv för systemdokumentation (detta valv).
*   `sp_whoisactive-20260409/` - SQL-skript och resurser för databasövervakningen.
 
## 2. Komma igång som utvecklare
 
### Förutsättningar
*   Node.js installerat på datorn.
*   Tillgång till en SQL Server-instans.
 
### Installation
1. Klona arkivet och ställ dig i rotmappen.
2. Installera beroenden för backend:
   ```bash
   npm install
   ```
3. Gå till frontend-mappen och installera dess beroenden:
   ```bash
   cd frontend
   npm install
   ```
 
### Miljövariabler (.env)
Applikationen kräver en `.env`-fil i rotmappen med följande konfiguration (se `.env.txt` för exempel):
*   Databasanslutningsuppgifter (Server, Databas, Användare, Lösenord).
*   Portnummer för API:et.
 
## 3. Köra applikationen lokalt
För att starta backend i utvecklingsläge:
```bash
npm run dev
```
 
---
*Genererad automatiskt den: 2026-08-12*
