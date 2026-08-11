const { touch } = require('../services/activeUsersTracker');
 
module.exports = function activeUsersMiddleware(req, res, next) {
  // 1. Hämta Windows-användare från NTLM-handskakningen
  let username = null;
  
  if (req.ntlm && req.ntlm.Authenticated) {
    username = `${req.ntlm.Domain}\\${req.ntlm.UserName}`;
  }
  
  // 2. Fallback till IP-adress om NTLM inte är aktiverat eller misslyckas
  if (!username) {
    let ip = req.ip || req.socket.remoteAddress || 'Okänd IP';
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    username = `Dator (${ip})`;
  }
  
  // Registrera aktiviteten i vår tracker
  if (username) {
    touch(username);
  }
  
  next();
};