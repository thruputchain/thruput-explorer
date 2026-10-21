import Link from "next/link";

export function BlockLink({ height }: { height: string }) {
  return (
    <Link
      className="font-mono tabular-nums underline-offset-4 hover:underline"
      href={`/block/${height}`}
    >
      {height}
    </Link>
  );
}
