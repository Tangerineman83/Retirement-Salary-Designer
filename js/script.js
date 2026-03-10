Chart.register(ChartDataLabels);
Chart.register(window['chartjs-plugin-annotation']);

let rldConfig = null;
let locationBenchmarks = null; // NEW: Holds ONS Data

let state = { 
    age: 67,
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
        // NEW: Fetch both config and location data simultaneously
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
    handleTenureUI();
    calculateAll();
}

function toggleSection(bodyId, headerElement) {
    const body = document.getElementById(bodyId);
    body.classList.toggle('collapsed');
    headerElement.classList.toggle('collapsed');
}

// NEW: True ONS JSON Lookup Logic
function updatePostcodeReadout() {
    const pcInput = document.getElementById('meas-postcode').value.trim().toUpperCase();
    const hint = document.getElementById('postcode-hint');
    state.postcode = pcInput;
    
    if (pcInput.length >= 2 && locationBenchmarks) {
        // Regex extracts just the District (e.g., turns "SW1A 1AA" into "SW1A")
        const districtMatch = pcInput.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?/);
        const districtCode = districtMatch ? districtMatch[0] : pcInput;
        
        const districtData = locationBenchmarks.districts[districtCode];
        const natAvg = locationBenchmarks.metadata.national_average;
        
        if (districtData) {
            const localAvg = districtData.avg_disposable_income;
            hint.innerHTML = `Est. local income (${districtData.region}): <br><strong>£${localAvg.toLocaleString()}</strong> (UK Avg: <strong>£${natAvg.toLocaleString()}</strong>)`;
            
            // NOTE: districtData.recommended_tier and districtData.adjustments are now available 
            // here in memory to drive auto-play slider adjustments in future iterations.
            
        } else {
            // Fallback for postcodes not in our sample database
            hint.innerHTML = `Area not mapped. Using UK Avg: <br><strong>£${natAvg.toLocaleString()}</strong>`;
        }
    } else {
        hint.innerHTML = '';
    }
}

function setupListeners() {
    document.getElementById('meas-age').addEventListener('change', (e) => { state.age = parseInt(e.target.value) || 67; calculateAll(); });
    
    // Postcode Listener triggers the ONS lookup
    document.getElementById('meas-postcode').addEventListener('input', updatePostcodeReadout);

    document.getElementById('meas-db').addEventListener('input', (e) => { state.dbPension = parseFloat(e.target.value) || 0; calculateAll(); });
    document.getElementById('meas-pots').addEventListener('input', (e) => { state.pensionPot = parseFloat(e.target.value) || 0; calculateAll(); });
    document.getElementById('meas-savings').addEventListener('input', (e) => { state.otherSavings = parseFloat(e.target.value) || 0; calculateAll(); });
    
    document.getElementById('meas-home-value').addEventListener('input', (e) => { state.homeValue = parseFloat(e.target.value) || 0; });
    document.getElementById('meas-home-value-mortgage').addEventListener('input', (e) => { state.homeValue = parseFloat(e.target.value) || 0; });
    
    document.getElementById('meas-mortgage-pmt').addEventListener('input', (e) => { 
        state.mortgagePmt = parseFloat(e.target.value) || 0; 
        document.getElementById('input-shelter').value = state.mortgagePmt || '';
        calculateAll(); 
    });
    
    document.getElementById('meas-rent-pmt').addEventListener('input', (e) => { 
        state.rentPmt = parseFloat(e.target.value) || 0; 
        document.getElementById('input-shelter').value = state.rentPmt || '';
        calculateAll(); 
    });

    document.getElementById('meas-mortgage-age').addEventListener('change', (e) => { state.mortgageEndAge = parseInt(e.target.value) || 75; calculateAll(); });

    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tenure = e.target.dataset.tenure;
            handleTenureUI();
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
        });
    });

    document.getElementById('toggle-travel').addEventListener('change', calculateAll);
    document.getElementById('toggle-care').addEventListener('change', calculateAll);

    const tooltip = document.getElementById('smart-tooltip');
    let tooltipTimeout;
    const hideTooltip = () => tooltip.classList.remove('show');

    document.querySelectorAll('.pers-input').forEach(input => {
        input.addEventListener('input', (e) => extrapolate(e.target.dataset.pillar));
        const showInputTooltip = (e) => {
            clearTimeout(tooltipTimeout);
            if(e.target.disabled || e.target.closest('.hidden')) return;

            const cat = e.target.dataset.cat;
            const pillar = e.target.dataset.pillar;
            const freq = parseInt(e.target.dataset.freq) || parseInt(document.getElementById(`freq-${pillar}`).value);
            
            let b = pillar === 'home' && cat === 'shelter' 
                ? rldConfig.benchmarks.home.shelter[state.tenure] 
                : rldConfig.benchmarks[pillar][cat];

            const name = rldConfig.benchmarks[pillar][cat].name;
            const st = Math.round(b.staples / freq); 
            const si = Math.round(b.signature / freq);
            const de = Math.round(b.designer / freq);

            tooltip.innerHTML = `<span class="tt-title">${name}</span>Staples: £${st} | Signature: £${si} | Designer: £${de}`;
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = `${rect.left + (rect.width / 2) + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - 15}px`;
            tooltip.classList.add('show');
        };
        input.addEventListener('mouseenter', showInputTooltip);
        input.addEventListener('focus', showInputTooltip);
        input.addEventListener('mouseleave', hideTooltip);
        input.addEventListener('blur', hideTooltip);
    });

    document.querySelectorAll('.tt-trigger').forEach(label => {
        const showLabelTooltip = (e) => {
            clearTimeout(tooltipTimeout);
            const desc = e.currentTarget.dataset.desc;
            tooltip.innerHTML = `<span style="color:var(--bg-oatmilk); font-family:'Space Grotesk', sans-serif; font-weight:300;">${desc}</span>`;
            const rect = e.currentTarget.getBoundingClientRect();
            tooltip.style.left = `${rect.left + (rect.width / 2) + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - 15}px`;
            tooltip.classList.add('show');
        };
        label.addEventListener('mouseenter', showLabelTooltip);
        label.addEventListener('touchstart', showLabelTooltip, {passive: true});
        label.addEventListener('mouseleave', hideTooltip);
        label.addEventListener('touchend', () => tooltipTimeout = setTimeout(hideTooltip, 2500));
    });
}

function handleTenureUI() {
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
        displayReadout.innerHTML = `<strong>Curated for you:</strong> You own your home outright. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs.classList.remove('hidden');
        displayReadout.innerHTML = `<strong>Curated for you:</strong> You have a mortgage. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = state.mortgagePmt || '';
    } else {
        rentInputs.classList.remove('hidden');
        displayReadout.innerHTML = `<strong>Curated for you:</strong> You are renting. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = state.rentPmt || '';
    }
}

function togglePersonalize(id) {
    const panel = document.getElementById(`pers-${id}`);
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function extrapolate(pillar) {
    const defaultFreq = parseInt(document.getElementById(`freq-${pillar}`).value);
    const inputs = document.querySelectorAll(`.pers-input[data-pillar="${pillar}"]`);
    
    let totalSliderScore = 0;
    let inputCount = 0;

    inputs.forEach(input => {
        if (!input.disabled && !input.closest('.hidden') && input.value && parseFloat(input.value) > 0) {
            const cat = input.dataset.cat;
            const freq = parseInt(input.dataset.freq) || defaultFreq;
            let b = (pillar === 'home' && cat === 'shelter') ? rldConfig.benchmarks.home.shelter[state.tenure] : rldConfig.benchmarks[pillar][cat];
            
            const annualVal = parseFloat(input.value) * freq;
            let score = 50;
            if (b.staples === b.designer) score = 50; 
            else if (annualVal <= b.staples) score = 0;
            else if (annualVal >= b.designer) score = 100;
            else if (annualVal <= b.signature) {
                score = ((annualVal - b.staples) / (b.signature - b.staples)) * 50;
            } else {
                score = 50 + (((annualVal - b.signature) / (b.designer - b.signature)) * 50);
            }
            totalSliderScore += score;
            inputCount++;
        }
    });

    if (inputCount === 0) return;
    state[pillar] = Math.round(totalSliderScore / inputCount);
    document.getElementById(`slider-${pillar}`).value = state[pillar];
    calculateAll();
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

function createBarChart(ctxId, displayLegend) {
    const ctx = document.getElementById(ctxId).getContext('2d');
    return new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: [], 
            datasets: [
                { label: 'Core', backgroundColor: palette.sage, data: [] },
                { label: 'Home', backgroundColor: palette.dusk, data: [] },
                { label: 'Lifestyle', backgroundColor: palette.orange, data: [] }
            ] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { 
                x: { stacked: true, grid: { display: false } }, 
                y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } } 
            }, 
            plugins: { 
                legend: { display: displayLegend, position: 'bottom', labels: { boxWidth: 12, font: { family: 'Space Grotesk'} } },
                datalabels: { display: false },
                tooltip: {
                    backgroundColor: palette.espresso, titleFont: { family: 'Space Grotesk', size: 13 }, bodyFont: { family: 'Space Grotesk', size: 12 }, padding: 12,
                    callbacks: { label: function(context) { return ` ${context.dataset.label}: £${Math.round(context.raw).toLocaleString()}`; } }
                },
                annotation: {
                    annotations: {
                        emptyLine: {
                            type: 'line', scaleID: 'x', value: 0, borderColor: palette.orange, borderWidth: 2, borderDash: [5, 5], display: false,
                            label: { display: true, content: 'Pot Empty', position: 'start', backgroundColor: palette.orange, color: '#fff', font: { family: 'Space Grotesk', size: 11 } }
                        }
                    }
                }
            } 
        }
    });
}

function setupCharts() {
    const ctxPolar = document.getElementById('polarChart').getContext('2d');
    charts.polar = new Chart(ctxPolar, {
        type: 'polarArea',
        data: { 
            labels: ['Core', 'Home', 'Lifestyle'], 
            datasets: [{ 
                data: [50, 50, 50],
                backgroundColor: [palette.sage, palette.dusk, palette.orange],
                borderColor: [palette.sage, palette.dusk, palette.orange],
                borderWidth: 1
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { padding: 0 },
            scales: { r: { min: -20, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.1)' } } },
            plugins: { 
                legend: { display: false }, tooltip: { enabled: false }, 
                datalabels: {
                    color: '#F9F8F6', font: { family: 'Space Grotesk', weight: '600', size: 10 }, textAlign: 'center',
                    formatter: function(value, context) { return context.chart.data.labels[context.dataIndex]; }
                }
            } 
        }
    });

    charts.mainBar = createBarChart('mainStackedChart', true);
    charts.p1 = createBarChart('chart-p1', false);
    charts.p2 = createBarChart('chart-p2', false);
    charts.p3 = createBarChart('chart-p3', false);
}

function updateCharts() {
    charts.polar.data.datasets[0].data = [state.essentials, state.home, state.living];
    charts.polar.update();

    const endAge = 95;
    const labels = [];
    const dataE = []; const dataH = []; const dataL = [];
    
    const doTravelTaper = document.getElementById('toggle-travel').checked;
    const doCareSpike = document.getElementById('toggle-care').checked;

    let runningPot = state.pensionPot + state.otherSavings;
    const regIncome = rldConfig.assumptions.statePension + state.dbPension;
    let exhaustionAge = -1;

    for (let age = state.age; age <= endAge; age++) {
        labels.push(age);
        const yearsPassed = age - state.age;
        
        let eSum = 0; let hSum = 0; let lSum = 0;

        for (const [key, data] of Object.entries(categoryData)) {
            const pillar = key.split('_')[0];
            const cat = key.split('_')[1];

            let projectedVal = data.value * Math.pow(1 + data.inf, yearsPassed);
            
            if (pillar === 'living') {
                if (data.shape === 'taper' && age >= 75 && doTravelTaper) projectedVal *= 0.5; 
                if (data.shape === 'spike' && age >= 80 && doCareSpike) projectedVal *= 3.0; 
            }
            
            if (pillar === 'home' && cat === 'shelter' && state.tenure === 'mortgage' && age >= state.mortgageEndAge) {
                projectedVal = 0;
            }

            if (pillar === 'essentials') eSum += projectedVal;
            if (pillar === 'home') hSum += projectedVal;
            if (pillar === 'living') lSum += projectedVal;
        }

        const totalNetNeed = eSum + hSum + lSum;
        const shortfall = totalNetNeed - regIncome;
        
        if (shortfall > 0) {
            let grossShortfall = shortfall;
            const pa = rldConfig.tax.personalAllowance;
            if (totalNetNeed > pa) grossShortfall = shortfall / (1 - rldConfig.tax.basicRate); 
            
            runningPot -= grossShortfall;
            if (runningPot <= 0 && exhaustionAge === -1 && (state.pensionPot + state.otherSavings) > 0) {
                exhaustionAge = age;
            }
        }

        dataE.push(eSum);
        dataH.push(hSum);
        dataL.push(lSum);
    }

    updateDesignerTips(exhaustionAge);

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

    // Local P1 Focus 
    charts.p1.data.labels = labels;
    charts.p1.data.datasets[0] = { label: 'Core', backgroundColor: palette.sage, data: dataE };
    charts.p1.data.datasets[1] = { label: 'Home', backgroundColor: palette.duskFaded, data: dataH };
    charts.p1.data.datasets[2] = { label: 'Lifestyle', backgroundColor: palette.orangeFaded, data: dataL };
    charts.p1.update();

    // Local P2 Focus 
    charts.p2.data.labels = labels;
    charts.p2.data.datasets[0] = { label: 'Core', backgroundColor: palette.sageFaded, data: dataE };
    charts.p2.data.datasets[1] = { label: 'Home', backgroundColor: palette.dusk, data: dataH };
    charts.p2.data.datasets[2] = { label: 'Lifestyle', backgroundColor: palette.orangeFaded, data: dataL };
    charts.p2.update();

    // Local P3 Focus 
    charts.p3.data.labels = labels;
    charts.p3.data.datasets[0] = { label: 'Core', backgroundColor: palette.sageFaded, data: dataE };
    charts.p3.data.datasets[1] = { label: 'Home', backgroundColor: palette.duskFaded, data: dataH };
    charts.p3.data.datasets[2] = { label: 'Lifestyle', backgroundColor: palette.orange, data: dataL };
    charts.p3.update();
}

function updateDesignerTips(exhaustionAge) {
    const regIncome = rldConfig.assumptions.statePension + state.dbPension;
    
    // Pillar 1: Core Tip
    const p1Text = document.getElementById('tips-p1-text');
    const annuityCard = document.getElementById('partner-annuity');
    if (regIncome >= currentValues.essentials) {
        p1Text.innerHTML = `Your guaranteed regular income (State + DB Pension) totals <strong>£${Math.round(regIncome).toLocaleString()}</strong> annually, which comfortably covers your <strong>£${Math.round(currentValues.essentials).toLocaleString()}</strong> Core needs. This provides a highly secure foundation.`;
        annuityCard.classList.add('hidden');
    } else {
        const shortfall = currentValues.essentials - regIncome;
        p1Text.innerHTML = `Your guaranteed regular income falls short of your Core need by <strong>£${Math.round(shortfall).toLocaleString()}</strong> per year. <br><br><strong>Action to consider:</strong> Convert a portion of your savings into an annuity to guarantee your baseline and cover this gap.`;
        annuityCard.classList.remove('hidden');
    }

    // Pillar 2: Home Tip
    const p2Text = document.getElementById('tips-p2-text');
    const portfolioCard = document.getElementById('partner-portfolio');
    const remainingRegAfterEss = Math.max(0, regIncome - currentValues.essentials);
    
    if (remainingRegAfterEss >= currentValues.home && currentValues.home > 0) {
        p2Text.innerHTML = `After covering your Core needs, your remaining regular income fully absorbs your Home costs.`;
        portfolioCard.classList.add('hidden');
    } else {
        p2Text.innerHTML = `You will need to draw steadily from your pots and savings to fund your Home costs.`;
        portfolioCard.classList.remove('hidden');
    }

    // Pillar 3: Lifestyle Tip
    const p3Text = document.getElementById('tips-p3-text');
    const equityCard = document.getElementById('partner-equity');
    const healthCard = document.getElementById('partner-health');
    
    if (exhaustionAge !== -1 && exhaustionAge <= 90) {
        p3Text.innerHTML = `<strong>Caution:</strong> Based on your chosen Lifestyle shape, your current wealth pots will deplete by <strong>Age ${exhaustionAge}</strong>. <br><br>By utilizing the toggles above to taper your active spending later in life, you can instantly see how much further your capital stretches.`;
    } else {
        p3Text.innerHTML = `<strong>Sustainable:</strong> Based on your current wealth pots and your chosen chapter transitions, this Lifestyle shape appears financially sustainable past Age 90.`;
    }

    if (state.tenure === 'owner' || state.tenure === 'mortgage') {
        equityCard.classList.remove('hidden');
    } else {
        equityCard.classList.add('hidden');
    }

    if (state.living >= 50 || document.getElementById('toggle-care').checked) {
        healthCard.classList.remove('hidden');
    } else {
        healthCard.classList.add('hidden');
    }
}
