import {
  Mafs,
  Coordinates,
  Plot,
  Point,
  Line,
  Text,
  Circle,
  Vector,
} from "mafs";
import "mafs/core.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphSegment {
  from: number;
  to: number;
  fn: string; // math expression like "(4/3)*x", "x^2 - 4", "Math.sin(x)"
  style?: "solid" | "dashed";
  color?: string;
}

interface GraphPoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
  open?: boolean; // open circle (not filled)
}

interface GraphLine {
  from: [number, number];
  to: [number, number];
  style?: "solid" | "dashed";
  color?: string;
}

interface GraphCircle {
  center: [number, number];
  radius: number;
  color?: string;
}

interface GraphVector {
  from: [number, number];
  to: [number, number];
  color?: string;
}

interface GraphArea {
  fn: string;
  from: number;
  to: number;
  color?: string;
  opacity?: number;
}

export interface MathGraphProps {
  // Display range
  xRange?: [number, number];
  yRange?: [number, number];

  // Grid & axes
  showGrid?: boolean;
  showAxes?: boolean;
  axisLabels?: { x?: string; y?: string };

  // Content
  segments?: GraphSegment[];
  points?: GraphPoint[];
  lines?: GraphLine[];
  circles?: GraphCircle[];
  vectors?: GraphVector[];
  areas?: GraphArea[];

  // Layout
  width?: number | "auto";
  height?: number;
  padding?: number;
}

// ── Safe math evaluator ────────────────────────────────────────────────────

function createFn(expr: string): (x: number) => number {
  // Replace common math syntax
  const prepared = expr
    .replace(/\^/g, "**")
    .replace(/sqrt\(/g, "Math.sqrt(")
    .replace(/abs\(/g, "Math.abs(")
    .replace(/sin\(/g, "Math.sin(")
    .replace(/cos\(/g, "Math.cos(")
    .replace(/tan\(/g, "Math.tan(")
    .replace(/log\(/g, "Math.log(")
    .replace(/ln\(/g, "Math.log(")
    .replace(/pi/g, "Math.PI")
    .replace(/e(?![a-zA-Z])/g, "Math.E");

  return new Function(
    "x",
    `"use strict"; try { return ${prepared}; } catch { return NaN; }`,
  ) as (x: number) => number;
}

// ── Color palette ──────────────────────────────────────────────────────────

const COLORS = {
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  purple: "#a855f7",
  orange: "#f97316",
  cyan: "#06b6d4",
  pink: "#ec4899",
  navy: "#6366f1",
};

function resolveColor(name?: string): string {
  if (!name) return COLORS.blue;
  return (COLORS as any)[name] || name; // allow hex too
}

// ── Main component ─────────────────────────────────────────────────────────

export function MathGraph({
  xRange = [-1, 6],
  yRange = [-1, 5],
  showGrid = true,
  showAxes = true,
  segments = [],
  points = [],
  lines = [],
  circles = [],
  vectors = [],
  areas = [],
  height = 300,
}: MathGraphProps) {
  const viewBox = {
    x: xRange,
    y: yRange,
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <Mafs viewBox={viewBox} preserveAspectRatio={false} height={height}>
        {/* Grid */}
        {showGrid && (
          <Coordinates.Cartesian
            xAxis={{
              lines: 1,
              labels: (n) => (Number.isInteger(n) ? String(n) : ""),
            }}
            yAxis={{
              lines: 1,
              labels: (n) => (Number.isInteger(n) ? String(n) : ""),
            }}
          />
        )}

        {/* Shaded areas (render first, behind curves) */}
        {areas.map((area, i) => {
          const fn = createFn(area.fn);
          return (
            <Plot.Inequality
              key={`area-${i}`}
              y={{ "<": fn, ">": () => 0 }}
              color={resolveColor(area.color)}
            />
          );
        })}

        {/* Function segments */}
        {segments.map((seg, i) => {
          const fn = createFn(seg.fn);
          return (
            <Plot.OfX
              key={`seg-${i}`}
              y={fn}
              color={resolveColor(seg.color)}
              style={seg.style === "dashed" ? "dashed" : undefined}
              minSamplingDepth={8}
              maxSamplingDepth={14}
            />
          );
        })}

        {/* Lines */}
        {lines.map((line, i) => (
          <Line.Segment
            key={`line-${i}`}
            point1={line.from}
            point2={line.to}
            color={resolveColor(line.color)}
            style={line.style === "dashed" ? "dashed" : undefined}
          />
        ))}

        {/* Circles */}
        {circles.map((c, i) => (
          <Circle
            key={`circle-${i}`}
            center={c.center}
            radius={c.radius}
            color={resolveColor(c.color)}
          />
        ))}

        {/* Vectors */}
        {vectors.map((v, i) => (
          <Vector
            key={`vec-${i}`}
            tip={v.to}
            tail={v.from}
            color={resolveColor(v.color)}
          />
        ))}

        {/* Points */}
        {points.map((pt, i) => (
          <g key={`pt-${i}`}>
            <Point x={pt.x} y={pt.y} color={resolveColor(pt.color)} />
            {pt.label && (
              <Text
                x={pt.x + 0.3}
                y={pt.y + 0.3}
                size={12}
                color={resolveColor(pt.color)}
              >
                {pt.label}
              </Text>
            )}
          </g>
        ))}
      </Mafs>
    </div>
  );
}
