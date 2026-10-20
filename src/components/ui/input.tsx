import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
         "h-11 w-full min-w-0 rounded-md border border-input bg-muted px-3 py-2 font-mono text-base outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:outline-destructive sm:text-sm pointer-coarse:min-h-12",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
