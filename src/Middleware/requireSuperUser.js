const { getUserRole } = require('../services/authorizedUsers');
 
async function requireSuperUser(req, res, next) {
    try {
        if (!req.ntlm || !req.ntlm.Authenticated) {
            return res.status(401).json({ error: 'Ej autentiserad' });
        }
 
        const username = req.ntlm.UserName;
        const userInfo = await getUserRole(username);
 
        if (!userInfo || !userInfo.IsActive) {
            return res.status(403).json({ error: 'Åtkomst nekad' });
        }
 
        if (userInfo.Role !== 'SU') {
            return res.status(403).json({ error: 'Kräver SuperUser-behörighet' });
        }
 
        req.userInfo = userInfo; // tillgängligt i routen om du vill logga vem som gjorde ändringen
        next();
    } catch (err) {
        console.error('requireSuperUser fel:', err);
        res.status(500).json({ error: 'Serverfel vid behörighetskontroll' });
    }
}
 
module.exports = requireSuperUser;