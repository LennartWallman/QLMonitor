import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
 
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Ladda .env-filer baserat på mode (development/production)
  const env = loadEnv(mode, process.cwd(), '')
  
  // Fallback till localhost om VITE_API_URL inte är satt
  const apiUrl = env.VITE_API_URL || 'http://localhost:3003'
  
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      host: true, // Gör servern tillgänglig på nätverket automatiskt
      allowedHosts: ['sllbi01'], // Tillåter anslutningar via sllbi01
      proxy: {
        // Proxy för API-anrop
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        // Proxy för Socket.IO
        '/socket.io': {
          target: apiUrl,
          ws: true,
          changeOrigin: true
        }
      }
    }
  }
})