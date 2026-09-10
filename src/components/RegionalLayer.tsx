"use client";

import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";

export type RegionalMetric = "bipPerCapita" | "unemployment";

interface Meta { bip: { min: number; max: number }; alo: { min: number; max: number }; year: { bip: number; alo: number } }

interface Props {
  map: maplibregl.Map | null;
  popup: maplibregl.Popup | null;
  visible: boolean;
  metric: RegionalMetric;
}

const SOURCE = "regional-data";
const FILL_LAYER = "regional-fill";
const LINE_LAYER = "regional-line";

// BIP per capita: cold-warm (low=deep blue, high=amber/red)
function bipColor(metric: RegionalMetric): maplibregl.ExpressionSpecification {
  if (metric === "bipPerCapita") {
    return [
      "interpolate", ["linear"], ["coalesce", ["get", "bipPerCapita"], 0],
      20000, "rgba(30,58,138,0.75)",
      40000, "rgba(59,130,246,0.7)",
      60000, "rgba(250,204,21,0.7)",
      80000, "rgba(249,115,22,0.75)",
      110000,"rgba(239,68,68,0.8)",
    ] as unknown as maplibregl.ExpressionSpecification;
  }
  // Unemployment: low (green) → high (red)
  return [
    "interpolate", ["linear"], ["coalesce", ["get", "unemployment"], 0],
    2,  "rgba(20,83,45,0.7)",
    4,  "rgba(34,197,94,0.65)",
    6,  "rgba(250,204,21,0.7)",
    10, "rgba(249,115,22,0.75)",
    15, "rgba(239,68,68,0.82)",
  ] as unknown as maplibregl.ExpressionSpecification;
}

export default function RegionalLayer({ map, popup, visible, metric }: Props) {
  const initialized = useRef(false);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    if (!map) return;

    async function init() {
      const res = await fetch("/api/regional");
      if (!res.ok) return;
      const geojson = await res.json();
      if (!map) return;
      setMeta(geojson.meta ?? null);

      if (map.getSource(SOURCE)) {
        (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource(SOURCE, { type: "geojson", data: geojson });
      }

      const v = visible ? "visible" : "none";

      if (!map.getLayer(FILL_LAYER)) {
        map.addLayer({
          id: FILL_LAYER,
          type: "fill",
          source: SOURCE,
          layout: { visibility: v },
          paint: {
            "fill-color": bipColor(metric),
            "fill-opacity": 0.72,
          },
        // Insert below streckennetz so rail lines stay on top
        }, map.getLayer("population-heat") ? "population-heat" : undefined);
      }

      if (!map.getLayer(LINE_LAYER)) {
        map.addLayer({
          id: LINE_LAYER,
          type: "line",
          source: SOURCE,
          layout: { visibility: v },
          paint: {
            "line-color": "#0f172a",
            "line-width": 0.4,
            "line-opacity": 0.6,
          },
        }, map.getLayer("population-heat") ? "population-heat" : undefined);
      }

      // Popup
      map.on("click", FILL_LAYER, (e) => {
        if (e.defaultPrevented || !popup || !map) return;
        e.preventDefault();
        const p = e.features![0].properties as Record<string, number | string | null>;
        const fmt = (v: number | null, unit: string, dec = 0) =>
          v != null ? v.toLocaleString("de-DE", { maximumFractionDigits: dec }) + unit : "—";
        popup.setLngLat(e.lngLat).setHTML(
          `<div class="popup-inner">
            <div class="popup-header">
              <span class="popup-dot" style="background:#facc15"></span>
              <span class="popup-title">${p.name || "Kreis"}</span>
            </div>
            <table class="popup-table">
              <tr><td class="popup-key">AGS</td><td class="popup-val">${p.ags || "—"}</td></tr>
              <tr><td class="popup-key">BIP/Kopf (2022)</td><td class="popup-val">${fmt(p.bipPerCapita as number, " €")}</td></tr>
              <tr><td class="popup-key">BIP/Erwerb. (2022)</td><td class="popup-val">${fmt(p.bipPerWorker as number, " €")}</td></tr>
              <tr><td class="popup-key">Arbeitslosigkeit (2024)</td><td class="popup-val">${fmt(p.unemployment as number, " %", 1)}</td></tr>
            </table>
          </div>`
        ).addTo(map);
      });
      map.on("mousemove", FILL_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", FILL_LAYER, () => { map.getCanvas().style.cursor = ""; });

      initialized.current = true;
    }

    if (map.isStyleLoaded()) { init(); } else { map.once("load", init); }
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync visibility
  useEffect(() => {
    if (!map || !initialized.current) return;
    const v = visible ? "visible" : "none";
    for (const id of [FILL_LAYER, LINE_LAYER]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }, [map, visible]);

  // Sync metric (re-paint fill color)
  useEffect(() => {
    if (!map || !initialized.current) return;
    if (map.getLayer(FILL_LAYER)) {
      map.setPaintProperty(FILL_LAYER, "fill-color", bipColor(metric));
    }
  }, [map, metric]);

  // Expose meta so page can render a legend
  void meta;
  return null;
}
