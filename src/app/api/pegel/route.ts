import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(
      "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json" +
        "?includeTimeseries=true&includeCurrentMeasurement=true",
      { next: { revalidate: 300 } }
    );
    const stations = await res.json();

    const features = (stations as Record<string, unknown>[]).flatMap((s) => {
      const lon = s.longitude as number | null;
      const lat = s.latitude as number | null;
      if (!lon || !lat) return [];

      const timeseries = (s.timeseries as Record<string, unknown>[]) ?? [];
      const wSeries = timeseries.find((t) => t.shortname === "W");
      if (!wSeries?.currentMeasurement) return [];

      const m = wSeries.currentMeasurement as Record<string, unknown>;
      const value = m.value as number;
      const stateMnwMhw = (m.stateMnwMhw as string) ?? "unknown";
      const stateNswHsw = (m.stateNswHsw as string) ?? "unknown";

      // Derive a flood alert level: unknown < normal < low < high
      const alertLevel =
        stateNswHsw === "commented" || stateNswHsw === "out-dated"
          ? "unknown"
          : stateNswHsw !== "unknown"
          ? stateNswHsw          // "normal" | "low" | "high" etc.
          : stateMnwMhw;         // fallback

      return [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: {
            uuid: s.uuid,
            name: s.shortname,
            longname: s.longname,
            river: (s.water as Record<string, string>)?.longname ?? null,
            km: s.km ?? null,
            agency: s.agency ?? null,
            value,
            unit: wSeries.unit,
            stateMnwMhw,
            stateNswHsw,
            alertLevel,
            timestamp: m.timestamp,
          },
        },
      ];
    });

    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
