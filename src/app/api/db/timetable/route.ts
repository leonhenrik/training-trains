import { NextRequest, NextResponse } from "next/server";
import { dbFetch, parseTimetable, mergeChanges } from "@/lib/dbApi";

export async function GET(req: NextRequest) {
  const eva = req.nextUrl.searchParams.get("eva");
  if (!eva) return NextResponse.json({ error: "eva required" }, { status: 400 });

  // Current hour + next hour so the board is never empty near the hour boundary
  const now = new Date();
  function pad2(n: number) { return String(n).padStart(2, "0"); }
  const date = `${String(now.getFullYear()).slice(2)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const hours = [now.getHours(), (now.getHours() + 1) % 24];

  try {
    const [planXmls, fchgXml] = await Promise.all([
      Promise.all(hours.map((h) => dbFetch(`/plan/${eva}/${date}/${pad2(h)}`).catch(() => ""))),
      dbFetch(`/fchg/${eva}`).catch(() => ""),
    ]);

    let stops = planXmls.flatMap((xml) => (xml ? parseTimetable(xml) : []));
    if (fchgXml) stops = mergeChanges(stops, fchgXml);

    // Sort by effective departure time
    stops.sort((a, b) => {
      const ta = a.dpTimeCh ?? a.dpTime ?? a.arTimeCh ?? a.arTime ?? "";
      const tb = b.dpTimeCh ?? b.dpTime ?? b.arTimeCh ?? b.arTime ?? "";
      return ta.localeCompare(tb);
    });

    return NextResponse.json({ date, stops });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
