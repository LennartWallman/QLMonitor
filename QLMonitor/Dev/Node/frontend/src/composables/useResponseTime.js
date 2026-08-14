import { ref } from 'vue';
 
// Globala variabler som behåller sitt tillstånd mellan alla komponenter
const lastResponseTime = ref(null);
const recentApiCalls = ref([]);
 
export function useResponseTime() {
    // Funktion för att extrahera svarstidsheadern från ett API-svar
    const updateResponseTime = (headers) => {
        if (!headers) return;
        
        // Fetch API använder headers.get(), Axios använder direktnyckel
        const duration = typeof headers.get === 'function' 
            ? headers.get('X-Query-Duration-MS') 
            : headers['x-query-duration-ms'] || headers['X-Query-Duration-MS'];
            
        if (duration) {
            lastResponseTime.value = parseInt(duration);
        }
    };
 
    // Funktion för att hämta de 10 senaste anropen från backend
    const fetchRecentCalls = async (backendUrl) => {
        try {
            const res = await fetch(`${backendUrl}/api/debug/recent-calls`);
            if (res.ok) {
                recentApiCalls.value = await res.json();
            }
        } catch (err) {
            console.error('Kunde inte hämta debug-loggar:', err);
        }
    };
 
    return {
        lastResponseTime,
        recentApiCalls,
        updateResponseTime,
        fetchRecentCalls
    };
}