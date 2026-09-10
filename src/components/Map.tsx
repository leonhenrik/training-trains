"use client";

import { useEffect, useRef, useState } from "react";
import LiveTrainsLayer from "./LiveTrainsLayer";
import WeatherLayer from "./WeatherLayer";
import PegelLayer from "./PegelLayer";
import RegionalLayer, { type RegionalMetric } from "./RegionalLayer";

export type LayerId =
  | "streckennetz"
  | "betriebsstellen"
  | "bahnuebergaenge"
  | "eisenbahnbruecken"
  | "tunnel"
  | "oe-grenzen"
  | "population"
  | "live-trains"
  | "weather-temp"
  | "weather-cloud"
  | "weather-rain"
  | "pegel"
  | "regional-bip"
  | "regional-alo";

interface MapProps {
  visibleLayers: Set<LayerId>;
  highlightStreckennummern?: string[];
}

export default function Map({ visibleLayers, highlightStreckennummern = [] }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const popupRef = useRef<import("maplibre-gl").Popup | null>(null);
  const layerIds = useRef<globalThis.Map<LayerId, string[]>>(new globalThis.Map());
  const [mapReady, setMapReady] = useState(false);
  // Always-current ref so map callbacks never capture a stale closure
  const visibleRef = useRef(visibleLayers);
  visibleRef.current = visibleLayers;

  // Sync visibility whenever the prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function apply() {
      layerIds.current.forEach((mlIds, layerId) => {
        const v = visibleRef.current.has(layerId) ? "visible" : "none";
        mlIds.forEach((id) => {
          if (map!.getLayer(id)) map!.setLayoutProperty(id, "visibility", v);
        });
      });
    }

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [visibleLayers]);

  // Sync route highlight whenever highlightStreckennummern changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getLayer("route-highlight")) return;
    if (highlightStreckennummern.length === 0) {
      map.setFilter("route-highlight", ["==", ["get", "streckennummer"], "__none__"]);
    } else {
      map.setFilter("route-highlight", ["in", ["get", "streckennummer"], ["literal", highlightStreckennummern]]);
    }
  }, [highlightStreckennummern]);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: import("maplibre-gl").Map;

    import("maplibre-gl").then((ml) => {
      map = new ml.Map({
        container: containerRef.current!,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
        center: [10.45, 51.2],
        zoom: 6,
        minZoom: 2,
      });
      mapRef.current = map;

      const popup = new ml.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: "300px",
      });
      popupRef.current = popup;

      function vis(id: LayerId): "visible" | "none" {
        return visibleRef.current.has(id) ? "visible" : "none";
      }

      map.on("load", () => {

        // ── Population heatmap ────────────────────────────────────
        map.addSource("population", { type: "geojson", data: "/population.geojson" });
        map.addLayer({
          id: "population-heat",
          type: "heatmap",
          source: "population",
          layout: { visibility: vis("population") },
          paint: {
            "heatmap-weight": [
              "interpolate", ["linear"], ["get", "pop"],
              0, 0, 5000, 0.2, 50000, 0.6, 548814, 1,
            ],
            "heatmap-radius": [
              "interpolate", ["exponential", 2], ["zoom"],
              3, 3, 13, 3072,
            ],
            "heatmap-intensity": [
              "interpolate", ["linear"], ["zoom"],
              3, 0.6, 7, 1.0, 13, 1.6,
            ],
            "heatmap-opacity": [
              "interpolate", ["linear"], ["zoom"],
              3, 0.8, 8, 0.7, 12, 0.6,
            ],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0,    "rgba(0,0,0,0)",
              0.15, "rgba(30,58,138,0.7)",
              0.35, "rgba(6,182,212,0.8)",
              0.6,  "rgba(250,204,21,0.85)",
              0.8,  "rgba(249,115,22,0.9)",
              1.0,  "rgba(239,68,68,1)",
            ],
          },
        });
        layerIds.current.set("population", ["population-heat"]);

        // ── OE Grenzen (polygons) ─────────────────────────────────
        map.addSource("oe-grenzen", { type: "geojson", data: "/oe-grenzen.geojson" });
        map.addLayer({
          id: "oe-grenzen-fill",
          type: "fill",
          source: "oe-grenzen",
          layout: { visibility: vis("oe-grenzen") },
          paint: { "fill-color": "#6366f1", "fill-opacity": 0.07 },
        });
        map.addLayer({
          id: "oe-grenzen-line",
          type: "line",
          source: "oe-grenzen",
          layout: { visibility: vis("oe-grenzen") },
          paint: { "line-color": "#6366f1", "line-width": 1.5, "line-opacity": 0.5 },
        });
        layerIds.current.set("oe-grenzen", ["oe-grenzen-fill", "oe-grenzen-line"]);

        // ── Streckennetz (lines) ──────────────────────────────────
        map.addSource("streckennetz", { type: "geojson", data: "/streckennetz.geojson" });
        map.addLayer({
          id: "rail-lines",
          type: "line",
          source: "streckennetz",
          layout: { "line-join": "round", "line-cap": "round", visibility: vis("streckennetz") },
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "elektrifizierung"], "nicht elektrifiziert"], "#64748b",
              ["==", ["get", "elektrifizierung"], "Stromschiene"], "#fb923c",
              [
                "interpolate", ["linear"], ["coalesce", ["get", "geschwindigkeit"], 0],
                0, "#94a3b8", 60, "#60a5fa", 120, "#34d399",
                160, "#facc15", 200, "#f97316", 300, "#ef4444",
              ],
            ],
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              4, 1.0, 7, 1.8, 10, 3.0, 13, 5.0, 16, 8.0,
            ],
            "line-opacity": [
              "interpolate", ["linear"], ["zoom"],
              4, 0.7, 7, 0.9, 12, 1.0,
            ],
          },
        });
        map.addLayer({
          id: "rail-lines-hover",
          type: "line",
          source: "streckennetz",
          layout: { "line-join": "round", "line-cap": "round", visibility: vis("streckennetz") },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 7, 4, 10, 6, 13, 9, 16, 13],
            "line-opacity": 0.9,
          },
          filter: ["==", ["get", "streckennummer"], ""],
        });
        layerIds.current.set("streckennetz", ["rail-lines", "rail-lines-hover"]);

        // ── Route highlight (above streckennetz) ──────────────────
        map.addLayer({
          id: "route-highlight",
          type: "line",
          source: "streckennetz",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 7, 5, 10, 8, 13, 12, 16, 18],
            "line-opacity": 0.85,
            "line-blur": 1,
          },
          filter: ["==", ["get", "streckennummer"], "__none__"],
        });

        // ── Eisenbahnbrücken (multilinestring) ────────────────────
        map.addSource("eisenbahnbruecken", { type: "geojson", data: "/eisenbahnbruecken.geojson" });
        map.addLayer({
          id: "bruecken-line",
          type: "line",
          source: "eisenbahnbruecken",
          layout: { "line-join": "round", "line-cap": "round", visibility: vis("eisenbahnbruecken") },
          paint: {
            "line-color": "#f59e0b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2, 10, 4, 14, 7],
            "line-opacity": 0.85,
          },
        });
        layerIds.current.set("eisenbahnbruecken", ["bruecken-line"]);

        // ── Tunnel (linestring) ───────────────────────────────────
        map.addSource("tunnel", { type: "geojson", data: "/tunnel.geojson" });
        map.addLayer({
          id: "tunnel-line",
          type: "line",
          source: "tunnel",
          layout: { "line-join": "round", "line-cap": "round", visibility: vis("tunnel") },
          paint: {
            "line-color": "#a78bfa",
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 10, 5, 14, 9],
            "line-dasharray": [3, 2],
            "line-opacity": 0.9,
          },
        });
        layerIds.current.set("tunnel", ["tunnel-line"]);

        // ── Bahnübergänge (points) ────────────────────────────────
        map.addSource("bahnuebergaenge", { type: "geojson", data: "/bahnuebergaenge.geojson" });
        map.addLayer({
          id: "bahnuebergaenge-circle",
          type: "circle",
          source: "bahnuebergaenge",
          layout: { visibility: vis("bahnuebergaenge") },
          minzoom: 9,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 5, 16, 8],
            "circle-color": "#f97316",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
            "circle-opacity": 0.85,
          },
        });
        layerIds.current.set("bahnuebergaenge", ["bahnuebergaenge-circle"]);

        // ── Betriebsstellen (points) ──────────────────────────────
        map.addSource("betriebsstellen", { type: "geojson", data: "/betriebsstellen.geojson" });
        map.addLayer({
          id: "betriebsstellen-circle",
          type: "circle",
          source: "betriebsstellen",
          layout: { visibility: vis("betriebsstellen") },
          minzoom: 7,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3, 11, 6, 14, 10],
            "circle-color": [
              "match", ["get", "art"],
              "Bf", "#3b82f6",
              "Bft", "#60a5fa",
              "Hp", "#22d3ee",
              "#94a3b8",
            ],
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });
        map.addLayer({
          id: "betriebsstellen-label",
          type: "symbol",
          source: "betriebsstellen",
          layout: {
            "text-field": ["get", "kuerzel"],
            "text-size": 10,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            visibility: vis("betriebsstellen"),
          },
          minzoom: 10,
          paint: {
            "text-color": "#e2e8f0",
            "text-halo-color": "#0f172a",
            "text-halo-width": 1.5,
          },
        });
        layerIds.current.set("betriebsstellen", ["betriebsstellen-circle", "betriebsstellen-label"]);

        // ── Hover: Streckennetz ───────────────────────────────────
        let hoveredStrecke: string | null = null;
        map.on("mousemove", "rail-lines", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const num = e.features?.[0]?.properties?.streckennummer as string;
          if (num !== hoveredStrecke) {
            hoveredStrecke = num;
            map.setFilter("rail-lines-hover", ["==", ["get", "streckennummer"], num]);
          }
        });
        map.on("mouseleave", "rail-lines", () => {
          map.getCanvas().style.cursor = "";
          hoveredStrecke = null;
          map.setFilter("rail-lines-hover", ["==", ["get", "streckennummer"], ""]);
        });

        for (const id of ["bruecken-line", "tunnel-line", "bahnuebergaenge-circle", "betriebsstellen-circle", "oe-grenzen-fill"]) {
          map.on("mousemove", id, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
        }

        // ── Popups ────────────────────────────────────────────────
        function showPopup(lngLat: maplibregl.LngLat, html: string) {
          popup.setLngLat(lngLat).setHTML(`<div class="popup-inner">${html}</div>`).addTo(map);
        }
        function row(key: string, val: string | number | null | undefined) {
          if (val == null || val === "") return "";
          return `<tr><td class="popup-key">${key}</td><td class="popup-val">${val}</td></tr>`;
        }
        function table(rows: string) { return `<table class="popup-table">${rows}</table>`; }

        map.on("click", "rail-lines", (e) => {
          e.preventDefault();
          const p = e.features![0].properties as Record<string, string | number | null>;
          const speed = p.geschwindigkeit ? `${p.geschwindigkeit} km/h` : "—";
          showPopup(e.lngLat,
            `<div class="popup-header"><span class="popup-dot" style="background:#60a5fa"></span><span class="popup-title">${p.name || "Strecke " + p.streckennummer}</span></div>` +
            table(row("Streckennr.", p.streckennummer as string) + row("Elektrifizierung", p.elektrifizierung as string) + row("Gleise", p.gleisanzahl as string) + row("Geschwindigkeit", speed) + row("Bundesland", p.bundesland as string) + row("Bauzustand", p.bauzustand as string))
          );
        });

        map.on("click", "betriebsstellen-circle", (e) => {
          if (e.defaultPrevented) return;
          e.preventDefault();
          const p = e.features![0].properties as Record<string, string | null>;
          showPopup(e.lngLat,
            `<div class="popup-header"><span class="popup-dot" style="background:#3b82f6"></span><span class="popup-title">${p.name || p.kuerzel}</span></div>` +
            table(row("Kürzel", p.kuerzel) + row("Art", p.artLang || p.art) + row("Zustand", p.betriebszustand) + row("Streckennr.", p.streckennummer) + row("Bundesland", p.bundesland))
          );
        });

        map.on("click", "bahnuebergaenge-circle", (e) => {
          if (e.defaultPrevented) return;
          e.preventDefault();
          const p = e.features![0].properties as Record<string, string | null>;
          showPopup(e.lngLat,
            `<div class="popup-header"><span class="popup-dot" style="background:#f97316"></span><span class="popup-title">${p.name || "Bahnübergang"}</span></div>` +
            table(row("Straßenart", p.strassenart) + row("Sicherung", p.sicherung) + row("Streckennr.", p.streckennummer) + row("Bundesland", p.bundesland))
          );
        });

        map.on("click", "bruecken-line", (e) => {
          if (e.defaultPrevented) return;
          e.preventDefault();
          const p = e.features![0].properties as Record<string, string | number | null>;
          showPopup(e.lngLat,
            `<div class="popup-header"><span class="popup-dot" style="background:#f59e0b"></span><span class="popup-title">${p.name || "Eisenbahnbrücke"}</span></div>` +
            table(row("Kreuzungsart", p.kreuzungsart as string) + row("Länge", p.laenge != null ? `${p.laenge} m` : null) + row("Streckennr.", p.streckennummer as string) + row("Bundesland", p.bundesland as string))
          );
        });

        map.on("click", "tunnel-line", (e) => {
          if (e.defaultPrevented) return;
          e.preventDefault();
          const p = e.features![0].properties as Record<string, string | number | null>;
          showPopup(e.lngLat,
            `<div class="popup-header"><span class="popup-dot" style="background:#a78bfa"></span><span class="popup-title">${p.name || "Tunnel"}</span></div>` +
            table(row("Länge", p.laenge != null ? `${p.laenge} m` : null) + row("Streckennr.", p.streckennummer as string) + row("Bundesland", p.bundesland as string))
          );
        });

        map.on("click", "oe-grenzen-fill", (e) => {
          if (e.defaultPrevented) return;
          const p = e.features![0].properties as Record<string, string | null>;
          showPopup(e.lngLat,
            `<div class="popup-header"><span class="popup-dot" style="background:#6366f1"></span><span class="popup-title">${p.bezeichnung || p.standort}</span></div>` +
            table(row("Art", p.art) + row("Standort", p.standort))
          );
        });

        setMapReady(true);
      });
    });

    return () => { map?.remove(); mapRef.current = null; popupRef.current = null; setMapReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {mapReady && (
        <LiveTrainsLayer
          map={mapRef.current}
          popup={popupRef.current}
          visible={visibleLayers.has("live-trains")}
        />
      )}
      {mapReady && (
        <WeatherLayer
          map={mapRef.current}
          popup={popupRef.current}
          tempVisible={visibleLayers.has("weather-temp")}
          cloudVisible={visibleLayers.has("weather-cloud")}
          rainVisible={visibleLayers.has("weather-rain")}
        />
      )}
      {mapReady && (
        <PegelLayer
          map={mapRef.current}
          popup={popupRef.current}
          visible={visibleLayers.has("pegel")}
        />
      )}
      {mapReady && (
        <RegionalLayer
          map={mapRef.current}
          popup={popupRef.current}
          visible={visibleLayers.has("regional-bip") || visibleLayers.has("regional-alo")}
          metric={(visibleLayers.has("regional-alo") ? "unemployment" : "bipPerCapita") as RegionalMetric}
        />
      )}
    </>
  );
}
