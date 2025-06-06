/* Authors: Karthik S. Vedula, Sienna Simms, adapted from https://gojs.net/latest/samples/systemDynamics.html
 * This file uses the GoJS library to create a system dynamics editor.  Additionally, there is an equation editing table,
 * which allows the user to edit the equations and characteristics of the objects in the model.
 */
/**
 * Indicates whether the application is running in performance testing mode.
 * @type {boolean}
 * @default false
 */
var PERFORMANCE_MODE = false; // For testing runtime
export {PERFORMANCE_MODE};

/**
 * Simulation engine handling model execution and time-stepping logic.
 * @module engine
 */
import {Simulation} from "./engine.js";
/**
 * Translation utility for language localization or string translation.
 * @module translator
 */
import {translate} from "./translator.js";
/**
 * Tool for reshaping curved links in the diagram.
 * @module CurvedLinkReshapingTool
 */
import {CurvedLinkReshapingTool} from "./CurvedLinkReshapingTool.js";


/**
 * Global state object for the System Dynamics editor.
 * Holds the current UI mode, selected item type, and node counters.
 * @global
 * @type {Object}
 */
var SD = {
    /**
     * Current interaction mode.
     * Can be `"pointer"`, `"node"`, or `"link"`.
     * @type {string}
     */
    mode: "pointer", /**
     * Type of item to be created next.
     * Can be `"stock"`, `"cloud"`, `"variable"`, `"valve"`, etc.
     * @type {string}
     */
    itemType: "pointer", /**
     * Counter for unique node naming or IDs by type.
     * @type {Object}
     */

    nodeCounter: {stock: 0, cloud: 0, variable: 0, valve: 0}
};

/**
 * Labels for all GoJS elements in the order they were created.
 * @type {string[]}
 */
let GOJS_ELEMENT_LABELS = [];
/**
 * Set of labels for quick uniqueness checking.
 * @type {Set<string>}
 */
let GOJS_ELEMENT_LABELS_SET = new Set();
/**
 * Tracks whether the simulation has successfully run using the "Run" button.
 * @type {boolean}
 */
let simulationHasRunSuccessfully_button = false;
/**
 * Tracks whether the simulation has successfully run when switching to the simulation tab.
 * @type {boolean}
 */
let simulationHasRunSuccessfully_tab = false;


/**
 * The main GoJS diagram instance. Declared globally.
 * @type {go.Diagram}
 */
var myDiagram;
/**
 * The core simulation instance controlling the model logic.
 * @type {Simulation}
 */
var sim = new Simulation();
/**
 * The current working model data.
 * @type {*}
 */
var data;

/**
 * Timestamp of the last edit in the editor.
 * @type {Date}
 */
var lastEditDate = new Date();
/**
 * Timestamp of last export
 * @type {Date}
 */

var lastExportDate = new Date();

/**
 * Indicates whether there are unsaved edits in the model.
 * @type {boolean}
 */
var unsavedEdits = false;

/**
 * Indicates whether the user has ever exported the model yet.
 * @type {boolean}
 */

/**
 * Updates the "save status" message in the UI.
 * Reflects if there are unsaved edits and when the last edit/export occurred.
 * Runs initially and on a regular interval.
 */
var hasExportedYet = false;

function updateSaveStatus() {
    let current = new Date();
    document.getElementById("saveStatus").innerHTML =
        `${unsavedEdits ? "Unsaved Edits!" : "No Unsaved Edits"} (Last Edit: ${formatDeltaTime(current - lastEditDate)})<br>` +
        `Last Exported: ${hasExportedYet ? formatDeltaTime(current - lastExportDate) : "-"}`;
}

/**
 * Formats a time delta (in ms) into a human-readable string.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} A readable string like "Just Now", "5m ago", or "2h 15m ago".
 */
function formatDeltaTime(ms) {
    let seconds = ms / 1000;
    if (seconds < 60) return `Just Now`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;

    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    minutes %= 60;
    if (minutes > 0) return `${hours}h ${minutes}m ago`;
    return `${hours}h`;
}

// Initial and periodic update of the save status display
updateSaveStatus();
setInterval(updateSaveStatus, 10000);

/**
 * Initializes the GoJS diagram with custom tools, behaviors, and event listeners.
 * This function sets up interaction modes, tools for creating nodes and links,
 * and ensures proper behavior for simulation-specific logic like valve linking,
 * ghost cleanup, and node uniqueness.
 */
function init() {
    const $ = go.GraphObject.make;

    // Create the GoJS diagram instance and configure diagram-level properties
    myDiagram = $(go.Diagram, "myDiagram", {
        "undoManager.isEnabled": true,
        allowLink: false,
        "animationManager.isEnabled": false,

        // Custom linking tool behavior
        "linkingTool.portGravity": 0,
        "linkingTool.doActivate": function () {
            this.temporaryLink.curve = (SD.itemType === "flow") ? go.Link.None : go.Link.Bezier;
            this.temporaryLink.path.stroke = (SD.itemType === "flow") ? "blue" : "orange";
            this.temporaryLink.path.strokeWidth = (SD.itemType === "flow") ? 5 : 1;
            go.LinkingTool.prototype.doActivate.call(this);
        },

        // Custom reshaping tool for Bezier curves
        "linkReshapingTool": new CurvedLinkReshapingTool(),

        /**
         * Override for linkingTool to enforce type-specific link rules.
         * Creates a label node (valve) for "flow" links.
         */
        "linkingTool.insertLink": function (fromnode, fromport, tonode, toport) {
            myDiagram.model.setCategoryForLinkData(this.archetypeLinkData, SD.itemType);
            this.archetypeLabelNodeData = (SD.itemType === "flow") ? {category: "valve"} : null;
            this.archetypeLinkData.text = SD.itemType;

            if (SD.itemType === "flow" && (fromnode.category !== "stock" && fromnode.category !== "cloud" || tonode.category !== "stock" && tonode.category !== "cloud")) {
                return null;
            }

            if (SD.itemType === "influence" && (tonode.category === "stock" || tonode.category === "cloud")) {
                return null;
            }

            return go.LinkingTool.prototype.insertLink.call(this, fromnode, fromport, tonode, toport);
        },

        // Click-to-create tool customization for node creation
        "clickCreatingTool.archetypeNodeData": {},
        "clickCreatingTool.isDoubleClick": false,
        "clickCreatingTool.canStart": function () {
            return SD.mode === "node" && go.ClickCreatingTool.prototype.canStart.call(this);
        },
        "clickCreatingTool.insertPart": function (loc) {
            SD.nodeCounter[SD.itemType] += 1;
            let newNodeId = SD.itemType + SD.nodeCounter[SD.itemType];

            while (myDiagram.model.findNodeDataForKey(newNodeId) !== null) {
                SD.nodeCounter[SD.itemType] += 1;
                newNodeId = SD.itemType + SD.nodeCounter[SD.itemType];
            }

            this.archetypeNodeData = {
                key: newNodeId, category: SD.itemType, label: newNodeId, color: getDefaultColor(SD.itemType)
            };

            return go.ClickCreatingTool.prototype.insertPart.call(this, loc);
        }
    });

    // Add custom tool for dragging node labels
    myDiagram.toolManager.mouseMoveTools.insertAt(0, new NodeLabelDraggingTool());

    // Enable drag selection (with Ctrl key)
    myDiagram.toolManager.dragSelectingTool.canStart = function () {
        const e = myDiagram.lastInput;
        return e.control && e.left;
    };
    myDiagram.toolManager.dragSelectingTool.isEnabled = true;

    // Visual configuration for drag selection box
    myDiagram.toolManager.dragSelectingTool.box = $(go.Part, {layerName: "Tool"}, $(go.Shape, "Rectangle", {
        fill: null, stroke: "#3489eb", strokeWidth: 1
    }));
    myDiagram.toolManager.dragSelectingTool.doActivate = function () {
        this.diagram.currentCursor = "crosshair";
        go.DragSelectingTool.prototype.doActivate.call(this);
    };
    myDiagram.toolManager.dragSelectingTool.doDeactivate = function () {
        this.diagram.currentCursor = "";
        go.DragSelectingTool.prototype.doDeactivate.call(this);
    };

    /**
     * Listener for diagram changes to update the window title.
     * Triggers when diagram becomes "modified."
     */
    myDiagram.addDiagramListener("Modified", () => {
        document.title = document.title.replace(/\*.*/, "");
    });

    /**
     * Listener for model changes to manage ghost cleanup,
     * update timestamps, and refresh UI.
     */
    myDiagram.addModelChangedListener(e => {
        if (!e.isTransactionFinished) return;

        // Remove ghost nodes if they have no corresponding real node
        myDiagram.model.nodeDataArray.forEach(node => {
            if (node.category === "cloud" || node.label[0] !== "$") return;

            const nonGhostExists = myDiagram.model.nodeDataArray.some(n => n.label === node.label.substring(1) && n.category === node.category);

            if (!nonGhostExists) {
                if (node.category === "valve") {
                    myDiagram.model.linkDataArray.forEach(link => {
                        if (link.category === "flow" && link.labelKeys?.[0] === node.key) {
                            myDiagram.model.removeLinkData(link);
                        }
                    });
                }
                myDiagram.model.removeNodeData(node);
                loadTableToDiagram(); // Remove any ghost-related links
            }
        });

        updateTable();

        if (myDiagram.model.nodeDataArray.length !== 0) {
            const oldModel = sessionStorage.modelData;
            const newModel = myDiagram.model.toJson();
            sessionStorage.modelData = newModel;

            if (oldModel !== newModel) {
                lastEditDate = new Date();
                unsavedEdits = true;
                updateSaveStatus();
            }
        }
    });

    /**
     * When a "flow" link is drawn, assign a unique valve label and update diagram+table.
     */
    myDiagram.addDiagramListener("LinkDrawn", e => {
        const link = e.subject;
        if (link.category === "flow") {
            myDiagram.startTransaction("updateNode");
            SD.nodeCounter.valve += 1;
            let newNodeId = "flow" + SD.nodeCounter.valve;

            while (!labelValidator(undefined, "", newNodeId)) {
                SD.nodeCounter.valve += 1;
                newNodeId = "flow" + SD.nodeCounter.valve;
            }

            const labelNode = link.labelNodes.first();
            myDiagram.model.setDataProperty(labelNode.data, "label", newNodeId);
            myDiagram.commitTransaction("updateNode");

            updateTable();
            loadTableToDiagram();
        }
    });

    /**
     * Auto-delete any flow links whose label (valve node) was deleted.
     */
    myDiagram.addDiagramListener("SelectionDeleted", e => {
        const deletedParts = e.subject.toArray();
        const deletedValveKeys = deletedParts
            .filter(p => p instanceof go.Node && p.data.category === "valve")
            .map(p => p.data.key);

        if (deletedValveKeys.length === 0) return;

        const linksToDelete = myDiagram.model.linkDataArray.filter(link => link.category === "flow" && link.labelKeys?.some(labelKey => deletedValveKeys.includes(labelKey)));

        if (linksToDelete.length > 0) {
            myDiagram.model.startTransaction("delete flow links for removed valves");
            linksToDelete.forEach(link => myDiagram.model.removeLinkData(link));
            myDiagram.model.commitTransaction("delete flow links for removed valves");
        }
    });

    // Build node/link templates and initialize model
    buildTemplates();

    myDiagram.model = go.Model.fromJson(JSON.stringify({
        class: "GraphLinksModel", linkLabelKeysProperty: "labelKeys", nodeDataArray: [], linkDataArray: []
    }));

    setupLocalStoragePersistence(myDiagram);
}

/**
 * Replaces the current diagram model with a fresh instance of its current JSON state.
 * This is useful for forcing re-rendering or applying changes to templates or other bindings.
 */
function refreshGoJsModel() {
    const newModelData = JSON.parse(myDiagram.model.toJson());

    if (!myDiagram || !newModelData) {
        console.error("Diagram or new model data is missing.");
        return;
    }

    myDiagram.startTransaction("refresh model");
    const newModel = go.Model.fromJson(newModelData);
    myDiagram.model = newModel;
    myDiagram.commitTransaction("refresh model");
}

/**
 * Builds and defines all GoJS node and link templates used in the diagram.
 * These include "stock", "cloud", "valve", "variable" node templates, and
 * "flow" and "influence" link templates.
 *
 * Template appearance and color vary depending on the dark mode session flag.
 * Called once during initialization.
 */
function buildTemplates() {
    // COLORS (Switches depending on theme)
    var fillColor = "#f0f0f0";
    var textColor = "black";
    if (sessionStorage.getItem("darkMode") == "true") {
        fillColor = "#888888";
        textColor = "white";
    }

    // Since 2.2 you can also author concise templates with method chaining instead of GraphObject.make
    // For details, see https://gojs.net/latest/intro/buildingObjects.html
    const $ = go.GraphObject.make;

    // helper functions for the templates
    function nodeStyle() {
        return [{
            type: go.Panel.Spot,
            layerName: "Background",
            locationObjectName: "SHAPE",
            selectionObjectName: "SHAPE",
            locationSpot: go.Spot.Center
        }, new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify)];
    }

    function shapeStyle() {
        return {
            name: "SHAPE", stroke: "black", fill: fillColor, portId: "", // So a link can be dragged from the Node: see /GraphObject.html#portId
            fromLinkable: true, toLinkable: true
        };
    }

    function textStyle() {
        return [{
            stroke: textColor, font: "bold 11pt helvetica, bold arial, sans-serif", margin: 2, editable: true
        }, new go.Binding("text", "label").makeTwoWay()];
    }

    // Node templates
    myDiagram.nodeTemplateMap.add("stock", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Auto", $(go.Shape, {
            figure: "rectangle",
            fill: null,
            stroke: "dodgerblue",
            strokeWidth: 5,
            scale: 0.9,
            desiredSize: new go.Size(50, 30)
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "", function (data) {
        if (data.label && data.label.startsWith('$')) return "white";
        return "#cfcfcf";
    }).makeTwoWay(), {
        desiredSize: new go.Size(50, 30)
    }), $(go.TextBlock, textStyle(), {
        _isNodeLabel: true, alignment: new go.Spot(0.5, 0.5, 0, 30), isMultiline: false, textValidation: labelValidator
    }, new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify))));


    myDiagram.nodeTemplateMap.add("cloud", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Auto", $(go.Shape, {
            figure: "Cloud",
            fill: null,
            stroke: "dodgerblue",
            strokeWidth: 3,
            scale: 0.9,
            desiredSize: new go.Size(30, 30)
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "color").makeTwoWay(), {
        figure: "Cloud", desiredSize: new go.Size(30, 30), fill: "#f0f0f0" // default
    })));

    myDiagram.nodeTemplateMap.add("valve", $(go.Node, nodeStyle(), {
        movable: false,
        deletable: false,
        layerName: "Foreground",
        selectable: true,
        pickable: true,
        alignmentFocus: go.Spot.None
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "color").makeTwoWay(), {
        figure: "Circle",        // Always a circle
        desiredSize: new go.Size(18, 18), fill: "#3489eb",         // default fill color
        stroke: null             // no border (borderless)
    }), $(go.TextBlock, textStyle(), {
        _isNodeLabel: true, alignment: new go.Spot(0.5, 0.5, 0, 20), isMultiline: false, textValidation: labelValidator
    }, new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify))));


    myDiagram.nodeTemplateMap.add("variable", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Spot", $(go.Shape, "Ellipse", {
            fill: null, stroke: "dodgerblue", strokeWidth: 15, scale: 0.25
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "color").makeTwoWay(), {
        figure: "Ellipse", desiredSize: new go.Size(25, 25), fill: "#f0f0f0" // default
    }), $(go.TextBlock, textStyle(), {
        _isNodeLabel: true, alignment: new go.Spot(0.5, 0.5, 0, 30), isMultiline: false, textValidation: labelValidator
    }, new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify))));
    myDiagram.linkTemplateMap.add("flow", $(go.Link, {
            toShortLength: 12, layerName: "Foreground", selectionAdornmentTemplate: $(go.Adornment, $(go.Shape, {
                isPanelMain: true, stroke: "#3489eb",   // highlight color
                strokeWidth: 7,      // slightly larger than normal stroke
            }))
        }, new go.Binding("curviness", "curviness").makeTwoWay(),

        new go.Binding("fromShortLength", "", function (data) {
            return isBiflow(data) ? 8 : 0;
        }),

        // Main link path shape
        $(go.Shape, {
            stroke: "#3489eb", strokeWidth: 5
        }),

        // Forward arrow - now blue (previously gray)
        $(go.Shape, {
            fill: "#3489eb", stroke: "#3489eb", toArrow: "Standard", scale: 2.0,
        }),

        // Backward arrow - gray normally, blue when selected
        $(go.Shape, new go.Binding("visible", "", isBiflow), {
            fromArrow: "Backward", scale: 2.0
        }, new go.Binding("fill", "isSelected", function (sel) {
            return sel ? "#3489eb" : "#3489eb";
        }).ofObject(), new go.Binding("stroke", "isSelected", function (sel) {
            return sel ? "#3489eb" : "#3489eb";
        }).ofObject())));


    myDiagram.linkTemplateMap.add("influence", $(go.Link, {
        curve: go.Link.Bezier, toShortLength: 8, reshapable: true
    }, new go.Binding("curviness", "curviness").makeTwoWay(), $(go.Shape, {strokeWidth: 1.5}, new go.Binding("stroke", "isSelected", sel => sel ? "#3489eb" : "orange").ofObject()), $(go.Shape, {
        stroke: null, toArrow: "Standard", scale: 1.5
    }, new go.Binding("fill", "isSelected", sel => sel ? "#3489eb" : "orange").ofObject())));
}

/**
 * Updates the current interaction mode of the diagram (pointer, node, or link).
 * Also updates the visual state of mode buttons.
 *
 * @param {string} mode - The interaction mode to activate ("pointer", "node", or "link").
 * @param {string} itemType - The type of item associated with the mode (e.g., "stock", "flow").
 */
function setMode(mode, itemType) {
    myDiagram.startTransaction();
    document.getElementById(SD.itemType + "_button").className = SD.mode + "_normal";
    document.getElementById(itemType + "_button").className = mode + "_selected";
    SD.mode = mode;
    SD.itemType = itemType;
    if (mode === "pointer") {
        myDiagram.allowLink = false;
        myDiagram.nodes.each(n => n.port.cursor = "");
    } else if (mode === "node") {
        myDiagram.allowLink = false;
        myDiagram.nodes.each(n => n.port.cursor = "");
    } else if (mode === "link") {
        myDiagram.allowLink = true;
        myDiagram.nodes.each(n => n.port.cursor = "pointer");
    }
    myDiagram.commitTransaction("mode changed");
}

/**
 * Synchronizes the GoJS model with the values from the equation table.
 * Called whenever the user updates the table.
 *
 * Updates each node’s `equation` and `checkbox` fields in the model,
 * and reinitializes the model while preserving the diagram’s position.
 * Also sets `unsavedEdits` and updates sessionStorage.
 */
function loadTableToDiagram() {
    // get the json from the GoJS model
    var data = myDiagram.model.toJson();
    var json = JSON.parse(data);

    var $tbody = $('#eqTableBody');

    // read the equation, and checkbox values from the table
    $tbody.find('tr').each(function () {
        var name = $(this).find('input[name="name"]').val(); // get the name of the object
        let migrated = $(this).data('migrated');
        let equation = migrated ? migrated.equation : $(this).find('input[name="equation"]').val();
        let checkbox = migrated ? migrated.checkbox : $(this).find('input[name="checkbox"]').is(':checked');

        $(this).removeData('migrated');


        // update the json with the new equation and checkbox values
        $.each(json.nodeDataArray, function (i, item) {
            if (item.label === name) {
                item.equation = equation;
                item.checkbox = checkbox;
            }
        });
    });

    // get current diagram.position
    var pos = myDiagram.position;

    // update the model with the new json
    myDiagram.model = go.Model.fromJson(JSON.stringify(json));

    let oldModel = sessionStorage.modelData;
    let newModel = myDiagram.model.toJson();
    sessionStorage.modelData = newModel; // updates session storage
    if (oldModel != newModel) {
        // Update the "last edited" date
        lastEditDate = new Date();
        unsavedEdits = true;
        updateSaveStatus();
    }

    // set the diagram position back to what it was
    myDiagram.initialPosition = pos;
}

/**
 * Synchronizes the HTML equation table with the current GoJS model.
 *
 * Adds any new items from the model to the table, populates equations and
 * checkboxes if `load` is true, and removes any table entries that no
 * longer exist in the model.
 *
 * @param {boolean} [load=false] - Whether to load equation/checkbox values into the table.
 */

function updateTable(load = false) {
    var data = myDiagram.model.toJson();
    var json = JSON.parse(data);

    // get tbody by id eqTableBody
    var $tbody = $('#eqTableBody');

    // 1. add new items to table
    $.each(json.nodeDataArray, function (i, item) { // includes stocks, variables, and clouds
        if (item.label === undefined) { // if the item is a valve or cloud, skip it
            return;
        }

        // check if the item is a ghost, if so, skip it
        if (isGhost(item.label)) {
            return;
        }
        if (!GOJS_ELEMENT_LABELS_SET.has(item.label)) {
            GOJS_ELEMENT_LABELS.push(item.label);
            GOJS_ELEMENT_LABELS_SET.add(item.label);
        }
        // check if item already exists in table, if not add it
        var exists = false;
        $tbody.find('tr').each(function () {
            if ($(this).find('input[name="name"]').val() === item.label) {
                exists = true;
            }
        });

        if (!exists) {
            var category = item.category == "valve" ? "flow" : item.category; // if the item is a valve, change the category to flow

            var $tr = $('<tr>').append($('<td>').append($('<input class="eqTableInputBox">').attr('type', 'text').attr('name', 'type').attr('value', category).attr('readonly', true) // add the type of the object to the row (uneditable by user)
            ), $('<td>').append($('<input class="eqTableInputBox">').attr('type', 'text').attr('name', 'name').attr('value', item.label).attr('readonly', true) // add the name of the object to the row (uneditable by user)
            ), $('<td>').append(// make width 100% so that the equation takes up the entire column
                $("<input  class=\"eqTableInputBox\" style='width: inherit;'>").attr('type', 'text').attr('name', 'equation').css('width', '99%')),).appendTo($tbody);

            if (category === "stock" || category === "flow") {
                // append a checkbox
                $('<td>').append(// this checkbox determines if the stock is non-negative or if the flow is uniflow
                    // also has an event listener that calls the save function when the checkbox is changed (to update arrows on flows)
                    $('<input>').attr('type', 'checkbox').attr('name', 'checkbox').attr('class', 'nncheckbox').change(function () {
                        loadTableToDiagram();
                    }))
                    .appendTo($tr);
            } else {
                // if the object is a variable or cloud, add a blank column
                $('<td>').appendTo($tr);
            }

            // depending on the category, change the color of the row (only first 2 columns)
            if (category === "stock") {
                // get the first 2 columns of the row
                $tr.find('td').slice(0, 3).addClass("eqStockBox");
            } else if (category === "flow") {
                $tr.find('td').slice(0, 3).addClass("eqFlowBox");
            } else if (category === "variable") {
                $tr.find('td').slice(0, 3).addClass("eqVariableBox");
            }

            if (load) {
                // populate the equation and checkbox from json
                $tr.find('input[name="equation"]').val(item.equation);
                $tr.find('input[name="checkbox"]').prop('checked', item.checkbox);
            }
        }
    });


    // 2. remove any items that are no longer in the model
    $tbody.find('tr').each(function () {
        var name = $(this).find('input[name="name"]').val(); // get the name of the object
        var exists = false;
        $.each(json.nodeDataArray, function (i, item) {
            if (item.category !== "stock" && item.category !== "variable" && item.category !== "valve") { // excludes clouds and influences
                return;
            }

            if (item.label === name) {
                exists = true;
            }
        });

        if (!exists) {
            $(this).remove();
        }
    });
    GOJS_ELEMENT_LABELS = myDiagram.model.nodeDataArray
        .filter(n => n.label && !n.label.startsWith('$') && // skip ghosts
            n.category !== "cloud"      // skip clouds
        )
        .map(n => n.label);

}

/**
 * Determines whether a flow is a biflow (bidirectional) or uniflow (unidirectional)
 * based on the corresponding checkbox in the equation table.
 *
 * @param {Object} data - The link data object, includes label keys.
 * @param {*} _ - Unused parameter (required by GoJS binding signature).
 * @returns {boolean} True if biflow, false if uniflow.
 */
function isBiflow(data, _) {
    // search through table to get link's checkbox value
    var $tbody = $('#eqTableBody');
    var biflow = false;

    var labelKey = data.labelKeys[0]; // get the label key of the link
    // search in nodeDataArray for the key with the same labelKey
    for (var node of myDiagram.model["nodeDataArray"]) {
        if (node.key === labelKey) {
            var flowName = node.label;
        }
    }

    if (flowName[0] === '$') { // if the flow is a ghost
        flowName = flowName.substring(1); // remove the '$' from the name
    }

    $tbody.find('tr').each(function () {
        var name = $(this).find('input[name="name"]').val(); // get the name of the object
        var checkbox = $(this).find('input[name="checkbox"]').is(':checked'); // get the checkbox value of the object

        if (name === flowName) {
            biflow = !checkbox; // if checked, that means it is a uniflow
        }
    });

    return biflow;
}

/**
 * Checks whether a given label represents a ghost node.
 * Ghost nodes are identified by a '$' prefix in their label.
 *
 * @param {string} label - The label to check.
 * @returns {boolean} True if the label is a ghost label.
 */
function isGhost(label) {
    return label[0] === '$';
}

/**
 * Validates the renaming of a label in the diagram.
 * Ensures new names are not numeric or empty, are unique,
 * and if ghosting, ensures a corresponding real node exists.
 *
 * @param {Object} textblock - The GoJS TextBlock.
 * @param {string} oldstr - The original string.
 * @param {string} newstr - The new string input by the user.
 * @returns {boolean} True if valid, false if invalid.
 */

function labelValidator(textblock, oldstr, newstr) {
    if (newstr === oldstr) return true;
    if (newstr === "") return false;
    if (!isNaN(newstr)) return false;

    if (isGhost(newstr)) {
        const targetLabel = newstr.substring(1);
        const realNodeCount = myDiagram.model.nodeDataArray.filter(node => node.label === targetLabel && node.label !== oldstr && !isGhost(node.label)).length;

        return realNodeCount >= 1;
    }

    const $tbody = $('#eqTableBody');
    $tbody.find('tr').each(function () {
        const $row = $(this);
        const name = $row.find('input[name="name"]').val();
        if (name === oldstr) {
            const equation = $row.find('input[name="equation"]').val();
            const checkbox = $row.find('input[name="checkbox"]').is(':checked');
            $row.find('input[name="name"]').val(newstr);

            GOJS_ELEMENT_LABELS_SET.delete(oldstr);
            GOJS_ELEMENT_LABELS_SET.add(newstr);
            const index = GOJS_ELEMENT_LABELS.indexOf(oldstr);
            if (index !== -1) GOJS_ELEMENT_LABELS[index] = newstr;

            $row.data('migrated', {equation, checkbox});
        }
    });

    for (let i = 0; i < myDiagram.model.nodeDataArray.length; i++) {
        if (myDiagram.model.nodeDataArray[i].label === newstr) {
            return false;
        }
    }

    return true;
}

/**
 * Displays the simulation error popup by opening the appropriate settings panel.
 */
function showSimErrorPopup() {
    openSettings(event, 'simErrorPopup');
}

document.getElementById("simErrorPopupDismiss").addEventListener("click", closeSimErrorPopup);

/**
 * Closes the simulation error popup and hides the gray overlay effect.
 */
function closeSimErrorPopup() {
    document.getElementById("simErrorPopup").style.display = "none";
    document.getElementById("grayEffectDiv").style.display = "none";
}

/* Resets the Simulation Error Popup (Unused)
function resetSimErrorPopup() {
    document.getElementById("simErrorPopupTitle").innerHTML = "<b>Oops, Simulation Error! :(<b>"
    document.getElementById("simErrorPopupDesc").innerHTML = "Placeholder Message"
    document.getElementById("simErrorPopupDismiss").innerHTML = "Dismiss"
}*/

/**
 * Extracts all references from a given equation string.
 * References are enclosed in square brackets, e.g., [Stock1].
 *
 * @param {string} equation - The equation string.
 * @param {*} data - Unused (placeholder for interface compatibility).
 * @returns {string[]} Array of reference names found in the equation.
 */
function containsReference(equation, data) {
    const matches = [];
    const regex = /\[(.*?)\]/g;
    const allMatches = equation.matchAll(regex);

    for (const match of allMatches) {
        matches.push(match[1]);
    }

    return matches;
}

/**
 * The main entry point for running the simulation.
 * Loads diagram data, validates structure, extracts references and influences,
 * performs error checks on time parameters, and runs the simulation engine.
 *
 * Steps:
 * 1. Load table data into diagram.
 * 2. Translate diagram model to simulation engine format.
 * 3. Validate influences and references.
 * 4. Perform input validation (start, end, dt, method).
 * 5. Handle high step-count warnings.
 * 6. Attempt simulation execution and handle errors.
 */

function run() {
    window.simulationHasRunSuccessfully_tab = false;
    loadTableToDiagram();
    if (!Array.isArray(myDiagram.model.nodeDataArray) || myDiagram.model.nodeDataArray.length === 0) {
        document.getElementById("simErrorPopupDesc").innerHTML = "The model is empty. Please add at least one stock, variable, or flow before running the simulation.";
        showSimErrorPopup();
        return;
    }

    var json = JSON.parse(myDiagram.model.toJson());
    var engineJson = translate(json);

    console.log(engineJson);


    for (var i = 0; i < engineJson.variables.length; i++) {
        var variable = engineJson.variables[i];
        var references = containsReference(variable.equation);
        var newReferences = [];

        for (var t = 0; t < references.length; t++) {
            var found = false;
            for (var c = 0; c < engineJson.labelsandkeys.length; c++) {
                const ref = references[t];
                const label = engineJson.labelsandkeys[c].label;
                const key = engineJson.labelsandkeys[c].key;

                if (ref == label) {
                    console.log(`Match found: '${ref}' => '${key}'`);
                    newReferences.push(key);
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.log(`No match for '${references[t]}', keeping original`);
                newReferences.push(references[t]);
            }
        }
        if (newReferences.length > 0) {
            for (var h = 0; h < newReferences.length; h++) {
                var currentKey = "";

                var exists = false;
                for (var j = 0; j < engineJson.influences.length; j++) {
                    console.log(engineJson.influences[j].to === variable.key && engineJson.influences[j].from === newReferences[h]);
                    console.log(variable.key);
                    console.log(newReferences[h]);
                    if (engineJson.influences[j].to === variable.key && engineJson.influences[j].from === newReferences[h]) {
                        exists = true;
                    }
                    if (engineJson.influences[j].to === variable.key && !newReferences.includes(engineJson.influences[j].from)) {
                        document.getElementById("simErrorPopupDesc").innerHTML = "Incorrect influence from " + engineJson.influences[j].from + " to " + engineJson.influences[j].to;
                        showSimErrorPopup();
                        window.simulationHasRunSuccessfully_tab = false;
                        return;
                    }
                }
                if (!exists) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "Missing an influence from " + references[h] + " to " + variable.label;
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        } else {
            for (var j = 0; j < engineJson.influences.length; j++) {
                if (engineJson.influences[j].to === variable.key) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "No references in equation for " + variable.label + ", but influence from " + engineJson.influences[j].from + " exists.";
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        }
    }

    for (var i = 0; i < engineJson.valves.length; i++) {
        var valve = engineJson.valves[i];
        var references = containsReference(valve.equation);
        console.log(references);
        console.log(engineJson.labelsandkeys);
        var newReferences = [];

        for (var t = 0; t < references.length; t++) {
            var found = false;
            for (var c = 0; c < engineJson.labelsandkeys.length; c++) {
                const ref = references[t];
                const label = engineJson.labelsandkeys[c].label;
                const key = engineJson.labelsandkeys[c].key;

                if (ref == label) {
                    console.log(`Match found: '${ref}' => '${key}'`);
                    newReferences.push(key);
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.log(`No match for '${references[t]}', keeping original`);
                newReferences.push(references[t]);
            }
        }
        console.log(engineJson.influences);
        console.log(newReferences);
        if (newReferences.length > 0) {
            for (var j = 0; j < newReferences.length; j++) {
                var exists = false;
                for (var h = 0; h < engineJson.influences.length; h++) {
                    console.log("valve key:" + valve.key);
                    console.log(engineJson.influences[h]);
                    console.log("ref:" + newReferences[j]);
                    console.log(engineJson.influences[h].to == newReferences[j] && engineJson.influences[h].from == valve.key);
                    if ((engineJson.influences[h].to == newReferences[j] && engineJson.influences[h].from == valve.key) || (engineJson.influences[h].to == valve.key && engineJson.influences[h].from == newReferences[j])) {
                        exists = true;
                    }
                    if (engineJson.influences[h].to == valve.key && !newReferences.includes(engineJson.influences[h].from)) {
                        console.log(engineJson.influences[h]);
                        document.getElementById("simErrorPopupDesc").innerHTML = "Incorrect influence from " + engineJson.influences[h].from + " to " + engineJson.influences[h].to;
                        showSimErrorPopup();
                        window.simulationHasRunSuccessfully_tab = false;
                        return;
                    }
                }
                if (!exists) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "Missing an influence from " + newReferences[j] + " to " + valve.key;
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        } else {
            for (var j = 0; j < engineJson.influences.length; j++) {
                if (engineJson.influences[j].to == valve.key) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "No references in equation for " + valve.key + ", but influence from " + engineJson.influences[j].from + " exists.";
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        }
    }


    // get information on the start time, end time, dt, and integration method and add it to the engine json
    var startTime = document.getElementById("startTime").value;
    var endTime = document.getElementById("endTime").value;
    var dt = document.getElementById("dt").value;
    var integrationMethod = document.getElementById("integrationMethod").value == "euler" ? "euler" : "rk4";

    document.getElementById("startTime").classList = "settings-input simParamsInput";
    document.getElementById("endTime").classList = "settings-input simParamsInput";
    document.getElementById("dt").classList = "settings-input simParamsInput";
    //resetSimErrorPopup();

    // Error Checking part 1: All fields must be numbers
    var errors = [];
    if (isNaN(Number(startTime))) {
        errors.push("- The start time must be a number");
        document.getElementById("startTime").classList = "simParamsInput simParamsInputError";
    }
    if (isNaN(Number(endTime))) {
        errors.push("- The end time must be a number");
        document.getElementById("endTime").classList = "simParamsInput simParamsInputError";
    }
    if (isNaN(Number(dt))) {
        errors.push("- The dt must be a number");
        document.getElementById("dt").classList = "simParamsInput simParamsInputError";
    }

    if (errors.length != 0) {
        window.scroll({
            top: document.body.scrollHeight, behavior: "smooth",
        });
        document.getElementById("simErrorPopupDesc").innerHTML = "There are errors with the simulation parameters:<br><br>" + errors.join("<br>");
        showSimErrorPopup();
        window.simulationHasRunSuccessfully_tab = false;
        return;
    }

    // Error Checking part 2: Other issues
    if (Number(startTime) >= Number(endTime)) { // terminates if the end time is not greater than the start
        errors.push("- The end time must be greater than the start time");
        document.getElementById("endTime").classList = "simParamsInput simParamsInputError";
    }

    if (Number(dt) > Number(endTime) - Number(startTime)) { // terminates if the dt is greater than duration
        errors.push("- The dt must be less than or equal to the duration.");
        document.getElementById("dt").classList = "simParamsInput simParamsInputError";
    }

    if (Number(dt) <= 0) { // terminates if the dt is not greater than zero
        errors.push("- The dt must be positive");
        document.getElementById("dt").classList = "simParamsInput simParamsInputError";
    }

    if (errors.length != 0) {
        window.scroll({
            top: document.body.scrollHeight, behavior: "smooth",
        });
        document.getElementById("simErrorPopupDesc").innerHTML = "There are errors with the simulation parameters:<br><br>" + errors.join("<br>");
        showSimErrorPopup();
        window.simulationHasRunSuccessfully_tab = false;
        return;
    }

    // Error Checking part 3: High Step-Count Checker (avoids freezing)
    if ((Number(endTime) - Number(startTime)) / Number(dt) >= 1000) { // 1000+ Steps
        if (!document.getElementById("simParamHighStepCount").checked) {
            // The user did not enable high step-count simulations
            document.getElementById("dt").classList = "simParamsInput simParamsInputWarning";
            window.scroll({
                top: document.body.scrollHeight, behavior: "smooth",
            });
            document.getElementById("simErrorPopupDesc").innerHTML = "This simulation contains 1000+ steps; as such, running it may lead to lag or the website freezing. Please adjust dt or enable high step-count simulations.<br><br>If you proceed with the simulation, it may be wise to export your LunaSim project in case the website crashes.";
            showSimErrorPopup();
            window.simulationHasRunSuccessfully_tab = false;
            return;
        }
    }


    // Looks all good!
    engineJson.start_time = parseFloat(startTime);
    engineJson.end_time = parseFloat(endTime);
    engineJson.dt = parseFloat(dt);
    engineJson.integration_method = integrationMethod;


    try {
        sim.setData(engineJson);

        if (PERFORMANCE_MODE === true) console.time('Simulation Runtime');
        data = sim.run(); // might throw
        if (PERFORMANCE_MODE === true) console.timeEnd('Simulation Runtime');

        sim.reset();

        window.simulationHasRunSuccessfully_button = true;

        window.scroll({top: 0, behavior: "smooth"});
        document.getElementById("secondaryOpen").click();

    } catch (err) {
        console.error("Simulation failed:", err);
        document.getElementById("simErrorPopupDesc").innerHTML = "Simulation Error: " + err.message;
        showSimErrorPopup();

        // Preserve previous success state if applicable
        window.simulationHasRunSuccessfully_tab = false;
    }


}

/**
 * Changes the active tool button's visual state by toggling the "active" class.
 * Removes "active" class from all elements with class "tool",
 * then adds the "active" class to the clicked button.
 *
 * @param {Event} evt - The click event triggered by selecting a tool button.
 * @property {HTMLCollectionOf<Element>} tablinks - Elements with class "tool" (tool buttons).
 */
function toolSelect(evt) {
    var i, tabcontent, tablinks;
    tablinks = document.getElementsByClassName("tool");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    evt.currentTarget.className += " active";
}

/**
 * Changes the displayed tab content and updates the active tab button styling.
 * Hides all elements with class "tabContent", removes "active" class from all tab buttons,
 * then shows the selected tab content and marks the clicked tab button as active.
 *
 * @param {Event} evt - The click event triggered by selecting a tab button.
 * @param {string} tabName - The id of the tab content element to show.
 * @property {HTMLCollectionOf<Element>} tabcontent - Elements with class "tabContent" (tab panels).
 * @property {HTMLCollectionOf<Element>} tablinks - Elements with class "tablinks" (tab buttons).
 */

function opentab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabContent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

/**
 * Exports the current diagram data and simulation parameters to a downloadable file.
 * Converts the diagram model to JSON, adds simulation parameters from UI inputs,
 * then triggers a download of the JSON data as a file named after the model.
 * Updates export-related status flags and timestamps.
 */

function exportData() {
    var filename = document.getElementById("model_name").value;
    loadTableToDiagram();
    var json = JSON.parse(myDiagram.model.toJson());

    // add simulation parameters to the json
    json.simulationParameters = {
        "startTime": parseFloat(document.getElementById("startTime").value),
        "endTime": parseFloat(document.getElementById("endTime").value),
        "dt": parseFloat(document.getElementById("dt").value),
        "integrationMethod": document.getElementById("integrationMethod").value == "euler" ? "euler" : "rk4"
    };

    // download it
    download(`${filename}.luna`, JSON.stringify(json));

    // update export date
    lastExportDate = new Date();
    hasExportedYet = true;
    unsavedEdits = false; // Once exported, no more unsaved edits
    updateSaveStatus();
}

/**
 * Creates and triggers a download of a text file with the given filename and content.
 * Uses a temporary anchor element and simulates a click event to start the download.
 *
 * @param {string} filename - The name of the file to be downloaded.
 * @param {string} text - The text content to include in the downloaded file.
 */
function download(filename, text) {
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);

    if (document.createEvent) {
        var event = document.createEvent('MouseEvents');
        event.initEvent('click', true, true);
        pom.dispatchEvent(event);
    } else {
        pom.click();
    }
}

/**
 * Loads a diagram model from a selected file input event.
 * Parses the file content as JSON, validates it, and updates UI and diagram accordingly.
 * Loads simulation parameters if present; resets to defaults otherwise.
 * Handles blank model warnings and resets save/export statuses.
 *
 * @param {Event} evt - The file input change event containing the selected file.
 */
function loadModel(evt) {
    var reader = new FileReader();
    var file = evt.target.files[0];
    console.log(file);

    reader.onload = function (evt) {
        // Check if the file is valid JSON
        var json;
        try {
            json = JSON.parse(evt.target.result);
        } catch (e) {
            alert(`Something went wrong while parsing this file! Most likely, the file you uploaded isn't a valid LunaSim model.\n\nDetailed Error Log:\n${e.message}`);
            return;
        }

        // Check for blank model loading
        if (go.Model.fromJson(evt.target.result).Pc.length == 0) {
            // .Pc is where the list of "objects" in the model is stored
            // Checked via console.log testing
            // This *probably* isn't good standard but it seems to be consistent across platforms & models

            let confirmBlankLoad = confirm("This model appears to be blank! Are you sure you want to load it?");
            if (!confirmBlankLoad) return;
        }

        // If we get here, everything should be good

        // check if the json has simulation parameters
        if (json.simulationParameters) {
            // add simulation parameters from the json
            document.getElementById("startTime").value = json.simulationParameters.startTime;
            document.getElementById("endTime").value = json.simulationParameters.endTime;
            document.getElementById("dt").value = json.simulationParameters.dt;
            document.getElementById("integrationMethod").value = json.simulationParameters.integrationMethod;
        } else {
            document.getElementById("startTime").value = 0;
            document.getElementById("endTime").value = 10;
            document.getElementById("dt").value = 0.1;
            document.getElementById("integrationMethod").value = "rk4";
        }

        // clear the diagram
        myDiagram.model = go.Model.fromJson("{ \"class\": \"GraphLinksModel\", \"linkLabelKeysProperty\": \"labelKeys\", \"nodeDataArray\": [],\"linkDataArray\": [] }");
        // clear the table
        $('#eqTableBody').empty();

        // Load the new model
        myDiagram.model = go.Model.fromJson(evt.target.result);

        updateTable(true);
        loadTableToDiagram();

        // set the diagram position back to what it was
        myDiagram.initialPosition = myDiagram.position;
        if (file && file.name) {
            console.log(file.name);
            document.getElementById("model_name").value = file.name.replace(/\.[^/.]+$/, "");
        }

        // Reset save status after loading model
        lastEditDate = new Date();
        unsavedEdits = false;
        lastExportDate = new Date();
        hasExportedYet = false;
        updateSaveStatus();
    }

    /*
    // This doesn't actually appear to be firing on an error, so I commented it out and wrote my own error handler.
    // Add back in if I didn't read the documentation properly and it actually works.

    reader.addEventListener("error", function (evt) {
        alert("error reading file");
    });*/

    reader.readAsText(evt.target.files[0]);
}

/**
 * Toggles the dark theme stylesheet on or off.
 * Saves the dark mode status in sessionStorage.
 * Shows a popup notification suggesting the user refresh the page to apply all theme changes.
 *
 * @param {boolean} orig - If true, suppresses the popup notification (used on page load).
 */
// Themes
function switch_theme(orig) {
    var dark = document.getElementById("darkThemeCSS");
    if (dark.disabled) {
        dark.disabled = false;
        sessionStorage.setItem("darkMode", true);
    } else {
        dark.disabled = true;
        sessionStorage.setItem("darkMode", false);
    }

    if (!orig) {
        var popupNotif = document.getElementById("popupNotif");
        var popupNotifText = document.getElementById("popupNotifText");
        popupNotifText.innerHTML = "Refresh to apply all theme changes";
        popupNotif.style.visibility = "visible";
    }
}

document.getElementById("switchThemeButton").addEventListener("click", function () {
    switch_theme(false)
});
document.getElementById("popupNotifClose").addEventListener("click", function () {
    popupNotif.style.visibility = "hidden";
});

// Retrieves session storage data when loaded
window.onload = function () {
    if (sessionStorage.modelData) {
        myDiagram.model = go.Model.fromJson(sessionStorage.modelData);
        updateTable(true);
        loadTableToDiagram();
    }
    if (sessionStorage.getItem("darkMode") == "true") {
        switch_theme(true);
    }
}

// Model Loading
document.getElementById("loadButton").addEventListener("click", function () {
    if (unsavedEdits) {
        // Add a warning if the user has changed the model since their last export
        let confirmLoad = confirm(`You've made changes to this model since the last time you exported it (if at all). If you load a new model now without exporting, your changes will be lost! Are you sure you want to proceed?\n\n(Press CANCEL to go back and export your model.)`);
        if (!confirmLoad) return;
    }

    document.getElementById("load-actual-button").click();
});

init();
document.getElementById("centerModelBtn").addEventListener("click", function () {
    myDiagram.zoomToFit();

    const diagramBounds = myDiagram.documentBounds;
    const viewBounds = myDiagram.viewportBounds;

    const diagramCenter = diagramBounds.center;
    const viewCenter = viewBounds.center;

    const offset = diagramCenter.subtract(viewCenter);
    myDiagram.position = myDiagram.position.copy().add(offset);
});


// add button event listeners
// mode buttons
document.getElementById("pointer_button").addEventListener("click", function () {
    setMode("pointer", "pointer");
    toolSelect(event);
});
document.getElementById("stock_button").addEventListener("click", function () {
    setMode("node", "stock");
    toolSelect(event);
});
document.getElementById("cloud_button").addEventListener("click", function () {
    setMode("node", "cloud");
    toolSelect(event);
});
document.getElementById("variable_button").addEventListener("click", function () {
    setMode("node", "variable");
    toolSelect(event);
});
document.getElementById("flow_button").addEventListener("click", function () {
    setMode("link", "flow");
    toolSelect(event);
});
document.getElementById("influence_button").addEventListener("click", function () {
    setMode("link", "influence");
    toolSelect(event);
});
// Set initial mode as pointer (for UI shading)
document.getElementById("pointer_button").click();

// tab buttons
document.getElementById("defaultOpen").addEventListener("click", function () {
    opentab(event, "modalView");
});
document.getElementById("secondaryOpen").addEventListener("click", function () {
    opentab(event, "chartsTables");
});
// Open modal viewer
document.getElementById("defaultOpen").click();

// save, load, and run buttons

document.getElementById("load-actual-button").addEventListener("change", loadModel);
document.getElementById("runButton").addEventListener("click", function () {
    run();
});
document.getElementById("exportButton").addEventListener("click", function () {
    exportData();
});

// clear button
document.getElementById("clearButton").addEventListener("click", function () {
    let confirmNewModel = confirm("Do you want to clear this model and start a new one? Your current project will be wiped!");
    if (confirmNewModel) {
        let doubleConfirm = confirm("Are you REALLY sure? If you want to save the project you are currently working on, press CANCEL and export it first; otherwise, the data will be cleared. You've been warned!");
        if (!doubleConfirm) return;

        document.getElementById("model_name").value = "New Project";
        // Reset Model
        document.getElementById("startTime").value = 0;
        document.getElementById("endTime").value = 10;
        document.getElementById("dt").value = 0.1;
        document.getElementById("integrationMethod").value = "rk4";
        // clear the diagram
        myDiagram.model = go.Model.fromJson("{ \"class\": \"GraphLinksModel\", \"linkLabelKeysProperty\": \"labelKeys\", \"nodeDataArray\": [],\"linkDataArray\": [] }");
        // clear the table
        $('#eqTableBody').empty();

        // Reset save status after clearing model
        lastEditDate = new Date();
        unsavedEdits = false;
        lastExportDate = new Date();
        hasExportedYet = false;
        updateSaveStatus();
    }
});

// reload/close warning
// TEST-UI-001-004
window.addEventListener('beforeunload', function (e) {
    if (unsavedEdits) e.preventDefault();
});

// Exporting myDiagram
export {data};
const JAVA_MATH_FUNCTIONS = ['sin()', 'cos()', 'tan()', 'asin()', 'acos()', 'atan()', 'atan2()', 'sinh()', 'cosh()', 'tanh()', 'exp()', 'log()', 'log10()', 'sqrt()', 'cbrt()', 'abs()', 'ceil()', 'floor()', 'round()', 'pow()', 'max()', 'min()', 'sign()', 'random()', 'hypot()', 'expm1()', 'log1p()'];

/*
// Auto-enhance inputs in the 3rd column (Equation)
function enhanceExistingInputs() {
    document.querySelectorAll('#eqTableBody tr').forEach(row => {
        const equationCell = row.children[2];
        if (equationCell) {
            const input = equationCell.querySelector('input');
            if (input) enhanceExistingInputs(input);
        }
    });
}

// Watch for new rows in the equation editor
const observer = new MutationObserver(() => {
    enhanceExistingInputs();
});
observer.observe(document.getElementById('eqTableBody'), {
    childList: true,
    subtree: true
});
*/
// Enhance any inputs already present
// enhanceExistingInputs();

/**
 * Returns the top 5 matching Java math function suggestions based on input.
 * Used for autocomplete suggestions in the equation editor.
 *
 * @param {string} input - The partial function name input by the user.
 * @returns {string[]} An array of suggested function names starting with the input.
 */
function getTopMathMatches(input) {
    const lowerInput = input.toLowerCase();
    return JAVA_MATH_FUNCTIONS
        .filter(func => func.toLowerCase().startsWith(lowerInput))
        .slice(0, 5);
}

/**
 * Determines whether the cursor position inside a text input is currently within brackets [].
 * Checks for unmatched opening bracket '[' before the cursor without a closing bracket ']'.
 *
 * @param {string} text - The full text string in the input field.
 * @param {number} cursorPos - The cursor position index in the text.
 * @returns {boolean} True if the cursor is inside unmatched brackets, false otherwise.
 */
function isCursorInsideBrackets(text, cursorPos) {
    const before = text.slice(0, cursorPos);
    const open = before.lastIndexOf("[");
    const close = before.lastIndexOf("]");
    return open > close; // True if last unmatched bracket is open
}

/**
 * Returns the top 5 matching GoJS element labels for autocomplete suggestions.
 * If fragment is empty, returns the first 5 default labels.
 *
 * @param {string} fragment - The partial text input to match against.
 * @returns {string[]} Array of suggested GoJS element labels matching the fragment.
 */
function getTopBracketMatches(fragment) {
    const lower = fragment.toLowerCase();

    if (fragment === "") {
        // Show first 5 elements in creation order
        return GOJS_ELEMENT_LABELS.slice(0, 5);
    }

    return GOJS_ELEMENT_LABELS
        .filter(label => label.toLowerCase().startsWith(lower))
        .slice(0, 5); // best 5 matches
}


/**
 * Sets up autocomplete functionality for all equation input fields in the equation table body.
 * Handles showing suggestions on input, keyboard navigation, selection insertion,
 * and closing the autocomplete dropdown on blur or outside clicks.
 */

function setupAutocompleteForInputs() {
    const $tbody = $('#eqTableBody');

    // Show suggestions as the user types
    $tbody.on('input', 'input[name="equation"]', function (e) {
        if (e.originalEvent && ["ArrowUp", "ArrowDown", "Tab"].includes(e.originalEvent.key)) return;
        showAutocomplete($(this));
    });

    $tbody.on('keydown', 'input[name="equation"]', function (e) {
        const $input = $(this);
        const dropdown = $('.autocomplete-list');
        const items = dropdown.find('.autocomplete-item');
        let selected = items.filter('.selected');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selected.length === 0) {
                items.first().addClass('selected');
            } else {
                const next = selected.removeClass('selected').next();
                (next.length ? next : items.first()).addClass('selected');
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selected.length === 0) {
                items.last().addClass('selected');
            } else {
                const prev = selected.removeClass('selected').prev();
                (prev.length ? prev : items.last()).addClass('selected');
            }
            return;
        }

        if ((e.key === 'Tab' || e.key === 'Enter') && selected.length > 0) {
            e.preventDefault();
            e.stopPropagation();

            const cursorPos = $input[0].selectionStart;
            const fullText = $input.val();

            const isInBrackets = isCursorInsideBrackets(fullText, cursorPos);
            let before = fullText.slice(0, cursorPos);
            const after = fullText.slice(cursorPos);
            const replacement = selected.text();
            let updated, newCursor;

            if (isInBrackets) {
                before = before.replace(/\[([^\[\]]*)$/, `[${replacement}`);
                if (after.trim().startsWith("]")) {
                    updated = before + after;
                    newCursor = before.length;
                } else {
                    updated = before + "]" + after;
                    newCursor = before.length + 1;
                }
            } else {
                const match = before.match(/(\w+)$/);
                const currentFragment = match ? match[1] : "";
                const fragmentStart = cursorPos - currentFragment.length;

                const funcName = selected.text();
                const withParens = funcName.endsWith("()") ? funcName : funcName + "()";

                before = fullText.slice(0, fragmentStart);
                updated = before + withParens + after;
                newCursor = before.length + withParens.indexOf("()") + 1; // inside the ()
            }


            $input.val(updated);
            $input[0].setSelectionRange(newCursor, newCursor);
            $('.autocomplete-list').remove();

        }
    });


    $tbody.on('blur', 'input[name="equation"]', function () {
        setTimeout(() => {
            if (!$(':hover').hasClass('autocomplete-item')) {
                $('.autocomplete-list').remove();
            }
        }, 150);
    });

    // Also remove on clicks outside
    $(document).on('mousedown', function (e) {
        if (!$(e.target).closest('.autocomplete-list, input[name="equation"]').length) {
            $('.autocomplete-list').remove();
        }
    });
}

/**
 * Shows an autocomplete dropdown for the given jQuery input element.
 * Detects the current cursor position and extracts the relevant fragment
 * either inside brackets [] or as a word to suggest completions.
 * Inserts the selected autocomplete item into the input field on click.
 *
 * @param {JQuery} $input - jQuery-wrapped input element to show autocomplete for.
 */

function showAutocomplete($input) {
    const cursorPos = $input[0].selectionStart;
    const fullText = $input.val();

    const isInBrackets = isCursorInsideBrackets(fullText, cursorPos);

    let currentFragment = "";
    if (isInBrackets) {
        const match = fullText.slice(0, cursorPos).match(/\[([^\[\]]*)$/);
        currentFragment = match ? match[1] : "";
    } else {
        const match = fullText.slice(0, cursorPos).match(/(?:^|\W)(\w+)$/);
        currentFragment = match ? match[1] : "";
    }

    $('.autocomplete-list').remove();

    if (!currentFragment && !isInBrackets) return;

    const matches = isInBrackets ? getTopBracketMatches(currentFragment) : getTopMathMatches(currentFragment);

    if (matches.length === 0) return;

    const dropdown = $('<div class="autocomplete-list"></div>');
    matches.forEach(match => {
        const item = $('<div class="autocomplete-item"></div>').text(match);
        item.on('mousedown', function (e) {
            e.preventDefault();

            let before = fullText.slice(0, cursorPos);
            let after = fullText.slice(cursorPos);
            let updated, newCursor;

            if (isInBrackets) {
                before = before.replace(/\[([^\[\]]*)$/, `[${match}`);
                if (after.trim().startsWith("]")) {
                    updated = before + after;
                    newCursor = before.length;
                } else {
                    // Add closing bracket
                    updated = before + "]" + after;
                    newCursor = before.length + 1;
                }

            } else {
                // Replace function name, add (), move cursor inside
                const funcName = match;
                const withParens = funcName.endsWith("()") ? funcName : funcName + "()";
                before = before.replace(/(\w+)$/, withParens);
                updated = before + after;
                newCursor = before.length - 1; // cursor inside ()
            }


            $input.val(updated);
            $input[0].setSelectionRange(newCursor, newCursor);
            $('.autocomplete-list').remove();
        });
        dropdown.append(item);
    });

    const offset = $input.offset();
    dropdown.css({
        position: "absolute", top: offset.top + $input.outerHeight(), left: offset.left, width: $input.outerWidth()
    });

    $('body').append(dropdown);

    setTimeout(() => {
        const firstItem = dropdown.find('.autocomplete-item').first();
        if (firstItem.length) {
            $('.autocomplete-item').removeClass('selected');
            firstItem.addClass('selected');
        }
    }, 0);
}


/**
 * Saves the given GoJS diagram as a PNG image file with optional margin.
 * Uses the diagram's makeImageData API to get image Blob and triggers a download.
 *
 * @param {go.Diagram} diagram - The GoJS diagram instance to export.
 * @param {string} [filename="diagram.png"] - The filename to save as.
 * @param {number} [margin=15] - Margin in pixels around the diagram in the exported image.
 */

function saveDiagramAsPng(diagram, filename = "diagram.png", margin = 15) {
    diagram.makeImageData({
        background: "white", scale: 1, padding: margin,         // adds margin (in pixels) around the diagram
        returnType: "blob", callback: function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
}

/**
 * Saves the given GoJS diagram as a JPG image file with optional margin.
 * Uses the diagram's makeImageData API to get image Blob and triggers a download.
 *
 * @param {go.Diagram} diagram - The GoJS diagram instance to export.
 * @param {string} [filename="diagram.jpg"] - The filename to save as.
 * @param {number} [margin=15] - Margin in pixels around the diagram in the exported image.
 */
function saveDiagramAsJpg(diagram, filename = "diagram.jpg", margin = 15) {
    diagram.makeImageData({
        background: "white", scale: 1, padding: margin,         // adds margin (in pixels) around the diagram
        returnType: "blob", callback: function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
}

/**
 * Saves the given GoJS diagram as a TIFF image file with optional margin.
 * Uses the diagram's makeImageData API to get image Blob and triggers a download.
 *
 * @param {go.Diagram} diagram - The GoJS diagram instance to export.
 * @param {string} [filename="diagram.tiff"] - The filename to save as.
 * @param {number} [margin=15] - Margin in pixels around the diagram in the exported image.
 */
function saveDiagramAsTiff(diagram, filename = "diagram.tiff", margin = 15) {
    diagram.makeImageData({
        background: "white", scale: 1, padding: margin,         // adds margin (in pixels) around the diagram
        returnType: "blob", callback: function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
}


/**
 * Event listener for the "Download Image" button.
 * Reads user-selected export format and margin, and triggers the appropriate
 * diagram image export function.
 * Updates export and save status flags accordingly.
 */
document.getElementById("downloadImageButton").addEventListener("click", function () {
    const type = document.getElementById("fileSelect").value; // .png, .jpg, .tiff
    const marginInput = parseInt(document.getElementById("imageMargin").value);
    const margin = isNaN(marginInput) ? 15 : marginInput;
    const filename = (document.getElementById("model_name").value || "diagram").trim();

    if (!myDiagram) {
        alert("Diagram not initialized.");
        return;
    }

    switch (type) {
        case ".png":
            saveDiagramAsPng(myDiagram, filename + ".png", margin);
            break;
        case ".jpg":
            saveDiagramAsJpg(myDiagram, filename + ".jpg", margin);
            break;
        case ".tiff":
            saveDiagramAsTiff(myDiagram, filename + ".tiff", margin);
            break;
        default:
            alert("Unsupported export format: " + type);
            return;
    }

    lastExportDate = new Date();
    hasExportedYet = true;
    unsavedEdits = false;
    updateSaveStatus();
});

/**
 * Initializes autocomplete functionality on all relevant input fields
 * when the document is ready.
 */
$(document).ready(() => {
    setupAutocompleteForInputs();
});

/**
 * Returns the default color string (hex) for a given diagram element type.
 * Used for setting default node/link colors on creation.
 *
 * @param {string} type - The element type (e.g., "stock", "variable", "valve", "flow", "influence").
 * @returns {string} The corresponding hex color code.
 */
function getDefaultColor(type) {
    switch (type) {
        case "stock":
            return "#f0f0f0";
        case "variable":
            return "#f0f0f0";
        case "valve":
            return "#3489eb";
        case "flow":
            return "#3489eb";
        case "influence":
            return "#e3680e";
        default:
            return "#f0f0f0";
    }
}

/**
 * Sets up localStorage persistence for the diagram.
 * Loads saved diagram model from localStorage if present.
 * Registers an event listener on window unload to save the current model back to localStorage.
 *
 * @param {go.Diagram} diagram - The GoJS diagram instance to persist.
 */
function setupLocalStoragePersistence(diagram) {
    const savedModel = localStorage.getItem("model");
    if (savedModel) {
        try {
            myDiagram.model = go.Model.fromJson(savedModel);
            updateTable(true);
            loadTableToDiagram();
        } catch (e) {
            console.error("Failed to parse saved diagram model:", e);
        }
    }

    window.addEventListener("beforeunload", () => {
        loadTableToDiagram();
        const json = myDiagram.model.toJson();
        localStorage.setItem("model", json);
    });
}

const modelNameInput = document.getElementById('model_name');

// Load saved model name from localStorage
const savedName = localStorage.getItem('model_name');
if (savedName) {
    modelNameInput.value = savedName;
}

// Save the model name to localStorage when it changes
modelNameInput.addEventListener('input', () => {
    localStorage.setItem('model_name', modelNameInput.value);
});