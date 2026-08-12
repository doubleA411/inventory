"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/command";

export type ComboboxOption = { value: string; label: string };

/**
 * A searchable select that also accepts free text not in the option list
 * (e.g. an ad-hoc item that isn't in the product catalogue) — picking an
 * option reports it back via `option`; typing something with no match and
 * pressing Enter / clicking "Use …" reports `option: null`.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  className,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string, option: ComboboxOption | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed) return options;
    const q = trimmed.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, trimmed]);
  const exactMatch = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const selected = options.find((o) => o.label === value) ?? null;

  function close() {
    setOpen(false);
    setQuery("");
  }
  function selectOption(option: ComboboxOption) {
    onChange(option.label, option);
    close();
  }
  function commitFreeText() {
    if (!trimmed) return;
    onChange(trimmed, null);
    close();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={cn(
            "input flex w-full items-center justify-between gap-2 text-left font-normal",
            !value && "text-(--color-muted)",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              const isEnter = e.key === "Enter" || e.keyCode === 13;
              if (isEnter && !exactMatch && trimmed) {
                e.preventDefault();
                commitFreeText();
              }
            }}
          />
          <CommandList id={listId}>
            {trimmed && !exactMatch && (
              <CommandGroup>
                <CommandItem value="__custom__" onSelect={commitFreeText}>
                  <Plus className="h-4 w-4" style={{ color: "var(--color-muted)" }} />
                  Use &ldquo;{trimmed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length === 0 ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => selectOption(option)}
                  >
                    <Check
                      className="h-4 w-4"
                      style={{ opacity: selected?.value === option.value ? 1 : 0 }}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
