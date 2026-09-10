import { NextRequest, NextResponse } from "next/server";
import { dbFetch, parseTimetable, mergeChanges } from "@/lib/dbApi";

// GET /api/db/route?from=EVA&to=EVA&depart=HHmm&date=YYMMdd&minTransfer=5&maxLegs=5
// Returns up to 5 itineraries (legs[][]) sorted by total travel time.

function pad2(n: number) { return String(n).padStart(2, "0"); }

function toMin(t: string): number {
  // "YYMMddHHmm" → minutes since midnight
  return parseInt(t.slice(6, 8)) * 60 + parseInt(t.slice(8, 10));
}

function fmtTime(t: string | null): string {
  if (!t || t.length < 10) return "";
  return `${t.slice(6, 8)}:${t.slice(8, 10)}`;
}

function effectiveDep(s: Stop): number | null {
  const t = s.dpTimeCh ?? s.dpTime;
  if (!t) return null;
  return toMin(t);
}

function effectiveArr(s: Stop): number | null {
  const t = s.arTimeCh ?? s.arTime;
  if (!t) return null;
  return toMin(t);
}

interface Stop {
  id: string;
  category: string;
  number: string;
  line: string;
  dpTime: string | null;
  dpTimeCh: string | null;
  dpPlatform: string | null;
  dpPlatformCh: string | null;
  dpPath: string | null;
  dpCancelled: boolean;
  arTime: string | null;
  arTimeCh: string | null;
  arPlatform: string | null;
  arPlatformCh: string | null;
  arPath: string | null;
  arCancelled: boolean;
}

interface Leg {
  trainId: string;
  category: string;
  number: string;
  line: string;
  fromEva: string;
  fromName: string;
  toEva: string;
  toName: string;
  depPlanned: string;
  depActual: string;
  arrPlanned: string;
  arrActual: string;
  depPlatform: string;
  cancelled: boolean;
}

interface Itinerary {
  legs: Leg[];
  totalMin: number;
  transfers: number;
  depTime: string;
  arrTime: string;
}

// Cache fetched timetables within one request
const cache = new Map<string, Stop[]>();

async function getStops(eva: string, date: string): Promise<Stop[]> {
  const key = `${eva}|${date}`;
  if (cache.has(key)) return cache.get(key)!;

  const now = new Date();
  const h = now.getHours();
  const hours = [h, (h + 1) % 24, (h + 2) % 24];

  const [planXmls, fchgXml] = await Promise.all([
    Promise.all(hours.map((hh) => dbFetch(`/plan/${eva}/${date}/${pad2(hh)}`).catch(() => ""))),
    dbFetch(`/fchg/${eva}`).catch(() => ""),
  ]);

  let stops: Stop[] = planXmls.flatMap((xml) => (xml ? parseTimetable(xml) : []));
  if (fchgXml) stops = mergeChanges(stops, fchgXml) as Stop[];

  cache.set(key, stops);
  return stops;
}

// Extract intermediate EVA numbers from a stop's dpPath using the stations-matched index.
// dpPath is pipe-separated station *names* — we need EVAs. We pass a name→EVA map.
function pathNames(stop: Stop): string[] {
  if (!stop.dpPath) return [];
  return stop.dpPath.split("|").filter(Boolean);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const fromEva = p.get("from") ?? "";
  const toEva = p.get("to") ?? "";
  const fromName = p.get("fromName") ?? fromEva;
  const toName = p.get("toName") ?? toEva;
  const departStr = p.get("depart") ?? ""; // "HHmm"
  const minTransfer = Math.max(0, parseInt(p.get("minTransfer") ?? "5"));
  const maxLegs = Math.min(6, parseInt(p.get("maxLegs") ?? "4"));

  if (!fromEva || !toEva) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const now = new Date();
  const date = `${String(now.getFullYear()).slice(2)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;

  // Parse depart time as minutes since midnight
  let departMin = now.getHours() * 60 + now.getMinutes();
  if (departStr.length === 4) {
    departMin = parseInt(departStr.slice(0, 2)) * 60 + parseInt(departStr.slice(2, 4));
  }

  // Load a name→eva index from the matched stations file
  // We ship stations-matched.geojson as a static file in /public — read it at runtime
  let nameToEva: Map<string, string> = new Map();
  let evaToName: Map<string, string> = new Map();
  try {
    // In Next.js server context we can read from the filesystem
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "public", "stations-matched.geojson");
    const gj = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    for (const f of gj.features) {
      const eva = f.properties.eva as string;
      const name = f.properties.name as string;
      if (eva && name) {
        nameToEva.set(name.toLowerCase(), eva);
        evaToName.set(eva, name);
      }
    }
  } catch {
    // If file not present, we continue with empty map; direct EVA paths won't resolve
  }

  // Also load stations.json for broader name coverage
  try {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "public", "stations.json");
    const arr = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { eva: string; name: string }[];
    for (const s of arr) {
      if (!nameToEva.has(s.name.toLowerCase())) nameToEva.set(s.name.toLowerCase(), s.eva);
      if (!evaToName.has(s.eva)) evaToName.set(s.eva, s.name);
    }
  } catch { /* ignore */ }

  evaToName.set(fromEva, fromName);
  evaToName.set(toEva, toName);

  // BFS/Dijkstra: state = (currentEva, minutesSinceMidnight, legs[])
  // Priority queue ordered by arrival time at current node
  interface State {
    eva: string;
    arrivedAt: number;   // minutes since midnight at this station
    legs: Leg[];
  }

  const results: Itinerary[] = [];
  const queue: State[] = [{ eva: fromEva, arrivedAt: departMin, legs: [] }];
  // visited: eva → earliest arrival minute seen (prune worse paths)
  const bestAt = new Map<string, number>();
  bestAt.set(fromEva, departMin);

  let iterations = 0;
  const MAX_ITER = 400;

  while (queue.length > 0 && results.length < 5 && iterations < MAX_ITER) {
    iterations++;

    // Pop best state (smallest arrivedAt)
    queue.sort((a, b) => a.arrivedAt - b.arrivedAt);
    const state = queue.shift()!;

    if (state.legs.length > maxLegs) continue;

    // Fetch timetable at current station
    let stops: Stop[];
    try {
      stops = await getStops(state.eva, date);
    } catch {
      continue;
    }

    // Find departures after we arrive (+ minTransfer if not first leg)
    const earliestDep = state.legs.length === 0 ? state.arrivedAt : state.arrivedAt + minTransfer;

    for (const stop of stops) {
      if (stop.dpCancelled) continue;
      const depMin = effectiveDep(stop);
      if (depMin === null || depMin < earliestDep) continue;
      if (depMin > earliestDep + 180) continue; // don't wait more than 3h

      // Where does this train go? Extract destination names from path
      const destinations = pathNames(stop);

      // Check if destination is in path
      const toNameLower = toName.toLowerCase();
      const toInPath = destinations.some(
        (n) => n.toLowerCase() === toNameLower || nameToEva.get(n.toLowerCase()) === toEva
      );

      // Also check all intermediate stations for further transfers
      const stationsToExplore: { name: string; eva: string }[] = [];

      for (const destName of destinations) {
        const destEva = nameToEva.get(destName.toLowerCase());
        if (!destEva) continue;

        // Estimate arrival at this intermediate stop.
        // We don't have per-intermediate arrival times from the plan API,
        // so we approximate: destination station arrival is from the stop's arTime
        // For intermediate stations we use a linear interpolation heuristic.
        const destIdx = destinations.indexOf(destName);
        const totalStops = destinations.length;
        // Very rough: assume equal time per stop segment
        // We'll use arTime as the final arrival time
        const finalArrMin = effectiveArr(stop) ?? (depMin + 60);
        const fracThrough = totalStops > 1 ? (destIdx + 1) / totalStops : 1;
        const estimatedArr = depMin + Math.round((finalArrMin - depMin) * fracThrough);

        if (destEva === toEva || destName.toLowerCase() === toNameLower) {
          // Direct connection found!
          const leg: Leg = {
            trainId: stop.id,
            category: stop.category,
            number: stop.number,
            line: stop.line,
            fromEva: state.eva,
            fromName: evaToName.get(state.eva) ?? state.eva,
            toEva: destEva,
            toName: destName,
            depPlanned: fmtTime(stop.dpTime),
            depActual: fmtTime(stop.dpTimeCh ?? stop.dpTime),
            arrPlanned: fmtTime(stop.arTime),
            arrActual: fmtTime(stop.arTimeCh ?? stop.arTime),
            depPlatform: stop.dpPlatformCh ?? stop.dpPlatform ?? "",
            cancelled: stop.dpCancelled,
          };
          const allLegs = [...state.legs, leg];
          const firstDep = allLegs[0].depActual;
          const lastArr = allLegs[allLegs.length - 1].arrActual;
          // parse total minutes
          const depM = parseInt(firstDep.slice(0, 2)) * 60 + parseInt(firstDep.slice(3, 5));
          const arrM = parseInt(lastArr.slice(0, 2)) * 60 + parseInt(lastArr.slice(3, 5));
          results.push({
            legs: allLegs,
            totalMin: (arrM - depM + 1440) % 1440,
            transfers: allLegs.length - 1,
            depTime: firstDep,
            arrTime: lastArr,
          });
          break; // found direct to destination via this train
        }

        // Prune: only explore if we arrive earlier than previously seen
        const prev = bestAt.get(destEva);
        if (prev !== undefined && estimatedArr >= prev) continue;
        bestAt.set(destEva, estimatedArr);
        stationsToExplore.push({ name: destName, eva: destEva });
      }

      // Enqueue transfers at intermediate stations along this train's path
      // Only enqueue a representative sample to keep search bounded
      for (const { eva: intEva } of stationsToExplore.slice(0, 8)) {
        const estArr = bestAt.get(intEva) ?? (depMin + 30);
        const leg: Leg = {
          trainId: stop.id,
          category: stop.category,
          number: stop.number,
          line: stop.line,
          fromEva: state.eva,
          fromName: evaToName.get(state.eva) ?? state.eva,
          toEva: intEva,
          toName: evaToName.get(intEva) ?? intEva,
          depPlanned: fmtTime(stop.dpTime),
          depActual: fmtTime(stop.dpTimeCh ?? stop.dpTime),
          arrPlanned: "",
          arrActual: "",
          depPlatform: stop.dpPlatformCh ?? stop.dpPlatform ?? "",
          cancelled: false,
        };
        queue.push({ eva: intEva, arrivedAt: estArr, legs: [...state.legs, leg] });
      }
    }
  }

  results.sort((a, b) => a.totalMin - b.totalMin);

  return NextResponse.json({ itineraries: results.slice(0, 5), date });
}
