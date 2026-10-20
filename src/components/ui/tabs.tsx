"use client";

import type * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Tabs({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn("group/tabs flex min-w-0 gap-4 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit max-w-full items-center gap-1 rounded-md p-1 font-mono text-sm text-muted-foreground group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "rounded-none border-b bg-transparent p-0",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function TabsList({ className, variant = "default", ...props }: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return <TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium whitespace-nowrap transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-accent data-[state=active]:text-primary pointer-coarse:min-h-12 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:after:absolute group-data-[variant=line]/tabs-list:data-[state=active]:after:inset-x-0 group-data-[variant=line]/tabs-list:data-[state=active]:after:-bottom-px group-data-[variant=line]/tabs-list:data-[state=active]:after:h-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:bg-primary",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("min-w-0 flex-1 text-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
