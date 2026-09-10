import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "src", "data", "population", "population_deu_2019-07-01.csv");
const OUTPUT = path.join(ROOT, "public", "population.geojson");

const BIN = 0.1;
const HALF = BIN / 2;
const bins = new Map();

const rl = readline.createInterface({
  input: fs.createReadStream(INPUT, { encoding: "utf-8" }),
  crlfDelay: Infinity,
});

let firstLine = true;
let rows = 0;
process.stdout.write("Reading CSV");

for await (const line of rl) {
  if (firstLine) { firstLine = false; continue; }
  const raw = line.replace(/"/g, "").split(",");
  const lat = parseFloat(raw[0]);
  const lon = parseFloat(raw[1]);
  const pop = parseFloat(raw[2]);
  if (!isFinite(lat) || !isFinite(lon) || !isFinite(pop) || pop <= 0) continue;
  const latBin = Math.floor(lat / BIN);
  const lonBin = Math.floor(lon / BIN);
  const k = `${latBin},${lonBin}`;
  const existing = bins.get(k);
  if (existing) { existing.pop += pop; }
  else { bins.set(k, { lat: (latBin + 0.5) * BIN, lon: (lonBin + 0.5) * BIN, pop }); }
  rows++;
  if (rows % 5_000_000 === 0) process.stdout.write(".");
}

console.log(` done. ${rows.toLocaleString()} rows → ${bins.size} bins`);

const features = [...bins.values()].map(({ lat, lon, pop }) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { pop: Math.round(pop) },
}));

fs.writeFileSync(OUTPUT, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`✓ ${features.length} polygon cells → ${OUTPUT}`);
