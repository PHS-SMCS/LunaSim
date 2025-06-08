/* Authors: Sienna Simms, Aditya Patil, Karthik S. Vedula
 * This file contains the code for the tabs management system and rendering of charts and tables.
 */

import {data} from './editor.js';
import { PERFORMANCE_MODE } from "./editor.js";


var TESTING_MODE = false;

/**
 * Displays a popup notification with a given message.
 * @function
 * @param {string} msg - The message to show in the popup.
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

var chart = new ApexCharts(document.querySelector("#chart"), {
  chart: {
    type: 'scatter',
    foreColor: (sessionStorage.getItem("darkMode") == "true" ? '#ffffff' : '#373d3f')
  },
  series: [{
  }],
  xaxis: {
    
  },
})
chart.render()

/**
 * Returns an array of available series keys from simulation data.
 * @function
 * @param {boolean} def - If true, only returns stock names (default display).
 * @returns {string[]} An array of valid variable names for graphing.
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
  addOptions(); // dynamically adds in the options

  let form = document.getElementById("popForm");
  document.getElementById("grayEffectDiv").style.display = "block";
  form.style.display = "block"; // display form
}

/**
 * Validates form input and submits a new chart/table tab.
 * @function
 * @returns {boolean} False to prevent default form submission.
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
  resetOptions(); // reset options
}

/**
 * Watches an array for structural changes (e.g., push, pop, splice) and triggers a callback.
 * @function
 * @param {Array} arr - The array to observe.
 * @param {Function} callback - The function to call when the array changes.
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
    // Use different icon classes based on tab type
    icon.className = (tabs[j].type === "table")
      ? "fa-regular fa-table"
      : "fa-regular fa-chart-sine";

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

      if (tabInfo.type === "chart") {
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
            title: { text: tabInfo.xAxis }
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

          options.series.push({
            name: yName,
            data: yValues.map((y, idx) => [xValues[idx], y])
          });
        }

        options.yaxis.min = minyValue;
        options.yaxis.max = maxyValue;

        chart.updateOptions(options, true);

        if (PERFORMANCE_MODE) console.timeEnd('Chart Render Time');

      } else {
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

          tableColumns.push({ title: yName, field: yName });
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
document.getElementById("runButton").addEventListener("click", function () {
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
    chart.dataURI().then(({ imgURI }) => {
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
  `;
}
