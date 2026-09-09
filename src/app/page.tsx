"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const LEGEND = [
  { label: "nicht elektrifiziert", color: "#64748b" },
  { label: "Stromschiene", color: "#fb923c" },
  { label: "Oberleitung ≤ 60 km/h", color: "#60a5fa" },
  { label: "Oberleitung ≤ 120 km/h", color: "#34d399" },
  { label: "Oberleitung ≤ 160 km/h", color: "#facc15" },
  { label: "Oberleitung ≤ 200 km/h", color: "#f97316" },
  { label: "Oberleitung > 200 km/h", color: "#ef4444" },
];

export default function Page() {
  return (
    <main style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <Map />

      {/* Info panel */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          background: "rgba(15,23,42,0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid #1e293b",
          borderRadius: 10,
          padding: "12px 16px",
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
          lineHeight: "1.6",
          minWidth: 190,
          maxWidth: 220,
        }}
      >
        <div style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
          M1 Streckennetz
        </div>
        <div style={{ color: "#64748b", fontSize: 11, marginBottom: 10 }}>
          DB Infrastruktur · Deutschland
        </div>

        <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          Geschwindigkeit / Traktion
        </div>
        {LEGEND.map(({ label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span
              style={{
                display: "inline-block",
                width: 20,
                height: 3,
                background: color,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#cbd5e1", fontSize: 11 }}>{label}</span>
          </div>
        ))}

        <div style={{ borderTop: "1px solid #1e293b", marginTop: 10, paddingTop: 8, color: "#475569", fontSize: 10 }}>
          Klick auf Strecke für Details
        </div>
      </div>
    </main>
  );
}
