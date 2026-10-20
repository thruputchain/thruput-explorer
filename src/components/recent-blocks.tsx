import { BlockLink } from "@/components/block-link";
import { loadRecentBlocks } from "@/lib/thruput/recent-blocks";

export async function RecentBlocks() {
  const result = await loadRecentBlocks();
  if (result.status === "unavailable") {
    return (
      <p role="status" className="text-base text-muted-foreground sm:text-sm">
        Recent blocks are temporarily unavailable.
      </p>
    );
  }
  if (result.heights.length === 0) {
    return (
      <p role="status" className="text-base text-muted-foreground sm:text-sm">
        No blocks after genesis yet.
      </p>
    );
  }
  return (
    <section aria-label="Recent block heights" className="flex flex-col gap-4">
      <p className="text-base text-muted-foreground sm:text-sm">
        The chain tip and up to 10 previous blocks. Details may lag behind the
        chain tip while indexing catches up.
      </p>
      <ul role="list" className="divide-y divide-foreground/10">
        {result.heights.map((height) => (
          <li key={height} className="py-3 text-base sm:text-sm">
            <BlockLink height={height} />
          </li>
        ))}
      </ul>
    </section>
  );
}
