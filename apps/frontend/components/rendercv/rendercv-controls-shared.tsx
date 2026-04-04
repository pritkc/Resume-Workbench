'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
}: {
  label: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="grid gap-3 border-b border-gray-200 px-4 py-3 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
      </div>
      <div>{children}</div>
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
