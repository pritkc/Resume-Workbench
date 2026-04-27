'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
    <section className="border border-black/20 bg-white">
      <div className="border-b border-black/10 px-2 py-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-black/50">
          {title}
        </p>
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
    <div className="sticky top-0 z-10 flex flex-wrap gap-0 border-b border-black/20 bg-white">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            '-mb-px inline-flex h-7 items-center border-b-2 border-transparent px-3 font-mono text-[11px] uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black',
            item.id === activeId
              ? 'border-black font-bold text-black'
              : 'text-black/50 hover:text-black'
          )}
        >
          {item.label}
        </button>
      ))}
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

  const labelTitle = description && isCompact ? description : undefined;

  return (
    <div
      className={cn(
        'grid border-b border-black/10 last:border-b-0',
        isCompact
          ? 'gap-2 px-2 py-1.5 md:grid-cols-[minmax(0,140px)_minmax(0,1fr)] md:items-center'
          : 'gap-2 px-2.5 py-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center'
      )}
    >
      <div title={labelTitle}>
        <p
          className={cn(
            'font-mono uppercase tracking-wide text-black',
            isCompact ? 'text-[11px]' : 'text-sm font-medium'
          )}
        >
          {label}
        </p>
        {description && !isCompact ? (
          <p className="mt-1 font-sans text-xs text-black/40">{description}</p>
        ) : null}
      </div>
      <div className={cn(isCompact ? 'space-y-1' : 'space-y-1.5')}>
        {children}
        {fieldHint ? <p className="font-sans text-xs text-black/40">{fieldHint}</p> : null}
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
      className="h-7 rounded-none border border-black/30 bg-white px-2 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
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
      className="min-h-[56px] rounded-none border border-black/30 bg-white px-2 py-1.5 font-sans text-sm focus-visible:border-black focus-visible:ring-0"
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
  const current = value ?? '';
  const isPreset = current !== '' && options.includes(current);

  return (
    <div className="flex flex-row items-center gap-1.5">
      {!isPreset ? (
        <Input
          value={current}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-7 min-w-0 flex-1 rounded-none border border-black/30 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
        />
      ) : null}
      <select
        value={options.includes(current) ? current : ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-7 min-w-0 rounded-none border border-black/30 bg-white px-2 font-mono text-[11px]',
          isPreset ? 'w-full' : 'w-full min-w-[9rem] shrink-0 sm:w-auto'
        )}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
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
    <div
      className="flex flex-wrap items-center gap-2"
      title="Supports hex, rgb(...), hsl(...), and named colors."
    >
      <label className="relative inline-flex h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-none border border-black/30 bg-white">
        <span className="absolute inset-px" style={{ backgroundColor: pickerValue }} />
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
        className="h-7 min-w-0 flex-1 rounded-none border border-black/30 font-mono text-xs focus-visible:border-black focus-visible:ring-0"
      />
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

function normalizeAmountForCommit(amount: string): string {
  let a = amount.trim();
  if (a.endsWith('.')) {
    a = a.slice(0, -1);
  }
  return a.trim();
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
  const [amountDraft, setAmountDraft] = useState(parsedValue.amount);

  useEffect(() => {
    const p = parseDimensionValue(value);
    const ph = parseDimensionValue(placeholder);
    setAmountDraft(p.amount);
    if (p.unit) {
      setDraftUnit(p.unit);
    } else if (ph.unit) {
      setDraftUnit(ph.unit);
    }
  }, [value, placeholder]);

  const commitDimension = useCallback(
    (amount: string, unit: RenderDimensionUnit) => {
      const normalized = normalizeAmountForCommit(amount);
      if (normalized === '' || normalized === '-') {
        onChange('');
        return;
      }
      onChange(formatDimensionValue(normalized, unit));
    },
    [onChange]
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        pasteMode="plainText"
        value={amountDraft}
        onChange={(event) => setAmountDraft(event.target.value)}
        onBlur={() => commitDimension(amountDraft, draftUnit)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitDimension(amountDraft, draftUnit);
            (event.target as HTMLInputElement).blur();
          }
        }}
        placeholder={parsedPlaceholder.amount || placeholder}
        inputMode="decimal"
        className="h-7 w-20 rounded-none border border-black/30 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
      />
      <select
        value={draftUnit}
        onChange={(e) => {
          const unit = e.target.value as RenderDimensionUnit;
          setDraftUnit(unit);
          const normalized = normalizeAmountForCommit(amountDraft);
          if (normalized !== '' && normalized !== '-') {
            onChange(formatDimensionValue(normalized, unit));
          }
        }}
        className="unit-selector-select h-7 min-w-[3.5rem] rounded-none border border-black/30 bg-white px-1 font-mono text-[9px] uppercase focus:border-black"
      >
        {RENDER_DIMENSION_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
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
            'flex h-7 w-7 items-center justify-center border border-black/20 text-sm transition',
            value === option
              ? 'border-black bg-black text-white'
              : 'border-black/20 bg-white text-black/70 hover:border-black hover:text-black'
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
      className="h-7 w-full rounded-none border border-black/30 bg-white px-2 font-mono text-sm focus:border-black"
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
    <label className="inline-flex cursor-pointer items-center gap-2">
      <span
        className={cn(
          'relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border border-black transition-colors',
          checked ? 'bg-black' : 'bg-black/20'
        )}
      >
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span
          className={cn(
            'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-black/50">
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  );
}
