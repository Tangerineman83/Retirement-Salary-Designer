let rldConfig = null;
let state = { tenure: 'owner', foundations: 50, home: 50, wellness: 50 };
let currentValues = { foundations: 0, home: 0, wellness: 0, gross: 0, net: 0, tax: 0 };
let charts = { donut: null, stacked: null };

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data/config.json');
        rldConfig = await response.json();
        initApp();
    } catch (e) {
        console.error("Config failed.", e);
    }
});

function initApp() {
    setupCharts();
    setupListeners();
    calculateAll();
}

function setupListeners() {
    // "Magnetic Snapping" Sliders
    ['foundations', 'home', 'wellness'].forEach(pillar => {
        const slider = document.getElementById(`slider-${pillar}`);
        slider.addEventListener('input', (e) => {
            let val = parseInt(e.target.value);
            // Snap logic: If within 4% of a preset, snap to it
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
}

// UI Panel Toggles
function togglePersonalize(id) {
    const panel = document.getElementById(`pers-${id}`);
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

// THE EXTRAPOLATION ENGINE: Multi-Category Input
function extrapolate(pillar) {
    const freq = parseInt(document.getElementById(`freq-${pillar}`).value);
    
    // Gather inputs based on pillar
    let totalAnnualInput = 0;
    const inputs = document.querySelectorAll(`#pers-${pillar} input[type="number"]`);
    
    inputs.forEach(input => {
        if (input.value) {
            totalAnnualInput += (parseFloat(input.value) * freq);
        }
    });

    if (totalAnnualInput === 0) return;

    // Fetch benchmarks
    const pData = pillar === 'home' ? rldConfig.benchmarks.home[state.tenure] : rldConfig.benchmarks[pillar];
    
    // We compare the user's explicit total against the benchmark totals
    const staples = pData.staples.total;
    const signature = pData.signature.total;
    const designer = pData.designer.total;

    let newVal = 50;
    if (totalAnnualInput <= staples) newVal = 0;
    else if (totalAnnualInput >= designer) newVal = 100;
    else if (totalAnnualInput <= signature) {
        newVal = ((totalAnnualInput - staples) / (signature - staples)) * 50;
    } else {
        newVal = 50 + (((totalAnnualInput - signature) / (designer - signature)) * 50);
    }

    state[pillar] = Math.round(newVal);
    document.getElementById(`slider-${pillar}`).value = state[pillar];
    calculateAll();
}

function getInterpolatedValue(pillar, sliderValue) {
    const pData = pillar === 'home' ? rldConfig.benchmarks.home[state.tenure] : rldConfig.benchmarks[pillar];
    const staples = pData.staples.total;
    const signature = pData.signature.total;
    const designer = pData.designer.total;

    if (sliderValue <= 50) {
        return staples + ((signature - staples) * (sliderValue / 50));
    } else {
        return signature + ((designer - signature) * ((sliderValue - 50) / 50));
    }
}

function calculateAll() {
    currentValues.foundations = getInterpolatedValue('foundations', state.foundations);
    currentValues.home = getInterpolatedValue('home', state.home);
    currentValues.wellness = getInterpolatedValue('wellness', state.wellness);

    const gross = currentValues.foundations + currentValues.home + currentValues.wellness;
    let tax = 0;
    const pa = rldConfig.tax.personalAllowance;

    if (gross > pa) {
        if (gross <= rldConfig.tax.higherRateThreshold) {
            tax = (gross - pa) * rldConfig.tax.basicRate;
        } else {
            tax = ((rldConfig.tax.higherRateThreshold - pa) * rldConfig.tax.basicRate) + 
                  ((gross - rldConfig.tax.higherRateThreshold) * rldConfig.tax.higherRate);
        }
    }

    currentValues.gross = gross;
    currentValues.tax = tax;
    currentValues.net = gross - tax;

    // Update Text UI
    document.getElementById('val-foundations').innerText = `£${Math.round(currentValues.foundations).toLocaleString()}`;
    document.getElementById('val-home').innerText = `£${Math.round(currentValues.home).toLocaleString()}`;
    document.getElementById('val-wellness').innerText = `£${Math.round(currentValues.wellness).toLocaleString()}`;
    
    document.getElementById('display-salary').innerText = `£${Math.round(gross).toLocaleString()}`;
    document.getElementById('display-net').innerText = `£${Math.round(currentValues.net).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+£${Math.round(tax).toLocaleString()}`;

    updateCharts();
}

// CHARTS: Donut & Stacked Bar Evolution
function setupCharts() {
    const ctxDonut = document.getElementById('donutChart').getContext('2d');
    charts.donut = new Chart(ctxDonut, {
        type: 'doughnut',
        data: { 
            labels: ['Foundations', 'Structure', 'Wellness'], 
            datasets: [{ data: [0,0,0], backgroundColor: ['#00d4ff', '#0a2540', '#00a3cc'], borderWidth: 0 }] 
        },
        options: { 
            responsive: true, 
            cutout: '80%', // Increased cutout to fit text perfectly
            plugins: { legend: { display: false } } // Hidden legend to save space
        }
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
        options: { 
            responsive: true, 
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
        }
    });
}

function updateCharts() {
    // Donut
    charts.donut.data.datasets[0].data = [currentValues.foundations, currentValues.home, currentValues.wellness];
    charts.donut.update();

    // Stacked Evolution Array Generation
    const dataF = []; const dataH = []; const dataW = [];
    
    [0, 3, 8, 13, 18, 23].forEach(years => {
        dataF.push(Math.round(currentValues.foundations * Math.pow(1 + rldConfig.inflation.foundations, years)));
        dataH.push(Math.round(currentValues.home * Math.pow(1 + rldConfig.inflation.home, years)));
        
        // Pivot Health/Care floor at age 80 (years >= 13)
        let w = currentValues.wellness * Math.pow(1 + rldConfig.inflation.wellness, years);
        if (years >= 13) w = w * 1.15; 
        dataW.push(Math.round(w));
    });

    charts.stacked.data.datasets[0].data = dataF;
    charts.stacked.data.datasets[1].data = dataH;
    charts.stacked.data.datasets[2].data = dataW;
    charts.stacked.update();
}
