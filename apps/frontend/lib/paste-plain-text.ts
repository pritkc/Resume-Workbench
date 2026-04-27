/**
 * Clipboard paste helpers: force text/plain and normalize common YAML / word-wrapped
 * continuations (lines that start with 2+ spaces) so a folded bullet pastes as one paragraph.
 */

import type { ClipboardEvent } from 'react';

export type PasteMode = 'native' | 'plainText' | 'plainTextSingleParagraph' | 'plainTextMultiline';

/**
 * Join YAML-style wrapped lines: after a non-empty line, a line that begins with 2+
 * spaces then non-whitespace continues the previous line. Blank lines start a new chunk.
 */
export function collapseYamlStyleLineWrap(text: string): string {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flush();
      continue;
    }
    const isContinuation = /^\s{2,}\S/.test(line);
    if (isContinuation && current) {
      current += ` ${line.trim()}`;
    } else {
      if (current) flush();
      current = line.trimEnd();
    }
  }
  flush();
  return chunks.join('\n');
}

/** One logical paragraph (bullets, titles, single-line inputs). */
export function normalizePastedSingleParagraph(text: string): string {
  return collapseYamlStyleLineWrap(text).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Summary, cover letter, instructions: keep blank-line paragraph breaks, merge wrapped lines. */
export function normalizePastedMultiline(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((block) => collapseYamlStyleLineWrap(block.trim()))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function applyPasteMode(raw: string, mode: Exclude<PasteMode, 'native'>): string {
  if (mode === 'plainText') return raw;
  if (mode === 'plainTextSingleParagraph') return normalizePastedSingleParagraph(raw);
  return normalizePastedMultiline(raw);
}

export function handlePasteWithMode(
  e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  mode: PasteMode,
  getValue: () => string,
  commit: (next: string) => void
): void {
  if (mode === 'native') return;

  const cd = e.clipboardData;
  if (!cd) return;

  const raw = cd.getData('text/plain');
  if (raw === '') {
    return;
  }

  e.preventDefault();

  const text = applyPasteMode(raw, mode);
  const el = e.currentTarget;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const current = getValue();
  const next = current.slice(0, start) + text + current.slice(end);
  commit(next);

  const caret = start + text.length;
  queueMicrotask(() => {
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* noop */
    }
  });
}
