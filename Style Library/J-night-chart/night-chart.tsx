/**
 * J "NIGHT CHART": the Inset Maps kit, 9:16 (Channel Bible §5, Lucas 2026-10-16).
 *
 * A dark vector map: ink ocean, slate land, story places filled in side colours that stay the
 * same for the whole episode, disputed areas hatched in the colours of the sides that claim them.
 * No characters, no relief texture. Coral is the signature accent (spoken word, key marks).
 *
 * Camera, projection and timing helpers come from the I "Toy Atlas" kit (same Mercator base,
 * so `toScreen`, `camAt`, `seamKeys` and `pts` work unchanged): flights only on a change of place,
 * eased, ≥ 20 frames, plus the slow push. Geometry: countries from world-atlas, US states from
 * us-atlas (Census), lakes from Natural Earth (`src/geo/*.json`, cut with scripts/geo-lakes.mjs).
 */
import { loadFont } from "@remotion/google-fonts/Manrope";
import { geoBounds, geoCentroid, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { AbsoluteFill, Easing, Img, interpolate, staticFile } from "remotion";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import usStates from "us-atlas/states-10m.json";
import world10 from "world-atlas/countries-10m.json";
import world50 from "world-atlas/countries-50m.json";
import greatLakes from "../../src/geo/great-lakes.json";
import { MAP_Y, toScreen, type GeoCam } from "../I-toy-atlas/toy-atlas";
import { CANVAS, CLAMP, CX, pop, prog, SAFE, SUB_BOTTOM } from "../kit-common";
import type { SubSkin } from "../subs";

export { beats, camAt, pts, seamKeys, toScreen, type GeoCam } from "../I-toy-atlas/toy-atlas";

/**
 * Exits leave faster than entrances came in (about half), easing in: an element that is going
 * away should not linger (rule from whaleyxbt/claude-motion, Lucas 2026-10-17).
 */
export const EXIT = Easing.bezier(0.6, 0, 0.9, 0.35);
/** 1 → 0 over d frames from `out` (ease-in); 1 while `out` is undefined. */
export const fadeOut = (f: number, out?: number, d = 5) =>
  out === undefined ? 1 : 1 - interpolate(f, [out, out + d], [0, 1], { ...CLAMP, easing: EXIT });
/** Visible from a (8-frame ease-out entrance) until b (4-frame ease-in exit). */
export const show = (f: number, a: number, b?: number) => Math.min(prog(f, a, 8), fadeOut(f, b, 4));

export const NIGHT = {
  ocean: "#0B1420",
  oceanLift: "#13233A",
  land: "#2A323C",
  coast: "#4B5866",
  border: "#5D6B7A",
  river: "#7FD3FF",
  white: "#F4F6F8",
  muted: "#9AA6B2",
  ink: "#05090E",
  card: "rgba(9,16,26,0.88)",
  /** signature accent: spoken word, key marks */
  coral: "#FF6B4A",
  /** sides (keep one colour per side for the whole episode) */
  a: "#2EC4B6",
  b: "#F4B942",
  c: "#9B8CFF",
} as const;

export const FONT = loadFont("normal", { weights: ["700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily;

/** Top zone (key cards) and stage, as in the Toy Atlas layout. */
export const ZONE = {
  top: { y: 340, y1: SAFE.top + 230 },
  subs: { y0: SUB_BOTTOM - 100 },
} as const;

// ------------------------------------------------------------------ geometry (computed once)

type Shape = { name: string; d: string; bounds: [[number, number], [number, number]] };
type Geo = Feature<Geometry, { name: string }>;

// same base projection as the Toy Atlas kit (world width = 1080 px at zoom 1)
const BASE = CANVAS.width / (2 * Math.PI);
const baseProj = geoMercator().scale(BASE).translate([0, 0]).center([0, 0]);
const basePath = geoPath(baseProj).digits(4);
const base = (lon: number, lat: number) => baseProj([lon, lat]) as [number, number];

const topo = (t: unknown, key: string): Geo[] => {
  const tt = t as Topology;
  return (feature(tt, tt.objects[key]) as FeatureCollection<Geometry, { name: string }>).features;
};
const shape = (f: Geo): Shape => ({ name: f.properties.name, d: basePath(f) ?? "", bounds: geoBounds(f) });

/** Countries a story zooms into get the 10m geometry. */
const FINE = new Set(["Canada", "United States of America"]);
const COUNTRIES: Shape[] = [
  ...topo(world50, "countries").filter((f) => !FINE.has(f.properties.name)),
  ...topo(world10, "countries").filter((f) => FINE.has(f.properties.name)),
].map(shape);
const STATE_GEO = topo(usStates, "states");
const STATES: Shape[] = STATE_GEO.map(shape);
const LAKES: Shape[] = (greatLakes as FeatureCollection<Geometry, { name: string }>).features.map(shape);

const byName = new Map([...COUNTRIES, ...STATES, ...LAKES.filter((l) => l.name)].map((s) => [s.name, s]));

/**
 * Part of a state as its own shape: the polygons of a MultiPolygon whose centroid passes `keep`
 * (e.g. Michigan's Upper Peninsula = parts north of 45.9°). Registered under `name`.
 */
export const definePart = (name: string, state: string, keep: (lon: number, lat: number) => boolean) => {
  const f = STATE_GEO.find((s) => s.properties.name === state);
  if (!f || byName.has(name)) return;
  const polys = f.geometry.type === "MultiPolygon" ? (f.geometry as MultiPolygon).coordinates : [(f.geometry as Polygon).coordinates];
  const part: Geo = {
    type: "Feature",
    properties: { name },
    geometry: { type: "MultiPolygon", coordinates: polys.filter((p) => keep(...(geoCentroid({ type: "Polygon", coordinates: p }) as [number, number]))) },
  };
  byName.set(name, shape(part));
};

// ------------------------------------------------------------------ map

/**
 * A place in a side colour (v2 look, Lucas 2026-10-17: light fill + glowing edge instead of a flat
 * block). `hatch` stripes it in two colours (disputed / claimed by both); `edge: false` drops the glow.
 */
export type Fill = { name: string; color: string; hatch?: string; o?: number; edge?: boolean };

/** Map-space group under the camera (strokes divide by zoom to stay constant on screen). */
const useView = (cam: GeoCam) => {
  const [cx, cy] = base(cam.lon, cam.lat);
  return { z: cam.zoom, style: { translate: `${CX - cx * cam.zoom}px ${MAP_Y - cy * cam.zoom}px`, scale: cam.zoom, transformOrigin: "0 0" } };
};

const HatchDef: React.FC<{ id: string; a: string; b: string; z: number }> = ({ id, a, b, z }) => (
  <pattern id={id} patternUnits="userSpaceOnUse" width={28 / z} height={28 / z} patternTransform="rotate(45)">
    <rect width={14 / z} height={28 / z} fill={a} />
    <rect x={14 / z} width={14 / z} height={28 / z} fill={b} />
  </pattern>
);

/**
 * The map: ocean, neutral land, lakes, US state lines, story fills. Places outside the story stay
 * neutral and unlabelled. `states` toggles the state lines (US stories).
 */
export const NightMap: React.FC<{ cam: GeoCam; fills?: Fill[]; f?: number; states?: boolean }> = ({ cam, fills = [], f = 0, states = true }) => {
  const { z, style } = useView(cam);
  const half = (CANVAS.height / 2 / (BASE * z)) * (180 / Math.PI) * 1.4;
  const near = (s: Shape) =>
    s.bounds[1][0] > cam.lon - half && s.bounds[0][0] < cam.lon + half && s.bounds[1][1] > cam.lat - half && s.bounds[0][1] < cam.lat + half;
  const countries = COUNTRIES.filter(near);
  const stateShapes = states ? STATES.filter(near) : [];
  const lakes = LAKES.filter(near);
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT.ocean }}>
      <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
        <defs>
          <radialGradient id="nc-sea" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor={NIGHT.oceanLift} />
            <stop offset="100%" stopColor={NIGHT.ocean} />
          </radialGradient>
          {fills.filter((x) => x.hatch).map((x) => <HatchDef key={x.name} id={`nc-h-${x.name.replace(/\W/g, "")}`} a={x.color} b={x.hatch!} z={z} />)}
          {/* faint relief on the land (map space, so it moves with the map; grain size follows the zoom) */}
          <filter id="nc-relief" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency={0.02 * z} numOctaves={3} seed={5} result="n" />
            <feDiffuseLighting in="n" surfaceScale={1.4} lightingColor="#ffffff" result="lit">
              <feDistantLight azimuth={315} elevation={50} />
            </feDiffuseLighting>
            <feComponentTransfer in="lit" result="soft">
              <feFuncR type="linear" slope={0.16} intercept={0.88} />
              <feFuncG type="linear" slope={0.16} intercept={0.88} />
              <feFuncB type="linear" slope={0.16} intercept={0.88} />
            </feComponentTransfer>
            <feComposite in="soft" in2="SourceGraphic" operator="in" result="litLand" />
            <feBlend in="SourceGraphic" in2="litLand" mode="multiply" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#nc-sea)" />
        <g style={style}>
          {/* soft coastline glow */}
          <g fill="none" stroke={NIGHT.coast} strokeOpacity={0.35} strokeWidth={10 / z} strokeLinejoin="round">
            {countries.map((c) => <path key={c.name} d={c.d} />)}
          </g>
          <g filter="url(#nc-relief)">
            {countries.map((c) => <path key={c.name} d={c.d} fill={NIGHT.land} />)}
            {stateShapes.map((s) => <path key={s.name} d={s.d} fill={NIGHT.land} />)}
            {fills.map((x) => {
              const s = byName.get(x.name);
              // light fill: the colour reads, the land texture and the borders still show through
              return s ? (
                <path key={x.name} d={s.d} opacity={(x.o ?? 1) * (x.hatch ? 1 : 0.5)}
                  fill={x.hatch ? `url(#nc-h-${x.name.replace(/\W/g, "")})` : x.color} />
              ) : null;
            })}
          </g>
          {/* lakes above the land: Natural Earth country shapes run across the Great Lakes */}
          {lakes.map((l) => <path key={l.name || l.d.slice(0, 12)} d={l.d} fill="url(#nc-sea)" stroke={NIGHT.coast} strokeOpacity={0.6} strokeWidth={1.4 / z} />)}
          <g fill="none" stroke={NIGHT.border} strokeOpacity={0.7} strokeWidth={1.2 / z} strokeDasharray={`${6 / z} ${5 / z}`}>
            {stateShapes.map((s) => <path key={s.name} d={s.d} />)}
          </g>
          <g fill="none" stroke={NIGHT.muted} strokeOpacity={0.85} strokeWidth={1.8 / z}>
            {countries.map((c) => <path key={c.name} d={c.d} />)}
          </g>
          {/* glowing edge of every story place: soft halo + bright core */}
          {fills.filter((x) => x.edge !== false && !x.hatch).map((x) => {
            const s = byName.get(x.name);
            const o = x.o ?? 1;
            return s ? (
              <g key={`e-${x.name}`} fill="none" strokeLinejoin="round">
                <path d={s.d} stroke={x.color} strokeOpacity={0.35 * o} strokeWidth={14 / z} />
                <path d={s.d} stroke={x.color} strokeOpacity={0.95 * o} strokeWidth={3 / z} />
              </g>
            ) : null;
          })}
        </g>
        <radialGradient id="nc-vig" cx="50%" cy="45%" r="75%">
          <stop offset="60%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
        </radialGradient>
        <rect width="100%" height="100%" fill="url(#nc-vig)" />
        {/* film grain ~0.09, new grain every 2 frames: keeps the dark gradients from banding after
            YouTube's compression, and the frame never looks dead-still */}
        <filter id="nc-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={0.85} numOctaves={1} seed={Math.floor(f / 2)} />
          {/* grey noise, contrast ×3 around mid grey, fully opaque */}
          <feColorMatrix type="matrix" values="1 1 1 0 -1  1 1 1 0 -1  1 1 1 0 -1  0 0 0 0 1" />
        </filter>
        <rect width="100%" height="100%" filter="url(#nc-grain)" opacity={0.09} style={{ mixBlendMode: "soft-light" }} />
      </svg>
    </AbsoluteFill>
  );
};

/** Outline of a named place under the camera (white core + accent halo); `flash` 0–1. */
export const Outline: React.FC<{
  cam: GeoCam; name: string; color?: string; flash?: number; dash?: boolean;
  /** ghost copy moved by [dLon, dLat] (e.g. where old maps put a lake; illustrative) */
  shift?: [number, number];
  /** frame: dashes march along the edge (an outline that stays alive through a long hold) */
  march?: number;
}> = ({ cam, name, color = NIGHT.white, flash = 1, dash, shift, march }) => {
  const s = byName.get(name);
  const { z, style } = useView(cam);
  if (!s || flash <= 0) return null;
  const c: [number, number] = [(s.bounds[0][0] + s.bounds[1][0]) / 2, (s.bounds[0][1] + s.bounds[1][1]) / 2];
  const [dx, dy] = shift ? [0, 1].map((k) => base(c[0] + shift[0], c[1] + shift[1])[k] - base(...c)[k]) : [0, 0];
  const dashed = dash || march !== undefined;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
      <g style={style}>
        <g style={{ translate: `${dx}px ${dy}px` }}>
          <path d={s.d} fill={color} fillOpacity={(shift ? 0 : 0.12) * flash} stroke={color} strokeOpacity={0.55 * flash} strokeWidth={12 / z} strokeLinejoin="round" />
          <path d={s.d} fill="none" stroke={shift ? color : NIGHT.white} strokeOpacity={flash} strokeWidth={3 / z} strokeLinejoin="round"
            strokeDasharray={dashed ? `${10 / z} ${8 / z}` : undefined} strokeDashoffset={march !== undefined ? -(march * 0.8) / z : undefined} />
        </g>
      </g>
    </svg>
  );
};

/**
 * A lon/lat polygon on the map (e.g. a disputed strip): solid or hatched in two side colours,
 * optionally clipped to a named place so it never spills into water. Mark "approximate" in the
 * description unless the ring comes from an official boundary.
 */
export const GeoArea: React.FC<{
  cam: GeoCam; id: string; ring: [number, number][]; color: string; hatch?: string; clipTo?: string; o?: number; edge?: string;
}> = ({ cam, id, ring, color, hatch, clipTo, o = 1, edge }) => {
  const { z, style } = useView(cam);
  if (o <= 0) return null;
  const clip = clipTo ? byName.get(clipTo) : undefined;
  const d = `${ring.map(([lo, la], i) => `${i ? "L" : "M"} ${base(lo, la).join(" ")}`).join(" ")} Z`;
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <defs>
        {hatch && <HatchDef id={`ga-h-${id}`} a={color} b={hatch} z={z} />}
        {clip && <clipPath id={`ga-c-${id}`}><path d={clip.d} /></clipPath>}
      </defs>
      <g style={style}>
        <path d={d} fill={hatch ? `url(#ga-h-${id})` : color} clipPath={clip ? `url(#ga-c-${id})` : undefined} />
        {edge && <path d={d} fill="none" stroke={edge} strokeWidth={4 / z} strokeLinejoin="round" clipPath={clip ? `url(#ga-c-${id})` : undefined} />}
        {/* us-atlas states run out into the lakes to the state line: put the water back on top */}
        {LAKES.map((l) => <path key={l.name || l.d.slice(0, 12)} d={l.d} fill="url(#nc-sea)" stroke={NIGHT.coast} strokeOpacity={0.6} strokeWidth={1.4 / z} />)}
      </g>
    </svg>
  );
};

/** A line through lon/lat points, drawn on with p (0 → 1); `dash` for historic / proposed lines. */
export const GeoLine: React.FC<{
  cam: GeoCam; ll: [number, number][]; p: number; color: string; w?: number; dash?: boolean; o?: number;
  /** soft halo in the line's colour */
  glow?: boolean;
  /** frame: light dots run along the line (direction of travel), keeps a held line alive */
  flow?: number;
}> = ({ cam, ll, p, color, w = 7, dash, o = 1, glow, flow }) => {
  if (p <= 0 || o <= 0) return null;
  const ps = ll.map(([lo, la]) => toScreen(cam, lo, la));
  const d = ps.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
  const len = ps.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - ps[i][0], q[1] - ps[i][1]), 0);
  const id = `${ll[0].join('_')}-${color}`.replace(/[^\w-]/g, "");
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <defs>
        {/* reveal along the line: a growing stroke mask (clipPath would ignore strokes) */}
        <mask id={`gl-${id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={CANVAS.width} height={CANVAS.height}>
          <path d={d} fill="none" stroke="#fff" strokeWidth={w + 16} strokeDasharray={`${len * p} ${len + 1}`} />
        </mask>
      </defs>
      <g mask={`url(#gl-${id})`}>
        {glow && <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={w * 3.2} strokeLinecap="round" strokeLinejoin="round" />}
        <path d={d} fill="none" stroke={NIGHT.ink} strokeWidth={w + 6} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={dash ? `${w * 2.4} ${w * 1.8}` : undefined} />
        <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={dash ? `${w * 2.4} ${w * 1.8}` : undefined} />
        {flow !== undefined && (
          <path d={d} fill="none" stroke={NIGHT.white} strokeOpacity={0.9} strokeWidth={w * 0.55} strokeLinecap="round"
            strokeDasharray={`1 ${w * 4}`} strokeDashoffset={-flow * 2.2} />
        )}
      </g>
    </svg>
  );
};

/**
 * A movement on the map (troops, ships, a push): a thick line through lon/lat points, drawn on
 * with p, with flowing dots and an arrowhead at the moving end. Keeps long holds alive.
 */
export const Arrow: React.FC<{ cam: GeoCam; ll: [number, number][]; p: number; f: number; color: string; w?: number; o?: number }> = ({
  cam, ll, p, f, color, w = 12, o = 1,
}) => {
  if (p <= 0 || o <= 0) return null;
  const ps = ll.map(([lo, la]) => toScreen(cam, lo, la));
  const segs = ps.slice(1).map((q, i) => Math.hypot(q[0] - ps[i][0], q[1] - ps[i][1]));
  let left = segs.reduce((a, b) => a + b, 0) * p;
  let i = 0;
  while (i < segs.length - 1 && left > segs[i]) left -= segs[i++];
  const t = segs[i] ? Math.min(1, left / segs[i]) : 1;
  const head: [number, number] = [ps[i][0] + (ps[i + 1][0] - ps[i][0]) * t, ps[i][1] + (ps[i + 1][1] - ps[i][1]) * t];
  const ang = (Math.atan2(ps[i + 1][1] - ps[i][1], ps[i + 1][0] - ps[i][0]) * 180) / Math.PI;
  return (
    <>
      <GeoLine cam={cam} ll={ll} p={p} color={color} w={w} o={o} glow flow={f} />
      <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
        <g style={{ translate: `${head[0]}px ${head[1]}px`, rotate: `${ang}deg` }}>
          <path d={`M ${w * 2.4} 0 L ${-w * 0.8} ${-w * 1.9} L ${-w * 0.8} ${w * 1.9} Z`} fill={color} stroke={NIGHT.ink} strokeWidth={5}
            strokeLinejoin="round" />
        </g>
      </svg>
    </>
  );
};

/** Pill label (dark, white text, coloured edge) centred on (x, y). Text ≥ 48 px. */
const Pill: React.FC<{ text: string; x: number; y: number; edge?: string; size?: number; s?: number; o?: number; color?: string }> = ({
  text, x, y, edge = NIGHT.muted, size = 50, s = 1, o = 1, color = NIGHT.white,
}) => {
  const w = text.length * size * 0.62 + 46;
  const h = size + 30;
  return (
    <g opacity={o} style={{ translate: `${x}px ${y}px`, scale: s }}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={NIGHT.card} stroke={edge} strokeWidth={4} />
      <text y={size * 0.36} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={size} fill={color}>{text}</text>
    </g>
  );
};

/** Keeps a map-pinned label inside the safe stage: fades it out near the edges. */
const insideSafe = (x: number, y: number, w: number) => {
  const m = Math.min(x - w / 2 - SAFE.left, CANVAS.width - SAFE.right - (x + w / 2), y - ZONE.top.y1, ZONE.subs.y0 - 30 - y);
  return interpolate(m, [-20, 30], [0, 1], CLAMP);
};

/**
 * Place name pinned to the map (state / country), coloured edge = its side; the outline flashes
 * twice on each `glow` frame (when the VO says the name). Bible §5 `CountryTag`, flag-less for US states.
 */
export const PlaceTag: React.FC<{
  cam: GeoCam; f: number; name: string; label: string; anchor: [number, number]; color?: string; from?: number; o?: number; glow?: number[];
}> = ({ cam, f, name, label, anchor, color = NIGHT.muted, from = -100, o = 1, glow = [] }) => {
  const flash = Math.max(0, ...glow.map((g) => (f >= g && f < g + 30 ? Math.sin((Math.PI * 2 * (f - g)) / 30) ** 2 : 0)));
  const [x, y] = toScreen(cam, ...anchor);
  const v = o * (f >= from ? 1 : 0) * insideSafe(x, y, label.length * 31 + 46);
  return (
    <>
      <Outline cam={cam} name={name} color={color} flash={flash} />
      {v > 0 && (
        <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
          <Pill text={label} x={x} y={y} edge={color} s={pop(f, from)} o={v} />
        </svg>
      )}
    </>
  );
};

/** City / site pin: coral dot with a white ring, pill label beside it (`side`). */
export const Pin: React.FC<{
  cam: GeoCam; f: number; at: [number, number]; label?: string; from?: number; o?: number; side?: "right" | "left" | "above" | "below"; color?: string;
}> = ({ cam, f, at, label, from = -100, o = 1, side = "right", color = NIGHT.coral }) => {
  const [x, y] = toScreen(cam, ...at);
  if (f < from || o <= 0) return null;
  const s = pop(f, from);
  const w = label ? label.length * 31 + 46 : 0;
  const [lx, ly] = side === "right" ? [x + 30 + w / 2, y] : side === "left" ? [x - 30 - w / 2, y] : side === "above" ? [x, y - 64] : [x, y + 64];
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g style={{ translate: `${x}px ${y}px`, scale: s }}>
        <circle r={22 + 10 * Math.sin(f / 8) ** 2} fill={color} opacity={0.25} />
        <circle r={13} fill={color} stroke={NIGHT.white} strokeWidth={5} />
      </g>
      {label && <Pill text={label} x={lx} y={ly} s={s} o={insideSafe(lx, ly, w)} />}
    </svg>
  );
};

/**
 * Measurement between two screen points: end ticks + line + pill "8 mi · 13 km" at the middle,
 * pushed `offset` px sideways (perpendicular). Draws on from `from`.
 */
export const MeasureTag: React.FC<{
  a: [number, number]; b: [number, number]; text: string; f: number; from: number; out?: number; offset?: number;
  /** label position in screen px (overrides `offset`), e.g. above a thin horizontal strip */
  at?: [number, number];
}> = ({ a, b, text, f, from, out, offset = 0, at }) => {
  if (f < from) return null;
  const p = prog(f, from, 12);
  const o = fadeOut(f, out);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const tick = (q: [number, number]) => `M ${q[0] - nx * 16} ${q[1] - ny * 16} L ${q[0] + nx * 16} ${q[1] + ny * 16}`;
  const m: [number, number] = at ?? [(a[0] + b[0]) / 2 + nx * offset, (a[1] + b[1]) / 2 + ny * offset];
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g stroke={NIGHT.white} strokeWidth={4} strokeLinecap="round">
        <path d={`${tick(a)} ${tick(b)}`} opacity={p} />
        <path d={`M ${a[0]} ${a[1]} L ${a[0] + (b[0] - a[0]) * p} ${a[1] + (b[1] - a[1]) * p}`} />
      </g>
      {(offset !== 0 || at) && <path d={`M ${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2} L ${m[0]} ${m[1]}`} stroke={NIGHT.white} strokeWidth={3} opacity={p} />}
      <Pill text={text} x={m[0]} y={m[1]} edge={NIGHT.coral} s={pop(f, from + 8)} />
    </svg>
  );
};

/**
 * Key card in the top zone: one big value (≤ 3 words: a number, a year, a date, a verdict) and an
 * optional small line under it. Bible §5: at most 2 text blocks on screen besides subtitles.
 */
export const KeyCard: React.FC<{
  value: string; sub?: string; f: number; at: number; out?: number; x?: number; y?: number; color?: string; size?: number;
}> = ({ value, sub, f, at, out, x = CX, y = ZONE.top.y, color = NIGHT.white, size = 132 }) => {
  if (f < at) return null;
  const o = fadeOut(f, out);
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g style={{ translate: `${x}px ${y + 24 * (1 - prog(f, at, 8))}px`, scale: pop(f, at) }}>
        {/* soft glow in the card's colour behind the value */}
        <text textAnchor="middle" y={size * 0.34} fontFamily={FONT} fontWeight={800} fontSize={size} fill={color} opacity={0.45}
          letterSpacing={-1} style={{ filter: `blur(${size * 0.16}px)` }}>{value}</text>
        <text textAnchor="middle" y={size * 0.34} fontFamily={FONT} fontWeight={800} fontSize={size} fill={color}
          stroke={NIGHT.ink} strokeWidth={12} paintOrder="stroke" strokeLinejoin="round" letterSpacing={-1}>{value}</text>
        {sub && (
          <text textAnchor="middle" y={size * 0.34 + 70} fontFamily={FONT} fontWeight={700} fontSize={48} fill={NIGHT.muted}
            stroke={NIGHT.ink} strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" letterSpacing={2}>{sub.toUpperCase()}</text>
        )}
        {/* coral underline: the channel's mark under every key number */}
        <rect x={-60} y={size * 0.34 + (sub ? 96 : 30)} width={120} height={8} rx={4} fill={NIGHT.coral} />
      </g>
    </svg>
  );
};

/** Compass that settles, then spins wildly from `spinAt` (the 1844 iron story). Centred on (x, y). */
export const Compass: React.FC<{ x: number; y: number; f: number; at: number; spinAt: number; out?: number; r?: number }> = ({
  x, y, f, at, spinAt, out, r = 120,
}) => {
  if (f < at) return null;
  const o = fadeOut(f, out);
  const t = Math.max(0, f - spinAt);
  // calm sway, then an ever-faster spin with a jitter (only the needle moves, never the camera)
  const angle = f < spinAt ? 8 * Math.sin(f / 10) : 8 * Math.sin(spinAt / 10) + t * t * 0.9 + 25 * Math.sin(t * 1.7);
  return (
    <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", opacity: o }}>
      <g style={{ translate: `${x}px ${y}px`, scale: pop(f, at) }}>
        <circle r={r} fill={NIGHT.card} stroke={NIGHT.white} strokeWidth={6} />
        <circle r={r - 18} fill="none" stroke={NIGHT.muted} strokeWidth={2} strokeDasharray="4 14" />
        <text y={-r + 58} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={48} fill={NIGHT.white}>N</text>
        <g style={{ rotate: `${angle}deg` }}>
          <path d={`M 0 ${-r + 26} L 16 0 L -16 0 Z`} fill={NIGHT.coral} />
          <path d={`M 0 ${r - 26} L 16 0 L -16 0 Z`} fill={NIGHT.white} />
        </g>
        <circle r={10} fill={NIGHT.ink} stroke={NIGHT.white} strokeWidth={3} />
      </g>
    </svg>
  );
};

/**
 * The channel's signature: an inset box (a second, closer map) over the main map, with a leader
 * line to the spot it magnifies. Use when the detail is too small at the story's zoom (a strip,
 * a bay, a border bend). `children(cam)` draws the inset's own layers with the inset camera.
 * Box in screen px (keep it in the stage, above the subtitles); `target` is lon/lat on `mainCam`.
 */
export const Inset: React.FC<{
  x: number; y: number; w: number; h: number; cam: GeoCam; mainCam: GeoCam; target: [number, number]; f: number; from: number; out?: number;
  fills?: Fill[]; children?: (cam: GeoCam) => React.ReactNode;
}> = ({ x, y, w, h, cam, mainCam, target, f, from, out, fills = [], children }) => {
  if (f < from) return null;
  const o = fadeOut(f, out, 6);
  const k = prog(f, from, 12);
  const [tx, ty] = toScreen(mainCam, ...target);
  // leader: from the target to the nearest point of the box edge
  const ex = Math.min(x + w, Math.max(x, tx));
  const ey = ty > y + h ? y + h : ty < y ? y : ty;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute" }}>
        <path d={`M ${tx} ${ty} L ${tx + (ex - tx) * k} ${ty + (ey - ty) * k}`} stroke={NIGHT.white} strokeWidth={4} strokeDasharray="10 8" />
        <rect x={tx - 22} y={ty - 22} width={44} height={44} rx={8} fill="none" stroke={NIGHT.white} strokeWidth={4} opacity={k} />
      </svg>
      <div style={{
        position: "absolute", left: x, top: y, width: w, height: h, overflow: "hidden", borderRadius: 28,
        border: `6px solid ${NIGHT.white}`, boxShadow: "0 18px 40px rgba(0,0,0,0.55)", boxSizing: "border-box",
        scale: interpolate(k, [0, 1], [0.6, 1]), opacity: k, transformOrigin: `${tx - x}px ${ty - y}px`,
      }}>
        {/* the inset renders a full canvas whose centre (CX, MAP_Y) lands on the box centre */}
        <div style={{ position: "absolute", width: CANVAS.width, height: CANVAS.height, left: w / 2 - CX - 6, top: h / 2 - MAP_Y - 6 }}>
          <NightMap cam={cam} fills={fills} f={f} />
          {children?.(cam)}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Archival photo in a white frame (public-domain only; credit it in the description), tilted a
 * little, popping in at `at`. Bible §5: at most one photo per episode. Box in screen px.
 */
export const PhotoCard: React.FC<{ src: string; x: number; y: number; w: number; h: number; f: number; at: number; out?: number; tilt?: number }> = ({
  src, x, y, w, h, f, at, out, tilt = -3,
}) => {
  if (f < at) return null;
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 18, overflow: "hidden",
      border: `8px solid ${NIGHT.white}`, boxShadow: "0 20px 44px rgba(0,0,0,0.6)", boxSizing: "border-box",
      rotate: `${tilt}deg`, scale: pop(f, at), opacity: fadeOut(f, out),
    }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%" }} />
    </div>
  );
};

// ------------------------------------------------------------------ subtitles

/**
 * Karaoke, one line of 1–3 words / ≤ 18 characters (repo short-form rule), sentence case:
 * spoken word coral, said words white, words still to come muted. Use with
 * `<KaraokeSubs maxWords={3} maxChars={18} oneLine Skin={NightSub} />`.
 */
export const NightSub: SubSkin = ({ lines }) => (
  <div style={{ position: "absolute", left: SAFE.left, right: SAFE.right, bottom: CANVAS.height - SUB_BOTTOM, display: "flex", justifyContent: "center" }}>
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 78, lineHeight: 1.1, textAlign: "center", whiteSpace: "nowrap", letterSpacing: -0.5 }}>
      {lines[0].map((w, k) => (
        <span key={k} style={{
          // fixed margin on every word: the line never shifts while the colour moves
          display: "inline-block", margin: "0 12px",
          color: w.active ? NIGHT.coral : w.said ? NIGHT.white : NIGHT.muted,
          WebkitTextStroke: `12px ${NIGHT.ink}`, paintOrder: "stroke fill",
          textShadow: "0 6px 14px rgba(0,0,0,0.5)",
        }}>
          {w.text}
        </span>
      ))}
    </div>
  </div>
);
