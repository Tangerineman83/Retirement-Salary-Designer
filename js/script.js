Chart.register(ChartDataLabels);

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

// --- SAFE DOM HELPERS ---
function setHTMLSafe(id, htmlString) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = htmlString;
}

function setTextSafe(id, textString) {
    const el = document.getElementById(id);
    if(el) el.innerText = textString;
}

function setValueSafe(id, val) {
    const el = document.getElementById(id);
    if(el) el.value = val;
}

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
    body?.classList.toggle('collapsed');
    headerElement?.classList.toggle('collapsed');
}

window.togglePersonalize = function(id) {
    const panel = document.getElementById(`pers-${id}`);
    if(panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
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
    
    // Explicit User Override: Always advance to the next step when they click apply, even if a gap remains
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

function updatePostcodeReadout() {
    const pcInput = document.getElementById('meas-postcode')?.value.trim();
    const hint = document.getElementById('postcode-hint');
    state.postcode = pcInput || '';
    
    const alphaMatch = state.postcode.match(/^[A-Z]+/i);
    
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
            setValueSafe('slider-essentials', state.essentials);
            setValueSafe('slider-home', state.home);
            setValueSafe('slider-living', state.living);

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
    setValueSafe('slider-home', newSlider);
    calculateAll();
}

function setupListeners() {
    document.getElementById('meas-age')?.addEventListener('change', (e) => { 
        state.age = parseInt(e.target.value) || 60; 
        updatePostcodeReadout(); 
        calculateAll(); 
    });
    
    document.getElementById('meas-postcode')?.addEventListener('input', updatePostcodeReadout);

    document.getElementById('meas-db')?.addEventListener('input', (e) => { state.dbPension = parseFloat(e.target.value) || 0; calculateAll(); });
    document.getElementById('meas-pots')?.addEventListener('input', (e) => { state.pensionPot = parseFloat(e.target.value) || 0; calculateAll(); });
    document.getElementById('meas-savings')?.addEventListener('input', (e) => { state.otherSavings = parseFloat(e.target.value) || 0; calculateAll(); });
    
    document.getElementById('meas-home-value')?.addEventListener('input', (e) => { updateSliderFromHomeValue(parseFloat(e.target.value) || 0); });
    document.getElementById('meas-home-value-mortgage')?.addEventListener('input', (e) => { updateSliderFromHomeValue(parseFloat(e.target.value) || 0); });
    document.getElementById('meas-mortgage-age')?.addEventListener('change', (e) => { state.mortgageEndAge = parseInt(e.target.value) || 75; calculateAll(); });

    document.getElementById('meas-mortgage-pmt')?.addEventListener('input', (e) => { 
        if (e.target.value.trim() === '') {
            state.manualMortgagePmt = false;
            handleTenureUI(false); 
        } else {
            state.manualMortgagePmt = true;
            state.mortgagePmt = parseFloat(e.target.value) || 0; 
        }
        setValueSafe('input-shelter', state.mortgagePmt || '');
        calculateAll(); 
    });

    document.getElementById('meas-rent-pmt')?.addEventListener('input', (e) => { 
        if (e.target.value.trim() === '') {
            state.manualRentPmt = false;
            handleTenureUI(false); 
        } else {
            state.manualRentPmt = true;
            state.rentPmt = parseFloat(e.target.value) || 0; 
        }
        setValueSafe('input-shelter', state.rentPmt || '');
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
}

function handleTenureUI(updateText = true) {
    const ownerInputs = document.getElementById('tenure-owner-inputs');
    const mortgageInputs = document.getElementById('tenure-mortgage-inputs');
    const rentInputs = document.getElementById('tenure-rent-inputs');
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
        setValueSafe('meas-home-value', state.homeValue);
        setValueSafe('meas-home-value-mortgage', state.homeValue);
    }

    if (!state.manualRentPmt) state.rentPmt = Math.round(impliedRentAnnual / 12);
    if (!state.manualMortgagePmt) state.mortgagePmt = Math.round(impliedMortAnnual / 12);

    if (state.tenure === 'owner') {
        ownerInputs?.classList.remove('hidden');
        if(updateText) setHTMLSafe('p2-tenure-display', `You own your home outright. We've styled your Home baseline using the details provided above.`);
        if(shelterInput) shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs?.classList.remove('hidden');
        if(updateText) setHTMLSafe('p2-tenure-display', `You have a mortgage. We've populated a default monthly payment based on your slider, but you can adjust it below.`);
        setValueSafe('meas-mortgage-pmt', state.mortgagePmt);
        if(shelterInput) shelterInput.value = state.mortgagePmt;
    } else {
        rentInputs?.classList.remove('hidden');
        if(updateText) setHTMLSafe('p2-tenure-display', `You are renting. We've populated a default monthly rent based on your slider, but you can adjust it below.`);
        setValueSafe('meas-rent-pmt', state.rentPmt);
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
    setValueSafe(`slider-${pillar}`, state[pillar]);
    calculateAll();
}

function calculateAll() {
    currentValues.essentials = 0; currentValues.home = 0; currentValues.living = 0;
    
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
        setHTMLSafe(`val-${p}`, `£${Math.round(currentValues[p]).toLocaleString()}`);
    });
    
    setHTMLSafe('display-salary', `£${Math.round(gross).toLocaleString()}`);
    triggerPulse('display-salary');
    setHTMLSafe('display-net', `£${Math.round(currentValues.net).toLocaleString()}`);
    setHTMLSafe('display-tax', `+£${Math.round(tax).toLocaleString()}`);

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

    // -- CORE CALC --
    let reqCore = currentValues.essentials;
    let cSpUsed = Math.min(reqCore, gSp); gSp -= cSpUsed; reqCore -= cSpUsed;
    let grossCoreGap = reqCore; 
    
    let cDbUsed = Math.min(reqCore, gDb); gDb -= cDbUsed; reqCore -= cDbUsed;
    let cPotsUsed = Math.min(reqCore, gPots); gPots -= cPotsUsed; reqCore -= cPotsUsed;
    let nCore = reqCore; 

    // -- HOME CALC --
    let reqHome = (state.unlockedStep >= 2) ? currentValues.home : 0;
    let hSpUsed = Math.min(reqHome, gSp); gSp -= hSpUsed; reqHome -= hSpUsed;
    let grossHomeGap = reqHome;
    
    let hDbUsed = Math.min(reqHome, gDb); gDb -= hDbUsed; reqHome -= hDbUsed;
    let hPotsUsed = Math.min(reqHome, gPots); gPots -= hPotsUsed; reqHome -= hPotsUsed;
    let nHome = reqHome;

    // -- LIFESTYLE CALC --
    let preLifeRem = gSp + gDb + gPots; 
    let reqLife = (state.unlockedStep >= 3) ? currentValues.living : 0;
    let lSpUsed = Math.min(reqLife, gSp); gSp -= lSpUsed; reqLife -= lSpUsed;
    
    let lDbUsed = Math.min(reqLife, gDb); gDb -= lDbUsed; reqLife -= lDbUsed;
    let lPotsUsed = Math.min(reqLife, gPots); gPots -= lPotsUsed; reqLife -= lPotsUsed;
    let nLife = reqLife;

    // -----------------------------------------------------
    // SMART WALLET AUTO-CLOSE LOGIC
    // -----------------------------------------------------
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
    // 1. CORE RENDER (With Explicit Override Handling)
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
        
        setHTMLSafe('tips-p1-text', `Your guaranteed income falls short of your Core needs by <strong>£${Math.round(grossCoreGap).toLocaleString()}</strong>. Use the wallet below to allocate assets.`);
    } else {
        corePrompt?.classList.add('hidden');
        coreBanner?.classList.remove('hidden');
        coreEdit?.classList.remove('hidden'); // Always allow edit once passed
        
        if (nCore <= 0) {
            document.getElementById('core-banner-title').innerHTML = `Core Needs Covered <span style="color:var(--accent-sage)">✓</span>`;
            document.getElementById('core-banner-label').innerText = `Allocated`;
            setTextSafe('core-success-val', `£${Math.round(currentValues.essentials).toLocaleString()}`);
            
            if (cPotsUsed > 0) {
                setTextSafe('core-success-desc', "Your State Pension, DB Pension, and Savings securely cover your Core needs.");
                coreAnnuity?.classList.remove('hidden');
            } else if (cDbUsed > 0) {
                setTextSafe('core-success-desc', "Your State Pension and DB Pension fully cover your Core needs.");
                coreAnnuity?.classList.add('hidden');
            } else {
                setTextSafe('core-success-desc', "Your State Pension fully covers your Core needs.");
                coreAnnuity?.classList.add('hidden');
                coreEdit?.classList.add('hidden'); // No assets to edit if SP naturally covers it
            }
        } else {
            // EXPLICIT OVERRIDE: They clicked apply but there is still a gap.
            document.getElementById('core-banner-title').innerHTML = `Shortfall Acknowledged`;
            document.getElementById('core-banner-title').style.color = `var(--accent-orange)`;
            document.getElementById('core-banner-label').innerText = `Remaining Gap`;
            setTextSafe('core-success-val', `£${Math.round(nCore).toLocaleString()}`);
            setTextSafe('core-success-desc', "You have proceeded with an unbridged gap in your essential spending.");
            coreAnnuity?.classList.add('hidden');
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
        const homeAnnuity = document.getElementById('home-partner-annuity');
        const homeEquityBlock = document.getElementById('home-equity-block');

        let estHomeEquityIncome = 0;
        if (state.tenure === 'owner' || state.tenure === 'mortgage') {
            estHomeEquityIncome = (state.homeValue * 0.30) * drawdownRate;
        }

        if (state.walletOpenPillar === 2) {
            homeBanner?.classList.add('hidden');
            homeEdit?.classList.add('hidden');
            homeAnnuity?.classList.add('hidden');
            homeEquityBlock?.classList.add('hidden');
            homePrompt?.classList.remove('hidden');
            
            setHTMLSafe('tips-p2-text', `Your remaining income leaves a Home gap of <strong>£${Math.round(grossHomeGap).toLocaleString()}</strong>. Use the wallet below to allocate assets.`);
        } else {
            homePrompt?.classList.add('hidden');
            homeBanner?.classList.remove('hidden');
            homeEdit?.classList.remove('hidden');
            
            if (nHome <= 0) { 
                document.getElementById('home-banner-title').innerHTML = `Home Needs Covered <span style="color:var(--accent-sage)">✓</span>`;
                document.getElementById('home-banner-label').innerText = `Allocated`;
                setTextSafe('home-success-val', `£${Math.round(currentValues.home).toLocaleString()}`);
                
                homeEquityBlock?.classList.add('hidden');

                if (hPotsUsed > 0) {
                    setTextSafe('home-success-desc', "Your savings drawdown bridges your Home costs.");
                    homeAnnuity?.classList.remove('hidden');
                } else if (hDbUsed > 0) {
                    setTextSafe('home-success-desc', "Your DB Pension bridges your Home costs.");
                    homeAnnuity?.classList.add('hidden');
                } else {
                    setTextSafe('home-success-desc', "Your regular income seamlessly covers your Home costs.");
                    homeAnnuity?.classList.add('hidden');
                    homeEdit?.classList.add('hidden'); 
                }
            } else {
                // EXPLICIT OVERRIDE: Unbridged Home Gap
                document.getElementById('home-banner-title').innerHTML = `Shortfall Acknowledged`;
                document.getElementById('home-banner-title').style.color = `var(--accent-orange)`;
                document.getElementById('home-banner-label').innerText = `Remaining Gap`;
                setTextSafe('home-success-val', `£${Math.round(nHome).toLocaleString()}`);
                setTextSafe('home-success-desc', "You have proceeded with an unbridged gap in your shelter costs.");
                homeAnnuity?.classList.add('hidden');

                // If gap exists, show Equity Waterfall logic
                if (estHomeEquityIncome > 0) {
                    homeEquityBlock?.classList.remove('hidden');
                    setHTMLSafe('home-equity-desc', `Releasing 30% of your property wealth could generate an estimated <strong>£${Math.round(estHomeEquityIncome).toLocaleString()}/yr</strong> to help bridge this gap.`);
                } else {
                    homeEquityBlock?.classList.add('hidden');
                }
            }
        }
        
        if (state.unlockedStep === 2 && state.walletOpenPillar !== 2) document.getElementById('step-action-2')?.classList.remove('hidden');
        else document.getElementById('step-action-2')?.classList.add('hidden');
    }

    // -----------------------------------------------------
    // 3. LIFESTYLE RENDER (Sequence Waterfall)
    // -----------------------------------------------------
    const equityBlock = document.getElementById('equity-block');
    const shapeBlock = document.getElementById('shape-block');
    const healthBlock = document.getElementById('health-block');
    const surplusBlock = document.getElementById('surplus-block');

    if (state.unlockedStep >= 3) {
        const lifePrompt = document.getElementById('life-text-prompt');
        const lifeBanner = document.getElementById('lifestyle-success-banner');
        const lifeEdit = document.getElementById('lifestyle-edit-container');
        const btnLifeEdit = document.getElementById('btn-life-edit');

        let estEquityIncome = 0;
        if (state.tenure === 'owner' || state.tenure === 'mortgage') {
            estEquityIncome = (state.homeValue * 0.30) * drawdownRate;
        }

        setHTMLSafe('tips-p3-intro', `You have a remaining projected income of <strong>£${Math.round(preLifeRem).toLocaleString()}</strong> per year to design your lifestyle.`);

        if (state.walletOpenPillar === 3) {
            lifeBanner?.classList.add('hidden');
            lifeEdit?.classList.add('hidden');
            lifePrompt?.classList.remove('hidden');
            
            setHTMLSafe('tips-p3-text', `Your preferred Lifestyle exceeds your resources by <strong>£${Math.round(nLife).toLocaleString()}</strong>. Use the wallet below to check your assets.`);
            
            equityBlock?.classList.add('hidden');
            shapeBlock?.classList.add('hidden');
            healthBlock?.classList.add('hidden');
            surplusBlock?.classList.add('hidden');
        } else {
            
            if (nLife <= 0 && currentValues.living > 0) {
                // FULLY FUNDED
                lifePrompt?.classList.add('hidden');
                lifeBanner?.classList.remove('hidden');
                lifeEdit?.classList.remove('hidden');
                
                document.getElementById('life-banner-title').innerHTML = `Lifestyle Fully Funded <span style="color:var(--accent-sage)">✓</span>`;
                document.getElementById('life-banner-title').style.color = `var(--bg-oatmilk)`;
                document.getElementById('life-banner-label').innerText = `Allocated`;
                setTextSafe('lifestyle-success-val', `£${Math.round(currentValues.living).toLocaleString()}`);
                
                if(btnLifeEdit) {
                    if (lDbUsed > 0 || lPotsUsed > 0) btnLifeEdit.innerText = "Edit Assets ⌄";
                    else btnLifeEdit.innerText = "Add Assets to Boost Surplus ⌄";
                }

                if (lPotsUsed > 0) setTextSafe('lifestyle-success-desc', "Your savings successfully fund your chosen lifestyle.");
                else setTextSafe('lifestyle-success-desc', "Your guaranteed income fully covers your chosen lifestyle.");

                surplusBlock?.classList.remove('hidden');
                setHTMLSafe('surplus-amount', `£${Math.round(gSp + gDb + gPots).toLocaleString()}`); 

                equityBlock?.classList.add('hidden');
                shapeBlock?.classList.add('hidden');
                healthBlock?.classList.remove('hidden'); 

            } else {
                // GAP REMAINS AFTER WALLET APPLIED
                lifePrompt?.classList.add('hidden');
                lifeBanner?.classList.remove('hidden');
                lifeEdit?.classList.remove('hidden');
                if(btnLifeEdit) btnLifeEdit.innerText = "Edit Assets ⌄";
                
                document.getElementById('life-banner-title').innerHTML = `Shortfall Acknowledged`;
                document.getElementById('life-banner-title').style.color = `var(--accent-orange)`;
                document.getElementById('life-banner-label').innerText = `Remaining Gap`;
                setTextSafe('lifestyle-success-val', `£${Math.round(nLife).toLocaleString()}`);
                setTextSafe('lifestyle-success-desc', "You have proceeded with an unbridged gap in your lifestyle goals. Explore the options below.");

                surplusBlock?.classList.add('hidden');
                healthBlock?.classList.add('hidden');

                // Step 3: Equity Release Waterfall
                if (estEquityIncome > 0) {
                    equityBlock?.classList.remove('hidden');
                    setHTMLSafe('equity-desc', `Releasing 30% of your property wealth could generate an estimated <strong>£${Math.round(estEquityIncome).toLocaleString()}/yr</strong>.`);
                } else {
                    equityBlock?.classList.add('hidden');
                }

                // Step 4: Shape Toggles (If gap still exists after hypothetical equity)
                if (nLife - estEquityIncome > 0) {
                    shapeBlock?.classList.remove('hidden');
                } else {
                    shapeBlock?.classList.add('hidden');
                }
            }
        }
    }

    // -----------------------------------------------------
    // EXECUTE WEALTH WALLET INJECTION & ASSET CARDS
    // -----------------------------------------------------
    const walletEl = document.getElementById('wealth-wallet');
    const annuityCardWallet = document.getElementById('wallet-partner-annuity');
    
    if (walletTarget !== "") {
        let activeNetGap = (state.walletOpenPillar === 1) ? nCore : (state.walletOpenPillar === 2) ? nHome : nLife;
        let usedAssets = (state.walletOpenPillar === 1) ? (cDbUsed + cPotsUsed) : (state.walletOpenPillar === 2) ? (hDbUsed + hPotsUsed) : (lDbUsed + lPotsUsed);
        
        const titleEl = document.getElementById('wallet-dynamic-title');
        
        if (activeNetGap <= 0) {
            if (usedAssets === 0 && state.walletOpenPillar === 3) {
                if(titleEl) { titleEl.innerHTML = `Boost Your Surplus <span style="color:var(--accent-sage)">↑</span>`; titleEl.style.color = "var(--text-espresso)"; }
                setHTMLSafe('wallet-dynamic-desc', `Your needs are covered. Add your assets below to see your total retirement surplus.`);
            } else {
                if(titleEl) { titleEl.innerHTML = `Gap Bridged <span style="color:var(--accent-sage)">✓</span>`; titleEl.style.color = "var(--text-espresso)"; }
                setHTMLSafe('wallet-dynamic-desc', `Your assets successfully cover this need. Click 'Apply & Continue' to proceed.`);
            }
        } else {
            if(titleEl) { titleEl.innerText = `Bridge the Gap: £${Math.round(activeNetGap).toLocaleString()}`; titleEl.style.color = "var(--accent-orange)"; }
            setHTMLSafe('wallet-dynamic-desc', `Your guaranteed income falls short here. Input your assets below to cover the difference.`);
        }
        
        if (state.revealedAssets.includes('pots')) {
            document.getElementById('pots-card')?.classList.remove('hidden');
            document.getElementById('btn-reveal-pots')?.classList.add('hidden');
            document.getElementById('withdrawal-hint')?.classList.remove('hidden');
        } else {
            document.getElementById('pots-card')?.classList.add('hidden');
            document.getElementById('btn-reveal-pots')?.classList.remove('hidden');
            document.getElementById('withdrawal-hint')?.classList.add('hidden');
        }

        if (state.revealedAssets.includes('savings')) {
            document.getElementById('savings-card')?.classList.remove('hidden');
            document.getElementById('btn-reveal-savings')?.classList.add('hidden');
        } else {
            document.getElementById('savings-card')?.classList.add('hidden');
            document.getElementById('btn-reveal-savings')?.classList.remove('hidden');
        }

        if (walletEl && walletEl.parentElement?.id !== walletTarget) {
            document.getElementById(walletTarget)?.appendChild(walletEl);
        }
        walletEl?.classList.remove('hidden');
    } else {
        walletEl?.classList.add('hidden');
    }

    // -----------------------------------------------------
    // CHART HORIZON TRAJECTORY (Real-Terms Inflation math)
    // -----------------------------------------------------
    let baseInf = 0.025; 

    for (let age = state.age; age <= endAge; age++) {
        labels.push(age);
        let eSum = 0; let hSum = 0; let lSum = 0;
        let t = age - state.age;

        for (const [key, data] of Object.entries(categoryData)) {
            const pillar = key.split('_')[0];
            const cat = key.split('_')[1];

            let realGrowth = (1 + (data.inf || baseInf)) / (1 + baseInf);
            let projectedVal = data.value * Math.pow(realGrowth, t); 
            
            if (pillar === 'living') {
                if (data.shape === 'taper' && age >= 75 && doTravelTaper) projectedVal *= 0.5; 
            }
            if (pillar === 'home' && cat === 'shelter' && state.tenure === 'mortgage' && age >= state.mortgageEndAge) projectedVal = 0;

            if (pillar === 'essentials') eSum += projectedVal;
            if (pillar === 'home') hSum += projectedVal;
            if (pillar === 'living') lSum += projectedVal;
        }

        dataE.push(eSum);
        dataH.push(hSum);
        dataL.push(lSum);
    }

    if(charts.mainBar) {
        charts.mainBar.data.labels = labels;
        charts.mainBar.data.datasets[0].data = dataE;
        charts.mainBar.data.datasets[1].data = dataH;
        charts.mainBar.data.datasets[2].data = dataL;
        charts.mainBar.update();
    }
}

function createBarChart(ctxId, displayLegend) {
    const el = document.getElementById(ctxId);
    if(!el) return null;
    const ctx = el.getContext('2d');
    return new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Core', backgroundColor: palette.sage, data: [] }, { label: 'Home', backgroundColor: palette.dusk, data: [] }, { label: 'Lifestyle', backgroundColor: palette.orange, data: [] }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } } }, 
            plugins: { 
                legend: { display: displayLegend, position: 'bottom', labels: { boxWidth: 12, font: { family: 'Space Grotesk'} } },
                datalabels: { display: false },
                tooltip: { backgroundColor: palette.espresso, titleFont: { family: 'Space Grotesk', size: 13 }, bodyFont: { family: 'Space Grotesk', size: 12 }, padding: 12, callbacks: { label: function(context) { return ` ${context.dataset.label}: £${Math.round(context.raw).toLocaleString()}`; } } }
            } 
        }
    });
}

function setupCharts() {
    const polarEl = document.getElementById('polarChart');
    if(polarEl) {
        const ctxPolar = polarEl.getContext('2d');
        charts.polar = new Chart(ctxPolar, {
            type: 'polarArea',
            data: { labels: ['Core', 'Home', 'Lifestyle'], datasets: [{ data: [50, 50, 50], backgroundColor: [palette.sage, palette.dusk, palette.orange], borderColor: [palette.sage, palette.dusk, palette.orange], borderWidth: 1 }] },
            options: { 
                responsive: true, maintainAspectRatio: false, layout: { padding: 0 },
                scales: { r: { min: -20, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.1)' } } },
                plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { color: '#F9F8F6', font: { family: 'Space Grotesk', weight: '600', size: 10 }, textAlign: 'center', formatter: function(value, context) { return context.chart.data.labels[context.dataIndex]; } } } 
            }
        });
    }
    charts.mainBar = createBarChart('mainStackedChart', true);
}
