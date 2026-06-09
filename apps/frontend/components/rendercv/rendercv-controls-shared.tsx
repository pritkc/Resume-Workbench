'use client';

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
    <section className="border border-border bg-card">
      <div className="border-b border-border px-2 py-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
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
    <div className="sticky top-0 z-10 flex flex-wrap gap-0 border-b border-border bg-card">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            '-mb-px inline-flex h-7 items-center border-b-2 border-transparent px-3 font-mono text-[11px] uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black',
            item.id === activeId
              ? 'border-border font-bold text-foreground'
              : 'text-muted-foreground hover:text-foreground'
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
        'grid border-b border-border last:border-b-0',
        isCompact
          ? 'gap-2 px-2 py-1.5 md:grid-cols-[minmax(0,140px)_minmax(0,1fr)] md:items-center'
          : 'gap-2 px-2.5 py-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center'
      )}
    >
      <div title={labelTitle}>
        <p
          className={cn(
            'font-mono uppercase tracking-wide text-foreground',
            isCompact ? 'text-[11px]' : 'text-sm font-medium'
          )}
        >
          {label}
        </p>
        {description && !isCompact ? (
          <p className="mt-1 font-sans text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={cn(isCompact ? 'space-y-1' : 'space-y-1.5')}>
        {children}
        {fieldHint ? <p className="font-sans text-xs text-muted-foreground">{fieldHint}</p> : null}
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
      className="h-7 rounded-none border border-border bg-card px-2 font-mono text-sm focus-visible:border-primary focus-visible:ring-0"
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
      className="min-h-[56px] rounded-none border border-border bg-card px-2 py-1.5 font-sans text-sm focus-visible:border-primary focus-visible:ring-0"
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
          className="h-7 min-w-0 flex-1 rounded-none border border-border font-mono text-sm focus-visible:border-primary focus-visible:ring-0"
        />
      ) : null}
      <select
        value={options.includes(current) ? current : ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-7 min-w-0 rounded-none border border-border bg-card px-2 font-mono text-[11px]',
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
      <label className="relative inline-flex h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-none border border-border bg-card">
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
        className="h-7 min-w-0 flex-1 rounded-none border border-border font-mono text-xs focus-visible:border-primary focus-visible:ring-0"
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
        className="h-7 w-20 rounded-none border border-border font-mono text-sm focus-visible:border-primary focus-visible:ring-0"
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
        className="unit-selector-select h-7 min-w-[3.5rem] rounded-none border border-border bg-card px-1 font-mono text-[9px] uppercase focus:border-primary"
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
            'flex h-7 w-7 items-center justify-center border border-border text-sm transition',
            value === option
              ? 'border-border bg-black text-white'
              : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground'
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
      className="h-7 w-full rounded-none border border-border bg-card px-2 font-mono text-sm focus:border-primary"
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
  compact = false,
}: {
  checked?: boolean;
  onChange: (value: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <span
        className={cn(
          'relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border border-border transition-colors',
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
            'inline-block h-3 w-3 transform rounded-full bg-card transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </span>
      {!compact ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {checked ? 'On' : 'Off'}
        </span>
      ) : null}
    </label>
  );
}

export function RenderCvPanelHeader({
  label,
  onReset,
  resetLabel = 'Reset',
}: {
  label: string;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="flex h-7 items-center justify-between gap-2 border border-border bg-card px-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-red-600 hover:underline"
        >
          {resetLabel}
        </button>
      ) : null}
    </div>
  );
}

export function RenderCvSectionAnchors({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <div className="sticky top-7 z-[9] flex flex-wrap gap-0 border-b border-border bg-card/95 backdrop-blur-sm">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            document
              .getElementById(item.id)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="inline-flex h-6 items-center px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function RenderCvCollapsibleSection({
  title,
  children,
  defaultOpen = false,
  hint,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className="border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        title={hint}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 border-b border-border px-2 py-1 text-left"
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open ? <div id={contentId}>{children}</div> : null}
    </section>
  );
}

export type TypographyMatrixRole = {
  key: string;
  label: string;
  font?: string | null;
  fontSize?: string | null;
  bold?: boolean;
  smallCaps?: boolean;
  showBold?: boolean;
  showSmallCaps?: boolean;
};

export function RenderCvTypographyMatrix({
  roles,
  fontOptions,
  onFontChange,
  onFontSizeChange,
  onBoldChange,
  onSmallCapsChange,
}: {
  roles: TypographyMatrixRole[];
  fontOptions: readonly string[];
  onFontChange: (key: string, value: string) => void;
  onFontSizeChange: (key: string, value: string) => void;
  onBoldChange: (key: string, value: boolean) => void;
  onSmallCapsChange: (key: string, value: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Role
            </th>
            <th className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Font
            </th>
            <th className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Size
            </th>
            <th className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Bold
            </th>
            <th className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Caps
            </th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.key} className="border-b border-border last:border-b-0">
              <td className="px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-foreground">
                {role.label}
              </td>
              <td className="px-2 py-1">
                <select
                  value={fontOptions.includes(role.font ?? '') ? (role.font ?? '') : ''}
                  onChange={(e) => onFontChange(role.key, e.target.value)}
                  className="h-7 w-full min-w-[7rem] rounded-none border border-border bg-card px-1.5 font-mono text-[11px] focus:border-primary"
                >
                  <option value="">—</option>
                  {fontOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1">
                <RenderCvDimensionInput
                  value={role.fontSize}
                  onChange={(value) => onFontSizeChange(role.key, value)}
                />
              </td>
              <td className="px-2 py-1">
                {role.showBold !== false ? (
                  <RenderCvToggle
                    compact
                    checked={role.bold}
                    onChange={(value) => onBoldChange(role.key, value)}
                  />
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-2 py-1">
                {role.showSmallCaps !== false ? (
                  <RenderCvToggle
                    compact
                    checked={role.smallCaps}
                    onChange={(value) => onSmallCapsChange(role.key, value)}
                  />
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ColorGridItem = {
  key: string;
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
};

export function RenderCvColorGrid({
  items,
  columns = 2,
}: {
  items: ColorGridItem[];
  columns?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        'grid gap-0 border-t border-border',
        columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1'
      )}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="grid border-b border-border px-2 py-1.5 md:grid-cols-[minmax(0,7rem)_minmax(0,1fr)] md:items-center md:gap-2"
        >
          <p className="font-mono text-[11px] uppercase tracking-wide text-foreground">
            {item.label}
          </p>
          <RenderCvColorInput
            value={item.value}
            onChange={item.onChange}
            placeholder="Hex, rgb(...), hsl(...), or named color"
          />
        </div>
      ))}
    </div>
  );
}

type MarginSide = 'top' | 'bottom' | 'left' | 'right';

function parseMarginAmount(value?: string | null): string {
  const raw = `${value ?? ''}`.trim();
  const match = raw.match(/^(-?(?:\d+\.?\d*|\.\d+))/);
  return match ? match[1] : raw;
}

function detectMarginUnit(value?: string | null): RenderDimensionUnit {
  const raw = `${value ?? ''}`.trim().toLowerCase();
  const detected = RENDER_DIMENSION_UNITS.find((unit) => raw.endsWith(unit));
  return detected ?? 'in';
}

export function RenderCvMarginGrid({
  margins,
  onChange,
}: {
  margins: Record<MarginSide, string | undefined>;
  onChange: (side: MarginSide, value: string) => void;
}) {
  const initialUnit =
    detectMarginUnit(margins.top) ||
    detectMarginUnit(margins.bottom) ||
    detectMarginUnit(margins.left) ||
    detectMarginUnit(margins.right);
  const [unit, setUnit] = useState<RenderDimensionUnit>(initialUnit);
  const [drafts, setDrafts] = useState<Record<MarginSide, string>>({
    top: parseMarginAmount(margins.top),
    bottom: parseMarginAmount(margins.bottom),
    left: parseMarginAmount(margins.left),
    right: parseMarginAmount(margins.right),
  });

  useEffect(() => {
    setDrafts({
      top: parseMarginAmount(margins.top),
      bottom: parseMarginAmount(margins.bottom),
      left: parseMarginAmount(margins.left),
      right: parseMarginAmount(margins.right),
    });
    const nextUnit =
      detectMarginUnit(margins.top) ||
      detectMarginUnit(margins.bottom) ||
      detectMarginUnit(margins.left) ||
      detectMarginUnit(margins.right);
    setUnit(nextUnit);
  }, [margins.top, margins.bottom, margins.left, margins.right]);

  const commitSide = (side: MarginSide, amount: string, nextUnit: RenderDimensionUnit) => {
    const normalized = normalizeAmountForCommit(amount);
    if (normalized === '' || normalized === '-') {
      onChange(side, '');
      return;
    }
    onChange(side, formatDimensionValue(normalized, nextUnit));
  };

  const applyUnit = (nextUnit: RenderDimensionUnit) => {
    setUnit(nextUnit);
    (['top', 'bottom', 'left', 'right'] as MarginSide[]).forEach((side) => {
      const amount = drafts[side];
      if (amount.trim() !== '' && amount.trim() !== '-') {
        onChange(side, formatDimensionValue(normalizeAmountForCommit(amount), nextUnit));
      }
    });
  };

  const sides: Array<{ side: MarginSide; label: string }> = [
    { side: 'top', label: 'Top' },
    { side: 'bottom', label: 'Bottom' },
    { side: 'left', label: 'Left' },
    { side: 'right', label: 'Right' },
  ];

  return (
    <div className="grid gap-2 px-2 py-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
      {sides.map(({ side, label }) => (
        <div key={side} className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <Input
            pasteMode="plainText"
            value={drafts[side]}
            onChange={(event) => setDrafts((prev) => ({ ...prev, [side]: event.target.value }))}
            onBlur={() => commitSide(side, drafts[side], unit)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitSide(side, drafts[side], unit);
                (event.target as HTMLInputElement).blur();
              }
            }}
            inputMode="decimal"
            className="h-7 w-full rounded-none border border-border font-mono text-sm focus-visible:border-primary focus-visible:ring-0"
          />
        </div>
      ))}
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Unit</p>
        <select
          value={unit}
          onChange={(e) => applyUnit(e.target.value as RenderDimensionUnit)}
          className="h-7 w-full min-w-[3.5rem] rounded-none border border-border bg-card px-1 font-mono text-[9px] uppercase focus:border-primary"
        >
          {RENDER_DIMENSION_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function normalizeBoldKeywords(list: string[]): string[] {
  const next = list.map((s) => s.trim()).filter((s) => s.length >= 2);
  next.sort((a, b) => b.length - a.length);
  return next;
}

export function RenderCvBoldKeywordChips({
  keywords,
  onChange,
  addLabel = 'Add',
  placeholder = 'Add keyword',
  removeAriaLabel = 'Remove',
}: {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  addLabel?: string;
  placeholder?: string;
  removeAriaLabel?: string;
}) {
  const [draftKeyword, setDraftKeyword] = useState('');

  const addKeyword = () => {
    const word = draftKeyword.trim();
    if (word.length < 2) return;
    if (keywords.some((k) => k.toLowerCase() === word.toLowerCase())) {
      setDraftKeyword('');
      return;
    }
    setDraftKeyword('');
    onChange(normalizeBoldKeywords([...keywords, word]));
  };

  const removeKeyword = (word: string) => {
    onChange(normalizeBoldKeywords(keywords.filter((k) => k !== word)));
  };

  return (
    <div className="space-y-1.5 px-2 py-2">
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex max-w-full items-center gap-0.5 border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/85"
            >
              <span className="truncate">{kw}</span>
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                className="shrink-0 rounded-none p-0.5 text-muted-foreground hover:bg-black/[0.06] hover:text-red-700"
                aria-label={removeAriaLabel}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1">
        <Input
          pasteMode="plainTextSingleParagraph"
          value={draftKeyword}
          onChange={(e) => setDraftKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addKeyword();
            }
          }}
          placeholder={placeholder}
          className="h-7 min-w-0 flex-1 rounded-none border border-border bg-card px-2 font-mono text-sm focus-visible:border-primary focus-visible:ring-0"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="builderOutline"
          size="xs"
          className="h-7 shrink-0 rounded-none px-2"
          onClick={addKeyword}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
