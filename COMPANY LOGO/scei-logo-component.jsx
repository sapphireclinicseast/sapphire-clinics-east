/**
 * SAPPHIRE CLINICS EAST, INC. — Logo Component
 * Built for 21st.dev — React Component Registry
 *
 * @version 2.0
 * @author Sapphire Clinics East, Inc. Brand Team
 *
 * Usage:
 *   import SCEILogo from './scei-logo-component'
 *   <SCEILogo />
 *   <SCEILogo size={120} variant="mark" />
 *   <SCEILogo size={300} variant="horizontal" theme="white" />
 *   <SCEILogo size={200} variant="full" theme="teal-bg" />
 */

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  sapphireTeal:  "#1A7B8A",
  deepTeal:      "#0D5B68",
  brightTeal:    "#2AAABB",
  white:         "#FFFFFF",
  charcoal:      "#1C2B30",
  nearBlack:     "#0A1012",
};

// ─────────────────────────────────────────────────────────────────────────────
// MARK COMPONENT — The Faceted Sapphire Diamond
// Center: (0,0) | Outer radius: 88 | viewBox crops to mark only
// ─────────────────────────────────────────────────────────────────────────────
function SCEIMark({ color = BRAND.sapphireTeal, size = 120, animated = false }) {
  const strokeProps = {
    fill: "none",
    stroke: color,
    strokeLinejoin: "miter",
    strokeLinecap: "square",
  };

  const animStyle = animated
    ? { filter: `drop-shadow(0 0 6px ${color}80)` }
    : {};

  return (
    <svg
      width={size}
      height={size}
      viewBox="-100 -100 200 200"
      xmlns="http://www.w3.org/2000/svg"
      style={animStyle}
      aria-label="Sapphire Clinics East logo mark"
      role="img"
    >
      {/* Level 1 — Outer Diamond */}
      <polygon
        {...strokeProps}
        strokeWidth="5.5"
        points="0,-88 88,0 0,88 -88,0"
      />

      {/* Level 2 — Inscribed Axis-Aligned Square */}
      <polygon
        {...strokeProps}
        strokeWidth="4.2"
        points="44,-44 44,44 -44,44 -44,-44"
      />

      {/* Level 3 — Inner Diamond (inscribed in square) */}
      <polygon
        {...strokeProps}
        strokeWidth="3.2"
        points="0,-44 44,0 0,44 -44,0"
      />

      {/* Cardinal Facet Lines: outer diamond corners → inner diamond corners */}
      <line {...strokeProps} strokeWidth="2.2" x1="0"   y1="-88" x2="0"   y2="-44" />
      <line {...strokeProps} strokeWidth="2.2" x1="88"  y1="0"   x2="44"  y2="0"   />
      <line {...strokeProps} strokeWidth="2.2" x1="0"   y1="88"  x2="0"   y2="44"  />
      <line {...strokeProps} strokeWidth="2.2" x1="-88" y1="0"   x2="-44" y2="0"   />

      {/* Diagonal Facet Lines: square corners → inner diamond corners */}
      <line {...strokeProps} strokeWidth="1.8" x1="44"  y1="-44" x2="44"  y2="0"   />
      <line {...strokeProps} strokeWidth="1.8" x1="44"  y1="-44" x2="0"   y2="-44" />
      <line {...strokeProps} strokeWidth="1.8" x1="44"  y1="44"  x2="44"  y2="0"   />
      <line {...strokeProps} strokeWidth="1.8" x1="44"  y1="44"  x2="0"   y2="44"  />
      <line {...strokeProps} strokeWidth="1.8" x1="-44" y1="44"  x2="-44" y2="0"   />
      <line {...strokeProps} strokeWidth="1.8" x1="-44" y1="44"  x2="0"   y2="44"  />
      <line {...strokeProps} strokeWidth="1.8" x1="-44" y1="-44" x2="-44" y2="0"   />
      <line {...strokeProps} strokeWidth="1.8" x1="-44" y1="-44" x2="0"   y2="-44" />

      {/* Center Table — Filled Sapphire Focal Point */}
      <polygon fill={color} stroke="none" points="0,-14 14,0 0,14 -14,0" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL LOGO (mark + stacked wordmark)
// ─────────────────────────────────────────────────────────────────────────────
function SCEILogoFull({ color = BRAND.sapphireTeal, size = 220, bg = "transparent" }) {
  const scale   = size / 220;
  const markH   = 200 * scale;
  const totalH  = 260 * scale;
  const fontPrimary   = `'Futura', 'Century Gothic', 'Trebuchet MS', sans-serif`;

  return (
    <svg
      width={size}
      height={totalH}
      viewBox="0 0 220 260"
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: bg }}
      aria-label="Sapphire Clinics East, Inc. full logo"
      role="img"
    >
      <g transform="translate(110, 102)">
        {/* Same mark as above, inline */}
        <polygon fill="none" stroke={color} strokeWidth="5.5" strokeLinejoin="miter"
          points="0,-88 88,0 0,88 -88,0" />
        <polygon fill="none" stroke={color} strokeWidth="4.2" strokeLinejoin="miter"
          points="44,-44 44,44 -44,44 -44,-44" />
        <polygon fill="none" stroke={color} strokeWidth="3.2" strokeLinejoin="miter"
          points="0,-44 44,0 0,44 -44,0" />
        <line stroke={color} strokeWidth="2.2" x1="0"   y1="-88" x2="0"   y2="-44" />
        <line stroke={color} strokeWidth="2.2" x1="88"  y1="0"   x2="44"  y2="0"   />
        <line stroke={color} strokeWidth="2.2" x1="0"   y1="88"  x2="0"   y2="44"  />
        <line stroke={color} strokeWidth="2.2" x1="-88" y1="0"   x2="-44" y2="0"   />
        <line stroke={color} strokeWidth="1.8" x1="44"  y1="-44" x2="44"  y2="0"   />
        <line stroke={color} strokeWidth="1.8" x1="44"  y1="-44" x2="0"   y2="-44" />
        <line stroke={color} strokeWidth="1.8" x1="44"  y1="44"  x2="44"  y2="0"   />
        <line stroke={color} strokeWidth="1.8" x1="44"  y1="44"  x2="0"   y2="44"  />
        <line stroke={color} strokeWidth="1.8" x1="-44" y1="44"  x2="-44" y2="0"   />
        <line stroke={color} strokeWidth="1.8" x1="-44" y1="44"  x2="0"   y2="44"  />
        <line stroke={color} strokeWidth="1.8" x1="-44" y1="-44" x2="-44" y2="0"   />
        <line stroke={color} strokeWidth="1.8" x1="-44" y1="-44" x2="0"   y2="-44" />
        <polygon fill={color} stroke="none" points="0,-14 14,0 0,14 -14,0" />
      </g>

      {/* Rule */}
      <line x1="55" y1="204" x2="165" y2="204" stroke={color} strokeWidth="0.8" opacity="0.45" />

      {/* SAPPHIRE */}
      <text
        x="110" y="218"
        textAnchor="middle"
        fontFamily={fontPrimary}
        fontSize="24"
        fontWeight="800"
        letterSpacing="7"
        fill={color}
      >SAPPHIRE</text>

      {/* CLINICS EAST, INC. */}
      <text
        x="110" y="237"
        textAnchor="middle"
        fontFamily={fontPrimary}
        fontSize="9"
        fontWeight="400"
        letterSpacing="3.2"
        fill={color}
      >CLINICS EAST, INC.</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HORIZONTAL LOGO (mark left + wordmark right)
// ─────────────────────────────────────────────────────────────────────────────
function SCEILogoHorizontal({ color = BRAND.sapphireTeal, height = 80, bg = "transparent" }) {
  const markSize = height;
  const totalW   = height * 3.8;
  const fontPrimary = `'Futura', 'Century Gothic', 'Trebuchet MS', sans-serif`;
  const cx = markSize * 0.5;
  const cy = markSize * 0.5;
  const r  = markSize * 0.42;
  const sq = r * 0.5;
  const ir = r * 0.5;
  const center = r * 0.15;
  const sw  = [r * 0.063, r * 0.048, r * 0.036, r * 0.025, r * 0.020];

  return (
    <svg
      width={totalW}
      height={height}
      viewBox={`0 0 ${totalW} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: bg }}
      aria-label="Sapphire Clinics East, Inc. horizontal logo"
      role="img"
    >
      {/* Compact mark (scaled) */}
      <g transform={`translate(${cx}, ${cy})`}>
        <polygon fill="none" stroke={color} strokeWidth={sw[0]} strokeLinejoin="miter"
          points={`0,${-r} ${r},0 0,${r} ${-r},0`} />
        <polygon fill="none" stroke={color} strokeWidth={sw[1]} strokeLinejoin="miter"
          points={`${sq},${-sq} ${sq},${sq} ${-sq},${sq} ${-sq},${-sq}`} />
        <polygon fill="none" stroke={color} strokeWidth={sw[2]} strokeLinejoin="miter"
          points={`0,${-ir} ${ir},0 0,${ir} ${-ir},0`} />
        <line stroke={color} strokeWidth={sw[3]} x1="0"  y1={-r}  x2="0"  y2={-ir} />
        <line stroke={color} strokeWidth={sw[3]} x1={r}  y1="0"   x2={ir} y2="0"   />
        <line stroke={color} strokeWidth={sw[3]} x1="0"  y1={r}   x2="0"  y2={ir}  />
        <line stroke={color} strokeWidth={sw[3]} x1={-r} y1="0"   x2={-ir} y2="0"  />
        <polygon fill={color} stroke="none"
          points={`0,${-center} ${center},0 0,${center} ${-center},0`} />
      </g>

      {/* Wordmark block */}
      <text
        x={height + 14} y={height * 0.48}
        fontFamily={fontPrimary}
        fontSize={height * 0.38}
        fontWeight="800"
        letterSpacing={height * 0.04}
        fill={color}
        dominantBaseline="middle"
      >SAPPHIRE</text>

      <text
        x={height + 16} y={height * 0.75}
        fontFamily={fontPrimary}
        fontSize={height * 0.14}
        fontWeight="400"
        letterSpacing={height * 0.025}
        fill={color}
        dominantBaseline="middle"
      >CLINICS EAST, INC.</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — SCEILogo
// Props:
//   size    {number}  — primary dimension in px (default 220)
//   variant {string}  — "full" | "mark" | "horizontal" (default "full")
//   theme   {string}  — "teal" | "white" | "charcoal" | "teal-bg" (default "teal")
//   animated{boolean} — add glow drop-shadow to mark (default false)
// ─────────────────────────────────────────────────────────────────────────────
export default function SCEILogo({
  size     = 220,
  variant  = "full",
  theme    = "teal",
  animated = false,
}) {
  const colorMap = {
    "teal":    { fg: BRAND.sapphireTeal, bg: "transparent" },
    "white":   { fg: BRAND.white,        bg: "transparent" },
    "charcoal":{ fg: BRAND.charcoal,     bg: "transparent" },
    "teal-bg": { fg: BRAND.white,        bg: BRAND.sapphireTeal },
    "dark-bg": { fg: BRAND.white,        bg: BRAND.nearBlack },
  };

  const { fg, bg } = colorMap[theme] || colorMap["teal"];

  if (variant === "mark") {
    return <SCEIMark color={fg} size={size} animated={animated} />;
  }

  if (variant === "horizontal") {
    return <SCEILogoHorizontal color={fg} height={size * 0.36} bg={bg} />;
  }

  return <SCEILogoFull color={fg} size={size} bg={bg} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO — Preview all variants (for 21st.dev registry preview)
// ─────────────────────────────────────────────────────────────────────────────
export function SCEILogoDemo() {
  const [theme, setTheme] = useState("teal");

  const themes = ["teal", "white", "charcoal", "teal-bg", "dark-bg"];
  const needsDarkBg = theme === "white";
  const containerBg = needsDarkBg ? BRAND.sapphireTeal
    : theme === "dark-bg" ? BRAND.nearBlack
    : theme === "teal-bg" ? BRAND.sapphireTeal
    : "#f8f9fa";

  return (
    <div style={{ fontFamily: "sans-serif", padding: 32, background: "#fff", minHeight: "100vh" }}>
      <h2 style={{ color: BRAND.charcoal, marginBottom: 8, letterSpacing: 1 }}>
        SCEI Logo Component — 21st.dev Preview
      </h2>

      {/* Theme selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
        {themes.map(t => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            style={{
              padding: "6px 16px",
              border: `2px solid ${theme === t ? BRAND.sapphireTeal : "#ccc"}`,
              borderRadius: 4,
              background: theme === t ? BRAND.sapphireTeal : "white",
              color: theme === t ? "white" : BRAND.charcoal,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: theme === t ? 700 : 400,
            }}
          >{t}</button>
        ))}
      </div>

      {/* Variants display */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>

        {/* Full stacked */}
        <div style={{
          background: containerBg,
          padding: 40,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}>
          <SCEILogo size={180} variant="full" theme={theme} />
        </div>

        {/* Mark only */}
        <div style={{
          background: containerBg,
          padding: 40,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}>
          <SCEILogo size={120} variant="mark" theme={theme} animated />
        </div>

        {/* Horizontal */}
        <div style={{
          background: containerBg,
          padding: 40,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          gridColumn: "1 / -1",
        }}>
          <SCEILogo size={200} variant="horizontal" theme={theme} />
        </div>
      </div>

      {/* Size scale */}
      <h3 style={{ color: BRAND.charcoal, marginTop: 40, marginBottom: 16 }}>Mark — Size Scale</h3>
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 20,
        background: "#f0f5f6",
        padding: 24,
        borderRadius: 12,
        flexWrap: "wrap",
      }}>
        {[24, 32, 48, 64, 96, 128].map(s => (
          <div key={s} style={{ textAlign: "center" }}>
            <SCEIMark color={BRAND.sapphireTeal} size={s} />
            <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{s}px</div>
          </div>
        ))}
      </div>
    </div>
  );
}
