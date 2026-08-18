# QLMonitor — Systemdokumentation

Detta dokument innehåller driftinstruktioner, utvecklingsmetodik och en Software Architecture Document (SAD) för QLMonitor.

OBS: Filen är skapad som Markdown i mappen `documentation/`. Om du vill ha den som ett Word-dokument (.docx) kan jag konvertera och lägga till en .docx-fil också.

---

INNEHÅLL

1. Sammanfattning
2. Viktigt för Drift (driftchecklista, miljövariabler, viktiga endpoints, felsökning)
3. Utvecklingsmetodik (komma igång, kodstruktur, test & release)
4. Software Architecture Document (SAD)
5. Viktiga filer och var de finns i repot
6. Rekommendationer och förbättringsförslag

---

1) SAMMANFATTNING

QLMonitor är en Node.js-baserad övervakningsapplikation med ett Vue 3 / Vite frontend. Applikationen samlar data från SQL Server-instanser (bl.a. via DMVs och MDW), presenterar realtidsstatus via Socket.IO och skickar larm via e-post och Microsoft Teams.

Målgrupp: Drift- och DBA-team som behöver insyn i SQL Server-prestanda, jobbstatus, diskutrymme, TempDB och historik.

Huvudfunktioner:
- Realtidsöversikt av jobb, blockeringar och TempDB
- Automatisk insamling av historik (minne, disk, jobbhistorik)
- Larm (e-post via SMTP, Teams via webhook)
- Funktioner för att generera CREATE INDEX-skript (sp i databasen)
- Frontend med NTLM-handskakning för intranätsinloggning

---

2) VIKTIGT FÖR DRIFT

A. Start / stop / deployment
- Starta backend lokalt:
  - Sätt upp .env med korrekt DB- och SMTP-konfiguration.
  - Kör `npm install` i repo-roten.
  - Starta: `npm start` (kör `node src/server.js`).

- Frontend utveckling:
  - `cd frontend && npm install && npm run dev` (Vite dev server)
  - Produktion: `cd frontend && npm run build` och `npx serve -s dist -l 5173` eller använd PM2-ecosystem.

- PM2 (ecosystem.config.js) innehåller två apps: backend (server.js) och frontend (serve). Anpassa `cwd` och paths innan produktion.

B. Viktiga miljövariabler (.env)
Se koden (src/* och frontend/vite.config.js) för förekomster. Min lista:
- CONFIG_DB_USER, CONFIG_DB_PASSWORD, CONFIG_DB_HOST, CONFIG_DB_DATABASE — konfigurering DB för central config/management
- MDW_SERVER — namnet på MDW/insamlingsinstans (används i monitor.getPool)
- DB_USER, DB_PASSWORD (eventuella DB-anslutningar som monitor använder/lagras per server)
- SMTP_HOST, SMTP_PORT, ERROR_FROM, ERROR_TO — e-post (src/emailService.js)
- TEAMS_WEBHOOK_URL — Teams-notifiering (src/services/notificationService.js)
- FRONTEND_BASE_URL — bas-URL för frontend (används vid länkbygge i Teams)
- VITE_API_URL — för frontend proxy (vite.config.js)
- PORT — backend port (env eller default 3003)

Rekommendation: skapa `.env.example` med fält + kort beskrivning.

C. Viktiga endpoints (ops vardag)
- Health/pulse / system status:
  - GET /api/monitoring/heartbeats — hämtar systempuls från central "management" DB
- Jobs & jobb-historik:
  - GET /api/jobs/:serverName — lista jobb
  - GET /api/jobs/:serverName/:jobId/steps — steg för ett jobb
  - GET /api/servers/:serverName/jobs/history24h — 24h jobbhistorik
- Aktivitet / sp_whoisactive:
  - GET /api/server/:serverName/activity — realtids-activity (sp_whoisactive-inspirerat)
  - GET /api/server/:serverName/activity-history?from=...&to=... — historik
- Disk:
  - GET /api/disks/summary
  - GET /api/disks/history/:serverName
  - GET /api/servers/:serverName/disks/:driveLetter/trend
- SSIS / SSIS-error parsing:
  - GET /api/jobs/:serverName/:jobName/ssis-errors?command=...&jobStartTime=...
- Auth / whoami (NTLM):
  - GET /api/auth/whoami
  - GET /api/whoami-track — rapporterar närvaro (activeUsersTracker.touch)
- Admin (SU-only):
  - GET /api/admin/users
  - POST /api/admin/users
  - DELETE /api/admin/users/:username
  - GET /api/admin/check-role — används i frontend för att visa admin-knapp

D. Vanliga driftuppgifter & felsökning
- Ingen DB-anslutning / pool error: kontrollera rätt credentials för CONFIG DB (CONFIG_DB_*). monitor.loadServerConfiguration försöker skapa pools och loggar fel.
- Socket.IO kopplar ej: kontrollera CORS och att frontend använder korrekt api-url (VITE_API_URL). Backend konfigurerar allowedOrigins i server.js.
- NTLM-problem: frontend utför en NTLM-handshake via `api/auth/whoami`. I intranät krävs korrekt reverse-proxy/IIS eller att express-ntlm får fram headers. Kontrollera att `express-ntlm` fungerar i den miljön.
- Inga e-postmeddelanden: kontrollera SMTP_HOST, SMTP_PORT, ERROR_FROM, ERROR_TO och att nätverket tillåter SMTP.
- Teams larm fungerar ej: kontrollera TEAMS_WEBHOOK_URL och att payload inte blockeras av Power Automate.

E. Backups & data retention
- Central historik rensas i code: collectAndSaveMemoryHistory raderar äldre än 7 dagar. Anpassa om längre retention krävs.

F. Behörigheter
- API-anrop som påverkar system (acknowledge, kill-session, start job) kräver lämpliga SQL-behörigheter mot målservrar och msdb (sp_start_job, KILL). Driftkonto måste ha minimalt nödvändiga rättigheter.

---

3) UTVECKLINGSMETODIK

A. Komma igång (lokalt)
1. Klona repot
2. Skapa `.env` baserat på `.env.example` (om du vill att jag skapar en exempel-fil, säg till)
3. Backend:
   - `npm install`
   - `npm start` (eller `node src/server.js`)
4. Frontend:
   - `cd frontend && npm install && npm run dev`

B. Kodstruktur & ansvar
- src/server.js — Express setup, middleware, routes och Socket.IO-setup
- src/monitor.js — All logik för SQL-anslutningar, data-insamling, job-övervakning och export-funktioner
- src/routes/* — tunnlar till monitor.js funktioner (mdwRoutes, diskRoutes, auth)
- src/services/* — e-post och Teams-notifiering, activeUsersTracker
- frontend/src — Vue 3 app (App.vue orchestrerar UI och socket-anslutning)

C. Branching och releaser
- Föredra feature-branches per förändring: `feat/<kort-beskrivning>`
- Merge via PR med kodgranskning
- Tagga releaser och använd PM2-ecosystem för produktion

D. Test & QA
- Projekt har inga automatiska enhetstester i nuläget. Lägg till:
  - Enhetstester för utility-funktioner (jest)
  - Integrationstester mot en staging SQL-server (mock eller testinstans)
- Runtimespecifika tester: testa connectionPools, MDW-anrop och SP-exekveringar i isolerad miljö.

E. Logging och observability
- Koden loggar med console.log/console.error. För produktion rekommenderas centraliserad loggning (Winston/pm2-logrotate + ELK/Graylog)
- Instrumentera längre körningar, fel och latens (ex. öppna metrics endpoint eller exportera till Prometheus)

---

4) SOFTWARE ARCHITECTURE DOCUMENT (SAD)

4.1 Mål och kontext
- Mål: ge driftteam realtids- och historisk insyn i SQL Server-inställningar, jobb och resurser. Möjlighet att automatisera larm och eskaleringslogik.
- Kontext: körs internt mot organisationens SQL Server-instanser, ofta bakom intranät och NTLM/IIS-autentisering.

4.2 Huvudkomponenter
- Frontend (Vue 3): UI för visning, realtidsuppdateringar via Socket.IO. Utför NTLM-handshake för att få användaridentitet.
- Backend (Node.js + Express): API, Socket.IO, schemalagd insamling (setInterval), notifieringslogik.
- Databas (SQL Server): flera roller:
  - Konfigurations-/management DB (central där historik lagras, stored procedures som används som datasource)
  - MDW (Management Data Warehouse) för aggregerade prestandahistoriker
  - Mål-SQL-servrar som övervakas (connectionPools per server)

4.3 Dataflöden
1. Backend schemalägger insamling (monitor.startMonitoring) som hämtar realtidsdata från övervakade servrar.
2. Insamlad data sparas i central management DB (t.ex. ServerMemoryHistory, ServerActivityHistory) via parametriserade queries och stored procedures.
3. Frontend anropar REST-API (/api/*) för snapshot-data och prenumererar på Socket.IO-kanaler (servernamn) för realtidsuppdateringar.
4. Vid kritiska händelser (jobbfel, statusändring) loggas händelsen via stored procedure (`usp_LogAndCheckSystemAlert`) och notifieringar skickas via e-post/Teams.

4.4 Arkitekturgivna val
- Node.js + mssql: asynkron I/O för parallella DB-queries mot många servrar.
- Socket.IO: låter frontend prenumerera på specifika serverkanaler för realtidsuppdateringar.
- PM2: processhantering i produktion (ecosystem.config.js)

4.5 Säkerhet
- Autentisering: NTLM via express-ntlm för intranätanvändare.
- Behörigheter mot SQL: driftkonto med begränsade (minimala) rättigheter rekommenderas; operationer som sp_start_job kräver högre privilegier.
- Sensitive secrets: använd säkra hemlagringsmekanismer (KeyVault, Vault) i produktion; undvik att checka in .env med credentials.

4.6 Drift och skalbarhet
- connectionPools Map skapar pool per server. Antalet servrar ökar minnes- och anslutningsbelastning; se `createServerConfig` och `loadServerConfiguration`.
- Rekommendation: begränsa polling-frekvens/antal servrar per instans, använd horisontell skalning (flera monitor-instanser med delade poll-ansvar) vid många servrar.

4.7 Felhantering
- Koden fångar och loggar många felfall. I produktion bör fel eskaleras till central logg och eventuellt APM.

---

5) VIKTIGA FILER & VAR DE FINNS
- package.json (root) — backend dependencies & start
- frontend/package.json — frontend deps & scripts
- src/server.js — Express-app & routing
- src/monitor.js — kärnlogik (anslutningspooler, insamling, job-övervakning)
- src/services/notificationService.js — Teams alert
- src/emailService.js — nodemailer-email
- src/routes/mdwRoutes.js — endpoints för MDW och diagnostik
- src/routes/diskRoutes.js — disk endpoints
- frontend/src/App.vue, frontend/src/main.js — frontend-boot & UI
- generate-docs.js — script som genererar Obsidian-filer
- ecosystem.config.js — PM2 konfiguration
- sp_whoisactive-20260409/ — SQL-skript (sp_whoisactive resurser)

---

6) REKOMMENDATIONER OCH FÖRBÄTTRINGSFÖRSLAG

Drift / Infrastruktur
- Flytta hemligheter till en secrets manager (KeyVault/Vault).
- Instrumentera med ett logging- och metrics-system (Winston + Grafana/Prometheus eller Elastic).
- Säkerställ pool-gränser (mssql.ConnectionPool options) för stora miljöer.
- Implementera rate-limiting / circuit-breaker för att undvika cascading failures mot målservrar.

Kod & kvalitet
- Introducera enhetstester (jest) och CI (GitHub Actions) för att köra lint + tests
- Extrahera SQL-frågor till separata filer, använd parametriserade stored procedures för komplex logik
- Lägg till bättre feature toggles och konfigurationshantering (feature-flaggor för t.ex. mail/teams)

Säkerhet
- Minimera SQL-privilegier för driftkonton; använd readonly-views där möjligt.
- Granska och sanera HTML i e-postmallar (escape är på plats i kod men granskning rekommenderas)

Dokumentation
- Skapa `.env.example`
- Generera OpenAPI/Swagger för publika API-ändpunkter (hot endpoints under /api/)
- Håll generate-docs.js uppdaterad — låt den bygga daglig/CI-driven dokumentation i Obsidian-vault

---

7) Nästa steg jag kan göra åt dig nu
- Lägg till `.env.example` i repot med beskrivning av variabler.
- Generera en .docx-version av denna dokumentation och lägga till i `documentation/` (kan göra en konvertering och committa .docx).
- Skapa en kort OpenAPI-spec för de viktigaste endpoints.

Säg vilken av ovan du vill att jag gör direkt — jag kan nu committa denna Markdown till en ny mapp `documentation/` i ditt repo (gjort nedan), och därefter generera och committa en Word-fil om du vill.
