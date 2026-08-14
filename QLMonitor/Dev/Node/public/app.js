// ============================================================================
// SQL SERVER MONITOR - Frontend JavaScript
// ============================================================================
// Hanterar all frontend-logik för SQL Server-övervakning inklusive:
// - Socket.IO realtidskommunikation
// - Jobbhantering och kvittering
// - Aktivitetsmonitor
// - Prestandadiagram (CPU, Waiting Tasks, User Connections)
// - MDW (Management Data Warehouse) analys
// - Kunskapsdatabas för problemlösningar
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // ============================================================================
    // SOCKET.IO ANSLUTNING
    // ============================================================================
    const socket = io();
    // ✅ GÖR SOCKET TILLGÄNGLIG I CONSOLE FÖR DEBUG
    window.socket = socket;

    // ============================================================================
    // DOM-ELEMENT REFERENSER
    // ============================================================================
    const serverSelect = document.getElementById('server-selector');
    const errorContainer = document.getElementById('error-message-container');
    const lastUpdatedSpan = document.getElementById('last-updated');
    const jobListContainer = document.getElementById('job-list');
    const jobDetailsContainer = document.getElementById('job-details-content');
    const activityContentContainer = document.getElementById('activityContent');
    const modalOverlay = document.getElementById('activity-modal-overlay');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // ============================================================================
    // TILLSTÅNDSVARIABLER
    // ============================================================================
    let currentServer = null;              // Vald server
    let performanceIntervalId = null;      // Intervall för prestandahämtning
    let currentJobsData = [];              // Aktuell jobblista
    let userName = '';                     // Användarnamn för kvitteringar
    let allServerData = {};                // All serverdata från Socket.IO
    let currentActivityData = [];          // Aktiv processdata
    let currentJobForModal = null;         // Jobb som visas i modal

    // ============================================================================
    // FORMATTERINGSFUNKTIONER
    // ============================================================================
    
    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime()) || date.getFullYear() < 1970) return 'N/A';
            return date.toLocaleString('sv-SE', { 
                year: 'numeric', month: '2-digit', day: '2-digit', 
                hour: '2-digit', minute: '2-digit', second: '2-digit' 
            });
        } catch (e) { 
            return 'N/A'; 
        }
    };

    const formatDuration = (duration) => {
        if (duration === null || typeof duration === 'undefined') return 'N/A';
        const num = parseInt(duration);
        if (isNaN(num)) return 'N/A';
        const str = num.toString().padStart(6, '0');
        const hours = parseInt(str.substring(0, 2));
        const minutes = parseInt(str.substring(2, 4));
        const seconds = parseInt(str.substring(4, 6));
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    };

    const escapeHtml = (text) => {
        if (text === null || typeof text === 'undefined') return '';
        return String(text).replace(/[&<>"']/g, (match) => ({
            '&': '&amp;', '<': '<', '>': '>', '"': '&quot;', "'": '&#039;'
        }[match]));
    };

    const createStatusPill = (status, type) => {
        const statusText = status || type;
        const statusClass = (statusText || 'unknown').toLowerCase().replace(/\s+/g, '-');
        return `<span class="status-pill ${statusClass}">${escapeHtml(statusText)}</span>`;
    };

    // ============================================================================
    // CHART.JS KONFIGURATION OCH INITIALISERING
    // ============================================================================
    
    const MAX_DATA_POINTS = 60;

    const createChartConfig = (label) => ({
        type: 'line',
        data:{
            labels: [],
            datasets: [{
                label: label,
                data:[],
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2, 
                tension: 0.4, 
                fill: true, 
                pointRadius: 1
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, ticks: { color: '#555' }, grid: { color: 'rgba(0, 0, 0, 0.1)' } },
                x: { ticks: { color: '#555' }, grid: { color: 'rgba(0, 0, 0, 0.1)' } }
            },
            plugins: { legend: { labels: { color: '#555' } } },
            responsive: true, 
            maintainAspectRatio: false
        }
    });

    const cpuChart = new Chart(document.getElementById('cpuChart'), createChartConfig('% Processor Time'));
    const waitingTasksChart = new Chart(document.getElementById('waitingTasksChart'), createChartConfig('Waiting Tasks'));
    const userConnectionsChart = new Chart(document.getElementById('userConnectionsChart'), createChartConfig('User Connections'));

    const allCharts = [cpuChart, waitingTasksChart, userConnectionsChart];

    // ============================================================================
    // ALARM BANNER FUNKTIONALITET
    // ============================================================================
    
    const alarmBanner = document.getElementById('alarm-banner');
    const alarmBannerText = document.getElementById('alarm-banner-text');
    const alarmBannerClose = document.getElementById('alarm-banner-close');

    function showAlarmBanner(serverName) {
        if (alarmBanner && alarmBannerText) {
            alarmBannerText.textContent = `⚠️ Allvarlig blockering upptäckt på servern: ${serverName}`;
            alarmBanner.classList.add('alarm-banner-visible');
        }
    }

    function hideAlarmBanner() {
        if (alarmBanner) {
            alarmBanner.classList.remove('alarm-banner-visible');
        }
    }

    if (alarmBannerClose) {
        alarmBannerClose.addEventListener('click', hideAlarmBanner);
    }

    const updateChart = (chart, newDataPoint) => {
        const now = new Date();
        const label = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(newDataPoint);
        
        if (chart.data.labels.length > MAX_DATA_POINTS) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update('none');
    };

    // ============================================================================
    // KUNSKAPSDATABAS FUNKTIONER
    // ============================================================================
    
    async function displayKnowledgeBaseEntries(serverName, jobName) {
        const kbContainer = document.createElement('div');
        kbContainer.id = 'kb-container';
        const detailsContent = document.getElementById('job-details-content');
        const oldContainer = detailsContent.querySelector('#kb-container');
        if (oldContainer) oldContainer.remove();

        detailsContent.appendChild(kbContainer);
        kbContainer.innerHTML = `<h3>📖 Tidigare lösningar</h3><p><em>Laddar...</em></p>`;

        try {
            const response = await fetch(`/api/knowledgebase?server=${encodeURIComponent(serverName)}&jobName=${encodeURIComponent(jobName)}`);
            if (!response.ok) throw new Error(`Nätverksfel: ${response.statusText}`);
            const entries = await response.json();
            const kbList = document.createElement('div');
            kbList.id = 'kb-list';

            if (entries.length === 0) {
                kbList.innerHTML = '<p><em>Inga tidigare lösningar har dokumenterats för detta jobb.</em></p>';
            } else {
                entries.forEach(entry => {
                    const entryDiv = document.createElement('div');
                    entryDiv.className = 'kb-entry';
                    const formattedDate = new Date(entry.CreatedAt).toLocaleString('sv-SE', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    entryDiv.innerHTML = `
                        <p class="kb-meta"><strong>Författare:</strong> ${escapeHtml(entry.Author)} | <strong>Datum:</strong> ${formattedDate}</p>
                        <div class="kb-solution">${escapeHtml(entry.SolutionNotes).replace(/\n/g, '<br>')}</div>`;
                    kbList.appendChild(entryDiv);
                });
            }
            kbContainer.innerHTML = `<h3>📖 Tidigare lösningar</h3>`;
            kbContainer.appendChild(kbList);
        } catch (error) {
            console.error('Kunde inte hämta kunskapsposter:', error);
            kbContainer.innerHTML = '<h3>📖 Tidigare lösningar</h3><p style="color: red;">Kunde inte ladda tidigare lösningar.</p>';
        }
    }

    // ============================================================================
    // UI RENDERINGSFUNKTIONER
    // ============================================================================
    
    const showJobDetail = async (job) => {
        jobDetailsContainer.innerHTML = '';
        if (!job) {
            jobDetailsContainer.innerHTML = '<div>Välj ett jobb för att se detaljer.</div>';
            return;
        }
        currentJobForModal = job;
        
        const jobInfoDiv = document.createElement('div');
        jobInfoDiv.className = 'job-info-details';
        
        let actionButtonHtml = '';
        if (job.status === 'Failed') {
            actionButtonHtml = `<button id="open-kb-modal-btn" class="btn-primary">📝 Dokumentera lösning</button>`;
        }
        
        let html = `<h3>📋 Jobbdetaljer</h3>
                    ${actionButtonHtml} 
                    <strong>Jobbnamn:</strong><p>${escapeHtml(job.jobName)}</p>
                    <strong>Kategori:</strong><p>${escapeHtml(job.categoryName) || 'Okategoriserad'}</p>
                    <strong>Status:</strong><p>${createStatusPill(job.status, job.type)}</p>
                    <strong>Senast körd:</strong><p>${formatDateTime(job.lastRunDateTime)}</p>
                    <strong>Varaktighet:</strong><p>${formatDuration(job.run_duration)}</p>
                    <strong>Nästa körning:</strong><p>${formatDateTime(job.nextRunDateTime)}</p>`;
        
        if (job.status === 'Failed') {
            html += `<strong>Felsteg:</strong><p>${escapeHtml(job.step_name)}</p>
                     <strong>Felmeddelande:</strong><pre>${escapeHtml(job.errorMessage)}</pre>`;
        }
        
        jobInfoDiv.innerHTML = html;
        jobDetailsContainer.appendChild(jobInfoDiv);
        await displayKnowledgeBaseEntries(job.server, job.jobName);
    };

    const renderJobs = (statusData, searchTerm = '') => {
        const serverData = statusData[currentServer];
        if (!serverData) {
            jobListContainer.innerHTML = '<div class="no-jobs">Väntar på data för den valda servern...</div>';
            return;
        }
        
        errorContainer.textContent = serverData.error || '';
        lastUpdatedSpan.textContent = formatDateTime(serverData.lastUpdated) || 'Aldrig';
        
        let allJobs = [
            ...(serverData.activeJobs || []).map(j => ({ ...j, server: currentServer, status: 'Running', type: 'Aktivt' })),
            ...(serverData.failedJobs || []).map(j => ({ ...j, server: currentServer, status: 'Failed', type: 'Misslyckat' })),
            ...(serverData.scheduledJobs || []).map(j => ({ ...j, server: currentServer, status: 'Enabled', type: 'Schemalagt' }))
        ];
        
        if (searchTerm && searchTerm.trim() !== '') {
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            allJobs = allJobs.filter(job => job.jobName.toLowerCase().includes(lowerCaseSearchTerm));
        }
        
        const uniqueJobsMap = new Map();
        allJobs.forEach(j => {
            if (!uniqueJobsMap.has(j.jobName) || j.status === 'Running' || j.status === 'Failed') {
                uniqueJobsMap.set(j.jobName, j);
            }
        });
        
        currentJobsData = Array.from(uniqueJobsMap.values());
        
        currentJobsData.sort((a, b) => {
            const priority = { 'Running': 1, 'Failed': 2, 'Enabled': 3 };
            return (priority[a.status] || 4) - (priority[b.status] || 4) || a.jobName.localeCompare(b.jobName);
        });
        
        jobListContainer.innerHTML = '';
        
        if (currentJobsData.length === 0) {
            jobListContainer.innerHTML = '<div class="no-jobs">Inga jobb matchade sökningen.</div>';
            return;
        }

        const header = document.createElement('div');
        header.className = 'table-row header';
        header.innerHTML = `<div class="job-name">Jobbnamn</div><div>Kategori</div><div>Status</div><div>Senast körd</div><div>Längd</div><div>Nästa körning</div><div>Åtgärd</div>`;
        jobListContainer.appendChild(header);
        
        currentJobsData.forEach((job, index) => {
            const row = document.createElement('div');
            row.className = 'table-row';
            row.dataset.jobIndex = index;
            
            let actionHtml = '';
            if (job.status === 'Failed') {
                if (job.acknowledgedBy) {
                    actionHtml = `<span class="acknowledged-by">Hanteras av: ${escapeHtml(job.acknowledgedBy)}</span>
                                <button class="release-btn" data-job-name="${escapeHtml(job.jobName)}">Släpp</button>`;
                } else {
                    actionHtml = `<button class="ack-btn" data-job-name="${escapeHtml(job.jobName)}">Ta hand om</button>`;
                }
            }
            
            row.innerHTML = `
                <div class="job-name">${escapeHtml(job.jobName)}</div>
                <div>${escapeHtml(job.categoryName) || 'Okategoriserad'}</div>
                <div>${createStatusPill(job.status, job.type)}</div>
                <div>${formatDateTime(job.lastRunDateTime)}</div>
                <div>${formatDuration(job.run_duration)}</div>
                <div>${formatDateTime(job.nextRunDateTime)}</div>
                <div class="action-cell">${actionHtml}</div>`;
            
            jobListContainer.appendChild(row);
        });
        
        showJobDetail(null);
    };

    // ============================================================================
    // KVITTERINGSSYSTEM
    // ============================================================================
    
    const promptForUserName = () => {
        if (!userName) {
            const input = prompt("Ange ditt namn eller dina initialer för att ta jobbet:");
            if (input && input.trim()) {
                userName = input.trim();
            }
        }
        return userName;
    };

    const acknowledgeJob = async (jobName) => {
        const user = promptForUserName();
        if (!user) {
            alert("Du måste ange ett namn för att kunna ta ett jobb.");
            return;
        }
        
        try {
            await fetch('/api/acknowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverName: currentServer, jobName, user })
            });
        } catch (error) {
            console.error("Fel vid kvittering:", error);
            alert("Ett fel uppstod när jobbet skulle kvitteras.");
        }
    };

    const releaseAcknowledgement = async (jobName) => {
        try {
            await fetch('/api/acknowledge', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverName: currentServer, jobName })
            });
        } catch (error) {
            console.error("Fel vid borttagning av kvittering:", error);
            alert("Ett fel uppstod när kvitteringen skulle tas bort.");
        }
    };

    // ============================================================================
    // DATAHÄMTNING - PRESTANDA, AKTIVITET, FILSTORLEKAR
    // ============================================================================
    
    const fetchPerformanceData = async () => {
        if (!currentServer) return;
        
        try {
            const response = await fetch(`/api/performance?server=${currentServer}`);
            if (!response.ok) return;
            
            const data = await response.json();
            updateChart(cpuChart, data.cpu);
            updateChart(waitingTasksChart, data.waitingTasks);
            updateChart(userConnectionsChart, data.userConnections);
        } catch (error) {
            console.error('Fel vid hämtning av prestandadata:', error);
        }
    };

    const fetchActivity = async () => {
        if (!currentServer) return;
        
        activityContentContainer.innerHTML = 'Laddar aktiva processer...';
        
        try {
            const response = await fetch(`/api/activity?server=${currentServer}`);
            if (!response.ok) throw new Error('Kunde inte hämta aktivitetsdata.');
            
            currentActivityData = await response.json();
            
            if (currentActivityData.length === 0) {
                activityContentContainer.innerHTML = 'Inga aktiva processer hittades.';
                return;
            }
            
            let html = '<table><thead><tr><th>Session</th><th>Status</th><th>Login</th><th>Program</th><th>Databas</th><th>Kommando</th></tr></thead><tbody>';
            
            currentActivityData.forEach(p => {
                html += `<tr data-session-id="${p.session_id}" style="cursor: pointer;">
                    <td>${p.session_id}</td>
                    <td>${escapeHtml(p.status || 'sleeping')}</td>
                    <td>${escapeHtml(p.login_name)}</td>
                    <td>${escapeHtml(p.program_name)}</td>
                    <td>${escapeHtml(p.database_name || 'N/A')}</td>
                    <td><pre>${escapeHtml(p.sql_text || '').substring(0, 100)}</pre></td>
                </tr>`;
            });
            
            html += '</tbody></table>';
            activityContentContainer.innerHTML = html;
        } catch (error) {
            activityContentContainer.innerHTML = '<p style="color: red;">Kunde inte ladda aktivitetsdata.</p>';
            console.error(error);
        }
    };

    const fetchFileSizes = async () => {
        if (!currentServer) return;
        
        const diskSummaryContainer = document.getElementById('disk-summary-container');
        const filesContentContainer = document.getElementById('filesContent');
        
        if (!diskSummaryContainer || !filesContentContainer) return;
        
        diskSummaryContainer.innerHTML = 'Laddar...';
        filesContentContainer.innerHTML = 'Laddar...';
        
        try {
            const response = await fetch(`/api/filesizes?server=${currentServer}`);
            if (!response.ok) throw new Error('Kunde inte hämta filstorleksdata.');
            
            const files = await response.json();
            
            if (files.length === 0) {
                diskSummaryContainer.innerHTML = '';
                filesContentContainer.innerHTML = 'Ingen data om filstorlekar hittades.';
                return;
            }
            
            const driveSummary = new Map();
            for (const file of files) {
                if (!driveSummary.has(file.Drive)) {
                    driveSummary.set(file.Drive, {
                        TotalDriveGB: file.TotalDriveGB,
                        FreeDriveGB: file.FreeDriveGB,
                        PercentFree: file.PercentFree
                    });
                }
            }
            
            let summaryHtml = '';
            for (const [drive, stats] of driveSummary.entries()) {
                const percentFree = Number(stats.PercentFree);
                const percentUsed = 100 - percentFree;
                const warningClass = percentFree < 15 ? 'warning' : (percentFree < 30 ? 'low' : '');
                
                summaryHtml += `
                    <div class="disk-summary-card ${warningClass}">
                        <div class="card-header">
                            <span class="drive-letter">${escapeHtml(drive)}:</span>
                            <span class="drive-space">${Number(stats.FreeDriveGB).toFixed(2)} GB ledigt av ${Number(stats.TotalDriveGB).toFixed(2)} GB</span>
                        </div>
                        <div class="progress-bar"><div class="progress-bar-fill" style="width: ${percentUsed}%;"></div></div>
                        <div class="percent-label">${percentFree.toFixed(2)}% ledigt</div>
                    </div>`;
            }
            
            diskSummaryContainer.innerHTML = summaryHtml;
            
            const databases = files.reduce((acc, file) => {
                acc[file.DatabaseName] = acc[file.DatabaseName] || [];
                acc[file.DatabaseName].push(file);
                return acc;
            }, {});
            
            let filesHtml = '';
            for (const dbName in databases) {
                filesHtml += `<div class="db-files-container"><h3>${escapeHtml(dbName)}</h3><table>
                            <thead><tr><th>Logiskt filnamn</th><th>Fysisk sökväg</th><th>Storlek (MB)</th><th>Ledigt på disk (GB)</th><th>Ledigt (%)</th></tr></thead><tbody>`;
                
                databases[dbName].forEach(file => {
                    const percentFree = Number(file.PercentFree);
                    const warningClass = percentFree < 15 ? 'warning' : '';
                    
                    filesHtml += `<tr>
                        <td>${escapeHtml(file.LogicalFileName)}</td>
                        <td>${escapeHtml(file.PhysicalPath)}</td>
                        <td>${Number(file.FileSizeMB).toFixed(2)}</td>
                        <td>${Number(file.FreeDriveGB).toFixed(2)}</td>
                        <td class="${warningClass}">${percentFree.toFixed(2)} %</td>
                    </tr>`;
                });
                
                filesHtml += `</tbody></table></div>`;
            }
            
            filesContentContainer.innerHTML = filesHtml;
        } catch (error) {
            diskSummaryContainer.innerHTML = '';
            filesContentContainer.innerHTML = 'Kunde inte ladda data om filstorlekar.';
            console.error(error);
        }
    };

    // ============================================================================
    // MDW (MANAGEMENT DATA WAREHOUSE) FUNKTIONER
    // ============================================================================
    
    function renderMdwDiskUsage(data) {
        const container = document.getElementById('mdw-disk-usage-content');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p>Ingen MDW-data tillgänglig för diskanvändning.</p>';
            return;
        }

        if (!document.getElementById('diskUsageChart')) {
            container.innerHTML = `<div style="position: relative; height: 800px; width: 100%;"><canvas id="diskUsageChart"></canvas></div>`;
        }
        const ctx = document.getElementById('diskUsageChart').getContext('2d');

        const sortedData = data.map(d => ({
            ...d,
            total_size: (parseFloat(d.data_file_mb) || 0) + (parseFloat(d.log_file_mb) || 0)
        })).sort((a, b) => b.total_size - a.total_size);

        const topData = sortedData.slice(0, 25);

        const labels = topData.map(d => d.database_name);
        const dataFiles = topData.map(d => parseFloat(d.data_file_mb) || 0);
        const logFiles = topData.map(d => parseFloat(d.log_file_mb) || 0);

        if (window.diskUsageChartInstance) {
            window.diskUsageChartInstance.destroy();
        }

        window.diskUsageChartInstance = new Chart(ctx, {
            type: 'bar',
            data:{
                labels: labels,
                datasets: [{
                    label: 'Data Files (MB)',
                    data:dataFiles,
                    backgroundColor: 'rgba(54, 162, 235, 0.7)'
                }, {
                    label: 'Log Files (MB)',
                    data:logFiles,
                    backgroundColor: 'rgba(255, 99, 132, 0.7)'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Topp 25 största databaserna (MDW)' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Storlek (MB)' } },
                    y: { stacked: true, ticks: { autoSkip: false } }
                }
            }
        });
    }

    async function fetchMdwQueryStats() {
        if (!currentServer) return;
        const contentDiv = document.getElementById('mdw-querystats-content');
        contentDiv.innerHTML = '<p>Hämtar query statistics...</p>';

        try {
            const response = await fetch(`/api/mdw/querystats?server=${currentServer}`);
            if (!response.ok) throw new Error(`Nätverksfel: ${response.statusText}`);
            const data = await response.json();

            if (data.length === 0) {
                contentDiv.innerHTML = '<p>Ingen query statistics-data hittades.</p>';
                return;
            }

            let html = `<table class="data-table"><thead><tr><th>Fråga (första 200 tecken)</th><th>Antal körningar</th><th>Total CPU (ms)</th><th>Genomsnitt CPU (ms)</th><th>Total varaktighet (ms)</th><th>Logiska läsningar</th><th>Fysiska läsningar</th><th>Senast körd</th></tr></thead><tbody>`;
            data.forEach(row => {
                html += `<tr><td><pre>${escapeHtml(row.query_text)}</pre></td><td>${row.execution_count}</td><td>${Number(row.total_cpu_ms).toLocaleString('sv-SE')}</td><td>${Number(row.avg_cpu_ms).toFixed(2)}</td><td>${Number(row.total_duration_ms).toLocaleString('sv-SE')}</td><td>${Number(row.total_logical_reads).toLocaleString('sv-SE')}</td><td>${Number(row.total_physical_reads).toLocaleString('sv-SE')}</td><td>${formatDateTime(row.last_execution_time)}</td></tr>`;
            });
            html += '</tbody></table>';
            contentDiv.innerHTML = html;
        } catch (error) {
            console.error('Fel vid hämtning av Query Statistics:', error);
            contentDiv.innerHTML = `<p class="error">Kunde inte hämta query statistics.</p>`;
        }
    }

    async function fetchMdwServerActivity() {
        if (!currentServer) return;
        const contentDiv = document.getElementById('mdw-serveractivity-content');
        contentDiv.innerHTML = '<p>Hämtar server activity...</p>';

        try {
            const response = await fetch(`/api/mdw/serveractivity?server=${currentServer}`);
            if (!response.ok) throw new Error(`Nätverksfel: ${response.statusText}`);
            const data = await response.json();

            if (data.length === 0) {
                contentDiv.innerHTML = '<p>Ingen server activity-data hittades.</p>';
                return;
            }

            let html = `<p><strong>Insamlingstid:</strong> ${formatDateTime(data[0].collection_time)}</p><table class="data-table"><thead><tr><th>Session ID</th><th>Login</th><th>Host</th><th>Program</th><th>Databas</th><th>Status</th><th>CPU (ms)</th><th>Total tid (ms)</th><th>Väntetid (ms)</th><th>Väntetyp</th><th>Blockerad av</th><th>SQL Text</th></tr></thead><tbody>`;
            data.forEach(row => {
                const blockingClass = row.blocking_session_id && row.blocking_session_id > 0 ? 'warning' : '';
                html += `<tr class="${blockingClass}"><td>${row.session_id}</td><td>${escapeHtml(row.login_name)}</td><td>${escapeHtml(row.host_name)}</td><td>${escapeHtml(row.program_name)}</td><td>${escapeHtml(row.database_name || 'N/A')}</td><td>${escapeHtml(row.status)}</td><td>${Number(row.cpu_time).toLocaleString('sv-SE')}</td><td>${Number(row.total_elapsed_time).toLocaleString('sv-SE')}</td><td>${Number(row.wait_time).toLocaleString('sv-SE')}</td><td>${escapeHtml(row.wait_type || 'N/A')}</td><td>${row.blocking_session_id || '-'}</td><td><pre>${escapeHtml(row.sql_text || 'N/A')}</pre></td></tr>`;
            });
            html += '</tbody></table>';
            contentDiv.innerHTML = html;
        } catch (error) {
            console.error('Fel vid hämtning av Server Activity:', error);
            contentDiv.innerHTML = `<p class="error">Kunde inte hämta server activity.</p>`;
        }
    }

    // ============================================================================
    // INDEXANALYS FUNKTIONER
    // ============================================================================

    async function fetchAndCopyScript(base64IndexData) {
        try {
            const index = JSON.parse(atob(base64IndexData));
            
           const params = new URLSearchParams({
    serverName: currentServer,
    dbName: index.TableName.split('.')[0].replace(/[<span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow></mrow><annotation encoding="application/x-tex"></annotation></semantics></math></span><span class="katex-html" aria-hidden="true"></span></span></span>]/g, ''),
    schemaName: index.TableName.split('.')[1].replace(/[<span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow></mrow><annotation encoding="application/x-tex"></annotation></semantics></math></span><span class="katex-html" aria-hidden="true"></span></span></span>]/g, ''),
    tableName: index.TableName.split('.')[2].replace(/[<span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow></mrow><annotation encoding="application/x-tex"></annotation></semantics></math></span><span class="katex-html" aria-hidden="true"></span></span></span>]/g, ''),
    equality: index.equality_columns || '',
    inequality: index.inequality_columns || '',
    included: index.included_columns || '',
    seeks: index.user_seeks,
    impact: index.ImpactScore
});

            const response = await fetch(`/api/generate-index-script?${params.toString()}`);
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Nätverksfel vid hämtning av skript.');
            }

            const data = await response.json();
            const script = data.script;

            navigator.clipboard.writeText(script).then(() => {
                alert(`Skript har genererats och kopierats till urklipp!`);
            }).catch(err => {
                console.error("Kunde inte kopiera till urklipp: ", err);
                alert("Kunde inte kopiera skriptet automatiskt, men det finns i konsolen.");
                console.log("--- GENERERAT SKRIPT --- \n", script);
            });

        } catch (error) {
            console.error("Fel vid generering av skript:", error);
            alert(`Ett fel uppstod: ${error.message}`);
        }
    }

    async function loadIndexAnalysis(serverName) {
        if (!serverName) return;

        const loadingState = document.getElementById('index-loading-state');
        const errorState = document.getElementById('index-error-state');
        const errorMessage = document.getElementById('index-error-message');
        const content = document.getElementById('index-content');
        const missingBody = document.getElementById('missing-indexes-tbody');
        const unusedBody = document.getElementById('unused-indexes-tbody');

        loadingState.style.display = 'block';
        errorState.style.display = 'none';
        content.style.display = 'none';
        missingBody.innerHTML = '';
        unusedBody.innerHTML = '';

        try {
            const [missingRes, unusedRes] = await Promise.all([
                fetch(`/api/missing-indexes?server=${serverName}`),
                fetch(`/api/unused-indexes?server=${serverName}`),
            ]);

            if (!missingRes.ok || !unusedRes.ok) {
                throw new Error("API-anropet misslyckades. Kontrollera serverloggarna.");
            }

            const missingIndexes = await missingRes.json();
            const unusedIndexes = await unusedRes.json();

            if (missingIndexes.length > 0) {
                missingIndexes.forEach(index => {
                    const base64IndexData = btoa(JSON.stringify(index));
                    missingBody.innerHTML += `
                        <tr>
                            <td class="numeric-cell">${Math.round(index.ImpactScore).toLocaleString()}</td>
                            <td>${escapeHtml(index.TableName)}</td>
                            <td>${escapeHtml([index.equality_columns, index.inequality_columns].filter(Boolean).join('<br>'))}</td>
                            <td>${escapeHtml(index.included_columns || "Inga")}</td>
                            <td><button class="btn-primary fetch-script-btn" data-index-data="${base64IndexData}">Skapa Skript</button></td>
                        </tr>`;
                });
            } else {
                missingBody.innerHTML = '<tr><td colspan="5">Inga betydande saknade index hittades.</td></tr>';
            }

            if (unusedIndexes.length > 0) {
                unusedIndexes.forEach(index => {
                    unusedBody.innerHTML += `
                        <tr>
                            <td class="numeric-cell">${index.IndexSizeMB}</td>
                            <td>${escapeHtml(index.TableName)}</td>
                            <td>${escapeHtml(index.IndexName)}</td>
                            <td class="numeric-cell">${index.Writes.toLocaleString()}</td>
                        </tr>`;
                });
            } else {
                unusedBody.innerHTML = '<tr><td colspan="4">Inga oanvända index hittades.</td></tr>';
            }

            content.style.display = 'block';
        } catch (e) {
            errorMessage.textContent = e.message;
            errorState.style.display = 'block';
        } finally {
            loadingState.style.display = 'none';
        }
    }

    // ============================================================================
    // MODAL-FUNKTIONER
    // ============================================================================
    
    const showActivityDetailModal = (sessionId) => {
        const process = currentActivityData.find(p => p.session_id === sessionId);
        if (!process) return;
        
        const killButtonHtml = `<button id="kill-session-btn" class="btn-danger" data-session-id="${process.session_id}">KILL SESSION</button>`;
        
        modalBody.innerHTML = `
            <p><strong>Session ID:</strong> ${process.session_id}</p>
            <p><strong>Login:</strong> ${escapeHtml(process.login_name)}</p>
            <p><strong>Program:</strong> ${escapeHtml(process.program_name)}</p>
            <p><strong>Databas:</strong> ${escapeHtml(process.database_name || 'N/A')}</p>
            <p><strong>Status:</strong> ${escapeHtml(process.status || 'sleeping')}</p>
            <p><strong>Host:</strong> ${escapeHtml(process.host_name)}</p>
            <p><strong>Väntetid (ms):</strong> ${process.wait_time || '0'}</p>
            <p><strong>Väntetyp:</strong> ${escapeHtml(process.wait_type || 'N/A')}</p>
            <p><strong>Blockerad av Session ID:</strong> ${process.blocking_session_id || 'Ingen'}</p>
            <p><strong>CPU-tid (ms):</strong> ${process.cpu_time || '0'}</p>
            <p><strong>Total körningstid (ms):</strong> ${process.total_elapsed_time || '0'}</p>
            <p><strong>Kommando:</strong></p>
            <pre>${escapeHtml(process.sql_text || 'Sessionen är inaktiv (sleeping).')}</pre>
            <hr><div class="modal-actions">${killButtonHtml}</div>`;
        
        modalOverlay.style.display = 'flex';
    };
    
    // ============================================================================
    // KONTROLLFLÖDE
    // ============================================================================
    
    function startDataFetchingForCurrentServer() {
        clearInterval(performanceIntervalId);
        
        allCharts.forEach(chart => {
            chart.data.labels = [];
            chart.data.datasets[0].data = [];
            chart.update();
        });
        
        renderJobs(allServerData);
        fetchPerformanceData();
        performanceIntervalId = setInterval(fetchPerformanceData, 5000);
        
        const activeTab = document.querySelector('.tab-link.active');
        if (activeTab) {
            fetchDataForTab(activeTab.dataset.tab);
        }
    }

    function fetchDataForTab(tabId) {
        if (!currentServer) return;
        switch(tabId) {
            case 'jobsTab': break;
            case 'activityTab': fetchActivity(); break;
            case 'mdwTab':
                const activeMdwSubtab = document.querySelector('.mdw-subtab-link.active');
                if (activeMdwSubtab) {
                    fetchDataForMdwSubtab(activeMdwSubtab.dataset.mdwTab);
                }
                break;
            case 'filesTab': fetchFileSizes(); break;
            case 'indexTab': loadIndexAnalysis(currentServer); break;
        }
    }

    function fetchDataForMdwSubtab(mdwTabName) {
        if (!currentServer) return;
        switch (mdwTabName) {
            case 'mdwDiskUsageTab': socket.emit('getMdwDiskUsage', currentServer); break;
            case 'mdwQueryStatsTab': fetchMdwQueryStats(); break;
            case 'mdwServerActivityTab': fetchMdwServerActivity(); break;
        }
    }

    const initialize = async () => {
        try {
            const response = await fetch('/api/servers');
            if (!response.ok) throw new Error('Kunde inte hämta serverlistan.');
            const servers = await response.json();
            
            if (servers.length > 0) {
                serverSelect.innerHTML = '';
                servers.forEach(server => {
                    const option = document.createElement('option');
                    option.value = server.ServerName;
                    option.textContent = `${server.Environment} - ${server.DisplayName || server.ServerName}`;
                    serverSelect.appendChild(option);
                });
                currentServer = serverSelect.value;
            } else {
                errorContainer.textContent = 'Inga servrar är konfigurerade.';
            }
        } catch (error) {
            console.error('Fel vid initialisering:', error);
            errorContainer.textContent = 'Kunde inte ladda serverlistan.';
        }
    };

    // ============================================================================
    // SOCKET.IO LYSSNARE
    // ============================================================================
    
    socket.on('initialStatus', (initialData) => {
        allServerData = initialData;
        for (const serverName in initialData) {
            if (initialData[serverName].hasBlocking) {
                showAlarmBanner(serverName);
                break;
            }
        }
        if (currentServer) {
            startDataFetchingForCurrentServer();
        }
    });

    socket.on('statusUpdate', ({ serverName, status }) => {
        allServerData[serverName] = status;
        if (status.hasBlocking) {
            showAlarmBanner(serverName);
        }
        if (serverName === currentServer) {
            const searchInput = document.getElementById('search-input');
            renderJobs(allServerData, searchInput.value);
        }
    });

    socket.on('mdwDiskUsageData', (data) => {
        renderMdwDiskUsage(data);
    });

    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================
    
    serverSelect.addEventListener('change', (e) => {
        currentServer = e.target.value;
        startDataFetchingForCurrentServer();
    });

    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('keyup', () => {
        renderJobs(allServerData, searchInput.value);
    });

    document.querySelectorAll('.tab-link').forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
            document.querySelectorAll('.tab-link').forEach(innerLink => innerLink.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            link.classList.add('active');
            fetchDataForTab(tabId);
        });
    });
    
    document.querySelectorAll('.mdw-subtab-link').forEach(button => {
        button.addEventListener('click', () => {
            const mdwTabName = button.dataset.mdwTab;
            document.querySelectorAll('.mdw-subtab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.mdw-subtab-link').forEach(link => link.classList.remove('active'));
            document.getElementById(mdwTabName).classList.add('active');
            button.classList.add('active');
            fetchDataForMdwSubtab(mdwTabName);
        });
    });

    jobListContainer.addEventListener('click', (e) => {
        const row = e.target.closest('.table-row');
        if (!row || row.classList.contains('header')) return;
        
        if (e.target.classList.contains('ack-btn')) {
            acknowledgeJob(e.target.dataset.jobName);
            return;
        }
        if (e.target.classList.contains('release-btn')) {
            releaseAcknowledgement(e.target.dataset.jobName);
            return;
        }
        
        document.querySelectorAll('.table-row.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        const jobIndex = row.dataset.jobIndex;
        showJobDetail(currentJobsData[jobIndex]);
    });

    activityContentContainer.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (row && row.dataset.sessionId) {
            showActivityDetailModal(parseInt(row.dataset.sessionId, 10));
        }
    });

    document.getElementById('index-content').addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('fetch-script-btn')) {
            const base64Data = e.target.dataset.indexData;
            fetchAndCopyScript(base64Data);
        }
    });

    modalCloseBtn.addEventListener('click', () => modalOverlay.style.display = 'none');
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.style.display = 'none';
    });

    modalBody.addEventListener('click', async (e) => {
        if (e.target.id === 'kill-session-btn') {
            const sessionId = e.target.dataset.sessionId;
            if (confirm(`Är du helt säker på att du vill terminera Session ID ${sessionId}? Detta kan inte ångras.`)) {
                try {
                    const response = await fetch('/api/kill-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ server: currentServer, sessionId })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Ett okänt fel uppstod.');
                    alert(`Session ${sessionId} har terminerats.`);
                    modalOverlay.style.display = 'none';
                    fetchActivity();
                } catch (error) {
                    console.error('Kunde inte terminera session:', error);
                    alert(`Fel: ${error.message}`);
                }
            }
        }
    });

    // ============================================================================
    // KUNSKAPSDATABAS MODAL
    // ============================================================================
    
    const kbModalOverlay = document.getElementById('kb-modal-overlay');
    const kbModalCloseBtn = document.getElementById('kb-modal-close-btn');
    const kbForm = document.getElementById('kb-form');

    jobDetailsContainer.addEventListener('click', (e) => {
        if (e.target.id === 'open-kb-modal-btn') {
            if (!currentJobForModal) return;
            document.getElementById('kb-modal-job-name').textContent = currentJobForModal.jobName;
            document.getElementById('kb-solution-notes').value = '';
            kbModalOverlay.style.display = 'flex';
        }
    });

    const closeKbModal = () => kbModalOverlay.style.display = 'none';
    kbModalCloseBtn.addEventListener('click', closeKbModal);
    kbModalOverlay.addEventListener('click', (e) => {
        if (e.target === kbModalOverlay) closeKbModal();
    });

    kbForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!userName) {
            promptForUserName();
            if (!userName) {
                alert('Du måste ange ett namn för att spara en lösning.');
                return;
            }
        }
        
        const solutionNotes = document.getElementById('kb-solution-notes').value;
        const entryData = {
            serverName: currentJobForModal.server,
            jobName: currentJobForModal.jobName,
            stepName: currentJobForModal.step_name || '(Job outcome)',
            errorMessage: currentJobForModal.errorMessage,
            solutionNotes: solutionNotes,
            author: userName
        };
        
        try {
            const response = await fetch('/api/knowledgebase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entryData)
            });
            if (!response.ok) throw new Error('Servern svarade med ett fel.');
            alert('Lösningen har sparats!');
            closeKbModal();
            showJobDetail(currentJobForModal);
        } catch (error) {
            console.error('Kunde inte spara lösning:', error);
            alert('Ett fel uppstod. Lösningen kunde inte sparas.');
        }
    });

    // ============================================================================
    // STARTA APPLIKATIONEN
    // ============================================================================
    
    initialize();
});