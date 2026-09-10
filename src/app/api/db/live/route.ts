import { NextRequest, NextResponse } from "next/server";
import { dbFetch, parseTimetable, mergeChanges } from "@/lib/dbApi";

// Fetches live timetable data for a list of EVA numbers.
// Returns per-station delay summary: { eva, maxDelay, hasCancellation, trains[] }

function pad2(n: number) { return String(n).padStart(2, "0"); }

function nowDateHours(): { date: string; hours: number[] } {
  const now = new Date();
  const date = `${String(now.getFullYear()).slice(2)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const h = now.getHours();
  return { date, hours: [h, (h + 1) % 24] };
}

function delayMin(planned: string | null, actual: string | null): number {
  if (!planned || !actual || planned.length < 10 || actual.length < 10) return 0;
  const toMin = (t: string) => parseInt(t.slice(6, 8)) * 60 + parseInt(t.slice(8, 10));
  return Math.max(0, toMin(actual) - toMin(planned));
}

function fmtTime(t: string | null): string {
  if (!t || t.length < 10) return "";
  return `${t.slice(6, 8)}:${t.slice(8, 10)}`;
}

export async function GET(req: NextRequest) {
  const evasParam = req.nextUrl.searchParams.get("evas");
  if (!evasParam) return NextResponse.json({ error: "evas required" }, { status: 400 });

  const evas = evasParam.split(",").filter(Boolean).slice(0, 50); // cap at 50 per call
  const { date, hours } = nowDateHours();

  const results = await Promise.allSettled(
    evas.map(async (eva) => {
      const [planXmls, fchgXml] = await Promise.all([
        Promise.all(
          hours.map((h) => dbFetch(`/plan/${eva}/${date}/${pad2(h)}`).catch(() => ""))
        ),
        dbFetch(`/fchg/${eva}`).catch(() => ""),
      ]);

      let stops = planXmls.flatMap((xml) => (xml ? parseTimetable(xml) : []));
      if (fchgXml) stops = mergeChanges(stops, fchgXml);

      // Only departures within ±90 min of now
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      stops = stops.filter((s) => {
        const t = s.dpTimeCh ?? s.dpTime;
        if (!t || t.length < 10) return false;
        const tMin = parseInt(t.slice(6, 8)) * 60 + parseInt(t.slice(8, 10));
        const diff = tMin - nowMin;
        return diff >= -10 && diff <= 90;
      });

      const maxDelay = Math.max(0, ...stops.map((s) => delayMin(s.dpTime, s.dpTimeCh)));
      const hasCancellation = stops.some((s) => s.dpCancelled);

      const trains = stops.slice(0, 10).map((s) => ({
        id: s.id,
        category: s.category,
        number: s.number,
        destination: s.dpPath ? s.dpPath.split("|").pop() : "",
        planned: fmtTime(s.dpTime),
        actual: fmtTime(s.dpTimeCh ?? s.dpTime),
        delay: delayMin(s.dpTime, s.dpTimeCh),
        cancelled: s.dpCancelled,
        platform: s.dpPlatformCh ?? s.dpPlatform ?? "",
      }));

      return { eva, maxDelay, hasCancellation, trains };
    })
  );

  const stations = results
    .filter((r): r is PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never> =>
      r.status === "fulfilled"
    )
    .map((r) => (r as PromiseFulfilledResult<{ eva: string; maxDelay: number; hasCancellation: boolean; trains: unknown[] }>).value);

  return NextResponse.json({ date, stations });
}
