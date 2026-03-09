Chart.register(ChartDataLabels);

let rldConfig = null;
let state = { 
    age: 67,
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
let charts = { polar: null, spline: null }; 

const palette = {
    sage: '#A3C6C4',
    sageFill: 'rgba(163, 198, 196, 0.4)',
    stone: '#E8E6E1',
    stoneFill: 'rgba(232, 230, 225, 0.6)',
    orange: '#FF5A36',
    orangeFill: 'rgba(255, 90, 54, 0.4)',
    espresso: '#2B2625'
};

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
    handleTenureUI();
    calculateAll();
}

function setupListeners() {
    // Measurements Inputs
    document.getElementById('meas-age').addEventListener('change', (e) => { state.age = parseInt(e.target.value) || 67; calculateAll(); });
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

    // Tenure Toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tenure = e.target.dataset.tenure;
            handleTenureUI();
            calculateAll();
        });
    });

    // Active Sliders (Living is disabled so it doesn't need an event listener)
    ['essentials', 'home'].forEach(pillar => {
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

    const tooltip = document.getElementById('smart-tooltip');
    let tooltipTimeout;
    const hideTooltip = () => tooltip.classList.remove('show');

    // Input Tooltips
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

    // Label Tooltips
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
        displayReadout.innerHTML = `Your structure is mapped as a <strong>Homeowner (Outright)</strong> based on your measurements.`;
        shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs.classList.remove('hidden');
        displayReadout.innerHTML = `Your structure is mapped as a <strong>Homeowner (Mortgage)</strong> based on your measurements.`;
        shelterInput.value = state.mortgagePmt || '';
    } else {
        rentInputs.classList.remove('hidden');
        displayReadout.innerHTML = `Your structure is mapped as a <strong>Renter</strong> based on your measurements.`;
        shelterInput.value = state.rentPmt || '';
    }
}

function togglePersonalize(id) {
    const panel = document.getElementById(`pers-${id}`);
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function extrapolate(pillar) {
    // Note: Extrapolation only applies to manual inputs. Since Living is auto-calculated, we only care about Essentials/Home.
    if (pillar === 'living') return; 

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
    state[pillar] = Math.round(totalSliderScore / inputCount);
    document.getElementById(`slider-${pillar}`).value = state[pillar];
    calculateAll();
}

function calculateAll() {
    currentValues.essentials = 0; currentValues.home = 0; currentValues.living = 0;
    
    // 1. Calculate P1 & P2 directly from sliders/inputs
    for (const pillar of ['essentials', 'home']) {
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

    // 2. Waterfall Logic for Auto-populating Pillar III (Living)
    const assumptionSP = rldConfig.assumptions.statePension;
    const assumptionDR = rldConfig.assumptions.drawdownRate;
    
    const totalRegIncome = assumptionSP + state.dbPension;
    const drawdownIncome = (state.pensionPot + state.otherSavings) * assumptionDR;
    const totalAvailableIncome = totalRegIncome + drawdownIncome;
    
    const remainingForLiving = Math.max(0, totalAvailableIncome - currentValues.essentials - currentValues.home);

    // Get Living Benchmarks to reverse-calculate the score
    let lStaples = 0, lSig = 0, lDes = 0;
    for (const [key, catData] of Object.entries(rldConfig.benchmarks.living)) {
        lStaples += catData.staples;
        lSig += catData.signature;
        lDes += catData.designer;
    }

    let livingScore = 0;
    if (remainingForLiving <= lStaples) {
        livingScore = 0;
    } else if (remainingForLiving >= lDes) {
        livingScore = 100;
    } else if (remainingForLiving <= lSig) {
        livingScore = ((remainingForLiving - lStaples) / (lSig - lStaples)) * 50;
    } else {
        livingScore = 50 + (((remainingForLiving - lSig) / (lDes - lSig)) * 50);
    }
    
    // Auto-update state and UI slider for P3
    state.living = Math.max(0, Math.min(100, Math.round(livingScore)));
    document.getElementById('slider-living').value = state.living;

    // 3. Calculate Exact Living Value based on auto-populated score
    for (const [key, catData] of Object.entries(rldConfig.benchmarks.living)) {
        let val = 0;
        if (state.living <= 50) val = catData.staples + ((catData.signature - catData.staples) * (state.living / 50));
        else val = catData.signature + ((catData.designer - catData.signature) * ((state.living - 50) / 50));
        
        categoryData[`living_${key}`] = { value: val, shape: catData.shape, inf: catData.inflation };
        currentValues.living += val;
    }

    // 4. Global Tax Tailoring
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

    // Update UI Elements
    ['essentials', 'home', 'living'].forEach(p => {
        document.getElementById(`val-${p}`).innerText = `£${Math.round(currentValues[p]).toLocaleString()}`;
    });
    document.getElementById('display-salary').innerText = `£${Math.round(gross).toLocaleString()}`;
    document.getElementById('display-net').innerText = `£${Math.round(currentValues.net).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+£${Math.round(tax).toLocaleString()}`;

    // Trigger Designer Tips Update
    updateDesignerTips(totalRegIncome, drawdownIncome, remainingForLiving);

    updateCharts();
}

function updateDesignerTips(regIncome, drawdownIncome, remainingLivingBudget) {
    // Pillar 1: Essentials Tip
    const p1Text = document.getElementById('tips-p1-text');
    const annuityCard = document.getElementById('partner-annuity');
    const strRegInc = `£${Math.round(regIncome).toLocaleString()}`;
    const strEss = `£${Math.round(currentValues.essentials).toLocaleString()}`;

    if (regIncome >= currentValues.essentials) {
        p1Text.innerHTML = `Your guaranteed regular income (State + DB Pension) totals <strong>${strRegInc}</strong> annually, which comfortably covers your <strong>${strEss}</strong> Essentials need. This provides a highly secure foundation for your retirement.`;
        annuityCard.classList.add('hidden');
    } else {
        const shortfall = currentValues.essentials - regIncome;
        p1Text.innerHTML = `Your guaranteed regular income totals <strong>${strRegInc}</strong> annually, falling short of your <strong>${strEss}</strong> Essentials need by <strong>£${Math.round(shortfall).toLocaleString()}</strong> per year. <br><br><strong>You may wish to consider</strong> converting a portion of your savings into an annuity to guarantee your baseline and cover this gap.`;
        annuityCard.classList.remove('hidden');
    }

    // Pillar 2: Home Tip
    const p2Text = document.getElementById('tips-p2-text');
    const propertyCard = document.getElementById('partner-property');
    const remainingRegAfterEss = Math.max(0, regIncome - currentValues.essentials);
    
    let p2Prefix = '';
    if (state.tenure === 'mortgage' || state.tenure === 'rent') {
        p2Prefix = `As a ${state.tenure === 'rent' ? 'renter' : 'mortgage holder'}, your Home Style is heavily driven by your actual current payments. `;
    }

    if (remainingRegAfterEss >= currentValues.home && currentValues.home > 0) {
        p2Text.innerHTML = `${p2Prefix}After covering your Essentials, your remaining regular income fully absorbs your Home costs.`;
    } else if (remainingRegAfterEss > 0 && currentValues.home > 0) {
        const homeShortfall = currentValues.home - remainingRegAfterEss;
        const pctCovered = Math.round((remainingRegAfterEss / currentValues.home) * 100);
        p2Text.innerHTML = `${p2Prefix}After meeting Essentials, you have <strong>£${Math.round(remainingRegAfterEss).toLocaleString()}</strong> of regular income left, covering ${pctCovered}% of your Home costs. You will need to draw <strong>£${Math.round(homeShortfall).toLocaleString()}</strong> annually from your pots and savings to cover the balance.`;
    } else {
        p2Text.innerHTML = `${p2Prefix}Since your regular income is fully absorbed by your Essentials, you will need to draw <strong>£${Math.round(currentValues.home).toLocaleString()}</strong> annually from your pots and savings to fund your Home costs.`;
    }

    if (state.tenure === 'owner' || state.tenure === 'mortgage') {
        propertyCard.classList.remove('hidden');
    } else {
        propertyCard.classList.add('hidden');
    }

    // Pillar 3: Living Tip
    const p3Text = document.getElementById('tips-p3-text');
    const strLiv = remainingLivingBudget > 0 ? `£${Math.round(remainingLivingBudget).toLocaleString()}` : '£0';
    
    p3Text.innerHTML = `We have auto-populated your Lifestyle based on your available resources. After funding your Essentials and Home, and assuming a sustainable ${Math.round(rldConfig.assumptions.drawdownRate * 100)}% drawdown from your savings, you have <strong>${strLiv}</strong> annually to fund your Living costs.<br><br><strong>To boost your lifestyle:</strong> Consider delaying retirement to build further capital, reviewing your Home curation, or exploring equity release options.`;
}

function setupCharts() {
    const ctxPolar = document.getElementById('polarChart').getContext('2d');
    charts.polar = new Chart(ctxPolar, {
        type: 'polarArea',
        data: { 
            labels: ['Essentials', 'Home', 'Living'], 
            datasets: [{ 
                data: [50, 50, 50],
                backgroundColor: [palette.sage, palette.stone, palette.orange],
                borderColor: [palette.sage, palette.stone, palette.orange],
                borderWidth: 2
            }] 
        },
        options: { 
            responsive: true,
            layout: { padding: 15 },
            scales: { r: { min: -20, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.03)' } } },
            plugins: { 
                legend: { display: false }, 
                tooltip: { enabled: false }, 
                datalabels: {
                    color: palette.espresso,
                    font: { family: 'Space Grotesk', weight: '600', size: 11 },
                    textAlign: 'center',
                    formatter: function(value, context) {
                        const labelName = context.chart.data.labels[context.dataIndex];
                        let cashVal = 0;
                        if(labelName === 'Essentials') cashVal = currentValues.essentials;
                        if(labelName === 'Home') cashVal = currentValues.home;
                        if(labelName === 'Living') cashVal = currentValues.living;
                        return labelName + '\n£' + Math.round(cashVal).toLocaleString();
                    }
                }
            } 
        }
    });

    const ctxSpline = document.getElementById('splineChart').getContext('2d');
    charts.spline = new Chart(ctxSpline, {
        type: 'line',
        data: { 
            labels: [], 
            datasets: [
                { label: 'Essentials', backgroundColor: palette.sageFill, borderColor: palette.sage, fill: true, tension: 0.4, data: [] },
                { label: 'Home', backgroundColor: palette.stoneFill, borderColor: palette.stone, fill: true, tension: 0.4, data: [] },
                { label: 'Living', backgroundColor: palette.orangeFill, borderColor: palette.orange, fill: true, tension: 0.4, data: [] }
            ] 
        },
        options: { 
            responsive: true, 
            scales: { 
                x: { grid: { display: false } }, 
                y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } } 
            }, 
            plugins: { 
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Space Grotesk'} } },
                datalabels: { display: false },
                tooltip: {
                    backgroundColor: palette.espresso,
                    titleFont: { family: 'Space Grotesk', size: 13 },
                    bodyFont: { family: 'Space Grotesk', size: 12 },
                    padding: 12,
                    callbacks: {
                        label: function(context) { return ` ${context.dataset.label}: £${Math.round(context.raw).toLocaleString()}`; }
                    }
                }
            } 
        }
    });
}

function updateCharts() {
    charts.polar.data.datasets[0].data = [state.essentials, state.home, state.living];
    charts.polar.update();

    const endAge = 90;
    const labels = [];
    const dataE = []; const dataH = []; const dataL = [];

    for (let age = state.age; age <= endAge; age++) {
        labels.push(age);
        const yearsPassed = age - state.age;
        
        let eSum = 0; let hSum = 0; let lSum = 0;

        for (const [key, data] of Object.entries(categoryData)) {
            const pillar = key.split('_')[0];
            const cat = key.split('_')[1];

            let projectedVal = data.value * Math.pow(1 + data.inf, yearsPassed);
            
            if (data.shape === 'taper' && age >= 80) projectedVal *= 0.5; 
            if (data.shape === 'spike' && age >= 80) projectedVal *= 1.5; 
            
            if (pillar === 'home' && cat === 'shelter' && state.tenure === 'mortgage' && age >= state.mortgageEndAge) {
                projectedVal = 0;
            }

            if (pillar === 'essentials') eSum += projectedVal;
            if (pillar === 'home') hSum += projectedVal;
            if (pillar === 'living') lSum += projectedVal;
        }

        dataE.push(eSum);
        dataH.push(hSum);
        dataL.push(lSum);
    }

    charts.spline.data.labels = labels;
    charts.spline.data.datasets[0].data = dataE;
    charts.spline.data.datasets[1].data = dataH;
    charts.spline.data.datasets[2].data = dataL;
    charts.spline.update();
}
