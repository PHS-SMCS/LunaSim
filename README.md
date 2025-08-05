# <img src="img/favicons/lunaLogo.svg" alt="drawing" width="25"/> LunaSim: A Lightweight, Web-Based, System Dynamics Modelling Software
> :warning: LunaSim uses the [GoJS Library](https://gojs.net/), which is free for non-commercial, non-production use.  For commercial/production use, please obtain a license from them.


### **Try a demo here: [lunasim.org](https://lunasim.org)**

[System dynamics modeling](https://systemdynamics.org/what-is-system-dynamics/) is the process of graphically outlining various elements and their interactions in a complex system (which often represents real-world mechanisms) and 
simulating them to get theoretical results on how that system will play out over a period of time. LunaSim allows the user to model using system dynamics (specifically [stock-
and-flow diagrams](https://thesystemsthinker.com/step-by-step-stocks-and-flows-converting-from-causal-loop-diagrams/)) in the browser.  

LunaSim includes a graphical editor that facilitates the creation of stock and flow diagrams, incorporates JavaScript-based equations for elements in the simulation, 
simulates using numerical methods, and facilitates the creation of web-based, user-defined charts and tables that display simulation results. 

## User Manual & Hosting

Check out the `UserDocumentation.html` file for information on how to use LunaSim.  LunaSim is a static web app, so any static webpage hosting service (such as Github Pages or 
an AWS S3 Bucket) can be used for running this application.

## Features

### Model Editor

The model editor allows the user to create stocks, clouds, variables, flows, and influences.  All of these entities and their labels can be easily moved around for visual organization.
Each entity corresponds to an entry in the equation editor table, in which the user can enteri in corresponding equations for each element. Ghosts (visual copies of elements)
are signified by a dollar symbol (`$`) being included in front of the element name.  These equations are written in JavaScript code (meaning all JS syntax like if-statements and 
even `Math` library are included).

![Image](./img/ModelSimView.png)
_Model Editor_

![Image](./img/newEqEditor.png)
_Equation Editor Table_

### Data Visualization

LunaSim allows custom tables and charts to be created to record and visualize model results.  Tables are created through the [tabulator.js](https://tabulator.info/) library and charts
are created through the [ApexCharts.js](https://apexcharts.com/) library.

![Image](./img/TableView.png)
_Tables in LunaSim_

![Image](./img/SpringView.png)
_Graphs in LunaSim_
