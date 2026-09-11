"use client";

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

interface Props {
  map: maplibregl.Map | null;
  popup: maplibregl.Popup | null;
  visible: boolean;
}

const SOURCE = "tree-risk-data";
const LAYER  = "tree-risk-line";

export default function TreeRiskLayer({ map, popup, visible }: Props) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!map) return;

    async function init() {
      const res = await fetch("/api/tree-risk");
      if (!res.ok) return;
      const geojson = await res.json();
      if (!map) return;

      if (map.getSource(SOURCE)) {
        (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource(SOURCE, { type: "geojson", data: geojson });
      }

      if (!map.getLayer(LAYER)) {
        map.addLayer({
          id: LAYER,
          type: "line",
          source: SOURCE,
          layout: {
            "line-join": "round",
            "line-cap": "round",
            visibility: visible ? "visible" : "none",
          },
          paint: {
            // Green (low) → yellow → orange → red (high risk)
            "line-color": [
              "case",
              ["==", ["get", "risk"], null], "#334155",
              [
                "interpolate", ["linear"],
                ["coalesce", ["get", "risk"], 0],
                0.0, "#22c55e",
                0.2, "#84cc16",
                0.4, "#facc15",
                0.6, "#f97316",
                0.8, "#ef4444",
                1.0, "#7f1d1d",
              ],
            ],
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              4, 2.5, 7, 4, 10, 6, 13, 9,
            ],
            "line-opacity": [
              "case",
              ["==", ["get", "risk"], null], 0.2,
              0.85,
            ],
          },
        });
      }

      map.on("click", LAYER, (e) => {
        if (!e.features?.length || !popup || !map) return;
        e.preventDefault();
        const p = e.features[0].properties as Record<string, string | number | null>;
        const risk = p.risk != null ? Math.round(+p.risk * 100) + "%" : "—";
        const tcd = p.tcd != null ? Math.round(+p.tcd) + "%" : "—";
        const gust = p.wind_gust != null ? Math.round(+p.wind_gust) + " km/h" : "—";
        const riskNum = p.risk != null ? +p.risk : null;
        const riskLabel =
          riskNum === null ? "Unbekannt"
          : riskNum < 0.2  ? "Gering"
          : riskNum < 0.4  ? "Niedrig"
          : riskNum < 0.6  ? "Mittel"
          : riskNum < 0.8  ? "Hoch"
          : "Sehr hoch";
        const dotColor =
          riskNum === null ? "#334155"
          : riskNum < 0.2  ? "#22c55e"
          : riskNum < 0.4  ? "#84cc16"
          : riskNum < 0.6  ? "#facc15"
          : riskNum < 0.8  ? "#f97316"
          : "#ef4444";

        popup.setLngLat(e.lngLat).setHTML(
          `<div class="popup-inner">
            <div class="popup-header">
              <span class="popup-dot" style="background:${dotColor}"></span>
              <span class="popup-title">${p.name || "Strecke " + p.streckennummer}</span>
            </div>
            <table class="popup-table">
              <tr><td class="popup-key">Streckennr.</td><td class="popup-val">${p.streckennummer}</td></tr>
              <tr><td class="popup-key">Bundesland</td><td class="popup-val">${p.bundesland || "—"}</td></tr>
              <tr><td class="popup-key">Baumbedeckung</td><td class="popup-val">${tcd}</td></tr>
              <tr><td class="popup-key">Windböen</td><td class="popup-val">${gust}</td></tr>
              <tr><td class="popup-key">Risiko</td><td class="popup-val" style="color:${dotColor}">${riskLabel} (${risk})</td></tr>
            </table>
            <div style="font-size:9px;color:#334155;margin-top:6px">Quelle: Copernicus TCD 2018 · Open-Meteo</div>
          </div>`
        ).addTo(map);
      });

      map.on("mousemove", LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", LAYER, () => { map.getCanvas().style.cursor = ""; });

      initialized.current = true;
    }

    if (map.isStyleLoaded()) {
      init();
    } else {
      map.once("load", init);
    }
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !initialized.current) return;
    if (map.getLayer(LAYER)) {
      map.setLayoutProperty(LAYER, "visibility", visible ? "visible" : "none");
    }
  }, [map, visible]);

  return null;
}
