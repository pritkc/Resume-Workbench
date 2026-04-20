'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatDraftValidationDetail,
  type DraftValidationDetail,
  type RawYamlSection,
} from '@/lib/api/resume';
import { cn } from '@/lib/utils';

interface RawYamlEditorProps {
  section: RawYamlSection;
  value: string;
  statusLabel: string;
  error?: DraftValidationDetail | null;
  isLoading?: boolean;
  onChange: (value: string) => void;
  onCopySection: () => void;
  onCopyAll: () => void;
  onResync: () => void;
  onFocusErrorSection?: () => void;
  /** Optional: copy metadata+cv bundle for external LLM (same row as Resync / Copy). */
  onCopyLlmBundle?: () => void | Promise<void>;
  onApplyLlmClipboard?: () => void | Promise<void>;
  copyLlmLabel?: string;
  applyLlmLabel?: string;
}

const SECTION_DESCRIPTIONS: Record<RawYamlSection, string> = {
  cv: 'Edit resume content directly in RenderCV YAML form.',
  design: 'Fine-tune theme design values in raw YAML.',
  locale: 'Adjust RenderCV locale labels and month names.',
  settings: 'Control runtime settings like date and PDF title.',
  metadata: 'App-only: role, company, location, bold keywords (not passed to RenderCV CLI alone).',
};

const SECTION_LABELS: Record<RawYamlSection, string> = {
  cv: 'CV',
  design: 'Design',
  locale: 'Locale',
  settings: 'Settings',
  metadata: 'Metadata',
};

const YAML_SOFT_CTA =
  'h-6 rounded-none border border-black/18 bg-white px-2.5 text-[10px] font-mono font-medium uppercase tracking-wide text-black/72 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] hover:border-black/30 hover:bg-black/[0.03] hover:text-black disabled:opacity-50';

const LINE_HEIGHT_PX = 24;
const EDITOR_PADDING_PX = 16;
const INDENT_SIZE_COLUMNS = 2;

type CursorPosition = {
  line: number;
  column: number;
};

function splitYamlComment(line: string): { code: string; comment: string | null } {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const previousCharacter = line[index - 1];

    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (character === '"' && !inSingleQuote && previousCharacter !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (character === '#' && !inSingleQuote && !inDoubleQuote) {
      return {
        code: line.slice(0, index),
        comment: line.slice(index),
      };
    }
  }

  return { code: line, comment: null };
}

function renderScalar(value: string): React.ReactNode {
  if (!value) {
    return null;
  }

  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? '';
  const trimmedValue = value.slice(leadingWhitespace.length);
  const normalizedScalar = trimmedValue.trim();

  let className = 'text-slate-700';
  if (
    normalizedScalar === 'true' ||
    normalizedScalar === 'false' ||
    normalizedScalar === 'null' ||
    normalizedScalar === '~'
  ) {
    className = 'text-violet-700';
  } else if (/^-?\d+(\.\d+)?$/.test(normalizedScalar)) {
    className = 'text-fuchsia-700';
  } else if (
    normalizedScalar.startsWith("'") ||
    normalizedScalar.startsWith('"') ||
    normalizedScalar === '|' ||
    normalizedScalar === '>'
  ) {
    className = 'text-amber-700';
  }

  return (
    <>
      {leadingWhitespace}
      <span className={className}>{trimmedValue}</span>
    </>
  );
}

function highlightYamlLine(line: string): React.ReactNode {
  if (!line) {
    return <span>&nbsp;</span>;
  }

  const { code, comment } = splitYamlComment(line);
  const listMatch = code.match(/^(\s*-\s+)(.*)$/);
  const listPrefix = listMatch?.[1] ?? '';
  const lineBody = listMatch?.[2] ?? code;
  const keyMatch = lineBody.match(/^((?:["'][^"']+["']|[^:#]+?))(\s*:\s*)(.*)$/);

  return (
    <>
      {listPrefix && <span className="text-rose-700">{listPrefix}</span>}
      {keyMatch ? (
        <>
          <span className="text-blue-700">{keyMatch[1]}</span>
          <span className="text-slate-500">{keyMatch[2]}</span>
          {renderScalar(keyMatch[3])}
        </>
      ) : (
        <span className="text-slate-700">{lineBody || '\u00a0'}</span>
      )}
      {comment ? <span className="text-emerald-700">{comment}</span> : null}
    </>
  );
}

function cursorFromSelection(value: string, selectionStart: number): CursorPosition {
  const safeSelectionStart = Math.max(0, Math.min(selectionStart, value.length));
  const beforeCursor = value.slice(0, safeSelectionStart);
  const lines = beforeCursor.split('\n');
  const line = lines.length;
  const column = (lines.at(-1)?.length ?? 0) + 1;

  return { line, column };
}

function offsetForLine(value: string, lineNumber: number, columnNumber = 1): number {
  const safeLineNumber = Math.max(1, lineNumber);
  const lines = value.split('\n');
  const lineIndex = Math.min(lines.length - 1, safeLineNumber - 1);
  const baseOffset =
    lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0) +
    Math.max(0, columnNumber - 1);
  const lineLength = lines[lineIndex]?.length ?? 0;
  const maxOffsetForLine =
    lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0) + lineLength;

  return Math.min(baseOffset, maxOffsetForLine);
}

function getLeadingIndentColumns(line: string): number {
  let columns = 0;

  for (const character of line) {
    if (character === ' ') {
      columns += 1;
      continue;
    }

    if (character === '\t') {
      columns += INDENT_SIZE_COLUMNS;
      continue;
    }

    break;
  }

  return columns;
}

export function RawYamlEditor({
  section,
  value,
  statusLabel,
  error,
  isLoading = false,
  onChange,
  onCopySection,
  onCopyAll,
  onResync,
  onFocusErrorSection,
  onCopyLlmBundle,
  onApplyLlmClipboard,
  copyLlmLabel,
  applyLlmLabel,
}: RawYamlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [scrollState, setScrollState] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ line: 1, column: 1 });

  const lines = useMemo(() => value.split('\n'), [value]);
  const gutterWidth = useMemo(() => `${Math.max(3, String(lines.length).length + 2)}ch`, [lines]);
  const activeError = useMemo(
    () => (error && (!error.section || error.section === section) ? error : null),
    [error, section]
  );
  const highlightedLines = useMemo(() => lines.map((line) => highlightYamlLine(line)), [lines]);

  const syncCursorPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    setCursorPosition(cursorFromSelection(value, textarea.selectionStart));
  }, [value]);

  useEffect(() => {
    syncCursorPosition();

    if (pendingSelectionRef.current && textareaRef.current) {
      textareaRef.current.setSelectionRange(
        pendingSelectionRef.current.start,
        pendingSelectionRef.current.end
      );
      pendingSelectionRef.current = null;
      syncCursorPosition();
    }
  }, [syncCursorPosition]);

  const applyValueWithSelection = (nextValue: string, start: number, end = start) => {
    onChange(nextValue);
    pendingSelectionRef.current = { start, end };
  };

  const handleTextAreaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    setCursorPosition(cursorFromSelection(event.target.value, event.target.selectionStart));
  };

  const handleScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    setScrollState({
      top: event.currentTarget.scrollTop,
      left: event.currentTarget.scrollLeft,
    });
  };

  const jumpToLine = (lineNumber: number, columnNumber = 1) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const offset = offsetForLine(value, lineNumber, columnNumber);
    const nextScrollTop = Math.max(0, (lineNumber - 3) * LINE_HEIGHT_PX);

    textarea.focus();
    textarea.scrollTo({ top: nextScrollTop, behavior: 'smooth' });
    setScrollState((current) => ({ ...current, top: nextScrollTop }));
    pendingSelectionRef.current = { start: offset, end: offset };
    textarea.setSelectionRange(offset, offset);
    setCursorPosition(cursorFromSelection(value, offset));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;

    if (event.key === 'Tab') {
      event.preventDefault();

      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const nextLineBreak = value.indexOf('\n', selectionEnd);
      const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
      const block = value.slice(lineStart, lineEnd);
      const blockLines = block.split('\n');

      if (!event.shiftKey && !block.includes('\n') && selectionStart === selectionEnd) {
        const nextValue = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
        applyValueWithSelection(nextValue, selectionStart + 2);
        return;
      }

      let startDelta = 0;
      let endDelta = 0;
      const updatedBlock = blockLines
        .map((line, index) => {
          if (!event.shiftKey) {
            if (index === 0 && selectionStart > lineStart) {
              startDelta += 2;
            }
            endDelta += 2;
            return `  ${line}`;
          }

          const removeCount = line.startsWith('  ') ? 2 : line.startsWith(' ') ? 1 : 0;
          if (index === 0 && selectionStart > lineStart) {
            startDelta -= Math.min(removeCount, selectionStart - lineStart);
          }
          endDelta -= removeCount;
          return line.slice(removeCount);
        })
        .join('\n');

      const nextValue = `${value.slice(0, lineStart)}${updatedBlock}${value.slice(lineEnd)}`;
      applyValueWithSelection(
        nextValue,
        Math.max(lineStart, selectionStart + startDelta),
        Math.max(lineStart, selectionEnd + endDelta)
      );
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const currentIndent = currentLine.match(/^\s*/)?.[0] ?? '';
      const trimmedLine = currentLine.trimEnd();
      const nextIndent =
        trimmedLine.endsWith(':') || /^\s*-\s*$/.test(trimmedLine)
          ? `${currentIndent}  `
          : currentIndent;

      const nextValue = `${value.slice(0, selectionStart)}\n${nextIndent}${value.slice(
        selectionEnd
      )}`;
      applyValueWithSelection(nextValue, selectionStart + 1 + nextIndent.length);
    }
  };

  const currentLineTop =
    EDITOR_PADDING_PX + (cursorPosition.line - 1) * LINE_HEIGHT_PX - scrollState.top;
  const errorLineTop =
    activeError?.line != null
      ? EDITOR_PADDING_PX + (activeError.line - 1) * LINE_HEIGHT_PX - scrollState.top
      : null;

  return (
    <div className="space-y-1.5">
      <div
        className="mb-0.5 flex min-h-7 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-sm border border-black/15 bg-white px-2 py-1 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]"
        title={SECTION_DESCRIPTIONS[section]}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={onResync}
            disabled={isLoading}
            className={YAML_SOFT_CTA}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Resync
          </Button>
          <Button variant="ghost" size="xs" onClick={onCopySection} className={YAML_SOFT_CTA}>
            Copy Section
          </Button>
          <Button variant="ghost" size="xs" onClick={onCopyAll} className={YAML_SOFT_CTA}>
            Copy Full YAML
          </Button>
          {onCopyLlmBundle ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => void onCopyLlmBundle()}
              className={YAML_SOFT_CTA}
            >
              {copyLlmLabel ?? 'Copy for LLM'}
            </Button>
          ) : null}
          {onApplyLlmClipboard ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => void onApplyLlmClipboard()}
              className={YAML_SOFT_CTA}
            >
              {applyLlmLabel ?? 'Apply clipboard'}
            </Button>
          ) : null}
        </div>
        <p className="shrink-0 font-mono text-[10px] text-black/40">
          {statusLabel} · Ln {cursorPosition.line} · Col {cursorPosition.column} · {lines.length}{' '}
          lines
        </p>
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 px-3 py-2.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-red-700" />
              <div className="font-mono text-[11px] text-red-800">
                <p className="font-bold uppercase tracking-[0.18em]">
                  {error.section
                    ? `${SECTION_LABELS[error.section]} Validation`
                    : 'YAML Validation'}
                </p>
                <p className="mt-1 leading-5">{formatDraftValidationDetail(error)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {error.section && error.section !== section && onFocusErrorSection && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={onFocusErrorSection}
                  className={YAML_SOFT_CTA}
                >
                  Open {SECTION_LABELS[error.section]}
                </Button>
              )}
              {activeError?.line && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => jumpToLine(activeError.line ?? 1, activeError.column ?? 1)}
                  className={cn(YAML_SOFT_CTA, 'gap-1.5')}
                >
                  <LocateFixed className="h-4 w-4" />
                  Jump To Line
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden border border-black/15 bg-white">
        <div className="flex min-h-[min(52vh,420px)]">
          <div
            className="select-none overflow-hidden border-r border-black/10 bg-[#F4EFE2] py-2 pr-2 pl-1.5 font-mono text-[11px] leading-6 text-right text-slate-500"
            style={{ width: gutterWidth }}
          >
            <div style={{ transform: `translateY(-${scrollState.top}px)` }}>
              {lines.map((_, index) => {
                const lineNumber = index + 1;
                const isCurrentLine = lineNumber === cursorPosition.line;
                const isErrorLine = activeError?.line === lineNumber;

                return (
                  <div
                    key={`gutter-${lineNumber}`}
                    className={[
                      'h-6 px-1',
                      isCurrentLine ? 'bg-blue-100 font-bold text-blue-800' : '',
                      isErrorLine ? 'bg-red-100 font-bold text-red-700' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {lineNumber}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden bg-white">
            <div
              className="pointer-events-none absolute left-0 right-0 bg-blue-100/60"
              style={{
                top: currentLineTop,
                height: LINE_HEIGHT_PX,
              }}
            />
            {errorLineTop !== null && (
              <div
                className="pointer-events-none absolute left-0 right-0 border-l-4 border-red-500 bg-red-100/70"
                style={{
                  top: errorLineTop,
                  height: LINE_HEIGHT_PX,
                }}
              />
            )}

            <pre
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 font-mono text-sm leading-6"
            >
              <div
                style={{
                  transform: `translate(${-scrollState.left}px, -${scrollState.top}px)`,
                }}
              >
                {highlightedLines.map((highlightedLine, index) => {
                  const indentColumns = getLeadingIndentColumns(lines[index] ?? '');

                  return (
                    <div key={`line-${index + 1}`} className="relative h-6 whitespace-pre">
                      {indentColumns >= INDENT_SIZE_COLUMNS ? (
                        <span
                          className="pointer-events-none absolute left-0"
                          style={{
                            top: 2,
                            bottom: 2,
                            width: `${indentColumns}ch`,
                            backgroundImage: `repeating-linear-gradient(to right, transparent 0 calc(${INDENT_SIZE_COLUMNS}ch - 1px), rgba(148, 163, 184, 0.45) calc(${INDENT_SIZE_COLUMNS}ch - 1px) ${INDENT_SIZE_COLUMNS}ch)`,
                          }}
                        />
                      ) : null}
                      <span className="relative">{highlightedLine}</span>
                    </div>
                  );
                })}
              </div>
            </pre>

            <textarea
              ref={textareaRef}
              aria-label={`${SECTION_LABELS[section]} raw YAML editor`}
              value={value}
              onChange={handleTextAreaChange}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              onSelect={syncCursorPosition}
              onClick={syncCursorPosition}
              onKeyUp={syncCursorPosition}
              spellCheck={false}
              wrap="off"
              className="absolute inset-0 resize-none bg-transparent p-3 font-mono text-sm leading-6 text-transparent caret-slate-900 outline-none selection:bg-sky-200/70"
              style={{ tabSize: 2 }}
            />
          </div>
        </div>

        <div className="border-t border-black/10 bg-slate-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-slate-200">
          {activeError?.line
            ? `Error near line ${activeError.line}${activeError.column ? `, column ${activeError.column}` : ''}`
            : `Editing ${SECTION_LABELS[section]} YAML`}
        </div>
      </div>
    </div>
  );
}
