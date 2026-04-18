'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RENDER_DIMENSION_UNITS, type RenderDimensionUnit } from '@/lib/types/render-theme';
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
    <section className="border border-black/15 bg-white">
      <div className="border-b border-black/10 bg-gray-50/80 px-2.5 py-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">{title}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function RenderCvQuickNav({
  items,
  activeId,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="sticky top-0 z-10 border border-black/15 bg-white p-1">
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
              item.id === activeId
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-transparent bg-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RenderCvRow({
  label,
  children,
  description,
  fieldHint,
  density = 'compact',
}: {
  label: string;
  children: ReactNode;
  description?: string;
  fieldHint?: ReactNode;
  density?: 'default' | 'compact';
}) {
  const isCompact = density === 'compact';

  return (
    <div
      className={cn(
        'grid border-b border-gray-200 last:border-b-0',
        isCompact
          ? 'gap-2 px-2.5 py-2 md:grid-cols-[150px_minmax(0,1fr)] md:items-start'
          : 'gap-2.5 px-3 py-2.5 md:grid-cols-[170px_minmax(0,1fr)] md:items-center'
      )}
    >
      <div>
        <p className={cn('font-medium text-gray-700', isCompact ? 'text-[13px]' : 'text-sm')}>
          {label}
        </p>
        {description ? (
          <p className={cn('text-gray-500', isCompact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs')}>
            {description}
          </p>
        ) : null}
      </div>
      <div className={cn(isCompact ? 'space-y-1' : 'space-y-1.5')}>
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
      className="h-8 border-black/15 font-mono text-[13px] focus-visible:border-blue-700"
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
      className="min-h-[64px] border-black/15 font-mono text-[13px] focus-visible:border-blue-700"
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
        className="h-8 border-black/15 font-mono text-[13px] focus-visible:border-blue-700"
      />
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'border px-2 py-1.5 text-left text-[11px] transition',
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

  const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
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
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black bg-white">
          <span
            className="absolute inset-[3px] rounded-full"
            style={{ backgroundColor: pickerValue }}
          />
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
          className="h-8 min-w-[220px] flex-1 border-black/15 font-mono text-[13px] focus-visible:border-blue-700"
        />
      </div>
      <p className="text-[11px] text-gray-500">
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
        className="h-8 w-24 font-mono text-sm"
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
              'border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition',
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
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-7 w-7 items-center justify-center border text-sm transition',
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
      className="h-8 w-full border border-black/15 bg-white px-2.5 py-1.5 font-mono text-[13px]"
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
    <label className="inline-flex cursor-pointer items-center gap-2.5">
      <span
        className={`relative inline-flex h-5 w-10 items-center rounded-full border border-black transition ${
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
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  );
}
