let currentData = [];

function parseCSV(text) {
    const lines = text
        .split(/\r\n|\r|\n/)
        .map(line => line.trim())
        .filter(line => line !== '');

    if (lines.length < 2) return null;

    const delimiters = [',', ';', '\t', '|'];
    let delimiter = ',';
    let maxCount = 0;

    for (let delim of delimiters) {
        const escapedDelim = delim.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const count = (lines[0].match(new RegExp(escapedDelim, 'g')) || []).length;
        if (count > maxCount) {
            maxCount = count;
            delimiter = delim;
        }
    }

    function parseLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    const rawHeaders = parseLine(lines[0]);
    const headers = rawHeaders.map(h => h.replace(/^"|"$/g, '').trim()).filter(h => h !== '');

    if (headers.length === 0) return null;

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const rawValues = parseLine(lines[i]);
        if (rawValues.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = rawValues[index].replace(/^"|"$/g, '').trim();
            });
            data.push(row);
        }
    }

    return { headers, data };
}

function showMessage(msg, type) {
    const div = document.getElementById('messages');
    div.innerHTML = `<div class="${type}">${msg}</div>`;
    setTimeout(() => div.innerHTML = '', 6000);
}

function populateColumns(headers) {
    const select = document.getElementById('columnSelect');
    select.innerHTML = '<option value="">Select column to analyze...</option>';
    
    if (!headers || headers.length === 0) {
        select.style.display = 'none';
        return;
    }

    headers.forEach(header => {
        if (header.trim() !== '') {
            const option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            select.appendChild(option);
        }
    });
    select.style.display = 'inline-block';
}

function showDataPreview(data, headers) {
    const preview = document.getElementById('dataPreview');
    let html = '<div class="preview-header">Data Preview (First 5 rows):</div>';
    html += '<strong>' + headers.join(' | ') + '</strong><br>';
    html += '—'.repeat(60) + '<br>';
    
    for (let i = 0; i < Math.min(5, data.length); i++) {
        html += headers.map(h => data[i][h]).join(' | ') + '<br>';
    }
    
    preview.innerHTML = html;
    preview.style.display = 'block';
}

document.getElementById('csvFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showMessage('Please upload a CSV file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const result = parseCSV(e.target.result);
            if (!result || result.data.length === 0) {
                showMessage('Could not parse CSV file. Check format.', 'error');
                return;
            }

            currentData = result.data;
            populateColumns(result.headers);
            showDataPreview(result.data, result.headers);
            showMessage('✅ File loaded! Select a column to analyze.', 'success');
        } catch (error) {
            console.error(error);
            showMessage('❌ Error parsing file: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
});

document.getElementById('columnSelect').addEventListener('change', function(e) {
    const column = e.target.value;
    if (column) analyzeColumn(column);
});

function calculateStats(data) {
    const originalData = [...data];
    data = [...data].sort((a, b) => a - b);
    const n = data.length;
    
    const min = data[0];
    const max = data[n-1];
    const range = max - min;
    
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (data[n/2 - 1] + data[n/2]) / 2 : data[Math.floor(n/2)];
    
    const q1Index = Math.floor((n + 1) / 4) - 1;
    const q3Index = Math.ceil(3 * (n + 1) / 4) - 1;
    const q1 = data[Math.max(0, q1Index)];
    const q2 = median;
    const q3 = data[Math.min(n - 1, q3Index)];
    const iqr = q3 - q1;
    
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    
    const skewness = n > 2 ? 
        (data.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) * n) / ((n - 1) * (n - 2)) 
        : 0;
    const kurtosis = n > 3 ? 
        ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * 
        data.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 4), 0) - 
        (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
        : 0;
    
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outliers = originalData.filter(val => val < lowerFence || val > upperFence);
    
    return { mean, q1, q2, q3, iqr, min, max, range, stdDev, variance, skewness, kurtosis, outliers, n, lowerFence, upperFence };
}

function displayStats(stats) {
    const grid = document.getElementById('statsGrid');
    let html = `
        <div class="stat-card">
            <div class="stat-label">Mean</div>
            <div class="stat-value">${stats.mean.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Q1</div>
            <div class="stat-value">${stats.q1.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Q2 (Median)</div>
            <div class="stat-value">${stats.q2.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Q3</div>
            <div class="stat-value">${stats.q3.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">IQR</div>
            <div class="stat-value">${stats.iqr.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Std Dev</div>
            <div class="stat-value">${stats.stdDev.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Min</div>
            <div class="stat-value">${stats.min.toFixed(1)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Max</div>
            <div class="stat-value">${stats.max.toFixed(1)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Skewness</div>
            <div class="stat-value">${stats.skewness.toFixed(3)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Kurtosis</div>
            <div class="stat-value">${stats.kurtosis.toFixed(3)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Outliers</div>
            <div class="stat-value">${stats.outliers.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Sample Size</div>
            <div class="stat-value">${stats.n}</div>
        </div>
    `;

    if (stats.outliers.length > 0) {
        html += `
            <div class="stat-card">
                <div class="stat-label">Lower Fence</div>
                <div class="stat-value">${stats.lowerFence.toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Upper Fence</div>
                <div class="stat-value">${stats.upperFence.toFixed(2)}</div>
            </div>
        `;
    }

    grid.innerHTML = html;
}

function displayOutliers(outliers) {
    const section = document.getElementById('outliersSection');
    const list = document.getElementById('outlierValues');
    if (outliers.length > 0) {
        list.innerHTML = outliers.map(v => `<span style="color:#e74c3c;">${v.toFixed(2)}</span>`).join(', ');
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

function createHistogram(data, stats, columnName) {
    const numBins = Math.max(5, Math.min(30, Math.ceil(Math.sqrt(stats.n))));
    const trace1 = {
        x: data,
        type: 'histogram',
        nbinsx: numBins,
        name: 'Data',
        marker: { 
            color: 'rgba(102, 126, 234, 0.8)', 
            line: { color: '#4a55a2', width: 1 } 
        },
        opacity: 0.7,
    };

    // Normal curve (3 SD away from mean)
    const x = [];
    const y = [];
    const step = (stats.max - stats.min) / 200;
    // Extend 3 SD beyond min/max for smooth tails
    for (let i = stats.mean - 3 * stats.stdDev; i <= stats.mean + 3 * stats.stdDev; i += step) {
        x.push(i);
        const norm = (1 / (stats.stdDev * Math.sqrt(2 * Math.PI))) * 
                    Math.exp(-0.5 * Math.pow((i - stats.mean) / stats.stdDev, 2));
        y.push(norm * stats.n * (stats.max - stats.min) / numBins);
    }

    const trace2 = {
        x: x,
        y: y,
        type: 'scatter',
        mode: 'lines',
        name: 'Normal Distribution',
        line: { color: '#e74c3c', width: 2.5 },
    };

    // >>> COMMENTED OUT: "Normal Distribution" label <<<
    /*
    const peakX = stats.mean;
    const peakY = y[Math.floor(x.indexOf(peakX))] || Math.max(...y);
    const annotation = {
        x: peakX,
        y: peakY,
        text: 'Normal Distribution',
        showarrow: true,
        arrowhead: 2,
        ax: 0,
        ay: -40,
        font: { size: 12, color: '#e74c3c' },
        bgcolor: 'white',
        bordercolor: '#e74c3c',
        borderwidth: 1,
        opacity: 0.9
    };
    */

    Plotly.newPlot('histogram', [trace1, trace2], {
        title: `Distribution Analysis: ${columnName}`,
        xaxis: { 
            title: columnName,
            showgrid: true,
            gridcolor: 'rgba(200,200,200,0.5)'
        },
        yaxis: { 
            title: 'Frequency',
            showgrid: true,
            gridcolor: 'rgba(200,200,200,0.5)'
        },
        showlegend: false,
        margin: { t: 60, r: 30, b: 50, l: 50 },
        // annotations: [annotation]  // <<< ALSO COMMENTED OUT
    });
}

function createBoxPlot(data, stats, columnName) {
    const trace = {
        y: data,
        type: 'box',
        name: columnName,
        boxpoints: 'outliers',
        jitter: 0.3,
        pointpos: 0,
        marker: {
            color: 'red',
            size: 6,
            line: { color: 'darkblue', width: 1 }
        },
        line: { 
            color: 'darkblue', 
            width: 2
        },
        fillcolor: 'lightblue',
        whiskerwidth: 0.5,
        quartilemethod: 'linear',
    };

    // Move Q1, Q2, Q3 labels to the RIGHT using x: 1.0
    const annotations = [
        {
            x: 1.0, y: stats.q1,
            text: `Q1 = ${stats.q1.toFixed(2)}`,
            showarrow: false,
            xanchor: 'left',
            ax: 0,
            ay: 0,
            font: { size: 12, color: '#2c3e50' },
            bgcolor: 'rgba(255,255,255,0.9)',
            borderpad: 4,
            bordercolor: 'darkblue',
            borderwidth: 1
        },
        {
            x: 1.0, y: stats.q2,
            text: `Q2 = ${stats.q2.toFixed(2)}`,
            showarrow: false,
            xanchor: 'left',
            ax: 0,
            ay: 0,
            font: { size: 12, color: '#2c3e50' },
            bgcolor: 'rgba(255,255,255,0.9)',
            borderpad: 4,
            bordercolor: 'darkblue',
            borderwidth: 1
        },
        {
            x: 1.0, y: stats.q3,
            text: `Q3 = ${stats.q3.toFixed(2)}`,
            showarrow: false,
            xanchor: 'left',
            ax: 0,
            ay: 0,
            font: { size: 12, color: '#2c3e50' },
            bgcolor: 'rgba(255,255,255,0.9)',
            borderpad: 4,
            bordercolor: 'darkblue',
            borderwidth: 1
        },
        {
            x: 0, y: stats.lowerFence,
            text: `Lower Fence<br>${stats.lowerFence.toFixed(2)}`,
            showarrow: true,
            arrowhead: 2,
            ax: -50,
            ay: 0,
            xanchor: 'right',
            font: { size: 11, color: 'white', weight: 'bold' },
            bgcolor: 'red',
            bordercolor: 'white',
            borderwidth: 1,
            opacity: 0.9,
            borderpad: 2,
            width: 70
        },
        {
            x: 0, y: stats.upperFence,
            text: `Upper Fence<br>${stats.upperFence.toFixed(2)}`,
            showarrow: true,
            arrowhead: 2,
            ax: -50,
            ay: 0,
            xanchor: 'right',
            font: { size: 11, color: 'white', weight: 'bold' },
            bgcolor: 'red',
            bordercolor: 'white',
            borderwidth: 1,
            opacity: 0.9,
            borderpad: 2,
            width: 70
          */
        }
    ];

    if (stats.min !== stats.lowerFence) {
        annotations.push({
            x: 0, y: stats.min,
            text: `Min: ${stats.min.toFixed(2)}`,
            showarrow: true,
            arrowhead: 2,
            ax: 40,
            ay: -20,
            font: { size: 10, color: '#7f8c8d' }
        });
   */
    }
/*
    if (stats.max !== stats.upperFence) {
        annotations.push({
            x: 0, y: stats.max,
            text: `Max: ${stats.max.toFixed(2)}`,
            showarrow: true,
            arrowhead: 2,
            ax: 40,
            ay: 20,
            font: { size: 10, color: '#7f8c8d' }
        });
     */
    }

    const layout = {
        title: `Box-Whiskers Plot Analysis: ${columnName}`,
        yaxis: {
            title: '',
            showgrid: true,
            gridcolor: 'rgba(200,200,200,0.3)',
            zeroline: false,
            tickfont: { size: 12 }
        },
        xaxis: {
            showticklabels: false,
            range: [-0.5, 1.5]
        },
        showlegend: false,
        margin: { l: 80, r: 200, t: 60, b: 50 },
        height: 600,
        annotations: annotations,
        plot_bgcolor: 'white',
        paper_bgcolor: 'white'
    };

    Plotly.newPlot('boxplot', [trace], layout);
}

function analyzeColumn(columnName) {
    const values = currentData.map(row => parseFloat(row[columnName]))
                             .filter(val => !isNaN(val));

    if (values.length === 0) {
        showMessage('No numeric data found in this column', 'error');
        return;
    }

    if (values.length < 3) {
        showMessage('Need at least 3 numeric values for statistics', 'error');
        return;
    }

    const stats = calculateStats(values);
    displayStats(stats);
    displayOutliers(stats.outliers);
    createHistogram(values, stats, columnName);
    createBoxPlot(values, stats, columnName);
    
    document.getElementById('results').style.display = 'block';
}

// ======================
// SAMPLE DATA BUTTONS
// ======================

function loadSample(type) {
    let values, columnName;

    if (type === 'normal') {
        values = [];
        for (let i = 0; i < 100; i++) {
            let u = 0, v = 0;
            while (u === 0) u = Math.random();
            while (v === 0) v = Math.random();
            const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
            values.push((z * 15 + 100).toFixed(2));
        }
        columnName = "Normal_Score";
    } else if (type === 'skewed') {
        values = [];
        for (let i = 0; i < 100; i++) {
            const val = Math.pow(Math.random(), 3) * 100 + 5;
            values.push(val.toFixed(2));
        }
        columnName = "Skewed_Measure";
    }

    currentData = values.map(v => ({ [columnName]: String(v) }));

    const select = document.getElementById('columnSelect');
    select.innerHTML = `<option value="${columnName}">${columnName}</option>`;
    select.style.display = 'inline-block';

    const preview = document.getElementById('dataPreview');
    preview.innerHTML = `
        <div class="preview-header">Data Preview (First 5 rows):</div>
        <strong>${columnName}</strong><br>—<br>
        ${values.slice(0, 5).join('<br>')}
    `;
    preview.style.display = 'block';

    document.getElementById('messages').innerHTML = '';
    analyzeColumn(columnName);
    document.getElementById('results').style.display = 'block';
}
