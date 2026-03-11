Chart.register(ChartDataLabels);
Chart.register(window['chartjs-plugin-annotation']);

let rldConfig = null;
let locationBenchmarks = null;

let state = { 
    unlockedStep: 1, 
    age: 60, 
    postcode: '',
    dbPension: 0,
    pensionPot: 0,
    otherSavings: 0,
    revealedAssets: ['db'], 
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

window.revealAsset = function(assetType) {
    if (!state.revealedAssets.includes(assetType)) {
        state.revealedAssets.push(assetType);
        calculateAll();
    }
}

window.advanceStep = function(targetStep) {
    state.unlockedStep = targetStep;
    
    if (targetStep === 2) {
        const homeSection = document.getElementById('pillar-home');
        homeSection.classList.remove('locked-step');
        document.getElementById('body-home').classList.remove('collapsed');
        document.getElementById('step-action-1').classList.add('hidden'); 
        homeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else if (targetStep === 3) {
        const lifeSection = document.getElementById('pillar-living');
        lifeSection.classList.remove('locked-step');
        document.getElementById('body-living').classList.remove('collapsed');
        document.getElementById('step-action-2').classList.add('hidden');
        lifeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    calculateAll();
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
            const pct = Math.round(((localAvg / natAvg) - 1) * 100);
            
            let relText = "";
            if (pct > 0) relText = `is <strong>${pct}% above</strong>`;
            else if (pct < 0) relText = `is <strong>${Math.abs(pct)}% below</strong>`;
            else relText = `<strong>matches</strong>`;

            hint.innerHTML = `Est. local income (${districtData.region}) ${relText} the national average.`;
            
            state.essentials = districtData.slider_positions.core;
            state.home = districtData.slider_positions.home;
            state.living = districtData.slider_positions.lifestyle;
            document.getElementById('slider-essentials').value = state.essentials;
            document.getElementById('slider-home').value = state.home;
            document.getElementById('slider-living').value = state.living;

            let impliedTenure = 'owner';
            if (state.age < 55) impliedTenure = 'mortgage';
            else if (districtData.imd_decile <= 4) impliedTenure = 'rent';

            state.tenure = impliedTenure;
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.toggle-btn[data-tenure="${impliedTenure}"]`).classList.add('active');

            handleTenureUI(false); 
            
            const avgPropPrice = localAvg * 8.5; 
            let propText = "";
            if (impliedTenure === 'owner' || impliedTenure === 'mortgage') {
                propText = ` The average property price in this area is estimated at <strong>£${Math.round(avgPropPrice).toLocaleString()}</strong>.`;
            }
            document.getElementById('p2-tenure-display').innerHTML = `As you live in the <strong>${districtData.region}</strong> area and based on your age, people like you typically <strong>${impliedTenure === 'owner' ? 'own their home outright' : impliedTenure === 'mortgage' ? 'own with a mortgage' : 'rent'}</strong>.${propText} We've styled your Home baseline using this data.`;
            
            calculateAll(); 

        } else {
            hint.innerHTML = `Area not mapped. We will use the National Average.`;
            calculateAll();
        }
    } else {
        hint.innerHTML = '';
    }
}

function setupListeners() {
    document.getElementById('meas-age').addEventListener('change', (e) => { 
        state.age = parseInt(e.target.value) || 60; 
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
            
            if(pillar === 'home') handleTenureUI(false);
            
            calculateAll();
            triggerPulse(`val-${pillar}`); 
        });
    });

    document.getElementById('toggle-travel').addEventListener('change', calculateAll);
    document.getElementById('toggle-care').addEventListener('change', calculateAll);

    const tooltip = document.getElementById('smart-tooltip');
    let tooltipTimeout;
    const hideTooltip = () => tooltip.classList.remove('show');

    document.querySelectorAll('.pers-input').forEach(input => {
        input.addEventListener('input', (e) => window.extrapolate(e.target.dataset.pillar));
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

    let bRent = rldConfig.benchmarks.home.shelter.rent;
    let impliedRentAnnual = (state.home <= 50) ? (bRent.staples + ((bRent.signature - bRent.staples) * (state.home / 50))) : (bRent.signature + ((bRent.designer - bRent.signature) * ((state.home - 50) / 50)));
    
    let bMort = rldConfig.benchmarks.home.shelter.mortgage;
    let impliedMortAnnual = (state.home <= 50) ? (bMort.staples + ((bMort.signature - bMort.staples) * (state.home / 50))) : (bMort.signature + ((bMort.designer - bMort.signature) * ((state.home - 50) / 50)));

    if (state.tenure === 'owner') {
        ownerInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You own your home outright. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You have a mortgage. We've populated a default monthly payment based on your slider, but you can adjust it below.`;
        if(!state.mortgagePmt) state.mortgagePmt = Math.round(impliedMortAnnual / 12);
        document.getElementById('meas-mortgage-pmt').value = state.mortgagePmt;
        shelterInput.value = state.mortgagePmt;
    } else {
        rentInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You are renting. We've populated a default monthly rent based on your slider, but you can adjust it below.`;
        if(!state.rentPmt) state.rentPmt = Math.round(impliedRentAnnual / 12);
        document.getElementById('meas-rent-pmt').value = state.rentPmt;
        shelterInput.value = state.rentPmt;
    }
}

window.extrapolate = function(pillar) {
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
                else if (state.tenure === 'mortgage') val = (state.mortgagePmt || 0) * 12;
                else if (state.tenure === 'rent') val = (state.rentPmt || 0) * 12;
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
    
    const pa = rldConfig?.tax?.personalAllowance ?? 12570;
    const basicRate = rldConfig?.tax?.basicRate ?? 0.20;
    const higherThresh = rldConfig?.tax?.higherRateThreshold ?? 50270;
    const higherRate = rldConfig?.tax?.higherRate ?? 0.40;

    if (gross > pa) {
        if (gross <= higherThresh) { tax = (gross - pa) * basicRate; } 
        else { tax = ((higherThresh - pa) * basicRate) + ((gross - higherThresh) * higherRate); }
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

    const spAge = 67; 
    const spBase = rldConfig?.assumptions?.statePension ?? 11973; 
    const projectedSp = spBase; 
    const drawdownRate = rldConfig?.assumptions?.drawdownRate ?? 0.05; 

    // CALCULATE NET GAPS PROGRESSIVELY
    let nSp = projectedSp;
    let nDb = state.dbPension;
    let potsTotal = state.pensionPot + state.otherSavings;
    let nPots = potsTotal * drawdownRate;

    // -- CORE CALC --
    let cCost = currentValues.essentials;
    let cSpUsed = Math.min(cCost, nSp); nSp -= cSpUsed; cCost -= cSpUsed;
    let cDbUsed = Math.min(cCost, nDb); nDb -= cDbUsed; cCost -= cDbUsed;
    let cPotsUsed = Math.min(cCost, nPots); nPots -= cPotsUsed; cCost -= cPotsUsed;

    // -- HOME CALC --
    let hCost = 0; let hSpUsed = 0; let hDbUsed = 0; let hPotsUsed = 0;
    if (state.unlockedStep >= 2) {
        hCost = currentValues.home;
        hSpUsed = Math.min(hCost, nSp); nSp -= hSpUsed; hCost -= hSpUsed;
        hDbUsed = Math.min(hCost, nDb); nDb -= hDbUsed; hCost -= hDbUsed;
        hPotsUsed = Math.min(hCost, nPots); nPots -= hPotsUsed; hCost -= hPotsUsed;
    }

    // -- LIFESTYLE CALC --
    let lCost = 0; let lSpUsed = 0; let lDbUsed = 0; let lPotsUsed = 0;
    let preLifeRem = nSp + nDb + nPots; // Total remaining BEFORE lifestyle deduction
    if (state.unlockedStep >= 3) {
        lCost = currentValues.living;
        lSpUsed = Math.min(lCost, nSp); nSp -= lSpUsed; lCost -= lSpUsed;
        lDbUsed = Math.min(lCost, nDb); nDb -= lDbUsed; lCost -= lDbUsed;
        lPotsUsed = Math.min(lCost, nPots); nPots -= lPotsUsed; lCost -= lPotsUsed;
    }

    // -----------------------------------------------------
    // IDENTIFY WHERE THE WALLET SHOULD LIVE
    // -----------------------------------------------------
    let walletTarget = "";
    if (state.unlockedStep === 1 && cCost > 0) walletTarget = 'core-wallet-slot';
    else if (state.unlockedStep === 2 && hCost > 0) walletTarget = 'home-wallet-slot';
    else if (state.unlockedStep === 3 && lCost > 0) walletTarget = 'lifestyle-wallet-slot';

    // -----------------------------------------------------
    // RENDER SUCCESS BANNERS & TEXT PROMPTS
    // -----------------------------------------------------
    
    // 1. CORE
    const corePrompt = document.getElementById('core-text-prompt');
    const coreBanner = document.getElementById('core-success-banner');
    const coreAnnuity = document.getElementById('core-partner-annuity');
    
    if (cCost <= 0) { // Gap Bridged
        corePrompt.classList.add('hidden');
        coreBanner.classList.remove('hidden');
        document.getElementById('core-success-val').innerText = `£${Math.round(currentValues.essentials).toLocaleString()}`;
        
        if (cPotsUsed > 0) {
            document.getElementById('core-success-desc').innerText = "Your State Pension, DB Pension, and Savings securely cover your Core needs.";
            coreAnnuity.classList.remove('hidden');
        } else if (cDbUsed > 0) {
            document.getElementById('core-success-desc').innerText = "Your State Pension and DB Pension fully cover your Core needs.";
            coreAnnuity.classList.add('hidden');
        } else {
            document.getElementById('core-success-desc').innerText = "Your State Pension fully covers your Core needs.";
            coreAnnuity.classList.add('hidden');
        }
    } else { // Shortfall exists
        corePrompt.classList.remove('hidden');
        coreBanner.classList.add('hidden');
        coreAnnuity.classList.add('hidden');
        document.getElementById('tips-p1-text').innerHTML = `Your guaranteed income falls short of your Core needs by <strong>£${Math.round(cCost).toLocaleString()}</strong>. Use the wallet below to bridge the gap.`;
    }

    // 2. HOME
    if (state.unlockedStep >= 2) {
        const homePrompt = document.getElementById('home-text-prompt');
        const homeBanner = document.getElementById('home-success-banner');
        const homePortfolio = document.getElementById('home-partner-portfolio');
        
        if (hCost <= 0 && cCost <= 0) { 
            homePrompt.classList.add('hidden');
            homeBanner.classList.remove('hidden');
            document.getElementById('home-success-val').innerText = `£${Math.round(currentValues.home).toLocaleString()}`;
            
            if (hPotsUsed > 0) {
                document.getElementById('home-success-desc').innerText = "Your savings drawdown bridges your Home costs.";
                homePortfolio.classList.remove('hidden');
            } else if (hDbUsed > 0) {
                document.getElementById('home-success-desc').innerText = "Your DB Pension bridges your Home costs.";
                homePortfolio.classList.add('hidden');
            } else {
                document.getElementById('home-success-desc').innerText = "Your regular income seamlessly covers your Home costs.";
                homePortfolio.classList.add('hidden');
            }
        } else if (hCost > 0) {
            homePrompt.classList.remove('hidden');
            homeBanner.classList.add('hidden');
            homePortfolio.classList.add('hidden');
            document.getElementById('tips-p2-text').innerHTML = `Your income leaves a Home gap of <strong>£${Math.round(hCost).toLocaleString()}</strong>. Use the wallet below to bridge the gap.`;
        }
    }

    // 3. LIFESTYLE
    const equityCard = document.getElementById('partner-equity');
    const healthCard = document.getElementById('partner-health');

    if (state.unlockedStep >= 3) {
        const lifePrompt = document.getElementById('life-text-prompt');
        const lifeBanner = document.getElementById('lifestyle-success-banner');
        
        document.getElementById('tips-p3-intro').innerHTML = `You have a remaining projected income of <strong>£${Math.round(preLifeRem).toLocaleString()}</strong> per year to design your lifestyle.`;

        if (lCost <= 0 && hCost <= 0 && cCost <= 0) {
            lifePrompt.classList.add('hidden');
            lifeBanner.classList.remove('hidden');
            document.getElementById('lifestyle-success-val').innerText = `£${Math.round(currentValues.living).toLocaleString()}`;
            
            if (lPotsUsed > 0) {
                document.getElementById('lifestyle-success-desc').innerText = "Your savings drawdown successfully funds your chosen lifestyle.";
            } else {
                document.getElementById('lifestyle-success-desc').innerText = "Your guaranteed income fully covers your chosen lifestyle.";
            }

            document.getElementById('surplus-block').classList.remove('hidden');
            document.getElementById('surplus-amount').innerText = `£${Math.round(nSp + nDb + nPots).toLocaleString()}`;
        } else if (lCost > 0) {
            lifePrompt.classList.remove('hidden');
            lifeBanner.classList.add('hidden');
            document.getElementById('surplus-block').classList.add('hidden');
            document.getElementById('tips-p3-text').innerHTML = `Your preferred Lifestyle exceeds your resources by <strong>£${Math.round(lCost).toLocaleString()}</strong>. Use the wallet or reshape your timeline above.`;
        }

        if (state.tenure === 'owner' || state.tenure === 'mortgage') equityCard?.classList.remove('hidden');
        else equityCard?.classList.add('hidden');

        if (state.living >= 50 || doCareSpike) healthCard?.classList.remove('hidden');
        else healthCard?.classList.add('hidden');
    }

    // -----------------------------------------------------
    // EXECUTE WEALTH WALLET & SEQUENTIAL ASSET REVEAL
    // -----------------------------------------------------
    const walletEl = document.getElementById('wealth-wallet');
    
    if (walletTarget !== "") {
        let titleGap = (state.unlockedStep === 1) ? cCost : (state.unlockedStep === 2) ? hCost : lCost;
        document.getElementById('wallet-dynamic-title').innerText = `Bridge the Gap: £${Math.round(titleGap).toLocaleString()}`;
        
        if (state.revealedAssets.includes('pots')) {
            document.getElementById('pots-card').classList.remove('hidden');
            document.getElementById('btn-reveal-pots').classList.add('hidden');
            document.getElementById('withdrawal-hint').classList.remove('hidden');
        } else {
            document.getElementById('pots-card').classList.add('hidden');
            document.getElementById('btn-reveal-pots').classList.remove('hidden');
            document.getElementById('withdrawal-hint').classList.add('hidden');
        }

        if (state.revealedAssets.includes('savings')) {
            document.getElementById('savings-card').classList.remove('hidden');
            document.getElementById('btn-reveal-savings').classList.add('hidden');
        } else {
            document.getElementById('savings-card').classList.add('hidden');
            document.getElementById('btn-reveal-savings').classList.remove('hidden');
        }

        if (walletEl.parentElement.id !== walletTarget) {
            document.getElementById(walletTarget).appendChild(walletEl);
        }
        walletEl.classList.remove('hidden');
    } else {
        walletEl.classList.add('hidden');
    }

    // Always show action chevrons so user is never trapped
    if(state.unlockedStep === 1) document.getElementById('step-action-1').classList.remove('hidden');
    if(state.unlockedStep === 2) document.getElementById('step-action-2').classList.remove('hidden');

    // -----------------------------------------------------
    // CHART HORIZON TRAJECTORY
    // -----------------------------------------------------
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
            const pa = rldConfig?.tax?.personalAllowance ?? 12570;
            const basicRate = rldConfig?.tax?.basicRate ?? 0.20;
            
            if (totalNetNeed > pa) grossShortfall = shortfallYearly / (1 - basicRate); 
            
            runningPot -= grossShortfall;
            if (runningPot <= 0 && exhaustionAge === -1 && potsTotal > 0) {
                exhaustionAge = age;
            }
        }

        dataE.push(eSum);
        dataH.push(hSum);
        dataL.push(lSum);
    }

    if (exhaustionAge !== -1 && exhaustionAge <= 90 && state.unlockedStep >= 3) {
        document.getElementById('tips-p3-text').innerHTML += `<br><br><strong style="color:var(--accent-orange);">End of Credits Warning:</strong> Based on this shape, your wealth pots will fully deplete by <strong>Age ${exhaustionAge}</strong>.`;
        if(state.tenure === 'owner' || state.tenure === 'mortgage') equityCard?.classList.add('pulse-alert');
    } else {
        equityCard?.classList.remove('pulse-alert');
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
}
