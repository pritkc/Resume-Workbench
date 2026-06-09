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

// ─── Section header ─────────────────────────────────────────────────────────
export function RenderCvSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border bg-card last:border-b-0">
      <div className="flex h-6 items-center border-b border-border bg-muted/40 px-2">
        <p className="font-sans text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          {title}
        </p>
      </div>
      <div>{children}</div>
    </section>
  );
}

// ─── Pill nav ───────────────────────────────────────────────────────────────
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
    <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-border bg-card px-1.5 py-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'inline-flex h-5 items-center rounded-full px-2 font-sans text-[10px] font-medium transition-colors focus-visible:outline-none',
            item.id === activeId
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Compact row (label-left layout — used in Advanced panel & legacy) ───────
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
  density?: 'default' | 'compact';
}) {
  return (
    <div
      className={cn(
        'grid items-center border-b border-border last:border-b-0',
        'gap-2 px-2 py-0.5 md:grid-cols-[90px_minmax(0,1fr)]'
      )}
      title={description}
    >
      <p className="font-sans text-[10px] leading-tight text-muted-foreground">{label}</p>
      <div>
        {children}
        {fieldHint ? (
          <p className="mt-0.5 font-sans text-[9px] text-muted-foreground/70">{fieldHint}</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Figma-style field grid (label above, multi-column) ─────────────────────
export type FieldGridItem = {
  label: string;
  node: ReactNode;
  /** How many grid columns this item spans. Default 1. */
  span?: number;
  /** Use full width only for long text fields; controls default to content width. */
  width?: 'auto' | 'full';
};

export function RenderCvFieldGrid({
  fields,
  cols = 2,
  className,
}: {
  fields: FieldGridItem[];
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('grid w-fit max-w-full gap-x-2 gap-y-1 px-2 py-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }}
    >
      {fields.map((f) => (
        <div
          key={f.label}
          className={cn(
            'flex min-w-0 flex-col items-start gap-0.5',
            f.width === 'full' ? 'w-full' : 'w-fit max-w-full'
          )}
          style={f.span ? { gridColumn: `span ${f.span}` } : undefined}
        >
          <span className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/70">
            {f.label}
          </span>
          {f.node}
        </div>
      ))}
    </div>
  );
}

// ─── Inline toggle group (boolean flags as a horizontal strip) ───────────────
export function RenderCvToggleRow({
  items,
}: {
  items: Array<{ label: string; checked?: boolean; onChange: (v: boolean) => void }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-2 py-1 border-b border-border last:border-b-0">
      {items.map((item) => (
        <label key={item.label} className="inline-flex cursor-pointer items-center gap-1.5">
          <RenderCvToggle compact checked={item.checked} onChange={item.onChange} />
          <span className="font-sans text-[10px] text-muted-foreground">{item.label}</span>
        </label>
      ))}
    </div>
  );
}

// ─── Inputs ─────────────────────────────────────────────────────────────────
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
    <input
      type={type}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-5 w-full rounded-sm border border-border bg-card px-1.5 font-mono text-[10px] focus:border-primary focus:outline-none"
    />
  );
}

export function RenderCvTextarea({
  value,
  onChange,
  rows = 3,
  placeholder,
  className,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Textarea
      rows={rows}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        'min-h-[40px] rounded-sm border border-border bg-card px-1.5 py-0.5 font-sans text-[10px] focus-visible:border-primary focus-visible:ring-0',
        className
      )}
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
    <div className="inline-flex max-w-full flex-row items-center gap-1">
      {!isPreset ? (
        <input
          value={current}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-5 w-28 min-w-0 rounded-sm border border-border px-1 font-mono text-[10px] focus:border-primary focus:outline-none"
        />
      ) : null}
      <select
        value={options.includes(current) ? current : ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-5 rounded-sm border border-border bg-card px-1 font-mono text-[10px]',
          isPreset ? 'w-auto max-w-[8rem]' : 'w-auto max-w-[8rem] shrink-0'
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

// ─── Color input ─────────────────────────────────────────────────────────────
function rgbToHex(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const raw = hexMatch[1];
    if (raw.length === 3) {
      return `#${raw
        .split('')
        .map((p) => `${p}${p}`)
        .join('')
        .toLowerCase()}`;
    }
    return `#${raw.toLowerCase()}`;
  }
  const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (!rgbMatch) return null;
  const [, r, g, b] = rgbMatch;
  const toHex = (p: string) =>
    Math.max(0, Math.min(255, Number.parseInt(p, 10)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
    <div className="flex h-5 w-[8.75rem] max-w-full overflow-hidden rounded-sm border border-border bg-card focus-within:border-primary">
      <label className="relative flex h-full w-5 shrink-0 cursor-pointer items-center justify-center border-r border-border">
        <span className="absolute inset-0.5 rounded-sm" style={{ backgroundColor: pickerValue }} />
        <input
          type="color"
          aria-label="Pick color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '#rrggbb'}
        className="h-full min-w-0 flex-1 bg-transparent px-1 font-mono text-[9px] focus:outline-none"
      />
    </div>
  );
}

// ─── Dimension input (unified split-button) ──────────────────────────────────
const DIMENSION_PATTERN = /^(-?(?:\d+\.?\d*|\.\d+))\s*(cm|mm|in|pt|em|ex)?$/i;

function parseDimensionValue(value?: string | number | null): {
  amount: string;
  unit: RenderDimensionUnit | null;
} {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return { amount: '', unit: null };
  const match = raw.match(DIMENSION_PATTERN);
  if (match) {
    return {
      amount: match[1],
      unit: (match[2]?.toLowerCase() as RenderDimensionUnit | undefined) ?? null,
    };
  }
  const detectedUnit = RENDER_DIMENSION_UNITS.find((u) => raw.toLowerCase().endsWith(u)) ?? null;
  if (!detectedUnit) return { amount: raw, unit: null };
  return { amount: raw.slice(0, -detectedUnit.length).trim(), unit: detectedUnit };
}

function formatDimensionValue(amount: string, unit: RenderDimensionUnit | null): string {
  const a = amount.trim();
  if (!a) return '';
  return unit ? `${a}${unit}` : a;
}

function normalizeAmountForCommit(amount: string): string {
  let a = amount.trim();
  if (a.endsWith('.')) a = a.slice(0, -1);
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
    if (p.unit) setDraftUnit(p.unit);
    else if (ph.unit) setDraftUnit(ph.unit);
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
    <div className="flex h-5 w-[5.75rem] max-w-full min-w-0 overflow-hidden rounded-sm border border-border bg-card focus-within:border-primary">
      <input
        type="text"
        inputMode="decimal"
        value={amountDraft}
        onChange={(e) => setAmountDraft(e.target.value)}
        onBlur={() => commitDimension(amountDraft, draftUnit)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDimension(amountDraft, draftUnit);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={parsedPlaceholder.amount || '0'}
        className="h-full w-0 min-w-0 flex-1 bg-transparent px-1 font-mono text-[10px] focus:outline-none"
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
        className="h-full w-7 shrink-0 border-l border-border bg-card px-0 text-center font-mono text-[9px] focus:outline-none"
      >
        {RENDER_DIMENSION_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Bullet picker ───────────────────────────────────────────────────────────
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
    <div className="flex flex-wrap gap-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded border text-sm transition',
            value === option
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────
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
      onChange={(e) => onChange(e.target.value)}
      className="h-5 w-auto max-w-full rounded-sm border border-border bg-card px-1 font-mono text-[10px] focus:border-primary focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Toggle (pill) ───────────────────────────────────────────────────────────
export function RenderCvToggle({
  checked,
  onChange,
}: {
  checked?: boolean;
  onChange: (value: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1">
      <span
        className={cn(
          'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150',
          checked ? 'border-primary bg-primary' : 'border-border bg-muted',
          'h-3.5 w-6'
        )}
      >
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={cn(
            'inline-block rounded-full bg-white shadow transition-transform duration-150',
            'h-2.5 w-2.5',
            checked ? 'translate-x-2.5' : 'translate-x-0.5'
          )}
        />
      </span>
    </label>
  );
}

// ─── Icon button strip (segmented control) ───────────────────────────────────
export type IconButtonOption<T extends string = string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  iconOnly?: boolean;
};

export function RenderCvIconButtonStrip<T extends string>({
  value,
  options,
  onChange,
}: {
  value?: T | string | null;
  options: IconButtonOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-sm border border-border">
      {options.map((option, i) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            title={option.label}
            onClick={() => onChange(option.id as T)}
            className={cn(
              'inline-flex h-5 items-center justify-center text-[10px] font-medium transition-colors focus-visible:outline-none',
              option.iconOnly ? 'w-5 px-0' : 'px-1.5',
              i > 0 && 'border-l border-border',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {option.icon}
            {!option.iconOnly && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Color grid ──────────────────────────────────────────────────────────────
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
    <div className={cn('grid', columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1')}>
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-center gap-1.5 border-b border-border px-2 py-0.5 last:border-b-0"
        >
          <span className="w-[4.5rem] shrink-0 font-sans text-[9px] text-muted-foreground">
            {item.label}
          </span>
          <div className="min-w-0">
            <RenderCvColorInput value={item.value} onChange={item.onChange} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Panel header ────────────────────────────────────────────────────────────
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
    <div className="flex h-6 items-center justify-between gap-2 border-b border-border bg-card px-2">
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="font-sans text-[10px] text-muted-foreground hover:text-red-600 hover:underline"
        >
          {resetLabel}
        </button>
      ) : null}
    </div>
  );
}

export function RenderCvSectionAnchors({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <div className="sticky top-[42px] z-[9] flex flex-wrap border-b border-border bg-card/95 backdrop-blur-sm">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            document
              .getElementById(item.id)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="inline-flex h-5 items-center px-2 font-sans text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Collapsible section ─────────────────────────────────────────────────────
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
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        title={hint}
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-2 bg-muted/30 px-2 py-1 text-left"
      >
        <p className="font-sans text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open ? <div id={contentId}>{children}</div> : null}
    </section>
  );
}

// ─── Typography matrix ───────────────────────────────────────────────────────
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
      <table className="w-fit min-w-[18rem] max-w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-2 py-0.5 font-sans text-[9px] font-semibold text-muted-foreground w-[5rem]">
              Role
            </th>
            <th className="px-1 py-0.5 font-sans text-[9px] font-semibold text-muted-foreground w-[8rem]">
              Font
            </th>
            <th className="px-1 py-0.5 font-sans text-[9px] font-semibold text-muted-foreground w-[4.5rem]">
              Size
            </th>
            <th className="px-1 py-0.5 font-sans text-[9px] font-semibold text-muted-foreground w-8">
              B
            </th>
            <th className="px-1 py-0.5 font-sans text-[9px] font-semibold text-muted-foreground w-8">
              SC
            </th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.key} className="border-b border-border last:border-b-0">
              <td className="px-2 py-0.5 font-sans text-[10px] text-foreground">{role.label}</td>
              <td className="px-1 py-0.5">
                <select
                  value={fontOptions.includes(role.font ?? '') ? (role.font ?? '') : ''}
                  onChange={(e) => onFontChange(role.key, e.target.value)}
                  className="h-5 w-auto min-w-[5rem] max-w-[8rem] rounded-sm border border-border bg-card px-0.5 font-mono text-[9px] focus:border-primary focus:outline-none"
                >
                  <option value="">—</option>
                  {fontOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-1 py-0.5">
                <RenderCvDimensionInput
                  value={role.fontSize}
                  onChange={(v) => onFontSizeChange(role.key, v)}
                />
              </td>
              <td className="px-1 py-0.5 text-center">
                {role.showBold !== false ? (
                  <RenderCvToggle
                    compact
                    checked={role.bold}
                    onChange={(v) => onBoldChange(role.key, v)}
                  />
                ) : (
                  <span className="text-[9px] text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-1 py-0.5 text-center">
                {role.showSmallCaps !== false ? (
                  <RenderCvToggle
                    compact
                    checked={role.smallCaps}
                    onChange={(v) => onSmallCapsChange(role.key, v)}
                  />
                ) : (
                  <span className="text-[9px] text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Margin widget (page thumbnail) ─────────────────────────────────────────
type MarginSide = 'top' | 'bottom' | 'left' | 'right';

function parseMarginAmount(value?: string | null): string {
  const raw = `${value ?? ''}`.trim();
  const match = raw.match(/^(-?(?:\d+\.?\d*|\.\d+))/);
  return match ? match[1] : raw;
}

function detectMarginUnit(value?: string | null): RenderDimensionUnit {
  const raw = `${value ?? ''}`.trim().toLowerCase();
  const detected = RENDER_DIMENSION_UNITS.find((u) => raw.endsWith(u));
  return detected ?? 'in';
}

function commitMargin(amount: string, unit: RenderDimensionUnit): string {
  const n = amount.trim().replace(/\.$/, '');
  if (n === '' || n === '-') return '';
  return `${n}${unit}`;
}

function SmallMarginInput({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: string;
  unit: RenderDimensionUnit;
  onChange: (amount: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-sans text-[8px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onChange(draft);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-5 w-10 rounded border border-border bg-card text-center font-mono text-[9px] focus:border-primary focus:outline-none"
        title={`${label} margin (${unit})`}
      />
    </div>
  );
}

export function RenderCvMarginGrid({
  margins,
  onChange,
}: {
  margins: Record<MarginSide, string | undefined>;
  onChange: (side: MarginSide, value: string) => void;
}) {
  const initialUnit = detectMarginUnit(margins.top) || detectMarginUnit(margins.left) || 'in';
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
    const next = detectMarginUnit(margins.top) || detectMarginUnit(margins.left);
    setUnit(next);
  }, [margins.top, margins.bottom, margins.left, margins.right]);

  const commitSide = (side: MarginSide, amount: string) => {
    setDrafts((p) => ({ ...p, [side]: amount }));
    onChange(side, commitMargin(amount, unit));
  };

  const applyUnit = (nextUnit: RenderDimensionUnit) => {
    setUnit(nextUnit);
    (['top', 'bottom', 'left', 'right'] as MarginSide[]).forEach((side) => {
      const amount = drafts[side];
      if (amount.trim() !== '' && amount.trim() !== '-') {
        onChange(side, commitMargin(amount, nextUnit));
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-2">
      {/* Top */}
      <SmallMarginInput
        label="Top"
        value={drafts.top}
        unit={unit}
        onChange={(v) => commitSide('top', v)}
      />

      {/* Middle: Left | page | Right */}
      <div className="flex items-center gap-2">
        <SmallMarginInput
          label="Left"
          value={drafts.left}
          unit={unit}
          onChange={(v) => commitSide('left', v)}
        />
        {/* Page thumbnail */}
        <div className="relative flex h-12 w-9 flex-col items-stretch justify-between rounded border-2 border-border bg-muted/20 p-1">
          {[60, 40, 60, 30].map((w, i) => (
            <div key={i} className="h-0.5 rounded-full bg-border/60" style={{ width: `${w}%` }} />
          ))}
        </div>
        <SmallMarginInput
          label="Right"
          value={drafts.right}
          unit={unit}
          onChange={(v) => commitSide('right', v)}
        />
      </div>

      {/* Bottom */}
      <SmallMarginInput
        label="Bottom"
        value={drafts.bottom}
        unit={unit}
        onChange={(v) => commitSide('bottom', v)}
      />

      {/* Unit */}
      <div className="flex items-center gap-1">
        <span className="font-sans text-[9px] text-muted-foreground">Unit</span>
        <select
          value={unit}
          onChange={(e) => applyUnit(e.target.value as RenderDimensionUnit)}
          className="h-4 rounded border border-border bg-card px-0.5 font-mono text-[9px] focus:outline-none"
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

// ─── Bold keyword chips ──────────────────────────────────────────────────────
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

  return (
    <div className="space-y-1 px-2 py-1.5">
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-0.5">
          {keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
            >
              <span className="truncate">{kw}</span>
              <button
                type="button"
                onClick={() => onChange(normalizeBoldKeywords(keywords.filter((k) => k !== kw)))}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-red-700"
                aria-label={removeAriaLabel}
              >
                <X className="h-2.5 w-2.5" />
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
          className="h-5 min-w-0 flex-1 rounded-sm border border-border bg-card px-1.5 font-mono text-[10px] focus-visible:border-primary focus-visible:ring-0"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="builderOutline"
          size="xs"
          className="h-5 shrink-0 rounded-sm px-2 text-[10px]"
          onClick={addKeyword}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
