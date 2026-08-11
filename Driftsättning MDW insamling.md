Driftsättningsplan: Utökad SQL Server-övervakning med MDW1. MålsättningMålet är att centralisera prestanda- och aktivitetsövervakning för alla kritiska SQL-servrar till den befintliga MDW-databasen. Detta kommer att ge en enhetlig överblick via vår SQL Dashboard och möjliggöra proaktiv prestandahantering och snabbare felsökning.2. FörutsättningarInnan vi börjar driftsättningen på en ny server, säkerställ följande:Central MDW-server: Servern som hostar MDW-databasen (låt oss kalla den MDW-HOST) är fullt fungerande.Nätverksåtkomst: Målservern måste kunna nå MDW-HOST över nätverket (vanligtvis port 1433).Autentisering: De Windows-konton som SQL Server Agent körs under på målservrarna behöver nödvändiga rättigheter. Det enklaste är att använda ett dedikerat proxy-konto.Administratörsåtkomst: Du behöver sysadmin-rättigheter på varje målserver för att kunna konfigurera Data Collection.3. DriftsättningsfaserPlanen är avsiktligt försiktig och rekommenderar att man konfigurerar en server i taget för att säkerställa stabilitet och verifiera varje steg.Fas 1: Förberedelser (ca 30 min)Identifiera Målservrar: Skapa en prioriterad lista över de servrar som ska läggas till. Börja med den minst kritiska produktionsservern eller en test/QA-server om möjligt.Verifiera SQL Server Agent: Kontrollera att SQL Server Agent-tjänsten är igång och inställd på automatisk start på den första målservern.Skapa Proxy-konto (Rekommenderat):
I SSMS på målservern, navigera till SQL Server Agent -> Proxies -> Credentials.
Skapa en ny Credential med ett domänkonto som har db_owner-rättigheter på MDW-databasen på MDW-HOST.
Skapa en ny Proxy under SQL Server Agent -> Proxies som använder denna Credential.

Fas 2: Konfiguration på Målserver (ca 1 timme per server)Följ dessa steg i SQL Server Management Studio (SSMS) ansluten till den server du vill börja övervaka.Starta Konfigurationsguiden:

Högerklicka på Management -> Data Collection och välj Configure Management Data Warehouse.

Anslut till den Centrala MDW:n:

I guiden, välj "Set up data collection".
När du blir tillfrågad om Management Data Warehouse, VÄLJ INTE ATT SKAPA EN NY.
Ange namnet på din befintliga MDW-HOST och klicka på Connect.
Välj den existerande MDW-databasen från listan.

Mappa Rättigheter:

Guiden kommer att be dig mappa inloggningar och användare. Se till att mdw_admin-rollen är korrekt mappad för de användare som ska hantera insamlingen.

Slutför Guiden:

Guiden kommer att skapa tre nya jobb under SQL Server Agent -> Jobs på målservern:
collection_set_1_noncached_collect_and_upload
collection_set_2_cached_collect_and_upload
collection_set_3_cached_collect_and_upload


Den kommer också att skapa ett sysutility_purge_history_job.

Aktivera Datainsamling:

Expandera Management -> Data Collection.
Högerklicka på Server Activity, Disk Usage och Query Statistics och välj Start Data Collection Set.

Fas 3: Verifiering (ca 30 min per server)Detta är det viktigaste steget för att säkerställa att allt fungerar.Verifiera Jobbstatus:

Kontrollera jobbhistoriken för de tre nya collection_set_*-jobben på målservern. Säkerställ att de har kört minst en gång utan fel.

Verifiera Datainflöde i MDW:

Anslut till MDW-HOST och kör följande fråga för att bekräfta att data från den nya servern har anlänt. Ersätt 'NAMN_PÅ_NY_SERVER' med det faktiska servernamnet (oftast utan domän, t.ex. SLLBI02).

USE MDW;
GO

-- Kontrollera om den nya servern har rapporterat in snapshots nyligen
SELECT instance_name, MAX(snapshot_time) AS last_snapshot
FROM core.snapshots
GROUP BY instance_name
ORDER BY last_snapshot DESC;

-- Specifikt för den nya servern
SELECT TOP 5 *
FROM core.snapshots
WHERE instance_name = 'NAMN_PÅ_NY_SERVER'
ORDER BY snapshot_time DESC;

Verifiera i Dashboarden:

Gå till din SQL Dashboard.
Välj den nyligen tillagda servern i dropdown-menyn.
Navigera till MDW Analys -> CPU Historik. Om data visas (det kan ta 5-15 minuter för den första insamlingen att dyka upp), är konfigurationen lyckad.

Fas 4: RepeteraNär den första servern är konfigurerad och fullständigt verifierad, repetera Fas 2 och Fas 3 för nästa server på din prioriterade lista.4. Viktiga ÖvervägandenPrestanda: Datainsamling har en liten, men mätbar, prestandapåverkan på målservrarna. Genom att rulla ut en server i taget kan ni övervaka eventuella oönskade effekter.Diskanvändning: MDW-databasen kommer att växa. Håll ett öga på dess storlek. Standardinställningen för datalagring (retention) är vanligtvis tillräcklig, men kan behöva justeras i framtiden.Felsökning: Om data inte dyker upp, är den första platsen att felsöka alltid jobbhistoriken för collection_set_*-jobben på målservern. Vanliga fel är relaterade till nätverksåtkomst eller behörigheter till MDW-databasen.