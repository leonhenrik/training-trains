/**
 * Converts M1 Streckennetz.csv → public/streckennetz.geojson
 *
 * Each CSV row is one track segment with a WKT LINESTRING in WGS84.
 * We parse that geometry directly without an external library.
 *
 * Run: node scripts/buildRailGeoJSON.mjs
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "src", "data", "M1 Streckennetz.csv");
const OUTPUT = path.join(ROOT, "public", "streckennetz.geojson");

// Parse "LINESTRING (lon lat, lon lat, ...)" → [[lon,lat], ...]
function parseWKTLineString(wkt) {
  if (!wkt || !wkt.startsWith("LINESTRING")) return null;
  const inner = wkt.match(/\(([^)]+)\)/);
  if (!inner) return null;
  return inner[1]
    .split(",")
    .map((pair) => {
      const [lon, lat] = pair.trim().split(/\s+/).map(Number);
      return [lon, lat];
    })
    .filter(([lon, lat]) => isFinite(lon) && isFinite(lat));
}

// Parse speed string like "160 km/h" → 160, or null
function parseSpeed(s) {
  const m = s && s.match(/^(\d+)\s*km\/h$/);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  const features = [];
  let headers = null;
  let skipped = 0;

  // Track seen (Streckennummer + WKT) pairs to deduplicate Richtungs/Gegenrichtungs duplicates
  const seen = new Set();

  for await (const line of rl) {
    if (!headers) {
      headers = line.split(";");
      continue;
    }

    const cols = line.split(";");
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));

    const wkt = row["WKT WGS84 (EPSG 4326)"];
    const key = row["Streckennummer"] + "|" + wkt;

    // Deduplicate: keep only one geometry per Streckennummer+WKT pair
    if (seen.has(key)) continue;
    seen.add(key);

    const coords = parseWKTLineString(wkt);
    if (!coords || coords.length < 2) {
      skipped++;
      continue;
    }

    const speedKmh = parseSpeed(row["Geschwindigkeit"]);

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        streckennummer: row["Streckennummer"],
        name: row["Streckenkurzname"],
        elektrifizierung: row["Elektrifizierung"],
        gleisanzahl: row["Gleisanzahl"],
        geschwindigkeit: speedKmh,
        bundesland: row["Bundesland"],
        bauzustand: row["Bauzustand"],
      },
    });
  }

  const geojson = { type: "FeatureCollection", features };
  fs.writeFileSync(OUTPUT, JSON.stringify(geojson));
  console.log(`✓ ${features.length} segments written to ${OUTPUT} (${skipped} skipped)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
