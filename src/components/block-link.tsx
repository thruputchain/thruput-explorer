import Link from "next/link";

export function BlockLink({ height }: { height: string }) {
  return (
    <Link
      className="font-mono tabular-nums underline underline-offset-4"
      href={`/block/${height}`}
    >
      {height}
    </Link>
  );
}
