const express = require('express');
const router = express.Router();
 
router.get('/whoami', (req, res) => {
  // 1. Försök hämta från IIS/NTLM-headers som skickas i intranätet
  let username = req.headers['x-windows-user'] || 
                 req.headers['x-iis-windows-user'] || 
                 req.user?.username || 
                 req.ntlm?.UserName;
 
  // 2. Fallback: Om vi kör lokalt i utvecklingsmiljö, hämta operativsystemets inloggade användare
  if (!username) {
    username = process.env.USERNAME || process.env.USER || 'GAIA\\LokaltKonto';
  }
 
  res.json({ username });
});
 
module.exports = router;