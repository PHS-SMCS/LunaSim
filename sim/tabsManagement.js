
/**
 * @fileoverview Manages Switching between editor and charts and tables tabs
 * @module TabsManagement
 * @author Authors: Karthik S. Vedula, Sienna Simms, Aditya Patil, Ryan Chung, Arjun Mujudar, Akash Saran
 */

import {data} from './editor.js';
import { PERFORMANCE_MODE } from "./editor.js";
import { getUnitForName } from "./editor.js";
import { runMonteCarlo, sampleDistribution } from './monteCarlo.js';


var TESTING_MODE = false;

// ── Monte Carlo results store ─────────────────────────────────────────────────
// Keyed by tab index. Cleared when a new MC run is pushed.
window._mcResultsStore = window._mcResultsStore || {};

/**
 * Displays a popup notification with a given message.
 * @function
 * @param {string} msg - The message to show in the popup.
 * @memberOf module:TabsManagement
 */

function showPopup(msg) {
  var popupNotif = document.getElementById("popupNotif");
  var popupNotifText = document.getElementById("popupNotifText");
  popupNotifText.innerHTML = msg;
  popupNotif.style.visibility = "visible";
}

// Object class to create charts and tables
class Graphic {
  constructor(type, xAxis, yAxis){
    this.type = type;
    this.xAxis = xAxis;
    this.yAxis = yAxis;
  }
}

// Where the tab data is stored
var tabs = [new Graphic("chart", "time", [])]; // default tab info
if(sessionStorage.tabsData)
  tabs = JSON.parse(sessionStorage.tabsData);

let list = document.getElementById("tabsList"); // list of tab elements

function createStandardChart() {
  return new ApexCharts(document.querySelector("#chart"), {
  chart: {
    type: 'scatter',
    foreColor: (sessionStorage.getItem("darkMode") == "true" ? '#ffffff' : '#373d3f')
  },
  series: [{
  }],
  xaxis: {
    
  },
  });
}
var chart = createStandardChart();
chart.render();

function removeMCSelector() {
  const selector = document.getElementById("mcVarSelector");
  if (selector) selector.remove();
}

function ensureStandardChart() {
  if (window._mcChartInstance) {
    window._mcChartInstance.destroy();
    window._mcChartInstance = null;
    chart = null;
  }
  removeMCSelector();
  if (!chart) {
    const chartEl = document.getElementById("chart");
    chartEl.innerHTML = "";
    chart = createStandardChart();
    chart.render();
  }
  return chart;
}

/**
 * Returns an array of available series keys from simulation data.
 * @function
 * @param {boolean} def - If true, only returns stock names (default display).
 * @returns {string[]} An array of valid variable names for graphing.
 * @memberOf module:TabsManagement
 */

function seriesKeys(def){
  const series = ["time"]; // time as an option

  for (var x in data.stocks) { // gets the keys of the stocks
    series.push(x);

    if (def == false) { // not included in default
      for (var inflow in data.stocks[x].inflows) { // gets the keys of the inflows
        if (!series.includes(inflow)) { // avoids repeats
          series.push(inflow);
        }
      }
      for (var outflow in data.stocks[x].outflows) { // gets the keys of the inflows
        if (!series.includes(outflow)) { // avoids repeats
          series.push(outflow);
        }
      }    
    }
  }
  
  if (def == false){ // not included in default
    for (var y in data.converters) { // gets the keys of the variables
      series.push(y);
    }
  }

  return series;
}

/**
 * Populates the X and Y axis selectors in the chart/table creation form.
 * Dynamically creates options based on available simulation series.
 * @function
 * @memberOf module:TabsManagement
 */

function addOptions(){
  const series = seriesKeys(false);
  let x = document.getElementById("xAxis"); // refers to x-axis select node
  let y = document.getElementById("yAxis"); // refers to y-axis div node

  x.innerHTML = "";
  y.innerHTML = "";
  
  // Configuration for buttons of x-axis
  for (var i = 0; i < series.length; i++){
    const opt = document.createElement("option"); // Creates an option
    var node = document.createTextNode(series[i]); // Assigns text node (used exterally)
    opt.appendChild(node);
    opt.value = series[i]; // Assigns value (used interally)

    x.appendChild(opt);
  }

  // Configuration for buttos for y-axis
  for (var i = 1; i < series.length; i++){ // do not want to include time
    const row = document.createElement("tr"); // row for input
    const d1 = document.createElement("td"); // where checkboxes will go
    const d2 = document.createElement("td"); // where labels will go
    
    const opt = document.createElement("input"); // Creates an input
    opt.type = "checkbox"; // The input is a checkbox
    opt.value = series[i];
    opt.name = "yAxis";
    opt.className = "yAxisCheckbox";
    d1.appendChild(opt);

    const label = document.createElement("label"); // Creates a label
    label.for = i;
    var node = document.createTextNode(series[i]); // Assigns text node to label
    label.appendChild(node);
    d2.appendChild(label);

    // putting into the table
    row.appendChild(d1);
    row.appendChild(d2);
    y.appendChild(row);
  }
}

/**
 * Opens the tab configuration form for adding a new chart or table.
 * Checks for valid simulation data before displaying the form.
 * @function
 * @memberOf module:TabsManagement
 */

function openForm(){
  if (data == null){ // ensures that the simulation has been run first
    showPopup("Run the simulation first.");
    return;
  }
  if (seriesKeys(false).length === 1){
    showPopup("Create a model first.");
    return;
  }
  const modelType = document.getElementById("model_type");
  modelType.value = "chart";
  modelType.dispatchEvent(new Event("change"));
  addOptions(); // dynamically adds in the options

  let form = document.getElementById("popForm");
  document.getElementById("grayEffectDiv").style.display = "block";
  form.style.display = "block"; // display form
}

/**
 * Validates form input and submits a new chart/table tab.
 * @function
 * @returns {boolean} False to prevent default form submission.
 * @memberOf module:TabsManagement
 */

function submit() {
  let form = document.forms["tabConfig"];
  let nameInput = document.getElementById("tab_name");
  let nameError = document.getElementById("nameValidation");

  const name = nameInput.value.trim();

  // Validate name
  if (!name) {
    nameInput.classList.add("invalid");
    nameError.classList.remove("hidden");
  } else {
    nameInput.classList.remove("invalid");
    nameError.classList.add("hidden");
  }

  // Validate Y-axis checkboxes
  let ySelected = false;
  let inputs = document.getElementsByClassName('yAxisCheckbox');
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].checked) {
      ySelected = true;
      break;
    }
  }

  if (!ySelected) {
    showPopup("Check at least one Y-axis box.");
  }

  // Abort submit if validations fail
  if (!name || !ySelected) return false;

  // Proceed
  initializeTab(); // push new tab
  return false;
}


/**
 * Clears all current X and Y axis options from the form UI.
 * @function
 * @memberOf module:TabsManagement
 */

function resetOptions(){
  let x = document.getElementById("xAxis"); // refers to x-axis select node
  while (x.firstChild) { // removes all child elements
    x.removeChild(x.lastChild);
  }

  let y = document.getElementById("yAxis"); // refers to y-axis div node
  while (y.firstChild) { // removes all child elements
    y.removeChild(y.lastChild);
  }
}

/**
 * Adds a new tab to the tabs array based on form input values.
 * Automatically switches to the new tab after creation.
 * @function
 * @memberOf module:TabsManagement
 */

function initializeTab() {
  let form = document.forms["tabConfig"];
  
  // gets all y axis values
  var y = [];
  let inputs = document.getElementsByTagName('input');
  for (let i = 0; i < inputs.length; i++) {
    if (inputs.item(i).className == 'yAxisCheckbox') {
      if (inputs.item(i).checked == true){
        y.push(inputs.item(i).value);
      }
    }
  }

  var x; // gets the correct x-axis value
  if(form["model_type"].value == "table" && form["xAxis"].value != "time"){ // alerts if x-axis was anything but time for tables
    x = "time" // auto-corrects the answer
    showPopup("The x-axis must always be time for tables. (corrected)");
  }
  else
    x = form["xAxis"].value;

  var tab = new Graphic(form["model_type"].value, x, y);
  tab.name = form["tab_name"].value || "Chart " + (tabs.length); // fallback if blank
  tabs.push(tab); // add to end of array
  setTimeout(() => list.lastChild.click(), 0);
  document.getElementById("popForm").style.display = "none"; // hide form
  document.getElementById("grayEffectDiv").style.display = "none";
  form.reset(); // reset input
  document.getElementById("model_type").value = "chart";
  document.getElementById("model_type").dispatchEvent(new Event("change"));
  resetOptions(); // reset options
}

/**
 * Watches an array for structural changes (e.g., push, pop, splice) and triggers a callback.
 * @function
 * @param {Array} arr - The array to observe.
 * @param {Function} callback - The function to call when the array changes.
 * @memberOf module:TabsManagement
 */

function listenChangesinArray(arr,callback){
     // Add more methods here if you want to listen to them
    ['pop','push','reverse','shift','unshift','splice','sort'].forEach((m)=>{
        arr[m] = function(){
                     var res = Array.prototype[m].apply(arr, arguments);  // call normal behaviour
                     callback.apply(arr, arguments);  // finally call the callback supplied
                     return res;
                 }
    });
}

/**
 * Rebuilds the tab list UI from the current `tabs` array and sets up event listeners.
 * Handles both chart and table rendering logic upon tab selection.
 * @function
 * @memberOf module:TabsManagement
 */

function configTabs() {
  sessionStorage.tabsData = JSON.stringify(tabs); // updates session storage
  if (TESTING_MODE) console.log(tabs);

  // Clear current tab list
  while (list.firstChild) {
    list.removeChild(list.lastChild);
  }

  // Rebuild tab list
  for (let j = 0; j < tabs.length; j++) {
    const tab = document.createElement("li");
    tab.className = "graphTabs";
    if (j === 0) {
      tab.classList.add("graphTabsActive"); // default selection
    }

    tab.dataset.index = j; // safer indexing

    const tabLink = document.createElement("a");
    tabLink.href = "#";

    const icon = document.createElement("i");
    icon.className = "material-symbols-outlined"; // Google Material Symbols

    // Set the appropriate icon text for each type
    icon.textContent = (tabs[j].type === "table") ? "table" : (tabs[j].type === "montecarlo") ? "casino" : "bar_chart_4_bars";

    const label = document.createElement("span");
    const chartName = tabs[j].name || ((j === 0) ? "Default" : "Chart " + j);
    label.textContent = chartName;
    tab.setAttribute("data-tooltip", chartName);


    tabLink.appendChild(icon);
    tabLink.appendChild(label);
    tab.appendChild(tabLink);
    list.appendChild(tab);

    // Tab click handler
    tab.addEventListener("click", function render() {
      if (!data) {
        showPopup("Run the simulation first.");
        return;
      }

      let i = Number(this.dataset.index);
      const tabInfo = tabs[i];

      if (!tabInfo) {
        showPopup("Tab data missing.");
        return;
      }

      // Remove active class from all
      tabsList.querySelectorAll("li").forEach(t => t.classList.remove("graphTabsActive"));

      // Add active to clicked one
      tab.classList.add("graphTabsActive");


      updateChartStats(i);
      // Visual active state
      list.querySelectorAll("li").forEach(t => t.classList.remove("graphTabsActive"));
      this.classList.add("graphTabsActive");

      // ── Monte Carlo tab ──────────────────────────────────────────────────
      if (tabInfo.type === "montecarlo") {
        const chartEl = document.getElementById('chart');
        const tableEl = document.getElementById('datatable');
        chartEl.hidden = false;
        tableEl.hidden = true;

        const mcData = tabInfo._mcData || window._mcResultsStore[i];
        if (!mcData) {
          // Results lost on page refresh — inform user
          chart.updateOptions({
            series: [],
            title: { text: "Monte Carlo results not available. Please re-run the simulation.", align: 'center' },
            chart: { type: 'rangeArea', height: "100%", width: "100%" }
          }, true);
          return;
        }
        renderMonteCarloChart(mcData, tabInfo.mcVariable || Object.keys(mcData.percentiles)[0]);
        return;
      }

      if (tabInfo.type === "chart") {
        ensureStandardChart();
        if (PERFORMANCE_MODE) console.time('Chart Render Time');

        const chartEl = document.getElementById('chart');
        const tableEl = document.getElementById('datatable');

        if (!chartEl || !tableEl) {
          showPopup("Chart or table container not found in DOM.");
          return;
        }

        chartEl.hidden = false;
        tableEl.hidden = true;

        const options = {
          series: [],
          chart: {
            type: 'scatter',
            zoom: { enabled: true, type: 'xy' },
            height: "100%",
            width: "100%"
          },
          dataLabels: { enabled: false },
          legend: { showForSingleSeries: true },
          xaxis: {
            tickAmount: 10,
            labels: {
              formatter: val => parseFloat(val).toFixed(1)
            },
            title: {
              text: (() => {
                const xUnit = getUnitForName(tabInfo.xAxis);
                return xUnit ? `${tabInfo.xAxis} (${xUnit})` : tabInfo.xAxis;
              })()
            }
          },
          yaxis: {
            forceNiceScale: false,
            labels: {
              formatter: val => parseFloat(val).toFixed(1)
            }
          },
          tooltip: {
            x: { formatter: val => parseFloat(val).toFixed(10) },
            y: { formatter: val => parseFloat(val).toFixed(10) }
          }
        };

        let maxyValue = Number.MIN_VALUE;
        let minyValue = Number.MAX_VALUE;

        const xValues = getAllValues(tabInfo.xAxis, data);
        if (!xValues) {
          showPopup("There is missing data in this tab. Please delete or update it.");
          return;
        }

        for (let yName of tabInfo.yAxis) {
          const yValues = getAllValues(yName, data);
          if (!yValues) {
            showPopup("There is missing data in this tab. Please delete or update it.");
            return;
          }

          yValues.forEach(val => {
            if (val > maxyValue) maxyValue = val;
            if (val < minyValue) minyValue = val;
          });

          const yUnit = getUnitForName(yName);
          const yDisplayName = yUnit ? `${yName} (${yUnit})` : yName;

          options.series.push({
            name: yDisplayName,
            data: yValues.map((y, idx) => [xValues[idx], y])
          });
        }

        options.yaxis.min = minyValue;
        options.yaxis.max = maxyValue;

        chart.updateOptions(options, true);

        if (PERFORMANCE_MODE) console.timeEnd('Chart Render Time');

      } else {
        ensureStandardChart();
        // Table rendering
        if (PERFORMANCE_MODE) console.time('Table Render Time');

        const chartEl = document.getElementById('chart');
        const tableEl = document.getElementById('datatable');
        chartEl.hidden = true;
        tableEl.hidden = false;

        const xValues = getAllValues(tabInfo.xAxis, data);
        if (!xValues) {
          showPopup("There is missing data in this tab. Please delete or update it.");
          return;
        }

        const tableData = [];
        const tableColumns = [{
          title: "time",
          field: "time"
        }];

        xValues.forEach((val, i) => {
          const row = { id: i };
          row[tabInfo.xAxis] = val;
          tableData.push(row);
        });

        for (let yName of tabInfo.yAxis) {
          const yValues = getAllValues(yName, data);
          if (!yValues) {
            showPopup("There is missing data in this tab. Please delete or update it.");
            return;
          }

          yValues.forEach((val, i) => {
            tableData[i][yName] = val;
          });

          const yUnit = getUnitForName(yName);
          const yColTitle = yUnit ? `${yName} (${yUnit})` : yName;
          tableColumns.push({ title: yColTitle, field: yName });
        }

        window.tableInstance = new Tabulator("#datatable", {
          data: tableData,
          layout: "fitColumns",
          columns: tableColumns,
        });


        if (PERFORMANCE_MODE) console.timeEnd('Table Render Time');
      }
    });
  }
}

/**
 * Retrieves all values for a given variable or flow name from the simulation data.
 * @function
 * @param {string} name - The name of the variable or flow.
 * @param {Object} data - The simulation output data.
 * @returns {number[]|undefined} An array of numeric values, or undefined if not found.
 * @memberOf module:TabsManagement
 */

function getAllValues(name, data) {
  if (name == "time") {
    return data.timesteps;
  }
  
   for (var stock in data.stocks) {
     if (name == stock) {
       return data.stocks[stock]['values'];
     }

     for (var inflow in data.stocks[stock].inflows) {
       if (name == inflow) {
         return data.stocks[stock].inflows[inflow]['values'];
       }
     }

     for (var outflow in data.stocks[stock].outflows) {
       if (name == outflow) {
         return data.stocks[stock].outflows[outflow]['values'];
       }
     }
   }

  for (var converter in data.converters) {
    if (name == converter) {
       return data.converters[converter]['values'];
    }
  }
}



// ══════════════════════════════════════════════════════════════════════════════
// MONTE CARLO RENDERING AND UI
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Renders a Monte Carlo confidence band chart for a given variable.
 * Destroys the existing ApexCharts instance before rebuilding to avoid
 * the silent-fail bug when switching between MC and standard tabs.
 *
 * @param {Object} mcData    - { percentiles, timesteps, bandSetting }
 * @param {string} varName   - The variable to display
 */
function renderMonteCarloChart(mcData, varName) {
  const { percentiles, timesteps, bandSetting } = mcData;
  const pct = percentiles[varName];
  if (!pct) {
    showPopup("Monte Carlo data not found for: " + varName);
    return;
  }

  // Destroy old chart instance before clearing innerHTML to avoid ApexCharts bug
  if (window._mcChartInstance) {
    window._mcChartInstance.destroy();
    window._mcChartInstance = null;
  }
  if (chart) {
    chart.destroy();
    chart = null;
  }

  const chartEl = document.getElementById('chart');
  chartEl.innerHTML = "";

  // Build series based on band setting
  const series = [];

  if (bandSetting === "90" || bandSetting === "90+50") {
    series.push({
      name: "90% Band",
      type: "rangeArea",
      data: timesteps.map((t, i) => ({ x: t, y: [pct.p5[i], pct.p95[i]] }))
    });
  }
  if (bandSetting === "95") {
    series.push({
      name: "95% Band",
      type: "rangeArea",
      data: timesteps.map((t, i) => ({ x: t, y: [pct.p2_5[i], pct.p97_5[i]] }))
    });
  }
  if (bandSetting === "99") {
    series.push({
      name: "99% Band",
      type: "rangeArea",
      data: timesteps.map((t, i) => ({ x: t, y: [pct.p0_5[i], pct.p99_5[i]] }))
    });
  }
  if (bandSetting === "90+50") {
    series.push({
      name: "50% Band",
      type: "rangeArea",
      data: timesteps.map((t, i) => ({ x: t, y: [pct.p25[i], pct.p75[i]] }))
    });
  }

  // Always add the median line
  series.push({
    name: "Median (p50)",
    type: "line",
    data: timesteps.map((t, i) => ({ x: t, y: pct.p50[i] }))
  });

  const isDark = sessionStorage.getItem("darkMode") === "true";
  const foreColor = isDark ? "#ffffff" : "#373d3f";

  const newChart = new ApexCharts(chartEl, {
    series,
    chart: {
      type: "rangeArea",
      height: "100%",
      width: "100%",
      foreColor,
      toolbar: { show: true },
      zoom: { enabled: true, type: "x" }
    },
    stroke: {
      curve: "straight",
      width: series.map(s => s.type === "line" ? 2 : 0)
    },
    fill: {
      opacity: series.map(s => s.type === "rangeArea" ? 0.3 : 1)
    },
    dataLabels: { enabled: false },
    legend: { show: true },
    xaxis: {
      type: "numeric",
      tickAmount: 10,
      title: { text: "Time" },
      labels: { formatter: val => parseFloat(val).toFixed(1) }
    },
    yaxis: {
      labels: { formatter: val => parseFloat(val).toFixed(2) },
      title: { text: varName }
    },
    tooltip: {
      shared: true,
      x: { formatter: val => "t = " + parseFloat(val).toFixed(4) }
    },
    title: {
      text: "Monte Carlo: " + varName + "  [" + bandSetting + "% confidence]",
      align: "left",
      style: { fontSize: "13px" }
    }
  });

  newChart.render();
  window._mcChartInstance = newChart;

  // Build variable selector panel above chart
  buildMCVariableSelector(mcData, varName);
}

/**
 * Builds the variable-selector panel so users can switch the displayed
 * variable without re-running Monte Carlo.
 */
function buildMCVariableSelector(mcData, activeVar) {
  let panel = document.getElementById("mcVarSelector");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "mcVarSelector";
    document.getElementById("chart").before(panel);
  }
  panel.innerHTML = "";

  const label = document.createElement("span");
  label.textContent = "Variable: ";
  label.style.cssText = "font-size:12px;font-weight:600;align-self:center;";
  panel.appendChild(label);

  for (const varName of Object.keys(mcData.percentiles)) {
    const btn = document.createElement("button");
    btn.textContent = varName;
    btn.style.cssText = "font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--border,#ccc);cursor:pointer;";
    if (varName === activeVar) {
      btn.style.background = "var(--accent,#4a90e2)";
      btn.style.color = "#fff";
      btn.style.borderColor = "var(--accent,#4a90e2)";
    }
    btn.addEventListener("click", () => {
      // Update the active tab's mcVariable
      const activeTabEl = document.querySelector(".graphTabsActive");
      if (activeTabEl) {
        const idx = Number(activeTabEl.dataset.index);
        if (tabs[idx] && tabs[idx].type === "montecarlo") {
          tabs[idx].mcVariable = varName;
        }
      }
      renderMonteCarloChart(mcData, varName);
    });
    panel.appendChild(btn);
  }
}

/**
 * Opens the Monte Carlo configuration popup.
 * Checks that the simulation has been run first.
 */
function openMonteCarloPopup() {
  if (!data) {
    showPopup("Run the simulation first.");
    return;
  }
  if (!data.stocks || Object.keys(data.stocks).length === 0) {
    showPopup("Create a model first.");
    return;
  }

  buildMCDistributionTable();

  openSettings({ preventDefault: function() {} }, "monteCarloPopup");
}

/**
 * Closes the Monte Carlo popup.
 */
function closeMonteCarloPopup() {
  closeSettings("monteCarloPopup");
}

/**
 * Builds the distribution assignment table in the MC popup.
 * Lists all stocks, converters, and special stock-type parameters
 * (cookTime for microwaves, transitTime for conveyors, capacity for queues).
 */
function buildMCDistributionTable() {
  const tbody = document.getElementById("mcDistTable");
  tbody.innerHTML = "";

  const addRow = (key, displayName) => {
    const tr = document.createElement("tr");

    // Variable name cell
    const tdName = document.createElement("td");
    tdName.textContent = displayName;
    tdName.style.cssText = "padding:4px 8px;font-size:12px;font-weight:500;";
    tr.appendChild(tdName);

    // Distribution type selector
    const tdType = document.createElement("td");
    tdType.style.padding = "4px 8px";
    const sel = document.createElement("select");
    sel.className = "settings-dropdown mc-dist-type";
    sel.dataset.key = key;
    sel.style.cssText = "font-size:11px;width:100%;";
    ["fixed", "normal", "uniform", "triangular"].forEach(opt => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
      sel.appendChild(o);
    });
    tdType.appendChild(sel);
    tr.appendChild(tdType);

    // Parameters cell (changes based on dist type)
    const tdParams = document.createElement("td");
    tdParams.style.padding = "4px 8px";
    tdParams.id = "mc-params-" + key.replace(/\./g, "_");

    const buildParams = (type) => {
      tdParams.innerHTML = "";
      const inputs = { fixed: ["value"], normal: ["mean", "stddev"], uniform: ["min", "max"], triangular: ["min", "mode", "max"] };
      const defaults = { value: 1, mean: 1, stddev: 0.1, min: 0.5, max: 1.5, mode: 1 };
      (inputs[type] || []).forEach(pName => {
        const wrap = document.createElement("span");
        wrap.style.cssText = "display:inline-flex;align-items:center;gap:3px;margin-right:6px;";
        const lbl = document.createElement("label");
        lbl.textContent = pName + ":";
        lbl.style.fontSize = "10px";
        const inp = document.createElement("input");
        inp.type = "number";
        inp.autocomplete = "new-password";
        inp.setAttribute("data-form-type", "other");
        inp.setAttribute("data-lpignore", "true");
        inp.step = "any";
        inp.value = defaults[pName] || 1;
        inp.dataset.param = pName;
        inp.dataset.key = key;
        inp.style.cssText = "width:58px;font-size:11px;padding:2px 4px;";
        inp.className = "settings-input mc-param-input";
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        tdParams.appendChild(wrap);
      });
    };

    buildParams("fixed");
    sel.addEventListener("change", () => buildParams(sel.value));
    tr.appendChild(tdParams);

    tbody.appendChild(tr);
  };

  // Regular stocks
  for (const stockName of Object.keys(data.stocks)) {
    addRow(stockName, stockName + " (initial)");
    const stock = data.stocks[stockName];
    if (stock.isMicrowave) addRow(stockName + ".__cookTime__", stockName + ".cookTime");
    if (stock.isConveyor)  addRow(stockName + ".__transitTime__", stockName + ".transitTime");
    if (stock.isQueue)     addRow(stockName + ".__capacity__", stockName + ".capacity");
  }

  // Converters
  for (const convName of Object.keys(data.converters)) {
    addRow(convName, convName + " (variable)");
  }
}

/**
 * Reads the MC popup form, builds the uncertaintyMap, and runs Monte Carlo.
 */
async function runMonteCarloFromUI() {
  const N          = parseInt(document.getElementById("mcNumRuns").value) || 200;
  const bandSetting = document.getElementById("mcBandSetting").value;

  // Build uncertaintyMap from all rows that are NOT set to "fixed" OR
  // are "fixed" but the user explicitly included them.
  // We include ALL rows — fixed is effectively a no-op sampler (value stays constant).
  const uncertaintyMap = {};
  const rows = document.querySelectorAll("#mcDistTable tr");
  rows.forEach(row => {
    const sel = row.querySelector(".mc-dist-type");
    if (!sel) return;
    const key  = sel.dataset.key;
    const type = sel.value;
    if (type === "fixed") return; // skip fixed rows — no sampling needed

    const dist = { type };
    row.querySelectorAll(".mc-param-input").forEach(inp => {
      dist[inp.dataset.param] = parseFloat(inp.value) || 0;
    });
    uncertaintyMap[key] = dist;
  });

  if (Object.keys(uncertaintyMap).length === 0) {
    showPopup("Assign at least one non-fixed distribution before running.");
    return;
  }

  // Get current engine JSON from the last run
  // We re-translate to get a fresh base — editor.js exposes lastEngineJson
  const engineJson = window._lastEngineJson;
  if (!engineJson) {
    showPopup("Run the simulation first to generate engine data.");
    return;
  }

  // Update progress bar
  const progressWrap = document.getElementById("mcProgressWrap");
  const progressBar  = document.getElementById("mcProgressBar");
  const progressText = document.getElementById("mcProgressText");
  const runBtn       = document.getElementById("mcRunButton");
  progressWrap.style.display = "block";
  runBtn.disabled = true;
  runBtn.textContent = "Running...";

  try {
    const mcData = await runMonteCarlo(
      engineJson,
      uncertaintyMap,
      N,
      (completed, total) => {
        const pct = Math.round((completed / total) * 100);
        progressBar.style.width = pct + "%";
        progressText.textContent = completed + " / " + total + " runs";
      },
      bandSetting
    );

    // Store results
    const tabIndex = tabs.length;
    window._mcResultsStore[tabIndex] = mcData;

    // Build a descriptive tab name
    const distSummary = Object.entries(uncertaintyMap)
      .map(([k, d]) => {
        const shortKey = k.replace(".__cookTime__", ".cookTime")
                          .replace(".__transitTime__", ".transitTime")
                          .replace(".__capacity__", ".capacity");
        return shortKey + "-" + d.type;
      })
      .join(" ");
    const tabName = "MC " + bandSetting + "% " + distSummary;

    // Push new MC tab
    const mcTab = new Graphic("montecarlo", "time", []);
    mcTab.name = tabName;
    mcTab.mcVariable = Object.keys(mcData.percentiles)[0];
    mcTab.bandSetting = bandSetting;
    Object.defineProperty(mcTab, "_mcData", { value: mcData, writable: true, enumerable: false });
    tabs.push(mcTab);

    setTimeout(() => {
      closeMonteCarloPopup();
      list.lastChild.click();
    }, 100);

  } catch(err) {
    showPopup("Monte Carlo failed: " + err.message);
    console.error(err);
  } finally {
    progressBar.style.width = "0%";
    progressWrap.style.display = "none";
    runBtn.disabled = false;
    runBtn.textContent = "Run Monte Carlo";
  }
}


// Updates tabs buttons on side when the array is changed
listenChangesinArray(tabs, configTabs);

// Event listeners

document.addEventListener("DOMContentLoaded", function() {
  configTabs();

  const modelType = document.getElementById("model_type");
  const xAxisGroup = document.getElementById("xAxisGroup");

  modelType.addEventListener("change", () => {
    const isTable = modelType.value === "table";
    xAxisGroup.style.display = isTable ? "none" : "flex";
  });

  modelType.dispatchEvent(new Event("change"));

  document.getElementById("submitModel").addEventListener("click", submit);
});



 // updates data and goes to default
window.addEventListener("lunasim:simulation-complete", function () {
  tabs[0] = new Graphic("chart", "time", seriesKeys(true).splice(1));
  configTabs();
  list.firstChild.click();

  // AUTO SWITCH TO CHART/TABLES VIEW

  if (TESTING_MODE) console.log(tabs);
});


document.getElementById("addTab").addEventListener("click", openForm);
document.getElementById("submitModel").addEventListener("click", submit);
document.getElementById("closeNewTabPopup").addEventListener("click", function() {
  document.getElementById("popForm").style.display = "none"; // hide form
  document.getElementById("grayEffectDiv").style.display = "none";
  form.reset(); // reset input
  resetOptions(); // reset options
});

// Handle Graph Download
document.getElementById("downloadGraph").addEventListener("click", function () {
  if (!tabs || tabs.length === 0) {
    showPopup("No chart or table available to download.");
    return;
  }

  const chartEl = document.getElementById("chart");
  const tableEl = document.getElementById("datatable");

  const chartVisible = chartEl && !chartEl.hidden;
  const tableVisible = tableEl && !tableEl.hidden;

  if (chartVisible) {
    const activeChart = window._mcChartInstance || chart;
    if (!activeChart) {
      showPopup("No visible chart is available to download.");
      return;
    }
    activeChart.dataURI().then(({ imgURI }) => {
      const link = document.createElement("a");
      link.href = imgURI;
      link.download = "chart.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  } else if (tableVisible && window.tableInstance) {
    window.tableInstance.download("csv", "table.csv");
  } else {
    showPopup("No visible chart or table to download.");
  }
});


document.getElementById("deleteGraph").addEventListener("click", function () {
  if (tabs.length <= 1) {
    showPopup("Cannot delete the default tab.");
    return;
  }

  const activeTab = document.querySelector(".graphTabsActive");
  if (!activeTab) {
    showPopup("No chart is currently selected.");
    return;
  }

  const index = Number(activeTab.dataset.index);

  if (isNaN(index) || index === 0) {
    showPopup("Cannot delete the default tab.");
    return;
  }

  tabs.splice(index, 1); // Remove the tab

  configTabs(); // Rebuild the tabs

  // Activate the previous tab (or the first one if index - 1 is out of bounds)
  const newIndex = Math.max(0, index - 1);
  const newActiveTab = list.querySelector(`li[data-index="${newIndex}"]`);
  if (newActiveTab) {
    newActiveTab.click();
  }
});

/**
 * Updates the sidebar statistics display with information about the selected tab.
 * Includes name, type, axes, and simulation configuration (start, end, dt, method).
 * @function
 * @param {number} index - The index of the currently selected tab.
 * @memberOf module:TabsManagement
 */

function updateChartStats(index) {
  const statsEl = document.getElementById("chartStats");
  if (!statsEl || !tabs[index]) return;

  const tab = tabs[index];
  const name = (index === 0) ? "Default" : `Chart ${index}`;
  const type = tab.type === "table" ? "Table" : "Chart";
  const xAxis = tab.xAxis || "—";
  const yAxis = Array.isArray(tab.yAxis) ? tab.yAxis.join(", ") : "—";

  // Get simulation settings from input fields
  const startTime = parseFloat(document.getElementById("startTime")?.value) || 0;
  const endTime = parseFloat(document.getElementById("endTime")?.value) || 0;
  const dt = parseFloat(document.getElementById("dt")?.value) || 0;
  const stepCount = (endTime - startTime) / dt || 0;

  const integrationMethod = document.getElementById("integrationMethod")?.value || "—";
  const methodDisplay = (integrationMethod === "rk4") ? "Runge-Kutta 4" :
                        (integrationMethod === "euler") ? "Euler" : integrationMethod;
  const trigMode = document.getElementById("trigMode")?.value || "—";
  const trigDisplay = (trigMode === "radian") ? "Radians" :
                        (trigMode === "degree") ? "Degrees" : trigMode;

  statsEl.innerHTML = `
    <p><strong>Name:</strong> ${tab.name || name}</p>
    <p><strong>Type:</strong> ${tab.type.charAt(0).toUpperCase() + tab.type.slice(1)}</p>
    <p><strong>X-Axis:</strong> ${tab.xAxis}</p>
    <p><strong>Y-Axis:</strong> ${tab.yAxis.join(", ")}</p>
    <hr>
    <p><strong>Start Time:</strong> ${startTime}</p>
    <p><strong>End Time:</strong> ${endTime}</p>
    <p><strong>dt (Interval):</strong> ${dt}</p>
    <p><strong>Step Count:</strong> ${Math.round(stepCount)}</p>
    <p><strong>Integration Method:</strong> ${methodDisplay}</p>
    <p><strong>Trigonometry Mode:</strong> ${trigDisplay}</p>
  `;
}

// Monte Carlo button listener
const mcBtn = document.getElementById("monteCarloButton");
if (mcBtn) mcBtn.addEventListener("click", openMonteCarloPopup);
const mcRunBtn = document.getElementById("mcRunButton");
if (mcRunBtn) mcRunBtn.addEventListener("click", runMonteCarloFromUI);
const mcCloseBtn = document.getElementById("mcClosePopup");
if (mcCloseBtn) mcCloseBtn.addEventListener("click", closeMonteCarloPopup);

