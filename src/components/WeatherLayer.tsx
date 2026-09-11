"use client";

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

interface Props {
  map: maplibregl.Map | null;
  popup: maplibregl.Popup | null;
  tempVisible: boolean;
  cloudVisible: boolean;
  rainVisible: boolean;
}

const SOURCE = "weather-data";
const TEMP_HEAT    = "weather-temp-heat";
const TEMP_LABEL   = "weather-label";
const WIND_ARROW   = "weather-wind";
const CLOUD_HEAT   = "weather-cloud-heat";
const RAIN_HEAT    = "weather-rain-heat";

const ICON_EMOJI: Record<string, string> = {
  "clear-day":           "☀️",
  "clear-night":         "🌙",
  "partly-cloudy-day":   "⛅",
  "partly-cloudy-night": "🌤",
  "cloudy":              "☁️",
  "fog":                 "🌫",
  "wind":                "💨",
  "rain":                "🌧",
  "sleet":               "🌨",
  "snow":                "❄",
  "hail":                "🌩",
  "thunderstorm":        "⛈",
};

type VisibilityMap = { [id: string]: boolean };

function applyVisibility(map: maplibregl.Map, vm: VisibilityMap) {
  for (const [id, on] of Object.entries(vm)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

export default function WeatherLayer({ map, popup, tempVisible, cloudVisible, rainVisible }: Props) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!map) return;

    async function init() {
      const res = await fetch("/api/weather");
      if (!res.ok) return;
      const geojson = await res.json();
      if (!map) return;

      if (map.getSource(SOURCE)) {
        (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource(SOURCE, { type: "geojson", data: geojson });
      }

      // ── Cloud cover heatmap (blue) ────────────────────────────────
      // cloud_cover: 0–100 %. Weight = cloud_cover / 100.
      if (!map.getLayer(CLOUD_HEAT)) {
        map.addLayer({
          id: CLOUD_HEAT,
          type: "heatmap",
          source: SOURCE,
          layout: { visibility: cloudVisible ? "visible" : "none" },
          paint: {
            "heatmap-weight": [
              "interpolate", ["linear"],
              ["coalesce", ["get", "cloud_cover"], 0],
              0, 0, 50, 0.5, 100, 1,
            ],
            "heatmap-radius": [
              "interpolate", ["exponential", 2], ["zoom"],
              4, 80, 7, 160, 10, 320,
            ],
            "heatmap-intensity": [
              "interpolate", ["linear"], ["zoom"],
              4, 0.6, 7, 0.9, 10, 1.2,
            ],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0,    "rgba(0,0,0,0)",
              0.1,  "rgba(186,230,253,0.15)",  // sky-200
              0.3,  "rgba(125,211,252,0.35)",  // sky-300
              0.55, "rgba(56,189,248,0.55)",   // sky-400
              0.75, "rgba(14,165,233,0.7)",    // sky-500
              0.9,  "rgba(2,132,199,0.82)",    // sky-600
              1.0,  "rgba(7,89,133,0.92)",     // sky-800
            ],
            "heatmap-opacity": 0.75,
          },
        });
      }

      // ── Rain intensity heatmap (deep blue) ───────────────────────
      // precipitation_10: mm in last 10 min. Non-zero only when raining.
      if (!map.getLayer(RAIN_HEAT)) {
        map.addLayer({
          id: RAIN_HEAT,
          type: "heatmap",
          source: SOURCE,
          layout: { visibility: rainVisible ? "visible" : "none" },
          paint: {
            "heatmap-weight": [
              "interpolate", ["linear"],
              ["coalesce", ["get", "precipitation"], 0],
              0, 0, 1, 0.4, 5, 0.8, 15, 1,
            ],
            "heatmap-radius": [
              "interpolate", ["exponential", 2], ["zoom"],
              4, 90, 7, 180, 10, 360,
            ],
            "heatmap-intensity": [
              "interpolate", ["linear"], ["zoom"],
              4, 1, 7, 1.5, 10, 2,
            ],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0,    "rgba(0,0,0,0)",
              0.05, "rgba(191,219,254,0.2)",   // blue-200
              0.2,  "rgba(147,197,253,0.45)",  // blue-300
              0.4,  "rgba(96,165,250,0.65)",   // blue-400
              0.6,  "rgba(59,130,246,0.8)",    // blue-500
              0.8,  "rgba(37,99,235,0.88)",    // blue-600
              1.0,  "rgba(29,78,216,0.95)",    // blue-700
            ],
            "heatmap-opacity": 0.85,
          },
        });
      }

      // ── Temperature heatmap ───────────────────────────────────────
      // Weight = normalized temperature in [-20, 40] → [0, 1].
      // Uniform-grid source + large radius → continuous interpolated surface.
      // heatmap-density at each pixel ≈ weighted average of nearby points,
      // so the color ramp tracks actual temperature rather than point density.
      if (!map.getLayer(TEMP_HEAT)) {
        map.addLayer({
          id: TEMP_HEAT,
          type: "heatmap",
          source: SOURCE,
          layout: { visibility: tempVisible ? "visible" : "none" },
          paint: {
            "heatmap-weight": [
              "interpolate", ["linear"],
              ["coalesce", ["get", "temperature"], 10],
              -20, 0,
              40,  1,
            ],
            "heatmap-radius": [
              "interpolate", ["exponential", 2], ["zoom"],
              4, 55, 6, 80, 8, 130, 10, 220,
            ],
            "heatmap-intensity": [
              "interpolate", ["linear"], ["zoom"],
              4, 1.6, 6, 1.4, 8, 1.2, 10, 1.0,
            ],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0,    "rgba(0,0,0,0)",
              0.05, "rgba(147,197,253,0.55)",  // cold blue  (-20°)
              0.2,  "rgba(96,165,250,0.70)",   // blue       (-8°)
              0.35, "rgba(52,211,153,0.75)",   // teal-green (3°)
              0.5,  "rgba(134,239,172,0.80)",  // light green(10°)
              0.62, "rgba(253,224,71,0.85)",   // yellow     (17°)
              0.75, "rgba(251,146,60,0.88)",   // orange     (24°)
              0.88, "rgba(239,68,68,0.92)",    // red        (31°)
              1.0,  "rgba(127,29,29,0.96)",    // dark red   (40°)
            ],
            "heatmap-opacity": 0.82,
          },
        });
      }

      // ── Condition icon + temperature label ────────────────────────
      if (!map.getLayer(TEMP_LABEL)) {
        map.addLayer({
          id: TEMP_LABEL,
          type: "symbol",
          source: SOURCE,
          layout: {
            visibility: tempVisible ? "visible" : "none",
            "text-field": [
              "concat",
              ["case",
                ["==", ["get", "icon"], "clear-day"],           "☀ ",
                ["==", ["get", "icon"], "clear-night"],         "🌙 ",
                ["==", ["get", "icon"], "partly-cloudy-day"],   "⛅ ",
                ["==", ["get", "icon"], "partly-cloudy-night"], "🌤 ",
                ["==", ["get", "icon"], "cloudy"],              "☁ ",
                ["==", ["get", "icon"], "fog"],                 "🌫 ",
                ["==", ["get", "icon"], "wind"],                "💨 ",
                ["==", ["get", "icon"], "rain"],                "🌧 ",
                ["==", ["get", "icon"], "sleet"],               "🌨 ",
                ["==", ["get", "icon"], "snow"],                "❄ ",
                ["==", ["get", "icon"], "hail"],                "🌩 ",
                ["==", ["get", "icon"], "thunderstorm"],        "⛈ ",
                "",
              ],
              ["case",
                ["!=", ["get", "temperature"], null],
                ["concat", ["to-string", ["round", ["get", "temperature"]]], "°"],
                "",
              ],
            ],
            "text-size": 13,
            "text-anchor": "center",
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#f1f5f9",
            "text-halo-color": "#0f172a",
            "text-halo-width": 1.5,
          },
        });
      }

      // ── Wind arrows ───────────────────────────────────────────────
      if (!map.getLayer(WIND_ARROW)) {
        map.addLayer({
          id: WIND_ARROW,
          type: "symbol",
          source: SOURCE,
          layout: {
            visibility: tempVisible ? "visible" : "none",
            "text-field": "↑",
            "text-size": [
              "interpolate", ["linear"], ["coalesce", ["get", "wind_speed"], 0],
              0, 10, 10, 14, 20, 18, 40, 22,
            ],
            "text-rotate": ["coalesce", ["get", "wind_direction"], 0],
            "text-rotation-alignment": "map",
            "text-anchor": "center",
            "text-offset": [0, -2.8],
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": [
              "interpolate", ["linear"], ["coalesce", ["get", "wind_speed"], 0],
              0,  "#94a3b8",
              10, "#67e8f9",
              20, "#facc15",
              30, "#f97316",
              40, "#ef4444",
            ],
            "text-opacity": [
              "interpolate", ["linear"], ["coalesce", ["get", "wind_speed"], 0],
              0, 0, 3, 0.7, 40, 1,
            ],
            "text-halo-color": "#0f172a",
            "text-halo-width": 1,
          },
          filter: ["!=", ["get", "wind_direction"], null],
        });
      }

      // ── Popups ────────────────────────────────────────────────────
      function showPopup(e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
        if (!e.features?.length || !popup || !map) return;
        const p = e.features[0].properties as Record<string, string | number | null>;
        const icon = p.icon ? (ICON_EMOJI[p.icon as string] ?? "") : "";
        const windDir = p.wind_direction != null ? `${p.wind_direction}°` : "—";
        const windStr = p.wind_speed != null
          ? `${p.wind_speed} km/h aus ${windDir}${p.wind_gust ? ` (Böen ${p.wind_gust} km/h)` : ""}`
          : "—";
        const vis = p.visibility != null ? `${(+p.visibility / 1000).toFixed(0)} km` : "—";
        popup.setLngLat(e.lngLat).setHTML(
          `<div class="popup-inner">
            <div class="popup-header">
              <span class="popup-dot" style="background:#60a5fa"></span>
              <span class="popup-title">${icon} ${p.station || "Wetterstation"}</span>
            </div>
            <table class="popup-table">
              <tr><td class="popup-key">Temperatur</td><td class="popup-val">${p.temperature != null ? p.temperature + " °C" : "—"}</td></tr>
              <tr><td class="popup-key">Gefühlt</td><td class="popup-val">${p.apparent_temperature != null ? p.apparent_temperature + " °C" : "—"}</td></tr>
              <tr><td class="popup-key">Bewölkung</td><td class="popup-val">${p.cloud_cover != null ? p.cloud_cover + "%" : "—"}</td></tr>
              <tr><td class="popup-key">Niederschlag</td><td class="popup-val">${p.precipitation != null ? p.precipitation + " mm" : "—"}</td></tr>
              <tr><td class="popup-key">Wind</td><td class="popup-val">${windStr}</td></tr>
              <tr><td class="popup-key">Sichtweite</td><td class="popup-val">${vis}</td></tr>
              <tr><td class="popup-key">Luftdruck</td><td class="popup-val">${p.pressure != null ? p.pressure + " hPa" : "—"}</td></tr>
              <tr><td class="popup-key">Feuchte</td><td class="popup-val">${p.humidity != null ? p.humidity + "%" : "—"}</td></tr>
            </table>
          </div>`
        ).addTo(map);
      }

      for (const layer of [TEMP_HEAT, TEMP_LABEL]) {
        map.on("click", layer, (e) => { e.preventDefault(); showPopup(e); });
        map.on("mousemove", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }

      initialized.current = true;
    }

    if (map.isStyleLoaded()) {
      init();
    } else {
      map.once("load", init);
    }
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync visibility whenever props change
  useEffect(() => {
    if (!map || !initialized.current) return;
    applyVisibility(map, {
      [TEMP_HEAT]:  tempVisible,
      [TEMP_LABEL]: tempVisible,
      [WIND_ARROW]: tempVisible,
    });
  }, [map, tempVisible]);

  useEffect(() => {
    if (!map || !initialized.current) return;
    applyVisibility(map, { [CLOUD_HEAT]: cloudVisible });
  }, [map, cloudVisible]);

  useEffect(() => {
    if (!map || !initialized.current) return;
    applyVisibility(map, { [RAIN_HEAT]: rainVisible });
  }, [map, rainVisible]);

  return null;
}
