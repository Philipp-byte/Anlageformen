// Sparplan-Rechner mit Vergleich mehrerer Anlageformen.
// Fokus: fachlich korrekte Zinseszins-Rechnung auf Monatsbasis und didaktisch klare Darstellung.

const ASSET_CONFIG = {
  sparbuch: { label: "🏦 Sparbuch", annualReturn: 0.005, color: "#60a5fa", volatility: 0 },
  tagesgeld: { label: "💶 Tagesgeld", annualReturn: 0.02, color: "#22c55e", volatility: 0 },
  termingeld: { label: "📅 Termingeld", annualReturn: 0.027, color: "#a78bfa", volatility: 0 },
  etf: { label: "🌍 ETF MSCI World", annualReturn: 0.065, color: "#10b981", volatility: 0.3 },
  crypto: { label: "🪙 Kryptowährungen", annualReturn: 0.55, color: "#f43f5e", volatility: 0.5 },
};

const TAX_RATE = 0.25;

const dom = {
  form: document.getElementById("calculatorForm"),
  monthlyContribution: document.getElementById("monthlyContribution"),
  initialInvestment: document.getElementById("initialInvestment"),
  years: document.getElementById("years"),
  customReturn: document.getElementById("customReturn"),
  annualCosts: document.getElementById("annualCosts"),
  enableTaxes: document.getElementById("enableTaxes"),
  enableInflation: document.getElementById("enableInflation"),
  inflationRate: document.getElementById("inflationRate"),
  assumptions: document.getElementById("assumptions"),
  results: document.getElementById("resultsContainer"),
  themeToggle: document.getElementById("themeToggle"),
  saveScenario: document.getElementById("saveScenario"),
  loadScenario: document.getElementById("loadScenario"),
  exportChart: document.getElementById("exportChart"),
};

let wealthChart;

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (value) => `${(value * 100).toFixed(2)} %`;

function getSelectedAssets() {
  return [...document.querySelectorAll('input[name="asset"]:checked')].map((cb) => cb.value);
}

function calcMonthlyRate(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

// Berechnet Vermögenspfad pro Monat.
// Formel je Monat:
// Endwert = Einmalanlage*(1+r)^n + Sparrate*[((1+r)^n - 1)/r]
function calculateSeries(params, config) {
  const {
    monthlyContribution,
    initialInvestment,
    months,
    annualCosts,
    enableTaxes,
    enableInflation,
    inflationRate,
    customReturn,
  } = params;

  const annualGross = customReturn ?? config.annualReturn;
  const annualNetBeforeTax = annualGross - annualCosts;
  const monthlyRate = calcMonthlyRate(annualNetBeforeTax);
  const monthlyInflation = calcMonthlyRate(inflationRate);

  const labels = [];
  const invested = [];
  const wealth = [];
  const upperBand = [];
  const lowerBand = [];

  for (let m = 0; m <= months; m++) {
    const n = m;
    const totalInvested = initialInvestment + monthlyContribution * n;

    let nominal;
    if (Math.abs(monthlyRate) < 1e-12) {
      nominal = initialInvestment + monthlyContribution * n;
    } else {
      nominal =
        initialInvestment * Math.pow(1 + monthlyRate, n) +
        monthlyContribution * ((Math.pow(1 + monthlyRate, n) - 1) / monthlyRate);
    }

    // Vereinfachte Steuerannahme: Verkauf am betrachteten Zeitpunkt.
    const gain = Math.max(0, nominal - totalInvested);
    if (enableTaxes) {
      nominal -= gain * TAX_RATE;
    }

    let displayValue = nominal;
    if (enableInflation) {
      displayValue = nominal / Math.pow(1 + monthlyInflation, n);
    }

    labels.push((m / 12).toFixed(1));
    invested.push(totalInvested);
    wealth.push(displayValue);

    if (config.volatility > 0) {
      upperBand.push(displayValue * (1 + config.volatility));
      lowerBand.push(Math.max(0, displayValue * (1 - config.volatility)));
    }
  }

  const finalInvested = invested[invested.length - 1];
  const finalWealth = wealth[wealth.length - 1];
  const gain = finalWealth - finalInvested;
  const returnPct = finalInvested === 0 ? 0 : gain / finalInvested;

  const breakEvenMonth = wealth.findIndex((value, index) => value > invested[index]);

  return {
    label: config.label,
    color: config.color,
    volatility: config.volatility,
    labels,
    invested,
    wealth,
    upperBand,
    lowerBand,
    finalInvested,
    finalWealth,
    gain,
    returnPct,
    breakEvenMonth,
    annualNetBeforeTax,
  };
}

function buildDatasets(seriesResults) {
  const datasets = [];

  // Einzahlungen nur einmal zeigen (für den Vergleich identisch)
  const investedLine = seriesResults[0]?.invested || [];
  datasets.push({
    label: "Gesamteinzahlungen",
    data: investedLine,
    borderColor: "#f59e0b",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.2,
  });

  seriesResults.forEach((s) => {
    datasets.push({
      label: `${s.label} Vermögen`,
      data: s.wealth,
      borderColor: s.color,
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.2,
    });

    if (s.volatility > 0) {
      datasets.push({
        label: `${s.label} Schwankungsobergrenze`,
        data: s.upperBand,
        borderColor: s.color,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0.2,
      });

      datasets.push({
        label: `${s.label} Schwankungsbereich`,
        data: s.lowerBand,
        borderColor: "rgba(0,0,0,0)",
        backgroundColor: `${s.color}22`,
        pointRadius: 0,
        fill: "-1",
        tension: 0.2,
      });
    }
  });

  return datasets;
}

function renderResults(seriesResults, params) {
  dom.results.innerHTML = "";

  seriesResults.forEach((s) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.style.borderLeftColor = s.color;

    const breakEvenText =
      s.breakEvenMonth === -1 ? "Nicht erreicht" : `${(s.breakEvenMonth / 12).toFixed(1)} Jahre`;

    card.innerHTML = `
      <h3>${s.label}</h3>
      <div class="stat"><span>Gesamteinzahlungen</span><strong>${euro.format(s.finalInvested)}</strong></div>
      <div class="stat"><span>Endvermögen</span><strong>${euro.format(s.finalWealth)}</strong></div>
      <div class="stat"><span>Gewinn</span><strong>${euro.format(s.gain)}</strong></div>
      <div class="stat"><span>Rendite</span><strong>${pct(s.returnPct)}</strong></div>
      <div class="stat"><span>Break-even</span><strong>${breakEvenText}</strong></div>
    `;

    dom.results.appendChild(card);
  });

  dom.assumptions.textContent = `Annahmen: Kosten ${params.annualCosts * 100}% p.a., ` +
    `Steuern ${params.enableTaxes ? "an" : "aus"}, Inflation ${params.enableInflation ? `an (${params.inflationRate * 100}% p.a.)` : "aus"}.`;
}

function renderChart(seriesResults) {
  const ctx = document.getElementById("wealthChart");

  if (wealthChart) {
    wealthChart.destroy();
  }

  wealthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: seriesResults[0]?.labels ?? [],
      datasets: buildDatasets(seriesResults),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Jahre" },
        },
        y: {
          title: { display: true, text: "Vermögen in €" },
          ticks: {
            callback: (value) => euro.format(value),
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            filter: (item) => !item.text.includes("Schwankungsobergrenze"),
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${euro.format(context.parsed.y)}`;
            },
            afterBody(items) {
              const index = items[0].dataIndex;
              const invested = seriesResults[0].invested[index];
              const value = items[0].parsed.y;
              const gain = value - invested;
              return [`Einzahlungen: ${euro.format(invested)}`, `Gewinn: ${euro.format(gain)}`];
            },
          },
        },
      },
    },
  });
}

function readParams() {
  return {
    monthlyContribution: Number(dom.monthlyContribution.value),
    initialInvestment: Number(dom.initialInvestment.value),
    months: Number(dom.years.value) * 12,
    annualCosts: Number(dom.annualCosts.value) / 100,
    enableTaxes: dom.enableTaxes.checked,
    enableInflation: dom.enableInflation.checked,
    inflationRate: Number(dom.inflationRate.value) / 100,
    customReturn: dom.customReturn.value === "" ? null : Number(dom.customReturn.value) / 100,
  };
}

function runCalculation() {
  const selectedAssets = getSelectedAssets();
  if (selectedAssets.length === 0) {
    dom.results.innerHTML = "<p>Bitte mindestens eine Anlageform auswählen.</p>";
    return;
  }

  const params = readParams();
  const seriesResults = selectedAssets.map((assetKey) => calculateSeries(params, ASSET_CONFIG[assetKey]));
  renderResults(seriesResults, params);
  renderChart(seriesResults);
}

function toggleTheme() {
  document.body.classList.toggle("light");
  const light = document.body.classList.contains("light");
  dom.themeToggle.textContent = light ? "🌙 Dark Mode" : "☀️ Light Mode";
  localStorage.setItem("sparplan_theme", light ? "light" : "dark");
}

function saveScenario() {
  const payload = {
    monthlyContribution: dom.monthlyContribution.value,
    initialInvestment: dom.initialInvestment.value,
    years: dom.years.value,
    customReturn: dom.customReturn.value,
    annualCosts: dom.annualCosts.value,
    enableTaxes: dom.enableTaxes.checked,
    enableInflation: dom.enableInflation.checked,
    inflationRate: dom.inflationRate.value,
    assets: getSelectedAssets(),
  };
  localStorage.setItem("sparplan_scenario", JSON.stringify(payload));
  alert("Szenario gespeichert.");
}

function loadScenario() {
  const raw = localStorage.getItem("sparplan_scenario");
  if (!raw) {
    alert("Kein gespeichertes Szenario gefunden.");
    return;
  }

  const data = JSON.parse(raw);
  dom.monthlyContribution.value = data.monthlyContribution;
  dom.initialInvestment.value = data.initialInvestment;
  dom.years.value = data.years;
  dom.customReturn.value = data.customReturn;
  dom.annualCosts.value = data.annualCosts;
  dom.enableTaxes.checked = data.enableTaxes;
  dom.enableInflation.checked = data.enableInflation;
  dom.inflationRate.value = data.inflationRate;

  document.querySelectorAll('input[name="asset"]').forEach((cb) => {
    cb.checked = data.assets.includes(cb.value);
  });

  runCalculation();
}

function exportChartAsPng() {
  if (!wealthChart) return;
  const link = document.createElement("a");
  link.download = "sparplan-vergleich.png";
  link.href = wealthChart.toBase64Image();
  link.click();
}

function initTheme() {
  const storedTheme = localStorage.getItem("sparplan_theme");
  if (storedTheme === "light") {
    document.body.classList.add("light");
    dom.themeToggle.textContent = "🌙 Dark Mode";
  } else {
    dom.themeToggle.textContent = "☀️ Light Mode";
  }
}

function bindEvents() {
  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runCalculation();
  });

  dom.form.addEventListener("input", () => runCalculation());
  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.saveScenario.addEventListener("click", saveScenario);
  dom.loadScenario.addEventListener("click", loadScenario);
  dom.exportChart.addEventListener("click", exportChartAsPng);
}

initTheme();
bindEvents();
runCalculation();
