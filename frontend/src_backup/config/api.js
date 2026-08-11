.// Dynamisk API-URL som fungerar överallt
export const getApiUrl = () => {
  // 1. Kolla om miljövariabel finns
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // 2. Om vi kör på localhost (utveckling), använd localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return import.meta.env.VITE_API_URL || 'http://localhost:3003'
  }
  
  // 3. Annars, använd samma host som frontend men port 3003
  const protocol = window.location.protocol
  const hostname = window.location.hostname
  return `${protocol}//${hostname}:3003`
}
 
export const API_BASE_URL = getApiUrl()