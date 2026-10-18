#!/usr/bin/env node
/**
 * Cut the lakes a story needs out of Natural Earth's 10m lakes (public domain) into a small
 * JSON the kit imports. The 5 MB source stays on this machine.
 *
 *   node scripts/geo-lakes.mjs <ne_10m_lakes.geojson> <out.json> <west> <south> <east> <north> [maxScalerank=3]
 *   node scripts/geo-lakes.mjs ne_10m_lakes.geojson src/geo/great-lakes.json -93 40 -75 50
 */
import fs from "node:fs";
import path from "node:path";

const [src, out, w, s, e, n, maxRank = "3"] = process.argv.slice(2);
if (!n) throw new Error("usage: geo-lakes.mjs <src> <out> <west> <south> <east> <north> [maxScalerank]");
const box = [w, s, e, n].map(Number);

const round = (c) => (typeof c[0] === "number" ? [+c[0].toFixed(3), +c[1].toFixed(3)] : c.map(round));
const bbox = (c, b = [180, 90, -180, -90]) => {
  if (typeof c[0] === "number") return [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])];
  return c.reduce((acc, x) => bbox(x, acc), b);
};

const g = JSON.parse(fs.readFileSync(src, "utf8"));
const features = g.features
  .filter((f) => f.properties.scalerank <= Number(maxRank))
  .filter((f) => {
    const b = bbox(f.geometry.coordinates);
    return b[2] > box[0] && b[0] < box[2] && b[3] > box[1] && b[1] < box[3];
  })
  .map((f) => ({ type: "Feature", properties: { name: f.properties.name ?? "" }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } }));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ type: "FeatureCollection", source: "Natural Earth 10m lakes (public domain)", features }));
console.log(`${features.length} lakes → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB): ${features.map((f) => f.properties.name).join(", ")}`);
