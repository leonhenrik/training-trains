import { NextResponse } from "next/server";

// Systematic 0.4° grid across Germany's bounding box (~550 points).
// Open-Meteo interpolates DWD ICON-D2 model data at any lat/lon — no fixed stations.
const STEP = 0.4;
const LAT_MIN = 47.2, LAT_MAX = 55.1;
const LON_MIN = 5.8,  LON_MAX = 15.1;

const GRID: Array<{ lat: number; lon: number }> = [];
for (let lat = LAT_MIN; lat <= LAT_MAX + 0.001; lat = Math.round((lat + STEP) * 1000) / 1000) {
  for (let lon = LON_MIN; lon <= LON_MAX + 0.001; lon = Math.round((lon + STEP) * 1000) / 1000) {
    GRID.push({ lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 });
  }
}

const OM_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "snowfall",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "relative_humidity_2m",
  "surface_pressure",
  "visibility",
  "weather_code",
].join(",");

function weatherCodeToIcon(code: number): string {
  if (code === 0) return "clear-day";
  if (code <= 2) return "partly-cloudy-day";
  if (code === 3) return "cloudy";
  if (code <= 49) return "fog";
  if (code <= 59) return "rain";
  if (code <= 69) return "sleet";
  if (code <= 79) return "snow";
  if (code <= 84) return "rain";
  if (code <= 94) return "hail";
  return "thunderstorm";
}

function weatherCodeToCondition(code: number): string {
  if (code === 0) return "clear";
  if (code <= 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code <= 49) return "fog";
  if (code <= 59) return "rain";
  if (code <= 69) return "sleet";
  if (code <= 79) return "snow";
  if (code <= 84) return "rain";
  if (code <= 94) return "hail";
  return "thunderstorm";
}

export async function GET() {
  try {
    // Batch into groups of 50 — Open-Meteo handles long comma-separated lists fine
    const BATCH = 50;
    const batches: typeof GRID[] = [];
    for (let i = 0; i < GRID.length; i += BATCH) batches.push(GRID.slice(i, i + BATCH));

    const batchResults = await Promise.allSettled(
      batches.map((batch) => {
        const lats = batch.map((p) => p.lat).join(",");
        const lons = batch.map((p) => p.lon).join(",");
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lats}&longitude=${lons}` +
          `&current=${OM_VARS}` +
          `&wind_speed_unit=kmh&timezone=auto&forecast_days=1`;
        return fetch(url, { next: { revalidate: 300 } }).then((r) => r.json());
      })
    );

    const features = batchResults.flatMap((result, bi) => {
      if (result.status !== "fulfilled") return [];
      const data = result.value;
      // Open-Meteo returns an array when multiple locations are queried
      const entries: unknown[] = Array.isArray(data) ? data : [data];
      const batch = batches[bi];

      return entries.flatMap((entry: unknown, i) => {
        const e = entry as Record<string, unknown>;
        if (!e || typeof e !== "object") return [];
        const c = e.current as Record<string, number> | undefined;
        if (!c) return [];
        const pt = batch[i];
        const lng = (e.longitude as number | undefined) ?? pt.lon;
        const lat2 = (e.latitude as number | undefined) ?? pt.lat;

        const code = c.weather_code ?? 0;
        return [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [lng, lat2],
            },
            properties: {
              station: `${lat2.toFixed(1)}°N ${lng.toFixed(1)}°E`,
              temperature: c.temperature_2m ?? null,
              apparent_temperature: c.apparent_temperature ?? null,
              precipitation: c.precipitation ?? 0,
              cloud_cover: c.cloud_cover ?? null,
              wind_speed: c.wind_speed_10m ?? null,
              wind_direction: c.wind_direction_10m ?? null,
              wind_gust: c.wind_gusts_10m ?? null,
              humidity: c.relative_humidity_2m ?? null,
              pressure: c.surface_pressure ?? null,
              visibility: c.visibility ?? null,
              weather_code: code,
              condition: weatherCodeToCondition(code),
              icon: weatherCodeToIcon(code),
            },
          },
        ];
      });
    });

    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
