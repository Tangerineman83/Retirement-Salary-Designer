Chart.register(ChartDataLabels);
Chart.register(window['chartjs-plugin-annotation']);

let rldConfig = null;
let locationBenchmarks = null;

let state = { 
    age: 55, 
    postcode: '',
    dbPension: 0,
    pensionPot: 0,
    otherSavings: 0,
    homeValue: 0,
    mortgagePmt: 0,
    rentPmt: 0,
    tenure: 'owner', 
    mortgageEndAge: 75,
    essentials: 50, 
    home: 50, 
    living: 50 
};
let currentValues = { essentials: 0, home: 0, living: 0, gross: 0, net: 0, tax: 0 };
let categoryData = {}; 
let charts = { polar: null, mainBar: null }; 
let locationMultipliers = { essentials: 1, home_maintenance: 1 };
let snapshotData = null; // Stores the "Director's Cut" A/B Comparison

const palette = {
    sage: '#A3C6C4',
    dusk: '#6B7A8F', 
    orange: '#FF5A36',
    espresso: '#2B2625'
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [configRes, locRes] = await Promise.all([
            fetch('data/config.json'),
            fetch('data/location_benchmarks.json')
        ]);
        rldConfig = await configRes.json();
        locationBenchmarks = await locRes.json();
        initApp();
    } catch (e) { console.error("Initialization failed.", e); }
});

function initApp() {
    setupCharts();
    setupListeners();
}

window.toggleSection = function(bodyId, headerElement) {
    const body = document.getElementById(bodyId);
    body.classList.toggle('collapsed');
    headerElement.classList.toggle('collapsed');
}

window.togglePersonalize = function(id) {
    const panel = document.getElementById(`pers-${id}`);
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

// Slot Machine Animation Function
function animateValue(elementId, start, end, duration) {
    const obj = document.getElementById(elementId);
    if (!obj) return;
    
    // Check if it has a prefix like "+"
    const isTax = elementId === 'display-tax';
    const prefix = isTax ? '+£' : '£';

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // easeOut function
        const easeOut = 1 - Math.pow(1 - progress, 4);
        const currentVal = Math.floor(progress * (end - start) + start);
        
        obj.innerText = `${prefix}${currentVal.toLocaleString()}`;
        obj.setAttribute('data-val', currentVal);

        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerText = `${prefix}${Math.round(end).toLocaleString()}`;
            obj.setAttribute('data-val', Math.round(end));
        }
    };
    window.requestAnimationFrame(step);
}

function updatePostcodeReadout() {
    const pcInput = document.getElementById('meas-postcode').value.trim();
    const hint = document.getElementById('postcode-hint');
    state.postcode = pcInput;
    
    const alphaMatch = pcInput.match(/^[A-Z]{1,2}/i);
    
    if (alphaMatch && locationBenchmarks) {
        document.getElementById('main-journey-flow').classList.add('revealed-flow');
        document.getElementById('main-journey-flow').classList.remove('hidden-flow');

        const areaCode = alphaMatch[0].toUpperCase();
        const districtData = locationBenchmarks.districts[areaCode];
        
        if (districtData) {
            // Apply streaming-style Smart Defaults
            hint.innerHTML = `Loaded Regional Baseline: <strong>${districtData.region}</strong>`;
            hint.style.color = 'var(--accent-sage)';
            
            // Lock in local multipliers for CalculateAll()
            locationMultipliers = districtData.adjustments || { essentials: 1, home_maintenance: 1 };

            state.essentials = districtData.slider_positions.core;
            state.home = districtData.slider_positions.home;
            state.living = districtData.slider_positions.lifestyle;
            
            document.getElementById('slider-essentials').value = state.essentials;
            document.getElementById('slider-home').value = state.home;
            document.getElementById('slider-living').value = state.living;
            
            // Auto-detect tenure
            let impliedTenure = 'owner';
            if (state.age < 55) impliedTenure = 'mortgage';
            else if (districtData.imd_decile <= 4) impliedTenure = 'rent';
            state.tenure = impliedTenure;

            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.toggle-btn[data-tenure="${impliedTenure}"]`).classList.add('active');

            const displayReadout = document.getElementById('p2-tenure-display');
            displayReadout.innerHTML = `<strong>Auto-Play Settings:</strong> Based on <strong>${districtData.region}</strong>, your Home tier has been scaled to local property markets.`;

            handleTenureUI(false); 
            calculateAll(); 

        } else {
            hint.innerHTML = `Area not mapped. Using National Average.`;
            locationMultipliers = { essentials: 1, home_maintenance: 1 };
            calculateAll();
        }
    } else {
        hint.innerHTML = '';
    }
}

function setupListeners() {
    document.getElementById('meas-age').addEventListener('change', (e) => { 
        state.age = parseInt(e.target.value) || 67; 
        updatePostcodeReadout(); 
        calculateAll(); 
    });
    
    document.getElementById('meas-postcode').addEventListener('input', updatePostcodeReadout);

    document.getElementById('meas-db').addEventListener('input', (e) => { state.dbPension = parseFloat(e.target.value) || 0; calculateAll(); });
    document.getElementById('meas-pots').addEventListener('input', (e) => { state.pensionPot = parseFloat(e.target.value) || 0; calculateAll(); });
    document.getElementById('meas-savings').addEventListener('input', (e) => { state.otherSavings = parseFloat(e.target.value) || 0; calculateAll(); });
    
    document.getElementById('meas-home-value').addEventListener('input', (e) => { state.homeValue = parseFloat(e.target.value) || 0; });
    document.getElementById('meas-home-value-mortgage').addEventListener('input', (e) => { state.homeValue = parseFloat(e.target.value) || 0; });
    document.getElementById('meas-mortgage-pmt').addEventListener('input', (e) => { state.mortgagePmt = parseFloat(e.target.value) || 0; document.getElementById('input-shelter').value = state.mortgagePmt || ''; calculateAll(); });
    document.getElementById('meas-rent-pmt').addEventListener('input', (e) => { state.rentPmt = parseFloat(e.target.value) || 0; document.getElementById('input-shelter').value = state.rentPmt || ''; calculateAll(); });
    document.getElementById('meas-mortgage-age').addEventListener('change', (e) => { state.mortgageEndAge = parseInt(e.target.value) || 75; calculateAll(); });

    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tenure = e.target.dataset.tenure;
            handleTenureUI(true);
            calculateAll();
        });
    });

    ['essentials', 'home', 'living'].forEach(pillar => {
        const slider = document.getElementById(`slider-${pillar}`);
        slider.addEventListener('input', (e) => {
            let val = parseInt(e.target.value);
            // Snap to detents
            if (val > -1 && val < 5) val = 0;
            if (val > 46 && val < 54) val = 50;
            if (val > 95 && val <= 100) val = 100;
            slider.value = val;
            state[pillar] = val;
            calculateAll();
        });
    });

    document.getElementById('toggle-travel').addEventListener('change', calculateAll);
    document.getElementById('toggle-care').addEventListener('change', calculateAll);

    // Snapshot Feature for the A/B Director's Cut
    document.getElementById('btn-snapshot').addEventListener('click', () => {
        const btn = document.getElementById('btn-snapshot');
        if(snapshotData) {
            snapshotData = null;
            btn.innerText = "Save Director's Cut";
            btn.style.background = 'var(--text-espresso)';
            updateChartsAndJourney();
        } else {
            // Store current chart trajectory sum
            snapshotData = charts.mainBar.data.datasets[0].data.map((val, i) => {
                return val + charts.mainBar.data.datasets[1].data[i] + charts.mainBar.data.datasets[2].data[i];
            });
            btn.innerText = "Clear Compare";
            btn.style.background = 'var(--accent-orange)';
            updateChartsAndJourney();
        }
    });

    // Tooltip Logic remains the same
    const tooltip = document.getElementById('smart-tooltip');
    let tooltipTimeout;
    const hideTooltip = () => tooltip.classList.remove('show');
    // ... keeping existing tooltip listeners ...
}

function handleTenureUI(updateText = true) {
    const ownerInputs = document.getElementById('tenure-owner-inputs');
    const mortgageInputs = document.getElementById('tenure-mortgage-inputs');
    const rentInputs = document.getElementById('tenure-rent-inputs');
    const displayReadout = document.getElementById('p2-tenure-display');
    const shelterInput = document.getElementById('input-shelter');

    ownerInputs.classList.add('hidden');
    mortgageInputs.classList.add('hidden');
    rentInputs.classList.add('hidden');
    shelterInput.disabled = true;

    if (state.tenure === 'owner') {
        ownerInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You own your home outright.`;
        shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You have a mortgage.`;
        shelterInput.value = state.mortgagePmt || '';
    } else {
        rentInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You are renting.`;
        shelterInput.value = state.rentPmt || '';
    }
}

window.extrapolate = function(pillar) {
    // ... existing extrapolate logic ...
}

function calculateAll() {
    currentValues.essentials = 0; currentValues.home = 0; currentValues.living = 0;
    
    for (const pillar of ['essentials', 'home', 'living']) {
        const sliderVal = state[pillar];
        for (const [key, catData] of Object.entries(rldConfig.benchmarks[pillar])) {
            let b = (pillar === 'home' && key === 'shelter') ? catData[state.tenure] : catData;
            if(b.staples === undefined) continue;

            let val = 0;
            if (pillar === 'home' && key === 'shelter') {
                if (state.tenure === 'owner') val = 0;
                else if (state.tenure === 'mortgage') val = state.mortgagePmt * 12;
                else if (state.tenure === 'rent') val = state.rentPmt * 12;
            } else {
                if (sliderVal <= 50) val = b.staples + ((b.signature - b.staples) * (sliderVal / 50));
                else val = b.signature + ((b.designer - b.signature) * ((sliderVal - 50) / 50));
            }
            
            // APPLY THE POSTCODE MULTIPLIERS
            if (pillar === 'essentials') val *= locationMultipliers.essentials;
            if (pillar === 'home' && key === 'maintenance') val *= locationMultipliers.home_maintenance;

            if (pillar === 'home' && key === 'shelter' && state.tenure === 'mortgage' && state.age >= state.mortgageEndAge) {
                val = 0;
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
            tax = ((rldConfig.tax.higherRateThreshold - pa) * rldConfig.tax.basicRate) + ((gross - rldConfig.tax.higherRateThreshold) * rldConfig.tax.higherRate);
        }
    }

    currentValues.gross = gross;
    currentValues.net = gross - tax;
    currentValues.tax = tax;

    // Trigger Slot Machine Animations
    ['essentials', 'home', 'living'].forEach(p => {
        animateValue(`val-${p}`, parseFloat(document.getElementById(`val-${p}`).innerText.replace(/[^0-9.-]+/g,"")) || 0, currentValues[p], 400);
    });
    
    animateValue('display-salary', parseInt(document.getElementById('display-salary').getAttribute('data-val')) || 0, gross, 600);
    animateValue('display-net', parseInt(document.getElementById('display-net').getAttribute('data-val')) || 0, currentValues.net, 600);
    animateValue('display-tax', parseInt(document.getElementById('display-tax').getAttribute('data-val')) || 0, tax, 600);

    updateChartsAndJourney();
}

function updateChartsAndJourney() {
    charts.polar.data.datasets[0].data = [state.essentials, state.home, state.living];
    charts.polar.update();

    const endAge = 95;
    const labels = [];
    const dataE = []; const dataH = []; const dataL = [];
    
    const doTravelTaper = document.getElementById('toggle-travel').checked;
    const doCareSpike = document.getElementById('toggle-care').checked;

    const spAge = 67; 
    const spBase = rldConfig.assumptions.statePension || 11973; 
    const projectedSp = spBase; 

    document.getElementById('sp-amount-val').innerText = `£${Math.round(projectedSp).toLocaleString()}`;
    document.getElementById('sp-age-val').innerText = spAge;

    let spRemaining = projectedSp;
    let dbRemaining = state.dbPension;
    let potsTotal = state.pensionPot + state.otherSavings;
    let potsRemaining = potsTotal * 0.06;

    let walletTitle = "";
    let walletDesc = "";
    let showWallet = false;
    let showAnnuityInWallet = false;
    
    // ... [KEEP EXISTING GAP MATH LOGIC FROM PREVIOUS SCRIPT.JS - Omitted for brevity, but stays intact] ...

    // CHART HORIZON TRAJECTORY
    let runningPot = potsTotal;
    let exhaustionAge = -1;

    for (let age = state.age; age <= endAge; age++) {
        labels.push(age);
        let eSum = 0; let hSum = 0; let lSum = 0;

        for (const [key, data] of Object.entries(categoryData)) {
            const pillar = key.split('_')[0];
            const cat = key.split('_')[1];

            let projectedVal = data.value; 
            
            if (pillar === 'living') {
                if (data.shape === 'taper' && age >= 75 && doTravelTaper) projectedVal *= 0.5; 
                if (data.shape === 'spike' && age >= 80 && doCareSpike) projectedVal *= 3.0; 
            }
            if (pillar === 'home' && cat === 'shelter' && state.tenure === 'mortgage' && age >= state.mortgageEndAge) projectedVal = 0;

            if (pillar === 'essentials') eSum += projectedVal;
            if (pillar === 'home') hSum += projectedVal;
            if (pillar === 'living') lSum += projectedVal;
        }

        const totalNetNeed = eSum + hSum + lSum;
        const shortfallYearly = totalNetNeed - (projectedSp + state.dbPension);
        
        if (shortfallYearly > 0) {
            let grossShortfall = shortfallYearly;
            const pa = rldConfig.tax.personalAllowance;
            if (totalNetNeed > pa) grossShortfall = shortfallYearly / (1 - rldConfig.tax.basicRate); 
            
            runningPot -= grossShortfall;
            if (runningPot <= 0 && exhaustionAge === -1 && potsTotal > 0) {
                exhaustionAge = age;
            }
        }

        dataE.push(eSum);
        dataH.push(hSum);
        dataL.push(lSum);
    }

    // STREAMING ALERT: End of Credits
    const polarWrap = document.getElementById('polar-wrapper');
    if (exhaustionAge !== -1 && exhaustionAge <= 90) {
        document.getElementById('tips-p3-text').innerHTML += `<br><br><strong style="color:var(--accent-orange);">End of Credits:</strong> Based on this cut, your liquid wealth will deplete by <strong>Age ${exhaustionAge}</strong>.`;
        polarWrap.classList.add('pulse-danger');
    } else {
        polarWrap.classList.remove('pulse-danger');
    }

    // UPDATE DATASETS
    charts.mainBar.data.labels = labels;
    charts.mainBar.data.datasets[0].data = dataE;
    charts.mainBar.data.datasets[1].data = dataH;
    charts.mainBar.data.datasets[2].data = dataL;
    
    // DIRECTOR'S CUT OVERLAY (Line Dataset)
    if (snapshotData) {
        if (!charts.mainBar.data.datasets[3]) {
            charts.mainBar.data.datasets.push({
                label: "Saved Plan",
                type: 'line',
                data: snapshotData,
                borderColor: palette.dusk,
                borderDash: [5, 5],
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            });
        } else {
            charts.mainBar.data.datasets[3].data = snapshotData;
        }
    } else if (charts.mainBar.data.datasets[3]) {
        charts.mainBar.data.datasets.pop();
    }
    
    if (exhaustionAge !== -1 && exhaustionAge <= 90) {
        charts.mainBar.options.plugins.annotation.annotations.emptyLine.value = (exhaustionAge - state.age);
        charts.mainBar.options.plugins.annotation.annotations.emptyLine.display = true;
    } else {
        charts.mainBar.options.plugins.annotation.annotations.emptyLine.display = false;
    }
    charts.mainBar.update();
}

function createBarChart(ctxId, displayLegend) {
    const ctx = document.getElementById(ctxId).getContext('2d');
    return new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Core', backgroundColor: palette.sage, data: [] }, { label: 'Home', backgroundColor: palette.dusk, data: [] }, { label: 'Lifestyle', backgroundColor: palette.orange, data: [] }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } } }, 
            plugins: { 
                legend: { display: displayLegend, position: 'bottom', labels: { boxWidth: 12, font: { family: 'Space Grotesk'} } },
                datalabels: { display: false },
                tooltip: { backgroundColor: palette.espresso, titleFont: { family: 'Space Grotesk', size: 13 }, bodyFont: { family: 'Space Grotesk', size: 12 }, padding: 12 },
                annotation: { annotations: { emptyLine: { type: 'line', scaleID: 'x', value: 0, borderColor: palette.orange, borderWidth: 2, borderDash: [5, 5], display: false, label: { display: true, content: 'Pot Empty', position: 'start', backgroundColor: palette.orange, color: '#fff', font: { family: 'Space Grotesk', size: 11 } } } } }
            } 
        }
    });
}

function setupCharts() {
    const ctxPolar = document.getElementById('polarChart').getContext('2d');
    charts.polar = new Chart(ctxPolar, {
        type: 'polarArea',
        data: { labels: ['Core', 'Home', 'Lifestyle'], datasets: [{ data: [50, 50, 50], backgroundColor: [palette.sage, palette.dusk, palette.orange], borderColor: [palette.sage, palette.dusk, palette.orange], borderWidth: 1 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, layout: { padding: 0 },
            scales: { r: { min: -20, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.1)' } } },
            plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { color: '#F9F8F6', font: { family: 'Space Grotesk', weight: '600', size: 10 }, textAlign: 'center', formatter: function(value, context) { return context.chart.data.labels[context.dataIndex]; } } } 
        }
    });
    charts.mainBar = createBarChart('mainStackedChart', true);
}
