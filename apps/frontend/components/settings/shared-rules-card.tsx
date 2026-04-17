'use client';

import React, { useEffect, useState } from 'react';
import type { SharedRuleEntry } from '@/lib/api/config';
import { putSharedRulesOverride } from '@/lib/api/config';
import { Button } from '@/components/ui/button';
import { CopyCharBar } from '@/components/settings/prompt-field-chrome';

const cardClass =
  'rounded border border-amber-600/25 bg-amber-50/40 p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.06)]';

const textareaClass =
  'mt-0.5 min-h-[min(320px,45vh)] w-full resize-y whitespace-pre-wrap border border-black/15 bg-white px-2 py-1.5 font-mono text-[11px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25';

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
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 pb-2">
        <div>
          <span className="font-mono text-[13px] font-bold text-gray-900">{rule.label}</span>
          <span className="ml-2 font-mono text-[9px] uppercase text-gray-500">{rule.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rule.rules_is_override ? (
            <span className="font-mono text-[9px] font-bold uppercase text-amber-900">
              {t('settings.promptCatalog.overrideActive')}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-1.5 font-mono text-[9px] text-gray-600">
        {t('settings.promptCatalog.usedBy')}: {rule.used_by.join(', ')}
      </p>

      {error ? <p className="mt-1 font-mono text-[10px] text-red-700">{error}</p> : null}

      <div className="mt-2">
        <div className="flex items-end justify-between gap-2">
          <p className="font-mono text-[9px] font-bold uppercase text-gray-600">
            {t('settings.promptCatalog.sharedRulesEditorLabel')}
          </p>
          <CopyCharBar text={draft} t={t} />
        </div>
        <textarea
          className={textareaClass}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label={rule.label}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="default"
          className="h-7 px-2 text-[10px]"
          disabled={busy || resetting}
          onClick={() => void handleSave()}
        >
          {busy ? '…' : t('settings.promptCatalog.saveComposer')}
        </Button>
        {rule.rules_is_override && onReset ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-7 px-2 text-[10px]"
            disabled={busy || resetting}
            onClick={() => onReset(rule.name)}
          >
            {resetting ? '…' : t('settings.promptCatalog.resetComposer')}
          </Button>
        ) : null}
      </div>

      <details className="mt-2 rounded border border-black/10 bg-white/50 p-1.5">
        <summary className="cursor-pointer font-mono text-[9px] uppercase text-gray-600">
          {t('settings.promptCatalog.composerShippedDefaults')}
        </summary>
        <div className="mt-1.5">
          <div className="flex items-end justify-between gap-1">
            <span className="font-mono text-[8px] uppercase text-gray-500">
              {t('settings.promptCatalog.sharedRulesShippedHint')}
            </span>
            <CopyCharBar text={rule.rules_default} t={t} />
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap border border-black/10 bg-white p-1.5 text-[9px] leading-snug">
            {rule.rules_default}
          </pre>
        </div>
      </details>
    </article>
  );
}
