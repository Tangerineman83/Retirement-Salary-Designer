Chart.register(ChartDataLabels);
Chart.register(window['chartjs-plugin-annotation']);

let rldConfig = null;
let state = { tenure: 'owner', essentials: 50, home: 50, living: 50 };
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
    // Header Inputs
    document.getElementById('user-age').addEventListener('change', calculateAll);
    document.getElementById('wealth-pot').addEventListener('input', updateCharts); // Only needs to redraw chart lines

    // Living Toggles
    document.getElementById('toggle-travel').addEventListener('change', updateCharts);
    document.getElementById('toggle-care').addEventListener('change', updateCharts);

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

    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tenure = e.target.dataset.tenure;
            handleTenureUI();
            calculateAll();
        });
    });

    const tooltip = document.getElementById('smart-tooltip');
    let tooltipTimeout;
    const hideTooltip = () => tooltip.classList.remove('show');

    document.querySelectorAll('.pers-input').forEach(input => {
        input.addEventListener('input', (e) => extrapolate(e.target.dataset.pillar));
        
        const showInputTooltip = (e) => {
            clearTimeout(tooltipTimeout);
            if(e.target.disabled) return;

            const cat = e.target.dataset.cat;
            const pillar = e.target.dataset.pillar;
            const freq = parseInt(document.getElementById(`freq-${pillar}`).value);
            
            let b = pillar === 'home' && cat === 'shelter' ? rldConfig.benchmarks.home.shelter[state.tenure] : rldConfig.benchmarks[pillar][cat];

            const name = rldConfig.benchmarks[pillar][cat].name;
            const st = Math.round(b.staples / (52/ (52/freq))); 
            const si = Math.round(b.signature / (52/ (52/freq)));
            const de = Math.round(b.designer / (52/ (52/freq)));

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
            tooltip.innerHTML = `<span style="color:white; font-family:'Space Grotesk', sans-serif; font-weight:300;">${desc}</span>`;
            
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
    const shelterInput = document.getElementById('input-shelter');
    if (state.tenure === 'owner') {
        shelterInput.value = '';
        shelterInput.disabled = true;
    } else {
        shelterInput.disabled = false;
    }
}

function togglePersonalize(id) {
    const panel = document.getElementById(`pers-${id}`);
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function extrapolate(pillar) {
    const freq = parseInt(document.getElementById(`freq-${pillar}`).value);
    const inputs = document.querySelectorAll(`#pers-${pillar} .pers-input`);
    
    let totalSliderScore = 0;
    let inputCount = 0;

    inputs.forEach(input => {
        if (!input.disabled && input.value && parseFloat(input.value) > 0) {
            const cat = input.dataset.cat;
            let b = (pillar === 'home' && cat === 'shelter') ? rldConfig.benchmarks.home.shelter[state.tenure] : rldConfig.benchmarks[pillar][cat];
            const annualVal = parseFloat(input.value) * (52 / (52/freq));

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

function updatePartners() {
    // Lead Gen Logic: Display Bupa if Living is high enough to trigger Private Health
    const bupa = document.getElementById('partner-bupa');
    if (state.living >= 50) { bupa.style.display = 'flex'; } 
    else { bupa.style.display = 'none'; }

    // Lead Gen Logic: Display Savills if Home is near Designer (Estate Management)
    const savills = document.getElementById('partner-savills');
    if (state.home >= 80) { savills.style.display = 'flex'; } 
    else { savills.style.display = 'none'; }
}

function calculateAll() {
    currentValues.essentials = 0; currentValues.home = 0; currentValues.living = 0;
    const currentAge = parseInt(document.getElementById('user-age').value) || 67;
    
    for (const pillar of ['essentials', 'home', 'living']) {
        const sliderVal = state[pillar];
        for (const [key, catData] of Object.entries(rldConfig.benchmarks[pillar])) {
            let b = (pillar === 'home' && key === 'shelter') ? catData[state.tenure] : catData;
            if(b.staples === undefined) continue;

            let val = 0;
            if (sliderVal <= 50) val = b.staples + ((b.signature - b.staples) * (sliderVal / 50));
            else val = b.signature + ((b.designer - b.signature) * ((sliderVal - 50) / 50));
            
            // Baseline Mortgage Logic (Drops out at 75)
            if (pillar === 'home' && key === 'shelter' && state.tenure === 'mortgage' && currentAge >= 75) { val = 0; }

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

    updatePartners();
    updateCharts();
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
            responsive: true, layout: { padding: 15 },
            scales: { r: { min: -20, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.03)' } } },
            plugins: { 
                legend: { display: false }, tooltip: { enabled: false }, 
                datalabels: {
                    color: palette.espresso, font: { family: 'Space Grotesk', weight: '600', size: 11 }, textAlign: 'center',
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
            scales: { x: { grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } } }, 
            plugins: { 
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Space Grotesk'} } },
                datalabels: { display: false },
                tooltip: {
                    backgroundColor: palette.espresso, titleFont: { family: 'Space Grotesk', size: 13 }, bodyFont: { family: 'Space Grotesk', size: 12 }, padding: 12,
                    callbacks: { label: function(context) { return ` ${context.dataset.label}: £${Math.round(context.raw).toLocaleString()}`; } }
                },
                annotation: {
                    annotations: {
                        exhaustionLine: {
                            type: 'line',
                            scaleID: 'x',
                            value: 0, // Set dynamically
                            borderColor: palette.orange,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: 'Pot Empty',
                                position: 'start',
                                backgroundColor: palette.orange,
                                color: '#fff',
                                font: { family: 'Space Grotesk', size: 11 }
                            },
                            display: false
                        }
                    }
                }
            } 
        }
    });
}

function updateCharts() {
    charts.polar.data.datasets[0].data = [state.essentials, state.home, state.living];
    charts.polar.update();

    const startAge = parseInt(document.getElementById('user-age').value) || 67;
    const initialPot = parseInt(document.getElementById('wealth-pot').value) || 0;
    let runningPot = initialPot;
    const endAge = 95; // Extended to 95 to allow pot to run out later
    
    const labels = [];
    const dataE = []; const dataH = []; const dataL = [];
    
    // Explicit Toggles
    const doTravelTaper = document.getElementById('toggle-travel').checked;
    const doCareSpike = document.getElementById('toggle-care').checked;

    let exhaustionIndex = -1;

    for (let age = startAge; age <= endAge; age++) {
        labels.push(age);
        const yearsPassed = age - startAge;
        
        let eSum = 0; let hSum = 0; let lSum = 0;

        for (const [key, data] of Object.entries(categoryData)) {
            const pillar = key.split('_')[0];
            const cat = key.split('_')[1];

            let projectedVal = data.value * Math.pow(1 + data.inf, yearsPassed);
            
            // Explicit Age-based modifiers driven by Toggles
            if (data.shape === 'taper' && age >= 75 && doTravelTaper) projectedVal *= 0.5; 
            if (data.shape === 'spike' && age >= 80 && doCareSpike) projectedVal *= 2.5; // Significant spike for Care Ring-fence
            
            // Mortgage Drop-off
            if (pillar === 'home' && cat === 'shelter' && state.tenure === 'mortgage' && age >= 75) {
                projectedVal = 0;
            }

            if (pillar === 'essentials') eSum += projectedVal;
            if (pillar === 'home') hSum += projectedVal;
            if (pillar === 'living') lSum += projectedVal;
        }

        // Calculate Gross Need for the year based on tax
        const totalNetNeed = eSum + hSum + lSum;
        let totalGrossNeed = totalNetNeed; // Fallback
        const pa = rldConfig.tax.personalAllowance;
        
        // Reverse engineer gross for pot depletion (simplified assumption of constant tax bands)
        if (totalNetNeed > pa) {
            const limitBasicNet = pa + ((rldConfig.tax.higherRateThreshold - pa) * (1 - rldConfig.tax.basicRate));
            if (totalNetNeed <= limitBasicNet) {
                totalGrossNeed = (totalNetNeed - pa * rldConfig.tax.basicRate) / (1 - rldConfig.tax.basicRate);
            } else {
                const basicTax = (rldConfig.tax.higherRateThreshold - pa) * rldConfig.tax.basicRate;
                const netAboveHigher = totalNetNeed - limitBasicNet;
                const grossAboveHigher = netAboveHigher / (1 - rldConfig.tax.higherRate);
                totalGrossNeed = rldConfig.tax.higherRateThreshold + grossAboveHigher;
            }
        }

        // Deplete Pot
        runningPot -= totalGrossNeed;
        if (runningPot <= 0 && exhaustionIndex === -1 && initialPot > 0) {
            exhaustionIndex = age - startAge;
        }

        dataE.push(eSum);
        dataH.push(hSum);
        dataL.push(lSum);
    }

    charts.spline.data.labels = labels;
    charts.spline.data.datasets[0].data = dataE;
    charts.spline.data.datasets[1].data = dataH;
    charts.spline.data.datasets[2].data = dataL;

    // Trigger Annotation Line
    if (exhaustionIndex !== -1 && exhaustionIndex < (endAge - startAge)) {
        charts.spline.options.plugins.annotation.annotations.exhaustionLine.value = exhaustionIndex;
        charts.spline.options.plugins.annotation.annotations.exhaustionLine.display = true;
    } else {
        charts.spline.options.plugins.annotation.annotations.exhaustionLine.display = false;
    }

    charts.spline.update();
}
