/**
 * Retirement Salary Designer - Logic Engine v1.0
 * 2026/27 UK Benchmark Configuration
 */

const rldConfig = {
    tax: {
        personalAllowance: 12570,
        basicRate: 0.20,
        higherRateThreshold: 50270,
        higherRate: 0.40
    },
    benchmarks: {
        foundations: {
            staples: 14200,
            signature: 18200,
            designer: 23500
        },
        home: {
            owner: { staples: 5500, signature: 9100, designer: 16000 },
            private: { staples: 22000, signature: 22000, designer: 35000 }, // Signature/Staples merged for market rent baseline
            social: { staples: 14500, signature: 14500, designer: 14500 }
        },
        wellness: {
            staples: 4000,
            signature: 16000, // Includes £3,500 Health Buffer
            designer: 38000
        }
    }
};

let userSelections = {
    tenure: 'owner',
    foundations: 'signature',
    home: 'staples',
    wellness: 'staples'
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    updateUIPrices();
    calculateSalary();
});

function setTenure(type) {
    userSelections.tenure = type;
    
    // Update Toggle Buttons
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.toLowerCase().includes(type)) btn.classList.add('active');
    });

    updateUIPrices();
    calculateSalary();
}

function selectGrade(pillar, grade) {
    userSelections[pillar] = grade;
    
    // Update UI Cards
    const cards = document.querySelectorAll(`.grade-selector[data-pillar="${pillar}"] .grade-card`);
    cards.forEach(card => {
        card.classList.remove('active');
        if (card.dataset.grade === grade) card.classList.add('active');
    });

    calculateSalary();
}

function updateUIPrices() {
    // Dynamically update labels based on tenure
    const tenure = userSelections.tenure;
    
    for (const pillar in rldConfig.benchmarks) {
        for (const grade in rldConfig.benchmarks[pillar]) {
            let price;
            if (pillar === 'home') {
                price = rldConfig.benchmarks.home[tenure][grade];
            } else {
                price = rldConfig.benchmarks[pillar][grade];
            }
            
            const element = document.getElementById(`price-${pillar}-${grade}`);
            if (element) element.innerText = `£${price.toLocaleString()}`;
        }
    }
}

/**
 * The Tailoring Engine: Calculates Net from the pre-defined Gross benchmarks
 * and visualizes the "Tax Adjustment".
 */
function calculateSalary() {
    const t = userSelections.tenure;
    
    const gFoundations = rldConfig.benchmarks.foundations[userSelections.foundations];
    const gHome = rldConfig.benchmarks.home[t][userSelections.home];
    const gWellness = rldConfig.benchmarks.wellness[userSelections.wellness];

    const totalGrossSalary = gFoundations + gHome + gWellness;

    // Calculate Tax Adjustment (Tailoring)
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

    // Update the Summary Bar
    document.getElementById('display-salary').innerText = `£${totalGrossSalary.toLocaleString()}`;
    document.getElementById('display-net').innerText = `£${Math.round(netTakeHome).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+ £${Math.round(taxAmount).toLocaleString()}`;
    
    // Trigger "Active" styles on chosen cards
    applyActiveClasses();
}

function applyActiveClasses() {
    for (const pillar in userSelections) {
        if (pillar === 'tenure') continue;
        const grade = userSelections[pillar];
        const cards = document.querySelectorAll(`.grade-selector[data-pillar="${pillar}"] .grade-card`);
        cards.forEach(card => {
            if (card.dataset.grade === grade) card.classList.add('active');
        });
    }
}
