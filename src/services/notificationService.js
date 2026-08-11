// services/notificationService.js
const axios = require('axios');
require('dotenv').config();
 
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://sllbi01:5173';
 
/**
 * Skickar ett snyggt formaterat felmeddelande till Microsoft Teams vid jobb-fel.
 * @param {Object} job - Jobbobjektet som misslyckades
 * @param {string} serverName - Namnet på SQL-servern
 */
async function sendTeamsAlert(job, serverName) {
  if (!TEAMS_WEBHOOK_URL) {
    console.warn('⚠️ TEAMS_WEBHOOK_URL är inte konfigurerad i .env-filen.');
    return;
  }
 
  // Skapa en direktlänk till jobbet i din Vue-app
  const jobLink = `${FRONTEND_BASE_URL}/?server=${encodeURIComponent(serverName)}&jobId=${encodeURIComponent(job.JobId)}`;
 
  // Formatera datumet snyggt
  const formattedDate = job.LastRunDateTime 
    ? new Date(job.LastRunDateTime).toLocaleString('sv-SE') 
    : 'Nyss';
 
  // Förbered felmeddelandet (max 400 tecken för att inte spränga kortet, samt fallback om det saknas)
  const errorMessage = job.ErrorMessage 
    ? `${job.ErrorMessage.substring(0, 400)}${job.ErrorMessage.length > 400 ? '...' : ''}`
    : 'Inget felmeddelande sparat i SQL Agent.';
 
  // Bygg ett modernt Adaptive Card som matchar din Power Automate-webhook
  const adaptiveCard = {
    "type": "message",
    "attachments": [
      {
        "contentType": "application/vnd.microsoft.card.adaptive",
        "content": {
          "type": "AdaptiveCard",
          "body": [
            {
              "type": "Container",
              "style": "attention",
              "items": [
                {
                  "type": "TextBlock",
                  "text": `❌ SQL Agent-jobb misslyckades på ${serverName}`,
                  "weight": "Bolder",
                  "size": "Medium",
                  "color": "Attention"
                }
              ],
              "bleed": true
            },
            {
              "type": "FactSet",
              "facts": [
                { "title": "Jobbnamn:", "value": job.JobName || 'Okänt jobb' },
                { "title": "Server:", "value": serverName },
                { "title": "Kategori:", "value": job.CategoryName || 'Odefinierad' },
                { "title": "Kördes:", "value": formattedDate },
                { "title": "Felnummer:", "value": job.ErrorCode ? String(job.ErrorCode) : 'Inget angivet' }
              ],
              "margin": "Medium"
            },
            {
              "type": "TextBlock",
              "text": "Senaste felmeddelande:",
              "weight": "Bolder",
              "margin": "Medium"
            },
            {
              "type": "Container",
              "style": "emphasis",
              "items": [
                {
                  "type": "TextBlock",
                  "text": errorMessage,
                  "wrap": true,
                  "fontType": "Monospace",
                  "size": "Small"
                }
              ]
            }
          ],
          "actions": [
            {
              "type": "Action.OpenUrl",
              "title": "🔍 Visa jobb i SQL Monitor",
              "url": jobLink
            }
          ],
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "version": "1.4"
        }
      }
    ]
  };
 
  try {
    // Vi skickar med explicit UTF-8 i headern för att undvika problem med svenska tecken (å, ä, ö)
    await axios.post(TEAMS_WEBHOOK_URL, adaptiveCard, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
    console.log(`🚀 [Teams] Larm skickat för misslyckat jobb: ${job.JobName}`);
  } catch (error) {
    // Om det blir fel, logga ut vad Power Automate svarar så det är lätt att felsöka
    if (error.response && error.response.data) {
      console.error('❌ [Teams] Power Automate nekade anropet:', JSON.stringify(error.response.data));
    } else {
      console.error('❌ [Teams] Misslyckades att skicka larm till Teams:', error.message);
    }
  }
}
 
module.exports = {
  sendTeamsAlert
};