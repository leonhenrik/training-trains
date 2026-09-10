"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { TrainStop } from "@/lib/dbApi";
import { fmtTime } from "@/lib/dbApi";

interface Station { eva: string; name: string; ds100: string }

const CATEGORY_COLOR: Record<string, string> = {
  ICE: "#ef4444", IC: "#f97316", EC: "#f97316",
  RE: "#3b82f6", RB: "#60a5fa", S: "#22c55e",
  U: "#a855f7", TGV: "#ef4444",
};
function catColor(cat: string) {
  return CATEGORY_COLOR[cat] ?? "#94a3b8";
}

function lastStation(path: string | null): string {
  if (!path) return "—";
  const parts = path.split("|");
  return parts[parts.length - 1] ?? "—";
}

function firstStation(path: string | null): string {
  if (!path) return "—";
  return path.split("|")[0] ?? "—";
}

function delayMinutes(planned: string | null, actual: string | null): number | null {
  if (!planned || !actual || planned.length < 10 || actual.length < 10) return null;
  const toMin = (t: string) =>
    parseInt(t.slice(6, 8)) * 60 + parseInt(t.slice(8, 10));
  return toMin(actual) - toMin(planned);
}

function DelayBadge({ planned, actual, cancelled }: { planned: string | null; actual: string | null; cancelled: boolean }) {
  if (cancelled) return <span style={{ color: "#ef4444", fontWeight: 600, fontSize: 11 }}>Ausfall</span>;
  const d = delayMinutes(planned, actual);
  if (d === null) return null;
  if (d <= 0) return <span style={{ color: "#22c55e", fontSize: 11 }}>pünktlich</span>;
  return <span style={{ color: d > 5 ? "#ef4444" : "#f97316", fontWeight: 600, fontSize: 11 }}>+{d} min</span>;
}

export default function TimetablePanel() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);
  const [stops, setStops] = useState<TrainStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"dep" | "arr">("dep");
  const [open, setOpen] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Station search with debounce
  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/db/station?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch { setSuggestions([]); }
    }, 300);
  }, [query]);

  const loadTimetable = useCallback(async (station: Station) => {
    setSelected(station);
    setSuggestions([]);
    setQuery(station.name);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/db/timetable?eva=${station.eva}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStops(data.stops ?? []);
    } catch (e) {
      setError(String(e));
      setStops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const displayedStops = stops.filter((s) =>
    mode === "dep" ? s.dpTime !== null : s.arTime !== null
  );

  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16, zIndex: 10,
      width: 360,
      background: "rgba(15,23,42,0.94)", backdropFilter: "blur(12px)",
      border: "1px solid #1e293b", borderRadius: 12,
      fontFamily: "system-ui, sans-serif", fontSize: 12,
      display: "flex", flexDirection: "column",
      maxHeight: "calc(100vh - 48px)",
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
          cursor: "pointer", borderBottom: open ? "1px solid #1e293b" : "none",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 13, flexGrow: 1 }}>
          Fahrplan
        </span>
        {selected && (
          <span style={{ color: "#64748b", fontSize: 11 }}>{selected.ds100}</span>
        )}
        <span style={{ color: "#475569", fontSize: 10 }}>{open ? "▼" : "▲"}</span>
      </div>

      {open && (
        <>
          {/* Search */}
          <div style={{ padding: "10px 14px 0", flexShrink: 0, position: "relative" }}>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Bahnhof suchen…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0f172a", border: "1px solid #334155",
                borderRadius: 6, padding: "7px 10px", color: "#e2e8f0",
                fontSize: 12, outline: "none",
              }}
            />
            {suggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 14, right: 14, zIndex: 20,
                background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6,
                marginTop: 3, overflow: "hidden",
              }}>
                {suggestions.map((s) => (
                  <div
                    key={s.eva}
                    onClick={() => loadTimetable(s)}
                    style={{
                      padding: "8px 10px", cursor: "pointer", color: "#cbd5e1",
                      borderBottom: "1px solid #1e293b",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#1e293b")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ color: "#f1f5f9" }}>{s.name}</span>
                    <span style={{ color: "#475569", marginLeft: 6 }}>{s.ds100}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dep / Arr toggle */}
          {selected && (
            <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", flexShrink: 0 }}>
              {(["dep", "arr"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: "5px 0", borderRadius: 5, fontSize: 11,
                    fontWeight: 600, cursor: "pointer", border: "none",
                    background: mode === m ? "#1e40af" : "#1e293b",
                    color: mode === m ? "#fff" : "#64748b",
                  }}
                >
                  {m === "dep" ? "Abfahrt" : "Ankunft"}
                </button>
              ))}
            </div>
          )}

          {/* Board */}
          <div style={{ overflowY: "auto", flexGrow: 1, padding: "10px 0 12px" }}>
            {loading && (
              <div style={{ color: "#475569", textAlign: "center", padding: "20px 0" }}>Laden…</div>
            )}
            {error && (
              <div style={{ color: "#ef4444", padding: "8px 14px", fontSize: 11 }}>{error}</div>
            )}
            {!loading && !error && selected && displayedStops.length === 0 && (
              <div style={{ color: "#475569", textAlign: "center", padding: "20px 0" }}>Keine Züge</div>
            )}
            {!loading && !selected && (
              <div style={{ color: "#334155", textAlign: "center", padding: "20px 0" }}>Bahnhof eingeben</div>
            )}
            {displayedStops.map((s) => {
              const isDep = mode === "dep";
              const planned  = isDep ? s.dpTime : s.arTime;
              const changed  = isDep ? s.dpTimeCh : s.arTimeCh;
              const platform = isDep ? (s.dpPlatformCh ?? s.dpPlatform) : (s.arPlatformCh ?? s.arPlatform);
              const cancelled = isDep ? s.dpCancelled : s.arCancelled;
              const dest = isDep ? lastStation(s.dpPath) : firstStation(s.arPath);
              const effective = changed ?? planned;

              return (
                <div
                  key={s.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1fr auto",
                    alignItems: "center",
                    gap: "0 8px",
                    padding: "7px 14px",
                    borderBottom: "1px solid #0f172a",
                    opacity: cancelled ? 0.5 : 1,
                  }}
                >
                  {/* Train badge */}
                  <span style={{
                    background: catColor(s.category),
                    color: "#fff", fontWeight: 700, fontSize: 10,
                    borderRadius: 4, padding: "2px 4px",
                    textAlign: "center", letterSpacing: "0.03em",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {s.category} {s.line || s.number}
                  </span>

                  {/* Destination + delay */}
                  <div>
                    <div style={{ color: "#e2e8f0", fontWeight: 500 }}>{dest}</div>
                    <div style={{ marginTop: 1 }}>
                      <DelayBadge planned={planned} actual={changed} cancelled={cancelled} />
                    </div>
                  </div>

                  {/* Time + platform */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      color: changed && !cancelled ? "#f97316" : "#f1f5f9",
                      fontWeight: 600, fontSize: 13,
                      textDecoration: cancelled ? "line-through" : "none",
                    }}>
                      {fmtTime(effective)}
                    </div>
                    {planned && changed && !cancelled && (
                      <div style={{ color: "#475569", fontSize: 10, textDecoration: "line-through" }}>
                        {fmtTime(planned)}
                      </div>
                    )}
                    {platform && (
                      <div style={{ color: "#64748b", fontSize: 10 }}>Gl. {platform}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
