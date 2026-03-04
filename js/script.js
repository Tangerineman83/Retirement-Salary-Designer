/**
 * Retirement Salary Designer - Logic Engine v1.1
 * Fully modular implementation fetching JSON data.
 */

let rldConfig = null;

let state = {
    tenure: 'owner',
    foundations: 'signature',
    home: 'staples',
    wellness: 'staples'
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch variables from the central config file
        const response = await fetch('data/config.json');
        if (!response.ok) throw new Error('Network response was not ok');
        rldConfig = await response.json();
        
        setupEventListeners();
        updateUIPrices();
        calculateSalary();
    } catch (error) {
        console.error("Failed to load config.json.", error);
        alert("Configuration load failed. Ensure you are running this on a server (like GitHub Pages) rather than viewing the raw file.");
    }
});

function setupEventListeners() {
    // Tenure Handlers
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.tenure = e.target.dataset.tenure;
            updateUIPrices();
            calculateSalary();
        });
    });

    // Grade Card Handlers
    document.querySelectorAll('.grade-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const targetCard = e.currentTarget;
            const pillar = targetCard.parentElement.dataset.pillar;
            const grade = targetCard.dataset.grade;
            
            // Update UI
            document.querySelectorAll(`.grade-selector[data-pillar="${pillar}"] .grade-card`)
                    .forEach(c => c.classList.remove('active'));
            targetCard.classList.add('active');
            
            // Update State
            state[pillar] = grade;
            calculateSalary();
        });
    });
}

function updateUIPrices() {
    const pillars = ['foundations', 'home', 'wellness'];
    const grades = ['staples', 'signature', 'designer'];

    pillars.forEach(pillar => {
        grades.forEach(grade => {
            let price = (pillar === 'home') 
                ? rldConfig.benchmarks.home[state.tenure][grade] 
                : rldConfig.benchmarks[pillar][grade];
            
            const element = document.getElementById(`price-${pillar}-${grade}`);
            if (element) element.innerText = `£${price.toLocaleString()}`;
        });
    });
}

function calculateSalary() {
    if (!rldConfig) return;

    const gFoundations = rldConfig.benchmarks.foundations[state.foundations];
    const gHome = rldConfig.benchmarks.home[state.tenure][state.home];
    const gWellness = rldConfig.benchmarks.wellness[state.wellness];

    const totalGrossSalary = gFoundations + gHome + gWellness;
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

    document.getElementById('display-salary').innerText = `£${totalGrossSalary.toLocaleString()}`;
    document.getElementById('display-net').innerText = `£${Math.round(netTakeHome).toLocaleString()}`;
    document.getElementById('display-tax').innerText = `+ £${Math.round(taxAmount).toLocaleString()}`;
}
