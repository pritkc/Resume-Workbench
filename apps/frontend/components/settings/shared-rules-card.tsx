'use client';

import React, { useEffect, useState } from 'react';
import type { SharedRuleEntry } from '@/lib/api/config';
import { putSharedRulesOverride } from '@/lib/api/config';
import { Button } from '@/components/ui/button';
import { CopyCharBar } from '@/components/settings/prompt-field-chrome';
import { AutosizePromptTextarea } from '@/components/settings/autosize-prompt-textarea';

const cardClass = 'scroll-mt-6 rounded-lg border border-slate-200/70 bg-card px-3 py-3 sm:px-4';

const textareaClass =
  'w-full resize-y whitespace-pre-wrap rounded-md border border-slate-200/80 bg-slate-50/50 px-2 py-2 font-mono text-[12px] leading-relaxed text-slate-800 focus-visible:border-slate-300 focus-visible:bg-card focus-visible:outline-none';

const shippedPreClass =
  'whitespace-pre-wrap break-words rounded-md border border-slate-100 bg-slate-50/80 p-2.5 font-mono text-[11px] leading-relaxed text-slate-700';

export function SharedRulesCard({
  rule,
  t,
  onReset,
  onSaved,
  resetting,
}: {
  rule: SharedRuleEntry;
  t: (key: string, params?: Record<string, string | number>) => string;
  onReset?: (rulesName: string) => void;
  onSaved?: () => Promise<void>;
  resetting?: boolean;
}): React.ReactElement {
  const [draft, setDraft] = useState(rule.rules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(rule.rules);
  }, [rule.rules]);

  const handleSave = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await putSharedRulesOverride(rule.name, draft);
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article id={`catalog-shared-${rule.name}`} className={cardClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-slate-900">{rule.label}</h3>
          <code className="font-mono text-[11px] text-slate-500">{rule.name}</code>
          {rule.rules_is_override ? (
            <span className="ml-2 text-[10px] font-medium text-amber-800/90">
              {t('settings.promptCatalog.overrideShort')}
            </span>
          ) : null}
        </div>
      </div>

      <details className="mt-1.5">
        <summary className="cursor-pointer list-none text-[11px] text-slate-400 marker:hidden hover:text-slate-600 [&::-webkit-details-marker]:hidden">
          <span className="border-b border-dotted border-slate-300">
            {t('settings.promptCatalog.sourcesSummary')}
          </span>
        </summary>
        <ul className="mt-1.5 space-y-0.5 border-l border-slate-200 pl-2 text-[10px] leading-snug text-slate-500">
          <li>
            {t('settings.promptCatalog.usedBy')}: {rule.used_by.join(', ')}
          </li>
          {rule.rules_source_file ? <li className="font-mono">{rule.rules_source_file}</li> : null}
        </ul>
      </details>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-2">
        <div className="mb-1 flex items-end justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {t('settings.promptCatalog.sharedRulesEditorLabel')}
          </span>
          <CopyCharBar text={draft} t={t} />
        </div>
        <AutosizePromptTextarea
          className={textareaClass}
          value={draft}
          onChange={setDraft}
          spellCheck={false}
          aria-label={rule.label}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100"
          disabled={busy || resetting}
          onClick={() => void handleSave()}
        >
          {busy ? '…' : t('settings.promptCatalog.saveComposer')}
        </Button>
        {rule.rules_is_override && onReset ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            disabled={busy || resetting}
            onClick={() => onReset(rule.name)}
          >
            {resetting ? '…' : t('settings.promptCatalog.resetComposer')}
          </Button>
        ) : null}
      </div>

      <details className="mt-2 rounded-md border border-slate-100 bg-slate-50/30 px-2 py-2">
        <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {t('settings.promptCatalog.composerShippedDefaults')}
        </summary>
        <div className="mt-2">
          <div className="mb-1 flex items-end justify-between gap-2">
            <span className="text-[10px] font-medium uppercase text-slate-400">
              {t('settings.promptCatalog.sharedRulesShippedHint')}
            </span>
            <CopyCharBar text={rule.rules_default} t={t} />
          </div>
          <pre className={shippedPreClass}>{rule.rules_default}</pre>
        </div>
      </details>
    </article>
  );
}
