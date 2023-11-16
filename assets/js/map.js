$(document).ready(function () {
  var result_geojson;

  window.onbeforeunload = function () {
    return "Are you sure you want to leave? Think of your existing exports!";
  };
  check_status();

  var map = L.map("map", {
    minZoom: 3,
    maxZoom: 17,
    attributionControl: false,
  });
  function setMapToUserLocation(position) {
    var userLat = position.coords.latitude;
    var userLng = position.coords.longitude;

    // Set the map view to the user's location
    map.setView([userLat, userLng], 10);
  }
  function handleLocationError(error) {
    // Handle errors here, such as permission denied or unavailable geolocation API
    console.error("Error getting your location: " + error.message);
    map.setView([28.2957487, 83.8123341], 4);
  }
  navigator.geolocation.getCurrentPosition(
    setMapToUserLocation,
    handleLocationError,
    {
      enableHighAccuracy: true,
    }
  );
  L.tileLayer("http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors, © CartoDB",
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

  fetchTMProjects();
  var storedTaskId = localStorage.getItem("task_id");
  if (storedTaskId) {
    // Ask the user if they want to load data from the previous run
    var loadFromPreviousRun = confirm(
      "Do you want to load data from the previous run?"
    );
    if (loadFromPreviousRun) {
      // Call the function to check the task status using stored task_id
      api_url = get_api_url() + `tasks/status/${storedTaskId}/`;
      call_api_result(api_url);
      var server_local = localStorage.getItem("server");
      if (server_local) {
        server = server_local;
        var selectElement = document.getElementById("server");
        selectElement.value = server;
      } else {
        var select = document.getElementById("server");
        var server = select.options[select.selectedIndex].value;
        localStorage.setItem("server", server);
      }
    }
  }
  $("#server").on("change", function () {
    server = this.value;
    // console.log(server);
    localStorage.setItem("server", server);
    check_status();
  });
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

  map.on("draw:created", function (e) {
    clear_summary();
    var type = e.layerType,
      layer = e.layer;

    if (type === "polygon" || type == "rectangle") {
      var seeArea = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
      area = document.getElementById("summary_response").rows[0].cells;
      document.getElementById("geojsontextarea").value = JSON.stringify(
        layer.toGeoJSON()
      );
      area[1].innerHTML =
        parseInt(parseFloat(seeArea / 1000000).toFixed(2)) == 0
          ? "Less than a Sq KM"
          : parseFloat(seeArea / 1000000).toFixed(2) + " Sq Km";
      stat = document.getElementById("summary_response").rows[1].cells;
      stat[1].innerHTML =
        '<div class="alert alert-warning alert-dismissible fade show" role="alert"><strong>Ready to Run</strong></div>';
    }

    editableLayers.addLayer(layer);
    map.removeControl(drawControlFull);
    map.addControl(drawControlEditOnly);
  });
  map.on("draw:edited", function (e) {
    var layers = e.layers;
    clear_summary();
    layers.eachLayer(function (layer) {
      var seeArea = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
      area = document.getElementById("summary_response").rows[0].cells;
      area[1].innerHTML = parseInt(seeArea / 1000000) + " Sq Km";
      document.getElementById("geojsontextarea").value = JSON.stringify(
        layer.toGeoJSON()
      );

      stat = document.getElementById("summary_response").rows[1].cells;
      stat[1].innerHTML =
        '<div class="alert alert-warning alert-dismissible fade show" role="alert"><strong>Ready to Run</strong></div>';
      console.log(layer.toGeoJSON());

      //do whatever you want; most likely save back to db
    });
  });

  L.EditToolbar.Delete.include({
    enable: function () {
      this.options.featureGroup.clearLayers();
      editableLayers.clearLayers();
      map.removeControl(drawControlEditOnly);
      map.addControl(drawControlFull);
      document.getElementById("geojsontextarea").value = "";

      clear_summary();
    },
  });

  function clear_summary() {
    area = document.getElementById("summary_response").rows[0].cells;
    area[1].innerHTML = "";
    stat = document.getElementById("summary_response").rows[1].cells;
    stat[1].innerHTML = "";
    response_time = document.getElementById("summary_response").rows[2].cells;
    response_time[1].innerHTML = "";
    download_url = document.getElementById("summary_response").rows[3].cells;
    download_url[1].innerHTML = "";
    if (map.hasLayer(result_geojson)) {
      result_geojson.remove();
    }
  }

  function get_api_url() {
    var select = document.getElementById("server");
    var server = select.options[select.selectedIndex].value;
    // console.log(server);
    if (server == "prod") {
      api_url = "https://api-prod.raw-data.hotosm.org/v1/";
    } else if (server == "local") {
      api_url = "http://127.0.0.1:8000/v1/";
    } else {
      api_url = "https://api-stage.raw-data.hotosm.org/v1/";
    }
    return api_url;
  }

  function handleSubmit(event) {
    document.getElementById("hot_export_btn").disabled = true;
    document.getElementById("loadgeojson").disabled = true;
    document.getElementById("filename").disabled = true;

    document.getElementById("geojsontextarea").disabled = true;

    map.removeControl(drawControlEditOnly);
    event.preventDefault();
    var data = editableLayers.toGeoJSON();
    console.log(data);
    stat = document.getElementById("summary_response").rows[1].cells;
    if (JSON.stringify(data) != '{"type":"FeatureCollection","features":[]}') {
      var input = '{"geometry":' + JSON.stringify(data.features[0].geometry);
      if (document.getElementById("filename").value != "") {
        input +=
          ',"fileName":"' + document.getElementById("filename").value + '"';
      }
      const form_data = new FormData(event.target);
      outputType = form_data.getAll("outputType");
      if (outputType.length > 0) {
        // console.log(outputType);
        input += ',"outputType":' + JSON.stringify(outputType[0]);
      }
      if (document.getElementById("include_uuid").checked) {
        input += ',"uuid": "true"';
      } else {
        input += ',"uuid": "false"';
      }

      if (document.getElementById("bind_zip").checked) {
        input += ',"bindZip": "true"';
      } else {
        input += ',"bindZip": "false"';
      }

      if (document.getElementById("useStWithin").checked) {
        input += ',"useStWithin": "true"';
      } else {
        input += ',"useStWithin": "false"';
      }

      if (document.getElementById("centroid").checked) {
        input += ',"centroid": "true"';
      } else {
        input += ',"centroid": "false"';
      }

      if (document.getElementById("download_everything").checked) {
        console.log(
          "Downloading everything inside area, Ignoring other fields"
        );
      } else {
        geometryType = form_data.getAll("geometryType");
        osmTags = form_data.getAll("osmTags");
        osmElements = form_data.getAll("osmElements");

        osmTags_custom_key = form_data.getAll("customtag_key");
        osmTags_custom_value = form_data.getAll("customtag_value");
        columns_filter = form_data.getAll("column_key");

        if (geometryType.length > 0) {
          // console.log(geometryType);
          input += ',"geometryType":' + JSON.stringify(geometryType);
        }

        if (osmTags.length > 0 || osmTags_custom_key.length > 0) {
          var tagsobj = {};
          if (osmTags.length > 0) {
            for (var i = 0; i < osmTags.length; i++) {
              if (osmTags[i] == "boundary") {
                tagsobj[osmTags[i]] = ["administrative"];
              } else {
                tagsobj[osmTags[i]] = [];
              }
            }
          }
          if (osmTags_custom_key.length > 0) {
            for (var i = 0; i < osmTags_custom_key.length; i++) {
              // console.log(osmTags_custom_value[i]);
              if (osmTags_custom_value[i] != "") {
                // console.log(osmTags_custom_value[i]);
                const myArray = osmTags_custom_value[i].split(",");
                tagsobj[osmTags_custom_key[i]] = myArray;
              } else {
                if (osmTags_custom_key[i] != "") {
                  tagsobj[osmTags_custom_key[i]] = [];
                }
              }
            }
          }
          // console.log(tagsobj);
          if (tagsobj.length > 0) {
            tagsobj = { building: [] };
          }
          var jointype_dropdown = document.getElementById("jointype");
          var jointype =
            jointype_dropdown.options[jointype_dropdown.selectedIndex].value;

          input +=
            ',"filters":{"tags":{"all_geometry":{"' +
            jointype +
            '":' +
            JSON.stringify(tagsobj) +
            "}}";
          if (columns_filter.length > 0) {
            // console.log(columns_filter);
            if (columns_filter[0] != "") {
              input +=
                ',"attributes":{"all_geometry":' +
                JSON.stringify(columns_filter) +
                "}";
            }
          }
          input += "}";
        }
      }

      input += "}";
      console.log(input);
      stat[1].innerHTML =
        '<div class="alert alert-danger alert-dismissible fade show" role="alert"><strong>Running';
      ("</strong></div>");
      response_time = document.getElementById("summary_response").rows[2].cells;
      response_time[1].innerHTML = "";
      download_url = document.getElementById("summary_response").rows[3].cells;
      download_url[1].innerHTML = "";

      api_url = get_api_url() + "snapshot/";
      headers = {
        accept: "application/json",
        "Content-Type": "application/json",
      };
      if (isAccessTokenPresent()) {
        headers = {
          accept: "application/json",
          "Content-Type": "application/json",
          "access-token": localStorage.getItem("access_token"),
        };
      }

      $.ajax({
        type: "POST",
        url: api_url,
        headers: headers,
        data: input,

        success: function (data) {
          console.log("Task started:", data);
          // Extract the task_id from the response
          var taskId = data.task_id;
          localStorage.setItem("task_id", taskId);
          // Call the function to check the task status
          api_url = get_api_url() + `tasks/status/${taskId}/`;
          call_api_result(api_url);
        },
        error: function (e) {
          handle_error(e.responseJSON.detail[0].msg);
        },
      });
    } else {
      stat[1].innerHTML = "No Polygon Supplied";
    }
  }

  function call_api_result(call_url) {
    $.ajax({
      type: "GET",
      url: call_url,
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      success: function (data) {
        if (data.status === "SUCCESS") {
          populate_results(data.result);
          if (data.result.zip_file_size_bytes / 1000000 < 2) {
            // if greater than 25 mb don't load it
            unzip_file(data.result.download_url);
          }
        } else if (data.status === "FAILURE") {
          handle_error("Task Failed");
        } else {
          setTimeout(function () {
            stat = document.getElementById("summary_response").rows[1].cells;
            stat[1].innerHTML =
              '<div class="alert alert-danger alert-dismissible fade show" role="alert"><strong>Running</strong></div>';
            call_api_result(call_url);
          }, 2000);
        }
      },
      error: function (e) {
        handle_error(e.responseJSON.detail[0].msg);
      },
    });
  }

  function unzip_file(url) {
    if (url.toLowerCase().endsWith(".zip")) {
      console.log("Unziping file " + url);
      JSZipUtils.getBinaryContent(url, function (err, data) {
        JSZip.loadAsync(data).then(function (zip) {
          for (let [filename, file] of Object.entries(zip.files)) {
            // TODO Your code goes here
            if (filename != "clipping_boundary.geojson") {
              if (filename.slice(-7).toLowerCase() === "geojson") {
                console.log(filename);
                geojson = new File([file], filename);
                console.log(geojson);
                zip
                  .file(filename)
                  .async("string")
                  .then(function (data) {
                    // data is a string
                    // load_geojson(JSON.parse(data));
                    load_result_to_map(JSON.parse(data));
                  });
              }
            }
          }
        });
      });
    }
  }

  function fetchTMProjects() {
    fetch(
      "https://tasking-manager-tm4-production-api.hotosm.org/api/v2/projects/?orderBy=priority&orderByType=ASC&mappingTypesExact=false&page=1&createdByMe=false&mappedByMe=false&favoritedByMe=false&managedByMe=false&basedOnMyInterests=false&omitMapResults=false"
    )
      .then((response) => response.json())
      .then((data) => {
        data.mapResults.features.forEach((feature) => {
          const { projectId } = feature.properties;
          const [lng, lat] = feature.geometry.coordinates;

          const marker = L.circleMarker([lat, lng], {
            color: "#DD0610D6",
            // fillColor: "#f03",
            // fillOpacity: 0.5,
            radius: 2.5,
          }).addTo(map);

          marker.on("click", () => {
            fetchProjectDetails(projectId, [lat, lng]);
          });
        });
      });
  }

  function fetchProjectDetails(projectId, location) {
    const popup = L.popup({
      className: "popup-container",
      closeButton: false,
    });
    popup.setLatLng(location);
    popup.setContent(`
        <div class="popup-content">
            <strong>Tasking Manager Project</strong> <br>
            <strong>ID:</strong> ${projectId} <br>
            <div class="popup-spinner"></div>
        </div>
    `);
    popup.openOn(map);

    fetch(
      `https://tasking-manager-tm4-production-api.hotosm.org/api/v2/projects/${projectId}/?as_file=false&abbreviated=false`
    )
      .then((response) => response.json())
      .then((data) => {
        const {
          status,
          projectPriority,
          projectInfo: { name },
          aoiBBOX,
          organisationName,
          percentMapped,
          percentValidated,
          mappingTypes,
          lastUpdated,
        } = data;
        const mappingTypesList = mappingTypes.join(", ");

        const popupContent = `
          <div class="popup-header">
              <strong>Tasking Manager Project ${projectId}</strong>
          </div>
          <div class="popup-content">
              <div class="popup-line">
                  <strong>Name:</strong> ${name}
              </div>
              <div class="popup-line">
                  <strong>Status:</strong> ${status}
              </div>
              <div class="popup-line">
                  <strong>Priority:</strong> ${projectPriority}
              </div>
              <div class="popup-line">
                  <strong>Creator:</strong> ${organisationName}
              </div>
              <div class="popup-line">
                  <strong>Mapped:</strong> ${percentMapped} % 
              </div>              
              <div class="popup-line">
                  <strong>Validated:</strong> ${percentValidated} %
              </div>
              <div class="popup-line">
                  <strong>Last Updated :</strong> ${moment(
                    lastUpdated
                  ).fromNow()}
              </div>
              <div class="popup-line">
                  <strong>Mapping Type :</strong> ${mappingTypesList}
              </div>
              <div class="popup-button-container">
                  <button id="fetchTmbutton" type="button" class="btn btn-danger btn-sm"
                  style="background: rgb(214, 64, 63);" data-tmid="${projectId}" data-aoibbox="${JSON.stringify(
          aoiBBOX
        )}">Load Project AOI</button>
              </div>
          </div>
      `;

        popup.setContent(popupContent);
      })
      .catch((error) => {
        console.error("Error fetching project details:", error);
        popup.setContent(
          "Error fetching project details. Please try again later."
        );
      });
  }

  document.body.addEventListener("click", function (event) {
    if (event.target.id === "fetchTmbutton") {
      console.log("clicked");
      const aoiBBOX = JSON.parse(event.target.dataset.aoibbox);
      const filename = `hotosm-project-${event.target.dataset.tmid}`;
      const aoi_bbox_geojson = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [aoiBBOX[0], aoiBBOX[1]],
              [aoiBBOX[2], aoiBBOX[1]],
              [aoiBBOX[2], aoiBBOX[3]],
              [aoiBBOX[0], aoiBBOX[3]],
              [aoiBBOX[0], aoiBBOX[1]],
            ],
          ],
        },
      };
      document.getElementById("geojsontextarea").value =
        JSON.stringify(aoi_bbox_geojson);
      loadRawGeojsonToMap();
      document.getElementById("filename").value = filename;
    }
  });

  function populate_results(data) {
    console.log(data);
    area = document.getElementById("summary_response").rows[0].cells;
    area[1].innerHTML =
      parseInt(data.query_area) == 0 ? "Less than a Sq KM" : data.query_area;
    stat = document.getElementById("summary_response").rows[1].cells;
    stat[1].innerHTML =
      '<div class="alert alert-success alert-dismissible fade show" role="alert"><strong>Success</strong></div>';
    response_time = document.getElementById("summary_response").rows[2].cells;
    response_time[1].innerHTML = "(hr:min:sec) " + data.process_time;
    download_url = document.getElementById("summary_response").rows[3].cells;
    var zip_file_size =
      parseInt(parseFloat(data.zip_file_size_bytes / 1000000).toFixed(2)) == 0
        ? "Less than a MB"
        : parseFloat(data.zip_file_size_bytes / 1000000).toFixed(2);
    var binded_file_size =
      parseInt(data.binded_file_size) == 0
        ? "Less than a MB"
        : data.binded_file_size;
    download_url[1].innerHTML =
      '<a id="response_file_download" href="' +
      data.download_url +
      '">' +
      data.file_name +
      "</a><p><small><strong>Zip size</strong> (MB) : " +
      zip_file_size +
      "<br>" +
      "<strong>Export size</strong> (MB) : " +
      binded_file_size +
      "</small></p>";
    document.getElementById("hot_export_btn").disabled = false;
    document.getElementById("loadgeojson").disabled = false;
    document.getElementById("geojsontextarea").disabled = false;
    document.getElementById("filename").disabled = false;
    map.addControl(drawControlEditOnly);
  }

  function handle_error(msg) {
    try {
      stat = document.getElementById("summary_response").rows[1].cells;
      stat[1].innerHTML = '<p style="color:red;">' + msg + "</p>";
      document.getElementById("hot_export_btn").disabled = false;
      document.getElementById("loadgeojson").disabled = false;
      document.getElementById("geojsontextarea").disabled = false;
      // document.getElementById("filename").disabled = false;

      map.addControl(drawControlEditOnly);
    } catch (err) {
      stat[1].innerHTML =
        '<p style="color:red;">' + "Error , API didn't responded" + "</p>";
      document.getElementById("hot_export_btn").disabled = false;
      document.getElementById("loadgeojson").disabled = false;
      document.getElementById("geojsontextarea").disabled = false;
      document.getElementById("filename").disabled = false;

      map.addControl(drawControlEditOnly);
    }
  }

  const form = document.querySelector("form");
  form.addEventListener("submit", handleSubmit);

  //Clone the hidden element and shows it
  $("#custom_tag_add_btn").click(function () {
    $("#custom_tag_content")
      .first()
      .clone()
      .appendTo("#custom_tag_content_show")
      .show();
    attach_delete();
  });

  $("#attr_elem_btn").click(function () {
    $("#attr_elem").first().clone().appendTo("#attr_elem_stuff").show();
    attach_delete();
  });

  //Attach functionality to delete buttons
  function attach_delete() {
    $(".delete").off();
    $(".delete").click(function () {
      console.log("click");
      $(this).closest(".form-group").remove();
    });
  }
  $(function () {
    $('[data-toggle="tooltip"]').tooltip();
  });
  var max_fields = 5;
  var wrapper = $("#columnadd");
  var add_button = $("#addcolumnkey");

  var x = 1;
  $(add_button).click(function (e) {
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

  $(wrapper).on("click", "#columndelete", function (e) {
    e.preventDefault();
    $(this).parent("div").remove();
    x--;
  });

  function loadRawGeojsonToMap() {
    jsonstring = document.getElementById("geojsontextarea");
    value = jsonstring.value;
    geojson_layer = JSON.parse(jsonstring.value);
    try {
      value = jsonstring.value;
      geojson_layer = JSON.parse(jsonstring.value);
      document.querySelector("a.leaflet-draw-edit-remove").click();
      var geoJsonGroup = L.geoJson(geojson_layer, {
        style: function (feature) {
          return {
            color: "#d6403f",
            opacity: 1,
            fillOpacity: 0,
          };
        },
      });

      addNonGroupLayers(geoJsonGroup, editableLayers);
      var bounds = geoJsonGroup.getBounds();

      // Zoom the map to the bounds of the GeoJSON layer
      map.fitBounds(bounds);

      // editableLayers.addLayer(L.geoJSON(geojson_layer));
      map.removeControl(drawControlFull);
      map.addControl(drawControlEditOnly);
      stat = document.getElementById("summary_response").rows[1].cells;
      stat[1].innerHTML =
        '<div class="alert alert-warning alert-dismissible fade show" role="alert"><strong>Ready to Run</strong></div>';
      area = document.getElementById("summary_response").rows[0].cells;
      area[1].innerHTML = "To be Calculated";
      document.getElementById("geojsontextarea").value = value;
    } catch (error) {
      console.log(error);
      alert(error);
    }
  }

  $("#loadgeojson").click(function () {
    loadRawGeojsonToMap();
  });

  function load_geojson(geojson_layer) {
    console.log("loading geojson to map");
    document.querySelector("a.leaflet-draw-edit-remove").click();

    var geoJsonGroup = L.geoJson(geojson_layer);
    map.fitBounds(geoJsonGroup.getBounds());
    addNonGroupLayers(geoJsonGroup, editableLayers);
    // editableLayers.addLayer(L.geoJSON(geojson_layer));
    map.removeControl(drawControlFull);
    map.addControl(drawControlEditOnly);
    stat = document.getElementById("summary_response").rows[1].cells;
    stat[1].innerHTML =
      '<div class="alert alert-warning alert-dismissible fade show" role="alert"><strong>Ready to Run</strong></div>';
    area = document.getElementById("summary_response").rows[0].cells;
    area[1].innerHTML = "To be Calculated";
  }

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
      onEachFeature: function (feature, layer) {
        if (
          layer.feature.geometry.type == "Polygon" ||
          layer.feature.geometry.type == "MultiPolygon"
        ) {
          var t_style = myStyle;
          layer.setStyle(t_style);
        } else if (layer.feature.geometry.type == "Point") {
          var ico = L.icon({
            iconUrl: "assets/img/marker.png",
            iconSize: [6, 6],
          });
          layer.setIcon(ico);
        } else if (
          layer.feature.geometry.type == "LineString" ||
          layer.feature.geometry.type == "MultiLineString"
        ) {
          var t_style = {
            color: "#FFA500",
            weight: 2,
            opacity: 2,
            fillOpacity: 0.01,
          };
          layer.setStyle(t_style);
        } else if (layer.feature.geometry.type == "GeometryCollection") {
          layer.eachLayer(function (layer_GeometryCollection) {
            if (layer_GeometryCollection._latlng) {
              var ico = L.icon({
                iconUrl: "assets/img/marker.png",
                iconSize: [6, 6],
              });
              layer_GeometryCollection.setIcon(ico);
            } else {
              var t_style = {
                color: "#00008B",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.01,
              };
              layer.setStyle(t_style);
            }
          });
        }

        var popupContent = "<table class='popup-table'>"; // Apply a class to the table
        for (var p in feature.properties) {
          popupContent +=
            "<tr><td class='popup-key'>" +
            p +
            "</td><td class='popup-value'>" +
            JSON.stringify(feature.properties[p]) +
            "</td></tr>";
        }
        popupContent += "</table>";
        popupContent += "</table>";
        layer.bindPopup(popupContent, {
          closeButton: false,
        });
        layer.on("mouseover", function () {
          layer.openPopup();
        });
        layer.on("mouseout", function () {
          layer.closePopup();
        });
      },
    }).addTo(map);

    map.fitBounds(result_geojson.getBounds());
  }

  function addNonGroupLayers(sourceLayer, targetGroup) {
    if (sourceLayer instanceof L.LayerGroup) {
      sourceLayer.eachLayer(function (layer) {
        addNonGroupLayers(layer, targetGroup);
      });
    } else {
      targetGroup.addLayer(sourceLayer);
    }
  }

  function check_status() {
    api_url = get_api_url() + "status/";
    $.ajax({
      type: "GET",
      url: api_url,
      // contentType: "text/plain; charset=utf-8",
      success: function (data) {
        // console.log(data);
        document.getElementById("db_status").innerHTML =
          "<strong> Database Updated " +
          moment(data.lastUpdated).fromNow() +
          "</strong>";
      },
      error: function (e) {
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

  $('input[name="download_everything"]').click(function () {
    if (this.checked) {
      $(".form-check").each(function () {
        // print(this)
        $('input[type="checkbox"]').prop("disabled", true);
      });
    } else {
      $(".form-check").each(function () {
        // print(this)
        $('input[type="checkbox"]').prop("disabled", false);
      });
    }
    $(this).prop("disabled", false);
  });

  $('input[name="upload_geojson"]').change(function () {
    console.log("upload geojson clicked");
    let fileInput = document.getElementById("formFileGeojson");
    let geojson_file = fileInput.files[0];

    var filePath = fileInput.value;
    var allowedExtensions = /(\.geojson)$/i;
    if (!allowedExtensions.exec(filePath)) {
      alert("Invalid file type : Only .geojson supported");
      fileInput.value = "";
      return false;
    }
    let file_size_in_mb = geojson_file.size * 0.000001;
    if (file_size_in_mb > 5) {
      alert("Maximum 5 Mb of file Supported");
      fileInput.value = "";
      return false;
    }
    document.getElementById("geojsontextarea").value = "";
    var reader = new FileReader();
    reader.onload = (function (theFile) {
      return function (e) {
        // console.log(e.target.result);
        document.getElementById("geojsontextarea").value = e.target.result;
        $("#tab-5").tab("show");
      };
    })(geojson_file);
    reader.readAsText(geojson_file);
    document.getElementById("formFileGeojson").value = null;
  });
  var typingTimer;
  var doneTypingInterval = 500;

  $("#searchCountryInput").on("input", function () {
    clearTimeout(typingTimer);
    var query = $(this).val().trim();
    if (query !== "") {
      typingTimer = setTimeout(function () {
        $.ajax({
          url: get_api_url() + "countries/?q=" + query,
          method: "GET",
          success: function (data) {
            updateAutocompleteResults(data.features);
          },
        });
      }, doneTypingInterval);
    } else {
      $("#autocompleteResults").empty().hide();
    }
  });

  function updateAutocompleteResults(features) {
    var autocompleteResults = $("#autocompleteResults");
    autocompleteResults.empty().show();

    features.forEach(function (feature) {
      var resultItem = $(
        "<a href='#' class='list-group-item list-group-item-action'>" +
          feature.properties.description +
          "</a>"
      );
      resultItem.click(function () {
        renderFeatureOnMap(feature);
        $("#searchCountryInput").val("");
        autocompleteResults.empty().hide();
      });

      autocompleteResults.append(resultItem);
    });
  }

  function renderFeatureOnMap(feature) {
    document.getElementById("geojsontextarea").value = JSON.stringify(feature);
    loadRawGeojsonToMap();
  }

  function isAccessTokenPresent() {
    return localStorage.getItem("access_token") !== null;
  }
  function fetchUserDetails() {
    var apiEndpoint = get_api_url() + "auth/me/";

    var accessToken = localStorage.getItem("access_token");
    fetch(apiEndpoint, {
      method: "GET",
      headers: {
        "access-token": accessToken,
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        displayUserProfile(data);
      })
      .catch((error) => {
        console.error("Error fetching user details:", error);
        displayError();
      });
  }

  function displayUserProfile(userDetails) {
    var modalContent = `
      <div class="modal-header">
        <h5 class="modal-title" id="osmLoginModalLabel">Welcome, ${userDetails.username}!</h5>
      </div>
      <div class="modal-body text-center">
        <div class="user-profile">
          <img src="${userDetails.img_url}" alt="User Profile Image" class="img-fluid profile-image">
          <div class="profile-details">
            <p class="profile-name">${userDetails.username}</p>
            <button type="button" class="btn btn-danger" onclick="signOut()">Sign Out</button>
          </div>
        </div>
      </div>
      <script>
      function signOut() {
        localStorage.removeItem("access_token");
        console.log("access_token revoked");
        var modal = document.getElementById("osmLoginModal");
        var modalInstance = new bootstrap.Modal(modal);
        modalInstance.hide();
      }
      </script>
    `;

    $("#osmLoginModal .modal-content").html(modalContent);
  }

  function displayError() {
    var modalContent = `
      <div class="modal-header">
        <h5 class="modal-title" id="osmLoginModalLabel">Error Fetching User Details</h5>
      </div>
      <div class="modal-body text-center">
        <p>There was an error fetching user details. Please try again.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      </div>
    `;
    $("#osmLoginModal .modal-content").html(modalContent);
  }
  $("#clickHereLink").click(function () {
    fetch(get_api_url() + "auth/login/")
      .then((response) => response.json())
      .then((data) => {
        window.open(data.login_url, "_blank");
      })
      .catch((error) => console.error("Error:", error));
  });

  $("#loginbtn").click(function () {
    var modal = document.getElementById("osmLoginModal");
    var modalInstance = new bootstrap.Modal(modal);

    if (isAccessTokenPresent()) {
      fetchUserDetails();
      modalInstance.show();
    } else {
      modalInstance.show();
    }
  });

  $("#loginsubmitbtn").click(function () {
    var accessToken = document.getElementById("accessTokenInput").value;
    localStorage.setItem("access_token", accessToken);
    fetchUserDetails();
  });
  document.getElementById("formFileGeojson").click();
  document.getElementById("custom_tag_add_btn").click();
});
