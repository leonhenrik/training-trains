import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// GET /api/db/segments?evas=eva1,eva2,...
// Returns the set of streckennummern that these stations belong to,
// so the client can highlight those track segments on the map.

interface BetriebsstelleProps {
  name: string;
  kuerzel: string;
  streckennummer: string;
}

interface StationProps {
  eva: string;
  name: string;
}

let betriebsstellenByName: Map<string, BetriebsstelleProps> | null = null;
let evaToName: Map<string, string> | null = null;

function loadData() {
  if (betriebsstellenByName && evaToName) return;

  betriebsstellenByName = new Map();
  evaToName = new Map();

  // Load betriebsstellen: name → {streckennummer, kuerzel}
  try {
    const bsPath = path.join(process.cwd(), "public", "betriebsstellen.geojson");
    const gj = JSON.parse(fs.readFileSync(bsPath, "utf-8"));
    for (const f of gj.features) {
      const p = f.properties as BetriebsstelleProps;
      if (p.name && p.streckennummer) {
        betriebsstellenByName!.set(p.name.toLowerCase(), p);
      }
    }
  } catch { /* ignore */ }

  // Load stations-matched + stations.json: eva → name
  try {
    const smPath = path.join(process.cwd(), "public", "stations-matched.geojson");
    const gj = JSON.parse(fs.readFileSync(smPath, "utf-8"));
    for (const f of gj.features) {
      const eva = f.properties.eva as string;
      const name = f.properties.name as string;
      if (eva && name) evaToName!.set(eva, name);
    }
  } catch { /* ignore */ }

  try {
    const sPath = path.join(process.cwd(), "public", "stations.json");
    const arr = JSON.parse(fs.readFileSync(sPath, "utf-8")) as StationProps[];
    for (const s of arr) {
      if (!evaToName!.has(s.eva)) evaToName!.set(s.eva, s.name);
    }
  } catch { /* ignore */ }
}

export async function GET(req: NextRequest) {
  const evasParam = req.nextUrl.searchParams.get("evas") ?? "";
  const evas = evasParam.split(",").filter(Boolean);
  if (!evas.length) return NextResponse.json({ streckennummern: [] });

  loadData();

  const streckennummern = new Set<string>();

  for (const eva of evas) {
    const name = evaToName!.get(eva);
    if (!name) continue;

    // Exact match
    const exact = betriebsstellenByName!.get(name.toLowerCase());
    if (exact?.streckennummer) {
      streckennummern.add(exact.streckennummer);
      continue;
    }

    // Fuzzy: find betriebsstelle whose name is contained in or contains the station name
    const nameLower = name.toLowerCase();
    for (const [bsName, bsProps] of betriebsstellenByName!) {
      if (bsProps.streckennummer && (bsName.includes(nameLower) || nameLower.includes(bsName))) {
        streckennummern.add(bsProps.streckennummer);
      }
    }
  }

  return NextResponse.json({ streckennummern: [...streckennummern] });
}
