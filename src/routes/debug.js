const express = require('express');
const router = express.Router();
const { getActiveUsers } = require('../services/activeUsersTracker');
 
router.get('/debug-info', (req, res) => {
  const users = getActiveUsers(); // Detta är en array med strängar, t.ex. ["Dator (10.157.0.112)"]
  
  // Mappa om strängarna till objekt-formatet som App.vue vill ha: { username, currentAction }
  const mappedUsers = users.map(user => ({
    username: user,
    currentAction: 'Aktiv i SQL Monitor'
  }));
 
  // Skicka tillbaka exakt den struktur som App.vue förväntar sig!
  res.json({
    users: mappedUsers,
    count: users.length,
    serverTimeUtc: new Date().toISOString()
  });
});
 
module.exports = router;