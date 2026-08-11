title: "QLMonitor — Runbook"
tags: [qlmonitor, runbook, produksjon, drift, dev]
created: 2026-08-11
status: production
owner: team-data-platform
contact: team-data-platform@example.comQLMonitor — Runbook1. ÖversiktKort beskrivningSyfte: Övervakar och validerar ETL/SQL-laddningar (QL) och skickar varningar / loggar fel.Viktiga komponenter: PowerShell scripts, Windows Scheduled Task, SQL Stored Procedures (styr.P_Exec_LOAD_INT, styr.P_GetFullErrorsForLaddningsId), Node/Express endpoint (valfritt), loggtabeller (SLLEDW_LOG_*), SSIS/ssisdb koppling.Målgrupp: drifttekniker & efterföljande utvecklare.2. Arkitektur (högnivå)Agent/Task: Windows Task Scheduler kör PowerShell-skript D:\PSScripts\Monitor-Services.ps1.DB: SQL Server, schema styr med procedurer och loggtabeller.API: Express endpoint /api/qlmonitor/errors (valfritt) som anropar styr.P_GetFullErrorsForLaddningsId.Notifiering: e‑post/Teams via PowerShell eller webhook.3. Filstruktur (exempel)D:\PSScripts\Monitor-Services.ps1D:\PSScripts\logs\Monitor-Services_debug.txtRepo:
/sql/procs/P_Exec_LOAD_INT.sql
/sql/procs/P_GetFullErrorsForLaddningsId.sql
/node/api/qlmonitor.js
/docs/QLMonitor-Runbook.md

4. Viktiga konfigurationerTask Scheduler (Action):
Program/script: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
Arguments: -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\PSScripts\Monitor-Services.ps1"
Start in: D:\PSScripts
Kör som: service-account (ange giltigt lösenord), ofta Run whether user is logged on or not + Run with highest privileges om behövs.

SQL: säkerställ att logg-kolumner är NVARCHAR(MAX) för att undvika trunkering.5. Snabbdiagnostik (när Task inte slutförs)Aktivera Task History i Task Scheduler → kolla Last Run Result och Event Viewer: Applications and Services Logs → Microsoft → Windows → TaskScheduler → Operational.  Kör exakt kommando manuellt som den användaren:  
Open PowerShell as the scheduled user (runas) and run:
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\PSScripts\Monitor-Services.ps1"



Kolla loggfilen: D:\PSScripts\logs\Monitor-Services_debug.txt.Verifiera att scriptet inte väntar på input eller visar GUI.Kontrollera att eventuella mappade drives används via UNC eller mappas i scriptet.Titta i Task Manager / Process Explorer efter körande powershell.exe och commandline.6. Recommended debug snippet (lägg i början av scriptet)Start-Transcript: Code         $debugLog = "D:\PSScripts\logs\Monitor-Services_debug.txt"Start-Transcript -Path $debugLog -AppendWrite-Output "Script started: $(Get-Date) -- User: $env:USERNAME -- PID: $PID -- CWD: $(Get-Location)"
      I slutet: Code         Write-Output "Script ended: $(Get-Date)"Stop-Transcript
      7. Vanliga fel & åtgärderTrunkering eller för kort kolumntyp i SQL-loggar → uppgradera kolumner till NVARCHAR(MAX).Task startar men fastnar → kontrollera Start in / relativa sökvägar / nätverksshares.Credential issues → testkör med Run only when user is logged on och kör kommandot manuellt.Timeout i Task-inställningar → öka eller avaktivera Stop the task if it runs longer than.8. Incident-playbook (snabb åtgärd)Status: Kontrollera om task är aktiv i Task Scheduler och senaste körningsstatus.  Samla loggar:
Task History (Scheduler)
D:\PSScripts\logs\Monitor-Services_debug.txt
SQL: SELECT senaste rader i relevant SLLEDW_LOG_* för laddnings_id.

Kör debug-körning manuellt som scheduled user.Om fel i SQL: kör styr.P_GetFullErrorsForLaddningsId @laddnings_id = '<GUID>' och kopiera resultsets.Åtgärd: återställ credentials / uppdatera script / justera Task-inställningar.Verifiera: kör task manuellt via UI (Right-click → Run) och kontrollera att det fullföljer.  Dokumentera åtgärder i denna runbook (se changelog nedan).9. SQL & API-kommandon (snabbreferens)Kör stored proc i SSMS:
EXEC [styr].[P_GetFullErrorsForLaddningsId] @laddnings_id = 'GUID';

Exempel Node curl mot lokalt endpoint:
curl -X POST https://internal-api/qlmonitor/errors -H "Authorization: Bearer <token>" -d '{"laddnings_id":"<GUID>"}'

10. Kontroller att lägga in i CI/CD / deploymentSäkerställ att Monitor-Services.ps1 är i versionskontroll.Include migration scripts for DB-changes (e.g., alter table to NVARCHAR(MAX)).Testa scheduled-task på staging med samma user och environ.11. Rollback-planOm en förändring orsakar driftstopp:
Stoppa task (Scheduler).
Återställ tidigare version av script från repo.
Återställ SQL-schema om relevant (ha migrations-skript för revert).
Starta task och verifiera.

12. Changelog (mall)2026-08-11 — Ändrat runbook, la till debug-snippet — owner: team-data-platform13. Dataview-exempel (Obsidian Dataview)Lista alla incident-notes: Code         table status, owner, createdfrom "" where contains(tags, "#incident") and status != "done"sort created desc
      Dashboard för öppna uppgifter: Code         task from "Tasks"where !completed and contains(tags, "qlmonitor")
      14. Templater-snippet (Templater)/* Spara som Template t.ex. "QLMonitor Incident" */title: <% tp.file.title() %>
tags: [incident, qlmonitor]
created: <% tp.date.now("YYYY-MM-DD HH:mm") %>
owner: team-data-platform
status: open<% tp.file.title() %>Description:Laddnings_id:Steps tried:Logs:15. Förslag på Vault-struktur/Operations/Runbooks/QLMonitor.md/Operations/Runbooks/templates//Incidents/QLMonitor//Dev/SQL/16. Export / delningFör delning med drift: exportera som PDF eller använd Obsidian Publish.Backup: git + remote (privat repo) + nattlig backup.