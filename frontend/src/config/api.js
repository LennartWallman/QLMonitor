// Fil: frontend/src/config/api.js
 
export const getApiUrl = () => {
  let url = import.meta.env.VITE_API_URL || 'http://SLLBI01:3003';
  
  // Säkerställ att URL:en slutar på /api (men inte dubbelt)
  if (!url.endsWith('/api') && !url.endsWith('/api/')) {
    // Ta bort eventuellt avslutande snedstreck innan vi lägger till /api
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    url = `${url}/api`;
  }
  
  return url;
};
 
// Exportera även som default för bakåtkompatibilitet om någon fil importerar så
export default getApiUrl;