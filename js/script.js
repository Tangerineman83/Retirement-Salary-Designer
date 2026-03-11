Chart.register(ChartDataLabels);
Chart.register(window['chartjs-plugin-annotation']);

let rldConfig = null;
let locationBenchmarks = null;

let state = { 
    unlockedStep: 1, // Tracking the sequential journey (1=Core, 2=Home, 3=Lifestyle)
    age: 60, 
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

window.advanceStep = function(targetStep) {
    state.unlockedStep = targetStep;
    
    if (targetStep === 2) {
        const homeSection = document.getElementById('pillar-home');
        homeSection.classList.remove('locked-step');
        document.getElementById('body-home').classList.remove('collapsed');
        document.getElementById('step-action-1').classList.add('hidden'); // Hide the button once clicked
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
            hint.innerHTML = `Area not mapped. We will use the National Average.`;
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

    if (state.tenure === 'owner') {
        ownerInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You own your home outright. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = '';
    } else if (state.tenure === 'mortgage') {
        mortgageInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You have a mortgage. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = state.mortgagePmt || '';
    } else {
        rentInputs.classList.remove('hidden');
        if(updateText) displayReadout.innerHTML = `You are renting. We've styled your Home baseline using the details provided above.`;
        shelterInput.value = state.rentPmt || '';
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
    let showDbInput = false;
    let showPotsInput = false;
    
    // Hide partner cards by default
    document.getElementById('wallet-partner-annuity').classList.add('hidden');
    document.getElementById('wallet-partner-portfolio').classList.add('hidden');
    const equityCard = document.getElementById('partner-equity');
    const healthCard = document.getElementById('partner-health');
    equityCard.classList.add('hidden');
    healthCard.classList.add('hidden');

    // ==========================================
    // STEP 1: CORE LOGIC
    // ==========================================
    let coreGap = currentValues.essentials - spRemaining;
    let coreMsg = "";
    let canAdvanceToHome = false;

    if (coreGap <= 0) {
        spRemaining -= currentValues.essentials;
        coreMsg = `Your State Pension fully covers your Core needs.`;
        canAdvanceToHome = true;
    } else {
        spRemaining = 0;
        showWallet = true;
        showDbInput = true;
        walletTitle = "Bridge your Core Gap";
        walletDesc = `Your guaranteed income falls short of your Core needs by £${Math.round(coreGap).toLocaleString()}. Do you have a DB pension?`;
        
        let dbGap = coreGap - dbRemaining;
        if (dbGap <= 0) {
            dbRemaining -= coreGap;
            coreMsg = `Your State Pension and DB Pension fully cover your Core needs.`;
            showWallet = false; 
            canAdvanceToHome = true;
        } else {
            dbRemaining = 0;
            showPotsInput = true;
            walletDesc = `Even with your DB Pension, you have a gap of £${Math.round(dbGap).toLocaleString()}. Do you have savings or pension pots?`;
            
            let potsGap = dbGap - potsRemaining;
            if (potsGap <= 0) {
                potsRemaining -= dbGap;
                coreMsg = `Your savings drawdown bridges your remaining Core gap.`;
                document.getElementById('wallet-partner-annuity').classList.remove('hidden');
                canAdvanceToHome = true;
            } else {
                potsRemaining = 0;
                coreMsg = `Even with your savings, you have a Core shortfall. Consider securing an annuity.`;
                document.getElementById('wallet-partner-annuity').classList.remove('hidden');
                canAdvanceToHome = true; // Unblock them anyway as requested
            }
        }
    }
    document.getElementById('tips-p1-text').innerHTML = coreMsg;
    
    if(canAdvanceToHome && state.unlockedStep === 1) {
        document.getElementById('step-action-1').classList.remove('hidden');
    } else {
        document.getElementById('step-action-1').classList.add('hidden');
    }

    // ==========================================
    // STEP 2: HOME LOGIC (Only evaluates if step >= 2)
    // ==========================================
    if (state.unlockedStep >= 2) {
        let homeMsg = "";
        let homeGap = currentValues.home;
        let canAdvanceToLifestyle = false;

        if (spRemaining >= homeGap) {
            spRemaining -= homeGap;
            homeGap = 0;
        } else {
            homeGap -= spRemaining;
            spRemaining = 0;
        }

        if (homeGap > 0) {
            if (dbRemaining >= homeGap) {
                dbRemaining -= homeGap;
                homeGap = 0;
            } else {
                homeGap -= dbRemaining;
                dbRemaining = 0;
            }
        }

        if (homeGap === 0) {
            homeMsg = `Your remaining regular income fully covers your Home costs.`;
            canAdvanceToLifestyle = true;
        } else {
            // Override wallet focus to Home if there's a gap here
            showWallet = true;
            showDbInput = true;
            showPotsInput = true;
            walletTitle = "Bridge your Home Gap";
            walletDesc = `Your regular income leaves a Home gap of £${Math.round(homeGap).toLocaleString()}. Add your Pots or Savings.`;

            if (potsTotal > 0) {
                if (potsRemaining >= homeGap) {
                    potsRemaining -= homeGap;
                    homeGap = 0;
                    homeMsg = `Your savings drawdown covers your Home costs.`;
                    document.getElementById('wallet-partner-portfolio').classList.remove('hidden');
                    canAdvanceToLifestyle = true;
                } else {
                    potsRemaining = 0;
                    homeMsg = `You have a Home shortfall.`;
                    canAdvanceToLifestyle = true; // Unblock them
                }
            } else {
                homeMsg = `You have a Home shortfall.`;
                canAdvanceToLifestyle = true; // Unblock them
            }
        }
        document.getElementById('tips-p2-text').innerHTML = homeMsg;
        
        if(canAdvanceToLifestyle && state.unlockedStep === 2) {
            document.getElementById('step-action-2').classList.remove('hidden');
        } else {
            document.getElementById('step-action-2').classList.add('hidden');
        }
    }

    // ==========================================
    // STEP 3: LIFESTYLE LOGIC (Only evaluates if step >= 3)
    // ==========================================
    if (state.unlockedStep >= 3) {
        let lifeMsg = "";
        let lifeCost = currentValues.living;
        let totalRemaining = spRemaining + dbRemaining + potsRemaining;
        
        document.getElementById('tips-p3-intro').innerHTML = `You have a remaining projected income of <strong>£${Math.round(totalRemaining).toLocaleString()}</strong> per year to design your lifestyle.`;

        if (totalRemaining >= lifeCost) {
            lifeMsg = `You have sufficient wealth to fully fund your desired Lifestyle!`;
            document.getElementById('surplus-block').classList.remove('hidden');
            document.getElementById('surplus-amount').innerText = `£${Math.round(totalRemaining - lifeCost).toLocaleString()}`;
        } else {
            let lifeGap = lifeCost - totalRemaining;
            lifeMsg = `Your preferred Lifestyle exceeds your resources by £${Math.round(lifeGap).toLocaleString()}. Consider reshaping your timeline.`;
            
            showWallet = true;
            showDbInput = true; 
            showPotsInput = true;
            walletTitle = "Fund your Lifestyle";
            walletDesc = `Your income leaves a Lifestyle gap of £${Math.round(lifeGap).toLocaleString()}. Add any other assets to cover the difference.`;
            
            document.getElementById('surplus-block').classList.add('hidden');
        }
        document.getElementById('tips-p3-text').innerHTML = lifeMsg;

        if (state.tenure === 'owner' || state.tenure === 'mortgage') equityCard.classList.remove('hidden');
        if (state.living >= 50 || doCareSpike) healthCard.classList.remove('hidden');
    }

    // EXECUTE WEALTH WALLET UI STATE
    const wallet = document.getElementById('wealth-wallet');
    if (showWallet) {
        document.getElementById('wallet-dynamic-title').innerText = walletTitle;
        document.getElementById('wallet-dynamic-desc').innerText = walletDesc;
        
        if (showDbInput) document.getElementById('db-box').classList.remove('hidden');
        else document.getElementById('db-box').classList.add('hidden');
        
        if (showPotsInput) document.getElementById('pots-box').classList.remove('hidden');
        else document.getElementById('pots-box').classList.add('hidden');
        
        wallet.classList.remove('hidden');
    } else {
        wallet.classList.add('hidden');
    }

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

    if (exhaustionAge !== -1 && exhaustionAge <= 90 && state.unlockedStep >= 3) {
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
