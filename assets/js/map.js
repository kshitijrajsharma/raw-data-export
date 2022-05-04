$(document).ready(function () {
  check_status();
  var map = L.map("map", {
    minZoom: 2,
    attributionControl: false,
  });
  map.setView([28.2957487, 83.8123341], 7);
  L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.addControl( new L.Control.Search({
		url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
		jsonpParam: 'json_callback',
		propertyName: 'display_name',
		propertyLoc: ['lat','lon'],
		marker: L.circleMarker([0,0],{radius:30}),
		autoCollapse: true,
		autoType: false,
		minLength: 2
	}) );

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
      document.getElementById("geojsontextarea").value=JSON.stringify(layer.toGeoJSON());
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
      document.getElementById("geojsontextarea").value=JSON.stringify(layer.toGeoJSON());

      
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
      document.getElementById("geojsontextarea").value="";

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
      const form_data = new FormData(event.target);
      geometryType = form_data.getAll("geometryType");
      osmTags = form_data.getAll("osmTags");
      osmElements = form_data.getAll("osmElements");
      outputType = form_data.getAll("outputType");

      osmTags_custom_key = form_data.getAll("customtag_key");
      osmTags_custom_value = form_data.getAll("customtag_value");
      columns_filter = form_data.getAll("column_key");

      if (outputType.length > 0) {
        console.log(outputType);
        input += ',"outputType":' + JSON.stringify(outputType[0]);
      }

      if (document.getElementById("filename").value!=""){
        input += ',"fileName":"'+document.getElementById("filename").value+'"';
      }


      if (geometryType.length > 0) {
        console.log(geometryType);
        input += ',"geometryType":' + JSON.stringify(geometryType);
      }
      if (osmElements.length > 0) {
        console.log(osmElements);
        input += ',"osmElements":' + JSON.stringify(osmElements);
      }
      if (columns_filter.length > 0) {
        console.log(columns_filter);
        if (columns_filter[0] != "") {
          console.log(columns_filter);
          input += ',"columns":' + JSON.stringify(columns_filter);
        }
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
        url: "http://44.203.33.53:8000/raw-data/current-snapshot/",
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
            '"> Download </a><p><small>( Zip Size : '+data.zip_file_size+' MB, Inside File size : '+data.binded_file_size+' )</small></p>';
          document.getElementById("hot_export_btn").disabled = false;
          document.getElementById("loadgeojson").disabled = false;
          document.getElementById("geojsontextarea").disabled = false;
          document.getElementById("filename").disabled = false;

          map.addControl(drawControlEditOnly);

        },
        error: function (e) {
          try {
          console.log(e.responseJSON);
          stat = document.getElementById("summary_response").rows[1].cells;
          stat[1].innerHTML = '<p style="color:red;">'+e.responseJSON.detail[0].msg+'</p>';
          document.getElementById("hot_export_btn").disabled = false;
          document.getElementById("loadgeojson").disabled = false;
          document.getElementById("geojsontextarea").disabled = false;
          document.getElementById("filename").disabled = false;

          map.addControl(drawControlEditOnly);

          }
          catch(err) {
            stat[1].innerHTML = '<p style="color:red;">'+"Error , API didn't responded"+'</p>' ;
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
    $("#custom_tag_content").first().clone().appendTo("#custom_tag_content_show").show();
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
  $(add_button).click(function(e) {
      e.preventDefault();
      if (x < max_fields) {
          x++;
          $(wrapper).append('<div class="col-sm-9 col-md-6 col-lg-8 col-xl-10"><input type="text" class="form-control" name="column_key" placeholder="Osm Key"/> <div class="col-sm-3 col-md-6 col-lg-4 col-xl-2" id="columndelete"><p class="delete">-</p></div></div>'); //add input box
      } else {
          alert('You Reached the limits')
      }
  });

  $(wrapper).on("click", "#columndelete", function(e) {
      e.preventDefault();
      $(this).parent('div').remove();
      x--;
  })

  $("#loadgeojson").click(function () {
    jsonstring = document.getElementById('geojsontextarea');
    try {
      value=jsonstring.value;
      geojson_layer=JSON.parse(jsonstring.value);
      document.querySelector("a.leaflet-draw-edit-remove").click(); 
      
      editableLayers.addLayer(L.geoJSON(geojson_layer));
      map.removeControl(drawControlFull);
      map.addControl(drawControlEditOnly);
      stat = document.getElementById("summary_response").rows[1].cells;
      stat[1].innerHTML = "Ready to Run";
      area = document.getElementById("summary_response").rows[0].cells;
      area[1].innerHTML = "To be Calculated";
      document.getElementById("geojsontextarea").value=value;
    } catch (error) {
      console.log(error);
      alert(error);
    }
});

  function check_status(){
    $.ajax({
      type: "GET",
      url: "http://44.203.33.53:8000/raw-data/status/",
      contentType: "text/plain; charset=utf-8",
      success: function (data) {
        // console.log(data);
        document.getElementById("db_status").innerHTML = '<strong> Database Updated '+data.last_updated+'</strong>';
      },
      error: function (e) {
        console.log(e);
        document.getElementById("db_status").innerHTML = '<p style="color:red;">Could not connect to Database</p>';
      },
    });
  }
  // let nIntervId;
  // if (!nIntervId) {
  //   nIntervId = setInterval(check_status, 120000);
  // }
});
