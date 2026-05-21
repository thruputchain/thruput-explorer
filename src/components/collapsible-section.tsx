"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger
        render={
          <Button type="button" variant="ghost" className="h-auto w-full justify-between px-4 py-3">
            <span>{title}</span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        }
      />
      <CollapsibleContent className="border-t px-4 py-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
