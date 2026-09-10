import { NextResponse } from "next/server";

// ~35 DWD station locations spread across Germany
const STATIONS: Array<{ lat: number; lon: number }> = [
  { lat: 54.78, lon: 9.45 },  // Flensburg
  { lat: 54.18, lon: 7.90 },  // Sylt
  { lat: 53.55, lon: 10.00 }, // Hamburg
  { lat: 54.09, lon: 12.14 }, // Rostock
  { lat: 53.08, lon: 8.80 },  // Bremen
  { lat: 52.52, lon: 13.41 }, // Berlin
  { lat: 53.41, lon: 14.55 }, // Szczecin area
  { lat: 52.03, lon: 11.73 }, // Magdeburg
  { lat: 51.34, lon: 12.37 }, // Leipzig
  { lat: 50.93, lon: 13.89 }, // Dresden
  { lat: 51.96, lon: 7.63 },  // Münster
  { lat: 51.51, lon: 7.46 },  // Dortmund
  { lat: 51.23, lon: 6.79 },  // Düsseldorf
  { lat: 50.94, lon: 6.96 },  // Köln
  { lat: 50.11, lon: 8.68 },  // Frankfurt
  { lat: 50.08, lon: 11.86 }, // Bayreuth
  { lat: 49.45, lon: 7.77 },  // Kaiserslautern
  { lat: 49.00, lon: 8.39 },  // Karlsruhe
  { lat: 48.78, lon: 9.18 },  // Stuttgart
  { lat: 49.45, lon: 11.08 }, // Nürnberg
  { lat: 48.14, lon: 11.58 }, // München
  { lat: 47.67, lon: 10.32 }, // Kempten
  { lat: 52.27, lon: 10.52 }, // Braunschweig
  { lat: 48.00, lon: 7.84 },  // Freiburg
  { lat: 53.60, lon: 11.42 }, // Schwerin
  { lat: 50.72, lon: 10.93 }, // Erfurt
  { lat: 51.75, lon: 14.33 }, // Cottbus
  { lat: 49.24, lon: 6.99 },  // Saarbrücken
  { lat: 51.96, lon: 10.43 }, // Goslar / Harz
  { lat: 52.72, lon: 13.93 }, // Eberswalde
  { lat: 53.85, lon: 8.66 },  // Cuxhaven
  { lat: 54.32, lon: 10.13 }, // Kiel
  { lat: 47.88, lon: 12.00 }, // Rosenheim
  { lat: 50.36, lon: 7.59 },  // Koblenz
  { lat: 51.43, lon: 11.99 }, // Halle
];

export async function GET() {
  try {
    const results = await Promise.allSettled(
      STATIONS.map(({ lat, lon }) =>
        fetch(
          `https://api.brightsky.dev/current_weather?lat=${lat}&lon=${lon}`,
          { next: { revalidate: 300 } }
        ).then((r) => r.json())
      )
    );

    const seen = new Set<string>();
    const features = results.flatMap((r, i) => {
      if (r.status !== "fulfilled") return [];
      const obs = r.value?.weather;
      if (!obs) return [];
      const src = r.value?.sources?.[0];
      // deduplicate by DWD station id
      const stationId = src?.dwd_station_id ?? `${i}`;
      if (seen.has(stationId)) return [];
      seen.add(stationId);

      const { lat, lon } = STATIONS[i];
      return [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [src?.lon ?? lon, src?.lat ?? lat] },
          properties: {
            station: src?.station_name ?? null,
            temperature: obs.temperature ?? null,
            precipitation: obs.precipitation_10 ?? 0,
            cloud_cover: obs.cloud_cover ?? null,
            wind_speed: obs.wind_speed_10 ?? null,
            wind_direction: obs.wind_direction_10 ?? null,
            wind_gust: obs.wind_gust_speed_10 ?? null,
            visibility: obs.visibility ?? null,
            pressure: obs.pressure_msl ?? null,
            humidity: obs.relative_humidity ?? null,
            condition: obs.condition ?? null,
            icon: obs.icon ?? null,
          },
        },
      ];
    });

    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
