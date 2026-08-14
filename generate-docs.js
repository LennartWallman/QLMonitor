const fs = require('fs');
const path = require('path');
 
const sourceDocsDir = __dirname;
const obsidianVaultDir = path.join(__dirname, 'QLMonitor');
 
console.log('🚀 Startar generering av systemdokumentation...');
 
// Säkerställ att målmapparna finns i Obsidian
const devFolder = path.join(obsidianVaultDir, 'Dev');
const opsFolder = path.join(obsidianVaultDir, 'Operations');
 
[devFolder, opsFolder].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});
 
// 1. Hämta information från package.json för att förstå teknologistacken
let dependencies = {};
let devDependencies = {};
let appName = "QLMonitor";
 
try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    dependencies = packageJson.dependencies || {};
    devDependencies = packageJson.devDependencies || {};
    appName = packageJson.name || appName;
} catch (e) {
    console.log('⚠️  Kunde inte läsa package.json, använder standardvärden.');
}
 
// 2. Generera SAD (Software Architecture Document)
function generateSAD() {
    const sadContent = `# Software Architecture Document (SAD) - ${appName}
 
## 1. Introduktion
Detta dokument beskriver arkitekturen för **${appName}**, en applikation designad för att övervaka SQL Server-prestanda och visualisera data (bland annat via \`sp_whoisactive\`).
 
## 2. Arkitekturöversikt
Systemet är uppbyggt som en klassisk klient-server-applikation:
 
\`\`\`
+------------------+          +------------------+          +------------------+
|                  |   HTTP   |                  |   T-SQL  |                  |
|  React Frontend  | -------> |  Node.js Backend | -------> |    SQL Server    |
|                  |          |                  |          |                  |
+------------------+          +------------------+          +------------------+
\`\`\`
 
*   **Frontend:** React-baserat webbgränssnitt som visualiserar insamlad data och realtidsstatus.
*   **Backend:** Node.js-applikation (Express) som hanterar schemalagd datainsamling, API-ändpunkter och databaskopplingar.
*   **Databas:** SQL Server där prestandadata samlas in (bland annat med hjälp av \`sp_whoisactive\`).
 
## 3. Teknologistack
Baserat på projektets konfiguration används följande teknologier:
 
### Backend & Runtime
*   **Runtime:** Node.js
*   **Huvudbibliotek:** ${Object.keys(dependencies).map(dep => `\`${dep}\``).join(', ') || 'Express, mssql'}
 
### Processhantering
*   Projektet innehåller en \`ecosystem.config.js\` vilket indikerar att **PM2** används för driftsättning och processhantering i produktionsmiljö.
 
---
*Genererad automatiskt den: ${new Date().toLocaleDateString()}*
`;
 
    fs.writeFileSync(path.join(devFolder, 'Software Architecture Document (SAD).md'), sadContent);
    console.log('✅ Genererade: "Software Architecture Document (SAD).md" ➡️  QLMonitor/Dev/');
}
 
// 3. Generera Utvecklingsmetodik
function generateMethodology() {
    const methodologyContent = `# Utvecklingsmetodik & Komma igång
 
## 1. Projektstruktur
Här är en översikt av hur källkoden är organiserad:
 
*   \`frontend/\` - Innehåller React-applikationen (gränssnittet).
*   \`src/\` - Backend-källkod (API, databaskopplingar och insamlingslogik).
*   \`QLMonitor/\` - Obsidian-valv för systemdokumentation (detta valv).
*   \`sp_whoisactive-20260409/\` - SQL-skript och resurser för databasövervakningen.
 
## 2. Komma igång som utvecklare
 
### Förutsättningar
*   Node.js installerat på datorn.
*   Tillgång till en SQL Server-instans.
 
### Installation
1. Klona arkivet och ställ dig i rotmappen.
2. Installera beroenden för backend:
   \`\`\`bash
   npm install
   \`\`\`
3. Gå till frontend-mappen och installera dess beroenden:
   \`\`\`bash
   cd frontend
   npm install
   \`\`\`
 
### Miljövariabler (.env)
Applikationen kräver en \`.env\`-fil i rotmappen med följande konfiguration (se \`.env.txt\` för exempel):
*   Databasanslutningsuppgifter (Server, Databas, Användare, Lösenord).
*   Portnummer för API:et.
 
## 3. Köra applikationen lokalt
För att starta backend i utvecklingsläge:
\`\`\`bash
npm run dev
\`\`\`
 
---
*Genererad automatiskt den: ${new Date().toLocaleDateString()}*
`;
 
    fs.writeFileSync(path.join(devFolder, 'Utvecklingsmetodik.md'), methodologyContent);
    console.log('✅ Genererade: "Utvecklingsmetodik.md" ➡️  QLMonitor/Dev/');
}
 
// 4. Kopiera befintliga filer (som igår)
function processExistingMarkdown() {
    const files = fs.readdirSync(sourceDocsDir);
    files.forEach(file => {
        if (file.endsWith('.md') && file !== 'README.md' && file !== 'generate-docs.js') {
            const sourcePath = path.join(sourceDocsDir, file);
            let targetSubFolder = 'Dev';
            if (file.toLowerCase().includes('driftsättning') || file.toLowerCase().includes('operation')) {
                targetSubFolder = 'Operations';
            }
            const targetPath = path.join(obsidianVaultDir, targetSubFolder, file);
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`✅ Kopierade: "${file}" ➡️  QLMonitor/${targetSubFolder}/`);
        }
    });
}
 
// Kör alla steg
generateSAD();
generateMethodology();
processExistingMarkdown();
 
console.log('\n🎉 Klar! Öppna Obsidian för att se de nya dokumenten under mappen "Dev".');