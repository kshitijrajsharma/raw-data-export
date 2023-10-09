$(document).ready(function() {
    var result_geojson;
    var select = document.getElementById("server");
    var server = select.options[select.selectedIndex].value;
    $("#server").on("change", function() {
        server = this.value;
        console.log(server);
        check_status();
    });
    window.onbeforeunload = function() {
        return "Are you sure you want to leave? Think of your existing exports!";
    };
    check_status();
    var map = L.map("map", {
        minZoom: 4,
        attributionControl: false,
    });
    map.setView([28.2957487, 83.8123341], 14);
    L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors, © CartoDB'
    }).addTo(map);
    map.addControl(
        new L.Control.Search({
            url: "https://nominatim.openstreetmap.org/search?format=json&q={s}",
            jsonpParam: "json_callback",
            propertyName: "display_name",
            propertyLoc: ["lat", "lon"],
            hideMarkerOnCollapse: true,
            // marker: L.circleMarker([0, 0], { radius: 30 }),
            autoCollapse: false,
            autoType: true,
            minLength: 2,
            zoom: 12,
        })
    );

    var editableLayers = new L.FeatureGroup();
    map.addLayer(editableLayers);

    var drawControlFull = new L.Control.Draw({
        draw: {
            polyline: false,
            circle: false,
            marker: false,
            rectangle: {
                shapeOptions: {
                    color: "#d6403f",
                    opacity: 1,
                    fillOpacity: 0,
                },
                metric: true,
            },
            polygon: {
                shapeOptions: {
                    color: "#d6403f",
                    opacity: 1,
                    fillOpacity: 0,
                },
                metric: true,
            },
        },
        edit: {
            featureGroup: editableLayers,
        },
    });
    var drawControlEditOnly = new L.Control.Draw({
        edit: {
            featureGroup: editableLayers,
        },
        draw: false,
    });
    map.addControl(drawControlFull);

    // document.getElementById("filename").disabled = true; //disable me - temp

    map.on("draw:created", function(e) {
        var type = e.layerType,
            layer = e.layer;

        editableLayers.addLayer(layer);
        map.removeControl(drawControlFull);
        map.addControl(drawControlEditOnly);
    });
    map.on("draw:edited", function(e) {
        var layers = e.layers;
        //do whatever you want; most likely save back to db
    });


    L.EditToolbar.Delete.include({
        enable: function() {
            this.options.featureGroup.clearLayers();
            map.removeControl(drawControlEditOnly);
            map.addControl(drawControlFull);
        },
    });

    function handleSubmit(event) {
        document.getElementById("hot_export_btn").disabled = true;

        map.removeControl(drawControlEditOnly);
        event.preventDefault();
        try {
            var bounds = editableLayers.getBounds().toBBoxString();

        } catch (error) {
            console.log(error);
        }



        // var input = '{"geometry":' + JSON.stringify(data.features[0].geometry);
        const form_data = new FormData(event.target);

        osmTags_custom_key = form_data.getAll("where_key");
        osmTags_custom_value = form_data.getAll("where_value");

        var tagsobj = [];

        for (var i = 0; i < osmTags_custom_key.length; i++) {
            if (osmTags_custom_key[i] != "") {
                if (osmTags_custom_value[i] != "") {
                    const myArray = osmTags_custom_value[i].split(",");
                    tagsobj.push({ 'key': osmTags_custom_key[i], 'value': myArray });
                } else {

                    tagsobj.push({ 'key': osmTags_custom_key[i], 'value': ['*'] });

                }
            }
        }
        if (tagsobj.length < 1) {
            tagsobj = [{ 'key': 'building', 'value': ['*'] }];
        }

        input = '{ "where":'
        input += JSON.stringify(tagsobj)
        if (bounds) {
            input += ',"bbox":[' + bounds + ']'
        }
        select = form_data.getAll("select");
        if (select.length > 0) {
            console.log(select);
            input += ',"select": [' + JSON.stringify(select[0]) + ']';
        }
        var jointype_dropdown = document.getElementById("joinBy");
        var jointype =
            jointype_dropdown.options[jointype_dropdown.selectedIndex].value;

        input += ',"joinBy":"' + jointype + '"';

        lookIn = form_data.getAll("lookIn");

        if (lookIn.length > 0) {
            console.log(lookIn);
            input += ',"lookIn":' + JSON.stringify(lookIn);
        }
        input += "}";

        stat = document.getElementById("summary_response");

        start_time = new Date().toLocaleString();
        stat.innerHTML =
            'Running from ' +
            start_time;

        api_url = server + "/raw-data/current-snapshot/raw-query/";
        console.log(input);
        $.ajax({
            type: "POST",
            url: api_url,
            headers: {
                accept: "application/json",
                "Content-Type": "application/json",
            },
            data: input,

            success: function(data) {
                console.log(data);
                document.getElementById("hot_export_btn").disabled = false;

                load_result_to_map(data);
                map.addControl(drawControlEditOnly);
                stat.innerHTML = "Build your query";


            },
            error: function(e) {
                console.log(e.responseJSON);
                try{
                    handle_error(e.responseJSON.detail);
                } catch(err){
                    handle_error('API error');

                }



            },
        });

    }

    function handle_error(msg) {
        try {
            stat = document.getElementById("summary_response")
            stat.innerHTML = '<p style="color:red;">' + msg + "</p>";
            document.getElementById("hot_export_btn").disabled = false;
            map.addControl(drawControlEditOnly);
        } catch (err) {
            stat.innerHTML =
                '<p style="color:red;">' + "Error , API didn't responded" + "</p>";
            document.getElementById("hot_export_btn").disabled = false;
            map.addControl(drawControlEditOnly);
        }
    }

    const form = document.querySelector("form");
    form.addEventListener("submit", handleSubmit);

    //Clone the hidden element and shows it
    $("#custom_tag_add_btn").click(function() {
        $("#custom_tag_content")
            .first()
            .clone()
            .appendTo("#custom_tag_content_show")
            .show();
        attach_delete();
    });


    //Attach functionality to delete buttons
    function attach_delete() {
        $(".delete").off();
        $(".delete").click(function() {
            console.log("click");
            $(this).closest(".form-group").remove();
        });
    }
    $(function() {
        $('[data-toggle="tooltip"]').tooltip();
    });
    var max_fields = 10;
    var wrapper = $("#columnadd");
    var add_button = $("#addcolumnkey");

    var x = 1;
    $(add_button).click(function(e) {
        e.preventDefault();
        if (x < max_fields) {
            x++;
            $(wrapper).append(
                '<div class="col-sm-9 col-md-6 col-lg-8 col-xl-10"><input type="text" class="form-control" name="column_key" placeholder="Osm Key"/> <div class="col-sm-3 col-md-6 col-lg-4 col-xl-2" id="columndelete"><p class="delete">-</p></div></div>'
            ); //add input box
        } else {
            alert("You Reached the limits");
        }
    });

    $(wrapper).on("click", "#columndelete", function(e) {
        e.preventDefault();
        $(this).parent("div").remove();
        x--;
    });


    function load_result_to_map(geojson_layer) {
        var myStyle = {
            color: "#00008B",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.01,
        };
        var highlight = {
            color: "yellow",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.01,
        };
        console.log("loading geojson to map");
        if (map.hasLayer(result_geojson)) {
            result_geojson.remove();
        }


        result_geojson = L.geoJson(geojson_layer, {
            onEachFeature: function(feature, layer) {
                if (layer.feature.geometry.type == 'Polygon' || layer.feature.geometry.type == 'MultiPolygon') {
                    var t_style = myStyle
                    layer.setStyle(t_style);
                } else if (layer.feature.geometry.type == 'Point') {
                    var ico = L.icon({
                        iconUrl: 'assets/img/marker.png',
                        iconSize: [10, 10],
                    });
                    layer.setIcon(ico);
                } else if (layer.feature.geometry.type == 'LineString' || layer.feature.geometry.type == 'MultiLineString') {
                    var t_style = {
                        color: "#FFA500",
                        weight: 2,
                        opacity: 2,
                        fillOpacity: 0.01,
                    }
                    layer.setStyle(t_style);
                } else if (layer.feature.geometry.type == 'GeometryCollection') {
                    layer.eachLayer(function(layer_GeometryCollection) {
                        if (layer_GeometryCollection._latlng) {
                            var ico = L.icon({
                                iconUrl: 'assets/img/marker.png',
                                iconSize: [10, 10],
                            });
                            layer_GeometryCollection.setIcon(ico);
                        } else {
                            var t_style = {
                                color: "#00008B",
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.01,
                            }
                            layer.setStyle(t_style);
                        }
                    });
                }
                var popupContent = "<table>";
                for (var p in feature.properties) {
                    popupContent +=
                        "<tr><td>" + p + "</td><td>" + JSON.stringify(feature.properties[p]) + "</td></tr>";
                }
                popupContent += "</table>";
                layer.bindPopup(popupContent);
            },
        }).addTo(map);
        try{
            map.fitBounds(result_geojson.getBounds());

        }catch (err){
            console.log(err);


        }

    }

    function addNonGroupLayers(sourceLayer, targetGroup) {
        if (sourceLayer instanceof L.LayerGroup) {
            sourceLayer.eachLayer(function(layer) {
                addNonGroupLayers(layer, targetGroup);
            });
        } else {
            targetGroup.addLayer(sourceLayer);
        }
    }

    function check_status() {
        $.ajax({
            type: "GET",
            url: server + "/raw-data/status/",
            contentType: "text/plain; charset=utf-8",
            success: function(data) {
                // console.log(data);
                document.getElementById("db_status").innerHTML =
                    "<strong> Database Updated " +
                    moment(data.last_updated).fromNow() +
                    "</strong>";
            },
            error: function(e) {
                console.log(e);
                document.getElementById("db_status").innerHTML =
                    '<p style="color:red;">Could not connect to Database</p>';
            },
        });
    }

    let nIntervId;
    if (!nIntervId) {
        nIntervId = setInterval(check_status, 120000);
    }


    document.getElementById("custom_tag_add_btn").click();
});