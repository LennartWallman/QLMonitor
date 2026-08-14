const monitor = require('../monitor');
 
async function getUserRole(username) {
    const pool = monitor.getPool('management');
    const result = await pool.request()
        .input('username', username)
        .query(`
            SELECT Role, IsActive, DisplayName, Email, Phone
            FROM dbo.AuthorizedUsers
            WHERE Username = @username
        `);
 
    if (result.recordset.length === 0) return null;
    return result.recordset[0];
}
 
module.exports = { getUserRole };