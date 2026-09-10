import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "src", "data");
const OUT  = path.join(ROOT, "public");
fs.mkdirSync(OUT, { recursive: true });

function coordPairs(inner) {
  return inner.split(",").map((p) => {
    const [lon, lat] = p.trim().split(/\s+/).map(Number);
    return [lon, lat];
  }).filter(([lon, lat]) => isFinite(lon) && isFinite(lat));
}

function parseWKT(wkt) {
  if (!wkt) return null;
  wkt = wkt.trim();
  if (wkt.startsWith("POINT")) {
    const m = wkt.match(/\(([^)]+)\)/);
    if (!m) return null;
    const [lon, lat] = m[1].trim().split(/\s+/).map(Number);
    if (!isFinite(lon) || !isFinite(lat)) return null;
    return { type: "Point", coordinates: [lon, lat] };
  }
  if (wkt.startsWith("LINESTRING") && !wkt.startsWith("MULTILINESTRING")) {
    const m = wkt.match(/\(([^)]+)\)/);
    if (!m) return null;
    const coords = coordPairs(m[1]);
    return coords.length < 2 ? null : { type: "LineString", coordinates: coords };
  }
  if (wkt.startsWith("MULTILINESTRING")) {
    const rings = [...wkt.matchAll(/\(([^()]+)\)/g)].map(m => coordPairs(m[1])).filter(r => r.length >= 2);
    return rings.length ? { type: "MultiLineString", coordinates: rings } : null;
  }
  if (wkt.startsWith("POLYGON") && !wkt.startsWith("MULTIPOLYGON")) {
    const rings = [...wkt.matchAll(/\(([^()]+)\)/g)].map(m => coordPairs(m[1])).filter(r => r.length >= 4);
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  return null;
}

async function convert({ inputFile, outputFile, wktCol, getProps, dedupeKey }) {
  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  const features = [];
  let headers = null, skipped = 0;
  const seen = dedupeKey ? new Set() : null;

  for await (const line of rl) {
    const clean = line.replace(/^﻿/, "");
    if (!headers) { headers = clean.split(";").map(h => h.trim()); continue; }
    const cols = clean.split(";");
    const row = Object.fromEntries(headers.map((h, i) => [h, (cols[i] ?? "").trim()]));
    if (seen) {
      const k = dedupeKey(row);
      if (seen.has(k)) continue;
      seen.add(k);
    }
    const geometry = parseWKT(row[wktCol]);
    if (!geometry) { skipped++; continue; }
    features.push({ type: "Feature", geometry, properties: getProps(row) });
  }

  fs.writeFileSync(outputFile, JSON.stringify({ type: "FeatureCollection", features }));
  console.log(`✓ ${path.basename(outputFile)}: ${features.length} features (${skipped} skipped)`);
}

const WKT = "WKT WGS84 (EPSG 4326)";
function parseSpeed(s) { const m = s?.match(/^(\d+)\s*km\/h$/); return m ? parseInt(m[1]) : null; }

await convert({
  inputFile: path.join(DATA, "M1 Streckennetz.csv"),
  outputFile: path.join(OUT, "streckennetz.geojson"),
  wktCol: WKT,
  dedupeKey: row => row["Streckennummer"] + "|" + row[WKT],
  getProps: row => ({
    streckennummer: row["Streckennummer"], name: row["Streckenkurzname"],
    elektrifizierung: row["Elektrifizierung"], gleisanzahl: row["Gleisanzahl"],
    geschwindigkeit: parseSpeed(row["Geschwindigkeit"]),
    bundesland: row["Bundesland"], bauzustand: row["Bauzustand"],
  }),
});

await convert({
  inputFile: path.join(DATA, "M1 Betriebsstellen.csv"),
  outputFile: path.join(OUT, "betriebsstellen.geojson"),
  wktCol: WKT,
  dedupeKey: row => row["Kürzel"] + "|" + row[WKT],
  getProps: row => ({
    name: row["Bezeichnung"], art: row["Art"], artLang: row["Art lang"],
    kuerzel: row["Kürzel"], betriebszustand: row["Betriebszustand"],
    streckennummer: row["Streckennummer"], bundesland: row["Bundesland"],
  }),
});

await convert({
  inputFile: path.join(DATA, "M1 Bahnübergänge.csv"),
  outputFile: path.join(OUT, "bahnuebergaenge.geojson"),
  wktCol: WKT,
  dedupeKey: row => row["Streckennummer"] + "|" + row["km_von_i"],
  getProps: row => ({
    name: row["Bezeichnung"], strassenart: row["Straßenart"],
    sicherung: row["Technische Sicherung"],
    streckennummer: row["Streckennummer"], bundesland: row["Bundesland"],
  }),
});

await convert({
  inputFile: path.join(DATA, "M1 Eisenbahnbrücken.csv"),
  outputFile: path.join(OUT, "eisenbahnbruecken.geojson"),
  wktCol: WKT,
  dedupeKey: row => row["Streckennummer"] + "|" + row["km_von_i"],
  getProps: row => ({
    name: row["Bezeichnung"], kreuzungsart: row["Kreuzungsart"],
    laenge: parseFloat(row["Länge"]) || null,
    streckennummer: row["Streckennummer"], bundesland: row["Bundesland"],
  }),
});

await convert({
  inputFile: path.join(DATA, "M1 Tunnel.csv"),
  outputFile: path.join(OUT, "tunnel.geojson"),
  wktCol: WKT,
  dedupeKey: row => row["Streckennummer"] + "|" + row["km_von_i"],
  getProps: row => ({
    name: row["Bezeichnung"], laenge: parseFloat(row["Länge"]) || null,
    streckennummer: row["Streckennummer"], bundesland: row["Bundesland"],
  }),
});

await convert({
  inputFile: path.join(DATA, "M1 OE Grenzen.csv"),
  outputFile: path.join(OUT, "oe-grenzen.geojson"),
  wktCol: WKT,
  dedupeKey: null,
  getProps: row => ({ art: row["Art"], bezeichnung: row["Bezeichnung"], standort: row["Standort"] }),
});
