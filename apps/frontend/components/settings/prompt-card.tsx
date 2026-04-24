'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Cpu } from 'lucide-react';
import type { PromptComposerPayload, PromptManagerEntry, PromptVariable } from '@/lib/api/config';
import { deletePromptComposer, fetchPromptComposer, putPromptComposer } from '@/lib/api/config';
import { Button } from '@/components/ui/button';
import { CopyCharBar } from '@/components/settings/prompt-field-chrome';
import { AutosizePromptTextarea } from '@/components/settings/autosize-prompt-textarea';
import { buildPromptAdvisorClipboardText } from '@/lib/prompt-advisor-copy';

const cardClass = 'scroll-mt-6 rounded-lg border border-slate-200/70 bg-white px-3 py-3 sm:px-4';

const textareaClass =
  'w-full resize-y whitespace-pre-wrap rounded-md border border-slate-200/80 bg-slate-50/50 px-2 py-2 font-mono text-[12px] leading-relaxed text-slate-800 focus-visible:border-slate-300 focus-visible:bg-white focus-visible:outline-none';

const shippedPreClass =
  'whitespace-pre-wrap break-words rounded-md border border-slate-100 bg-slate-50/80 p-2.5 font-mono text-[11px] leading-relaxed text-slate-700';

type ComposerTab = 'system' | 'user';

export function PromptCard({
  entry,
  onChangeModel,
  onComposerSaved,
  anchorId,
  masterResumePreview,
  masterResumePreviewError,
  t,
}: {
  entry: PromptManagerEntry;
  onChangeModel: (stepName: string) => void;
  onComposerSaved?: () => Promise<void>;
  anchorId?: string;
  masterResumePreview?: { text: string; truncated: boolean } | null;
  masterResumePreviewError?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}): React.ReactElement {
  const sysResolved = entry.system_resolved ?? '';
  const userResolved = entry.user_template_resolved ?? entry.data_template ?? '';
  const composerActive = Boolean(entry.composer_override_active);

  const [composerOpen, setComposerOpen] = useState(true);
  const [composerTab, setComposerTab] = useState<ComposerTab>('system');
  const [systemDraft, setSystemDraft] = useState(sysResolved);
  const [userDraft, setUserDraft] = useState(userResolved);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [advisorCopied, setAdvisorCopied] = useState(false);

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

  const copyAdvisorBundle = useCallback(async (): Promise<void> => {
    const payload = buildPromptAdvisorClipboardText({
      systemText: systemDraft,
      userText: userDraft,
    });
    try {
      await navigator.clipboard.writeText(payload);
      setAdvisorCopied(true);
      window.setTimeout(() => setAdvisorCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [systemDraft, userDraft]);

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
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-medium text-slate-900">{entry.label}</h3>
            <code className="font-mono text-[11px] text-slate-500">{entry.step_name}</code>
            {composerActive ? (
              <span className="text-[10px] font-medium text-amber-800/90">
                {t('settings.promptCatalog.overrideShort')}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">
            {entry.pipeline} · v{entry.version} · {entry.model}
            {entry.model_is_override ? ` · ${t('settings.promptCatalog.modelOverrideShort')}` : ''}
          </p>
          <details className="mt-1.5 group">
            <summary className="cursor-pointer list-none text-[11px] text-slate-400 marker:hidden hover:text-slate-600 [&::-webkit-details-marker]:hidden">
              <span className="border-b border-dotted border-slate-300 group-open:border-slate-500">
                {t('settings.promptCatalog.sourcesSummary')}
              </span>
            </summary>
            <ul className="mt-1.5 space-y-0.5 border-l border-slate-200 pl-2 font-mono text-[10px] leading-snug text-slate-500">
              <li>{entry.file_path}</li>
              {(entry.system_prompt_files?.length ?? 0) > 0 ? (
                <li>{entry.system_prompt_files?.join(' → ')}</li>
              ) : null}
              {entry.user_prompt_file ? <li>{entry.user_prompt_file}</li> : null}
            </ul>
          </details>
        </div>
        <button
          type="button"
          onClick={() => onChangeModel(entry.step_name)}
          title={t('settings.promptCatalog.changeModel')}
          aria-label={t('settings.promptCatalog.changeModel')}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
        >
          <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">{t('settings.promptCatalog.modelShort')}</span>
        </button>
      </div>

      <details
        className="mt-2.5"
        open={composerOpen}
        onToggle={(e) => {
          if (e.target !== e.currentTarget) return;
          setComposerOpen((e.currentTarget as HTMLDetailsElement).open);
        }}
      >
        <summary className="cursor-pointer list-none text-xs font-medium text-slate-600 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="border-b border-transparent hover:border-slate-300">
            {t('settings.promptCatalog.composerSection')}
          </span>
        </summary>
        <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5">
          {displayVariables.length > 0 ? (
            <div
              className="rounded-md border border-slate-100 bg-slate-50/40 px-2.5 py-2"
              role="region"
            >
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {t('settings.promptCatalog.variables')}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-x-2 gap-y-1 p-0">
                {displayVariables.map((v) => {
                  const desc = (v.description ?? '').trim();
                  return (
                    <li key={v.name} className="min-w-0 max-w-full">
                      <span
                        className="font-mono text-[11px] text-violet-700"
                        title={desc || undefined}
                      >
                        ${v.name}
                      </span>
                      {desc ? (
                        <span className="ml-1 text-[10px] text-slate-500">{desc}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {displayVariables.some((v) => v.name === 'original_resume') ? (
                <details className="mt-2 border-t border-slate-100/80 pt-2">
                  <summary className="cursor-pointer list-none text-[10px] font-medium uppercase tracking-wide text-slate-400 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="hover:text-slate-600">
                      {t('settings.promptCatalog.masterResumePreviewTitle')}
                    </span>
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    {masterResumePreviewError === true ? (
                      <p className="text-[11px] text-amber-800">
                        {t('settings.promptCatalog.masterResumePreviewUnavailable')}
                      </p>
                    ) : masterResumePreview && masterResumePreview.text.length > 0 ? (
                      <>
                        {masterResumePreview.truncated ? (
                          <p className="text-[11px] text-amber-800">
                            {t('settings.promptCatalog.masterResumePreviewTruncated')}
                          </p>
                        ) : null}
                        <pre className={shippedPreClass}>{masterResumePreview.text}</pre>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        {t('settings.promptCatalog.masterResumePreviewEmpty')}
                      </p>
                    )}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
          {composerError ? <p className="text-xs text-red-600">{composerError}</p> : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copyAdvisorBundle()}
              title={t('settings.promptCatalog.copyAdvisorBundleTitle')}
              aria-label={t('settings.promptCatalog.copyAdvisorBundleTitle')}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
            >
              {advisorCopied ? (
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={1.75} aria-hidden />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </div>

          <div
            className="flex gap-3 border-b border-slate-100 text-xs"
            role="tablist"
            aria-label={t('settings.promptCatalog.composerTablist')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={composerTab === 'system'}
              className={`border-b-2 pb-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-0 ${
                composerTab === 'system'
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
              onClick={() => setComposerTab('system')}
            >
              {t('settings.promptCatalog.composerSystem')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={composerTab === 'user'}
              className={`border-b-2 pb-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-0 ${
                composerTab === 'user'
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
              onClick={() => setComposerTab('user')}
            >
              {t('settings.promptCatalog.composerUser')}
            </button>
          </div>

          <div role="tabpanel" className="min-w-0">
            {composerTab === 'system' ? (
              <div>
                <div className="mb-1 flex items-end justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    {t('settings.promptCatalog.composerSystem')}
                  </span>
                  <CopyCharBar text={systemDraft} t={t} />
                </div>
                <AutosizePromptTextarea
                  className={textareaClass}
                  value={systemDraft}
                  onChange={setSystemDraft}
                  spellCheck={false}
                  aria-label={t('settings.promptCatalog.composerSystem')}
                />
              </div>
            ) : (
              <div>
                <div className="mb-1 flex items-end justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    {t('settings.promptCatalog.composerUser')}
                  </span>
                  <CopyCharBar text={userDraft} t={t} />
                </div>
                <AutosizePromptTextarea
                  className={textareaClass}
                  value={userDraft}
                  onChange={setUserDraft}
                  spellCheck={false}
                  aria-label={t('settings.promptCatalog.composerUser')}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100"
              disabled={composerBusy}
              onClick={() => void handleSaveComposer()}
            >
              {composerBusy ? '…' : t('settings.promptCatalog.saveComposer')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              disabled={composerBusy}
              onClick={() => void handleResetComposer()}
            >
              {t('settings.promptCatalog.resetComposer')}
            </Button>
          </div>
          {(shippedSys || shippedUser) && (
            <details className="rounded-md border border-slate-100 bg-slate-50/30 px-2 py-2">
              <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {t('settings.promptCatalog.composerShippedDefaults')}
              </summary>
              <div className="mt-2 flex flex-col gap-3">
                <div>
                  <div className="mb-1 flex items-end justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase text-slate-400">
                      {t('settings.promptCatalog.composerSystem')}
                    </span>
                    <CopyCharBar text={shippedSys} t={t} />
                  </div>
                  <pre className={shippedPreClass}>{shippedSys || '—'}</pre>
                </div>
                <div>
                  <div className="mb-1 flex items-end justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase text-slate-400">
                      {t('settings.promptCatalog.composerUser')}
                    </span>
                    <CopyCharBar text={shippedUser} t={t} />
                  </div>
                  <pre className={shippedPreClass}>{shippedUser || '—'}</pre>
                </div>
              </div>
            </details>
          )}
        </div>
      </details>
    </article>
  );
}
