"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import type { LayerId } from "@/components/Map";
import RoutePanel from "@/components/RoutePanel";
import InsightsPanel from "@/components/InsightsPanel";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type LayerDef = {
  id: LayerId;
  label: string;
  color: string;
  symbol: "line" | "dashed-line" | "circle" | "polygon" | "heatmap" | "blue-heatmap" | "choropleth";
  note?: string;
};

const LAYERS: LayerDef[] = [
  { id: "live-trains",       label: "Live-Züge",          color: "#22c55e",  symbol: "circle",       note: "60s" },
  { id: "weather-temp",      label: "Temperatur",         color: "#34d399",  symbol: "circle",       note: "BrightSky" },
  { id: "weather-cloud",     label: "Bewölkung",          color: "#7dd3fc",  symbol: "blue-heatmap", note: "BrightSky" },
  { id: "weather-rain",      label: "Niederschlag",       color: "#3b82f6",  symbol: "blue-heatmap", note: "BrightSky" },
  { id: "pegel",             label: "Pegelstände",        color: "#38bdf8",  symbol: "circle",       note: "WSV · 15min" },
  { id: "regional-bip",      label: "BIP / Kopf",         color: "#facc15",  symbol: "choropleth",   note: "2022" },
  { id: "regional-alo",      label: "Arbeitslosigkeit",   color: "#ef4444",  symbol: "choropleth",   note: "2024" },
  { id: "population",        label: "Bevölkerung",        color: "#ef4444",  symbol: "heatmap" },
  { id: "streckennetz",      label: "Streckennetz",       color: "#60a5fa",  symbol: "line",         note: "v-codiert" },
  { id: "eisenbahnbruecken", label: "Eisenbahnbrücken",   color: "#f59e0b",  symbol: "line" },
  { id: "tunnel",            label: "Tunnel",              color: "#a78bfa",  symbol: "dashed-line" },
  { id: "betriebsstellen",   label: "Betriebsstellen",    color: "#3b82f6",  symbol: "circle",       note: "z≥7" },
  { id: "bahnuebergaenge",   label: "Bahnübergänge",      color: "#f97316",  symbol: "circle",       note: "z≥9" },
  { id: "oe-grenzen",        label: "OE-Grenzen",         color: "#6366f1",  symbol: "polygon" },
];

const SPEED_LEGEND = [
  { label: "Nicht elektrifiziert", color: "#475569" },
  { label: "Stromschiene",         color: "#fb923c" },
  { label: "≤ 60 km/h",           color: "#60a5fa" },
  { label: "≤ 120 km/h",          color: "#34d399" },
  { label: "≤ 160 km/h",          color: "#facc15" },
  { label: "≤ 200 km/h",          color: "#f97316" },
  { label: "> 200 km/h",          color: "#ef4444" },
];

function LayerSymbol({ def }: { def: LayerDef }) {
  const s = def.symbol;
  if (s === "choropleth") return (
    <svg width={20} height={8} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`cgrad-${def.id}`} x1="0" x2="1" y1="0" y2="0">
          {def.id === "regional-bip" ? <>
            <stop offset="0%"   stopColor="#1e3a8a" />
            <stop offset="50%"  stopColor="#facc15" />
            <stop offset="100%" stopColor="#ef4444" />
          </> : <>
            <stop offset="0%"   stopColor="#14532d" />
            <stop offset="50%"  stopColor="#facc15" />
            <stop offset="100%" stopColor="#ef4444" />
          </>}
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={20} height={8} fill={`url(#cgrad-${def.id})`} />
    </svg>
  );
  if (s === "blue-heatmap") return (
    <svg width={20} height={6} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`bg-${def.id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
          <stop offset="40%"  stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={20} height={6} fill={`url(#bg-${def.id})`} />
    </svg>
  );
  if (s === "heatmap") return (
    <svg width={20} height={6} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="popgrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="#1e3a8a" />
          <stop offset="50%"  stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={20} height={6} fill="url(#popgrad)" />
    </svg>
  );
  if (s === "circle") return (
    <span style={{
      display: "inline-block", width: 6, height: 6, borderRadius: "50%",
      background: def.color, flexShrink: 0,
    }} />
  );
  if (s === "polygon") return (
    <span style={{
      display: "inline-block", width: 12, height: 8,
      background: def.color + "22", border: `1px solid ${def.color}80`, flexShrink: 0,
    }} />
  );
  if (s === "dashed-line") return (
    <svg width={20} height={6} style={{ flexShrink: 0 }}>
      <line x1={0} y1={3} x2={20} y2={3} stroke={def.color} strokeWidth={1.5} strokeDasharray="4 3" />
    </svg>
  );
  return (
    <svg width={20} height={6} style={{ flexShrink: 0 }}>
      <line x1={0} y1={3} x2={20} y2={3} stroke={def.color} strokeWidth={1.5} />
    </svg>
  );
}

export default function Page() {
  const [visible, setVisible] = useState<Set<LayerId>>(new Set(["streckennetz"]));
  const [speedOpen, setSpeedOpen] = useState(false);
  const [highlightStreckennummern, setHighlightStreckennummern] = useState<string[]>([]);

  function toggle(id: LayerId) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const onRouteExpand = useCallback(async (evas: string[]) => {
    if (!evas.length) { setHighlightStreckennummern([]); return; }
    try {
      const res = await fetch(`/api/db/segments?evas=${evas.join(",")}`);
      const data = await res.json();
      setHighlightStreckennummern(data.streckennummern ?? []);
    } catch { setHighlightStreckennummern([]); }
  }, []);

  return (
    <main style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <Map visibleLayers={visible} highlightStreckennummern={highlightStreckennummern} />

      {/* Layer control panel */}
      <div style={{
        position: "absolute", top: 16, left: 16, zIndex: 10,
        background: "rgba(6,10,18,0.96)",
        border: "1px solid #1e2d3d",
        borderTop: "2px solid #334155",
        padding: "0",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
        fontSize: 11,
        minWidth: 220,
        userSelect: "none",
      }}>
        {/* Header */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e2d3d" }}>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            M1 · Streckennetz
          </div>
          <div style={{ color: "#334155", fontSize: 10, marginTop: 2, letterSpacing: "0.04em" }}>
            DB Infrastruktur · Deutschland
          </div>
        </div>

        {/* Layer list */}
        <div style={{ padding: "8px 0" }}>
          <div style={{ padding: "4px 14px 6px", color: "#334155", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Ebenen
          </div>

          {LAYERS.map((def) => {
            const on = visible.has(def.id);
            return (
              <label key={def.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "4px 14px", cursor: "pointer",
                background: on ? "rgba(255,255,255,0.03)" : "transparent",
                borderLeft: `2px solid ${on ? def.color : "transparent"}`,
                transition: "background 0.1s, border-color 0.1s",
              }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
              >
                <LayerSymbol def={def} />
                <span style={{ flex: 1, color: on ? "#cbd5e1" : "#475569", fontSize: 11, transition: "color 0.1s" }}>
                  {def.label}
                </span>
                {def.note && (
                  <span style={{ color: "#1e3a5f", fontSize: 9, letterSpacing: "0.04em" }}>{def.note}</span>
                )}
                <input type="checkbox" checked={on} onChange={() => toggle(def.id)} style={{ display: "none" }} />
              </label>
            );
          })}
        </div>

        {/* Delay legend */}
        {visible.has("live-trains") && (
          <div style={{ borderTop: "1px solid #1e2d3d", padding: "8px 14px" }}>
            <div style={{ color: "#334155", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              Verspätung
            </div>
            {[
              { label: "Pünktlich",   color: "#22c55e" },
              { label: "1–5 min",     color: "#facc15" },
              { label: "5–15 min",    color: "#f97316" },
              { label: ">15 min",     color: "#ef4444" },
              { label: "Ausfall",     color: "#7c3aed" },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ color: "#475569", fontSize: 10 }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pegel legend */}
        {visible.has("pegel") && (
          <div style={{ borderTop: "1px solid #1e2d3d", padding: "8px 14px" }}>
            <div style={{ color: "#334155", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              Pegelstand
            </div>
            {[
              { label: "Niedrig",    color: "#94a3b8" },
              { label: "Normal",     color: "#38bdf8" },
              { label: "Erhöht",     color: "#f97316" },
              { label: "Hochwasser", color: "#ef4444" },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ color: "#475569", fontSize: 10 }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Regional legend */}
        {(visible.has("regional-bip") || visible.has("regional-alo")) && (
          <div style={{ borderTop: "1px solid #1e2d3d", padding: "8px 14px" }}>
            <div style={{ color: "#334155", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              {visible.has("regional-alo") ? "Arbeitslosigkeit" : "BIP / Kopf"}
            </div>
            <svg width={170} height={8} style={{ display: "block", marginBottom: 4 }}>
              <defs>
                <linearGradient id="reglegend" x1="0" x2="1" y1="0" y2="0">
                  {visible.has("regional-alo") ? <>
                    <stop offset="0%"   stopColor="#14532d" />
                    <stop offset="50%"  stopColor="#facc15" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </> : <>
                    <stop offset="0%"   stopColor="#1e3a8a" />
                    <stop offset="50%"  stopColor="#facc15" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </>}
                </linearGradient>
              </defs>
              <rect x={0} y={0} width={170} height={8} fill="url(#reglegend)" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#334155", fontSize: 9 }}>
              {visible.has("regional-alo")
                ? <><span>2 %</span><span>6 %</span><span>15 %</span></>
                : <><span>20k €</span><span>60k €</span><span>110k €</span></>
              }
            </div>
          </div>
        )}

        {/* Speed legend */}
        {visible.has("streckennetz") && (
          <div style={{ borderTop: "1px solid #1e2d3d" }}>
            <button
              onClick={() => setSpeedOpen((v) => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                width: "100%", padding: "8px 14px",
                display: "flex", alignItems: "center",
                color: "#334155", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
                fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
              }}
            >
              <span style={{ flex: 1, textAlign: "left" }}>Geschwindigkeit</span>
              <span style={{ fontSize: 8, opacity: 0.6 }}>{speedOpen ? "▲" : "▼"}</span>
            </button>
            {speedOpen && (
              <div style={{ padding: "0 14px 10px" }}>
                {SPEED_LEGEND.map(({ label, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <svg width={16} height={3} style={{ flexShrink: 0 }}>
                      <rect x={0} y={0} width={16} height={3} fill={color} />
                    </svg>
                    <span style={{ color: "#475569", fontSize: 10 }}>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        <div style={{ borderTop: "1px solid #1e2d3d", padding: "6px 14px", color: "#1e2d3d", fontSize: 9, letterSpacing: "0.06em" }}>
          CLICK OBJECT FOR DETAILS
        </div>
      </div>

      <RoutePanel onHighlight={onRouteExpand} />
      <InsightsPanel />
    </main>
  );
}
