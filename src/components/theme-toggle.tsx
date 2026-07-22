"use client";

import { SunMoonIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  function toggleTheme() {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }

  return (
    <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
      <SunMoonIcon data-icon="icon" />
    </Button>
  );
}
