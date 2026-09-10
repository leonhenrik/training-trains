"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Station { eva: string; name: string; ds100: string; }

interface Leg {
  trainId: string; category: string; number: string; line: string;
  fromEva: string; fromName: string; toEva: string; toName: string;
  depPlanned: string; depActual: string; arrPlanned: string; arrActual: string;
  depPlatform: string; cancelled: boolean;
}

interface Itinerary {
  legs: Leg[]; totalMin: number; transfers: number; depTime: string; arrTime: string;
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const MONO = "'JetBrains Mono','Fira Mono','Consolas',monospace";

const BG      = "rgba(6,10,18,0.98)";
const BORDER  = "#1e2d3d";
const TEXT    = "#cbd5e1";
const DIM     = "#334155";
const DIMMER  = "#1e2d3d";
const ACCENT  = "#38bdf8";

const BASE: React.CSSProperties = {
  fontFamily: MONO, fontSize: 11, color: TEXT,
};

const LABEL: React.CSSProperties = {
  color: DIM, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
  marginBottom: 5,
};

const INPUT: React.CSSProperties = {
  width: "100%", background: "#080e1a", border: `1px solid ${BORDER}`,
  borderTop: `1px solid #243347`,
  color: TEXT, fontSize: 11, padding: "7px 10px",
  outline: "none", boxSizing: "border-box",
  fontFamily: MONO,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryColor(cat: string): string {
  if (cat.startsWith("ICE") || cat === "TGV") return "#ef4444";
  if (cat.startsWith("IC") || cat.startsWith("EC")) return "#f97316";
  if (cat.startsWith("RE")) return "#3b82f6";
  if (cat.startsWith("RB")) return "#22d3ee";
  if (cat.startsWith("S")) return "#22c55e";
  return "#475569";
}

function Badge({ cat, line }: { cat: string; line: string }) {
  const color = categoryColor(cat);
  return (
    <span style={{
      background: color + "18", color, fontSize: 9, fontWeight: 700,
      border: `1px solid ${color}40`,
      padding: "1px 5px", letterSpacing: "0.06em", fontFamily: MONO, flexShrink: 0,
    }}>{cat} {line}</span>
  );
}

function durStr(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function TimeCell({ planned, actual }: { planned: string; actual: string }) {
  const delayed = planned && actual && actual !== planned;
  return (
    <span style={{ fontFamily: MONO, fontSize: 11 }}>
      {delayed && <span style={{ color: DIM, marginRight: 5, textDecoration: "line-through", fontSize: 10 }}>{planned}</span>}
      <span style={{ color: delayed ? "#f97316" : TEXT, fontWeight: 700 }}>{actual || planned}</span>
    </span>
  );
}

// ── Station input ─────────────────────────────────────────────────────────────

function StationInput({ label, value, onSelect, placeholder }: {
  label: string; value: Station | null; onSelect: (s: Station) => void; placeholder: string;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [suggestions, setSuggestions] = useState<Station[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value?.name ?? ""); }, [value]);

  function search(q: string) {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/db/station?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data.slice(0, 8) : []);
        setOpen(true);
      } catch { setSuggestions([]); }
    }, 300);
  }

  function pick(s: Station) {
    onSelect(s); setQuery(s.name); setSuggestions([]); setOpen(false);
  }

  useEffect(() => {
    function h(e: MouseEvent) { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <div style={LABEL}>{label}</div>
      <input
        style={INPUT} value={query} placeholder={placeholder}
        onChange={(e) => search(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
          background: "#080e1a", border: `1px solid ${BORDER}`, marginTop: 1,
          maxHeight: 200, overflowY: "auto",
        }}>
          {suggestions.map((s) => (
            <div
              key={s.eva}
              onMouseDown={() => pick(s)}
              style={{ padding: "7px 10px", cursor: "pointer", borderBottom: `1px solid ${DIMMER}`, display: "flex", alignItems: "baseline", gap: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#0f1a27")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: TEXT, fontSize: 11, fontFamily: MONO, flex: 1 }}>{s.name}</span>
              <span style={{ color: DIMMER, fontSize: 9, fontFamily: MONO }}>{s.ds100}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Itinerary card ────────────────────────────────────────────────────────────

function ItineraryCard({ itin, expanded, highlighted, onExpand }: {
  itin: Itinerary; expanded: boolean; highlighted: boolean; onExpand: () => void;
}) {
  return (
    <div
      onClick={onExpand}
      style={{
        borderLeft: `2px solid ${highlighted ? ACCENT : expanded ? DIM : DIMMER}`,
        background: highlighted ? "rgba(56,189,248,0.04)" : expanded ? "rgba(255,255,255,0.02)" : "transparent",
        marginBottom: 1, cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s",
      }}
      onMouseEnter={(e) => { if (!highlighted && !expanded) e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
      onMouseLeave={(e) => { if (!highlighted && !expanded) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Summary row */}
      <div style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 13, fontFamily: MONO, letterSpacing: "0.02em" }}>
          {itin.depTime}
        </span>
        <span style={{ color: DIMMER, fontSize: 10 }}>→</span>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 13, fontFamily: MONO, letterSpacing: "0.02em" }}>
          {itin.arrTime}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: DIM, fontSize: 10, fontFamily: MONO }}>{durStr(itin.totalMin)}</span>
        <span style={{
          fontSize: 9, padding: "1px 5px", letterSpacing: "0.06em",
          border: `1px solid ${itin.transfers === 0 ? "#166534" : DIMMER}`,
          color: itin.transfers === 0 ? "#22c55e" : DIM,
          fontFamily: MONO,
        }}>
          {itin.transfers === 0 ? "DIREKT" : `${itin.transfers}× UMT`}
        </span>
        <span style={{ color: DIMMER, fontSize: 8 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Train badges — collapsed */}
      {!expanded && (
        <div style={{ paddingBottom: 9, paddingLeft: 14, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {itin.legs.map((leg, i) => <Badge key={i} cat={leg.category} line={leg.line} />)}
        </div>
      )}

      {/* Legs — expanded */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${DIMMER}` }}>
          {itin.legs.map((leg, i) => (
            <div key={i} style={{
              padding: "10px 14px",
              borderBottom: i < itin.legs.length - 1 ? `1px solid ${DIMMER}` : undefined,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Badge cat={leg.category} line={leg.line} />
                <span style={{ color: DIM, fontSize: 10, flex: 1 }}>→ {leg.toName}</span>
                {leg.depPlatform && (
                  <span style={{ color: DIMMER, fontSize: 9, fontFamily: MONO }}>GL {leg.depPlatform}</span>
                )}
              </div>

              {/* From */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 5, height: 5, background: "#22c55e", flexShrink: 0 }} />
                <span style={{ color: TEXT, flex: 1, fontSize: 11 }}>{leg.fromName}</span>
                <TimeCell planned={leg.depPlanned} actual={leg.depActual} />
              </div>

              <div style={{ marginLeft: 2, borderLeft: `1px solid ${DIMMER}`, height: 12, marginBottom: 4 }} />

              {/* To */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 5, height: 5, background: ACCENT, flexShrink: 0 }} />
                <span style={{ color: TEXT, flex: 1, fontSize: 11 }}>{leg.toName}</span>
                {leg.arrActual && <TimeCell planned={leg.arrPlanned} actual={leg.arrActual} />}
              </div>

              {leg.cancelled && (
                <div style={{ marginTop: 8, padding: "3px 8px", background: "#1a0505", border: "1px solid #450a0a", color: "#ef4444", fontSize: 10, fontFamily: MONO, letterSpacing: "0.06em" }}>
                  ZUG AUSGEFALLEN
                </div>
              )}

              {i < itin.legs.length - 1 && (
                <div style={{ marginTop: 8, padding: "4px 8px", background: "#0a1220", border: `1px solid ${DIMMER}`, color: DIM, fontSize: 10, fontFamily: MONO }}>
                  ⇄ Umstieg · {leg.toName}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RoutePanel({ onHighlight }: { onHighlight?: (evas: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [departTime, setDepartTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const [minTransfer, setMinTransfer] = useState(5);
  const [loading, setLoading] = useState(false);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);

  const search = useCallback(async () => {
    if (!from || !to) { setError("Start und Ziel wählen."); return; }
    setLoading(true); setError(null); setItineraries([]); setExpanded(null); setHighlighted(null);
    onHighlight?.([]);
    try {
      const depart = departTime.replace(":", "");
      const url = `/api/db/route?from=${from.eva}&to=${to.eva}&fromName=${encodeURIComponent(from.name)}&toName=${encodeURIComponent(to.name)}&depart=${depart}&minTransfer=${minTransfer}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      if (!data.itineraries?.length) { setError("Keine Verbindung gefunden."); return; }
      setItineraries(data.itineraries);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, departTime, minTransfer, onHighlight]);

  function swap() {
    const tmp = from; setFrom(to); setTo(tmp);
    setItineraries([]); setExpanded(null); setHighlighted(null); onHighlight?.([]);
  }

  function handleCardClick(idx: number, itin: Itinerary) {
    const next = highlighted === idx ? null : idx;
    setExpanded(expanded === idx ? null : idx);
    setHighlighted(next);
    if (next !== null) {
      const evas = [...new Set(itin.legs.flatMap((l) => [l.fromEva, l.toEva]))];
      onHighlight?.(evas);
    } else {
      onHighlight?.([]);
    }
  }

  useEffect(() => {
    if (!open) return;
    function h(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 20, right: open ? 436 : 20, zIndex: 22,
          background: open ? "#0f1a27" : "#0f1a27",
          border: `1px solid ${open ? ACCENT : BORDER}`,
          borderTop: `2px solid ${open ? ACCENT : DIM}`,
          color: open ? ACCENT : DIM,
          fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em",
          padding: "8px 16px", cursor: "pointer",
          transition: "right 0.28s cubic-bezier(0.4,0,0.2,1), border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = open ? ACCENT : BORDER;
          e.currentTarget.style.color = open ? ACCENT : DIM;
        }}
      >
        {open ? "SCHLIESSEN ✕" : "VERBINDUNGSSUCHE"}
      </button>

      {/* Drawer */}
      <div style={{
        ...BASE,
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 21,
        width: 420,
        background: BG,
        borderLeft: `1px solid ${BORDER}`,
        borderTop: `2px solid ${DIM}`,
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        willChange: "transform",
        pointerEvents: open ? "all" : "none",
      }}>
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Verbindungssuche
          </div>
          <div style={{ color: DIMMER, fontSize: 9, marginTop: 2, letterSpacing: "0.06em" }}>
            DB · Fahrplanauskunft
          </div>
        </div>

        {/* Search form */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <StationInput label="Von" value={from} onSelect={setFrom} placeholder="Startbahnhof…" />

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={swap}
                style={{
                  background: "none", border: `1px solid ${DIMMER}`, color: DIM,
                  padding: "3px 12px", cursor: "pointer", fontSize: 13, fontFamily: MONO,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = DIM; e.currentTarget.style.color = TEXT; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = DIMMER; e.currentTarget.style.color = DIM; }}
              >⇅</button>
            </div>

            <StationInput label="Nach" value={to} onSelect={setTo} placeholder="Zielbahnhof…" />

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={LABEL}>Abfahrt</div>
                <input
                  type="time" value={departTime}
                  onChange={(e) => setDepartTime(e.target.value)}
                  style={{ ...INPUT, colorScheme: "dark" }}
                />
              </div>
              <div style={{ width: 100 }}>
                <div style={LABEL}>Min. Umstieg</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" min={0} max={60} value={minTransfer}
                    onChange={(e) => setMinTransfer(Number(e.target.value))}
                    style={{ ...INPUT, width: 52, textAlign: "center" }}
                  />
                  <span style={{ color: DIMMER, fontSize: 10 }}>min</span>
                </div>
              </div>
            </div>

            <button
              onClick={search} disabled={loading}
              style={{
                background: loading ? "transparent" : "#0c1e33",
                border: `1px solid ${loading ? DIMMER : "#1e3a5f"}`,
                borderTop: `2px solid ${loading ? DIMMER : ACCENT}`,
                color: loading ? DIMMER : ACCENT,
                padding: "8px", fontWeight: 700, fontSize: 10,
                letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer",
                fontFamily: MONO, transition: "background 0.15s",
              }}
            >
              {loading ? "SUCHE LÄUFT…" : "VERBINDUNG SUCHEN"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {error && (
            <div style={{ margin: "12px 16px", padding: "7px 10px", background: "#1a0505", border: "1px solid #450a0a", color: "#ef4444", fontSize: 10, fontFamily: MONO }}>
              {error}
            </div>
          )}
          {loading && (
            <div style={{ color: DIMMER, fontSize: 10, textAlign: "center", padding: "40px 0", fontFamily: MONO, letterSpacing: "0.08em" }}>
              SUCHE LÄUFT…
            </div>
          )}
          {!loading && itineraries.length > 0 && (
            <>
              <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: DIMMER, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {itineraries.length} Verbindung{itineraries.length > 1 ? "en" : ""}
                </span>
                {highlighted !== null && (
                  <>
                    <span style={{ width: 1, height: 10, background: DIMMER, flexShrink: 0 }} />
                    <span style={{ color: ACCENT, fontSize: 9, letterSpacing: "0.06em" }}>
                      Strecke aktiv
                    </span>
                  </>
                )}
              </div>
              {itineraries.map((itin, i) => (
                <ItineraryCard
                  key={i} itin={itin}
                  expanded={expanded === i} highlighted={highlighted === i}
                  onExpand={() => handleCardClick(i, itin)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${DIMMER}`, padding: "6px 16px", color: DIMMER, fontSize: 9, letterSpacing: "0.08em", flexShrink: 0 }}>
          CLICK CONNECTION TO HIGHLIGHT ROUTE
        </div>
      </div>
    </>
  );
}
