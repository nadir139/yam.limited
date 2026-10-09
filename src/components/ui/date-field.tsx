import * as React from "react";
import { format, isValid, parseISO } from "date-fns";
import { enGB } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// A date picker that reads the same everywhere.
//
// <input type="date"> draws itself in the browser's locale, so on a machine
// set to US English it showed 11/15/2026 -- and a planned start of 15 Nov
// went in where 15 Oct was meant. This shows the date written out ("15 Nov
// 2026", day first) and picks it from a calendar that starts on Monday. The
// value in and out is unchanged: 'YYYY-MM-DD', or '' for none.

export interface DateFieldProps {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Offer a way back to no date. Off for required fields. */
  clearable?: boolean;
  className?: string;
  /** "sm" for inline rows (the agent's inspection card). */
  size?: "default" | "sm";
  "aria-label"?: string;
}

const toDate = (v: string | null | undefined) => {
  if (!v) return undefined;
  const d = parseISO(v.slice(0, 10));
  return isValid(d) ? d : undefined;
};

export function DateField({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  required,
  clearable = !required,
  className,
  size = "default",
  ...rest
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={rest["aria-label"]}
            aria-required={required || undefined}
            className={cn(
              size === "sm"
                ? "flex h-7 w-full items-center gap-1.5 rounded-md border border-input bg-background px-2 text-left text-xs ring-offset-background"
                : "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm ring-offset-background",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              clearable && selected ? "pr-8" : "",
            )}
          >
            <CalendarDays size={15} className="shrink-0 text-muted-foreground" />
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? format(selected, "d MMM yyyy", { locale: enGB }) : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        {clearable && selected && !disabled && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={enGB}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (!d) return;
            // Formatted from the local calendar date: toISOString() would
            // shift it to UTC and file it under the day before.
            onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          initialFocus
        />
        <div className="flex justify-between border-t px-3 py-2">
          <button
            type="button"
            className="text-xs font-medium hover:underline"
            onClick={() => {
              onChange(format(new Date(), "yyyy-MM-dd"));
              setOpen(false);
            }}
          >
            Today
          </button>
          {selected && (
            <span className="text-xs text-muted-foreground">{format(selected, "EEEE d MMMM yyyy", { locale: enGB })}</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
