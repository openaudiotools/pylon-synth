"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: React.ReactNode;
}

export interface DropdownProps {
  /** Currently selected value, or null when nothing is selected. */
  value: string | null;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * A lightweight single-select dropdown styled with the COSS theme tokens.
 *
 * Deliberately dependency-free (no Base UI / @floating-ui / lucide): it anchors
 * the popup with plain absolute positioning, which is all a short, panel-bound
 * list needs. Implements the listbox + aria-activedescendant keyboard pattern
 * (Up/Down/Home/End to move, Enter/Space to choose, Escape/Tab to close) and
 * closes on outside pointer. Reuse anywhere a small option picker is wanted.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Close on outside pointer while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openMenu() {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((a) => Math.min(options.length - 1, a + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)} data-slot="dropdown">
      <button
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "relative inline-flex min-h-8 w-full select-none items-center justify-between gap-2 rounded-lg border border-input bg-background px-[calc(--spacing(2.5)-1px)] text-left text-sm text-foreground shadow-xs/5 outline-none transition-shadow sm:min-h-7 sm:text-xs",
          "dark:bg-input/32",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24",
          "disabled:pointer-events-none disabled:opacity-64",
        )}
      >
        <span
          className={cn(
            "flex-1 truncate",
            !selected && "text-muted-foreground/72",
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronIcon className="-me-0.5 size-4 shrink-0 opacity-80" />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg/5 outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === active;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={cn(
                  "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-sm py-1 ps-2 pe-3 text-sm outline-none sm:text-xs",
                  isActive && "bg-accent text-accent-foreground",
                )}
              >
                <span className="col-start-1 flex">
                  {isSelected && <CheckIcon className="size-4" />}
                </span>
                <span className="col-start-2 min-w-0 truncate">
                  {option.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4.5 6 3.5 3.5L11.5 6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}
