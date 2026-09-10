"use client";

import { useEffect, useRef, useCallback } from "react";
import type maplibregl from "maplibre-gl";

interface StationFeature {
  eva: string;
  name: string;
  kuerzel: string;
  lon: number;
  lat: number;
}

interface LiveStation {
  eva: string;
  maxDelay: number;
  hasCancellation: boolean;
  trains: {
    id: string;
    category: string;
    number: string;
    destination: string;
    planned: string;
    actual: string;
    delay: number;
    cancelled: boolean;
    platform: string;
  }[];
}

interface Props {
  map: maplibregl.Map | null;
  visible: boolean;
  popup: maplibregl.Popup | null;
}

// All matched stations loaded once
let stationsCache: StationFeature[] | null = null;
async function loadStations(): Promise<StationFeature[]> {
  if (stationsCache) return stationsCache;
  const res = await fetch("/stations-matched.geojson");
  const gj = await res.json();
  stationsCache = gj.features.map((f: { geometry: { coordinates: [number, number] }; properties: { eva: string; name: string; kuerzel: string } }) => ({
    eva: f.properties.eva,
    name: f.properties.name,
    kuerzel: f.properties.kuerzel,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  return stationsCache!;
}

function delayColor(delay: number, cancelled: boolean): string {
  if (cancelled) return "#7c3aed";
  if (delay === 0) return "#22c55e";
  if (delay <= 5) return "#facc15";
  if (delay <= 15) return "#f97316";
  return "#ef4444";
}

const SOURCE = "live-trains";
const LAYER_CIRCLE = "live-circle";
const LAYER_ALARM = "live-alarm";

export default function LiveTrainsLayer({ map, visible, popup }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef<Map<string, LiveStation>>(new Map());
  const stationsInView = useRef<StationFeature[]>([]);

  const buildGeoJSON = useCallback((): GeoJSON.FeatureCollection => {
    const features: GeoJSON.Feature[] = [];
    for (const s of stationsInView.current) {
      const live = liveRef.current.get(s.eva);
      const delay = live?.maxDelay ?? -1;
      const cancelled = live?.hasCancellation ?? false;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          eva: s.eva,
          name: s.name,
          kuerzel: s.kuerzel,
          delay,
          cancelled,
          hasData: delay >= 0,
          color: delay >= 0 ? delayColor(delay, cancelled) : "#334155",
          alarm: delay > 5 || cancelled,
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, []);

  const updateSource = useCallback(() => {
    if (!map || !map.getSource(SOURCE)) return;
    (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(buildGeoJSON());
  }, [map, buildGeoJSON]);

  const fetchLive = useCallback(async () => {
    if (!map || stationsInView.current.length === 0) return;
    const evas = stationsInView.current.map((s) => s.eva);

    // Fetch in batches of 50
    const batches: string[][] = [];
    for (let i = 0; i < evas.length; i += 50) batches.push(evas.slice(i, i + 50));

    const results = await Promise.allSettled(
      batches.map((b) => fetch(`/api/db/live?evas=${b.join(",")}`).then((r) => r.json()))
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const s of (r.value.stations ?? []) as LiveStation[]) {
        liveRef.current.set(s.eva, s);
      }
    }
    updateSource();
  }, [map, updateSource]);

  const refreshViewport = useCallback(async () => {
    if (!map) return;
    const bounds = map.getBounds();
    const allStations = await loadStations();
    stationsInView.current = allStations.filter(
      (s) =>
        s.lon >= bounds.getWest() &&
        s.lon <= bounds.getEast() &&
        s.lat >= bounds.getSouth() &&
        s.lat <= bounds.getNorth()
    ).slice(0, 200); // cap: 200 stations → 4 batches of 50
    await fetchLive();
  }, [map, fetchLive]);

  // Init layers on map load
  useEffect(() => {
    if (!map) return;

    function initLayers() {
      if (map!.getSource(SOURCE)) return;

      map!.addSource(SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Pulse ring for alarms
      map!.addLayer({
        id: LAYER_ALARM,
        type: "circle",
        source: SOURCE,
        filter: ["==", ["get", "alarm"], true],
        layout: { visibility: visible ? "visible" : "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 10, 12, 18],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.25,
          "circle-stroke-width": 0,
        },
      });

      map!.addLayer({
        id: LAYER_CIRCLE,
        type: "circle",
        source: SOURCE,
        layout: { visibility: visible ? "visible" : "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 5, 12, 10],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.5,
          "circle-opacity": ["case", ["get", "hasData"], 1, 0.3],
        },
      });

      map!.on("mousemove", LAYER_CIRCLE, () => { map!.getCanvas().style.cursor = "pointer"; });
      map!.on("mouseleave", LAYER_CIRCLE, () => { map!.getCanvas().style.cursor = ""; });

      map!.on("click", LAYER_CIRCLE, (e) => {
        e.preventDefault();
        const props = e.features?.[0]?.properties as Record<string, string | number | boolean> | undefined;
        if (!props || !popup) return;
        const eva = props.eva as string;
        const live = liveRef.current.get(eva);
        const delay = props.delay as number;
        const cancelled = props.cancelled as boolean;

        const statusColor = delayColor(delay, cancelled);
        const statusLabel = cancelled ? "Ausfall" : delay === 0 ? "Pünktlich" : `+${delay} min`;

        const trainRows = live?.trains.slice(0, 6).map((t) => {
          const d = t.delay > 0 ? `<span style="color:${delayColor(t.delay, t.cancelled)};font-weight:600">+${t.delay}</span>` : '<span style="color:#22c55e">✓</span>';
          const time = t.cancelled
            ? `<span style="color:#ef4444;text-decoration:line-through">${t.planned}</span>`
            : t.delay > 0
            ? `<span style="color:#f97316">${t.actual}</span> <span style="text-decoration:line-through;color:#475569;font-size:10px">${t.planned}</span>`
            : `<span>${t.actual}</span>`;
          return `<tr>
            <td class="popup-key" style="white-space:nowrap">${t.category} ${t.number}</td>
            <td class="popup-val" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.destination}</td>
            <td class="popup-val" style="text-align:right;padding-left:8px">${time}</td>
            <td class="popup-val" style="text-align:right;padding-left:6px">${d}</td>
          </tr>`;
        }).join("") ?? '<tr><td colspan="4" class="popup-key">Keine Daten</td></tr>';

        popup
          .setLngLat(e.lngLat)
          .setHTML(`<div class="popup-inner">
            <div class="popup-header">
              <span class="popup-dot" style="background:${statusColor}"></span>
              <span class="popup-title">${props.name}</span>
              <span style="margin-left:auto;font-size:11px;font-weight:600;color:${statusColor}">${delay >= 0 ? statusLabel : "—"}</span>
            </div>
            <table class="popup-table">${trainRows}</table>
          </div>`)
          .addTo(map!);
      });

      refreshViewport();
    }

    if (map.isStyleLoaded()) initLayers();
    else map.once("load", initLayers);
  }, [map, visible, popup, refreshViewport]);

  // Toggle visibility
  useEffect(() => {
    if (!map || !map.getLayer(LAYER_CIRCLE)) return;
    const v = visible ? "visible" : "none";
    map.setLayoutProperty(LAYER_CIRCLE, "visibility", v);
    map.setLayoutProperty(LAYER_ALARM, "visibility", v);
  }, [map, visible]);

  // Refresh on viewport change + auto-refresh every 60s
  useEffect(() => {
    if (!map || !visible) return;

    const onMoveEnd = () => refreshViewport();
    map.on("moveend", onMoveEnd);

    intervalRef.current = setInterval(fetchLive, 60_000);

    return () => {
      map.off("moveend", onMoveEnd);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [map, visible, refreshViewport, fetchLive]);

  return null; // purely imperative — no DOM output
}
