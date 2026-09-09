"use client";

import { useEffect, useRef } from "react";

// Speed → colour (interpolated in paint expression)
// Elektrifizierung → line style
// We encode these as properties and use MapLibre expressions.

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let map: import("maplibre-gl").Map;

    import("maplibre-gl").then((ml) => {
      map = new ml.Map({
        container: containerRef.current!,
        // Muted grey vector basemap — labels + borders only, no visual noise
        style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
        center: [10.45, 51.2],
        zoom: 6,
        minZoom: 2,
      });

      const popup = new ml.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: "300px",
      });

      map.on("load", () => {
        map.addSource("streckennetz", {
          type: "geojson",
          data: "/streckennetz.geojson",
          // cluster not applicable to lines; MapLibre handles large GeoJSON via workers
        });

        // ── Base rail line ──────────────────────────────────────────
        map.addLayer({
          id: "rail-lines",
          type: "line",
          source: "streckennetz",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            // Colour by speed: non-electric grey, slow=amber, fast=blue→green
            "line-color": [
              "case",
              // Non-electrified: grey
              ["==", ["get", "elektrifizierung"], "nicht elektrifiziert"], "#64748b",
              // Third-rail: orange
              ["==", ["get", "elektrifizierung"], "Stromschiene"], "#fb923c",
              // Electrified overhead: colour by speed
              [
                "interpolate", ["linear"],
                ["coalesce", ["get", "geschwindigkeit"], 0],
                0,   "#94a3b8",
                60,  "#60a5fa",
                120, "#34d399",
                160, "#facc15",
                200, "#f97316",
                300, "#ef4444",
              ],
            ],
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              4,  1.0,
              7,  1.8,
              10, 3.0,
              13, 5.0,
              16, 8.0,
            ],
            "line-opacity": [
              "interpolate", ["linear"], ["zoom"],
              4, 0.7,
              7, 0.9,
              12, 1.0,
            ],
          },
        });

        // ── Hover highlight ─────────────────────────────────────────
        map.addLayer({
          id: "rail-lines-hover",
          type: "line",
          source: "streckennetz",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              4,  3,
              7,  4,
              10, 6,
              13, 9,
              16, 13,
            ],
            "line-opacity": 0.9,
          },
          filter: ["==", ["get", "streckennummer"], ""],
        });

        // ── Hover & click ───────────────────────────────────────────
        let hoveredNum: string | null = null;

        map.on("mousemove", "rail-lines", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const feat = e.features?.[0];
          if (!feat) return;
          const num = feat.properties?.streckennummer as string;
          if (num !== hoveredNum) {
            hoveredNum = num;
            map.setFilter("rail-lines-hover", [
              "==", ["get", "streckennummer"], num,
            ]);
          }
        });

        map.on("mouseleave", "rail-lines", () => {
          map.getCanvas().style.cursor = "";
          hoveredNum = null;
          map.setFilter("rail-lines-hover", [
            "==", ["get", "streckennummer"], "",
          ]);
        });

        map.on("click", "rail-lines", (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const p = feat.properties as Record<string, string | number | null>;
          const speed = p.geschwindigkeit ? `${p.geschwindigkeit} km/h` : "—";

          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="popup-inner">
                <div class="popup-header">
                  <span class="popup-title">${p.name || "Strecke " + p.streckennummer}</span>
                </div>
                <table class="popup-table">
                  <tr><td class="popup-key">Streckennr.</td><td class="popup-val">${p.streckennummer}</td></tr>
                  <tr><td class="popup-key">Elektrifizierung</td><td class="popup-val">${p.elektrifizierung ?? "—"}</td></tr>
                  <tr><td class="popup-key">Gleise</td><td class="popup-val">${p.gleisanzahl ?? "—"}</td></tr>
                  <tr><td class="popup-key">Geschwindigkeit</td><td class="popup-val">${speed}</td></tr>
                  <tr><td class="popup-key">Bundesland</td><td class="popup-val">${p.bundesland ?? "—"}</td></tr>
                  <tr><td class="popup-key">Bauzustand</td><td class="popup-val">${p.bauzustand ?? "—"}</td></tr>
                </table>
              </div>`
            )
            .addTo(map);
        });
      });
    });

    return () => {
      map?.remove();
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
