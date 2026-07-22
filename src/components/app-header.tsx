import Image from "next/image";

import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader() {
  return (
    <header className="flex items-center justify-between py-4">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <Image
          src="/images/hog.png"
          alt="Groundhog"
          width={40}
          height={40}
          className="w-10 rounded-md"
        />
        Groundhog
      </h1>
      <ThemeToggle />
    </header>
  );
}
