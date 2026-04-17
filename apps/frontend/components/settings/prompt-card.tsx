'use client';

import React, { useEffect, useState } from 'react';
import type { PromptComposerPayload, PromptManagerEntry, PromptVariable } from '@/lib/api/config';
import { deletePromptComposer, fetchPromptComposer, putPromptComposer } from '@/lib/api/config';
import { Button } from '@/components/ui/button';
import { CopyCharBar } from '@/components/settings/prompt-field-chrome';

const cardClass =
  'rounded border border-black/15 bg-[#F4F4F0] p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]';

const textareaClass =
  'mt-0.5 min-h-[min(380px,52vh)] w-full resize-y whitespace-pre-wrap border border-black/15 bg-white px-2 py-1.5 font-mono text-[11px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25';

export function PromptCard({
  entry,
  onChangeModel,
  onComposerSaved,
  anchorId,
  t,
}: {
  entry: PromptManagerEntry;
  onChangeModel: (stepName: string) => void;
  onComposerSaved?: () => Promise<void>;
  /** DOM id for in-page navigation (default: catalog-step-{step_name}) */
  anchorId?: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}): React.ReactElement {
  const sysResolved = entry.system_resolved ?? '';
  const userResolved = entry.user_template_resolved ?? entry.data_template ?? '';
  const composerActive = Boolean(entry.composer_override_active);

  const [composerOpen, setComposerOpen] = useState(true);
  const [systemDraft, setSystemDraft] = useState(sysResolved);
  const [userDraft, setUserDraft] = useState(userResolved);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  useEffect(() => {
    setSystemDraft(sysResolved);
    setUserDraft(userResolved);
  }, [sysResolved, userResolved]);

  const reloadComposerFromServer = async (): Promise<void> => {
    try {
      const snap = await fetchPromptComposer(entry.step_name);
      setSystemDraft(snap.system);
      setUserDraft(snap.user);
    } catch {
      /* keep drafts */
    }
  };

  const handleSaveComposer = async (): Promise<void> => {
    setComposerBusy(true);
    setComposerError(null);
    try {
      const payload: PromptComposerPayload = { system: systemDraft, user: userDraft };
      await putPromptComposer(entry.step_name, payload);
      await reloadComposerFromServer();
      await onComposerSaved?.();
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setComposerBusy(false);
    }
  };

  const handleResetComposer = async (): Promise<void> => {
    setComposerBusy(true);
    setComposerError(null);
    try {
      await deletePromptComposer(entry.step_name);
      await reloadComposerFromServer();
      await onComposerSaved?.();
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : 'Reset failed.');
    } finally {
      setComposerBusy(false);
    }
  };

  const shippedSys = entry.system_shipped ?? '';
  const shippedUser = entry.user_template_shipped ?? '';

  const inferredVarNames =
    typeof shippedUser === 'string'
      ? [
          ...new Set(Array.from(shippedUser.matchAll(/\$([a-z_][a-z0-9_]*)/gi)).map((m) => m[1])),
        ].sort()
      : [];
  const displayVariables: PromptVariable[] =
    entry.variables?.length && entry.variables.length > 0
      ? entry.variables
      : inferredVarNames.map((name) => ({ name, description: '' }));

  const domId = anchorId ?? `catalog-step-${entry.step_name}`;

  return (
    <article id={domId} className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-black/10 pb-2">
        <div className="min-w-0">
          <span className="font-mono text-[13px] font-bold leading-tight text-gray-900">
            {entry.label}
          </span>
          <span className="ml-1.5 font-mono text-[9px] uppercase text-gray-500">
            {entry.step_name}
          </span>
          <p className="truncate font-mono text-[9px] text-gray-500">{entry.file_path}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="font-mono text-[9px] uppercase leading-none text-gray-500">
            {entry.pipeline} · v{entry.version}
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-7 px-2 text-[10px]"
            onClick={() => onChangeModel(entry.step_name)}
          >
            {t('settings.promptCatalog.changeModel')}
          </Button>
        </div>
      </div>
      <p className="mt-1.5 font-mono text-[10px] leading-tight text-gray-700">
        <span className="text-gray-500">{t('settings.promptCatalog.resolvedModel')}: </span>
        {entry.model}
        {entry.model_is_override ? (
          <span className="ml-1.5 text-amber-900">
            ({t('settings.promptCatalog.overrideActive')})
          </span>
        ) : null}
      </p>

      <details
        className="mt-2 group"
        open={composerOpen}
        onToggle={(e) => setComposerOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-mono text-[9px] font-bold uppercase tracking-wider text-blue-900 hover:text-blue-950">
          {t('settings.promptCatalog.composerSection')}
        </summary>
        <div className="mt-2 space-y-2 border-t border-black/10 pt-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-gray-600">
            {composerActive ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-950">
                {t('settings.promptCatalog.composerOverrideActive')}
              </span>
            ) : (
              <span>{t('settings.promptCatalog.composerUsesShippedOrLegacy')}</span>
            )}
            {displayVariables.length > 0 ? (
              <span className="min-w-0">
                {t('settings.promptCatalog.variables')}:{' '}
                {displayVariables.map((v) => (
                  <code
                    key={v.name}
                    className="mr-0.5 inline-block rounded bg-white/80 px-0.5 text-[9px] text-gray-800"
                    title={v.description || undefined}
                  >
                    ${v.name}
                  </code>
                ))}
              </span>
            ) : null}
          </div>
          {composerError ? (
            <p className="font-mono text-[10px] text-red-700">{composerError}</p>
          ) : null}
          <div className="grid gap-2 lg:grid-cols-2">
            <div>
              <div className="flex items-end justify-between gap-2">
                <p className="font-mono text-[9px] font-bold uppercase leading-none text-gray-500">
                  {t('settings.promptCatalog.composerSystem')}
                </p>
                <CopyCharBar text={systemDraft} t={t} />
              </div>
              <textarea
                className={textareaClass}
                value={systemDraft}
                onChange={(e) => setSystemDraft(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div>
              <div className="flex items-end justify-between gap-2">
                <p className="font-mono text-[9px] font-bold uppercase leading-none text-gray-500">
                  {t('settings.promptCatalog.composerUser')}
                </p>
                <CopyCharBar text={userDraft} t={t} />
              </div>
              <textarea
                className={textareaClass}
                value={userDraft}
                onChange={(e) => setUserDraft(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="xs"
              variant="default"
              className="h-7 px-2 text-[10px]"
              disabled={composerBusy}
              onClick={() => void handleSaveComposer()}
            >
              {composerBusy ? '…' : t('settings.promptCatalog.saveComposer')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              disabled={composerBusy}
              onClick={() => void handleResetComposer()}
            >
              {t('settings.promptCatalog.resetComposer')}
            </Button>
          </div>
          {(shippedSys || shippedUser) && (
            <details className="rounded border border-black/10 bg-[#FAFAF7] p-1.5">
              <summary className="cursor-pointer font-mono text-[9px] uppercase text-gray-600">
                {t('settings.promptCatalog.composerShippedDefaults')}
              </summary>
              <div className="mt-1.5 grid gap-1.5 lg:grid-cols-2">
                <div>
                  <div className="flex items-end justify-between gap-1">
                    <span className="font-mono text-[8px] uppercase text-gray-500">
                      {t('settings.promptCatalog.composerSystem')}
                    </span>
                    <CopyCharBar text={shippedSys} t={t} />
                  </div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap border border-black/10 bg-white p-1.5 text-[9px] leading-snug">
                    {shippedSys || '—'}
                  </pre>
                </div>
                <div>
                  <div className="flex items-end justify-between gap-1">
                    <span className="font-mono text-[8px] uppercase text-gray-500">
                      {t('settings.promptCatalog.composerUser')}
                    </span>
                    <CopyCharBar text={shippedUser} t={t} />
                  </div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap border border-black/10 bg-white p-1.5 text-[9px] leading-snug">
                    {shippedUser || '—'}
                  </pre>
                </div>
              </div>
            </details>
          )}
        </div>
      </details>
    </article>
  );
}
