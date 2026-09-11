import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoPoint { lat: number; lon: number }

interface SegmentSample {
  streckennummer: string;
  name: string;
  bundesland: string;
  midpoint: GeoPoint;
  coordinates: number[][];
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function midpoint(coords: number[][]): GeoPoint {
  const mid = Math.floor(coords.length / 2);
  return { lon: coords[mid][0], lat: coords[mid][1] };
}

function lineLength(coords: number[][]): number {
  let len = 0;
  for (let i = 1; i < coords.length; i++) {
    len += haversineKm(
      { lat: coords[i - 1][1], lon: coords[i - 1][0] },
      { lat: coords[i][1], lon: coords[i][0] }
    );
  }
  return len;
}

// ── Copernicus TCD WCS ────────────────────────────────────────────────────────
// Tree Cover Density 2018 (100m resolution) via Copernicus Land WMTS/WCS
// Endpoint returns a pixel value 0–100 (%) for a single point bbox.

async function fetchTreeCoverDensity(lat: number, lon: number): Promise<number | null> {
  // 0.001 degree ~ 100m bounding box around point
  const delta = 0.001;
  const minx = lon - delta;
  const miny = lat - delta;
  const maxx = lon + delta;
  const maxy = lat + delta;

  const url =
    `https://image.discomap.eea.europa.eu/arcgis/services/GioLand/HRL_TreeCoverDensity_2018/ImageServer/WCSServer` +
    `?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage` +
    `&COVERAGE=HRL_TreeCoverDensity_2018` +
    `&CRS=EPSG:4326` +
    `&BBOX=${minx},${miny},${maxx},${maxy}` +
    `&WIDTH=1&HEIGHT=1&FORMAT=GeoTIFF`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    // The response is a single-pixel GeoTIFF — parse the last byte as the pixel value.
    // GeoTIFF stores pixel data after headers; for 1×1 Uint8 the pixel is the last byte.
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Find pixel value: scan TIFF for strip data (last non-zero byte block is the pixel)
    // Simple heuristic: value is at offset 8 from end in minimal GeoTIFF
    // More robust: scan for value in 0–100 range from the end
    for (let i = bytes.length - 1; i >= bytes.length - 32; i--) {
      if (bytes[i] >= 0 && bytes[i] <= 100) return bytes[i];
    }
    return null;
  } catch {
    return null;
  }
}

// ── Wind gust fetcher (Open-Meteo, batched) ───────────────────────────────────

async function fetchWindGusts(points: GeoPoint[]): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.lat.toFixed(4)).join(",");
  const lons = points.map((p) => p.lon.toFixed(4)).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lats}&longitude=${lons}` +
    `&current=wind_gusts_10m,wind_speed_10m` +
    `&wind_speed_unit=kmh&timezone=auto&forecast_days=1`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return points.map(() => null);
    const data = await res.json();
    const entries: unknown[] = Array.isArray(data) ? data : [data];
    return entries.map((e) => {
      const entry = e as Record<string, unknown>;
      const c = entry?.current as Record<string, number> | undefined;
      return c?.wind_gusts_10m ?? c?.wind_speed_10m ?? null;
    });
  } catch {
    return points.map(() => null);
  }
}

// ── Main route ────────────────────────────────────────────────────────────────

// Cache in-process for 10 minutes (TCD is static; wind refreshes every 5min via Open-Meteo)
let cache: { ts: number; data: unknown } | null = null;
const CACHE_MS = 600_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const streckennetzPath = path.join(process.cwd(), "public", "streckennetz.geojson");
    const raw = JSON.parse(readFileSync(streckennetzPath, "utf-8")) as {
      features: Array<{
        geometry: { type: string; coordinates: number[][] };
        properties: Record<string, string | number | null>;
      }>;
    };

    // ── Sample: one midpoint per segment, skip very short segments (<2km) ──
    const segments: SegmentSample[] = raw.features
      .filter((f) => {
        if (f.geometry.type !== "LineString") return false;
        const coords = f.geometry.coordinates;
        return coords.length >= 2 && lineLength(coords) >= 2;
      })
      .map((f) => ({
        streckennummer: String(f.properties.streckennummer ?? ""),
        name: String(f.properties.name ?? ""),
        bundesland: String(f.properties.bundesland ?? ""),
        midpoint: midpoint(f.geometry.coordinates),
        coordinates: f.geometry.coordinates,
      }));

    // Limit to 200 segments to keep response times reasonable
    const sampled = segments.slice(0, 200);
    const midpoints = sampled.map((s) => s.midpoint);

    // ── Fetch wind gusts in batches of 10 ─────────────────────────────────
    const BATCH = 10;
    const gustResults: (number | null)[] = [];
    for (let i = 0; i < midpoints.length; i += BATCH) {
      const batch = midpoints.slice(i, i + BATCH);
      const gusts = await fetchWindGusts(batch);
      gustResults.push(...gusts);
    }

    // ── Fetch TCD for each segment midpoint (in parallel, with concurrency cap) ──
    // Copernicus WCS can be slow — cap at 20 concurrent requests
    const CONCURRENCY = 20;
    const tcdResults: (number | null)[] = new Array(sampled.length).fill(null);
    for (let i = 0; i < sampled.length; i += CONCURRENCY) {
      const slice = sampled.slice(i, i + CONCURRENCY);
      const tcdBatch = await Promise.allSettled(
        slice.map((s) => fetchTreeCoverDensity(s.midpoint.lat, s.midpoint.lon))
      );
      tcdBatch.forEach((r, j) => {
        tcdResults[i + j] = r.status === "fulfilled" ? r.value : null;
      });
    }

    // ── Build risk score and GeoJSON output ────────────────────────────────
    // risk = normalize(tcd/100 * gust/60)  where 60 km/h is the reference storm speed
    // Clamp to [0, 1]
    const features = sampled.map((seg, i) => {
      const tcd = tcdResults[i]; // 0–100 (percent tree cover)
      const gust = gustResults[i]; // km/h

      let risk: number | null = null;
      if (tcd !== null && gust !== null) {
        risk = Math.min(1, (tcd / 100) * (gust / 60));
      } else if (tcd !== null) {
        // No wind data: use tree density alone as a static vulnerability proxy
        risk = tcd / 100 * 0.3;
      }

      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: seg.coordinates },
        properties: {
          streckennummer: seg.streckennummer,
          name: seg.name,
          bundesland: seg.bundesland,
          tcd: tcd,
          wind_gust: gust,
          risk: risk,
        },
      };
    });

    const geojson = { type: "FeatureCollection", features };
    cache = { ts: Date.now(), data: geojson };
    return NextResponse.json(geojson);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
