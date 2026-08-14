<template>
  <div class="mdw-analysis-container">
    <h2>📊 MDW Analys - {{ selectedServer }}</h2>
 
    <!-- Tab Navigation -->
    <div class="tab-navigation">
      <button :class="{ active: activeTab === 'cpu' }" @click="activeTab = 'cpu'">
        📈 CPU Historik
      </button>
      <button :class="{ active: activeTab === 'dbGrowth' }" @click="activeTab = 'dbGrowth'">
        💾 Databastillväxt
      </button>
      <button :class="{ active: activeTab === 'waitStats' }" @click="activeTab = 'waitStats'">
        ⏳ Väntestatistik
      </button>
      <button :class="{ active: activeTab === 'topQueries' }" @click="activeTab = 'topQueries'">
        🔥 Topp CPU Frågor
      </button>
      <button :class="{ active: activeTab === 'ioStats' }" @click="activeTab = 'ioStats'">
        📊 Topp I/O Frågor
      </button>
      <button :class="{ active: activeTab === 'missingIndexes' }" @click="activeTab = 'missingIndexes'">
        🔍 Saknade Index
      </button>
      <button :class="{ active: activeTab === 'unusedIndexes' }" @click="activeTab = 'unusedIndexes'">
        🗑️ Oanvända Index
      </button>
    </div>
 
    <!-- Tab Content -->
    <div class="tab-content">
      <!-- CPU Historik Tab -->
      <div v-if="activeTab === 'cpu'" class="chart-container">
        <h3>CPU Användning (Senaste 7 dagarna)</h3>
        <apexchart 
          v-if="cpuData.length > 0" 
          type="line" 
          :options="cpuChartOptions" 
          :series="cpuSeries" 
          height="400"
        />
        <p v-else class="no-data">⚠️ Ingen CPU-historik tillgänglig</p>
      </div>
 
      <!-- Databastillväxt Tab -->
      <div v-if="activeTab === 'dbGrowth'" class="chart-container">
        <h3>Databastillväxt (Senaste 6 månaderna)</h3>
        <apexchart 
          v-if="dbGrowthData.length > 0" 
          type="line" 
          :options="dbGrowthChartOptions" 
          :series="dbGrowthSeries" 
          height="400"
        />
        <p v-else class="no-data">⚠️ Ingen databastillväxt tillgänglig</p>
      </div>
 
      <!-- Väntestatistik Tab -->
      <div v-if="activeTab === 'waitStats'" class="table-container">
        <h3>Dominerande väntetyper (senaste 24h)</h3>
        <table v-if="waitStatsData.length > 0" class="wait-stats-table">
          <thead>
            <tr>
              <th>Väntetyp</th>
              <th>Total väntetid (ms)</th>
              <th>Väntetid (h:m:s)</th>
              <th>% av total</th>
              <th>Info</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="(stat, index) in waitStatsData" 
              :key="index"
              @click="openWaitStatsModal(stat)"
              class="clickable-row"
            >
              <td>
                <span class="wait-type-badge" :style="{ backgroundColor: getWaitStatInfo(stat.wait_type).color }">
                  {{ stat.wait_type }}
                </span>
              </td>
              <td class="numeric">{{ formatNumber(stat.total_wait_time_ms_delta) }}</td>
              <td class="numeric">{{ formatDuration(stat.total_wait_time_ms_delta) }}</td>
              <td class="numeric">{{ calculatePercentage(stat.total_wait_time_ms_delta) }}%</td>
              <td>
                <button class="info-btn" @click.stop="openWaitStatsModal(stat)">
                  ℹ️ Detaljer
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="no-data">⚠️ Ingen väntestatistik tillgänglig</p>
      </div>
 
      <!-- Topp CPU Frågor Tab -->
      <div v-if="activeTab === 'topQueries'" class="table-container">
        <h3>Topp 20 CPU-intensiva frågor</h3>
        <table v-if="topQueriesData.length > 0" class="data-table">
          <thead>
            <tr>
              <th>SQL Text (trunkerad)</th>
              <th>Total CPU (ms)</th>
              <th>Exekveringar</th>
              <th>Genomsnitt CPU (ms)</th>
              <th>Total Duration (ms)</th>
              <th>Detaljer</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(query, index) in topQueriesData.slice(0, 20)" :key="index">
              <td class="sql-text">{{ query.query_text.substring(0, 100) }}...</td>
              <td class="numeric">{{ Number(query.total_cpu_ms).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) }}</td>
              <td class="numeric">{{ Number(query.execution_count).toLocaleString('sv-SE') }}</td>
              <td class="numeric">{{ formatDecimalNumber(Number(query.total_cpu_ms) / Number(query.execution_count)) }}</td>
              <td class="numeric">{{ Number(query.total_duration_ms).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) }}</td>
              <td>
                <button class="info-btn" @click="openQueryModal(query)">
                  📄 Visa Detaljer
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="no-data">⚠️ Ingen query-statistik tillgänglig</p>
      </div>
 
      <!-- Topp I/O Frågor Tab -->
      <div v-if="activeTab === 'ioStats'" class="table-container">
        <h3>Topp 20 I/O-intensiva frågor</h3>
        <table v-if="ioStatsData.length > 0" class="data-table">
          <thead>
            <tr>
              <th>SQL Text (trunkerad)</th>
              <th>Totala läsningar</th>
              <th>Totala skrivningar</th>
              <th>Exekveringar</th>
              <th>Genomsnitt Läsningar</th>
              <th>Detaljer</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(query, index) in ioStatsData.slice(0, 20)" :key="index">
              <td class="sql-text">{{ query.query_text.substring(0, 100) }}...</td>
              <td class="numeric">{{ Number(query.total_logical_reads).toLocaleString('sv-SE') }}</td>
              <td class="numeric">{{ Number(query.total_logical_writes).toLocaleString('sv-SE') }}</td>
              <td class="numeric">{{ Number(query.execution_count).toLocaleString('sv-SE') }}</td>
              <td class="numeric">{{ (Number(query.total_logical_reads) / Number(query.execution_count)).toFixed(0) }}</td>
              <td>
                <button class="info-btn" @click="openQueryModal(query)">
                  📄 Visa Detaljer
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="no-data">⚠️ Ingen I/O-statistik tillgänglig</p>
      </div>
 
      <!-- Saknade Index Tab -->
      <div v-if="activeTab === 'missingIndexes'" class="table-container">
        <h3>Saknade Index (Topp 50)</h3>
        <table v-if="missingIndexesData.length > 0" class="data-table">
          <thead>
            <tr>
              <th>Databas</th>
              <th>Tabell</th>
              <th>Equality Columns</th>
              <th>Inequality Columns</th>
              <th>Included Columns</th>
              <th>Förbättring (%)</th>
              <th>Sökningar</th>
              <th>Generera T-SQL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(idx, index) in missingIndexesData.slice(0, 50)" :key="index">
              <td>{{ idx.DatabaseName }}</td>
              <td>{{ idx.TableName }}</td>
              <td>{{ idx.equality_columns || '-' }}</td>
              <td>{{ idx.inequality_columns || '-' }}</td>
              <td>{{ idx.included_columns || '-' }}</td>
              <td class="numeric">{{ Number(idx.improvement_percent).toFixed(1) }}%</td>
              <td class="numeric">{{ Number(idx.user_seeks).toLocaleString('sv-SE') }}</td>
              <td>
                <button class="sql-btn" @click="openIndexSqlModal(idx, 'create')">
                  📝 CREATE INDEX
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="no-data">⚠️ Inga saknade index hittades</p>
      </div>
 
      <!-- Oanvända Index Tab -->
      <div v-if="activeTab === 'unusedIndexes'" class="table-container">
        <h3>Oanvända Index (Topp 50)</h3>
        <table v-if="unusedIndexesData.length > 0" class="data-table">
          <thead>
            <tr>
              <th>Tabell</th>
              <th>Index</th>
              <th>Typ</th>
              <th>Sökningar</th>
              <th>Uppdateringar</th>
              <th>Storlek (MB)</th>
              <th>Generera T-SQL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(idx, index) in unusedIndexesData.slice(0, 50)" :key="index">
              <td>{{ idx.TableName }}</td>
              <td>{{ idx.IndexName }}</td>
              <td>{{ idx.IndexType || '-' }}</td>
              <td class="numeric">{{ Number(idx.Reads).toLocaleString('sv-SE') }}</td>
              <td class="numeric">{{ Number(idx.Writes).toLocaleString('sv-SE') }}</td>
              <td class="numeric">{{ Number(idx.IndexSizeMB).toFixed(2) }}</td>
              <td>
                <button class="sql-btn danger" @click="openIndexSqlModal(idx, 'drop')">
                  🗑️ DROP INDEX
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="no-data">⚠️ Inga oanvända index hittades</p>
      </div>
    </div>
 
 
    <!-- Wait Stats Modal -->
    <div v-if="showWaitStatsModal" class="modal-overlay" @click="closeWaitStatsModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>📊 Detaljerad information: {{ selectedWaitStat?.wait_type }}</h3>
          <button class="close-btn" @click="closeWaitStatsModal">✖</button>
        </div>
        <div class="modal-body">
          <div class="wait-stat-detail">
            <div class="detail-row">
              <span class="label">Väntetyp:</span>
              <span class="value">{{ selectedWaitStat?.wait_type }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Total väntetid:</span>
              <span class="value">{{ formatDuration(selectedWaitStat?.total_wait_time_ms_delta) }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Väntetid (ms):</span>
              <span class="value">{{ formatNumber(selectedWaitStat?.total_wait_time_ms_delta) }} ms</span>
            </div>
            <div class="detail-row">
              <span class="label">Andel av total väntetid:</span>
              <span class="value">{{ calculatePercentage(selectedWaitStat?.total_wait_time_ms_delta) }}%</span>
            </div>
            <div class="detail-row description">
              <span class="label">Beskrivning:</span>
              <span class="value">{{ getWaitStatInfo(selectedWaitStat?.wait_type).description }}</span>
            </div>
            <div class="detail-row recommendation">
              <span class="label">Rekommendation:</span>
              <span class="value">{{ getWaitStatInfo(selectedWaitStat?.wait_type).recommendation }}</span>
            </div>
        
            <!-- NYTT: Länkar för mer information -->
            <div v-if="getWaitStatInfo(selectedWaitStat?.wait_type).links && getWaitStatInfo(selectedWaitStat?.wait_type).links.length > 0" class="detail-row links">
              <span class="label">Läs mer:</span>
              <div class="value link-list">
                <a 
                  v-for="(link, index) in getWaitStatInfo(selectedWaitStat?.wait_type).links" 
                  :key="index" 
                  :href="link.url" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  🔗 {{ link.text }}
                </a>
              </div>
            </div>
        
          </div>
        </div>
      </div>
    </div>
 
    <!-- Query Details Modal -->
    <div v-if="showQueryModal" class="modal-overlay" @click="closeQueryModal">
      <div class="modal-content large" @click.stop>
        <div class="modal-header">
          <h3>📄 Query Detaljer</h3>
          <button class="close-btn" @click="closeQueryModal">✖</button>
        </div>
        <div class="modal-body">
          <div class="query-stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total CPU Time</div>
              <div class="stat-value">{{ formatNumber(selectedQuery?.total_cpu_ms) }} ms</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Exekveringar</div>
              <div class="stat-value">{{ formatNumber(selectedQuery?.execution_count) }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Genomsnitt CPU</div>
              <div class="stat-value">{{ (Number(selectedQuery?.total_cpu_ms) / Number(selectedQuery?.execution_count)).toFixed(2) }} ms</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Duration</div>
              <div class="stat-value">{{ formatNumber(selectedQuery?.total_duration_ms) }} ms</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Logical Reads</div>
              <div class="stat-value">{{ formatNumber(selectedQuery?.total_logical_reads) }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Logical Writes</div>
              <div class="stat-value">{{ formatNumber(selectedQuery?.total_logical_writes) }}</div>
            </div>
          </div>
          
          <div class="sql-code-container">
            <div class="sql-code-header">
              <span>SQL Text:</span>
              <button class="copy-btn" @click="copyToClipboard(selectedQuery?.query_text)">
                📋 Kopiera
              </button>
            </div>
            <pre class="sql-code">{{ selectedQuery?.query_text }}</pre>
          </div>
        </div>
      </div>
    </div>
 
    <!-- Index SQL Modal -->
    <div v-if="showIndexSqlModal" class="modal-overlay" @click="closeIndexSqlModal">
      <div class="modal-content large" @click.stop>
        <div class="modal-header">
          <h3>{{ indexSqlType === 'create' ? '📝 CREATE INDEX T-SQL' : '🗑️ DROP INDEX T-SQL' }}</h3>
          <button class="close-btn" @click="closeIndexSqlModal">✖</button>
        </div>
        <div class="modal-body">
          <div class="sql-code-container">
            <div class="sql-code-header">
              <span>T-SQL Script:</span>
              <button class="copy-btn" @click="copyToClipboard(generatedIndexSql)">
                📋 Kopiera
              </button>
            </div>
            <pre class="sql-code">{{ generatedIndexSql }}</pre>
          </div>
          
          <div class="warning-box" v-if="indexSqlType === 'create'">
            <strong>⚠️ Varning:</strong>
            <ul>
              <li>Testa alltid index i en dev/test-miljö först</li>
              <li>Kontrollera att indexnamnet inte redan finns</li>
              <li>Överväg att skapa index ONLINE om möjligt (Enterprise Edition)</li>
              <li>Analysera påverkan på INSERT/UPDATE/DELETE-prestanda</li>
            </ul>
          </div>
 
          <div class="warning-box danger" v-if="indexSqlType === 'drop'">
            <strong>🚨 VARNING - Radering av Index:</strong>
            <ul>
              <li>Kontrollera att indexet verkligen inte används</li>
              <li>Ta backup av databasen först</li>
              <li>Testa i dev/test-miljö först</li>
              <li>Övervaka prestanda efter radering</li>
              <li>Dokumentera radering för framtida referens</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
 
<script>
import { ref, computed, watch, onMounted } from 'vue';
import VueApexCharts from 'vue3-apexcharts';
 
export default {
  name: 'MdwAnalysis',
  components: {
    apexchart: VueApexCharts
  },
  props: {
    selectedServer: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const activeTab = ref('cpu');
    const cpuData = ref([]);
    const dbGrowthData = ref([]);
    const waitStatsData = ref([]);
    const topQueriesData = ref([]);
    const ioStatsData = ref([]);
    const missingIndexesData = ref([]);
    const unusedIndexesData = ref([]);
    
    const showWaitStatsModal = ref(false);
    const selectedWaitStat = ref(null);
 
    const showQueryModal = ref(false);
    const selectedQuery = ref(null);
 
    const showIndexSqlModal = ref(false);
    const selectedIndex = ref(null);
    const indexSqlType = ref('create'); // 'create' or 'drop'
    const generatedIndexSql = ref('');
 
    // Fetch data function
    const fetchData = async (endpoint, dataRef) => {
      try {
        // Hämta bas-URL från .env-filen
        const API_BASE_URL = import.meta.env.VITE_API_URL;
        const url = `${API_BASE_URL}/api/mdw/${endpoint}?server=${props.selectedServer}`;
        console.log(`🔄 [MDW] Hämtar: ${url}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [MDW] HTTP ${response.status} för ${endpoint}:`, errorText);
          throw new Error(errorText || 'API endpoint not found');
        }
        
        const data = await response.json();
        console.log(`✅ [MDW] ${endpoint} returnerade ${data.length} rader`);
        
        if (data.length > 0) {
          console.log(`📋 [MDW] Första raden från ${endpoint}:`, data[0]);
        } else {
          console.warn(`⚠️ [MDW] ${endpoint} returnerade tom array`);
        }
        
        dataRef.value = data;
      } catch (error) {
        console.error(`❌ [MDW] Fel vid hämtning av ${endpoint}:`, error);
        dataRef.value = [];
      }
  };
 
    // Load all data
    const loadAllData = () => {
      console.log('🚀 [MDW] loadAllData() körs för server:', props.selectedServer);
      
      if (!props.selectedServer) {
        console.error('❌ [MDW] Ingen server vald!');
        return;
      }
      
      fetchData('cpu-history', cpuData);
      fetchData('db-growth', dbGrowthData);
      fetchData('wait-stats', waitStatsData);
      fetchData('query-stats', topQueriesData);
      fetchData('query-stats-by-io', ioStatsData);
      fetchData('missing-indexes', missingIndexesData);
      fetchData('unused-indexes', unusedIndexesData);
    };
 
    // CPU Chart
    const cpuSeries = computed(() => [{
      name: 'CPU %',
      data: cpuData.value.map(d => ({
        x: new Date(d.snapshot_time).getTime(),
        y: parseFloat(d.CpuPercentage) || 0
      }))
    }]);
 
    const cpuChartOptions = {
      chart: { type: 'line', toolbar: { show: true } },
      xaxis: { type: 'datetime' },
      yaxis: { title: { text: 'CPU %' }, min: 0, max: 100 },
      stroke: { curve: 'smooth', width: 2 },
      colors: ['#00E396'],
      tooltip: { x: { format: 'dd MMM yyyy HH:mm' } }
    };
 
    // DB Growth Chart
    const dbGrowthSeries = computed(() => {
      const grouped = {};
      dbGrowthData.value.forEach(row => {
        if (!grouped[row.database_name]) grouped[row.database_name] = [];
        grouped[row.database_name].push({
          x: new Date(row.snapshot_time).getTime(),
          y: parseFloat(row.TotalSizeMB) || 0
        });
      });
      return Object.keys(grouped).map(db => ({ name: db, data: grouped[db] }));
    });
 
    const dbGrowthChartOptions = {
      chart: { type: 'line', toolbar: { show: true } },
      xaxis: { type: 'datetime' },
      yaxis: { title: { text: 'Storlek (MB)' } },
      stroke: { curve: 'smooth', width: 2 },
      tooltip: { x: { format: 'dd MMM yyyy' } }
    };
 
    // Wait Stats Functions
    const totalWaitTime = computed(() => {
      return waitStatsData.value.reduce((sum, stat) => sum + (stat.total_wait_time_ms_delta || 0), 0);
    });
 
    const calculatePercentage = (waitTime) => {
      if (!totalWaitTime.value) return 0;
      return ((waitTime / totalWaitTime.value) * 100).toFixed(2);
    };
 
    const formatNumber = (num) => {
      return new Intl.NumberFormat('sv-SE').format(Math.round(num || 0));
    };
 
    const formatDecimalNumber = (num) => {
      if (typeof num !== 'number' || isNaN(num)) return '0,00';
      return new Intl.NumberFormat('sv-SE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(num);
    };

    const formatDuration = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours}h ${minutes}m ${secs}s`;
    };
 
    const truncateText = (text, maxLength) => {
      if (!text) return 'N/A';
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };
 
    // NY, UTÖKAD KUNSKAPSDATABAS
const waitTypeKnowledgeBase = {
  'CXPACKET': {
    description: 'Parallella frågor väntar på att synkronisera. Vanligt, men höga värden kan indikera suboptimal parallelism.',
    recommendation: '• Överväg att justera MAXDOP (max degree of parallelism).\n• Kontrollera om "Cost Threshold for Parallelism" behöver höjas.\n• Analysera om specifika frågor kan optimeras för att undvika onödig parallellism.',
    links: [
      { text: 'SQLSkills - CXPACKET', url: 'https://www.sqlskills.com/help/waits/cxpacket/' },
      { text: 'Brent Ozar - Troubleshooting CXPACKET', url: 'https://www.brentozar.com/archive/2013/08/what-is-the-cxpacket-wait-type-and-how-do-you-reduce-it/' }
    ],
    color: '#FF6384'
  },
  'PAGEIOLATCH_SH': {
    description: 'Väntar på att läsa en datasida från disk till minnet (shared latch). Indikerar ofta I/O-flaskhalsar eller minnesbrist.',
    recommendation: '• Kontrollera disk I/O-prestanda.\n• Överväg att öka serverns minne (buffer pool) för att cacha mer data.\n• Analysera om saknade index orsakar stora tabellskanningar.',
    links: [
      { text: 'SQLSkills - PAGEIOLATCH_SH', url: 'https://www.sqlskills.com/help/waits/pageiolatch_sh/' }
    ],
    color: '#36A2EB'
  },
  'PAGEIOLATCH_EX': {
    description: 'Väntar på att läsa en datasida från disk till minnet (exclusive latch), ofta relaterat till sid-splittar eller allokering.',
    recommendation: '• Kontrollera disk I/O-prestanda (särskilt skrivhastighet).\n• Analysera om TempDB behöver optimeras (flera filer).\n• Se över index och fill-factor för att minska sid-splittar.',
    links: [
      { text: 'SQLSkills - PAGEIOLATCH_EX', url: 'https://www.sqlskills.com/help/waits/pageiolatch_ex/' }
    ],
    color: '#FFCE56'
  },
  'WRITELOG': {
    description: 'Väntar på att transaktionsloggen ska skrivas till disk. Indikerar en flaskhals i I/O-subsystemet för loggfilen.',
    recommendation: '• Kontrollera transaktionslogg-diskens prestanda.\n• Placera loggfilen på de snabbaste tillgängliga diskarna (SSD).\n• Analysera om transaktioner kan göras mindre eller mer effektiva (batching).',
    links: [
      { text: 'SQLSkills - WRITELOG', url: 'https://www.sqlskills.com/help/waits/writelog/' }
    ],
    color: '#4BC0C0'
  },
  'LCK_M_U': {
    description: 'Väntar på ett uppdateringslås (Update lock). Indikerar låskonflikter där en process väntar på att en annan ska släppa ett lås.',
    recommendation: '• Analysera långa transaktioner som håller lås.\n• Överväg att använda Read Committed Snapshot Isolation (RCSI).\n• Optimera frågor för att minska låstid och undvika eskalering.',
    links: [
      { text: 'SQLSkills - LCK_M_U', url: 'https://www.sqlskills.com/help/waits/lck_m_u/' }
    ],
    color: '#9966FF'
  },
  'ASYNC_NETWORK_IO': {
    description: 'Servern väntar på att klientapplikationen ska bearbeta och hämta resultat. Ofta ett problem i klienten, inte servern ("slow client").',
    recommendation: '• Kontrollera nätverksprestanda mellan server och klient.\n• Analysera om klientapplikationen hämtar data rad-för-rad (RBAR - Row-By-Agonizing-Row) istället för i bulk.\n• Begränsa mängden data som skickas om möjligt.',
    links: [
      { text: 'Brent Ozar - ASYNC_NETWORK_IO', url: 'https://www.brentozar.com/archive/2011/12/asyncnetworkio-what-it-is-and-what-it-isnt/' }
    ],
    color: '#FF9F40'
  },
  'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP': {
    description: 'En bakgrundsprocess i Query Store som städar gamla frågor har slutfört sitt arbete och väntar nu på nästa körning.',
    recommendation: '✅ Detta är normalt och ofarligt systembeteende. Ingen åtgärd krävs.',
    links: [
       { text: 'Microsoft Docs - Query Store', url: 'https://learn.microsoft.com/en-us/sql/relational-databases/performance/monitoring-performance-by-using-the-query-store' }
    ],
    color: '#27ae60' // Grön för ofarlig
  },
  'DEFAULT': {
    description: 'Ingen specifik beskrivning tillgänglig för denna väntetyp.',
    recommendation: 'Konsultera SQL Server-dokumentation eller en expert för att analysera denna väntetyp.',
    links: [
      { text: 'Sök på Microsoft Docs', url: 'https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-os-wait-stats-transact-sql' },
      { text: 'Sök på SQLSkills', url: 'https://www.sqlskills.com/help/waits/' }
    ],
    color: '#95a5a6' // Grå för okänd
  }
};
 
const getWaitStatInfo = (waitType) => {
  return waitTypeKnowledgeBase[waitType] || waitTypeKnowledgeBase['DEFAULT'];
};
 
    // Modal Functions - Wait Stats
    const openWaitStatsModal = (stat) => {
      selectedWaitStat.value = stat;
      showWaitStatsModal.value = true;
    };
 
    const closeWaitStatsModal = () => {
      showWaitStatsModal.value = false;
      selectedWaitStat.value = null;
    };
 
    // Modal Functions - Query Details
    const openQueryModal = (query) => {
      selectedQuery.value = query;
      showQueryModal.value = true;
    };
 
    const closeQueryModal = () => {
      showQueryModal.value = false;
      selectedQuery.value = null;
    };
 
    // Modal Functions - Index SQL
    const openIndexSqlModal = async (index, type) => {
      selectedIndex.value = index;
      indexSqlType.value = type;
      
      if (type === 'create') {
        generatedIndexSql.value = 'Genererar script...';
        showIndexSqlModal.value = true;
        generatedIndexSql.value = await generateCreateIndexSql(index);
      } else {
        generatedIndexSql.value = generateDropIndexSql(index);
        showIndexSqlModal.value = true;
      }
    };

    const closeIndexSqlModal = () => {
    showIndexSqlModal.value = false;
    selectedIndex.value = null;
    generatedIndexSql.value = '';
  };
 
    // Generate CREATE INDEX SQL - Anropar stored procedure
      const generateCreateIndexSql = async (index) => {
        try {
          const params = new URLSearchParams({
            server: props.selectedServer,
            database: index.DatabaseName,
            schema: index.SchemaName || 'dbo',
            table: index.TableName,
            equalityCols: index.equality_columns || '',
            inequalityCols: index.inequality_columns || '',
            includedCols: index.included_columns || ''
          });
          
          // Hämta bas-URL från .env-filen
          const API_BASE_URL = import.meta.env.VITE_API_URL;
          const response = await fetch(`${API_BASE_URL}/api/mdw/generate-create-index?${params}`);
          
          if (!response.ok) {
            throw new Error('Kunde inte generera CREATE INDEX script');
          }
          
          const data = await response.json();
          return data.script;
          
        } catch (error) {
          console.error('❌ Fel vid generering av CREATE INDEX:', error);
          return `-- ❌ Fel vid generering av script: ${error.message}`;
        }
      };
    // Generate DROP INDEX SQL
    const generateDropIndexSql = (index) => {
      const schemaName = index.SchemaName || 'dbo';
      const tableName = index.TableName;
      const indexName = index.IndexName;
      const indexSizeMB = Number(index.IndexSizeMB).toFixed(2);
      const reads = Number(index.Reads).toLocaleString('sv-SE');
      const writes = Number(index.Writes).toLocaleString('sv-SE');
 
      return `-- 🚨 VARNING: Radering av index - Testa i dev/test-miljö först!
-- Index: ${indexName}
-- Tabell: ${schemaName}.${tableName}
-- Storlek: ${indexSizeMB} MB
-- Läsningar: ${reads}
-- Skrivningar: ${writes}
 
USE [${index.DatabaseName || 'master'}];
GO
 
-- Kontrollera indexanvändning innan radering
SELECT 
    OBJECT_NAME(s.object_id) AS TableName,
    i.name AS IndexName,
    s.user_seeks,
    s.user_scans,
    s.user_lookups,
    s.user_updates,
    s.last_user_seek,
    s.last_user_scan,
    s.last_user_lookup
FROM sys.dm_db_index_usage_stats s
INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE i.name = '${indexName}'
    AND OBJECT_NAME(s.object_id) = '${tableName}';
GO
 
-- Ta backup av index-definition (för återställning)
SELECT 
    'CREATE ' + 
    CASE WHEN i.is_unique = 1 THEN 'UNIQUE ' ELSE '' END +
    i.type_desc COLLATE DATABASE_DEFAULT + ' INDEX [' + i.name + '] ON [' + 
    SCHEMA_NAME(t.schema_id) + '].[' + t.name + '] (' +
    STUFF((
        SELECT ', [' + c.name + ']' + 
               CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE ' ASC' END
        FROM sys.index_columns ic
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE ic.object_id = i.object_id 
            AND ic.index_id = i.index_id 
            AND ic.is_included_column = 0
        ORDER BY ic.key_ordinal
        FOR XML PATH('')
    ), 1, 2, '') + ')' +
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM sys.index_columns ic 
            WHERE ic.object_id = i.object_id 
                AND ic.index_id = i.index_id 
                AND ic.is_included_column = 1
        )
        THEN ' INCLUDE (' + STUFF((
            SELECT ', [' + c.name + ']'
            FROM sys.index_columns ic
            INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE ic.object_id = i.object_id 
                AND ic.index_id = i.index_id 
                AND ic.is_included_column = 1
            ORDER BY ic.index_column_id
            FOR XML PATH('')
        ), 1, 2, '') + ')'
        ELSE ''
    END + ';' AS RecreateScript
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
WHERE i.name = '${indexName}'
    AND t.name = '${tableName}';
GO
 
-- Radera index (avkommentera för att köra)
/*
DROP INDEX [${indexName}] ON [${schemaName}].[${tableName}];
PRINT 'Index ${indexName} raderades framgångsrikt.';
*/
GO`;
    };
 
    // Copy to Clipboard Function
    const copyToClipboard = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        alert('✅ Kopierat till urklipp!');
      } catch (err) {
        console.error('❌ Kunde inte kopiera:', err);
        alert('❌ Kunde inte kopiera till urklipp');
      }
    };
 
    // Watch for server changes
    watch(() => props.selectedServer, () => {
      loadAllData();
    });
 
    onMounted(() => {
      console.log('🎬 [MDW] Komponenten monterad med server:', props.selectedServer);
      loadAllData();
    });
 
return {
  activeTab,
  cpuData,
  dbGrowthData,
  waitStatsData,
  topQueriesData,
  ioStatsData,
  missingIndexesData,
  unusedIndexesData,
  cpuSeries,
  cpuChartOptions,
  dbGrowthSeries,
  dbGrowthChartOptions,
  formatNumber,
  formatDuration,
  truncateText,
  calculatePercentage,
  getWaitStatInfo,
  showWaitStatsModal,
  selectedWaitStat,
  openWaitStatsModal,
  closeWaitStatsModal,
  showQueryModal,
  selectedQuery,
  openQueryModal,
  closeQueryModal,
  showIndexSqlModal,
  selectedIndex,
  indexSqlType,
  generatedIndexSql,
  openIndexSqlModal,
  closeIndexSqlModal,
  generateCreateIndexSql,
  generateDropIndexSql,
  formatDecimalNumber, // <--- LÄGG TILL DENNA RAD
  copyToClipboard
};
}
};
</script>

<style scoped>
.mdw-analysis-container {
  padding: 20px;
  background: #f8f9fa;
  min-height: 100vh;
}
 
h2 {
  margin-bottom: 20px;
  color: #2c3e50;
}
 
.tab-navigation {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 2px solid #ddd;
  flex-wrap: wrap;
}
 
.tab-navigation button {
  padding: 12px 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  border-bottom: 3px solid transparent;
  transition: all 0.3s;
}
 
.tab-navigation button:hover {
  color: #2c3e50;
  background: #f0f0f0;
}
 
.tab-navigation button.active {
  color: #3498db;
  border-bottom-color: #3498db;
  background: white;
}
 
.tab-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
 
.chart-container h3,
.table-container h3 {
  margin-bottom: 20px;
  color: #2c3e50;
}
 
.no-data {
  text-align: center;
  padding: 40px;
  color: #999;
  font-size: 16px;
}
 
/* Wait Stats Table */
.wait-stats-table {
  width: 100%;
  border-collapse: collapse;
}
 
.wait-stats-table th {
  background: #3498db;
  color: white;
  padding: 12px;
  text-align: left;
  font-weight: 600;
}
 
.wait-stats-table td {
  padding: 12px;
  border-bottom: 1px solid #eee;
}
 
.clickable-row {
  cursor: pointer;
  transition: background 0.2s;
}
 
.clickable-row:hover {
  background: #f0f8ff;
}
 
.wait-type-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 4px;
  color: white;
  font-weight: 500;
  font-size: 13px;
}
 
.numeric {
  text-align: right;
  font-family: 'Courier New', monospace;
}
 
.info-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.3s;
}
 
.info-btn:hover {
  background: #2980b9;
}
 
.sql-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.3s;
  white-space: nowrap;
}
 
.sql-btn:hover {
  background: #229954;
}
 
.sql-btn.danger {
  background: #e74c3c;
}
 
.sql-btn.danger:hover {
  background: #c0392b;
}
 
/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s;
}
 
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
 
.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  animation: slideUp 0.3s;
}
 
.modal-content.large {
  max-width: 1000px;
  max-height: 85vh;
}
 
@keyframes slideUp {
  from {
    transform: translateY(50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
 
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 2px solid #eee;
  background: #f8f9fa;
  border-radius: 12px 12px 0 0;
}
 
.modal-header h3 {
  margin: 0;
  color: #2c3e50;
}
 
.close-btn {
  background: #e74c3c;
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s;
}
 
.close-btn:hover {
  background: #c0392b;
}
 
.modal-body {
  padding: 20px;
}
 
.wait-stat-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
 
.detail-row {
  display: flex;
  padding: 12px;
  border-radius: 6px;
  background: #f8f9fa;
}
 
.detail-row .label {
  font-weight: 600;
  color: #2c3e50;
  min-width: 180px;
}
 
.detail-row .value {
  color: #555;
  flex: 1;
}
 
.detail-row.description,
.detail-row.recommendation {
  flex-direction: column;
  gap: 8px;
}
 
.detail-row.description .value {
  color: #555;
  line-height: 1.6;
}
 
.detail-row.recommendation {
  background: #e8f5e9;
  border-left: 4px solid #4caf50;
}
 
.detail-row.recommendation .value {
  white-space: pre-line;
  color: #2e7d32;
  line-height: 1.8;
  font-family: 'Segoe UI', sans-serif;
}
 
/* Query Modal Styles */
.query-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
 
.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 16px;
  border-radius: 8px;
  color: white;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: transform 0.2s;
}
 
.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 12px rgba(0,0,0,0.15);
}
 
.stat-label {
  font-size: 12px;
  opacity: 0.9;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
 
.stat-value {
  font-size: 24px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}
 
/* SQL Code Container */
.sql-code-container {
  background: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dee2e6;
}
 
.sql-code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #343a40;
  color: white;
  font-weight: 600;
}
 
.copy-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.3s;
}
 
.copy-btn:hover {
  background: #218838;
}
 
.sql-code {
  padding: 16px;
  margin: 0;
  background: #282c34;
  color: #abb2bf;
  font-family: 'Courier New', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 500px;
  overflow-y: auto;
}
 
/* Warning Boxes */
.warning-box {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
  padding: 16px;
  margin-top: 20px;
}
 
.warning-box.danger {
  background: #f8d7da;
  border-color: #dc3545;
  border-left-color: #dc3545;
}
 
.warning-box strong {
  display: block;
  margin-bottom: 8px;
  color: #856404;
}
 
.warning-box.danger strong {
  color: #721c24;
}
 
.warning-box ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}
 
.warning-box li {
  margin-bottom: 6px;
  line-height: 1.5;
}
 
/* Table Styles for other tabs */
table,
.data-table {
  width: 100%;
  border-collapse: collapse;
}
 
table th,
.data-table th {
  background: #34495e;
  color: white;
  padding: 12px;
  text-align: left;
  font-weight: 600;
}
 
table td,
.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #eee;
}
 
table tbody tr:hover,
.data-table tbody tr:hover {
  background: #f5f5f5;
}
 
.sql-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #555;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
 
/* Scrollbar Styling */
.modal-content::-webkit-scrollbar,
.sql-code::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
 
.modal-content::-webkit-scrollbar-track,
.sql-code::-webkit-scrollbar-track {
  background: #f1f1f1;
}
 
.modal-content::-webkit-scrollbar-thumb,
.sql-code::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}
 
.modal-content::-webkit-scrollbar-thumb:hover,
.sql-code::-webkit-scrollbar-thumb:hover {
  background: #555;
}
 
/* Responsive Design */
@media (max-width: 768px) {
  .tab-navigation {
    flex-direction: column;
  }
 
  .tab-navigation button {
    width: 100%;
    border-bottom: 1px solid #ddd;
    border-left: 3px solid transparent;
  }
 
  .tab-navigation button.active {
    border-bottom-color: #ddd;
    border-left-color: #3498db;
  }
 
  .modal-content,
  .modal-content.large {
    width: 95%;
    max-width: 95%;
  }
 
  .query-stats-grid {
    grid-template-columns: 1fr;
  }
 
  .stat-card {
    text-align: center;
  }
 
  table th,
  table td,
  .data-table th,
  .data-table td {
    padding: 8px;
    font-size: 12px;
  }
 
  .sql-text {
    max-width: 200px;
  }
}
.detail-row.links {
  flex-direction: column;
  gap: 8px;
  background: #eaf2f8;
  border-left: 4px solid #3498db;
}
 
.link-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
 
.link-list a {
  color: #2980b9;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}
 
.link-list a:hover {
  color: #1f618d;
  text-decoration: underline;
}
</style>