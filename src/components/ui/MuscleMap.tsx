"use client";

import { useId } from "react";
import { MUSCLE_LABEL, type MuscleId } from "@/lib/data/muscles";
import { cx } from "./primitives";

// Front and back anatomy chart. Every muscle is drawn as its own shape with fibre texture, for
// the right half of the picture, then mirrored for the left half so both sides always match.
// Each anatomical muscle belongs to one of the app's muscle groups (MuscleId), which decides
// whether it is highlighted. Coordinates: 120 × 262 per view, body centre line at x = 60.

interface Muscle {
  /** the group it belongs to; null = never highlighted (e.g. neck, rotator cuff, shin) */
  id: MuscleId | null;
  /** anatomical name, shown on hover */
  name: string;
  d: string;
  /** fibre direction in degrees (0 = across to the right, 90 = straight down) */
  fibre: number;
  /** fan-shaped muscles: fibres radiate from this point (where the muscle attaches) instead */
  fan?: [number, number];
}

/** Right half of the body outline (head, arm, hand, torso, leg, foot), closed along the centre line. */
const SILHOUETTE =
  "M60,3 C63,3 67,3.6 70,6.4 C72.6,9 73.4,13.6 73.2,19 C73,24.6 71.6,29.4 68.4,32.6 C67,34 66.2,36 66.6,38.6 C70,41.4 76,43.4 82,44.6 C86,45.4 90,46 93.4,48.2 C97.2,50.8 99.4,56 99.8,62 C100.2,68 100.6,74 100.8,80 C101.2,90 101.4,98 101.6,104 C102.8,112 104.6,122 106.2,132 C106.8,136 107.2,140 107.6,144 C110,146.4 112.6,150.6 113.4,156 C114,161 113.2,166.6 110.2,170 C107.6,172.4 104.2,171.6 102.8,167.6 C101.6,163 101.2,158 100.8,153.6 C100.4,151 99.8,148.6 99,146.6 C96.6,138.6 93.6,130 91,121.6 C89.6,117 88.6,112.4 88,107.6 C87,99 86.2,90 85.2,82 C84.8,78 84.2,74.6 83.4,72.4 C82.6,78 82,86 81.4,94 C81,102 80.8,110 80.6,116 C81.6,124 84.4,132 86.8,140 C88.6,148 88.6,158 88.2,168 C87.8,180 86.6,192 85,201 C84.4,205 84.4,209 85.2,213 C86.4,220 86.8,228 85.4,235 C84.2,240 82.4,244 81.8,247 C83.6,250.4 87.2,253.6 87.8,256.6 C88,258.4 86.6,259.4 84.4,259.4 L72.6,259.4 C70.8,259.4 70,258 70.2,255.6 C70.6,252.4 71.6,249.4 72.4,246.6 C72,241 71.4,235 70.6,229 C69.8,222 69.4,215 69.4,208.6 C69,202 68.4,195 67.8,188 C67,180 65.8,170 63.8,161 C62.8,157 61.6,154 60,152.4 Z";

/** The ear, drawn with the silhouette. */
const EAR = "M72.6,16.4 C75.2,15.6 76.2,18.6 75.6,21.6 C75.1,24.2 73.8,25.4 72.6,24.8 Z";

/** Knee caps and other landmarks drawn on top of the silhouette (not muscles). */
const FRONT_MARKS = [
  "M74.6,204.2 C76.6,203.4 79,203.6 80.4,205.2 C81.4,207 81.2,209.6 79.8,211 C78,212.2 75.6,212 74.4,210.4 C73.4,208.6 73.6,205.8 74.6,204.2 Z", // kneecap
];

const FRONT: Muscle[] = [
  { id: null, name: "Sternocleidomastoid", fibre: 70, d: "M66.6,29.6 C67.6,34 66.4,39.6 62.6,45.4 L60.9,44.8 C62.4,39.4 63.8,34.6 64.8,29.6 Z" },
  { id: "traps", name: "Trapezius (upper)", fibre: 20, d: "M67.2,35.6 C71.4,39.8 78,42.8 86.4,45 L84,47.2 C78.4,46.2 72.8,45.8 68.4,46.4 C67.6,42.8 67.2,39 67.2,35.6 Z" },
  { id: "chest", name: "Pectoralis major", fibre: 18, fan: [88, 67], d: "M61.2,47.6 C65.2,47 69,47.4 72.4,48.6 C77.4,54 82,60 85.6,66.2 C85.2,71.2 82.2,76 77,79.8 C71.4,83.6 66.2,85 61.2,84 Z" },
  { id: "frontDelts", name: "Deltoid (front)", fibre: 82, fan: [92, 80], d: "M72.6,47.6 C78.6,46 84,46.4 87.4,48 C88.6,56 89.2,65 91.2,76.6 C86.4,71 80.8,62.6 75.6,56 C73.8,53.4 72.8,50.6 72.6,47.6 Z" },
  { id: "sideDelts", name: "Deltoid (side)", fibre: 92, fan: [93, 81], d: "M88.4,46.8 C94,48 97.8,53.6 98.8,61.6 C99.4,69.4 96.6,75.8 92.6,79.4 C90.6,68.6 89.8,57.6 88.4,46.8 Z" },
  { id: null, name: "Serratus anterior", fibre: 150, d: "M77.6,80.6 C79.6,79 81.4,78.2 82.6,78.2 L82.4,82 C80.6,82.2 79,81.8 77.6,80.6 Z M78.2,84.6 C80,83.4 81.6,83 82.4,83.4 L82.2,87 C80.6,87 79.2,86.2 78.2,84.6 Z" },
  { id: "abs", name: "Rectus abdominis", fibre: 90, d: "M61.2,87 L69,87.4 C70,92 70,96 69.6,99.2 L61.2,99.2 Z M61.2,100.6 L69.6,100.6 C70,105 70,108 69.6,111.2 L61.2,111.2 Z M61.2,112.6 L69.4,112.6 C69.6,117 69.4,120.4 69,123.4 L61.2,123.4 Z M61.2,124.8 L68.8,124.8 C68.4,132.6 66.4,139.2 61.2,144.6 Z" },
  { id: "obliques", name: "External oblique", fibre: 62, d: "M70.8,87.4 C74.4,86.6 78.4,86.8 81.2,88.6 C81.8,98 81.4,108 80.6,117 C79.4,126 76.4,133 71.8,138.6 C70.6,128 71.2,108 70.8,87.4 Z" },
  { id: "biceps", name: "Biceps", fibre: 86, d: "M88.4,80.4 C92.4,78.2 95.4,80.4 96.2,86.4 C97.2,94 96.4,101 93.8,106.2 C91.2,107.4 89.2,105.4 88.6,101.4 C87.6,94 87.4,86.4 88.4,80.4 Z" },
  { id: "biceps", name: "Brachialis", fibre: 84, d: "M96.8,88.6 C99,92.6 99.8,98.4 99.4,104.4 C97.8,105.4 96.2,105.4 95.2,104.4 C96.8,99 97.2,94 96.8,88.6 Z" },
  { id: "forearms", name: "Brachioradialis", fibre: 76, d: "M97.6,104.4 C101.4,106.4 104,112.4 105,120.4 C105.6,128 105.6,136 104.8,143 L102.8,143.2 C101.8,134 99.8,124 97.2,116.4 C96,112.4 96,108.4 97.6,104.4 Z" },
  { id: "forearms", name: "Forearm flexors", fibre: 72, d: "M89.8,108.4 C93.2,107.4 95.6,110.4 96.4,115.4 C98.8,123.4 100.6,132.4 101.6,143.2 L99.8,143.8 C97.2,136 93.6,127 91.2,120.2 C90,116.2 89.4,112.4 89.8,108.4 Z" },
  { id: "hipFlexors", name: "Iliopsoas", fibre: 120, d: "M65.2,141 C69.4,139.4 74.2,139.4 78.4,140.4 L73.2,148.8 C69.6,147.8 66.8,145 65.2,141 Z" },
  { id: "abductors", name: "Tensor fasciae latae", fibre: 100, d: "M81.8,127.4 C84.6,130.4 86.6,136.4 87.2,143.2 C87.4,146.4 87,149.2 86.2,151.2 C84.6,144 83.2,135.4 81.8,127.4 Z" },
  { id: "adductors", name: "Adductors", fibre: 112, d: "M63.8,155.2 C65.8,150.2 68.8,148.2 72.2,149.6 C70.6,160 69.8,172 70,186.4 C68.6,181 67.4,175 66.6,170 C65.4,164 64.4,159.2 63.8,155.2 Z" },
  { id: "quads", name: "Rectus femoris", fibre: 92, d: "M81,142.4 C83.6,148.4 84.4,160 83.8,174 C83.2,186 81.2,194 78.6,199.4 C76,196.4 74.8,188 74.6,178 C74.4,166 75.8,155 78.8,146.4 Z" },
  { id: "quads", name: "Vastus lateralis", fibre: 96, d: "M85.8,146.2 C88.2,153 88.6,165 88,178 C87.4,189 85.6,198 82.4,203.6 C80.8,203.6 80,201 80.4,198 C83,191 84.4,182 84.6,172 C84.8,162 85.2,153 85.8,146.2 Z" },
  { id: "quads", name: "Vastus medialis", fibre: 70, d: "M74.2,179.2 C77,184 78.8,190 78.8,196 C78.8,200.6 76.8,203.6 73.8,203.6 C72,203.2 71.4,200.6 71.8,197 C72.2,191 72.8,185 74.2,179.2 Z" },
  { id: "hipFlexors", name: "Sartorius", fibre: 108, d: "M79.2,135 C80.8,135 82.6,136 82.8,138.2 C80.2,146.2 76.8,154 74.2,162 C72.4,170 71.6,182 71.2,198.2 L69.4,199.2 C69.4,182 70,168 71.4,158 C73.2,149 76.2,141 79.2,135 Z" },
  { id: "calves", name: "Gastrocnemius (inner)", fibre: 90, d: "M70.6,212.4 C73.6,213.2 75.6,218.4 75.8,226.4 C75.8,232.4 74.6,236.4 72.8,238.4 C71.2,236.4 70.4,231.4 70.2,224.4 C70,219.4 70,215.4 70.6,212.4 Z" },
  { id: null, name: "Tibialis anterior", fibre: 92, d: "M78.8,212.4 C81.6,214.4 82.8,220.4 82.6,228.4 C82.2,236.4 80.8,242.4 78.8,246.4 L77,246.4 C77.6,238.4 77.8,228.4 77.2,220.4 C77.2,216.4 77.8,213.4 78.8,212.4 Z" },
  { id: "calves", name: "Gastrocnemius (outer)", fibre: 92, d: "M83,212.4 C85.6,216.4 86.4,222.4 85.8,228.4 C85.2,233.4 83.8,236.4 82.8,236.4 C82.8,229.4 82.8,220.4 83,212.4 Z" },
  { id: "calves", name: "Soleus", fibre: 90, d: "M82.6,237.6 C84,240 84,242.6 82.4,245.6 L80.8,245.6 C81.4,242.6 81.8,240 82.6,237.6 Z" },
];

const BACK: Muscle[] = [
  { id: "traps", name: "Trapezius (upper)", fibre: 30, fan: [88, 47], d: "M60.4,23.6 C62.4,24 64.2,26 65.2,30.2 C67.2,37 75.2,42 87,46 L80.2,52 C74.4,50 68.4,48.2 60.4,47.2 Z" },
  { id: "midBack", name: "Trapezius (middle & lower)", fibre: 160, fan: [80, 54], d: "M60.4,48.4 C68.2,49.4 74.2,51 80,53 L77.6,57.6 C73.6,58.6 69,60.2 65.8,62.2 C64,70 62.2,84 60.4,99.6 Z" },
  { id: "midBack", name: "Rhomboids", fibre: 150, d: "M66.4,62.8 C67.8,61.4 69.6,60.4 71,60 C69.8,66 69.4,73 70,79.6 C68,77 66.2,74 64.6,70.6 Z" },
  { id: null, name: "Infraspinatus", fibre: 165, d: "M71.8,59.2 C75.4,57.8 79.2,58 81.8,59.4 C83.6,64.4 83.6,70 81.8,75.6 C77.8,75.6 73.8,74 70.8,71 C70.4,67 70.8,63 71.8,59.2 Z" },
  { id: "rearDelts", name: "Deltoid (rear)", fibre: 70, fan: [94, 79], d: "M80.4,52.4 C85.4,49.4 90.4,48.6 95,50.4 C96.2,59.4 95.8,68.4 93.8,77 C90.4,70 86.4,62.4 80.6,56.6 Z" },
  { id: "sideDelts", name: "Deltoid (side)", fibre: 92, d: "M96,50.8 C98.8,54.4 99.9,60 99.4,67 C98.9,72 97,76 94.6,78.8 C96.4,70 96.8,60 96,50.8 Z" },
  { id: "lats", name: "Teres major", fibre: 160, d: "M81,76.8 C84.4,74.8 87.6,73 89.8,72.4 C89.6,76.4 88.2,80.2 85.8,82.8 C83.8,81.6 82.2,79.6 81,76.8 Z" },
  { id: "lats", name: "Latissimus dorsi", fibre: 128, fan: [90, 80], d: "M60.8,100.4 C62.8,92.4 64.8,86.4 69.8,81.4 C74.2,78 78.6,78 81,78.4 C83.6,81.4 86.2,83.8 88.6,84.4 C88.4,92.4 86.4,102.4 84,110.4 C81.4,118.4 78,124.4 72.8,128.2 C68.8,124.4 64.8,116.4 61.4,110.4 Z" },
  { id: "lowerBack", name: "Erector spinae", fibre: 90, d: "M61.4,111.4 C63.8,114.4 66,118.4 67.2,124.4 C67.6,129.4 67,134.4 65.8,138.4 L61.4,138.4 Z" },
  { id: "obliques", name: "External oblique", fibre: 62, d: "M84.6,110.8 C86,116.4 85.6,124.4 83.2,130 C80.8,132 78.2,132.2 76.4,131.2 C79.8,126.4 82.6,119.4 84.6,110.8 Z" },
  { id: "triceps", name: "Triceps (long head)", fibre: 92, d: "M86.6,74.4 C89.8,75 92.4,76.6 93.8,78.4 C94.8,86 96.2,94 97.8,104.2 C94.8,107.6 91.2,107.2 89.4,103.8 C87.8,96 86.8,86 86.6,74.4 Z" },
  { id: "triceps", name: "Triceps (lateral head)", fibre: 92, d: "M94.6,79.6 C97.4,78 99.6,80 100.2,85 C100.8,92 100.6,98.6 98.8,103.6 C97.2,98.6 96.2,92 95.4,86.6 Z" },
  { id: "forearms", name: "Forearm extensors", fibre: 74, d: "M90.2,109.2 C94.2,107.8 98.2,108.2 100.8,110.8 C102.8,120.2 104.6,131.2 105.6,143.2 L102.8,143.6 C100.2,133.2 96.2,124.2 92.6,117.2 C91.2,114.6 90.4,111.8 90.2,109.2 Z" },
  { id: "forearms", name: "Forearm flexors", fibre: 76, d: "M89.8,112.4 C91.2,118.6 94.8,128.4 99.8,143.6 L97.8,143.8 C94.2,135 91.2,126.2 89.8,119.2 Z" },
  { id: "abductors", name: "Gluteus medius", fibre: 60, d: "M73.2,129.4 C78.2,127.4 83.2,127.6 86,131.4 C87.6,135.4 87.4,139.4 86.2,142.2 C81.2,138.8 76.2,136.8 71,136.6 Z" },
  { id: "glutes", name: "Gluteus maximus", fibre: 38, fan: [90, 170], d: "M61.4,139.4 C66.2,135.4 74.2,135 81.2,138 C86.6,140.8 88.6,147.4 88,154 C87.4,160.4 84.2,165 78.2,166.8 C71.8,168.4 65.8,166.4 61.4,162.4 Z" },
  { id: "hamstrings", name: "Biceps femoris", fibre: 96, d: "M75.8,168.4 C80.8,168 84.8,165.4 87.4,161.4 C88.4,172.4 87.6,186.4 85,198.4 C83.8,202.4 82.2,205.4 80.2,207 C78.8,200.4 77.2,188.4 76.2,178.4 Z" },
  { id: "hamstrings", name: "Semitendinosus", fibre: 86, d: "M66.6,165.8 C69.8,168.4 72.8,169.4 75.8,169 C76.8,180.4 78.2,192.4 79.2,206.4 C76.2,205.8 74,203.4 72.4,199.4 C70.8,191.4 69.2,181.4 66.6,165.8 Z" },
  { id: "adductors", name: "Adductor magnus", fibre: 70, d: "M63.8,160.4 C65.6,164.4 67.4,169.4 68.6,175.4 C69.6,182.4 70.4,188.4 70.6,194.4 C69,190.4 67.8,185.4 67,180.4 C65.8,174.4 64.8,167.4 63.8,160.4 Z" },
  { id: "calves", name: "Gastrocnemius (outer)", fibre: 88, d: "M76.6,211.4 C80.8,210.4 84.2,213.4 85.4,219.4 C86.2,226.4 84.8,232.4 81.6,237 C79.8,236.4 78.6,233.4 77.8,229.4 C77,223.4 76.6,217.4 76.6,211.4 Z" },
  { id: "calves", name: "Gastrocnemius (inner)", fibre: 92, d: "M69.8,212.4 C72.6,210.8 75.2,211 76.2,212.4 C76.2,220.4 76.4,228.4 77,236.4 C74.2,238 71.6,236.4 70.6,232 C69.8,226.4 69.6,219.4 69.8,212.4 Z" },
  { id: "calves", name: "Soleus", fibre: 90, d: "M71.4,237.4 C73.8,239.4 77.6,239.8 81.2,238 C81.8,240.4 81.6,243.4 80.6,245.4 L73.6,245.4 C72.6,243 71.8,240.4 71.4,237.4 Z" },
];

const MIRROR = "translate(120 0) scale(-1 1)";

/** Bounding box of a path (good enough for laying fibre lines across it). */
function bbox(d: string) {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** Parallel fibre lines covering a muscle at the given angle (clipped to its shape when drawn). */
function fibres(m: Muscle): string {
  const b = bbox(m.d);
  if (m.fan) {
    // lines radiating from the attachment point across the muscle's spread
    const [fx, fy] = m.fan;
    const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
    const angles = corners.map(([x, y]) => Math.atan2(y - fy, x - fx));
    const ref = angles[0];
    const rel = angles.map((a) => Math.atan2(Math.sin(a - ref), Math.cos(a - ref)));
    const lo = ref + Math.min(...rel);
    const hi = ref + Math.max(...rel);
    const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - fx, y - fy))) + 1;
    const steps = Math.max(6, Math.round(((hi - lo) * reach) / 1.9));
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const a = lo + ((hi - lo) * i) / steps;
      d += `M${fx.toFixed(1)},${fy.toFixed(1)}L${(fx + Math.cos(a) * reach).toFixed(1)},${(fy + Math.sin(a) * reach).toFixed(1)}`;
    }
    return d;
  }
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const r = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 1;
  const a = (m.fibre * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)];
  const n = [-u[1], u[0]];
  let d = "";
  for (let k = -r; k <= r; k += 1.7) {
    const px = cx + n[0] * k;
    const py = cy + n[1] * k;
    d += `M${(px - u[0] * r).toFixed(1)},${(py - u[1] * r).toFixed(1)}L${(px + u[0] * r).toFixed(1)},${(py + u[1] * r).toFixed(1)}`;
  }
  return d;
}

const FRONT_FIBRES = FRONT.map(fibres);
const BACK_FIBRES = BACK.map(fibres);

function View({ muscles, fibreD, marks, primary, secondary, title, x, uid }: { muscles: Muscle[]; fibreD: string[]; marks: string[]; primary: Set<MuscleId>; secondary: Set<MuscleId>; title: string; x: number; uid: string }) {
  const state = (m: Muscle) => (m.id && primary.has(m.id) ? "p" : m.id && secondary.has(m.id) ? "s" : "n");
  const fill = { p: "var(--mm-primary)", s: "var(--mm-secondary)", n: "var(--mm-muscle)" };
  const half = (
    <>
      <path d={SILHOUETTE} fill="var(--mm-base)" />
      <path d={EAR} fill="var(--mm-base)" />
      {marks.map((d, i) => (
        <path key={`k${i}`} d={d} fill="var(--mm-mark)" />
      ))}
      {muscles.map((m, i) => {
        const s = state(m);
        return (
          <g key={i}>
            <path d={m.d} fill={fill[s]} stroke="var(--mm-gap)" strokeWidth={0.7} strokeLinejoin="round" />
            <path d={fibreD[i]} clipPath={`url(#${uid}${title}${i})`} stroke={s === "n" ? "var(--mm-fibre)" : "var(--mm-fibre-lit)"} strokeWidth={0.32} fill="none" />
            <path d={m.d} fill="transparent">
              <title>{`${m.name}${m.id ? ` · ${MUSCLE_LABEL[m.id]}` : ""}`}</title>
            </path>
          </g>
        );
      })}
    </>
  );
  return (
    <g transform={`translate(${x} 0)`}>
      <defs>
        {muscles.map((m, i) => (
          <clipPath key={i} id={`${uid}${title}${i}`}>
            <path d={m.d} />
          </clipPath>
        ))}
      </defs>
      {half}
      <g transform={MIRROR}>{half}</g>
      <text x={60} y={276} textAnchor="middle" fill="var(--muted)" style={{ font: "700 10.5px var(--body-font)", letterSpacing: "0.12em" }}>
        {title.toUpperCase()}
      </text>
    </g>
  );
}

/**
 * Front and back anatomy chart with the exercise's main muscles in full colour and the muscles it
 * also works in a lighter tint. Hovering a muscle shows its anatomical name.
 */
export function MuscleMap({ primary, secondary, className, showLegend = true }: { primary: MuscleId[]; secondary: MuscleId[]; className?: string; showLegend?: boolean }) {
  const uid = `mm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const p = new Set(primary);
  const s = new Set(secondary);
  const describe = [primary.length ? `Main: ${primary.map((m) => MUSCLE_LABEL[m]).join(", ")}` : "", secondary.length ? `Also works: ${secondary.map((m) => MUSCLE_LABEL[m]).join(", ")}` : ""]
    .filter(Boolean)
    .join(". ");
  return (
    <div className={cx("space-y-3", className)}>
      <svg
        viewBox="-2 0 254 282"
        className="w-full max-w-[360px] mx-auto block [--mm-base:color-mix(in_srgb,var(--ink)_8%,var(--surface))] [--mm-mark:color-mix(in_srgb,var(--ink)_12%,var(--surface))] [--mm-muscle:color-mix(in_srgb,var(--ink)_19%,var(--surface))] [--mm-gap:var(--surface)] [--mm-fibre:color-mix(in_srgb,var(--surface)_55%,transparent)] [--mm-fibre-lit:rgb(255_255_255_/_0.42)] [--mm-primary:var(--fig-muscle)] [--mm-secondary:color-mix(in_srgb,var(--fig-muscle)_45%,var(--mm-muscle))]"
        role="img"
        aria-label={describe || "Muscle map"}
      >
        <View muscles={FRONT} fibreD={FRONT_FIBRES} marks={FRONT_MARKS} primary={p} secondary={s} title="Front" x={0} uid={uid} />
        <View muscles={BACK} fibreD={BACK_FIBRES} marks={[]} primary={p} secondary={s} title="Back" x={130} uid={uid} />
      </svg>
      {showLegend && (primary.length > 0 || secondary.length > 0) && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm">
          {primary.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-pill bg-[var(--fig-muscle)]" aria-hidden="true" />
              <span className="font-semibold">{primary.map((m) => MUSCLE_LABEL[m]).join(", ")}</span>
            </span>
          )}
          {secondary.length > 0 && (
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-3 w-3 shrink-0 rounded-pill bg-[color-mix(in_srgb,var(--fig-muscle)_45%,var(--surface))]" aria-hidden="true" />
              {secondary.map((m) => MUSCLE_LABEL[m]).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
