'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  RENDER_DIMENSION_UNITS,
  type RenderDimensionUnit,
} from '@/lib/types/render-theme';
import { cn } from '@/lib/utils';

export function arrayToText(value?: string[]): string {
  return (value ?? []).join(', ');
}

export function textToArray(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function RenderCvSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-black bg-white">
      <div className="border-b border-black bg-[#F8F7F1] px-4 py-2">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-gray-600">
          {title}
        </p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function RenderCvRow({
  label,
  children,
  description,
  fieldHint,
}: {
  label: string;
  children: ReactNode;
  description?: string;
  fieldHint?: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-gray-200 px-4 py-3 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
      </div>
      <div className="space-y-1.5">
        {children}
        {fieldHint ? <p className="text-xs text-gray-500">{fieldHint}</p> : null}
      </div>
    </div>
  );
}

export function RenderCvInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value?: string | number | null;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
}) {
  return (
    <Input
      type={type}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="font-mono text-sm"
    />
  );
}

export function RenderCvTextarea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <Textarea
      rows={rows}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="font-mono text-sm"
    />
  );
}

export function RenderCvAutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Input
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'border px-2.5 py-1.5 text-left text-xs transition',
              value === option
                ? 'border-violet-300 bg-violet-100 text-violet-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-black'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function rgbToHex(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const raw = hexMatch[1];
    if (raw.length === 3) {
      return `#${raw
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
        .toLowerCase()}`;
    }
    return `#${raw.toLowerCase()}`;
  }

  const rgbMatch = trimmed.match(
    /^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i
  );
  if (!rgbMatch) {
    return null;
  }

  const [, rawR, rawG, rawB] = rgbMatch;
  const toHex = (part: string) => {
    const bounded = Math.max(0, Math.min(255, Number.parseInt(part, 10)));
    return bounded.toString(16).padStart(2, '0');
  };

  return `#${toHex(rawR)}${toHex(rawG)}${toHex(rawB)}`;
}

export function RenderCvColorInput({
  value,
  onChange,
  placeholder,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const pickerValue = rgbToHex(value) ?? '#000000';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative inline-flex h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black bg-white">
          <span className="absolute inset-[3px] rounded-full" style={{ backgroundColor: pickerValue }} />
          <input
            type="color"
            aria-label="Pick color"
            value={pickerValue}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Input
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-[220px] flex-1 font-mono text-sm"
        />
      </div>
      <p className="text-xs text-gray-500">
        Supports hex, rgb(...), hsl(...), and named colors.
      </p>
    </div>
  );
}

const DIMENSION_PATTERN = /^(-?(?:\d+\.?\d*|\.\d+))\s*(cm|mm|in|pt|em|ex)?$/i;

function parseDimensionValue(value?: string | number | null): {
  amount: string;
  unit: RenderDimensionUnit | null;
} {
  const raw = `${value ?? ''}`.trim();
  if (!raw) {
    return { amount: '', unit: null };
  }

  const match = raw.match(DIMENSION_PATTERN);
  if (match) {
    return {
      amount: match[1],
      unit: (match[2]?.toLowerCase() as RenderDimensionUnit | undefined) ?? null,
    };
  }

  const detectedUnit =
    RENDER_DIMENSION_UNITS.find((unit) => raw.toLowerCase().endsWith(unit)) ?? null;

  if (!detectedUnit) {
    return { amount: raw, unit: null };
  }

  return {
    amount: raw.slice(0, -detectedUnit.length).trim(),
    unit: detectedUnit,
  };
}

function formatDimensionValue(amount: string, unit: RenderDimensionUnit | null): string {
  const normalizedAmount = amount.trim();
  if (!normalizedAmount) {
    return '';
  }

  return unit ? `${normalizedAmount}${unit}` : normalizedAmount;
}

export function RenderCvDimensionInput({
  value,
  onChange,
  placeholder,
}: {
  value?: string | number | null;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const parsedValue = parseDimensionValue(value);
  const parsedPlaceholder = parseDimensionValue(placeholder);
  const [draftUnit, setDraftUnit] = useState<RenderDimensionUnit>(
    parsedValue.unit ?? parsedPlaceholder.unit ?? 'cm'
  );

  useEffect(() => {
    if (parsedValue.unit) {
      setDraftUnit(parsedValue.unit);
      return;
    }
    if (parsedPlaceholder.unit) {
      setDraftUnit(parsedPlaceholder.unit);
    }
  }, [parsedPlaceholder.unit, parsedValue.unit]);

  const activeUnit = parsedValue.unit ?? draftUnit;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={parsedValue.amount}
        onChange={(event) => {
          onChange(formatDimensionValue(event.target.value, activeUnit));
        }}
        placeholder={parsedPlaceholder.amount || placeholder}
        inputMode="decimal"
        className="w-28 font-mono text-sm"
      />
      <div className="flex flex-wrap gap-1">
        {RENDER_DIMENSION_UNITS.map((unit) => (
          <button
            key={unit}
            type="button"
            onClick={() => {
              setDraftUnit(unit);
              if (parsedValue.amount) {
                onChange(formatDimensionValue(parsedValue.amount, unit));
              }
            }}
            className={cn(
              'border px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition',
              activeUnit === unit
                ? 'border-violet-300 bg-violet-100 text-violet-900'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-black'
            )}
          >
            {unit}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RenderCvBulletPicker({
  value,
  onChange,
  options,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-8 w-8 items-center justify-center border text-sm transition',
            value === option
              ? 'border-violet-300 bg-violet-100 text-violet-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-black'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function RenderCvSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value?: T | string | null;
  options: Array<{ id: T | string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className="w-full border border-black bg-white px-3 py-2 font-mono text-sm"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function RenderCvToggle({
  checked,
  onChange,
}: {
  checked?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3">
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full border border-black transition ${
          checked ? 'bg-blue-700' : 'bg-[#E5E5E0]'
        }`}
      >
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
      <span className="font-mono text-xs uppercase tracking-wider text-gray-500">
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  );
}
