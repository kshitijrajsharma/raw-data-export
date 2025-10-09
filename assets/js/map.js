$(document).ready(function () {
  let resultVectorGrid = null;
  let result_geojson = null;
  let clipping_boundary = null;
  let exportPayload = {};
  let currentPollingInterval = null;

  window.onbeforeunload = () => "Are you sure you want to leave? Think of your existing exports!";

  const summaryRows = {
    area: () => $("#summary_response").find("tr:eq(0) td"),
    status: () => $("#summary_response").find("tr:eq(1) td"),
    responseTime: () => $("#summary_response").find("tr:eq(2) td"),
    downloadUrl: () => $("#summary_response").find("tr:eq(3) td"),
    taskId: () => $("#summary_response").find("tr:eq(4) td")
  };

  function updateSummaryRow(row, content) {
    summaryRows[row]().html(content);
  }

  function checkAndResumeExport() {
    const savedTaskId = localStorage.getItem("current_task_id");
    if (savedTaskId && confirm(`Found a previous export (Task ID: ${savedTaskId}). Do you want to load the results?`)) {
      updateSummaryRow("taskId", `<span style="font-size: 0.85em; font-style: italic;">${savedTaskId}</span>`);
      updateSummaryRow("status", '<div class="alert alert-warning alert-dismissible fade show" role="alert"><strong>Loading...</strong></div>');
      call_api_result(get_api_url() + `tasks/status/${savedTaskId}/`);
    } else if (savedTaskId) {
      localStorage.removeItem("current_task_id");
      clear_summary();
    }
  }

  const map = L.map("map", {
    minZoom: 2,
    maxZoom: 18,
    attributionControl: false,
  }).setView([28.2957487, 83.8123341], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  check_status();
  checkAndResumeExport();
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

  const editableLayers = new L.FeatureGroup();
  map.addLayer(editableLayers);

  $("#server").on("change", function () {
    localStorage.setItem("server", this.value);
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

  function handlePolygonUpdate(layer) {
    const geojson = layer.toGeoJSON();
    const seeArea = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
    const areaInSqKm = parseFloat(seeArea / 1000000).toFixed(2);

    $("#geojsontextarea").val(JSON.stringify(geojson));
    exportPayload.geometry = geojson;

    updateSummaryRow("area", parseInt(areaInSqKm) == 0 ? "Less than a Sq KM" : `${areaInSqKm} Sq Km`);
    updateSummaryRow("status", '<div class="alert alert-warning alert-dismissible fade show" role="alert"><strong>Ready to Run</strong></div>');
  }

  map.on("draw:created", function (e) {
    clear_summary();
    if (e.layerType === "polygon" || e.layerType === "rectangle") {
      handlePolygonUpdate(e.layer);
    }
    editableLayers.addLayer(e.layer);
    map.removeControl(drawControlFull);
    map.addControl(drawControlEditOnly);
  });

  map.on("draw:edited", function (e) {
    clear_summary();
    e.layers.eachLayer(handlePolygonUpdate);
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
    ["area", "status", "responseTime", "downloadUrl", "taskId"].forEach(row => updateSummaryRow(row, ""));
    [result_geojson, resultVectorGrid, clipping_boundary].forEach(layer => {
      if (layer && map.hasLayer(layer)) layer.remove();
    });
    if (currentPollingInterval) {
      clearTimeout(currentPollingInterval);
      currentPollingInterval = null;
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

  function generate_json_payload() {
    var payload = {};

    if (document.getElementById("filename").value !== "") {
      payload.fileName = document.getElementById("filename").value;
    }

    const form_data = new FormData(document.forms[0]);
    const outputType = form_data.getAll("outputType");

    if (outputType.length > 0) {
      payload.outputType = outputType[0];
    }

    payload.uuid = document.getElementById("include_uuid").checked;
    payload.bindZip = document.getElementById("bind_zip").checked;
    payload.useStWithin = document.getElementById("useStWithin").checked;
    payload.centroid = document.getElementById("centroid").checked;
    payload.includeUserMetadata = document.getElementById(
      "includeUserMetadata"
    ).checked;

    const queueSelect = document.getElementById("queue_type");
    payload.queue = queueSelect ? queueSelect.value : "raw_daemon";

    if (document.getElementById("download_everything").checked) {
      console.log("Downloading everything inside area, Ignoring other fields");
    } else {
      const geometryType = form_data.getAll("geometryType");
      const osmTags = form_data.getAll("osmTags");
      const osmElements = form_data.getAll("osmElements");
      const osmTags_custom_key = form_data.getAll("customtag_key");
      const osmTags_custom_value = form_data.getAll("customtag_value");
      const columns_filter = form_data.getAll("column_key");

      if (geometryType.length > 0) {
        payload.geometryType = geometryType;
      }

      if (osmTags.length > 0 || osmTags_custom_key.length > 0) {
        const tagsobj = {};

        if (osmTags.length > 0) {
          for (const tag of osmTags) {
            tagsobj[tag] = tag === "boundary" ? ["administrative"] : [];
          }
        }

        if (osmTags_custom_key.length > 0) {
          for (let i = 0; i < osmTags_custom_key.length; i++) {
            if (osmTags_custom_value[i] !== "") {
              const myArray = osmTags_custom_value[i].split(",");
              tagsobj[osmTags_custom_key[i]] = myArray;
            } else if (osmTags_custom_key[i] !== "") {
              tagsobj[osmTags_custom_key[i]] = [];
            }
          }
        }

        payload.filters = {
          tags: {
            all_geometry: {
              [document.getElementById("jointype").value]: tagsobj,
            },
          },
        };

        if (columns_filter.length > 0 && columns_filter[0] !== "") {
          payload.filters.attributes = {
            all_geometry: columns_filter,
          };
        }
      }
    }
    const geojsonValue = document.getElementById("geojsontextarea").value;
    if (geojsonValue && geojsonValue.trim() !== "") {
      payload.geometry = JSON.parse(geojsonValue);
    }
    // console.log(payload);
    exportPayload = payload;
  }

  function setFormEnabled(enabled) {
    ["hot_export_btn", "loadgeojson", "filename", "geojsontextarea"].forEach(id => {
      document.getElementById(id).disabled = !enabled;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    clear_summary();
    localStorage.removeItem("current_task_id");
    setFormEnabled(false);
    map.removeControl(drawControlEditOnly);

    const data = editableLayers.toGeoJSON();
    if (JSON.stringify(data) === '{"type":"FeatureCollection","features":[]}') {
      updateSummaryRow("status", "No Polygon Supplied");
      setFormEnabled(true);
      map.addControl(drawControlEditOnly);
      return;
    }

    generate_json_payload();
    updateSummaryRow("status", '<div class="alert alert-warning alert-dismissible fade show" role="alert"><strong>Pending</strong></div>');

    const headers = {
      "accept": "application/json",
      "Content-Type": "application/json"
    };
    if (isAccessTokenPresent()) {
      headers["access-token"] = localStorage.getItem("access_token");
    }

    $.ajax({
      type: "POST",
      url: get_api_url() + "snapshot/",
      headers: headers,
      data: JSON.stringify(exportPayload),
      success: function (data) {
        const taskId = data.task_id;
        localStorage.setItem("current_task_id", taskId);
        updateSummaryRow("taskId", `<span style="font-size: 0.85em; font-style: italic;">${taskId}</span>`);
        call_api_result(get_api_url() + `tasks/status/${taskId}/`);
      },
      error: function (e) {
        handle_error(e.responseJSON?.detail?.[0]?.msg || "Couldn't Reach to API");
      }
    });
  }

  function showSpinner(show) {
    const spinnerContainer = document.getElementById("spinnerid");
    if (spinnerContainer) {
      spinnerContainer.style.display = show ? "block" : "none";
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
          const fileSizeMb = data.result.zip_file_size_bytes / 1000000;
          if (fileSizeMb < 4 || confirm(`The zip file size is ${fileSizeMb.toFixed(2)} MB, which is large and may take time to load. Do you still want to visualize it?`)) {
            unzip_file(data.result.download_url);
          }
        } else if (data.status === "FAILURE") {
          localStorage.removeItem("current_task_id");
          handle_error("Task Failed" + (data.result || ""));
        } else {
          updateSummaryRow("status", `<div class="alert alert-danger alert-dismissible fade show" role="alert"><strong>${data.status}</strong></div>`);
          currentPollingInterval = setTimeout(() => call_api_result(call_url), 2000);
        }
      },
      error: function (e) {
        handle_error(e.responseJSON?.detail?.[0]?.msg || "API Error");
      }
    });
  }

  function fit_bounds_geojson(geojson) {
    clipping_boundary = L.geoJson(geojson, {
      style: {
        fillOpacity: 0,
        weight: 2,
        color: "#d6403f",
        interactive: false,
      },
    });
    clipping_boundary.addTo(map);
    var bounds = clipping_boundary.getBounds();
    var centroid = bounds.getCenter();
    var desiredZoomLevel = 18;
    map.setView(centroid, desiredZoomLevel);
  }

  function unzip_file(url) {
    if (url.toLowerCase().endsWith(".zip")) {
      console.log("Unziping file " + url);
      JSZipUtils.getBinaryContent(url, function (err, data) {
        JSZip.loadAsync(data).then(function (zip) {
          for (let [filename, file] of Object.entries(zip.files)) {
            if (filename == "clipping_boundary.geojson") {
              zip
                .file(filename)
                .async("string")
                .then(function (data) {
                  fit_bounds_geojson(JSON.parse(data));
                });
            } else {
              if (filename.slice(-7).toLowerCase() === "geojson") {
                zip
                  .file(filename)
                  .async("string")
                  .then(function (data) {
                    loadResultToMapWithSlicer(JSON.parse(data));
                  });
              }
            }
          }
        });
      });
    }
  }

  function extractFilename(url) {
    const filename = url.split("/").pop();
    return filename.replace(/_uid_[^.]+/, "");
  }

  function formatFileSize(bytes) {
    const mb = parseFloat(bytes / 1000000).toFixed(2);
    return parseInt(mb) == 0 ? "Less than a MB" : mb;
  }

  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('Download link copied to clipboard!');
  }

  function populate_results(data) {
    updateSummaryRow("area", parseInt(data.query_area) == 0 ? "Less than a Sq KM" : data.query_area);
    updateSummaryRow("status", '<div class="alert alert-success alert-dismissible fade show" role="alert"><strong>Success</strong></div>');
    updateSummaryRow("responseTime", data.process_time);

    const zipSize = formatFileSize(data.zip_file_size_bytes);
    const bindedSize = parseInt(data.binded_file_size) == 0 ? "Less than a MB" : data.binded_file_size;
    let downloadHtml = `
      <a id="response_file_download" href="${data.download_url}">${extractFilename(data.download_url)}</a>
      &nbsp;<span style="cursor: pointer;" onclick="copyToClipboard('${data.download_url}')" title="Copy Link">&#x1F4CB;</span>
      <p><small><strong>Zip size</strong> (MB): ${zipSize}<br><strong>Export size</strong> (MB): ${bindedSize}</small></p>
    `;

    window.copyToClipboard = copyToClipboard;

    if (data?.stats) {
      downloadHtml += `
        <span style="font-size: 12px; margin-right: 5px;"><strong>About the Data:</strong></span>
        <span id="statsIcon" style="cursor: pointer;" title="View Stats">&#9432;</span>
      `;
    }

    updateSummaryRow("downloadUrl", downloadHtml);

    if (data?.stats) {
      let tooltip = null;
      $("#statsIcon").hover(
        function () {
          tooltip = $("<div>").html(
            `<p style='text-align: justify; font-size: 12px; margin-bottom: 8px;'><strong>Raw:</strong></p>
             <pre style='font-size: 10px; margin-bottom: 8px; max-width: 300px; overflow: auto;'>${JSON.stringify(data.stats.raw, null, 2)}</pre>`
          ).css({
            position: "absolute",
            background: "white",
            border: "1px solid #ccc",
            padding: "10px",
            zIndex: "1000",
            maxWidth: "350px"
          }).appendTo("body");
        },
        function () {
          if (tooltip) tooltip.remove();
        }
      );
    }

    setFormEnabled(true);
    map.addControl(drawControlEditOnly);
  }

  function handle_error(msg) {
    updateSummaryRow("status", `<p style="color:red;">${msg}</p>`);
    setFormEnabled(true);
    map.addControl(drawControlEditOnly);
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
      // console.log("click");
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

  async function loadRawGeojsonToMap() {
    jsonstring = document.getElementById("geojsontextarea");
    value = jsonstring.value;

    if (!value || value.trim() === "") {
      alert("Please enter valid GeoJSON in the textarea");
      return;
    }

    try {
      geojson_layer = JSON.parse(value);
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

      map.fitBounds(bounds);

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
    const geojsonValue = document.getElementById("geojsontextarea").value;
    if (geojsonValue && geojsonValue.trim() !== "") {
      exportPayload.geometry = JSON.parse(geojsonValue);
      console.log(exportPayload);
      loadRawGeojsonToMap();
    } else {
      alert("Please enter valid GeoJSON in the textarea");
    }
  });

  function loadResultToMapWithSlicer(geojsonLayer) {
    showSpinner(true);
    if (map.hasLayer(resultVectorGrid)) {
      resultVectorGrid.remove();
    }
    editableLayers.clearLayers();

    var myStyle = function (properties, zoom) {
      // Style based on geometry type, similar to previous example
      var geometryType = properties.osm_type;
      if (geometryType === "ways_poly" || geometryType === "MultiPolygon") {
        return {
          color: "#00008B",
          weight: 0.8,
          opacity: 1,
          fillOpacity: 0.01,
        };
      } else if (
        geometryType === "ways_line" ||
        geometryType === "MultiLineString"
      ) {
        return {
          color: "#FFA500",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.01,
        };
      } else if (geometryType == "nodes") {
        return {
          color: "#ff0000",
          radius: 4,
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.01,
        };
      }
      // Default style
      return {
        color: "#008000",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.01,
      };
    };

    var vectorGrid = L.vectorGrid
      .slicer(geojsonLayer, {
        rendererFactory: L.svg.tile,
        vectorTileLayerStyles: {
          sliced: myStyle,
        },
        maxNativeZoom: 18,
        maxZoom: 18,
        interactive: true,
        getFeatureId: function (f) {
          return f.properties.osm_id;
        },
      })
      .on("mouseover", function (e) {
        if (!document.getElementById("enable_attributes").checked) {
          return;
        }

        var properties = e.layer.properties;
        var popupContent = "<table class='popup-table'>";
        for (var p in properties) {
          popupContent +=
            "<tr><td class='popup-key'>" +
            p +
            "</td><td class='popup-value'>" +
            JSON.stringify(properties[p]) +
            "</td></tr>";
        }
        popupContent += "</table>";
        L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(map);
      })
      .addTo(map);

    // map.fitBounds(vectorGrid.getBounds());

    resultVectorGrid = vectorGrid;
    showSpinner(false);
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
    // console.log("upload geojson clicked");
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
        localStorage.removeItem("access_token");
      });
  }
  function get_role(role) {
    if (role == 1) {
      return "ADMIN";
    }
    if (role == 2) {
      return "STAFF";
    }
    if (role == 3) {
      return "GUEST";
    }
  }

  function displayUserProfile(userDetails) {
    var modalContent = `
      <div class="modal-header">
        <h5 class="modal-title" id="osmLoginModalLabel">Welcome, ${get_role(
      userDetails.role
    )} User !</h5>
      </div>
      <div class="modal-body text-center">
        <div class="user-profile">
          <img src="${userDetails.img_url
      }" alt="User Profile Image" class="img-fluid profile-image">
          <div class="profile-details">
            <p class="profile-name">${userDetails.username}</p>
            <p> OSM ID : ${userDetails.id
      }  <span style="cursor: pointer;" onclick="copyToClipboard('${localStorage.getItem("access_token") || ""
      }')" title="Copy access token">&#x1F4CB;</span></p>
          
            <button type="button" class="btn btn-danger" onclick="signOut()">Sign Out</button>
          </div>
        </div>
      </div>
      <script>
      function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
          .then(() => {
            alert('Access Token copied!');
          })
          .catch((err) => {
            console.error('Unable to copy to clipboard', err);
          });
      }
  
      function signOut() {
        localStorage.removeItem("access_token");
        console.log("access_token revoked");
        location.reload();
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
        <button type="button" class="btn btn-secondary" onclick="location.reload()">Reload</button>
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
  generate_json_payload();
});
