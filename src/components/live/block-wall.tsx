"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatAge, formatInteger } from "@/lib/groundhog/live/format";
import type { LiveBlock } from "@/lib/groundhog/live/types";

const COLUMN_PITCH = 14;
const COLUMN_WIDTH = 12;
const NARROW_PITCH = 10;
const NARROW_WIDTH = 8;
const NARROW_BREAKPOINT = 480;
const TOP_PADDING = 12;
const LABEL_AREA = 22;
const LABEL_SPACING = 64;
/** Cell pitches tried from most legible to densest; the cell is one pixel smaller than the pitch. */
const CELL_PITCHES = [6, 5, 4, 3, 2, 1];
const ENTRANCE_MS = 600;
const FADE_MS = 1_000;

export type WallLayout = {
  visible: LiveBlock[];
  pitchX: number;
  colWidth: number;
  plotLeft: number;
  plotTop: number;
  baseline: number;
  plotHeight: number;
  /** Grid draws one square per transaction; bars take over when squares would need less than a pixel. */
  mode: "grid" | "bars";
  cellPitch: number;
  cols: number;
  rows: number;
  maxTxCount: number;
  labelEvery: bigint;
};

export function computeWallLayout(blocks: LiveBlock[], width: number, height: number): WallLayout | null {
  if (width < 40 || height < 60) return null;
  const narrow = width < NARROW_BREAKPOINT;
  const pitchX = narrow ? NARROW_PITCH : COLUMN_PITCH;
  const colWidth = narrow ? NARROW_WIDTH : COLUMN_WIDTH;
  const capacity = Math.max(1, Math.floor(width / pitchX));
  const visible = blocks.slice(-capacity);
  const plotLeft = width - visible.length * pitchX;
  const baseline = height - LABEL_AREA;
  const plotTop = TOP_PADDING;
  const plotHeight = baseline - plotTop;
  const maxTxCount = visible.reduce((max, block) => Math.max(max, block.txCount), 0);

  let mode: WallLayout["mode"] = "bars";
  let cellPitch = 1;
  let cols = colWidth;
  let rows = plotHeight;
  for (const pitch of CELL_PITCHES) {
    const fitCols = Math.floor((colWidth + (pitch > 1 ? 1 : 0)) / pitch);
    const fitRows = Math.floor(plotHeight / pitch);
    if (fitCols * fitRows >= maxTxCount) {
      mode = "grid";
      cellPitch = pitch;
      cols = fitCols;
      rows = fitRows;
      break;
    }
  }

  return {
    visible,
    pitchX,
    colWidth,
    plotLeft,
    plotTop,
    baseline,
    plotHeight,
    mode,
    cellPitch,
    cols,
    rows,
    maxTxCount,
    labelEvery: BigInt(Math.max(1, Math.ceil(LABEL_SPACING / pitchX))),
  };
}

type Palette = { primary: string; primaryHover: string; muted: string; border: string; accent: string };

const FALLBACK_PALETTE: Palette = {
  primary: "#e9ef64",
  primaryHover: "#f2f68e",
  muted: "#a7a9a0",
  border: "#393c2e",
  accent: "#2b2e23",
};

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    primary: read("--primary", FALLBACK_PALETTE.primary),
    primaryHover: read("--primary-hover", FALLBACK_PALETTE.primaryHover),
    muted: read("--muted-foreground", FALLBACK_PALETTE.muted),
    border: read("--border", FALLBACK_PALETTE.border),
    accent: read("--accent", FALLBACK_PALETTE.accent),
  };
}

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function mixColors(from: string, to: string, amount: number) {
  const start = parseHex(from);
  const end = parseHex(to);
  if (!start || !end) return amount >= 1 ? to : from;
  const channel = (index: number) => Math.round(start[index] + (end[index] - start[index]) * amount);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** Add the rects for `count` transactions of a column to the current path. */
function traceColumn(ctx: CanvasRenderingContext2D, layout: WallLayout, x: number, count: number) {
  if (layout.mode === "bars") {
    const height = count === 0 ? 0 : Math.max(1, Math.round((count / layout.maxTxCount) * layout.plotHeight));
    if (height > 0) ctx.rect(x, layout.baseline - height, layout.colWidth, height);
    return;
  }
  const size = layout.cellPitch > 1 ? layout.cellPitch - 1 : 1;
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / layout.cols);
    const col = index % layout.cols;
    ctx.rect(x + col * layout.cellPitch, layout.baseline - (row + 1) * layout.cellPitch + (layout.cellPitch - size), size, size);
  }
}

function drawEmptyMarker(ctx: CanvasRenderingContext2D, layout: WallLayout, x: number, palette: Palette) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = palette.muted;
  ctx.fillRect(x, layout.baseline - 2, layout.colWidth, 2);
  ctx.restore();
}

function drawStaticLayer(ctx: CanvasRenderingContext2D, layout: WallLayout, width: number, palette: Palette) {
  const lastIndex = layout.visible.length - 1;

  ctx.fillStyle = palette.primary;
  ctx.beginPath();
  layout.visible.forEach((block, index) => {
    if (index === lastIndex) return;
    traceColumn(ctx, layout, layout.plotLeft + index * layout.pitchX, block.txCount);
  });
  ctx.fill();

  layout.visible.forEach((block, index) => {
    if (index !== lastIndex && block.txCount === 0) drawEmptyMarker(ctx, layout, layout.plotLeft + index * layout.pitchX, palette);
  });

  ctx.fillStyle = palette.border;
  ctx.fillRect(0, layout.baseline, width, 1);

  ctx.fillStyle = palette.muted;
  ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  layout.visible.forEach((block, index) => {
    if (BigInt(block.height) % layout.labelEvery !== 0n) return;
    const label = formatInteger(block.height);
    const centre = layout.plotLeft + index * layout.pitchX + layout.colWidth / 2;
    const halfWidth = ctx.measureText(label).width / 2;
    // Skip labels that would be clipped at either edge of the canvas.
    if (centre - halfWidth < 0 || centre + halfWidth > width) return;
    ctx.fillText(label, centre, layout.baseline + 7);
  });
}

function drawNewestColumn(ctx: CanvasRenderingContext2D, layout: WallLayout, palette: Palette, elapsedMs: number | null) {
  const index = layout.visible.length - 1;
  if (index < 0) return;
  const block = layout.visible[index];
  const x = layout.plotLeft + index * layout.pitchX;
  if (block.txCount === 0) {
    drawEmptyMarker(ctx, layout, x, palette);
    return;
  }
  const entrance = elapsedMs === null ? 1 : easeOutCubic(Math.min(1, elapsedMs / ENTRANCE_MS));
  const fade = elapsedMs === null ? 1 : Math.min(1, elapsedMs / FADE_MS);
  const count = layout.mode === "grid" ? Math.max(1, Math.round(block.txCount * entrance)) : block.txCount;
  ctx.fillStyle = mixColors(palette.primaryHover, palette.primary, fade);
  ctx.beginPath();
  if (layout.mode === "bars") {
    const full = Math.max(1, Math.round((block.txCount / layout.maxTxCount) * layout.plotHeight));
    const height = Math.max(1, Math.round(full * entrance));
    ctx.rect(x, layout.baseline - height, layout.colWidth, height);
  } else {
    traceColumn(ctx, layout, x, count);
  }
  ctx.fill();
}

export function BlockWall({ blocks, now, className }: { blocks: LiveBlock[]; now: number; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<Palette>(FALLBACK_PALETTE);
  const arrivalRef = useRef<{ height: string; at: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const layout = useMemo(() => computeWallLayout(blocks, size.width, size.height), [blocks, size.width, size.height]);
  const newestHeight = layout?.visible.at(-1)?.height ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    paletteRef.current = readPalette(container);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const render = useCallback((elapsedMs: number | null) => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(size.width * dpr);
    const pixelHeight = Math.round(size.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const palette = paletteRef.current;

    let staticLayer = staticLayerRef.current;
    if (!staticLayer) staticLayer = staticLayerRef.current = document.createElement("canvas");
    if (staticLayer.width !== pixelWidth || staticLayer.height !== pixelHeight || staticLayer.dataset.layout !== layoutKey(layout)) {
      staticLayer.width = pixelWidth;
      staticLayer.height = pixelHeight;
      staticLayer.dataset.layout = layoutKey(layout);
      const staticCtx = staticLayer.getContext("2d");
      if (staticCtx) {
        staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        staticCtx.clearRect(0, 0, size.width, size.height);
        drawStaticLayer(staticCtx, layout, size.width, palette);
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    if (hoverIndex !== null && hoverIndex < layout.visible.length) {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(layout.plotLeft + hoverIndex * layout.pitchX - 1, 0, layout.colWidth + 2, size.height);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawNewestColumn(ctx, layout, palette, elapsedMs);
  }, [layout, size.width, size.height, hoverIndex]);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (!layout) return;

    if (newestHeight !== null && arrivalRef.current?.height !== newestHeight) {
      // Animate only blocks that arrive while the page is open, not the initial history.
      arrivalRef.current = { height: newestHeight, at: arrivalRef.current === null ? -Infinity : performance.now() };
    }
    const arrival = arrivalRef.current;
    const animate = !reducedMotion && arrival !== null && Number.isFinite(arrival.at);
    if (!animate) {
      render(null);
      return;
    }

    const step = () => {
      const elapsed = performance.now() - arrival.at;
      render(elapsed);
      if (elapsed < Math.max(ENTRANCE_MS, FADE_MS)) frameRef.current = requestAnimationFrame(step);
      else frameRef.current = null;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [layout, newestHeight, reducedMotion, render]);

  const locate = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!layout) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < layout.plotLeft) return null;
    const index = Math.floor((x - layout.plotLeft) / layout.pitchX);
    return index >= 0 && index < layout.visible.length ? index : null;
  };

  const hovered = layout && hoverIndex !== null ? layout.visible[hoverIndex] : undefined;
  const newest = layout?.visible.at(-1);
  const label = layout && newest
    ? `Transactions per block, newest on the right. ${layout.visible.length} blocks shown; block ${formatInteger(newest.height)} has ${formatInteger(newest.txCount)} transactions.`
    : "Transactions per block. Waiting for settled blocks.";

  const caption = !layout || layout.visible.length === 0 || layout.maxTxCount === 0
    ? "Blocks appear here as they settle, newest on the right."
    : layout.mode === "bars"
      ? "Each bar is one block and its height is the block's transaction count. Newest block on the right."
      : "Each square is one transaction, stacked into its block. Newest block on the right.";

  return (
    <>
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block h-full w-full touch-none"
        onPointerMove={(event) => setHoverIndex(locate(event))}
        onPointerDown={(event) => setHoverIndex(locate(event))}
        onPointerLeave={() => setHoverIndex(null)}
      />
      {layout && hovered && hoverIndex !== null ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: Math.min(Math.max(layout.plotLeft + hoverIndex * layout.pitchX + layout.colWidth / 2, 112), Math.max(112, size.width - 112)) }}
        >
          <p className="font-mono font-medium">Block {formatInteger(hovered.height)}</p>
          <p>{formatInteger(hovered.txCount)} {hovered.txCount === 1 ? "transaction" : "transactions"}</p>
          {hovered.hogMoved !== "0" ? <p>{hovered.hogMoved} HOG moved</p> : null}
          <p className="text-muted-foreground">{formatAge(hovered.observedAt, now)}</p>
        </div>
      ) : null}
    </div>
    <p className="text-xs text-muted-foreground">{caption}</p>
    </>
  );
}

function layoutKey(layout: WallLayout) {
  const newest = layout.visible.at(-1);
  return [layout.visible.length, layout.mode, layout.cellPitch, layout.maxTxCount, newest?.height ?? "", newest?.txCount ?? 0, layout.pitchX].join(":");
}
