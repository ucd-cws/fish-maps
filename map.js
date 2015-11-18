// Fish richness map javascript

// one global for persistent app variables
var app = {};
require(["esri/map", "esri/layers/ArcGISTiledMapServiceLayer", "esri/layers/FeatureLayer", "esri/tasks/ClassBreaksDefinition", "esri/tasks/AlgorithmicColorRamp", "esri/tasks/GenerateRendererParameters", "esri/tasks/GenerateRendererTask", "esri/symbols/SimpleLineSymbol", "esri/symbols/SimpleFillSymbol", "esri/dijit/PopupTemplate", "esri/dijit/Legend", "dojo/parser", "dojo/_base/array", "esri/Color", "dojo/on", "dojo/dom", "dojo/dom-construct", "dojo/number", "dojo/dom-style", "dojo/data/ItemFileReadStore", "dijit/form/FilteringSelect", "dijit/layout/BorderContainer", "dijit/layout/ContentPane", "dojo/domReady!"], function (
    Map,
    ArcGISTiledMapServiceLayer,
    FeatureLayer,
    ClassBreaksDefinition,
    AlgorithmicColorRamp,
    GenerateRendererParameters,
    GenerateRendererTask,
    SimpleLineSymbol,
    SimpleFillSymbol,
    PopupTemplate,
    Legend,
    parser,
    arrayUtils,
    Color,
    on,
    dom,
    domConstruct,
    number,
    domStyle,
    ItemFileReadStore,
    FilteringSelect
) {
    parser.parse();
    // the map service uses the actual field name as the field alias
    // set up an object to use as a lookup table to convert from terse field
    // names to more user friendly field names
    app.fields = {
        "HU_12_NAME": "HUC12 Name",
        "HUC_12": "HUC_12",
        "native_qc_historic_richness": "Historical Richness",
        "native_qc_richness": "Native Richness",
        "nonnative_qc_richness": "Non-Native Richness",
        "div_native_qc": "Jaccard: Native Fish",
        "div_all_qc": "Jaccard: All Fish",
        "historic_assemblage": "Historical Assemblage",
        "losses_list": "Species Lost",
        "gains_list": "Species Gained"
    };

    // get keys from the field list lookup table object
    app.outFields = Object.keys(app.fields)

    // various info for the feature layer
    app.Url = "http://atlas.cws.ucdavis.edu/arcgis/rest/services/PISCESRichness/MegaRichnessNull/MapServer/0";

    // default attribute to load  
    app.currentAttribute = "native_qc_richness";

    // selectable attributes - must be in app.outFields
    // TODO: make this a part of the field object            
    //array of fields to be selectable in dropdown menu  
    app.selectable = ["native_qc_richness", "native_qc_historic_richness", "nonnative_qc_richness", "div_native_qc", "div_all_qc"];

    // map constructor
    app.map = new Map("map", {
        basemap: "oceans",
        center: [-121.45, 38.0],
        zoom: 7,
        slider: false
    });

    //domStyle.set("loading", "visibility", "visible");

    // create a feature layer and wait for map to load so the map's extent is available
    app.map.on("load", function () {
        domStyle.set("loading", "visibility", "visible");
        rich = new FeatureLayer(app.Url, {
            "infoTemplate": createPopup(app.currentAttribute),
            "maxAllowableOffset": maxOffset(),
            "mode": FeatureLayer.MODE_AUTO,
            "outFields": app.outFields,
            "opacity": 0.7
        });

        app.map.addLayer(rich);



        createRenderer(app.currentAttribute);
    });

    // Update max offset when zoom finishes
    app.map.on("zoom-end", updateMaxOffset);

    // hide the loading icon when the counties layer finishes updating
    app.map.on("update-end", function () {
        domStyle.set("loading", "visibility", "hidden");
    });
    app.map.on("zoom-start", function () {
        domStyle.set("loading", "visibility", "visible");
    });



    // colors for the renderer
    app.defaultFrom = Color.fromHex("#ffe98e");
    app.defaultTo = Color.fromHex("#ff684c");

    // create a store and a filtering select for the layer's fields
    var fieldNames, fieldStore, fieldSelect;
    fieldNames = {
        "identifier": "value",
        "label": "name",
        "items": []
    };

    arrayUtils.forEach(app.selectable, function (f) {
        fieldNames.items.push({
            "name": app.fields[f],
            "value": f
        });
    });

    fieldStore = new ItemFileReadStore({
        data: fieldNames
    });
    fieldSelect = new FilteringSelect({
        displayedValue: fieldNames.items[0].name,
        value: fieldNames.items[0].value,
        name: "fieldsFS",
        required: false,
        store: fieldStore,
        searchAttr: "name",
        style: {
            "width": "200px",
            "fontSize": "12pt",
            "color": "#444"
        }
    }, domConstruct.create("div", null, dom.byId("fieldWrapper")));
    fieldSelect.on("change", updateAttribute);


    // helper functions     
    function createRenderer(field) {
        app.sfs = new SimpleFillSymbol(
            SimpleFillSymbol.STYLE_SOLID,
            new SimpleLineSymbol(
                SimpleLineSymbol.STYLE_SOLID,
                new Color([0, 0, 0, 0.5]),
                0.5
            ),
            null
        );
        var classDef = new ClassBreaksDefinition();
        classDef.classificationField = app.currentAttribute;
        classDef.classificationMethod = "quantile";
        classDef.breakCount = 6;
        classDef.baseSymbol = app.sfs;

        var colorRamp = new AlgorithmicColorRamp();
        colorRamp.fromColor = app.defaultFrom;
        colorRamp.toColor = app.defaultTo;
        colorRamp.algorithm = "hsv"; // options are:  "cie-lab", "hsv", "lab-lch"
        classDef.colorRamp = colorRamp;

        var params = new GenerateRendererParameters();
        params.classificationDefinition = classDef;
        //params.where = app.layerDef; //app.layerDef not needed if fishless hucs have Nulls instead of zeros
        var generateRenderer = new GenerateRendererTask(app.Url);
        generateRenderer.execute(params, applyRenderer, errorHandler);
    }

    function applyRenderer(renderer) {
        rich.setRenderer(renderer);
        rich.redraw();
        createLegend(app.map, rich);
    }

    function updateAttribute(ch) {
        // things that get updated when a new metric is picked
        app.map.infoWindow.hide();
        rich.setInfoTemplate(createPopup(ch));
        app.currentAttribute = ch;
        createRenderer(ch);
        createLegend(app.map, rich);
    }

    function createPopup(cfield) {
        // creates a popup
        delete app.popupTemplate;
        app.popupTemplate = new PopupTemplate({
            title: "{HUC_12}: {HU_12_NAME}",
            fieldInfos: [{
                "fieldName": cfield,
                "label": app.fields[cfield],
                "visible": true,
                //"format": { places: 0, digitSeparator: true } // controls sig figs visible in popup
                    }, {
                "fieldName": "historic_assemblage",
                "label": "Historical Assemblage",
                "visible": true
                    }, {
                "fieldName": "losses_list",
                "label": "Species Lost",
                "visible": true
                    }, {
                "fieldName": "gains_list",
                "label": "Species Gained",
                "visible": true
                    }],
            showAttachments: true
        });
        return (app.popupTemplate)
    }

    function createLegend(map, fl) {
        // destroy previous legend, if present
        if (app.hasOwnProperty("legend")) {
            app.legend.destroy();
            domConstruct.destroy(dojo.byId("legendDiv"));
        }
        // create a new div for the legend
        var legendDiv = domConstruct.create("div", {
            id: "legendDiv"
        }, dom.byId("legendWrapper"));

        app.legend = new Legend({
            map: map,
            layerInfos: [{
                layer: fl,
                title: " "
                    }]
        }, legendDiv);
        app.legend.startup();
    }

    function updateMaxOffset() {
        var offset = maxOffset();
        rich.setMaxAllowableOffset(offset);
        console.log("NEW offset", offset);
    }

    function maxOffset() {
        return (app.map.extent.getWidth() / app.map.width);
    }

    function errorHandler(err) {
        console.log('Oops, error: ', err);
    }
});
