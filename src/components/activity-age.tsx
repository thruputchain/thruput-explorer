"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const interval = setInterval(onChange, 1000);
  return () => clearInterval(interval);
}

const readTime = () => Math.floor(Date.now() / 1000);
const readServerTime = () => null;

export function ActivityAge({ timestamp }: { timestamp: number | null }) {
  const now = useSyncExternalStore(subscribe, readTime, readServerTime);
  if (timestamp === null) return <span>Time unavailable</span>;
  if (now === null) return <time dateTime={new Date(timestamp).toISOString()}>{new Date(timestamp).toUTCString()}</time>;
  const seconds = Math.max(0, now - Math.floor(timestamp / 1000));
  const [value, unit] = seconds < 60 ? [seconds, "second"] : seconds < 3600 ? [Math.floor(seconds / 60), "minute"] : seconds < 86400 ? [Math.floor(seconds / 3600), "hour"] : [Math.floor(seconds / 86400), "day"];
  return <time dateTime={new Date(timestamp).toISOString()} title={new Date(timestamp).toUTCString()}>{value} {unit}{value === 1 ? "" : "s"} ago</time>;
}
