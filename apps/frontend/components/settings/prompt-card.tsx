'use client';

import React, { useEffect, useState } from 'react';
import type { PromptComposerPayload, PromptManagerEntry, PromptVariable } from '@/lib/api/config';
import { deletePromptComposer, fetchPromptComposer, putPromptComposer } from '@/lib/api/config';
import { Button } from '@/components/ui/button';
import { CopyCharBar } from '@/components/settings/prompt-field-chrome';

const cardClass =
  'entry-card-editor border-black/20 bg-white';

const textareaClass =
  'mt-0.5 min-h-[min(300px,44vh)] w-full resize-y whitespace-pre-wrap border border-black/15 bg-white px-1.5 py-1 font-mono text-[11px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25';

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
      <div className="flex flex-wrap items-start justify-between gap-1 border-b border-black/10 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span className="font-mono text-[12px] font-bold leading-tight text-gray-900">
              {entry.label}
            </span>
            <span className="font-mono text-[8px] uppercase text-gray-500">{entry.step_name}</span>
          </div>
          <p className="truncate font-mono text-[8px] text-gray-500" title={entry.file_path}>
            {entry.file_path}
          </p>
          <p className="mt-0.5 truncate font-mono text-[9px] leading-tight text-gray-700">
            <span className="text-gray-500">{t('settings.promptCatalog.resolvedModel')}: </span>
            {entry.model}
            {entry.model_is_override ? (
              <span className="ml-1 text-amber-900">
                ({t('settings.promptCatalog.overrideActive')})
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <p className="font-mono text-[8px] uppercase leading-none text-gray-500">
            {entry.pipeline} · v{entry.version}
          </p>
          <Button
            type="button"
            variant="builderOutline"
            size="xs"
            className="h-6 px-2 text-[9px]"
            onClick={() => onChangeModel(entry.step_name)}
          >
            {t('settings.promptCatalog.changeModel')}
          </Button>
        </div>
      </div>

      <details
        className="mt-1.5 group"
        open={composerOpen}
        onToggle={(e) => setComposerOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-mono text-[8px] font-bold uppercase tracking-wider text-black/55 hover:text-black">
          {t('settings.promptCatalog.composerSection')}
        </summary>
        <div className="mt-1.5 space-y-1.5 border-t border-black/10 pt-1.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[8px] text-gray-600">
            {composerActive ? (
              <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-950">
                {t('settings.promptCatalog.composerOverrideActive')}
              </span>
            ) : (
              <span
                className="max-w-[min(100%,28rem)] truncate"
                title={t('settings.promptCatalog.composerUsesShippedOrLegacy')}
              >
                {t('settings.promptCatalog.composerUsesShippedOrLegacy')}
              </span>
            )}
          </div>
          {displayVariables.length > 0 ? (
            <div
              className="border border-amber-700/35 bg-gradient-to-b from-amber-50 to-amber-50/40 px-2 py-2 shadow-[inset_4px_0_0_0_rgba(180,83,9,0.75)]"
              role="region"
              aria-label={t('settings.promptCatalog.variables')}
            >
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-amber-950">
                {t('settings.promptCatalog.variables')}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {displayVariables.map((v) => {
                  const desc = (v.description ?? '').trim();
                  return (
                    <li key={v.name} className="min-w-0 max-w-full">
                      <div className="flex flex-col gap-1">
                        <kbd
                          className="inline-flex w-fit max-w-full items-center border-2 border-black/35 bg-white px-2.5 py-1.5 font-mono text-sm font-bold leading-none tracking-tight text-black shadow-[2px_2px_0_0_rgba(0,0,0,0.12)]"
                          title={desc || `Template variable $${v.name}`}
                        >
                          <span className="text-amber-700">${v.name}</span>
                        </kbd>
                        {desc ? (
                          <span className="max-w-[min(100%,20rem)] text-[10px] leading-snug text-black/65">
                            {desc}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
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
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="xs"
              variant="builderCta"
              className="h-6 px-2 text-[10px]"
              disabled={composerBusy}
              onClick={() => void handleSaveComposer()}
            >
              {composerBusy ? '…' : t('settings.promptCatalog.saveComposer')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="builderOutline"
              className="h-6 px-2 text-[10px]"
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
