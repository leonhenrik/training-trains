"use client";

import { useState, useEffect, useCallback } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO   = "'JetBrains Mono','Fira Mono','Consolas',monospace";
const BG     = "rgba(6,10,18,0.98)";
const BORDER = "#1e2d3d";
const TEXT   = "#cbd5e1";
const DIM    = "#334155";
const DIMMER = "#1e2d3d";
const ACCENT = "#38bdf8";

const BASE: React.CSSProperties = { fontFamily: MONO, fontSize: 11, color: TEXT };

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeatherFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    station: string | null;
    temperature: number | null;
    precipitation: number | null;
    cloud_cover: number | null;
    wind_speed: number | null;
    wind_gust: number | null;
    visibility: number | null;
    condition: string | null;
  };
}

interface PegelFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name: string; longname: string;
    river: string | null;
    value: number;
    alertLevel: string;
  };
}

interface RegionalFeature {
  properties: {
    name: string; ags: string;
    bipPerCapita: number | null;
    unemployment: number | null;
  };
}

interface InsightsData {
  weather: WeatherFeature[];
  pegel: PegelFeature[];
  regional: RegionalFeature[];
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{
      color: DIM, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
      padding: "12px 16px 5px", borderBottom: `1px solid ${DIMMER}`,
      display: "flex", alignItems: "baseline", gap: 8,
    }}>
      {title}
      {sub && <span style={{ color: DIMMER, fontSize: 8 }}>{sub}</span>}
    </div>
  );
}

function InsightRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: "5px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
      <span style={{ color: DIM, fontSize: 10, lineHeight: 1.4, flex: 1 }}>{label}</span>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ color: color ?? TEXT, fontSize: 11, fontFamily: MONO, fontWeight: color ? 700 : 400 }}>{value}</div>
        {sub && <div style={{ color: DIMMER, fontSize: 9 }}>{sub}</div>}
      </div>
    </div>
  );
}

function RiskBadge({ label, color, detail }: { label: string; color: string; detail: string }) {
  return (
    <div style={{
      flex: 1, padding: "10px 12px",
      border: `1px solid ${color}33`,
      borderTop: `2px solid ${color}`,
      background: `${color}08`,
    }}>
      <div style={{ color: color, fontSize: 15, fontWeight: 700, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ color: DIMMER, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>{detail}</div>
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ flex: 1, height: 3, background: DIMMER, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: color }} />
    </div>
  );
}

// Key rail rivers that trains commonly cross/parallel — used for flood impact assessment
const RAIL_RIVERS = new Set([
  "RHEIN", "MAIN", "MOSEL", "WESER", "ELBE", "ODER", "DONAU", "ISAR", "INN",
  "NECKAR", "RUHR", "LAHN", "SAAR", "FULDA", "WERRA", "SAALE", "MULDE",
  "SPREE", "HAVEL", "EMS", "NAHE", "AHR", "DREISAM",
]);

function isRailRiver(river: string | null): boolean {
  if (!river) return false;
  return RAIL_RIVERS.has(river.toUpperCase().split(" ")[0]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function InsightsPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, pRes, rRes] = await Promise.all([
        fetch("/api/weather"),
        fetch("/api/pegel"),
        fetch("/api/regional"),
      ]);
      const [wJson, pJson, rJson] = await Promise.all([wRes.json(), pRes.json(), rRes.json()]);
      setData({
        weather: wJson.features ?? [],
        pegel: pJson.features ?? [],
        regional: rJson.features ?? [],
      });
      setLastFetch(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  // ── Analytics ────────────────────────────────────────────────────────────────

  const wx  = data?.weather  ?? [];
  const pg  = data?.pegel    ?? [];
  const reg = data?.regional ?? [];

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  // — Weather: impact on rail operations —
  const gusts   = wx.map((f) => f.properties.wind_gust).filter((v): v is number => v !== null);
  const winds   = wx.map((f) => f.properties.wind_speed).filter((v): v is number => v !== null);
  const temps   = wx.map((f) => f.properties.temperature).filter((v): v is number => v !== null);
  const precips = wx.map((f) => f.properties.precipitation).filter((v): v is number => v !== null);
  const visib   = wx.map((f) => f.properties.visibility).filter((v): v is number => v !== null);

  const maxGust    = gusts.length  ? Math.max(...gusts)  : null;
  const maxWind    = winds.length  ? Math.max(...winds)  : null;
  const avgTemp    = avg(temps);
  const belowFreeze = temps.filter((t) => t <= 0).length;
  const rainyCount  = precips.filter((v) => v > 0).length;
  const heavyRain   = precips.filter((v) => v > 1).length;
  const fogCount    = visib.filter((v) => v < 1000).length;

  // Gust thresholds: DB typically limits/cancels above ~90 km/h for ICE, ~100 km/h general
  const gustRisk = maxGust !== null
    ? maxGust > 90  ? { label: "STURM — SPERRUNGEN MÖGLICH",   color: "#ef4444", detail: `Max. Böe ${maxGust.toFixed(0)} km/h — Grenzwert für ICE-Betrieb überschritten` }
    : maxGust > 60  ? { label: "STARKER WIND — EINSCHRÄNKUNGEN", color: "#f97316", detail: `Max. Böe ${maxGust.toFixed(0)} km/h — Langsamfahrstellen für Hochgeschwindigkeit` }
    : maxGust > 40  ? { label: "BÖIG — BEOBACHTEN",             color: "#facc15", detail: `Max. Böe ${maxGust.toFixed(0)} km/h — ICE-Betrieb noch im Normalbereich` }
    : { label: "UNAUFFÄLLIG",                                    color: "#22c55e", detail: `Max. Böe ${maxGust.toFixed(0)} km/h — Kein Windrisiko` }
    : null;

  const iceRisk = avgTemp !== null && avgTemp <= 0
    ? { label: `${belowFreeze} Stationen unter 0°C`, color: "#38bdf8",
        detail: "Glatteis- und Weichenheizungsbetrieb nötig — erhöhter Energieverbrauch" }
    : avgTemp !== null && avgTemp <= 3
    ? { label: `Frostgefahr (Ø ${avgTemp.toFixed(1)}°C)`, color: "#7dd3fc",
        detail: "Nachtfrost möglich — präventive Weichenheizung aktiv" }
    : null;

  const rainRisk = heavyRain > 0
    ? { label: `${heavyRain} Stationen Starkregen`, color: "#3b82f6",
        detail: "Erdrutschgefahr an Steilstrecken, Aquaplaning an Schienen möglich" }
    : rainyCount > 5
    ? { label: `${rainyCount} Stationen Regen`, color: "#7dd3fc", detail: "Bremsweg verlängert — v-Reduktion auf nassen Strecken" }
    : null;

  // — Pegel: flood risk to rail infrastructure —
  const railFlood = pg.filter((f) => isRailRiver(f.properties.river) && (f.properties.alertLevel === "high" || f.properties.alertLevel === "very high"));
  const criticalFlood = pg.filter((f) => f.properties.alertLevel === "very high");

  // Group flooded rail rivers
  const floodByRiver: Record<string, { count: number; max: number; stations: string[] }> = {};
  for (const f of railFlood) {
    const r = f.properties.river ?? "Unbekannt";
    if (!floodByRiver[r]) floodByRiver[r] = { count: 0, max: 0, stations: [] };
    floodByRiver[r].count++;
    if (f.properties.value > floodByRiver[r].max) floodByRiver[r].max = f.properties.value;
    floodByRiver[r].stations.push(f.properties.longname ?? f.properties.name);
  }
  const floodedRailRivers = Object.entries(floodByRiver).sort((a, b) => b[1].count - a[1].count);

  const pegelAlertCounts = { low: 0, normal: 0, high: 0, "very high": 0 };
  for (const f of pg) {
    const l = f.properties.alertLevel as keyof typeof pegelAlertCounts;
    if (l in pegelAlertCounts) pegelAlertCounts[l]++;
  }

  // — Regional: economics vs rail investment context —
  const bipVals = reg.map((f) => f.properties.bipPerCapita).filter((v): v is number => v !== null);
  const aloVals = reg.map((f) => f.properties.unemployment).filter((v): v is number => v !== null);
  const avgBip = avg(bipVals);
  const avgAlo = avg(aloVals);

  // Kreise sorted by BIP
  const sorted = [...reg].filter((f) => f.properties.bipPerCapita !== null)
    .sort((a, b) => (b.properties.bipPerCapita ?? 0) - (a.properties.bipPerCapita ?? 0));

  // Economic disparity: high-BIP vs low-BIP Kreise
  // Low BIP + high unemployment → structurally weak areas that often lack rail connections
  const weakKreise = reg.filter((f) =>
    f.properties.bipPerCapita !== null && f.properties.unemployment !== null &&
    f.properties.bipPerCapita < (avgBip ?? 0) * 0.75 &&
    f.properties.unemployment > (avgAlo ?? 0) * 1.4
  );

  // Strong Kreise: high BIP + low unemployment (economic hubs — typically well-served by rail)
  const strongKreise = reg.filter((f) =>
    f.properties.bipPerCapita !== null && f.properties.unemployment !== null &&
    f.properties.bipPerCapita > (avgBip ?? 0) * 1.4 &&
    f.properties.unemployment < (avgAlo ?? 0) * 0.7
  );

  // Disparity index: ratio of top-10% to bottom-10% BIP
  const topDecile = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.1)));
  const botDecile = sorted.slice(-Math.max(1, Math.floor(sorted.length * 0.1)));
  const avgTopBip = avg(topDecile.map((f) => f.properties.bipPerCapita as number));
  const avgBotBip = avg(botDecile.map((f) => f.properties.bipPerCapita as number));
  const disparityRatio = avgTopBip && avgBotBip ? avgTopBip / avgBotBip : null;

  // — Combined status —
  const overallRisk = (() => {
    let score = 0;
    if (maxGust !== null && maxGust > 90) score += 3;
    else if (maxGust !== null && maxGust > 60) score += 2;
    else if (maxGust !== null && maxGust > 40) score += 1;
    if (heavyRain > 3) score += 2;
    else if (rainyCount > 8) score += 1;
    if (belowFreeze > 5) score += 2;
    else if (iceRisk) score += 1;
    if (criticalFlood.length > 5) score += 3;
    else if (railFlood.length > 3) score += 2;
    else if (railFlood.length > 0) score += 1;
    if (fogCount > 3) score += 1;
    return score;
  })();

  const overallColor = overallRisk >= 6 ? "#ef4444" : overallRisk >= 4 ? "#f97316" : overallRisk >= 2 ? "#facc15" : "#22c55e";
  const overallLabel = overallRisk >= 6 ? "KRITISCH" : overallRisk >= 4 ? "ERHÖHT" : overallRisk >= 2 ? "BEOBACHTEN" : "NORMAL";

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 60, right: open ? 436 : 20, zIndex: 22,
          background: "#0f1a27",
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
        {open ? "SCHLIESSEN ✕" : "NETZ-INSIGHTS"}
      </button>

      {/* Drawer */}
      <div style={{
        ...BASE,
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 20,
        width: 420, background: BG,
        borderLeft: `1px solid ${BORDER}`, borderTop: `2px solid ${DIM}`,
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        willChange: "transform", pointerEvents: open ? "all" : "none",
      }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Netz-Insights
            </div>
            <div style={{ color: DIMMER, fontSize: 9, marginTop: 2, letterSpacing: "0.06em" }}>
              {lastFetch ? `Stand: ${lastFetch.toLocaleTimeString("de-DE", { timeStyle: "short" })}` : "Auswirkungen auf den Bahnbetrieb"}
            </div>
          </div>
          <button
            onClick={load} disabled={loading}
            style={{
              background: "none", border: `1px solid ${DIMMER}`, color: loading ? DIMMER : DIM,
              fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em",
              padding: "4px 10px", cursor: loading ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = TEXT; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.color = DIM; }}
          >
            {loading ? "LADEN…" : "↺"}
          </button>
        </div>

        {/* Content */}
        {loading && !data ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: DIMMER, fontSize: 10, letterSpacing: "0.1em" }}>
            DATEN WERDEN GELADEN…
          </div>
        ) : data ? (
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* ── Betriebslage gesamt ────────────────────────────────── */}
            <SectionHeader title="Betriebslage" sub="Echtzeit-Einschätzung" />
            <div style={{ padding: "10px 16px 14px", display: "flex", gap: 8 }}>
              <RiskBadge
                label={overallLabel}
                color={overallColor}
                detail={`Risiko-Score ${overallRisk} · ${wx.length} Wetterstationen · ${pg.length} Pegel`}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, justifyContent: "center" }}>
                {[
                  { label: "Wind", active: maxGust !== null && maxGust > 40, color: "#facc15" },
                  { label: "Frost", active: iceRisk !== null, color: "#38bdf8" },
                  { label: "Regen", active: rainyCount > 3, color: "#3b82f6" },
                  { label: "Hochwasser", active: railFlood.length > 0, color: "#f97316" },
                  { label: "Nebel", active: fogCount > 1, color: "#94a3b8" },
                ].map(({ label, active, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 5, height: 5, background: active ? color : DIMMER, flexShrink: 0 }} />
                    <span style={{ color: active ? color : DIMMER, fontSize: 9, letterSpacing: "0.06em" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Wetter & Bahnbetrieb ───────────────────────────────── */}
            <SectionHeader title="Wetter & Bahnbetrieb" sub={`${wx.length} DWD-Stationen`} />

            {gustRisk && (
              <div style={{
                margin: "8px 16px 4px", padding: "8px 12px",
                border: `1px solid ${gustRisk.color}33`, borderLeft: `3px solid ${gustRisk.color}`,
                background: `${gustRisk.color}06`,
              }}>
                <div style={{ color: gustRisk.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 3 }}>
                  WIND — {gustRisk.label}
                </div>
                <div style={{ color: DIM, fontSize: 10, lineHeight: 1.5 }}>{gustRisk.detail}</div>
                {maxWind !== null && (
                  <div style={{ color: DIMMER, fontSize: 9, marginTop: 4 }}>
                    Ø Wind {maxWind.toFixed(0)} km/h · Max. Böe {maxGust?.toFixed(0)} km/h
                  </div>
                )}
              </div>
            )}

            {iceRisk && (
              <div style={{
                margin: "6px 16px 4px", padding: "8px 12px",
                border: `1px solid #38bdf833`, borderLeft: `3px solid #38bdf8`,
                background: "#38bdf806",
              }}>
                <div style={{ color: "#38bdf8", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 3 }}>
                  FROST — {iceRisk.label}
                </div>
                <div style={{ color: DIM, fontSize: 10, lineHeight: 1.5 }}>{iceRisk.detail}</div>
              </div>
            )}

            {rainRisk && (
              <div style={{
                margin: "6px 16px 4px", padding: "8px 12px",
                border: `1px solid #3b82f633`, borderLeft: `3px solid #3b82f6`,
                background: "#3b82f606",
              }}>
                <div style={{ color: "#7dd3fc", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 3 }}>
                  NIEDERSCHLAG — {rainRisk.label}
                </div>
                <div style={{ color: DIM, fontSize: 10, lineHeight: 1.5 }}>{rainRisk.detail}</div>
              </div>
            )}

            {fogCount > 0 && (
              <div style={{ margin: "6px 16px 4px", padding: "8px 12px", border: `1px solid ${DIMMER}`, borderLeft: `3px solid #94a3b8`, background: "#94a3b806" }}>
                <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 3 }}>
                  SICHT — {fogCount} Station{fogCount > 1 ? "en" : ""} unter 1km
                </div>
                <div style={{ color: DIM, fontSize: 10, lineHeight: 1.5 }}>
                  Eingeschränkte Streckensicht — Signalbeobachtung erschwert
                </div>
              </div>
            )}

            {!gustRisk && !iceRisk && !rainRisk && fogCount === 0 && (
              <div style={{ padding: "8px 16px", color: "#22c55e", fontSize: 10 }}>
                Keine wetterbedingten Einschränkungen erwartet.
              </div>
            )}

            {/* Temperature sparkline */}
            {temps.length > 0 && (
              <div style={{ padding: "8px 16px 12px" }}>
                <div style={{ color: DIMMER, fontSize: 9, letterSpacing: "0.1em", marginBottom: 5 }}>
                  TEMPERATUR DEUTSCHLAND ({Math.min(...temps).toFixed(0)}°C – {Math.max(...temps).toFixed(0)}°C)
                  {belowFreeze > 0 && <span style={{ color: "#38bdf8", marginLeft: 6 }}>{belowFreeze}× FROST</span>}
                </div>
                <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 24 }}>
                  {[...temps].sort((a, b) => a - b).map((t, i) => {
                    const norm = (t - Math.min(...temps)) / ((Math.max(...temps) - Math.min(...temps)) || 1);
                    const h = 6 + norm * 18;
                    const color = t <= 0 ? "#38bdf8" : t <= 5 ? "#7dd3fc" : t <= 15 ? "#22c55e" : t <= 25 ? "#facc15" : "#f97316";
                    return <div key={i} title={`${t.toFixed(1)}°C`} style={{ flex: 1, height: h, background: color, opacity: 0.8 }} />;
                  })}
                </div>
              </div>
            )}

            {/* ── Hochwasser & Streckenrisiken ───────────────────────── */}
            <SectionHeader title="Hochwasser & Streckenrisiken" sub={`${pg.length} WSV-Pegel`} />

            <div style={{ padding: "8px 16px 4px" }}>
              {/* Alert summary bars */}
              {(["very high", "high", "normal", "low"] as const).map((level) => {
                const count = pegelAlertCounts[level] ?? 0;
                if (count === 0) return null;
                const colors = { "very high": "#ef4444", high: "#f97316", normal: "#38bdf8", low: "#94a3b8" };
                const labels = { "very high": "Hochwasser", high: "Erhöht", normal: "Normal", low: "Niedrig" };
                return (
                  <div key={level} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ width: 5, height: 5, background: colors[level], flexShrink: 0 }} />
                    <span style={{ color: DIM, fontSize: 10, width: 80 }}>{labels[level]}</span>
                    <MiniBar value={count} max={pg.length} color={colors[level]} />
                    <span style={{ color: TEXT, fontSize: 10, fontFamily: MONO, width: 32, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>

            {floodedRailRivers.length > 0 ? (
              <div style={{ padding: "6px 16px 10px" }}>
                <div style={{ color: "#f97316", fontSize: 9, letterSpacing: "0.1em", marginBottom: 6 }}>
                  KRITISCHE BAHNFLÜSSE MIT ERHÖHTEM PEGEL
                </div>
                {floodedRailRivers.map(([river, { count, stations }]) => (
                  <div key={river} style={{ marginBottom: 8, padding: "7px 10px", background: "#1a0a0020", border: "1px solid #f9731633", borderLeft: "3px solid #f97316" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ color: "#f97316", fontSize: 10, fontWeight: 700 }}>{river}</span>
                      <span style={{ color: DIM, fontSize: 9 }}>{count} Pegel erhöht</span>
                    </div>
                    <div style={{ color: DIM, fontSize: 9, lineHeight: 1.4 }}>
                      Parallele Bahnstrecken gefährdet · Stationen: {stations.slice(0, 2).join(", ")}{stations.length > 2 ? ` +${stations.length - 2}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "6px 16px 10px", color: "#22c55e", fontSize: 10 }}>
                Keine erhöhten Pegelstände an Bahnflüssen.
              </div>
            )}

            {criticalFlood.length > 0 && (
              <div style={{
                margin: "0 16px 10px", padding: "8px 12px",
                background: "#1a0505", border: "1px solid #7f1d1d", color: "#fca5a5",
                fontSize: 10, lineHeight: 1.5,
              }}>
                ⚠ {criticalFlood.length} Pegel in HOCHWASSER-Stufe — Streckensperrungen
                möglich. Betroffen: {[...new Set(criticalFlood.map((f) => f.properties.river).filter(Boolean))].slice(0, 3).join(", ")}
              </div>
            )}

            {/* ── Wirtschaft & Investitionsbedarf ───────────────────── */}
            <SectionHeader title="Wirtschaft & Investitionsbedarf" sub="Landkreis-Ebene" />

            <InsightRow
              label="Wirtschaftliche Disparität (Top 10% vs. Bottom 10% BIP/Kopf)"
              value={disparityRatio !== null ? `${disparityRatio.toFixed(1)}×` : "—"}
              sub="Faktor zwischen stärksten und schwächsten Kreisen"
              color={disparityRatio !== null && disparityRatio > 4 ? "#f97316" : TEXT}
            />
            <InsightRow
              label="Ø BIP/Kopf (2022)"
              value={avgBip !== null ? `${Math.round(avgBip / 1000)}k €` : "—"}
            />
            <InsightRow
              label="Ø Arbeitslosenquote (2024)"
              value={avgAlo !== null ? `${avgAlo.toFixed(1)} %` : "—"}
            />

            {weakKreise.length > 0 && (
              <div style={{ padding: "8px 16px 4px" }}>
                <div style={{ color: DIMMER, fontSize: 9, letterSpacing: "0.1em", marginBottom: 5 }}>
                  STRUKTURSCHWACHE KREISE — HOHER INVESTITIONSBEDARF
                  <span style={{ color: DIMMER, marginLeft: 6 }}>{weakKreise.length} Kreise</span>
                </div>
                <div style={{ color: DIM, fontSize: 10, lineHeight: 1.5, marginBottom: 6 }}>
                  Niedrige Wirtschaftskraft + hohe Arbeitslosigkeit — Regionen mit typisch unzureichender Bahnanbindung.
                </div>
                {weakKreise.slice(0, 5).map((f) => (
                  <div key={f.properties.ags} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 5, height: 5, background: "#ef4444", flexShrink: 0 }} />
                    <span style={{ color: DIM, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.properties.name}</span>
                    <span style={{ color: "#94a3b8", fontSize: 9, fontFamily: MONO }}>
                      {Math.round((f.properties.bipPerCapita ?? 0) / 1000)}k € · {f.properties.unemployment?.toFixed(1)}%
                    </span>
                  </div>
                ))}
                {weakKreise.length > 5 && (
                  <div style={{ color: DIMMER, fontSize: 9, paddingLeft: 13 }}>+{weakKreise.length - 5} weitere</div>
                )}
              </div>
            )}

            {strongKreise.length > 0 && (
              <div style={{ padding: "8px 16px 12px" }}>
                <div style={{ color: DIMMER, fontSize: 9, letterSpacing: "0.1em", marginBottom: 5 }}>
                  WIRTSCHAFTLICHE KNOTENPUNKTE — GUT ANGEBUNDEN
                  <span style={{ color: DIMMER, marginLeft: 6 }}>{strongKreise.length} Kreise</span>
                </div>
                <div style={{ color: DIM, fontSize: 10, lineHeight: 1.5, marginBottom: 6 }}>
                  Hohe Wirtschaftskraft korreliert mit dichtem ICE/IC-Anschluss und Fern­verkehrs-Hubs.
                </div>
                {strongKreise.slice(0, 4).map((f) => (
                  <div key={f.properties.ags} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 5, height: 5, background: "#22c55e", flexShrink: 0 }} />
                    <span style={{ color: DIM, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.properties.name}</span>
                    <span style={{ color: "#94a3b8", fontSize: 9, fontFamily: MONO }}>
                      {Math.round((f.properties.bipPerCapita ?? 0) / 1000)}k €
                    </span>
                  </div>
                ))}
              </div>
            )}

          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ color: DIMMER, fontSize: 10, letterSpacing: "0.1em" }}>INSIGHTS NOCH NICHT GELADEN</div>
            <button
              onClick={load}
              style={{
                background: "#0c1e33", border: `1px solid #1e3a5f`, borderTop: `2px solid ${ACCENT}`,
                color: ACCENT, padding: "8px 16px", fontFamily: MONO, fontSize: 10,
                letterSpacing: "0.1em", cursor: "pointer",
              }}
            >
              JETZT LADEN
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${DIMMER}`, padding: "6px 16px", color: DIMMER, fontSize: 9, letterSpacing: "0.08em", flexShrink: 0 }}>
          WETTER · PEGEL · REGIONALSTATISTIK → BAHNBETRIEB
        </div>
      </div>
    </>
  );
}
