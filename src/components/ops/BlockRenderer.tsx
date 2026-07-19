import type { Block, StatItem } from "../../lib/blocks/types";

/** Markdown-lite: **bold** and "- " lists. Anything numeric belongs in blocks. */
function TextMd({ md }: { md: string }) {
  const lines = md.split("\n");
  const renderInline = (text: string) =>
    text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  return (
    <div className="text-[0.95rem] leading-relaxed" style={{ color: "var(--ink)" }}>
      {lines.map((line, i) =>
        line.trim().startsWith("- ") ? (
          <div key={i} className="flex gap-2 py-0.5 pl-1">
            <span style={{ color: "var(--rx)" }}>·</span>
            <span>{renderInline(line.trim().slice(2))}</span>
          </div>
        ) : line.trim() === "" ? (
          <div key={i} className="h-2" />
        ) : (
          <p key={i} className="py-0.5">
            {renderInline(line)}
          </p>
        ),
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: StatItem) {
  return (
    <div
      className="flex-1 rounded-md px-3.5 py-3"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
    >
      <div className="silkscreen" style={{ fontSize: "0.52rem", color: "var(--ink-dim)" }}>
        {label}
      </div>
      <div
        className="display-type mt-0.5 font-bold"
        style={{ fontSize: "1.5rem", color: "var(--ink)", lineHeight: 1.1 }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--ink-dim)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Hand-rolled SVG chart — RX green means real data (both design systems' law). */
function Chart({
  kind = "bar",
  title,
  points,
}: {
  kind?: "bar" | "line";
  title?: string;
  points: { label: string; value: number }[];
}) {
  if (!points.length) return null;
  const W = 320;
  const H = 110;
  const PAD = 4;
  const max = Math.max(...points.map((p) => p.value), 1);
  const bw = (W - PAD * 2) / points.length;

  return (
    <div
      className="rounded-md px-3.5 py-3"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
    >
      {title && (
        <div className="silkscreen mb-2" style={{ fontSize: "0.52rem", color: "var(--ink-dim)" }}>
          {title}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {kind === "line" ? (
          <polyline
            fill="none"
            stroke="var(--rx)"
            strokeWidth="2"
            points={points
              .map(
                (p, i) =>
                  `${PAD + bw * i + bw / 2},${H - PAD - (p.value / max) * (H - PAD * 2 - 14)}`,
              )
              .join(" ")}
          />
        ) : (
          points.map((p, i) => {
            const h = (p.value / max) * (H - PAD * 2 - 14);
            return (
              <rect
                key={i}
                x={PAD + bw * i + bw * 0.15}
                y={H - PAD - 14 - h}
                width={bw * 0.7}
                height={Math.max(h, 1)}
                rx={2}
                fill="var(--rx)"
                opacity={0.85}
              />
            );
          })
        )}
        {points.map((p, i) => (
          <text
            key={i}
            x={PAD + bw * i + bw / 2}
            y={H - 2}
            textAnchor="middle"
            fontSize="8"
            fill="var(--ink-dim)"
            fontFamily="var(--display)"
          >
            {p.label.slice(0, 8).toUpperCase()}
          </text>
        ))}
      </svg>
    </div>
  );
}

interface Props {
  blocks: Block[];
  onAction?: (action: string, arg?: string) => void;
}

export function BlockRenderer({ blocks, onAction }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "text":
            return <TextMd key={i} md={block.md} />;
          case "stat":
            return (
              <div key={i} className="flex">
                <StatCard label={block.label} value={block.value} sub={block.sub} />
              </div>
            );
          case "stats":
            return (
              <div key={i} className="flex gap-2">
                {(block.items ?? []).slice(0, 3).map((s, j) => (
                  <StatCard key={j} {...s} />
                ))}
              </div>
            );
          case "chart":
            return (
              <Chart
                key={i}
                kind={block.kind}
                title={block.title}
                points={block.points ?? []}
              />
            );
          case "checklist":
            return (
              <div
                key={i}
                className="rounded-md px-3.5 py-2"
                style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
              >
                {(block.items ?? []).map((item, j) => (
                  <div key={j} className="flex items-center gap-2.5 py-1.5">
                    <span className={`led ${item.done ? "on-rx" : ""}`} />
                    <span
                      className="text-sm"
                      style={{
                        color: item.done ? "var(--ink-dim)" : "var(--ink)",
                        textDecoration: item.done ? "line-through" : undefined,
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            );
          case "actions":
            return (
              <div key={i} className="flex flex-wrap gap-2">
                {(block.items ?? []).map((a, j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => onAction?.(a.action, a.arg)}
                    className="silkscreen rounded px-3.5 py-2.5"
                    style={{
                      fontSize: "0.62rem",
                      background: "var(--panel-2)",
                      color: "var(--ink)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            );
          case "link":
            return (
              <a
                key={i}
                href={block.url}
                target="_blank"
                rel="noreferrer"
                className="silkscreen inline-block rounded px-3.5 py-2.5"
                style={{
                  fontSize: "0.62rem",
                  color: "var(--rx)",
                  border: "1px solid var(--line)",
                }}
              >
                {block.label ?? block.url} ↗
              </a>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
