/**
 * I "TOY ATLAS": reusable Remotion kit, 9:16. Style guide: ./README.md.
 * Learned from EasyHistories (analysis: Map/phan-tich-V3-V4-EasyHistories.md).
 *
 * A real country map (Natural Earth via world-atlas, public domain) with a
 * relief texture, territories filled per side and taken over by a radial
 * colour wipe, toy "peg" characters with flags standing on the map, sticker
 * props, big yellow money numbers and a year ribbon. The camera FLIES between
 * places (Lucas 2026-10-10: allowed for this style at every change of place;
 * eased in-out, ≥ 20 frames, no overshoot, no shake, no blur). Between
 * flights the frame is still.
 *
 * Geometry is projected once (Mercator, base scale) and the camera is a
 * translate + scale of the whole map group, so the texture moves with the map.
 */
import { geoBounds, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { AbsoluteFill, Easing, Img, interpolate, staticFile } from "remotion";
import world10 from "world-atlas/countries-10m.json";
import world50 from "world-atlas/countries-50m.json";
import { CANVAS, CLAMP, CX, FONT, pop, prog, SAFE, SUB_BOTTOM } from "../kit-common";
import type { SubSkin } from "../subs";

export const ATLAS = {
  deep: "#2C5476",
  ocean: "#4778A0",
  shallow: "#8DB4BC",
  land: "#C9B184",
  ink: "#1E2A33",
  white: "#F7F2E8",
  gold: "#FFD14A",
  red: "#C8322B",
  /** sides: override per project */
  a: "#3D6FD0",
  b: "#4FA34A",
  c: "#D9452F",
  d: "#D69A3A",
} as const;

/** Where the map is centred on screen (visual area between the year ribbon and the subtitles). */
export const MAP_Y = 760;
/**
 * Layout zones of the 9:16 frame (Lucas 2026-10-14: most fix-ups in the pilot episodes were
 * things landing on each other). Place every layer in its zone:
 * - top: BigGold / DataCard / YearRibbon, centred on y = top.y
 * - stage: characters, props, the action on the map
 * - rows: bottom bars, comparison rows, low data cards
 * - subs: karaoke subtitles only
 */
export const ZONE = {
  top: { y: 330, y0: SAFE.top + 20, y1: SAFE.top + 220 },
  stage: { y0: SAFE.top + 250, y1: 1100 },
  rows: { y0: 1140, y1: 1320 },
  subs: { y0: SUB_BOTTOM - 100, y1: SUB_BOTTOM },
} as const;

/** Minimum length of a camera flight, frames (rule: ≥ 20; v2.1 Lucas wanted a faster pace). */
export const FLIGHT = 22;

// ------------------------------------------------------------------ geometry (computed once)

type Country = { name: string; d: string; bounds: [[number, number], [number, number]] };

const BASE = CANVAS.width / (2 * Math.PI); // world width = 1080 at zoom 1
const baseProj = geoMercator().scale(BASE).translate([0, 0]).center([0, 0]);
const basePath = geoPath(baseProj).digits(4);

const load = (topo: unknown): Feature<Geometry, { name: string }>[] => {
  const t = topo as Topology;
  return (feature(t, t.objects.countries) as FeatureCollection<Geometry, { name: string }>).features;
};
/** Fine geometry for the countries a story zooms into, coarse for the rest. */
const FINE = new Set(["Singapore", "Malaysia", "Indonesia", "Brunei", "Thailand"]);
/**
 * Vietnam's archipelagos (Channel Bible §8, Lucas 2026-10-12): Natural Earth
 * puts the Hoàng Sa (Paracel) islands inside "China" and has the Trường Sa as
 * "Spratly Is." (10m only). Both become their own shapes so a story can fill
 * them in Vietnam's colour: names "Paracel Is." and "Spratly Is.".
 */
const islandShapes = (all: Feature<Geometry, { name: string }>[]): Feature<Geometry, { name: string }>[] => {
  const china = all.find((f) => f.properties.name === "China");
  const polys = china?.geometry.type === "MultiPolygon" ? china.geometry.coordinates : [];
  const inBox = (ring: number[][]) => ring.every(([x, y]) => x >= 110.9 && x <= 113 && y >= 15.5 && y <= 17.3);
  const paracel: Feature<Geometry, { name: string }> = {
    type: "Feature",
    properties: { name: "Paracel Is." },
    geometry: { type: "MultiPolygon", coordinates: polys.filter((p) => inBox(p[0])) },
  };
  return [paracel, ...all.filter((f) => f.properties.name === "Spratly Is.")];
};
const COUNTRIES: Country[] = (() => {
  const all10 = load(world10);
  const fine = all10.filter((f) => FINE.has(f.properties.name));
  const coarse = load(world50).filter((f) => !FINE.has(f.properties.name));
  return [...coarse, ...fine, ...islandShapes(all10)].map((f) => ({ name: f.properties.name, d: basePath(f) ?? "", bounds: geoBounds(f) }));
})();
const byName = new Map(COUNTRIES.map((c) => [c.name, c]));

/** Base-projection point (zoom 1, origin at lon 0 / lat 0). */
const base = (lon: number, lat: number) => baseProj([lon, lat]) as [number, number];

// ------------------------------------------------------------------ camera

export type GeoCam = { at: number; lon: number; lat: number; zoom: number };

const ease = Easing.inOut(Easing.cubic);

/**
 * Camera at frame f. Each key is a flight that starts at `at` and lasts
 * FLIGHT frames (longer for long distances); far flights rise (zoom out) in
 * the middle like a plane, then land. Keys must be in time order.
 */
export const camAt = (keys: GeoCam[], f: number, push = 0, cap = 0.2): GeoCam => {
  // slow push (Lucas 2026-10-13): while the camera holds on a place it creeps in by
  // `push` (≤ 0.05) per 3 s, up to +`cap`; the next flight starts from the pushed view
  const grow = (from: number, to: number) => 1 + Math.min(cap, (push * Math.max(0, to - from)) / 90);
  let cam = keys[0];
  let settled = keys[0].at;
  for (const k of keys.slice(1)) {
    if (f < k.at) break;
    const from = { ...cam, zoom: cam.zoom * grow(settled, k.at) };
    const dist = Math.hypot(k.lon - from.lon, k.lat - from.lat);
    const dur = Math.round(FLIGHT + Math.min(18, dist * 0.6));
    const p = interpolate(f, [k.at, k.at + dur], [0, 1], { ...CLAMP, easing: ease });
    if (p < 1) {
      const lift = 1 + Math.min(3, dist / 12) * Math.sin(Math.PI * p);
      return {
        at: k.at,
        lon: from.lon + (k.lon - from.lon) * p,
        lat: from.lat + (k.lat - from.lat) * p,
        zoom: Math.exp(Math.log(from.zoom) + (Math.log(k.zoom) - Math.log(from.zoom)) * p) / lift,
      };
    }
    cam = k;
    settled = k.at + dur;
  }
  return { ...cam, zoom: cam.zoom * grow(settled, f) };
};

/**
 * Loop seam: the slow push keeps creeping in on the last hold, so the final frame would be a few %
 * closer than the opening frame and the replay jumps. Retargets the last key's zoom so frame
 * `end - 1` lands exactly on keys[0]'s framing (the last key must be the opening place).
 */
export const seamKeys = (keys: GeoCam[], end: number, push = 0, cap = 0.2): GeoCam[] => {
  const last = keys[keys.length - 1];
  const z = camAt(keys, end - 1, push, cap).zoom;
  return [...keys.slice(0, -1), { ...last, zoom: (last.zoom * keys[0].zoom) / z }];
};

/** Screen position of a lon/lat under a camera. */
export const toScreen = (cam: GeoCam, lon: number, lat: number): [number, number] => {
  const [x, y] = base(lon, lat);
  const [cx, cy] = base(cam.lon, cam.lat);
  return [CX + (x - cx) * cam.zoom, MAP_Y + (y - cy) * cam.zoom];
};

// ------------------------------------------------------------------ map

/** A country fill; `wipe` floods `color` in from a point over the previous colour. */
export type Fill = {
  name: string;
  color: string;
  hatch?: boolean;
  wipe?: { from: string; lon: number; lat: number; p: number };
};

/**
 * The map: ocean, shallow-water halo, neutral land with relief, story
 * countries in their side colours. Other countries stay neutral and
 * unlabelled (no ownership colouring of places outside the story).
 */
export const Atlas: React.FC<{ cam: GeoCam; fills?: Fill[]; f?: number }> = ({ cam, fills = [], f = 0 }) => {
  const [cx, cy] = base(cam.lon, cam.lat);
  const z = cam.zoom;
  // view bounds in degrees (rough) to skip far countries
  const half = (CANVAS.height / 2 / (BASE * z)) * (180 / Math.PI) * 1.4;
  const near = (c: Country) =>
    c.bounds[1][0] > cam.lon - half && c.bounds[0][0] < cam.lon + half &&
    c.bounds[1][1] > cam.lat - half && c.bounds[0][1] < cam.lat + half;
  const visible = COUNTRIES.filter(near);
  const sw = 1.6 / z; // strokes stay ~1.6 px at any zoom
  return (
    <AbsoluteFill style={{ backgroundColor: ATLAS.deep }}>
      <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
        <defs>
          <radialGradient id="ta-sea" cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor={ATLAS.ocean} />
            <stop offset="100%" stopColor={ATLAS.deep} />
          </radialGradient>
          {/* water ripples drift gently back and forth (ambient, the frame stays still) */}
          <filter id="ta-water" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.014" numOctaves={3} seed={9} result="w" />
            <feOffset in="w" dx={40 * Math.sin(f / 45)} dy={18 * Math.cos(f / 60)} result="wm" />
            <feColorMatrix in="wm" type="matrix" values="0 0 0 0 0.85  0 0 0 0 0.93  0 0 0 0 1  0 0 0 0.14 0" />
          </filter>
          {/* relief: lit noise multiplied onto the land (in map space, so it moves with the map) */}
          <filter id="ta-relief" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">
            {/* noise frequency follows the zoom so the grain keeps the same size on screen */}
            <feTurbulence type="fractalNoise" baseFrequency={0.014 * z} numOctaves={4} seed={3} result="n" />
            <feDiffuseLighting in="n" surfaceScale={1.7} lightingColor="#ffffff" result="lit">
              <feDistantLight azimuth={315} elevation={48} />
            </feDiffuseLighting>
            {/* keep the shading gentle: light in 0.78–1.04 instead of 0–1 */}
            <feComponentTransfer in="lit" result="soft">
              <feFuncR type="linear" slope={0.26} intercept={0.78} />
              <feFuncG type="linear" slope={0.26} intercept={0.78} />
              <feFuncB type="linear" slope={0.26} intercept={0.78} />
            </feComponentTransfer>
            <feComposite in="soft" in2="SourceGraphic" operator="in" result="litLand" />
            <feBlend in="SourceGraphic" in2="litLand" mode="multiply" />
          </filter>
          <pattern id="ta-hatch" patternUnits="userSpaceOnUse" width={14 / z} height={14 / z} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={14 / z} stroke={ATLAS.ink} strokeOpacity={0.45} strokeWidth={4 / z} />
          </pattern>
          {fills.filter((x) => x.wipe).map((x) => {
            const c = byName.get(x.name);
            const w = x.wipe!;
            const [px, py] = base(w.lon, w.lat);
            const span = c ? Math.hypot(...([0, 1].map((k) => base(c.bounds[1][0], c.bounds[1][1])[k] - base(c.bounds[0][0], c.bounds[0][1])[k]) as [number, number])) : 1;
            return (
              <clipPath key={x.name} id={`ta-wipe-${x.name.replace(/\W/g, "")}`}>
                <circle cx={px} cy={py} r={span * 1.2 * w.p} />
              </clipPath>
            );
          })}
        </defs>
        <rect width="100%" height="100%" fill="url(#ta-sea)" />
        <rect width="100%" height="100%" filter="url(#ta-water)" />
        <g style={{ translate: `${CX - cx * z}px ${MAP_Y - cy * z}px`, scale: z, transformOrigin: "0 0" }}>
          {/* shallow-water halo along the coasts */}
          <g fill="none" stroke={ATLAS.shallow} strokeOpacity={0.5 + 0.1 * Math.sin(f / 20)} strokeWidth={22 / z} strokeLinejoin="round">
            {visible.map((c) => <path key={c.name} d={c.d} />)}
          </g>
          <g filter="url(#ta-relief)">
            {visible.map((c) => {
              const fill = fills.find((x) => x.name === c.name);
              return <path key={c.name} d={c.d} fill={fill ? (fill.wipe ? fill.wipe.from : fill.color) : ATLAS.land} />;
            })}
            {fills.filter((x) => x.wipe).map((x) => (
              <path key={`w-${x.name}`} d={byName.get(x.name)?.d} fill={x.color}
                clipPath={`url(#ta-wipe-${x.name.replace(/\W/g, "")})`} />
            ))}
          </g>
          {fills.filter((x) => x.hatch).map((x) => (
            <path key={`h-${x.name}`} d={byName.get(x.name)?.d} fill="url(#ta-hatch)" />
          ))}
          <g fill="none" stroke={ATLAS.ink} strokeOpacity={0.75} strokeWidth={sw}>
            {visible.map((c) => <path key={c.name} d={c.d} />)}
          </g>
        </g>
        <radialGradient id="ta-vig" cx="50%" cy="45%" r="72%">
          <stop offset="55%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
        </radialGradient>
        <rect width="100%" height="100%" fill="url(#ta-vig)" />
      </svg>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ overlays (screen space)

/** Year ribbon: big at the top centre, then shrinks to the top-left corner. */
export const YearRibbon: React.FC<{ text: string; f: number; at: number; out?: number }> = ({ text, f, at, out }) => {
  if (f < at) return null;
  const settle = prog(f, at + 30, 14, ease);
  const w = text.length * 46 + 120;
  // in the corner the text stays >= 48 px (60 × 0.82)
  const x = interpolate(settle, [0, 1], [CX, SAFE.left + (w * 0.82) / 2 + 40]);
  const y = interpolate(settle, [0, 1], [330, SAFE.top + 55]);
  const s = pop(f, at) * interpolate(settle, [0, 1], [1, 0.82]);
  const o = out === undefined ? 1 : 1 - prog(f, out, 5);
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g style={{ translate: `${x}px ${y}px`, scale: s }}>
        <path d={`M ${-w / 2 - 40} -30 L ${-w / 2} -30 L ${-w / 2} 50 L ${-w / 2 - 40} 50 L ${-w / 2 - 22} 10 Z`} fill="#8E1F1A" />
        <path d={`M ${w / 2 + 40} -30 L ${w / 2} -30 L ${w / 2} 50 L ${w / 2 + 40} 50 L ${w / 2 + 22} 10 Z`} fill="#8E1F1A" />
        <rect x={-w / 2} y={-44} width={w} height={84} rx={6} fill={ATLAS.red} stroke="#7A1915" strokeWidth={4} />
        <text textAnchor="middle" y={18} fontFamily={FONT} fontWeight={800} fontSize={60} fill={ATLAS.white} letterSpacing={2}>
          {text}
        </text>
      </g>
    </svg>
  );
};

/** Big yellow number / exclamation ("$7,200,000", "OIL!"). */
export const BigGold: React.FC<{ text: string; f: number; at: number; out?: number; x?: number; y: number; size?: number; color?: string }> = ({
  text, f, at, out, x = CX, y, size = 110, color = ATLAS.gold,
}) => {
  const o = out === undefined ? 1 : 1 - prog(f, out, 5);
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <text x={x} y={y} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={size} fill={color}
        stroke={ATLAS.ink} strokeWidth={14} paintOrder="stroke" strokeLinejoin="round"
        style={{ scale: pop(f, at), transformBox: "fill-box", transformOrigin: "center" }}>
        {text}
      </text>
    </svg>
  );
};

/**
 * Data card (learned from the Vietnamese competitors, 2026-10-13): one big
 * number over a short label on a dark rounded card, centred on (x, y).
 * Value ≤ 5 words, label ≤ 3 words; both ≥ 48 px.
 */
export const DataCard: React.FC<{
  value: string; label?: string; x: number; y: number; f: number; at: number; out?: number; color?: string; size?: number;
}> = ({ value, label, x, y, f, at, out, color = ATLAS.gold, size = 92 }) => {
  if (f < at) return null;
  const w = Math.max(value.length * size * 0.6, (label?.length ?? 0) * 31) + 90;
  const h = label ? size + 100 : size + 50;
  const o = out === undefined ? 1 : 1 - prog(f, out, 5);
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g style={{ translate: `${x}px ${y + 30 * (1 - prog(f, at, 8))}px`, scale: pop(f, at) }}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={26} fill="rgba(22,32,40,0.84)" stroke={color} strokeWidth={5} />
        <text y={label ? -h / 2 + size + 14 : size * 0.36} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={size} fill={color}>
          {value}
        </text>
        {label && (
          <text y={h / 2 - 30} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={48} fill={ATLAS.white} letterSpacing={1}>
            {label}
          </text>
        )}
      </g>
    </svg>
  );
};

/** Solid line through screen points, drawn on with p, dark edge; optional soft glow (pulsing). */
export const Track: React.FC<{
  ps: [number, number][]; p: number; color?: string; w?: number; o?: number; dx?: number; dy?: number; glow?: number; f?: number;
}> = ({ ps, p, color = ATLAS.gold, w = 10, o = 1, dx = 0, dy = 0, glow = 0, f = 0 }) => {
  const d = ps.map(([x, y], i) => `${i ? "L" : "M"} ${x + dx} ${y + dy}`).join(" ");
  const dash = { strokeDasharray: 1, strokeDashoffset: 1 - p };
  const id = `trk-glow-${Math.round(w)}`;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      {glow > 0 && (
        <>
          <filter id={id} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={w * 1.4} /></filter>
          <path d={d} fill="none" stroke={color} strokeWidth={w * 3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} style={dash}
            filter={`url(#${id})`} opacity={glow * (0.75 + 0.25 * Math.sin(f / 8))} />
        </>
      )}
      <path d={d} fill="none" stroke={ATLAS.ink} strokeWidth={w + 7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} style={dash} />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" pathLength={1} style={dash} />
    </svg>
  );
};

/** Small map label (place name), white caps with a dark outline. */
export const MapLabel: React.FC<{ text: string; x: number; y: number; o?: number; size?: number }> = ({ text, x, y, o = 1, size = 52 }) => (
  <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
    <text x={x} y={y} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={Math.max(48, size)} fill={ATLAS.white}
      stroke={ATLAS.ink} strokeWidth={9} paintOrder="stroke" letterSpacing={2}>
      {text}
    </text>
  </svg>
);

/** Five-point star, unit radius (flag stars). */
const STAR = "M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.3633,0.118 L0.5878,0.809 L0,0.382 L-0.5878,0.809 L-0.3633,0.118 L-0.951,-0.309 L-0.2245,-0.309 Z";
export type FlagKind = "uk" | "singapore" | "malaysia" | "vietnam" | "thailand" | "china" | "brunei" | "cambodia";

export const Flag: React.FC<{ kind: FlagKind; w?: number; f?: number }> = ({ kind, w = 64, f = 0 }) => {
  const h = w * 0.62;
  return (
    <g>
      <line x1={0} y1={0} x2={0} y2={h * 2.2} stroke="#4A3B2A" strokeWidth={4} />
      {/* flutter: the cloth breathes in width and tilts a little */}
      <g style={{ translate: "2px 0px", scale: `${0.93 + 0.07 * Math.sin(f / 6)} 1`, rotate: `${2 * Math.sin(f / 9)}deg`, transformOrigin: "0 0" }}>
        {kind === "uk" && (
          <g>
            <rect width={w} height={h} fill="#1F3F8F" />
            <path d={`M0 0 L${w} ${h} M${w} 0 L0 ${h}`} stroke="#fff" strokeWidth={h * 0.22} />
            <path d={`M0 0 L${w} ${h} M${w} 0 L0 ${h}`} stroke="#C8102E" strokeWidth={h * 0.09} />
            <path d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`} stroke="#fff" strokeWidth={h * 0.32} />
            <path d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`} stroke="#C8102E" strokeWidth={h * 0.18} />
          </g>
        )}
        {kind === "singapore" && (
          <g>
            <rect width={w} height={h / 2} fill="#EF3340" />
            <rect y={h / 2} width={w} height={h / 2} fill="#fff" />
            <circle cx={w * 0.2} cy={h * 0.25} r={h * 0.16} fill="#fff" />
            <circle cx={w * 0.25} cy={h * 0.25} r={h * 0.15} fill="#EF3340" />
          </g>
        )}
        {kind === "malaysia" && (
          <g>
            {Array.from({ length: 7 }, (_, i) => (
              <rect key={i} y={(i * h) / 7} width={w} height={h / 14} fill="#CC0001" />
            ))}
            <rect width={w} height={h} fill="none" stroke="#999" strokeWidth={1} />
            <rect width={w * 0.5} height={h * 0.57} fill="#010066" />
            <circle cx={w * 0.17} cy={h * 0.28} r={h * 0.17} fill="#FC0" />
            <circle cx={w * 0.21} cy={h * 0.28} r={h * 0.15} fill="#010066" />
            <circle cx={w * 0.34} cy={h * 0.28} r={h * 0.09} fill="#FC0" />
          </g>
        )}
        {kind === "vietnam" && (
          <g>
            <rect width={w} height={h} fill="#DA251D" />
            <path transform={`translate(${w / 2} ${h / 2}) scale(${h * 0.3})`} fill="#FFCD00" d={STAR} />
          </g>
        )}
        {kind === "china" && (
          <g fill="#FFDE00">
            <rect width={w} height={h} fill="#DE2910" />
            {([[0.167, 0.25, 0.15], [0.333, 0.1, 0.05], [0.4, 0.2, 0.05], [0.4, 0.35, 0.05], [0.333, 0.45, 0.05]] as const).map(([x, y, r], i) => (
              <path key={i} transform={`translate(${w * x} ${h * y}) scale(${h * r})`} d={STAR} />
            ))}
          </g>
        )}
        {kind === "brunei" && (
          <g>
            {/* simplified: yellow field, white over black diagonal band, red crest reduced to crescent + mast */}
            <rect width={w} height={h} fill="#F7E017" />
            <path d={`M0 ${h * 0.1} L${w} ${h * 0.62} L${w} ${h * 0.8} L0 ${h * 0.28} Z`} fill="#FFFFFF" />
            <path d={`M0 ${h * 0.28} L${w} ${h * 0.8} L${w} ${h * 0.96} L0 ${h * 0.44} Z`} fill="#1E1E1E" />
            <path d={`M${w * 0.36} ${h * 0.5} A ${h * 0.2} ${h * 0.2} 0 0 0 ${w * 0.64} ${h * 0.5} A ${h * 0.15} ${h * 0.14} 0 0 1 ${w * 0.36} ${h * 0.5} Z`} fill="#CE1126" />
            <rect x={w * 0.49} y={h * 0.18} width={w * 0.02} height={h * 0.38} fill="#CE1126" />
            <path d={`M${w * 0.42} ${h * 0.24} Q${w * 0.5} ${h * 0.12} ${w * 0.58} ${h * 0.24} Z`} fill="#CE1126" />
          </g>
        )}
        {kind === "thailand" && (
          <g>
            <rect width={w} height={h} fill="#A51931" />
            <rect y={h / 6} width={w} height={(h * 2) / 3} fill="#F4F5F8" />
            <rect y={h / 3} width={w} height={h / 3} fill="#2D2A4A" />
          </g>
        )}
        {kind === "cambodia" && (
          <g>
            {/* simplified: blue–red–blue (1:2:1), Angkor Wat reduced to a white three-tower silhouette */}
            <rect width={w} height={h} fill="#032EA1" />
            <rect y={h / 4} width={w} height={h / 2} fill="#E00025" />
            <path fill="#FFFFFF" d={`M${w * 0.3} ${h * 0.66} L${w * 0.7} ${h * 0.66} L${w * 0.7} ${h * 0.58} L${w * 0.64} ${h * 0.58}
              L${w * 0.62} ${h * 0.44} L${w * 0.58} ${h * 0.58} L${w * 0.53} ${h * 0.58} L${w * 0.5} ${h * 0.34} L${w * 0.47} ${h * 0.58}
              L${w * 0.42} ${h * 0.58} L${w * 0.38} ${h * 0.44} L${w * 0.36} ${h * 0.58} L${w * 0.3} ${h * 0.58} Z`} />
          </g>
        )}
        <rect width={w} height={h} fill="none" stroke={ATLAS.ink} strokeWidth={2} />
      </g>
    </g>
  );
};

/**
 * Country name + flag pinned to the map, and a gold outline that flashes when the VO says the
 * name (Lucas 2026-10-14: viewers must recognise every country the story names, not only by its
 * colour). Use for countries the VO names or the map colours; background countries stay unlabelled.
 * - `anchor` (lon/lat) sits on the country's land in the shots where it is named; the tag follows
 *   the camera and fades out near the safe-zone edges (like the island pins).
 * - `from` pops the tag in (first mention); `o` hides it in beats where the frame already has two
 *   text elements or the tag would sit on a prop.
 * - `glow`: frames where the name is spoken; each flashes the outline twice (~1 s).
 */
export const CountryTag: React.FC<{
  cam: GeoCam; f: number; name: string; label: string; flag?: FlagKind; anchor: [number, number];
  from?: number; o?: number; glow?: number[];
}> = ({ cam, f, name, label, flag, anchor, from = -100, o = 1, glow = [] }) => {
  const c = byName.get(name);
  const flash = Math.max(0, ...glow.map((g) => (f >= g && f < g + 30 ? Math.sin((Math.PI * 2 * (f - g)) / 30) ** 2 : 0)));
  const [x, y] = toScreen(cam, ...anchor);
  const SIZE = 52;
  const FW = 58; // flag width
  const tw = label.length * SIZE * 0.6;
  const w = (flag ? FW + 14 : 0) + tw;
  const L = SAFE.left;
  const R = CANVAS.width - SAFE.right;
  const inside = Math.min(x - L, R - x, y - ZONE.top.y1, ZONE.subs.y0 - 20 - y);
  const v = o * interpolate(inside, [0, 40], [0, 1], CLAMP) * (f >= from ? 1 : 0);
  const k = f >= from ? pop(f, from) : 0;
  const left = Math.min(R - w, Math.max(L, x - w / 2));
  const [cx, cy] = base(cam.lon, cam.lat);
  const z = cam.zoom;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
      {c && flash > 0 && (
        <g style={{ translate: `${CX - cx * z}px ${MAP_Y - cy * z}px`, scale: z, transformOrigin: "0 0" }}>
          {/* gold halo + white core: reads on any fill colour */}
          <path d={c.d} fill={ATLAS.white} fillOpacity={0.14 * flash} stroke={ATLAS.gold} strokeOpacity={flash} strokeWidth={16 / z} strokeLinejoin="round" />
          <path d={c.d} fill="none" stroke={ATLAS.white} strokeOpacity={flash} strokeWidth={5 / z} strokeLinejoin="round" />
        </g>
      )}
      {v > 0 && (
        <g opacity={v} style={{ translate: `${left + w / 2}px ${y}px`, scale: k }}>
          {flag && (
            <g style={{ translate: `${-w / 2}px ${-FW * 0.62 - 14}px` }}>
              <Flag kind={flag} w={FW} f={f} />
            </g>
          )}
          <text x={-w / 2 + (flag ? FW + 14 : 0) + tw / 2} y={SIZE * 0.36} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={SIZE}
            fill={ATLAS.white} stroke={ATLAS.ink} strokeWidth={9} strokeLinejoin="round" paintOrder="stroke" letterSpacing={1}>{label}</text>
        </g>
      )}
    </svg>
  );
};

/** Main islands of Hoàng Sa and Trường Sa (approximate positions), drawn as dots: at country zoom the real shapes are sub-pixel. */
const HOANG_SA: [number, number][] = [[112.33, 16.83], [111.61, 16.53], [111.2, 15.78], [112.73, 16.67], [111.5, 17.08], [111.7, 16.45], [112.0, 16.0]];
const TRUONG_SA: [number, number][] = [
  [111.92, 8.64], [114.33, 11.43], [114.36, 10.38], [114.33, 9.88], [114.37, 10.18], [112.92, 7.89], [114.48, 10.38],
  [114.28, 11.05], [115.53, 9.9], [113.85, 8.85], [116.3, 9.73],
];

/**
 * Quần đảo Hoàng Sa + Trường Sa. The island dots (Vietnam's colour) are drawn whenever a frame
 * includes Vietnam's whole coast. Names follow the "map pin" look (Lucas 2026-10-14): one red dot
 * with a white ring per archipelago, a white name with a dark outline beside it, pinned to the map
 * so it moves with the camera, and faded in only while the pin is inside the safe stage (so it
 * appears in the shots the camera goes to, never as a fixed overlay). Fill "Paracel Is." /
 * "Spratly Is." with the same colour in `fills` too.
 */
export const VnIslands: React.FC<{ cam: GeoCam; f: number; color: string; o?: number; labels?: boolean }> = ({
  cam, f, color, o = 1, labels = true,
}) => {
  const group = (pts: [number, number][]) => pts.map(([lo, la]) => toScreen(cam, lo, la));
  const centre = (ps: [number, number][]) => [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
  const hs = group(HOANG_SA);
  const ts = group(TRUONG_SA);
  const L = SAFE.left;
  const R = CANVAS.width - SAFE.right;
  const T = ZONE.top.y1;
  const B = ZONE.subs.y0 - 20;
  const SIZE = 42; // Lucas 2026-10-14: a touch under the 48 px rule, these are background map names
  const pins = [
    { text: "Hoàng Sa", c: centre(hs), above: true },
    { text: "Trường Sa", c: centre(ts), above: false },
  ];
  // names only when the camera is close enough to tell the two archipelagos apart (wide Asia shots: dots only)
  const near = interpolate(Math.hypot(pins[0].c[0] - pins[1].c[0], pins[0].c[1] - pins[1].c[1]), [200, 300], [0, 1], CLAMP);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
        {[...hs, ...ts].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill={color} />
        ))}
        {labels && pins.map(({ text, c: [x, y], above }) => {
          // fade in while the pin is inside the safe stage, out as the camera leaves
          const inside = Math.min(x - L, R - x, y - T, B - y);
          const v = near * interpolate(inside, [0, 40], [0, 1], CLAMP);
          if (v <= 0) return null;
          const w = text.length * SIZE * 0.55;
          // Hoàng Sa: name centred above the dot; Trường Sa: name to the right (left if no room)
          const tx = above ? Math.min(R - w / 2, Math.max(L + w / 2, x)) : x + 22 + w <= R ? x + 22 + w / 2 : x - 22 - w / 2;
          const ty = above ? y - 26 : y + SIZE * 0.36;
          return (
            <g key={text} opacity={v}>
              <circle cx={x} cy={y} r={11} fill="#E53935" stroke={ATLAS.white} strokeWidth={4} />
              <text x={tx} y={ty} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={SIZE}
                fill={ATLAS.white} stroke="rgba(10,20,30,0.85)" strokeWidth={8} strokeLinejoin="round" paintOrder="stroke">{text}</text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

export type PegLook = { body: string; trim?: string; hat?: "top" | "songkok" | "none"; hair?: string; skin?: string };

/**
 * Toy peg character (placeholder until the AI cut-outs exist): big head,
 * round body, no legs. Feet at (x, y). mood: happy / sad (tears) / shocked.
 */
export const Peg: React.FC<{
  x: number; y: number; s?: number; look: PegLook; mood?: "happy" | "sad" | "shocked" | "calm";
  flag?: FlagKind; f: number; at?: number; o?: number;
}> = ({ x, y, s = 1, look, mood = "calm", flag, f, at = -100, o = 1 }) => {
  const k = s * pop(f, at);
  const skin = look.skin ?? "#F2C7A0";
  const bob = Math.sin(f / 9) * 4;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g style={{ translate: `${x}px ${y + bob}px`, scale: k, rotate: `${2.5 * Math.sin(f / 14)}deg` }} stroke={ATLAS.ink} strokeWidth={4} strokeLinejoin="round">
        <ellipse cx={0} cy={0} rx={46} ry={11} fill="#000" opacity={0.25} stroke="none" />
        <path d="M -42 0 Q -46 -80 -30 -98 L 30 -98 Q 46 -80 42 0 Z" fill={look.body} />
        {look.trim && <path d="M -6 -98 L 6 -98 L 4 0 L -4 0 Z" fill={look.trim} strokeWidth={2} />}
        <circle cx={0} cy={-142} r={52} fill={skin} />
        {look.hair && <path d="M -52 -150 Q -48 -200 0 -198 Q 50 -198 52 -150 Q 30 -172 0 -170 Q -30 -170 -52 -150 Z" fill={look.hair} />}
        {look.hat === "top" && <g><rect x={-38} y={-232} width={76} height={58} rx={4} fill="#1D1D1D" /><rect x={-58} y={-180} width={116} height={12} rx={6} fill="#1D1D1D" /></g>}
        {look.hat === "songkok" && <path d="M -46 -176 L -40 -214 L 40 -214 L 46 -176 Z" fill="#1D1D1D" />}
        <g stroke="none" fill={ATLAS.ink}>
          <circle cx={-18} cy={-142} r={mood === "shocked" ? 7 : 5} />
          <circle cx={18} cy={-142} r={mood === "shocked" ? 7 : 5} />
        </g>
        {mood === "happy" && <path d="M -16 -118 Q 0 -104 16 -118" fill="none" strokeWidth={4} />}
        {mood === "calm" && <path d="M -12 -116 L 12 -116" fill="none" strokeWidth={4} />}
        {mood === "shocked" && <ellipse cx={0} cy={-112} rx={8} ry={10} fill={ATLAS.ink} />}
        {mood === "sad" && (
          <g>
            <path d="M -14 -108 Q 0 -120 14 -108" fill="none" strokeWidth={4} />
            {[0, 1].map((i) => {
              const t = ((f / 18 + i * 0.5) % 1);
              return <path key={i} d={`M ${i ? 22 : -22} ${-132 + t * 40} q 6 10 0 14 q -6 -4 0 -14 Z`} fill="#7EC8F0" strokeWidth={2} opacity={1 - t} />;
            })}
          </g>
        )}
      </g>
      {flag && <g style={{ translate: `${x + 52 * s}px ${y - 190 * s}px`, scale: s }}><Flag kind={flag} f={f} /></g>}
    </svg>
  );
};

/** Pop-in wrapper for any SVG sticker drawn around (0, 0). */
export const Sticker: React.FC<{ x: number; y: number; f: number; at: number; out?: number; s?: number; children: React.ReactNode }> = ({
  x, y, f, at, out, s = 1, children,
}) => (
  <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: out === undefined ? 1 : 1 - prog(f, out, 5) }}>
    {/* ambient float so a held sticker never freezes */}
    <g style={{ translate: `${x}px ${y + 5 * Math.sin(f / 12 + x / 50)}px`, scale: s * pop(f, at) }}>{children}</g>
  </svg>
);

/**
 * Toy character from an image cut-out (transparent PNG), feet at (x, y),
 * `h` px tall. It bobs and sways like a pawn; optional waving flag.
 */
export const PegImg: React.FC<{
  src: string; x: number; y: number; h?: number; flag?: FlagKind; f: number; at?: number; o?: number;
}> = ({ src, x, y, h = 260, flag, f, at = -100, o = 1 }) => {
  const k = pop(f, at);
  // nothing (not even the shadow) before the pawn pops in
  if (k <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div style={{
        position: "absolute", left: x - h * 0.6, top: y - h * 0.04 - 6, width: h * 1.2, height: h * 0.1,
        borderRadius: "50%", background: "rgba(0,0,0,0.25)", scale: k,
      }} />
      <Img src={staticFile(src)} style={{
        position: "absolute", left: x, top: y - h + 4 * Math.sin(f / 9), height: h,
        translate: "-50% 0", scale: k, rotate: `${2.5 * Math.sin(f / 14)}deg`, transformOrigin: "50% 100%",
      }} />
      {flag && (
        <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
          <g style={{ translate: `${x + h * 0.22}px ${y - h * 0.82}px`, scale: k * (h / 260) }}><Flag kind={flag} f={f} /></g>
        </svg>
      )}
    </AbsoluteFill>
  );
};

/** A plain image sticker (prop cut-out) centred on (x, y), `w` px wide, popping in and floating. */
export const ImgSticker: React.FC<{ src: string; x: number; y: number; w: number; f: number; at: number; out?: number }> = ({
  src, x, y, w, f, at, out,
}) => (
  <Img src={staticFile(src)} style={{
    position: "absolute", left: x, top: y + 5 * Math.sin(f / 12 + x / 50), width: w, translate: "-50% -50%",
    scale: pop(f, at), opacity: out === undefined ? 1 : 1 - prog(f, out, 5),
  }} />
);

/** Expanding ring that marks a place (repeats every `period` frames). */
export const Pulse: React.FC<{ x: number; y: number; f: number; color?: string; period?: number; o?: number }> = ({
  x, y, f, color = ATLAS.gold, period = 40, o = 1,
}) => {
  const t = (f % period) / period;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <circle cx={x} cy={y} r={14 + 46 * t} fill="none" stroke={color} strokeWidth={6} opacity={1 - t} />
    </svg>
  );
};

/** Point at fraction p along a screen polyline (e.g. where to put a ship image). */
export const routeHead = (pts: [number, number][], p: number): [number, number] => {
  const segs = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let left = segs.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, p));
  for (let i = 0; i < segs.length; i++) {
    if (left <= segs[i]) {
      const t = segs[i] ? left / segs[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    left -= segs[i];
  }
  return pts[pts.length - 1];
};

/** Dotted route through screen points, drawn on with p (0→1); optional ship at the head. */
export const Route: React.FC<{ pts: [number, number][]; p: number; color?: string; ship?: boolean }> = ({
  pts, p, color = ATLAS.white, ship,
}) => {
  const segs = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let left = total * p;
  let head = pts[0];
  for (let i = 0; i < segs.length; i++) {
    if (left <= segs[i]) {
      const t = left / segs[i];
      head = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
      break;
    }
    left -= segs[i];
    head = pts[i + 1];
  }
  // only the travelled part of the route is drawn (dotted), ship at its head
  const done: [number, number][] = [...pts.filter((_, i) => i === 0 || segs.slice(0, i).reduce((a, b) => a + b, 0) <= total * p), head];
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
      {p > 0 && (
        <path d={done.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ")} fill="none" stroke={color}
          strokeWidth={8} strokeLinecap="round" strokeDasharray="2 20" />
      )}
      {ship && p > 0 && p < 1 && <g style={{ translate: `${head[0]}px ${head[1]}px` }}><Ship /></g>}
    </svg>
  );
};

/** Little sailing ship icon centred on (0, 0). */
export const Ship: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <g style={{ scale: s }} stroke={ATLAS.ink} strokeWidth={3} strokeLinejoin="round">
    <path d="M -40 6 L 40 6 L 28 24 L -28 24 Z" fill="#7A4E2D" />
    <line x1={0} y1={6} x2={0} y2={-52} />
    <path d="M 3 -48 L 30 -10 L 3 -10 Z" fill={ATLAS.white} />
    <path d="M -3 -44 L -26 -10 L -3 -10 Z" fill={ATLAS.white} />
  </g>
);

// ------------------------------------------------------------------ subtitles

/**
 * Karaoke, one line of ≤ 4 words (Lucas 2026-10-13): keywords (`*marked*` in captions) and
 * numbers stay pale yellow for the whole chunk; the word being spoken is gold and 10 % bigger.
 */
export const AtlasSub: SubSkin = ({ lines }) => (
  <div style={{ position: "absolute", left: SAFE.left, right: SAFE.right, bottom: CANVAS.height - SUB_BOTTOM, display: "flex", justifyContent: "center" }}>
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 72, lineHeight: 1.1, textAlign: "center", whiteSpace: "nowrap" }}>
      {lines[0].map((w, k) => (
        <span key={k}>
          {k ? " " : ""}
          <span style={{
            // the active word grows 10 % from its centre (≈ 1 px per letter each side) and the 12 px stroke
            // adds 6 px: reserve that on every word, always, so neighbours never touch and the line never shifts
            display: "inline-block", margin: `0 ${Math.round(w.text.length * 1.1) + 3}px`,
            scale: w.active ? 1.1 : 1, transformOrigin: "50% 80%",
            color: w.active ? "#FFB81C" : w.key ? "#FFE58F" : ATLAS.white,
            WebkitTextStroke: `12px ${ATLAS.ink}`, paintOrder: "stroke fill",
            textShadow: "0 6px 12px rgba(0,0,0,0.45)",
          }}>
            {w.text}
          </span>
        </span>
      ))}
    </div>
  </div>
);

/**
 * One country's outline under the camera, optionally scaled about (lon, lat):
 * e.g. a dashed "+25%" ghost of an island that grew by land reclamation.
 */
export const CountryShape: React.FC<{
  cam: GeoCam; name: string; grow?: number; about?: [number, number]; stroke?: string; fill?: string; dash?: string; o?: number;
  /** extra screen offset in px (an island drifting away) */
  offset?: [number, number];
}> = ({ cam, name, grow = 1, about, stroke = ATLAS.white, fill = "none", dash, o = 1, offset = [0, 0] }) => {
  const c = byName.get(name);
  if (!c) return null;
  const [cx, cy] = base(cam.lon, cam.lat);
  const [ax, ay] = about ? base(about[0], about[1]) : [cx, cy];
  const z = cam.zoom;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g style={{ translate: `${CX - cx * z + offset[0]}px ${MAP_Y - cy * z + offset[1]}px`, scale: z, transformOrigin: "0 0" }}>
        <g style={{ translate: `${ax * (1 - grow)}px ${ay * (1 - grow)}px`, scale: grow, transformOrigin: "0 0" }}>
          <path d={c.d} fill={fill} stroke={stroke} strokeWidth={5 / (z * grow)} strokeDasharray={dash} strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
};

/**
 * An illustrative region inside one country (e.g. a delta), drawn in map space and clipped
 * to that country's land so it never spills into the sea. `ring` is lon/lat; mark it
 * "minh hoạ" in the description unless it comes from an official boundary.
 */
export const RegionFill: React.FC<{
  cam: GeoCam; id: string; country: string; ring: [number, number][]; fill: string; o?: number;
  stroke?: string; dash?: string; pattern?: string;
}> = ({ cam, id, country, ring, fill, o = 1, stroke = ATLAS.white, dash = "10 8", pattern }) => {
  const c = byName.get(country);
  if (!c || o <= 0) return null;
  const [cx, cy] = base(cam.lon, cam.lat);
  const z = cam.zoom;
  const d = `${ring.map(([lo, la], i) => `${i ? "L" : "M"} ${base(lo, la).join(" ")}`).join(" ")} Z`;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <defs>
        <clipPath id={`rf-${id}`}><path d={c.d} /></clipPath>
      </defs>
      <g style={{ translate: `${CX - cx * z}px ${MAP_Y - cy * z}px`, scale: z, transformOrigin: "0 0" }}>
        <path d={d} fill={pattern ?? fill} clipPath={`url(#rf-${id})`} />
        <path d={d} fill="none" stroke={stroke} strokeWidth={3 / z} strokeDasharray={dash.split(" ").map((v) => Number(v) / z).join(" ")}
          clipPath={`url(#rf-${id})`} />
      </g>
    </svg>
  );
};

/**
 * A band of colour hugging the coasts of `countries` inside `ring` (lon/lat), `width` px wide on
 * screen: an illustrative "sphere of influence along the coast" (e.g. old Brunei around Borneo).
 * The countries' outlines are stroked twice as wide and clipped to their own land, so only the
 * inland half shows; `ring` keeps it to one island. Mark it "minh hoạ" in the description.
 */
export const CoastBand: React.FC<{
  cam: GeoCam; id: string; countries: string[]; ring: [number, number][]; color: string; width?: number; o?: number;
}> = ({ cam, id, countries, ring, color, width = 26, o = 1 }) => {
  const cs = countries.map((n) => byName.get(n)).filter((c): c is Country => !!c);
  if (!cs.length || o <= 0) return null;
  const [cx, cy] = base(cam.lon, cam.lat);
  const z = cam.zoom;
  const d = cs.map((c) => c.d).join(" ");
  const r = `${ring.map(([lo, la], i) => `${i ? "L" : "M"} ${base(lo, la).join(" ")}`).join(" ")} Z`;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <defs>
        <clipPath id={`cb-land-${id}`}><path d={d} /></clipPath>
        <clipPath id={`cb-ring-${id}`}><path d={r} /></clipPath>
      </defs>
      <g style={{ translate: `${CX - cx * z}px ${MAP_Y - cy * z}px`, scale: z, transformOrigin: "0 0" }}>
        <g clipPath={`url(#cb-ring-${id})`}>
          <path d={d} fill="none" stroke={color} strokeWidth={(2 * width) / z} strokeLinejoin="round" clipPath={`url(#cb-land-${id})`} />
        </g>
      </g>
    </svg>
  );
};

/** Rubber stamp slammed onto the screen (only the stamp moves, no camera shake). */
export const Stamp: React.FC<{ text: string; x: number; y: number; f: number; at: number; out?: number; color?: string }> = ({
  text, x, y, f, at, out, color = ATLAS.red,
}) => {
  if (f < at) return null;
  const s = interpolate(f, [at, at + 6], [1.9, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });
  const w = text.length * 46 + 70;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: Math.min(prog(f, at, 3), out === undefined ? 1 : 1 - prog(f, out, 5)) }}>
      <g style={{ translate: `${x}px ${y}px`, scale: s, rotate: "-10deg" }}>
        <rect x={-w / 2} y={-50} width={w} height={100} rx={12} fill="rgba(247,242,232,0.85)" stroke={color} strokeWidth={9} />
        <text y={24} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={68} fill={color} letterSpacing={4}>{text}</text>
      </g>
    </svg>
  );
};

/** Big "?" sticker. */
export const Question: React.FC<{ x: number; y: number; f: number; at: number; out?: number; s?: number }> = ({ x, y, f, at, out, s = 1.1 }) => (
  <Sticker x={x} y={y} f={f} at={at} out={out} s={s}>
    <circle r={40} fill={ATLAS.gold} stroke={ATLAS.ink} strokeWidth={5} />
    <text y={22} textAnchor="middle" fontFamily={FONT} fontSize={64} fontWeight={800} fill={ATLAS.ink}>?</text>
  </Sticker>
);

// ------------------------------------------------------------------ episode helpers (shared by every Video.tsx)

type TimedLine = { id: string; start: number; end: number };

/** `at(id, k)`: absolute frame where VO line `id` is k of the way through (k = 0 → its first word). */
export const beats = (timing: { lines: TimedLine[] }, fps: number) => {
  const line = (id: string) => {
    const l = timing.lines.find((x) => x.id === id);
    if (!l) throw new Error(`No VO line "${id}" in the timing file`);
    return l;
  };
  const at = (id: string, k = 0) => Math.round((line(id).start + (line(id).end - line(id).start) * k) * fps);
  return { line, at };
};

/** 0 → 1 fade-in from frame a, back to 0 from frame b (5-frame fades). */
export const show = (f: number, a: number, b = Infinity) => Math.min(prog(f, a, 5), b === Infinity ? 1 : 1 - prog(f, b, 5));

/** lon/lat points → screen points under a camera. */
export const pts = (cam: GeoCam, ll: number[][]): [number, number][] => ll.map(([lo, la]) => toScreen(cam, lo, la));

/** Fraction of a screen polyline's length reached at vertex i (to time things that ride along a route). */
export const vertexP = (ps: [number, number][], i: number) => {
  const len = (n: number) => ps.slice(1, n + 1).reduce((s, q, k) => s + Math.hypot(q[0] - ps[k][0], q[1] - ps[k][1]), 0);
  return len(i) / len(ps.length - 1);
};

/** Count-up text: from → to between frames a and a + d, formatted vi-VN. */
export const count = (f: number, a: number, d: number, to: number, from = 0, digits = 0) =>
  interpolate(f, [a, a + d], [from, to], CLAMP).toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
