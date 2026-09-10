"use client";

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

interface Props {
  map: maplibregl.Map | null;
  popup: maplibregl.Popup | null;
  visible: boolean;
}

const SOURCE = "pegel-data";
const CIRCLE_LAYER = "pegel-circles";
const LABEL_LAYER = "pegel-labels";

// alertLevel → colour. "high" = flood risk (red), "normal" (blue), "low" (grey)
// stateNswHsw tracks flood warnings; stateMnwMhw tracks low-water drought.
const ALERT_COLOR = [
  "match", ["get", "alertLevel"],
  "low",     "#94a3b8",   // drought / very low
  "normal",  "#38bdf8",   // normal (sky blue)
  "high",    "#f97316",   // above MHW (warning orange)
  "very high","#ef4444",  // HSW flood red
  "#475569",              // unknown / fallback
] as unknown as maplibregl.ExpressionSpecification;

export default function PegelLayer({ map, popup, visible }: Props) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!map) return;

    async function init() {
      const res = await fetch("/api/pegel");
      if (!res.ok) return;
      const geojson = await res.json();
      if (!map) return;

      if (map.getSource(SOURCE)) {
        (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource(SOURCE, { type: "geojson", data: geojson });
      }

      const v = visible ? "visible" : "none";

      if (!map.getLayer(CIRCLE_LAYER)) {
        map.addLayer({
          id: CIRCLE_LAYER,
          type: "circle",
          source: SOURCE,
          layout: { visibility: v },
          paint: {
            "circle-color": ALERT_COLOR,
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              5, 3, 8, 5, 11, 7,
            ],
            "circle-opacity": 0.85,
            "circle-stroke-color": [
              "case",
              ["==", ["get", "alertLevel"], "high"],   "#f97316",
              ["==", ["get", "alertLevel"], "very high"], "#ef4444",
              "rgba(255,255,255,0.15)",
            ],
            "circle-stroke-width": [
              "case",
              ["in", ["get", "alertLevel"], ["literal", ["high", "very high"]]], 1.5,
              0.5,
            ],
          },
        });
      }

      if (!map.getLayer(LABEL_LAYER)) {
        map.addLayer({
          id: LABEL_LAYER,
          type: "symbol",
          source: SOURCE,
          minzoom: 8,
          layout: {
            visibility: v,
            "text-field": ["concat", ["to-string", ["round", ["get", "value"]]], " cm"],
            "text-size": 9,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": ALERT_COLOR,
            "text-halo-color": "#060a12",
            "text-halo-width": 1,
          },
        });
      }

      // Popup
      function showPopup(e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
        if (!e.features?.length || !popup || !map) return;
        const p = e.features[0].properties as Record<string, string | number | null>;
        const stateLabel = (s: string) => ({ normal: "Normal", low: "Niedrig", high: "Erhöht", "very high": "Hochwasser", unknown: "—" }[s] ?? s);
        const ts = p.timestamp ? new Date(p.timestamp as string).toLocaleString("de-DE", { timeStyle: "short", dateStyle: "short" }) : "—";
        popup.setLngLat(e.lngLat).setHTML(
          `<div class="popup-inner">
            <div class="popup-header">
              <span class="popup-dot" style="background:#38bdf8"></span>
              <span class="popup-title">${p.longname || p.name}</span>
            </div>
            <table class="popup-table">
              <tr><td class="popup-key">Fluss</td><td class="popup-val">${p.river || "—"}</td></tr>
              <tr><td class="popup-key">Pegel</td><td class="popup-val">${p.value} ${p.unit}</td></tr>
              <tr><td class="popup-key">Zustand</td><td class="popup-val">${stateLabel(p.alertLevel as string)}</td></tr>
              <tr><td class="popup-key">Station km</td><td class="popup-val">${p.km != null ? p.km + " km" : "—"}</td></tr>
              <tr><td class="popup-key">Behörde</td><td class="popup-val">${p.agency || "—"}</td></tr>
              <tr><td class="popup-key">Stand</td><td class="popup-val">${ts}</td></tr>
            </table>
          </div>`
        ).addTo(map);
      }

      map.on("click", CIRCLE_LAYER, (e) => { e.preventDefault(); showPopup(e); });
      map.on("mousemove", CIRCLE_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", CIRCLE_LAYER, () => { map.getCanvas().style.cursor = ""; });

      initialized.current = true;
    }

    if (map.isStyleLoaded()) { init(); } else { map.once("load", init); }
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !initialized.current) return;
    const v = visible ? "visible" : "none";
    for (const id of [CIRCLE_LAYER, LABEL_LAYER]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }, [map, visible]);

  return null;
}
