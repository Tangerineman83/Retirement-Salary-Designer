Chart.register(ChartDataLabels);
Chart.register(window['chartjs-plugin-annotation']);

let rldConfig = null;
let locationBenchmarks = null;

let state = { 
    unlockedStep: 1, 
    age: 60, 
    postcode: '',
    baseHousePrice: 285000, 
    dbPension: 0,
    pensionPot: 0,
    otherSavings: 0,
    revealedAssets: ['db'], 
    walletOpenPillar: null, 
    homeValue: 0,
    mortgagePmt: 0,
    rentPmt: 0,
    manualHomeValue: false, 
    manualMortgagePmt: false, 
    manualRentPmt: false,     
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
    calculateAll(); 
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

window.openWallet = function(pillarNumber) {
    state.walletOpenPillar = pillarNumber;
    calculateAll();
}

window.applyWallet = function() {
    const currentOpen = state.walletOpenPillar;
    state.walletOpenPillar = null; 
    
    if (currentOpen === 1 && state.unlockedStep === 1) window.advanceStep(2);
    else if (currentOpen === 2 && state.unlockedStep === 2) window.advanceStep(3);
    else calculateAll(); 
}

window.advanceStep = function(targetStep) {
    state.unlockedStep = targetStep;
    state.walletOpenPillar = null; 
    
    if (targetStep === 2) {
        const homeSection = document.getElementById('pillar-home');
        if(homeSection) {
            homeSection.classList.remove('locked-step');
            document.getElementById('body-home')?.classList.remove('collapsed');
            document.getElementById('step-action-1')?.classList.add('hidden'); 
            homeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    else if (targetStep === 3) {
        const lifeSection = document.getElementById('pillar-living');
        if(lifeSection) {
            lifeSection.classList.remove('locked-step');
            document.getElementById('body-living')?.classList.remove('collapsed');
            document.getElementById('step-action-2')?.classList.add('hidden');
            lifeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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

function setHTMLSafe(id, htmlString) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = htmlString;
}

function updatePostcodeReadout() {
    const pcInput = document.getElementById('meas-postcode').value.trim();
    const hint = document.getElementById('postcode-hint');
    state.postcode = pcInput;
    
    const alphaMatch = pcInput.match(/^[A-Z]+/i);
    
    if (alphaMatch && locationBenchmarks) {
        document.getElementById('main-journey-flow')?.classList.add('revealed-flow');
        document.getElementById('main-journey-flow')?.classList.remove('hidden-flow');

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

            if(hint) hint.innerHTML = `Est. local income (${districtData.region}) ${relText} the national average.`;
            
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
            document.querySelector(`.toggle-btn[data-tenure="${impliedTenure}"]`)?.classList.add('active');

            state.manualRentPmt = false;
            state.manualMortgagePmt = false;
            state.manualHomeValue = false;
            
            state.baseHousePrice = localAvg * 8.5; 
            
            handleTenureUI(false); 
            calculateAll(); 

        } else {
            if(hint) hint.innerHTML = `Area not mapped. We will use the National Average.`;
            state.baseHousePrice = locationBenchmarks.metadata.national_average * 8.5;
            calculateAll();
        }
    } else {
        if(hint) hint.innerHTML = '';
    }
}

function updateSliderFromHomeValue(val) {
    state.manualHomeValue = true;
    state.homeValue = val;
    let ratio = val / state.baseHousePrice;
    let newSlider = 50;
    if (ratio <= 0.5) newSlider = 0;
    else if (ratio <= 1.0) newSlider = Math.round((ratio - 0.5) * 2 * 50);
    else if (ratio <= 2.0) newSlider = Math.round(50 + (ratio - 1.0) * 50);
    else newSlider = 100;

    state.home = newSlider;
    document.getElementById('slider-home').value = newSlider;
    calculateAll();
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
    
    document.getElementById('meas-home-value').addEventListener('input', (e) => { updateSliderFromHomeValue(parseFloat(e.target.value) || 0); });
    document.getElementById('meas-home-value-mortgage').addEventListener('input', (e) => { updateSliderFromHomeValue(parseFloat(e.target.value) || 0); });
    
    document.getElementById('meas-mortgage-age').addEventListener('change', (e) => { state.mortgageEndAge = parseInt(e.target.value) || 75; calculateAll(); });

    document.getElementById('meas-mortgage-pmt').addEventListener('input', (e) => { 
        if (e.target.value.trim() === '') {
            state.manualMortgagePmt = false;
            handleTenureUI(false); 
        } else {
            state.manualMortgagePmt = true;
            state.mortgagePmt = parseFloat(e.target.value) || 0; 
        }
        const shelterInp = document.getElementById('input-shelter');
        if(shelterInp) shelterInp.value = state.mortgagePmt || ''; 
        calculateAll(); 
    });

    document.getElementById('meas-rent-pmt').addEventListener('input', (e) => { 
        if (e.target.value.trim() === '') {
            state.manualRentPmt = false;
            handleTenureUI(false); 
        } else {
            state.manualRentPmt = true;
            state.rentPmt = parseFloat(e.target.value) || 0; 
        }
        const shelterInp = document.getElementById('input-shelter');
        if(shelterInp) shelterInp.value = state.rentPmt || ''; 
        calculateAll(); 
    });

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
        slider?.addEventListener('input', (e) => {
            let val = parseInt(e.target.value);
            if (val > -1 && val < 5) val = 0;
            if (val > 46 && val < 54) val = 50;
            if (val > 95 && val <= 100) val = 100;
            slider.value = val;
            state[pillar] = val;
            
            if(pillar === 'home') {
                state.manualHomeValue = false; 
                handleTenureUI(false);
            }
            
            calculateAll();
            triggerPulse(`val-${pillar}`); 
        });
    });

    document.getElementById('toggle-travel')?.addEventListener('change', calculateAll);

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

    ownerInputs?.classList.add('hidden');
    mortgageInputs?.classList.add('hidden');
    rentInputs?.classList.add('hidden');
    if(shelterInput) shelterInput.disabled = true;

    let bRent = rldConfig?.benchmarks?.home?.shelter?.rent || {staples: 12000, signature: 22000, designer: 35000};
    let impliedRentAnnual = (state.home <= 50) ? (bRent.staples + ((bRent.signature - bRent.staples) * (state.home / 50))) : (bRent.signature + ((bRent.designer - bRent.signature) * ((state.home - 50) / 50)));
    
    let bMort = rldConfig?.benchmarks?.home?.shelter?.mortgage || {staples: 12000, signature: 22000, designer: 35000};
    let impliedMortAnnual = (state.home <= 50) ? (bMort.staples + ((bMort.signature - bMort.staples) * (state.home / 50))) : (bMort.signature + ((bMort.designer - bMort.signature) * ((state.home - 50) / 50)));

    let f = state.home <= 50 ? 0.5 + 0.5*(state.home/50) : 1.0 + (state.home - 50)/50;
    if(!state.manualHomeValue) {
        state.homeValue = Math.round(state.baseHousePrice * f);
        const hvInp1 = document.getElementById('meas-home-value');
        const hvInp2 = document.getElementById('meas-home-value-mortgage');
        if(hvInp1) hvInp1.value = state.homeValue;
        if(hvInp2) hvInp2.value = state.homeValue;
    }

    if (!state.manualRentPmt) state.rentPmt = Math.round(impliedRentAnnual / 12);
    if (!state.manualMortgagePmt) state.mortgagePmt = Math.round(impliedMortAnnual / 12);

    if (state.tenure === 'owner') {
        ownerInputs?.classList.remove('hidden');
        if(updateText && displayReadout) displayReadout.innerHTML = `You own your home outright. We've styled your Home baseline using the details provided above.`;
        if(shelterInput) shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs?.classList.remove('hidden');
        if(updateText && displayReadout) displayReadout.innerHTML = `You have a mortgage. We've populated a default monthly payment based on your slider, but you can adjust it below.`;
        document.getElementById('meas-mortgage-pmt').value = state.mortgagePmt;
        if(shelterInput) shelterInput.value = state.mortgagePmt;
    } else {
        rentInputs?.classList.remove('hidden');
        if(updateText && displayReadout) displayReadout.innerHTML = `You are renting. We've populated a default monthly rent based on your slider, but you can adjust it below.`;
        document.getElementById('meas-rent-pmt').value = state.rentPmt;
        if(shelterInput) shelterInput.value = state.rentPmt;
    }
}

window.extrapolate = function(pillar) {
    const defaultFreq = parseInt(document.getElementById(`freq-${pillar}`)?.value || 12);
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
    
    const doTravelTaper = document.getElementById('toggle-travel')?.checked || false;
    const baseInf = 0.025; 

    for (const pillar of ['essentials', 'home', 'living']) {
        const sliderVal = state[pillar];
        for (const [key, catData] of Object.entries(rldConfig?.benchmarks?.[pillar] || {})) {
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

            // SMART TRAVEL PRIORITY: Reshape the Year 1 amount so the PV remains equivalent
            if (pillar === 'living' && key === 'travel' && doTravelTaper) {
                let realGrowth = (1 + (catData.inflation || baseInf)) / (1 + baseInf);
                let sumG = 0; let sumGW = 0;
                for (let a = state.age; a <= 95; a++) {
                    let t = a - state.age;
                    let g_t = Math.pow(realGrowth, t);
                    let w = 0.1;
                    if (t < 5) w = 1.0;
                    else if (t < 10) w = 1.0 - ((t - 4) * 0.18); // Tapers down 0.82 -> 0.10
                    sumG += g_t;
                    sumGW += (g_t * w);
                }
                val = val * (sumG / sumGW);
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
        const el = document.getElementById(`val-${p}`);
        if(el) el.innerText = `£${Math.round(currentValues[p]).toLocaleString()}`;
    });
    
    const dSal = document.getElementById('display-salary');
    if(dSal) { dSal.innerText = `£${Math.round(gross).toLocaleString()}`; triggerPulse('display-salary'); }
    
    const dNet = document.getElementById('display-net');
    if(dNet) dNet.innerText = `£${Math.round(currentValues.net).toLocaleString()}`;
    
    const dTax = document.getElementById('display-tax');
    if(dTax) dTax.innerText = `+£${Math.round(tax).toLocaleString()}`;

    updateChartsAndJourney();
}

function updateChartsAndJourney() {
    if(charts.polar) {
        charts.polar.data.datasets[0].data = [state.essentials, state.home, state.living];
        charts.polar.update();
    }

    const endAge = 95;
    const labels = [];
    const dataE = []; const dataH = []; const dataL = [];
    
    const doTravelTaper = document.getElementById('toggle-travel')?.checked || false;
    const projectedSp = rldConfig?.assumptions?.statePension ?? 11973; 
    const drawdownRate = rldConfig?.assumptions?.drawdownRate ?? 0.05; 

    // -----------------------------------------------------
    // CALCULATE NET GAPS PROGRESSIVELY
    // -----------------------------------------------------
    let gSp = projectedSp;
    let gDb = state.dbPension || 0;
    let potsTotal = (state.pensionPot || 0) + (state.otherSavings || 0);
    let gPots = potsTotal * drawdownRate;

    let reqCore = currentValues.essentials;
    let cSpUsed = Math.min(reqCore, gSp); gSp -= cSpUsed; reqCore -= cSpUsed;
    let cDbUsed = Math.min(reqCore, gDb); gDb -= cDbUsed; reqCore -= cDbUsed;
    let cPotsUsed = Math.min(reqCore, gPots); gPots -= cPotsUsed; reqCore -= cPotsUsed;
    let nCore = reqCore; 

    let reqHome = (state.unlockedStep >= 2) ? currentValues.home : 0;
    let hSpUsed = Math.min(reqHome, gSp); gSp -= hSpUsed; reqHome -= hSpUsed;
    let hDbUsed = Math.min(reqHome, gDb); gDb -= hDbUsed; reqHome -= hDbUsed;
    let hPotsUsed = Math.min(reqHome, gPots); gPots -= hPotsUsed; reqHome -= hPotsUsed;
    let nHome = reqHome;

    let preLifeRem = gSp + gDb + gPots; 
    let reqLife = (state.unlockedStep >= 3) ? currentValues.living : 0;
    let lSpUsed = Math.min(reqLife, gSp); gSp -= lSpUsed; reqLife -= lSpUsed;
    let lDbUsed = Math.min(reqLife, gDb); gDb -= lDbUsed; reqLife -= lDbUsed;
    let lPotsUsed = Math.min(reqLife, gPots); gPots -= lPotsUsed; reqLife -= lPotsUsed;
    let nLife = reqLife;

    // -----------------------------------------------------
    // SMART WALLET AUTO-CLOSE LOGIC
    // -----------------------------------------------------
    let grossCoreGap = Math.max(0, currentValues.essentials - projectedSp);
    let remSpForHome = Math.max(0, projectedSp - currentValues.essentials);
    let grossHomeGap = Math.max(0, currentValues.home - remSpForHome);

    if (state.walletOpenPillar === 1 && grossCoreGap <= 0) state.walletOpenPillar = null;
    if (state.walletOpenPillar === 2 && grossHomeGap <= 0) state.walletOpenPillar = null;

    if (state.walletOpenPillar === null) {
        if (nCore > 0) state.walletOpenPillar = 1;
        else if (nHome > 0 && state.unlockedStep >= 2) state.walletOpenPillar = 2;
        else if (nLife > 0 && state.unlockedStep >= 3) state.walletOpenPillar = 3;
    }

    let walletTarget = "";
    if (state.walletOpenPillar === 1) walletTarget = 'core-wallet-slot';
    else if (state.walletOpenPillar === 2) walletTarget = 'home-wallet-slot';
    else if (state.walletOpenPillar === 3) walletTarget = 'lifestyle-wallet-slot';

    // -----------------------------------------------------
    // 1. CORE RENDER
    // -----------------------------------------------------
    const corePrompt = document.getElementById('core-text-prompt');
    const coreBanner = document.getElementById('core-success-banner');
    const coreEdit = document.getElementById('core-edit-container');
    const coreAnnuity = document.getElementById('core-partner-annuity');

    if (state.walletOpenPillar === 1) {
        coreBanner?.classList.add('hidden');
        coreEdit?.classList.add('hidden');
        coreAnnuity?.classList.add('hidden');
        corePrompt?.classList.remove('hidden');
        
        let initialGap = Math.max(0, currentValues.essentials - projectedSp);
        setHTMLSafe('tips-p1-text', `Your secure income falls short of your Core needs by <strong>£${Math.round(initialGap).toLocaleString()}</strong>. Use the wallet below to allocate assets.`);
    } else {
        if (nCore <= 0 && currentValues.essentials > 0) {
            corePrompt?.classList.add('hidden');
            coreBanner?.classList.remove('hidden');
            
            if (cDbUsed > 0 || cPotsUsed > 0) coreEdit?.classList.remove('hidden');
            else coreEdit?.classList.add('hidden');

            setHTMLSafe('core-success-val', `£${Math.round(currentValues.essentials).toLocaleString()}`);
            
            if (cPotsUsed > 0) {
                setHTMLSafe('core-success-desc', "Your State Pension, secure DB Pension, and Savings perfectly cover your Core needs.");
                coreAnnuity?.classList.remove('hidden');
            } else if (cDbUsed > 0) {
                setHTMLSafe('core-success-desc', "Your State Pension and secure DB Pension fully cover your Core needs.");
                coreAnnuity?.classList.add('hidden');
            } else {
                setHTMLSafe('core-success-desc', "Your State Pension fully covers your Core needs.");
                coreAnnuity?.classList.add('hidden');
            }
        } else {
            corePrompt?.classList.remove('hidden');
            coreBanner?.classList.add('hidden');
            coreEdit?.classList.remove('hidden');
            coreAnnuity?.classList.add('hidden');
            setHTMLSafe('tips-p1-text', `You have an unbridged Core shortfall of <strong>£${Math.round(nCore).toLocaleString()}</strong>.`);
        }
    }
    
    if (state.unlockedStep === 1 && state.walletOpenPillar !== 1) document.getElementById('step-action-1')?.classList.remove('hidden');
    else document.getElementById('step-action-1')?.classList.add('hidden');

    // -----------------------------------------------------
    // 2. HOME RENDER
    // -----------------------------------------------------
    if (state.unlockedStep >= 2) {
        const homePrompt = document.getElementById('home-text-prompt');
        const homeBanner = document.getElementById('home-success-banner');
        const homeEdit = document.getElementById('home-edit-container');
        const homePortfolio = document.getElementById('home-partner-portfolio');

        if (state.walletOpenPillar === 2) {
            homeBanner?.classList.add('hidden');
            homeEdit?.classList.add('hidden');
