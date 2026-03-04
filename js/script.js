let rldConfig = null;
let state = { tenure: 'owner', foundations: 50, home: 50, wellness: 50 };
let currentValues = { foundations: 0, home: 0, wellness: 0, gross: 0, net: 0, tax: 0 };
let categoryData = {}; // Stores calculated values per exhaustive category
let charts = { donut: null, stacked: null };

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data/config.json');
        rldConfig = await response.json();
        initApp();
    } catch (e) { console.error("Config failed.", e); }
});

function initApp() {
    setupCharts();
    setupListeners();
    calculateAll();
}

function setupListeners() {
    ['foundations', 'home', 'wellness'].forEach(pillar => {
        const slider = document.getElementById(`slider-${pillar}`);
        slider.addEventListener('input', (e) => {
            let val = parseInt(e.target.value);
            if (val > -1 && val < 5) val = 0;
            if (val > 46 && val < 54) val = 50;
            if (val > 95 && val <= 100) val = 100;
            slider.value = val;
            state[pillar] = val;
            calculateAll();
        });
    });

    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tenure = e.target.dataset.tenure;
            calculateAll();
        });
    });

    // Setup Smart Tooltips & Extrapolation on Inputs
    const tooltip = document.getElementById('smart-tooltip');
    document.querySelectorAll('.pers-input').forEach(input => {
        input.addEventListener('input', (e) => extrapolate(e.target.dataset.pillar));
        
        input.addEventListener('focus', (e) => {
            const cat = e.target.dataset.cat;
            const pillar = e.target.dataset.pillar;
            const freq = parseInt(document.getElementById(`freq-${pillar}`).value);
            
            // Get benchmarks based on tenure/category
            let b = pillar === 'home' && cat === 'rent' 
                ? rldConfig.benchmarks.home.rent[state.tenure] 
                : rldConfig.benchmarks[pillar][cat];

            const name = rldConfig.benchmarks[pillar][cat].name;
            const st = Math.round(b.staples / (52/ (52/freq))); 
            const si = Math.round(b.signature / (52/ (52/freq)));
            const de = Math.round(b.designer / (52/ (52/freq)));

            tooltip.innerHTML = `<span class="tt-title">${name}</span>Staples: £${st} | Signature: £${si} | Designer: £${de}`;
            
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - 50}px`;
            tooltip.classList.add('show');
        });

        input.addEventListener('blur', () => tooltip.classList.remove('show'));
    });
}

// Extrapolation Engine: Reverse maps total inputs to slider value
function extrapolate(pillar) {
    const freq = parseInt(document.getElementById(`freq-${pillar}`).value);
    let totalInputAnnual = 0;
    
    document.querySelectorAll(`#pers-${pillar} .pers-input`).forEach(input => {
        if (input.value) totalInputAnnual += (parseFloat(input.value) * (52 / (52/freq)));
    });

    if (totalInputAnnual === 0) return;

    // Calculate baseline totals for the pillar
    let sumStaples = 0, sumSignature = 0, sumDesigner = 0;
    for (const [key, catData] of Object.entries(rldConfig.benchmarks[pillar])) {
        let b = (pillar === 'home' && key === 'rent') ? catData[state.tenure] : catData;
        if(b.staples !== undefined) sumStaples += b.staples;
        if(b.signature !== undefined) sumSignature += b.signature;
        if(b.designer !== undefined) sumDesigner += b.designer;
    }

    let newVal = 50;
    if (totalInputAnnual <= sumStaples) newVal = 0;
    else if (totalInputAnnual >= sumDesigner) newVal = 100;
    else if (totalInputAnnual <= sumSignature) {
        newVal = ((totalInputAnnual - sumStaples) / (sumSignature - sumStaples)) * 50;
    } else {
        newVal = 50 + (((totalInputAnnual - sumSignature) / (sumDesigner - sumSignature)) * 50);
    }

    state[pillar] = Math.round(newVal);
    document.getElementById(`slider-${pillar}`).value = state[pillar];
    calculateAll();
}

// Calculate individual category values based on slider position
function calculateAll() {
    currentValues.foundations = 0; currentValues.home = 0; currentValues.wellness = 0;
    
    // Loop exhaustive config to calculate precise value per category
    for (const pillar of ['foundations', 'home', 'wellness']) {
        const sliderVal = state[pillar];
        for (const [key, catData] of Object.entries(rldConfig.benchmarks[pillar])) {
            let b = (pillar === 'home' && key === 'rent') ? catData[state.tenure] : catData;
            if(b.staples === undefined) continue;

            let val = 0;
            if (sliderVal <= 50) {
                val = b.staples + ((b.signature - b.staples) * (sliderVal / 50));
            } else {
                val = b.signature + ((b.designer - b.signature) * ((sliderVal - 50) / 50));
            }
            
            categoryData[`${pillar}_${key}`] = { value: val, shape: catData.shape, inf: catData.inflation };
            currentValues[pillar] += val;
        }
    }

    const gross = currentValues.foundations + currentValues.home + currentValues.wellness;
    let tax = 0;
    const pa = rldConfig.tax.personalAllowance;

    if (gross > pa) {
        if (gross <= rldConfig.tax.higherRateThreshold) { tax = (gross - pa) * rldConfig.tax.basicRate; } 
        else {
            tax = ((rldConfig.tax.higherRateThreshold - pa) * rldConfig.tax.basicRate) + 
                  ((gross - rldConfig.tax.higherRateThreshold) * rldConfig.tax.higherRate);
        }
    }

    currentValues.gross = gross;
    currentValues.net = gross - tax;
    currentValues.tax = tax;

    // Update UI
    ['foundations', 'home', 'wellness'].forEach(p => {
        document.getElementById(`val-${p}`).innerText = `£${Math.round(currentValues[p]).toLocaleString()}`;
    });
    document.getElementById('display-salary').innerText = `£${Math.round(gross).toLocaleString()}`;
    document.getElementById('display-net').innerText = `£${Math.round(currentValues.net).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+£${Math.round(tax).toLocaleString()}`;

    updateCharts();
}

function setupCharts() {
    const ctxDonut = document.getElementById('donutChart').getContext('2d');
    charts.donut = new Chart(ctxDonut, {
        type: 'doughnut',
        data: { labels: ['Foundations', 'Structure', 'Wellness'], datasets: [{ data: [0,0,0], backgroundColor: ['#00d4ff', '#0a2540', '#00a3cc'], borderWidth: 0 }] },
        options: { responsive: true, cutout: '82%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' £' + Math.round(c.raw).toLocaleString(); } } } } }
    });

    const ctxStacked = document.getElementById('stackedChart').getContext('2d');
    charts.stacked = new Chart(ctxStacked, {
        type: 'bar',
        data: { 
            labels: ['Age 67', '70', '75', '80', '85', '90'], 
            datasets: [
                { label: 'Foundations', backgroundColor: '#00d4ff', data: [] },
                { label: 'Structure', backgroundColor: '#0a2540', data: [] },
                { label: 'Wellness', backgroundColor: '#00a3cc', data: [] }
            ] 
        },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
    });
}

function updateCharts() {
    charts.donut.data.datasets[0].data = [currentValues.foundations, currentValues.home, currentValues.wellness];
    charts.donut.update();

    const dataF = [0,0,0,0,0,0]; const dataH = [0,0,0,0,0,0]; const dataW = [0,0,0,0,0,0];
    const yearsArr = [0, 3, 8, 13, 18, 23]; // Age 67 to 90

    // Apply trajectory shape logic to individual categories
    for (const [key, data] of Object.entries(categoryData)) {
        const pillar = key.split('_')[0];
        
        yearsArr.forEach((years, index) => {
            let projectedVal = data.value * Math.pow(1 + data.inf, years);
            
            // Trajectory Modeling
            if (data.shape === 'taper' && years >= 13) projectedVal *= 0.5; // E.g., travel drops at 80
            if (data.shape === 'spike' && years >= 13) projectedVal *= 1.5; // E.g., healthcare spikes at 80

            if (pillar === 'foundations') dataF[index] += projectedVal;
            if (pillar === 'home') dataH[index] += projectedVal;
            if (pillar === 'wellness') dataW[index] += projectedVal;
        });
    }

    charts.stacked.data.datasets[0].data = dataF;
    charts.stacked.data.datasets[1].data = dataH;
    charts.stacked.data.datasets[2].data = dataW;
    charts.stacked.update();
}
