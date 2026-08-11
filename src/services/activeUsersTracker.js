const activeUsers = new Map(); // username -> lastSeen timestamp
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minuter
 
function touch(username) {
  activeUsers.set(username, Date.now());
}
 
function getActiveUsers() {
  const cutoff = Date.now() - TIMEOUT_MS;
  for (const [user, lastSeen] of activeUsers) {
    if (lastSeen < cutoff) activeUsers.delete(user);
  }
  return Array.from(activeUsers.keys());
}
 
module.exports = { touch, getActiveUsers };