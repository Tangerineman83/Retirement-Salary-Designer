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
let charts = { polar: null, mainBar: null, p1: null, p2: null, p3: null }; 

const palette = {
    sage: '#A3C6C4', sageFaded: 'rgba(163, 198, 196, 0.1)',
    dusk: '#6B7A8F', duskFaded: 'rgba(107, 122, 143, 0.1)', 
    orange: '#FF5A36', orangeFaded: 'rgba(255, 90, 54, 0.1)',
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

function toggleSection(bodyId, headerElement) {
    const body = document.getElementById(bodyId);
    body.classList.toggle('collapsed');
    headerElement.classList.toggle('collapsed');
}

function triggerPulse(elementId) {
    const el = document.getElementById(elementId);
    if(el) {
        el.classList.remove('value-updated');
        void el.offsetWidth; 
        el.classList.add('value-updated');
    }
}

function updatePostcodeReadout() {
    const pcInput = document.getElementById('meas-postcode').value.trim();
    const hint = document.getElementById('postcode-hint');
    state.postcode = pcInput;
    
    const alphaMatch = pcInput.match(/^[A-Z]+/i);
    
    if (alphaMatch && locationBenchmarks) {
        document.getElementById('main-journey-flow').classList.add('revealed-flow');
        document.getElementById('main-journey-flow').classList.remove('hidden-flow');

        const areaCode = alphaMatch[0].toUpperCase();
        const districtData = locationBenchmarks.districts[areaCode];
        const natAvg = locationBenchmarks.metadata.national_average;
        
        if (districtData) {
            const localAvg = districtData.avg_disposable_income;
            hint.innerHTML = `Est. local income (${districtData.region}): <br><strong>£${localAvg.toLocaleString()}</strong> (UK Avg: £${natAvg.toLocaleString()})`;
            
            const avgPropPrice = localAvg * 8.5; 
            let impliedTenure = 'owner';
            if (state.age < 55) impliedTenure = 'mortgage';
            else if (districtData.imd_decile <= 4) impliedTenure = 'rent';

            state.tenure = impliedTenure;
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.toggle-btn[data-tenure="${impliedTenure}"]`).classList.add('active');

            const displayReadout = document.getElementById('p2-tenure-display');
            displayReadout.innerHTML = `<strong>Curated for you:</strong> Based on <strong>${districtData.region}</strong> and your age, people like you typically <strong>${impliedTenure === 'owner' ? 'own their home outright' : impliedTenure === 'mortgage' ? 'own with a mortgage' : 'rent'}</strong>. The average property price in this area is estimated at <strong>£${Math.round(avgPropPrice).toLocaleString()}</strong>. We've styled your Home baseline using this data.`;

            state.essentials = districtData.slider_positions.core;
            state.home = districtData.slider_positions.home;
            state.living = districtData.slider_positions.lifestyle;
            
            document.getElementById('slider-essentials').value = state.essentials;
            document.getElementById('slider-home').value = state.home;
            document.getElementById('slider-living').value = state.living;
            
            handleTenureUI(false); 
            calculateAll(); 

        } else {
            hint.innerHTML = `Area not mapped. Using UK Avg: <br><strong>£${natAvg.toLocaleString()}</strong>`;
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
            if (val > -1 && val < 5) val = 0;
            if (val > 46 && val < 54) val = 50;
            if (val > 95 && val <= 100) val = 100;
            slider.value = val;
            state[pillar] = val;
            calculateAll();
            triggerPulse(`val-${pillar}`); 
        });
    });

    document.getElementById('toggle-travel').addEventListener('change', calculateAll);
    document.getElementById('toggle-care').addEventListener('change', calculateAll);
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
        if(updateText) displayReadout.innerHTML = `<strong>Manual Update:</strong> You own your home outright. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `<strong>Manual Update:</strong> You have a mortgage. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = state.mortgagePmt || '';
    } else {
        rentInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `<strong>Manual Update:</strong> You are renting. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = state.rentPmt || '';
    }
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

    ['essentials', 'home', 'living'].forEach(p => {
        document.getElementById(`val-${p}`).innerText = `£${Math.round(currentValues[p]).toLocaleString()}`;
    });
    
    document.getElementById('display-salary').innerText = `£${Math.round(gross).toLocaleString()}`;
    triggerPulse('display-salary');
    document.getElementById('display-net').innerText = `£${Math.round(currentValues.net).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+£${Math.round(tax).toLocaleString()}`;

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

    // NO INFLATION: State pension remains strictly in today's terms
    const spAge = 67; 
    const spBase = rldConfig.assumptions.statePension || 11973; // Based on 25/26 figures
    const projectedSp = spBase; 

    document.getElementById('sp-amount-val').innerText = `£${Math.round(projectedSp).toLocaleString()}`;
    document.getElementById('sp-age-val').innerText = spAge;

    let incSP = projectedSp;
    let incDB = state.dbPension;
    let combinedPots = state.pensionPot + state.otherSavings;
    let incPots = combinedPots * 0.06; 

    let walletTarget = null;
    let showDb = false;
    let showPots = false;
    
    const coreCost = currentValues.essentials;
    const homeCost = currentValues.home;
    const livingCost = currentValues.living;
    
    let coreMsg = '';
    
    if (incSP >= coreCost) {
        coreMsg = `Your State Pension of <strong>£${Math.round(incSP).toLocaleString()}</strong> fully covers your <strong>£${Math.round(coreCost).toLocaleString()}</strong> Core needs.`;
        incSP -= coreCost;
        document.getElementById('partner-annuity').classList.add('hidden');
    } else {
        coreMsg = `Your State Pension falls short of your Core needs by <strong>£${Math.round(coreCost - incSP).toLocaleString()}</strong>.`;
        let shortfall = coreCost - incSP;
        incSP = 0;
        
        walletTarget = walletTarget || 'core-wallet-slot';
        showDb = true;

        if (incDB >= shortfall) {
            coreMsg += `<br><br>Your DB Pension bridges the gap perfectly.`;
            incDB -= shortfall;
            document.getElementById('partner-annuity').classList.add('hidden');
        } else {
            shortfall -= incDB;
            incDB = 0;
            showPots = true;
            
            if (incPots >= shortfall) {
                coreMsg += `<br><br>Your savings drawdown successfully covers the remaining gap.`;
                incPots -= shortfall;
                document.getElementById('partner-annuity').classList.add('hidden');
            } else {
                coreMsg += `<br><br><strong>Action:</strong> You still have a critical shortfall. Consider securing an annuity.`;
                incPots = 0;
                document.getElementById('partner-annuity').classList.remove('hidden');
            }
        }
    }
    document.getElementById('tips-p1-text').innerHTML = coreMsg;

    let homeMsg = '';
    let availableReg = incSP + incDB; 
    
    if (availableReg >= homeCost) {
        homeMsg = `Your remaining regular income fully covers your Home costs.`;
        availableReg -= homeCost;
        document.getElementById('partner-portfolio').classList.add('hidden');
    } else {
        let homeShortfall = homeCost - availableReg;
        availableReg = 0;
        homeMsg = `Your remaining regular income leaves a gap of <strong>£${Math.round(homeShortfall).toLocaleString()}</strong> for your Home costs.`;
        
        walletTarget = walletTarget || 'home-wallet-slot';
        showDb = true; showPots = true;

        if (incPots >= homeShortfall) {
            homeMsg += `<br><br>Your savings drawdown covers this. Since you are drawing heavily from savings, an income-generating portfolio could protect your capital.`;
            incPots -= homeShortfall;
            document.getElementById('partner-portfolio').classList.remove('hidden');
        } else {
            homeMsg += `<br><br>Even with your savings withdrawal, you have a shortfall here.`;
            incPots = 0;
            document.getElementById('partner-portfolio').classList.remove('hidden');
        }
    }
    document.getElementById('tips-p2-text').innerHTML = homeMsg;

    let livingMsg = '';
    let totalRemaining = availableReg + incPots;
    
    if (totalRemaining >= livingCost) {
        livingMsg = `You have sufficient wealth to fully fund your desired Lifestyle!`;
        document.getElementById('surplus-block').classList.remove('hidden');
        document.getElementById('surplus-amount').innerText = `£${Math.round(totalRemaining - livingCost).toLocaleString()}`;
    } else {
        livingMsg = `Your preferred Lifestyle exceeds your available resources by <strong>£${Math.round(livingCost - totalRemaining).toLocaleString()}</strong>. <br><br>Consider reshaping your timeline above (e.g., tapering travel) to make your capital stretch further.`;
        walletTarget = walletTarget || 'lifestyle-wallet-slot';
        showDb = true; showPots = true;
        document.getElementById('surplus-block').classList.add('hidden');
    }
    document.getElementById('tips-p3-text').innerHTML = livingMsg;

    const wallet = document.getElementById('wealth-wallet');
    if (walletTarget && !wallet.classList.contains('placed')) {
        document.getElementById(walletTarget).appendChild(wallet);
        wallet.classList.add('placed');
        wallet.classList.remove('hidden');
    } else if (!walletTarget) {
        document.getElementById('lifestyle-wallet-slot').appendChild(wallet);
        wallet.classList.remove('hidden'); 
        showDb = true; showPots = true;
    }
    
    if (showDb) document.getElementById('db-box').classList.remove('hidden');
    if (showPots) document.getElementById('pots-box').classList.remove('hidden');

    const equityCard = document.getElementById('partner-equity');
    const healthCard = document.getElementById('partner-health');

    if (state.tenure === 'owner' || state.tenure === 'mortgage') equityCard.classList.remove('hidden');
    else equityCard.classList.add('hidden');

    if (state.living >= 50 || document.getElementById('toggle-care').checked) healthCard.classList.remove('hidden');
    else healthCard.classList.add('hidden');

    let runningPot = combinedPots;
    let exhaustionAge = -1;

    for (let age = state.age; age <= endAge; age++) {
        labels.push(age);
        
        let eSum = 0; let hSum = 0; let lSum = 0;

        for (const [key, data] of Object.entries(categoryData)) {
            const pillar = key.split('_')[0];
            const cat = key.split('_')[1];

            // NO INFLATION (Today's Terms mapping ensures accurate math against flat drawdown)
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
            if (runningPot <= 0 && exhaustionAge === -1 && combinedPots > 0) {
                exhaustionAge = age;
            }
        }

        dataE.push(eSum);
        dataH.push(hSum);
        dataL.push(lSum);
    }

    if (exhaustionAge !== -1 && exhaustionAge <= 90) {
        document.getElementById('tips-p3-text').innerHTML += `<br><br><strong style="color:var(--accent-orange);">End of Credits Warning:</strong> Based on this shape, your wealth pots will fully deplete by <strong>Age ${exhaustionAge}</strong>.`;
        if(state.tenure === 'owner' || state.tenure === 'mortgage') equityCard.classList.add('pulse-alert');
    } else {
        equityCard.classList.remove('pulse-alert');
    }

    charts.mainBar.data.labels = labels;
    charts.mainBar.data.datasets[0].data = dataE;
    charts.mainBar.data.datasets[1].data = dataH;
    charts.mainBar.data.datasets[2].data = dataL;
    
    if (exhaustionAge !== -1 && exhaustionAge <= 90) {
        charts.mainBar.options.plugins.annotation.annotations.emptyLine.value = (exhaustionAge - state.age);
        charts.mainBar.options.plugins.annotation.annotations.emptyLine.display = true;
    } else {
        charts.mainBar.options.plugins.annotation.annotations.emptyLine.display = false;
    }
    charts.mainBar.update();

    charts.p1.data.labels = labels;
    charts.p1.data.datasets[0] = { label: 'Core', backgroundColor: palette.sage, data: dataE };
    charts.p1.data.datasets[1] = { label: 'Home', backgroundColor: palette.duskFaded, data: dataH };
    charts.p1.data.datasets[2] = { label: 'Lifestyle', backgroundColor: palette.orangeFaded, data: dataL };
    charts.p1.update();

    charts.p2.data.labels = labels;
    charts.p2.data.datasets[0] = { label: 'Core', backgroundColor: palette.sageFaded, data: dataE };
    charts.p2.data.datasets[1] = { label: 'Home', backgroundColor: palette.dusk, data: dataH };
    charts.p2.data.datasets[2] = { label: 'Lifestyle', backgroundColor: palette.orangeFaded, data: dataL };
    charts.p2.update();

    charts.p3.data.labels = labels;
    charts.p3.data.datasets[0] = { label: 'Core', backgroundColor: palette.sageFaded, data: dataE };
    charts.p3.data.datasets[1] = { label: 'Home', backgroundColor: palette.duskFaded, data: dataH };
    charts.p3.data.datasets[2] = { label: 'Lifestyle', backgroundColor: palette.orange, data: dataL };
    charts.p3.update();
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
                tooltip: { backgroundColor: palette.espresso, titleFont: { family: 'Space Grotesk', size: 13 }, bodyFont: { family: 'Space Grotesk', size: 12 }, padding: 12, callbacks: { label: function(context) { return ` ${context.dataset.label}: £${Math.round(context.raw).toLocaleString()}`; } } },
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
    charts.p1 = createBarChart('chart-p1', false);
    charts.p2 = createBarChart('chart-p2', false);
    charts.p3 = createBarChart('chart-p3', false);
}
