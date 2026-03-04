let rldConfig = null;
let state = { tenure: 'owner', foundations: 50, home: 50, wellness: 50 };
let currentValues = { foundations: 0, home: 0, wellness: 0, gross: 0, net: 0, tax: 0 };
let charts = { donut: null, line: null };

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data/config.json');
        rldConfig = await response.json();
        initApp();
    } catch (e) {
        console.error("Config failed. Run on local server.", e);
    }
});

function initApp() {
    setupCharts();
    setupListeners();
    calculateAll();
}

function setupListeners() {
    // Sliders
    ['foundations', 'home', 'wellness'].forEach(pillar => {
        document.getElementById(`slider-${pillar}`).addEventListener('input', (e) => {
            state[pillar] = parseInt(e.target.value);
            calculateAll();
        });
    });

    // Tenure
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tenure = e.target.dataset.tenure;
            calculateAll();
        });
    });
}

// THE INTERPOLATION ENGINE: Maps 0-100 to actual £ values
function getInterpolatedValue(pillar, sliderValue) {
    const pData = pillar === 'home' ? rldConfig.benchmarks.home[state.tenure] : rldConfig.benchmarks[pillar];
    
    // Extract totals (handling nested objects for breakdowns)
    const staples = pData.staples.total || pData.staples;
    const signature = pData.signature.total || pData.signature;
    const designer = pData.designer.total || pData.designer;

    if (sliderValue <= 50) {
        return staples + ((signature - staples) * (sliderValue / 50));
    } else {
        return signature + ((designer - signature) * ((sliderValue - 50) / 50));
    }
}

// THE EXTRAPOLATION ENGINE: Reverse maps £ input to 0-100 slider
function extrapolateFoundations() {
    const weeklyFood = parseFloat(document.getElementById('input-food').value);
    if (!weeklyFood) return;
    
    const annualFood = weeklyFood * 52;
    const fData = rldConfig.benchmarks.foundations;
    
    let newVal = 50;
    if (annualFood <= fData.staples.food) newVal = 0;
    else if (annualFood >= fData.designer.food) newVal = 100;
    else if (annualFood <= fData.signature.food) {
        newVal = ((annualFood - fData.staples.food) / (fData.signature.food - fData.staples.food)) * 50;
    } else {
        newVal = 50 + (((annualFood - fData.signature.food) / (fData.designer.food - fData.signature.food)) * 50);
    }

    state.foundations = Math.round(newVal);
    document.getElementById('slider-foundations').value = state.foundations;
    calculateAll();
}

function togglePersonalize(id) {
    const panel = document.getElementById(`pers-${id}`);
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

// Core Math & UI Updates
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

    // Update UI Text
    document.getElementById('val-foundations').innerText = `£${Math.round(currentValues.foundations).toLocaleString()}`;
    document.getElementById('val-home').innerText = `£${Math.round(currentValues.home).toLocaleString()}`;
    document.getElementById('val-wellness').innerText = `£${Math.round(currentValues.wellness).toLocaleString()}`;
    
    document.getElementById('display-salary').innerText = `£${Math.round(gross).toLocaleString()}`;
    document.getElementById('display-net').innerText = `£${Math.round(currentValues.net).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+ £${Math.round(tax).toLocaleString()}`;

    updateBreakdowns();
    updateCharts();
}

// Breakdowns (Tooltips/Behind the numbers)
function updateBreakdowns() {
    // Foundations proportional calculation
    const fRatio = currentValues.foundations / rldConfig.benchmarks.foundations.signature.total;
    const food = Math.round(rldConfig.benchmarks.foundations.signature.food * fRatio);
    const energy = Math.round(rldConfig.benchmarks.foundations.signature.energy * fRatio);
    document.getElementById('breakdown-foundations').innerHTML = `Derived: Food ~£${food}/yr | Energy ~£${energy}/yr`;

    // Wellness proportional
    const wRatio = currentValues.wellness / rldConfig.benchmarks.wellness.signature.total;
    const health = Math.round(rldConfig.benchmarks.wellness.signature.health * wRatio);
    document.getElementById('breakdown-wellness').innerHTML = `Derived: Health Buffer ~£${health}/yr`;
}

// CHARTS: Rendering Donut and Projection
function setupCharts() {
    const ctxDonut = document.getElementById('donutChart').getContext('2d');
    charts.donut = new Chart(ctxDonut, {
        type: 'doughnut',
        data: { labels: ['Foundations', 'Structure', 'Wellness'], datasets: [{ data: [0,0,0], backgroundColor: ['#00d4ff', '#0a2540', '#00a3cc'], borderWidth: 0 }] },
        options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });

    const ctxLine = document.getElementById('lineChart').getContext('2d');
    charts.line = new Chart(ctxLine, {
        type: 'line',
        data: { labels: [67, 70, 75, 80, 85, 90], datasets: [{ label: 'Projected Need (£)', data: [], borderColor: '#00d4ff', tension: 0.4, fill: true, backgroundColor: 'rgba(0, 212, 255, 0.1)' }] },
        options: { responsive: true, scales: { y: { beginAtZero: false } } }
    });
}

function updateCharts() {
    // Update Donut
    charts.donut.data.datasets[0].data = [currentValues.foundations, currentValues.home, currentValues.wellness];
    charts.donut.update();

    // Update Line (Evolution logic: 11% medical inflation, baseline CPI)
    const projectedData = [];
    let baseF = currentValues.foundations; let baseH = currentValues.home; let baseW = currentValues.wellness;
    
    [0, 3, 8, 13, 18, 23].forEach(years => {
        // Apply varying inflation rates from config
        let futureF = baseF * Math.pow(1 + rldConfig.inflation.foundations, years);
        let futureH = baseH * Math.pow(1 + rldConfig.inflation.home, years);
        let futureW = baseW * Math.pow(1 + rldConfig.inflation.wellness, years);
        
        // The "Pivot" at age 80 (years >= 13)
        if (years >= 13) futureW = futureW * 1.15; // Represents jump from travel to care floor

        projectedData.push(Math.round(futureF + futureH + futureW));
    });

    charts.line.data.datasets[0].data = projectedData;
    charts.line.update();
}

function calculateSalary() {
    if (!rldConfig) return;

    const gFoundations = rldConfig.benchmarks.foundations[state.foundations];
    const gHome = rldConfig.benchmarks.home[state.tenure][state.home];
    const gWellness = rldConfig.benchmarks.wellness[state.wellness];

    const totalGrossSalary = gFoundations + gHome + gWellness;
    let taxAmount = 0;
    const pa = rldConfig.tax.personalAllowance;

    if (totalGrossSalary > pa) {
        const taxable = totalGrossSalary - pa;
        if (totalGrossSalary <= rldConfig.tax.higherRateThreshold) {
            taxAmount = taxable * rldConfig.tax.basicRate;
        } else {
            const basicBand = rldConfig.tax.higherRateThreshold - pa;
            const higherBand = totalGrossSalary - rldConfig.tax.higherRateThreshold;
            taxAmount = (basicBand * rldConfig.tax.basicRate) + (higherBand * rldConfig.tax.higherRate);
        }
    }

    const netTakeHome = totalGrossSalary - taxAmount;

    document.getElementById('display-salary').innerText = `£${totalGrossSalary.toLocaleString()}`;
    document.getElementById('display-net').innerText = `£${Math.round(netTakeHome).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+ £${Math.round(taxAmount).toLocaleString()}`;
}
