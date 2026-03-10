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
    living: 50,
    walletRevealed: false // Controls progressive disclosure
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

// Global function to reveal the Wealth Wallet
window.revealWallet = function() {
    state.walletRevealed = true;
    calculateAll();
    setTimeout(() => {
        document.getElementById('wealth-wallet').scrollIntoView({behavior: 'smooth', block: 'center'});
    }, 150);
}

// Global function for personalizing pillars
window.togglePersonalize = function(id) {
    const
