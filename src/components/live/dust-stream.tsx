"use client";

import { useEffect, useRef, useState } from "react";

import { formatInteger } from "@/lib/groundhog/live/format";
import type { LiveBlock } from "@/lib/groundhog/live/types";

/** Particles alive at once; older specks are overwritten when the pool wraps. */
const POOL_SIZE = 40_000;
/** Above this many transactions in one block, one speck stands for several. */
export const MAX_SPECKS_PER_BLOCK = 6_000;
const DEFAULT_BLOCK_INTERVAL_MS = 1_000;
const MIN_SPEED = 140;
const MAX_SPEED = 420;
const TRAIL_ALPHA = 0.42;
const FLASH_MS = 700;
const LABEL_MS = 2_400;
const STATIC_SPECKS = 1_200;

/** How many specks a block releases and how many transactions each one stands for. */
export function representation(txCount: number, maxSpecks = MAX_SPECKS_PER_BLOCK) {
  if (txCount <= 0) return { specks: 0, perSpeck: 1 };
  const perSpeck = Math.max(1, Math.ceil(txCount / maxSpecks));
  return { specks: Math.ceil(txCount / perSpeck), perSpeck };
}

type Palette = { dust: string; bright: string; space: string; muted: string; border: string };

const FALLBACK_PALETTE: Palette = { dust: "#e9ef64", bright: "#f0f0e9", space: "#0b0c09", muted: "#a7a9a0", border: "#393c2e" };

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    dust: read("--primary", FALLBACK_PALETTE.dust),
    bright: read("--foreground", FALLBACK_PALETTE.bright),
    space: FALLBACK_PALETTE.space,
    muted: read("--muted-foreground", FALLBACK_PALETTE.muted),
    border: read("--border", FALLBACK_PALETTE.border),
  };
}

/** Deterministic pseudo-random numbers so a reduced-motion frame is stable. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly normal in [0, 1) centred on 0.5, so the stream is dense in the middle and thin at the edges. */
function bandSample(random: () => number) {
  return (random() + random() + random()) / 3;
}

class Pool {
  readonly x = new Float32Array(POOL_SIZE);
  readonly y = new Float32Array(POOL_SIZE);
  readonly depth = new Float32Array(POOL_SIZE);
  readonly phase = new Float32Array(POOL_SIZE);
  readonly alive = new Uint8Array(POOL_SIZE);
  private next = 0;

  emit(width: number, height: number, random: () => number) {
    const index = this.next;
    this.next = (this.next + 1) % POOL_SIZE;
    this.x[index] = width + random() * 24;
    this.y[index] = height * (0.08 + 0.84 * bandSample(random));
    this.depth[index] = random();
    this.phase[index] = random() * Math.PI * 2;
    this.alive[index] = 1;
  }

  step(dtSeconds: number, timeSeconds: number) {
    let count = 0;
    for (let index = 0; index < POOL_SIZE; index += 1) {
      if (!this.alive[index]) continue;
      const depth = this.depth[index];
      this.x[index] -= (MIN_SPEED + depth * (MAX_SPEED - MIN_SPEED)) * dtSeconds;
      this.y[index] += Math.sin(timeSeconds * (0.6 + depth) + this.phase[index]) * 6 * dtSeconds;
      if (this.x[index] < -4) this.alive[index] = 0;
      else count += 1;
    }
    return count;
  }

  clear() {
    this.alive.fill(0);
    this.next = 0;
  }
}

type Emitter = { height: string; remaining: number; total: number; startedAt: number; durationMs: number; emitted: number };
type Flash = { height: string; txCount: number; perSpeck: number; startedAt: number };

function drawSpecks(ctx: CanvasRenderingContext2D, pool: Pool, palette: Palette) {
  // Three depth tiers keep the draw to three fills per frame.
  const tiers: [number, number, string, number][] = [
    [0, 0.55, palette.dust, 0.35],
    [0.55, 0.85, palette.dust, 0.7],
    [0.85, 1.01, palette.bright, 0.95],
  ];
  for (const [low, high, color, alpha] of tiers) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    const size = high > 1 ? 2 : 1;
    for (let index = 0; index < POOL_SIZE; index += 1) {
      if (!pool.alive[index]) continue;
      const depth = pool.depth[index];
      if (depth < low || depth >= high) continue;
      ctx.rect(pool.x[index], pool.y[index], size, size);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFlashes(ctx: CanvasRenderingContext2D, flashes: Flash[], now: number, width: number, height: number, palette: Palette) {
  for (const flash of flashes) {
    const age = now - flash.startedAt;
    if (age < FLASH_MS) {
      const fade = 1 - age / FLASH_MS;
      const gradient = ctx.createLinearGradient(width - 64, 0, width, 0);
      gradient.addColorStop(0, "rgba(233, 239, 100, 0)");
      gradient.addColorStop(1, `rgba(233, 239, 100, ${0.09 * fade})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(width - 64, 0, 64, height);
    }
  }
  const latest = flashes.at(-1);
  if (latest) {
    const age = now - latest.startedAt;
    const fade = age < LABEL_MS ? 1 : Math.max(0, 1 - (age - LABEL_MS) / 1_000);
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = palette.muted;
      ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`Block ${formatInteger(latest.height)}: ${formatInteger(latest.txCount)} ${latest.txCount === 1 ? "transaction" : "transactions"}`, width - 10, height - 8);
      ctx.globalAlpha = 1;
    }
  }
}

/** One still frame for reduced motion: the newest blocks as scattered dust, denser for busier blocks. */
function drawStill(ctx: CanvasRenderingContext2D, blocks: LiveBlock[], width: number, height: number, palette: Palette) {
  ctx.fillStyle = palette.space;
  ctx.fillRect(0, 0, width, height);
  const recent = blocks.slice(-8);
  const total = recent.reduce((sum, block) => sum + block.txCount, 0);
  if (total === 0) return;
  const random = mulberry32(Number(BigInt(recent.at(-1)!.height) % 2147483647n));
  const perSpeck = Math.max(1, Math.ceil(total / STATIC_SPECKS));
  ctx.fillStyle = palette.dust;
  ctx.beginPath();
  recent.forEach((block, index) => {
    // Newest block on the right, each block its own vertical slice.
    const sliceLeft = (width / recent.length) * index;
    const specks = Math.ceil(block.txCount / perSpeck);
    for (let speck = 0; speck < specks; speck += 1) {
      ctx.rect(sliceLeft + random() * (width / recent.length), height * (0.08 + 0.84 * bandSample(random)), 1.5, 1.5);
    }
  });
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function DustStream({ blocks, blockIntervalMs, className }: { blocks: LiveBlock[]; blockIntervalMs: number | null; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<Pool | null>(null);
  const emittersRef = useRef<Emitter[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const seenHeightRef = useRef<string | null>(null);
  const paletteRef = useRef<Palette>(FALLBACK_PALETTE);
  const randomRef = useRef(mulberry32(7));
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [perSpeck, setPerSpeck] = useState(1);
  const intervalRef = useRef(blockIntervalMs ?? DEFAULT_BLOCK_INTERVAL_MS);
  intervalRef.current = blockIntervalMs ?? DEFAULT_BLOCK_INTERVAL_MS;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    paletteRef.current = readPalette(container);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
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

  // Queue an emitter for every block that settled after the page opened; history is not replayed.
  useEffect(() => {
    const newest = blocks.at(-1);
    if (!newest) return;
    if (seenHeightRef.current === null) {
      seenHeightRef.current = newest.height;
      return;
    }
    const seen = BigInt(seenHeightRef.current);
    const arrived = blocks.filter((block) => BigInt(block.height) > seen && block.observedAt !== null);
    if (arrived.length === 0) return;
    seenHeightRef.current = newest.height;
    const now = performance.now();
    // Several blocks landing together share the interval so the flow stays continuous.
    const durationMs = intervalRef.current / arrived.length;
    arrived.forEach((block, index) => {
      const { specks, perSpeck: ratio } = representation(block.txCount);
      setPerSpeck(ratio);
      emittersRef.current.push({ height: block.height, remaining: specks, total: specks, startedAt: now + index * durationMs, durationMs, emitted: 0 });
      flashesRef.current.push({ height: block.height, txCount: block.txCount, perSpeck: ratio, startedAt: now + index * durationMs });
    });
    if (flashesRef.current.length > 8) flashesRef.current.splice(0, flashesRef.current.length - 8);
  }, [blocks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = paletteRef.current;

    if (reducedMotion) {
      poolRef.current?.clear();
      emittersRef.current = [];
      drawStill(ctx, blocks, size.width, size.height, palette);
      return;
    }

    const pool = (poolRef.current ??= new Pool());
    ctx.fillStyle = palette.space;
    ctx.fillRect(0, 0, size.width, size.height);
    lastFrameRef.current = null;

    const frame = (now: number) => {
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(0.05, (now - last) / 1_000);
      lastFrameRef.current = now;

      const emitters = emittersRef.current;
      for (const emitter of emitters) {
        if (now < emitter.startedAt) continue;
        const due = Math.min(emitter.total, Math.floor((emitter.total * (now - emitter.startedAt)) / emitter.durationMs));
        for (; emitter.emitted < due; emitter.emitted += 1) pool.emit(size.width, size.height, randomRef.current);
        emitter.remaining = emitter.total - emitter.emitted;
      }
      emittersRef.current = emitters.filter((emitter) => emitter.remaining > 0);

      ctx.globalAlpha = TRAIL_ALPHA;
      ctx.fillStyle = palette.space;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.globalAlpha = 1;
      pool.step(dt, now / 1_000);
      drawSpecks(ctx, pool, palette);
      drawFlashes(ctx, flashesRef.current, now, size.width, size.height, palette);
      frameRef.current = requestAnimationFrame(frame);
    };
    frameRef.current = requestAnimationFrame(frame);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    // The animation loop reads blocks through refs; only geometry and motion preference restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, reducedMotion]);

  const newest = blocks.at(-1);
  const label = newest
    ? `Transactions flowing as dust, newest entering from the right. Latest block ${formatInteger(newest.height)} has ${formatInteger(newest.txCount)} transactions.`
    : "Transactions flowing as dust. Waiting for settled blocks.";
  const caption = !newest
    ? "Dust appears here as blocks settle; each speck is one transaction entering from the right."
    : perSpeck === 1
      ? "Each speck is one transaction, released as its block settles and drifting left. The figures above are exact counts."
      : `Each speck stands for ${perSpeck} transactions at this volume; the figures above are exact counts.`;

  return (
    <>
      <div ref={containerRef} className={className} style={{ position: "relative" }}>
        <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full rounded-md" />
      </div>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </>
  );
}
