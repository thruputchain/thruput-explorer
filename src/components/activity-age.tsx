import { cache } from "react";

const loadTime = cache(async () => Date.now());

export async function ActivityAge({ timestamp }: { timestamp: number | null }) {
  if (timestamp === null) return <span>Time unavailable</span>;
  const now = await loadTime();
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const [value, unit] = seconds < 60 ? [seconds, "second"] : seconds < 3600 ? [Math.floor(seconds / 60), "minute"] : seconds < 86400 ? [Math.floor(seconds / 3600), "hour"] : [Math.floor(seconds / 86400), "day"];
  return <time dateTime={new Date(timestamp).toISOString()} title={new Date(timestamp).toUTCString()}>{value} {unit}{value === 1 ? "" : "s"} ago</time>;
}
