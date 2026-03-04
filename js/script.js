let rldConfig = null;
let state = { tenure: 'owner', essentials: 50, home: 50, living: 50 };
let currentValues = { essentials: 0, home: 0, living: 0, gross: 0, net: 0, tax: 0 };
let categoryData = {}; 
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
    ['essentials', 'home', 'living'].forEach(pillar => {
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

    // Tooltips 
    const tooltip = document.getElementById('smart-tooltip');
    document.querySelectorAll('.pers-input').forEach(input => {
        input.addEventListener('input', (e) => extrapolate(e.target.dataset.pillar));
        
        const showTooltip = (e) => {
            const cat = e.target.dataset.cat;
            const pillar = e.target.dataset.pillar;
            const freq = parseInt(document.getElementById(`freq-${pillar}`).value);
            
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
        };

        const hideTooltip = () => tooltip.classList.remove('show');

        input.addEventListener('focus', showTooltip);
        input.addEventListener('mouseenter', showTooltip);
        input.addEventListener('blur', hideTooltip);
        input.addEventListener('mouseleave', hideTooltip);
    });
}

function togglePersonalize(id) {
    const panel = document.getElementById(`pers-${id}`);
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

// Pro-Rata Extrapolation Engine
function extrapolate(pillar) {
    const freq = parseInt(document.getElementById(`freq-${pillar}`).value);
    const inputs = document.querySelectorAll(`#pers-${pillar} .pers-input`);
    
    let totalSliderScore = 0;
    let inputCount = 0;

    inputs.forEach(input => {
        if (input.value && parseFloat(input.value) > 0) {
            const cat = input.dataset.cat;
            let b = (pillar === 'home' && cat === 'rent') 
                ? rldConfig.benchmarks.home.rent[state.tenure] 
                : rldConfig.benchmarks[pillar][cat];
            
            const annualVal = parseFloat(input.value) * (52 / (52/freq));

            let score = 50;
            if (b.staples === b.designer) {
                score = 50; // No range, ignore
            } else if (annualVal <= b.staples) {
                score = 0;
            } else if (annualVal >= b.designer) {
                score = 100;
            } else if (annualVal <= b.signature) {
                if (b.signature === b.staples) score = 50;
                else score = ((annualVal - b.staples) / (b.signature - b.staples)) * 50;
            } else {
                if (b.designer === b.signature) score = 100;
                else score = 50 + (((annualVal - b.signature) / (b.designer - b.signature)) * 50);
            }
            
            totalSliderScore += score;
            inputCount++;
        }
    });

    if (inputCount === 0) return;

    // Average the proportional position of all inputted categories
    const averageScore = Math.round(totalSliderScore / inputCount);
    state[pillar] = averageScore;
    document.getElementById(`slider-${pillar}`).value = averageScore;
    calculateAll();
}

function calculateAll() {
    currentValues.essentials = 0; currentValues.home = 0; currentValues.living = 0;
    
    for (const pillar of ['essentials', 'home', 'living']) {
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

    const gross = currentValues.essentials + currentValues.home + currentValues.living;
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

    ['essentials', 'home', 'living'].forEach(p => {
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
        data: { labels: ['Essentials', 'Home', 'Living'], datasets: [{ data: [0,0,0], backgroundColor: ['#00d4ff', '#0a2540', '#00a3cc'], borderWidth: 0 }] },
        options: { responsive: true, cutout: '82%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' £' + Math.round(c.raw).toLocaleString(); } } } } }
    });

    const ctxStacked = document.getElementById('stackedChart').getContext('2d');
    charts.stacked = new Chart(ctxStacked, {
        type: 'bar',
        data: { 
            labels: ['Age 67', '70', '75', '80', '85', '90'], 
            datasets: [
                { label: 'Essentials', backgroundColor: '#00d4ff', data: [] },
                { label: 'Home', backgroundColor: '#0a2540', data: [] },
                { label: 'Living', backgroundColor: '#00a3cc', data: [] }
            ] 
        },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
    });
}

function updateCharts() {
    charts.donut.data.datasets[0].data = [currentValues.essentials, currentValues.home, currentValues.living];
    charts.donut.update();

    const dataE = [0,0,0,0,0,0]; const dataH = [0,0,0,0,0,0]; const dataL = [0,0,0,0,0,0];
    const yearsArr = [0, 3, 8, 13, 18, 23]; 

    for (const [key, data] of Object.entries(categoryData)) {
        const pillar = key.split('_')[0];
        
        yearsArr.forEach((years, index) => {
            let projectedVal = data.value * Math.pow(1 + data.inf, years);
            
            if (data.shape === 'taper' && years >= 13) projectedVal *= 0.5; 
            if (data.shape === 'spike' && years >= 13) projectedVal *= 1.5; 

            if (pillar === 'essentials') dataE[index] += projectedVal;
            if (pillar === 'home') dataH[index] += projectedVal;
            if (pillar === 'living') dataL[index] += projectedVal;
        });
    }

    charts.stacked.data.datasets[0].data = dataE;
    charts.stacked.data.datasets[1].data = dataH;
    charts.stacked.data.datasets[2].data = dataL;
    charts.stacked.update();
}
