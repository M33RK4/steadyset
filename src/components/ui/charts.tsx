"use client";

import { useId } from "react";

/** Minimal accessible SVG charts that follow the theme tokens. Each has a visually hidden data table. */

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function BarChart({ data, label, unit = "", height = 180 }: { data: { label: string; value: number }[]; label: string; unit?: string; height?: number }) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const W = 600;
  const H = height;
  const padL = 34;
  const padB = 26;
  const bw = (W - padL) / data.length;
  const id = useId();
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-labelledby={id}>
        <title id={id}>{label}</title>
        {[0, 0.5, 1].map((f) => {
          const y = (H - padB) * (1 - f) + 4;
          return (
            <g key={f}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--line)" strokeDasharray={f === 0 ? undefined : "3 4"} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
                {Math.round(max * f * 10) / 10}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = ((H - padB - 4) * d.value) / max;
          const w = Math.min(bw * 0.64, 44);
          const x = padL + i * bw + (bw - w) / 2;
          return (
            <g key={d.label + i}>
              <rect x={x} y={H - padB - h + 4} width={w} height={Math.max(0, h)} rx={4} fill={d.value ? "var(--accent)" : "var(--line)"} opacity={i === data.length - 1 ? 1 : 0.8} />
              <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>
                {d.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function LineChart({ points, label, unit = "", height = 180 }: { points: { label: string; value: number }[]; label: string; unit?: string; height?: number }) {
  const W = 600;
  const H = height;
  const padL = 40;
  const padB = 26;
  const id = useId();
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.15;
  lo -= pad;
  hi += pad;
  const x = (i: number) => padL + (points.length === 1 ? (W - padL) / 2 : (i * (W - padL - 12)) / (points.length - 1));
  const y = (v: number) => 6 + (H - padB - 10) * (1 - (v - lo) / (hi - lo));
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const step = Math.max(1, Math.ceil(points.length / 6));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-labelledby={id}>
        <title id={id}>{label}</title>
        {[lo + pad, (lo + hi) / 2, hi - pad].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
              {Math.round(v * 10) / 10}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={4.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />
            {i % step === 0 || i === points.length - 1 ? (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted)">
                {p.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th scope="row">{p.label}</th>
              <td>
                {p.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
