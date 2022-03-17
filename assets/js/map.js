$(document).ready(function () {
  var map = L.map("map", {
    minZoom: 2,
    attributionControl: false,
  });
  map.setView([28.2957487, 83.8123341], 3);
  L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

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

  map.on("draw:created", function (e) {
    clear_summary();
    var type = e.layerType,
      layer = e.layer;

    if (type === "polygon" || type == "rectangle") {
      var seeArea = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
      area = document.getElementById("summary_response").rows[0].cells;
      area[1].innerHTML = parseInt(seeArea / 1000000) + " Sq Km";
      stat = document.getElementById("summary_response").rows[1].cells;
      stat[1].innerHTML = "Ready to Run";
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
      stat = document.getElementById("summary_response").rows[1].cells;
      stat[1].innerHTML = "Ready to Run";
      console.log(layer.toGeoJSON());

      //do whatever you want; most likely save back to db
    });
  });

  L.EditToolbar.Delete.include({
    enable: function () {
      this.options.featureGroup.clearLayers();
      map.removeControl(drawControlEditOnly);
      map.addControl(drawControlFull);
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
  function handleSubmit(event) {
    document.getElementById("hot_export_btn").disabled = true;
    event.preventDefault();
    var data = editableLayers.toGeoJSON();
    console.log(data);
    stat = document.getElementById("summary_response").rows[1].cells;
    if (JSON.stringify(data) != '{"type":"FeatureCollection","features":[]}') {
      var input = '{"geometry":' + JSON.stringify(data.features[0].geometry);
      const form_data = new FormData(event.target);
      geometryType = form_data.getAll("geometryType");
      osmTags = form_data.getAll("osmTags");
      osmElements = form_data.getAll("osmElements");
      osmTags_custom_key = form_data.getAll("customtag_key");
      osmTags_custom_value = form_data.getAll("customtag_value");

      if (geometryType.length > 0) {
        console.log(geometryType);
        input += ',"geometryType":' + JSON.stringify(geometryType);
      }
      if (osmElements.length > 0) {
        console.log(osmElements);
        input += ',"osmElements":' + JSON.stringify(osmElements);
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

        input += ',"osmTags":' + JSON.stringify(tagsobj);
      }
      input += "}";
      console.log(input);
      stat[1].innerHTML = "Running";
      response_time = document.getElementById("summary_response").rows[2].cells;
      response_time[1].innerHTML = "";
      download_url = document.getElementById("summary_response").rows[3].cells;
      download_url[1].innerHTML = "";
      $.ajax({
        type: "POST",
        url: "http://18.209.245.110:8000/raw-data/current-snapshot/",
        contentType: "text/plain; charset=utf-8",
        data: input,

        success: function (data) {
          console.log(data);
          area = document.getElementById("summary_response").rows[0].cells;
          area[1].innerHTML = data.query_area;
          stat = document.getElementById("summary_response").rows[1].cells;
          stat[1].innerHTML = "Ready to Download";
          response_time =
            document.getElementById("summary_response").rows[2].cells;
          response_time[1].innerHTML = data.response_time;
          download_url =
            document.getElementById("summary_response").rows[3].cells;
          download_url[1].innerHTML =
            '<a id="response_file_download" href="' +
            data.download_url +
            '"> Click Here to Download </a>';
          document.getElementById("hot_export_btn").disabled = false;
        },
        error: function (e) {
          console.log(e.responseJSON);
          stat = document.getElementById("summary_response").rows[1].cells;
          stat[1].innerHTML = e.responseJSON.detail[0].msg;
          document.getElementById("hot_export_btn").disabled = false;
        },
      });
    } else {
      stat[1].innerHTML = "No Polygon Supplied";
    }
  }

  const form = document.querySelector("form");
  form.addEventListener("submit", handleSubmit);

  //Clone the hidden element and shows it
  $(".add-one").click(function () {
    $(".dynamic-element").first().clone().appendTo(".dynamic-stuff").show();
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
});
