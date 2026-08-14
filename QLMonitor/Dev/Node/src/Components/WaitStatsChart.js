// src/components/WaitStatsChart.js

import React, { useState, useEffect } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Registrera de delar av Chart.js vi kommer använda
ChartJS.register(ArcElement, Tooltip, Legend);

const WaitStatsChart = ({ serverName }) => {
    const [chartData, setChartData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(`/api/mdw/waitstats/${serverName}`);
                if (!response.ok) {
                    throw new Error('Nätverksfel vid hämtning av data.');
                }
                const data = await response.json();

                if (data.length === 0) {
                    setError('Ingen MDW-data hittades för de senaste 24 timmarna.');
                    setChartData(null);
                    return;
                }

                // Konvertera datan till det format Chart.js förväntar sig
                setChartData({
                    labels: data.map(item => item.wait_type),
                    datasets: [{
                        label: 'Total väntetid (sekunder)',
                        data.map(item => item.total_wait_time_s.toFixed(2)),
                        backgroundColor: [ // Lägg till fler färger om du vill visa mer än 10
                            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                            '#FF9F40', '#C9CBCF', '#7CFFC4', '#FDB45C', '#F7464A'
                        ],
                        hoverOffset: 4
                    }]
                });
                setError('');

            } catch (err) {
                console.error(`Fel vid hämtning av wait stats för ${serverName}:`, err);
                setError(`Kunde inte ladda MDW-data. Kontrollera att MDW är konfigurerat på ${serverName}.`);
                setChartData(null);
            }
        };

        fetchData();
    }, [serverName]); // Kör om effekten när serverName ändras

    if (error) {
        return <div><p style={{ color: 'orange' }}>{error}</p></div>;
    }

    if (!chartData) {
        return <div>Laddar MDW Wait Stats...</div>;
    }

    return (
        <div>
            <h3>Topp 10 Väntetyper (Senaste 24h)</h3>
            <div style={{ maxWidth: '400px', margin: 'auto' }}>
                <Doughnut data={chartData} />
            </div>
        </div>
    );
};

export default WaitStatsChart;