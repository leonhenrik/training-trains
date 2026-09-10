// Server-side helper — never imported from client components.

const BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1";

export function dbHeaders() {
  return {
    "DB-Client-ID": process.env.CLIENT_ID ?? "",
    "DB-Api-Key": process.env.CLIENT_KEY ?? "",
    Accept: "application/xml",
  };
}

export async function dbFetch(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: dbHeaders(),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`DB API ${res.status}: ${path}`);
  return res.text();
}

// ── Minimal XML attribute extractor (no external deps) ──────────────────────

/** Pull all attributes out of the opening tag of the first element matching tagName */
export function parseAttrs(xml: string, tagName: string): Record<string, string>[] {
  const results: Record<string, string>[] = [];
  const tagRe = new RegExp(`<${tagName}([^>]*)`, "g");
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(m[1])) !== null) attrs[a[1]] = a[2];
    results.push(attrs);
  }
  return results;
}

/** Extract child element content between open/close tags (single occurrence) */
export function parseChildren(xml: string, parentTag: string, childTag: string): Record<string, string>[][] {
  const blocks: Record<string, string>[][] = [];
  const parentRe = new RegExp(`<${parentTag}[^>]*>([\\s\\S]*?)<\\/${parentTag}>`, "g");
  let pm: RegExpExecArray | null;
  while ((pm = parentRe.exec(xml)) !== null) {
    blocks.push(parseAttrs(pm[1], childTag));
  }
  return blocks;
}

// ── Domain parsers ───────────────────────────────────────────────────────────

export interface Station {
  eva: string;
  name: string;
  ds100: string;
}

export function parseStations(xml: string): Station[] {
  return parseAttrs(xml, "station").map((a) => ({
    eva: a.eva ?? "",
    name: a.name ?? "",
    ds100: a.ds100 ?? "",
  }));
}

export interface TrainStop {
  id: string;          // timetableStop id
  category: string;   // ICE, IC, RE, …
  number: string;     // train number
  line: string;       // line name
  // departure
  dpTime: string | null;    // planned "YYMMddHHmm"
  dpTimeCh: string | null;  // changed departure
  dpPlatform: string | null;
  dpPlatformCh: string | null;
  dpPath: string | null;     // planned path (pipe-separated station names)
  dpCancelled: boolean;
  // arrival
  arTime: string | null;
  arTimeCh: string | null;
  arPlatform: string | null;
  arPlatformCh: string | null;
  arPath: string | null;
  arCancelled: boolean;
}

function parseEvent(xml: string, tag: "dp" | "ar"): Pick<TrainStop,
  "dpTime"|"dpTimeCh"|"dpPlatform"|"dpPlatformCh"|"dpPath"|"dpCancelled"|
  "arTime"|"arTimeCh"|"arPlatform"|"arPlatformCh"|"arPath"|"arCancelled"> {
  const attrs = parseAttrs(xml, tag)[0] ?? {};
  const prefix = tag === "dp" ? "dp" : "ar";
  return {
    dpTime:       tag === "dp" ? (attrs.pt ?? null) : null,
    dpTimeCh:     tag === "dp" ? (attrs.ct ?? null) : null,
    dpPlatform:   tag === "dp" ? (attrs.pp ?? null) : null,
    dpPlatformCh: tag === "dp" ? (attrs.cp ?? null) : null,
    dpPath:       tag === "dp" ? (attrs.ppth ?? null) : null,
    dpCancelled:  tag === "dp" ? attrs.cs === "c" : false,
    arTime:       tag === "ar" ? (attrs.pt ?? null) : null,
    arTimeCh:     tag === "ar" ? (attrs.ct ?? null) : null,
    arPlatform:   tag === "ar" ? (attrs.pp ?? null) : null,
    arPlatformCh: tag === "ar" ? (attrs.cp ?? null) : null,
    arPath:       tag === "ar" ? (attrs.ppth ?? null) : null,
    arCancelled:  tag === "ar" ? attrs.cs === "c" : false,
  } as ReturnType<typeof parseEvent>;
  void prefix;
}

export function parseTimetable(xml: string): TrainStop[] {
  const stops: TrainStop[] = [];
  // Each <s> element is a timetableStop
  const stopRe = /<s\s([^>]*)>([\s\S]*?)<\/s>/g;
  let sm: RegExpExecArray | null;
  while ((sm = stopRe.exec(xml)) !== null) {
    const stopAttrs: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(sm[1])) !== null) stopAttrs[a[1]] = a[2];

    const inner = sm[2];
    const tl = parseAttrs(inner, "tl")[0] ?? {};

    const dpAttrs = parseAttrs(inner, "dp")[0] ?? {};
    const arAttrs = parseAttrs(inner, "ar")[0] ?? {};

    stops.push({
      id: stopAttrs.id ?? "",
      category: tl.c ?? "",
      number: tl.n ?? "",
      line: tl.l ?? tl.n ?? "",
      dpTime:       dpAttrs.pt ?? null,
      dpTimeCh:     dpAttrs.ct ?? null,
      dpPlatform:   dpAttrs.pp ?? null,
      dpPlatformCh: dpAttrs.cp ?? null,
      dpPath:       dpAttrs.ppth ?? null,
      dpCancelled:  dpAttrs.cs === "c",
      arTime:       arAttrs.pt ?? null,
      arTimeCh:     arAttrs.ct ?? null,
      arPlatform:   arAttrs.pp ?? null,
      arPlatformCh: arAttrs.cp ?? null,
      arPath:       arAttrs.ppth ?? null,
      arCancelled:  arAttrs.cs === "c",
    });
  }
  return stops;
}

/** Merge full-changes XML into an existing stop list (mutates). */
export function mergeChanges(stops: TrainStop[], fchgXml: string): TrainStop[] {
  const changeMap = new Map<string, TrainStop>();
  for (const s of parseTimetable(fchgXml)) changeMap.set(s.id, s);

  return stops.map((stop) => {
    const ch = changeMap.get(stop.id);
    if (!ch) return stop;
    return {
      ...stop,
      dpTimeCh:     ch.dpTimeCh     ?? stop.dpTimeCh,
      dpPlatformCh: ch.dpPlatformCh ?? stop.dpPlatformCh,
      dpCancelled:  ch.dpCancelled  || stop.dpCancelled,
      arTimeCh:     ch.arTimeCh     ?? stop.arTimeCh,
      arPlatformCh: ch.arPlatformCh ?? stop.arPlatformCh,
      arCancelled:  ch.arCancelled  || stop.arCancelled,
    };
  });
}

/** "YYMMddHHmm" → "HH:mm" display string */
export function fmtTime(t: string | null): string {
  if (!t || t.length < 10) return "—";
  return `${t.slice(6, 8)}:${t.slice(8, 10)}`;
}
