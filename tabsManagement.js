import {data} from './editor.js';

//import {Tabulator} from 'tabulator-tables';

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
let list = document.getElementById("tabsList"); // list of tab elements
var chart = new ApexCharts(document.querySelector("#chart"), {
  chart: {
    type: 'scatter'
  },
  series: [{
  }],
  xaxis: {
  }
})
chart.render()

// Creates an array of series keys
// @def true if only reuturns stocks for default
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

// Adds the options for the x and y axes
function addOptions(){
  const series = seriesKeys(false);
  let x = document.getElementById("xAxis"); // refers to x-axis select node
  let y = document.getElementById("yAxis"); // refers to y-axis div node
  
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

// Opens and initializes the form popup
function openForm(){
  if (data == null){ // ensures that the simulation has been run first
    alert("The simulation must be run first.");
    return;
  }
  addOptions(); // dynamically adds in the options
  let form = document.getElementById("popForm");
  form.style.display = "block"; // display form
}

// Will validate and add tab data
function submit(){
  let inputs = document.getElementsByTagName('input');
  for (let i = 0; i < inputs.length; i++) {
    if (inputs.item(i).type == 'checkbox') {
      if (inputs.item(i).checked == true){
        initializeTab(); // add data if valid
        return false; // want to return false to disable default submission
      }
    }
  }
  alert("At least one box must be checked."); // no alert if at least one is checked
}

// Resets the options so that it updates the options
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

// Enter objects into tabs data array
function initializeTab() {
  let form = document.forms["tabConfig"];
  
  // gets all y axis values
  var y = [];
  let inputs = document.getElementsByTagName('input');
  for (let i = 0; i < inputs.length; i++) {
    if (inputs.item(i).type == 'checkbox') {
      if (inputs.item(i).checked == true){
        y.push(inputs.item(i).value);
      }
    }
  }

  var x; // gets the correct x-axis value
  if(form["model_type"].value == "table" && form["xAxis"].value != "time"){ // alerts if x-axis was anything but time for tables
    x = "time" // auto-corrects the answer
    alert("The x-axis must always be time for tables. (corrected)");
  }
  else
    x = form["xAxis"].value;

  var tab = new Graphic(form["model_type"].value, x, y); // initializes the Graphic object
  tabs.push(tab); // add to end of array
  document.getElementById("popForm").style.display = "none"; // hide form
  form.reset(); // reset input
  resetOptions(); // reset options
}

// Array listener
/* @arr array you want to listen to
   @callback function that will be called on any change inside array
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

// Configures dynamic tabs
function configTabs(){
  // reset for updating
  while (list.firstChild) { // removes all child elements
    list.removeChild(list.lastChild);
  }
  
  for(let j = 0; j < tabs.length; j++){
    const delButton = document.createElement("button"); 
    delButton.innerHTML = '<i style="font-size: 2vw;" class="fa fa-close"></i>'; // Font Awesome 4 icon button
    delButton.style.backgroundColor = "inherit";
    delButton.style.border = "none";
    
    const tab = document.createElement("div"); // Tabs are divs to allow button children
    var node;
    if(j == 0) 
      node = document.createTextNode("Default");  // name of default tab
    else
      node = document.createTextNode("Tab_" + j);  // Tab name based on index
    tab.class = "graphTabs";
    tab.style.border = "1px solid black";
    tab.style.borderRadius = "5px";
    tab.style.fontSize = "min(28px, 2vw)";
    tab.style.margin = "5px";
    tab.style.padding = "2px";
    if(j != 0)  // default tab is not deletable
      tab.appendChild(delButton);
    tab.appendChild(node);
    list.appendChild(tab);
    
    delButton.addEventListener("click", function tabDelete(){ 
      let i = Number(tab.lastChild.nodeValue.charAt(4)); // gets the correct index
      tabs.splice(i, 1); // removes one value from i
      list.childNodes[i-1].click(); // switches to previous tab
    });

    tab.addEventListener("click", function render() {
      var i = this.lastChild.nodeValue.charAt(4); // Reads the text node
      if(i == "u") // i = 0 if default
        i = 0;
      else
        i = Number(i); // gets the number
      
      var tabInfo = tabs[i];
      if (tabInfo.type == "chart") {
        document.getElementById('chart').hidden = false;
        document.getElementById('datatable').hidden = true;
        
        var options = {
          series: [
          ],
          chart: {
            type: 'scatter',
            zoom: {
              enabled: true,
              type: 'xy'
            },
            height: "100%",
            width: "100%"
           },
          dataLabels: {
            enabled: false
          },

          legend: {showForSingleSeries: true},
          xaxis: {
          tickAmount: 10,
          labels: {
            formatter: function(val) {
              return parseFloat(val).toFixed(1)
            }
          }
        },
        yaxis: {
          tickAmount: 7
        }
        };

        var xValues = getAllValues(tabInfo.xAxis, data);
        if(xValues == null){ // deletes tab and sends alert when data is deleted
          alert("There is missing data in this tab. (corrected)");
          this.firstChild.click(); // Auto-clicks delete button
          return;
        }

        for (var yName of tabInfo.yAxis) {
          var yValues = getAllValues(yName, data);
          if(yValues == null){ // deletes tab and sends alert when data is deleted
            alert("There is missing data in this tab. (corrected)");
            this.firstChild.click(); // Auto-clicks delete button
            return;
          }
          options.series.push({
            name : yName,
            data : yValues.map((x, idx) => [xValues[idx], x])
          });
        }

        options.xaxis.title = {text: tabInfo.xAxis};

        chart.updateOptions(options, true)
        
      } else {
        
        document.getElementById('chart').hidden = true;
        document.getElementById('datatable').hidden = false;
        
        var xValues = getAllValues(tabInfo.xAxis, data);
        if(xValues == null){ // deletes tab and sends alert when data is deleted
          alert("There is missing data in this tab. (corrected)");
          this.firstChild.click(); // Auto-clicks delete button
          return;
        }
        
        //console.log(tabInfo.yAxis);
        //console.log(getAllValues(yName, data));
        var tableData = [];
        var tableColumns = [{
          title: "time",
          field: "time"
        }];

        for (var i = 0; i < xValues.length; i++) {
          var x = {id : i};
          x[tabInfo.xAxis] = xValues[i];

          tableData.push(x);
        }
          
        
        for (var yName of tabInfo.yAxis) {
          var yValues = getAllValues(yName, data);
          if(yValues == null){ // deletes tab and sends alert when data is deleted
            alert("There is missing data in this tab. (corrected)");
            this.firstChild.click();
            return;
          }
          for (var i = 0; i < tableData.length; i++) {
            console.log(tableData[i]);
            tableData[i][yName] = yValues[i];
          }
          tableColumns.push({
            title : yName,
            field : yName,
          });
        }

        console.log(tableData);
        console.log(tableColumns);

        var table = new Tabulator("#datatable", {
          height:500, // set height of table (in CSS or here), this enables the Virtual DOM and improves render speed dramatically (can be any valid css height value)
          data:tableData, //assign data to table
          layout:"fitColumns", //fit columns to width of table (optional)
          columns: tableColumns,
        });
        
        table.on("tableBuilt", () => {
          //making sure table is built
          //table.setPage(2);
        });

      }
      // indicates the active tab
      for (var t = 0; t < list.childNodes.length; t++){
        list.childNodes[t].style.backgroundColor = "white";
      }
      
      this.style.backgroundColor = "#ddd";
  })
}
}

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
document.addEventListener("DOMContentLoaded", function() { configTabs(); });
document.getElementById("runButton").addEventListener("click", function() { tabs[0] = new Graphic("chart", "time", seriesKeys(true).splice(1)); configTabs(); list.firstChild.click(); }); // updates data and goes to default
document.getElementById("addTab").addEventListener("click", function() { openForm(); });
document.getElementById("submitModel").addEventListener("click", function() { submit(); });
