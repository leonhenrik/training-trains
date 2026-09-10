import { NextResponse } from "next/server";

// Joins Kreise GeoJSON (opendatasoft) with GDP + unemployment from Regionalstatistik.de.
// Data is annual — cache 24h. CSVs are per-Bundesland (suffix 01-16), fetched in parallel.

type CsvRow = { ags: string; bipPerWorker: number | null; bipPerCapita: number | null; unemployment: number | null };

const BUNDESLAENDER = ["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16"];

function parseCsv(text: string, colIndex: number, into: Map<string, number>) {
  // Row format: year ; AGS ; name ; val0 ; val1 ; …
  for (const line of text.split("\n")) {
    const cols = line.split(";");
    if (cols.length <= colIndex) continue;
    if (!/^\d{4}$/.test(cols[0]?.trim())) continue;
    const ags = cols[1]?.trim().replace(/\s/g, "");
    if (!/^\d{5}$/.test(ags)) continue;           // Kreis level only
    const val = parseFloat(cols[colIndex]?.trim().replace(",", "."));
    if (!isNaN(val) && !into.has(ags)) into.set(ags, val);  // keep latest year
  }
}

async function fetchAllBundeslaender(table: string, colIndex: number): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  await Promise.allSettled(
    BUNDESLAENDER.map(async (bl) => {
      try {
        const url = `https://www.regionalstatistik.de/genesisws/downloader/${bl}/tables/${table}_${bl}.csv`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const text = await res.text();
        parseCsv(text, colIndex, map);
      } catch { /* ignore failed Bundesland */ }
    })
  );
  return map;
}

let cache: { geojson: unknown; ts: number; ok: boolean } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function GET() {
  if (cache?.ok && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.geojson);
  }

  try {
    const [geoRes, bipPerWorker, bipPerCapita, alo] = await Promise.all([
      fetch(
        "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-germany-kreis/exports/geojson?select=krs_code,krs_name",
        { cache: "no-store" }
      ),
      fetchAllBundeslaender("AI017-1", 3),  // BIP je Erwerbstätigen
      fetchAllBundeslaender("AI017-1", 5),  // BIP pro Kopf
      fetchAllBundeslaender("AI008-1", 3),  // Arbeitslosenquote
    ]);

    const geoJson = await geoRes.json();

    const features = (geoJson.features as Record<string, unknown>[]).map((f) => {
      const props = f.properties as Record<string, unknown>;
      const codeArr = props.krs_code as string[] | string;
      const ags = (Array.isArray(codeArr) ? codeArr[0] : codeArr)?.trim();
      const nameArr = props.krs_name as string[] | string;
      const name = (Array.isArray(nameArr) ? nameArr[0] : nameArr)?.trim();

      return {
        ...f,
        properties: {
          ags,
          name,
          bipPerWorker: bipPerWorker.get(ags) ?? null,
          bipPerCapita: bipPerCapita.get(ags) ?? null,
          unemployment: alo.get(ags) ?? null,
        },
      };
    });

    const bipVals = features.map((f) => (f.properties as CsvRow).bipPerCapita).filter((v): v is number => v !== null);
    const aloVals = features.map((f) => (f.properties as CsvRow).unemployment).filter((v): v is number => v !== null);

    const result = {
      type: "FeatureCollection",
      features,
      meta: {
        bip: { min: Math.min(...bipVals), max: Math.max(...bipVals) },
        alo: { min: Math.min(...aloVals), max: Math.max(...aloVals) },
        year: { bip: 2022, alo: 2024 },
      },
    };

    const matched = bipVals.length;
    cache = { geojson: result, ts: Date.now(), ok: matched > 100 };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
