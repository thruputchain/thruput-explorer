import type * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex w-full flex-col gap-5", className)} {...props} />;
}

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="field" className={cn("group/field flex min-w-0 flex-col gap-2 data-[invalid=true]:text-destructive", className)} {...props} />;
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("font-mono group-data-[disabled=true]/field:opacity-50", className)} {...props} />;
}

function FieldError({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="alert" data-slot="field-error" className={cn("text-sm text-destructive", className)} {...props} />;
}

export { Field, FieldGroup, FieldLabel, FieldError };
