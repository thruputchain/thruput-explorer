import Image from "next/image";
import { SunMoonIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AppHeader({ onToggleTheme }: { onToggleTheme?: () => void }) {
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
      <Button variant="outline" size="icon" onClick={onToggleTheme}>
        <SunMoonIcon className="h-6 w-6" />
      </Button>
    </header>
  );
}
