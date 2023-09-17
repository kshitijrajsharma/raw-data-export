$(document).ready(function () {
  window.onbeforeunload = function () {
    return "Dude, are you sure you want to leave? Think of your existing exports!";
  };
  check_status();
  var map = L.map("map", {
    minZoom: 2,
    attributionControl: false,
  });
  map.setView([28.2957487, 83.8123341], 4);
  L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
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
        },
        metric: true,
      },
      polygon: {
        shapeOptions: {
          color: "#d6403f",
          opacity: 1,
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
  }

  function checkTaskStatus(taskId) {
    api_url = get_api_url() + `tasks/status/${taskId}/`;
    $.ajax({
      type: "GET",
      url: api_url,
      success: function (taskData) {
        if (taskData.status === "SUCCESS") {
          // Task is successful, you can continue processing the result
          console.log("Task is successful:", taskData);

          // Now you can access the result data and perform further actions
          var data = taskData.result;

          area = document.getElementById("summary_response").rows[0].cells;
          area[1].innerHTML =
            parseInt(data.query_area) == 0
              ? "Less than a Sq KM"
              : data.query_area;
          stat = document.getElementById("summary_response").rows[1].cells;
          stat[1].innerHTML =
            '<div class="alert alert-success alert-dismissible fade show" role="alert"><strong>Success</strong></div>';
          response_time =
            document.getElementById("summary_response").rows[2].cells;
          response_time[1].innerHTML = data.process_time;
          download_url =
            document.getElementById("summary_response").rows[3].cells;
          var zip_file_size =
            parseInt(
              parseFloat(data.zip_file_size_bytes / 1000000).toFixed(2)
            ) == 0
              ? "Less than a MB"
              : parseFloat(data.zip_file_size_bytes / 1000000).toFixed(2);
          var binded_file_size =
            parseInt(data.binded_file_size) == 0
              ? "Less than a MB"
              : data.binded_file_size;
          const viewButton = data.download_url.endsWith(".pmtiles")
            ? '<button id="redirect_button" class="btn btn-primary text-end" style="background: rgb(214, 64, 63)">View</button>'
            : "";

          download_url[1].innerHTML = `<a id="response_file_download" href="${data.download_url}">${data.file_name}</a> ${viewButton} <p><small><strong>Zip size</strong> (MB) : ${zip_file_size}<br><strong>Export size</strong> (MB) : ${binded_file_size}</small></p>`;
          if (data.download_url.endsWith(".pmtiles")) {
            document
              .getElementById("redirect_button")
              .addEventListener("click", function () {
                // Redirect to another website (change 'https://example.com' to the desired URL)
                url =
                  "https://protomaps.github.io/PMTiles/?url=" +
                  data.download_url;
                window.open(url, "_blank");
              });
          }

          document.getElementById("hot_export_btn").disabled = false;
          document.getElementById("loadgeojson").disabled = false;
          document.getElementById("geojsontextarea").disabled = false;
          document.getElementById("filename").disabled = false;
          map.addControl(drawControlEditOnly);
        } else if (
          taskData.status === "PENDING" ||
          taskData.status === "RUNNING"
        ) {
          // Task is still pending or running, continue checking
          setTimeout(function () {
            checkTaskStatus(taskId); // Recursively check again after a delay
          }, 1000); // Adjust the delay time as needed
        } else {
          // Handle other task status scenarios here
          console.log("Task has an unexpected status:", taskData);
          // You might want to display an error message or take other actions
        }
      },
      error: function (e) {
        console.log("Error checking task status:", e);
        try {
          console.log(e.responseJSON);
          stat = document.getElementById("summary_response").rows[1].cells;
          stat[1].innerHTML =
            '<p style="color:red;">' + e.responseJSON.detail[0].msg + "</p>";
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
        // Handle the error here
      },
    });
  }

  function get_api_url() {
    var select = document.getElementById("server");
    var server = select.options[select.selectedIndex].value;
    console.log(server);
    if (server == "prod") {
      api_url = "https://rawdata-demo.hotosm.org/v1/";
    } else if (server == "local") {
      api_url = "http://127.0.0.1:8000/v1/";
    } else {
      api_url = "https://raw-data-api0.hotosm.org/v1/";
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
        console.log(outputType);
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
          console.log(geometryType);
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
                console.log(myArray);
                tagsobj[osmTags_custom_key[i]] = myArray;
              } else {
                if (osmTags_custom_key[i] != "") {
                  tagsobj[osmTags_custom_key[i]] = [];
                }
              }
            }
          }
          console.log(tagsobj);
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
            console.log(columns_filter);
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
      start_time = new Date().toLocaleString();
      stat[1].innerHTML =
        '<div class="alert alert-danger alert-dismissible fade show" role="alert"><strong>Running from ' +
        start_time +
        "</strong></div>";
      response_time = document.getElementById("summary_response").rows[2].cells;
      response_time[1].innerHTML = "";
      download_url = document.getElementById("summary_response").rows[3].cells;
      download_url[1].innerHTML = "";

      api_url = get_api_url() + "snapshot/";

      $.ajax({
        type: "POST",
        url: api_url,
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
        data: input,

        success: function (data) {
          console.log("Task started:", data);
          // Extract the task_id from the response
          var taskId = data.task_id;

          // Call the function to check the task status
          checkTaskStatus(taskId);
        },
        error: function (e) {
          try {
            console.log(e.responseJSON);
            stat = document.getElementById("summary_response").rows[1].cells;
            stat[1].innerHTML =
              '<p style="color:red;">' + e.responseJSON.detail[0].msg + "</p>";
            document.getElementById("hot_export_btn").disabled = false;
            document.getElementById("loadgeojson").disabled = false;
            document.getElementById("geojsontextarea").disabled = false;
            // document.getElementById("filename").disabled = false;

            map.addControl(drawControlEditOnly);
          } catch (err) {
            stat[1].innerHTML =
              '<p style="color:red;">' +
              "Error , API didn't responded" +
              "</p>";
            document.getElementById("hot_export_btn").disabled = false;
            document.getElementById("loadgeojson").disabled = false;
            document.getElementById("geojsontextarea").disabled = false;
            document.getElementById("filename").disabled = false;

            map.addControl(drawControlEditOnly);
          }
        },
      });
    } else {
      stat[1].innerHTML = "No Polygon Supplied";
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

  $("#loadgeojson").click(function () {
    jsonstring = document.getElementById("geojsontextarea");
    try {
      value = jsonstring.value;
      geojson_layer = JSON.parse(jsonstring.value);
      document.querySelector("a.leaflet-draw-edit-remove").click();

      var geoJsonGroup = L.geoJson(geojson_layer);
      addNonGroupLayers(geoJsonGroup, editableLayers);
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
  });

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
          "<strong> Database Updated in " + data.lastUpdated + "</strong>";
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
        // Do everything what you need with the file's content(e.target.result)
        // console.log(e.target.result);
        document.getElementById("geojsontextarea").value = e.target.result;
      };
    })(geojson_file);
    reader.readAsText(geojson_file);
    document.getElementById("formFileGeojson").value = null;
  });

  document.getElementById("formFileGeojson").click();
  document.getElementById("custom_tag_add_btn").click();
});
