'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  deleteSharedRulesOverride,
  fetchLlmConfig,
  fetchModelOverrides,
  fetchMasterResumePreview,
  fetchPromptCatalog,
  updateModelOverrides,
  type LLMConfig,
  type PromptManagerEntry,
  type SharedRuleEntry,
} from '@/lib/api/config';
import { PipelineDiagram } from '@/components/settings/pipeline-diagram';
import { PromptCard } from '@/components/settings/prompt-card';
import { ModelPickerModal } from '@/components/settings/model-picker-modal';
import { SharedRulesCard } from '@/components/settings/shared-rules-card';
import {
  PromptCatalogNav,
  type PromptCatalogNavItem,
} from '@/components/settings/prompt-catalog-nav';
import { useTranslations } from '@/lib/i18n';

function scrollToElementId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function PromptCatalogPage(): React.ReactElement {
  const { t } = useTranslations();
  const [managerEntries, setManagerEntries] = useState<PromptManagerEntry[]>([]);
  const [sharedRules, setSharedRules] = useState<SharedRuleEntry[]>([]);
  const [modelOverrides, setModelOverrides] = useState<Record<string, string | null>>({});
  const [defaultModelLabel, setDefaultModelLabel] = useState('');
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelPickerStep, setModelPickerStep] = useState<string | null>(null);
  const [resettingSharedRule, setResettingSharedRule] = useState<string | null>(null);
  const [jumpSelectKey, setJumpSelectKey] = useState(0);
  const [masterResumePreview, setMasterResumePreview] = useState<{
    text: string;
    truncated: boolean;
  } | null>(null);
  const [masterResumePreviewError, setMasterResumePreviewError] = useState(false);

  const loadAll = useCallback(async () => {
    const [catalog, overrides, llm] = await Promise.all([
      fetchPromptCatalog(),
      fetchModelOverrides(),
      fetchLlmConfig(),
    ]);
    setManagerEntries(catalog.entries || []);
    setSharedRules(catalog.shared_rules || []);
    setModelOverrides(overrides.overrides || {});
    setLlmConfig(llm);
    setDefaultModelLabel(`${llm.provider}/${llm.model}`);
    try {
      const m = await fetchMasterResumePreview();
      setMasterResumePreview({
        text: m.serialized_original_resume,
        truncated: m.truncated,
      });
      setMasterResumePreviewError(false);
    } catch {
      setMasterResumePreview(null);
      setMasterResumePreviewError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAll();
        if (!cancelled) setError(null);
      } catch {
        if (!cancelled) {
          setError(t('settings.promptCatalog.loadError'));
          setManagerEntries([]);
          setSharedRules([]);
          setMasterResumePreview(null);
          setMasterResumePreviewError(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll, t]);

  const navItems: PromptCatalogNavItem[] = useMemo(() => {
    const items: PromptCatalogNavItem[] = [
      { id: 'catalog-pipeline', label: t('settings.promptCatalog.catalogIndexPipeline') },
    ];
    if (sharedRules.length > 0) {
      items.push({
        id: 'catalog-shared-rules',
        label: t('settings.promptCatalog.catalogIndexSharedDiff'),
      });
      for (const r of sharedRules) {
        items.push({ id: `catalog-shared-${r.name}`, label: r.label });
      }
    }
    for (const e of managerEntries) {
      items.push({ id: `catalog-step-${e.step_name}`, label: e.label });
    }
    return items;
  }, [managerEntries, sharedRules, t]);

  const pickerEntry = useMemo(
    () => managerEntries.find((e) => e.step_name === modelPickerStep),
    [managerEntries, modelPickerStep]
  );

  const applyModelOverride = async (stepName: string, value: string | null) => {
    const next = { ...modelOverrides, [stepName]: value };
    await updateModelOverrides(next);
    setModelOverrides(next);
    await loadAll();
    setModelPickerStep(null);
  };

  const onResetSharedRule = async (rulesName: string) => {
    setResettingSharedRule(rulesName);
    try {
      await deleteSharedRulesOverride(rulesName);
      await loadAll();
      setError(null);
    } catch {
      setError(t('settings.promptCatalog.resetSharedRulesError'));
    } finally {
      setResettingSharedRule(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/settings"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800"
              aria-label={t('settings.promptCatalog.backToSettings')}
              title={t('settings.promptCatalog.backToSettings')}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </Link>
            <h1
              className="truncate text-base font-medium text-slate-900"
              title={t('settings.promptCatalog.metaDescription')}
            >
              {t('settings.promptCatalog.pageTitle')}
            </h1>
          </div>
          <details className="max-w-xs text-right text-xs text-slate-500 sm:max-w-sm">
            <summary className="cursor-pointer list-none marker:hidden hover:text-slate-700 [&::-webkit-details-marker]:hidden">
              <span className="border-b border-dotted border-slate-300">
                {t('settings.promptCatalog.catalogAboutSummary')}
              </span>
            </summary>
            <div className="mt-1 rounded-md border border-slate-200 bg-white p-2 text-left text-[11px] leading-snug text-slate-600">
              <p className="m-0">{t('settings.promptCatalog.catalogAboutBody')}</p>
              <p className="mt-1.5 m-0 text-slate-500">
                {t('settings.promptCatalog.catalogNavHint')}
              </p>
            </div>
          </details>
        </header>

        <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          <aside className="mb-3 hidden min-w-0 self-start lg:sticky lg:top-4 lg:mb-0 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <PromptCatalogNav
              items={navItems}
              title={t('settings.promptCatalog.catalogIndexTitle')}
              onJumped={() => setJumpSelectKey((k) => k + 1)}
            />
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="lg:hidden">
              <select
                key={jumpSelectKey}
                defaultValue=""
                aria-label={t('settings.promptCatalog.jumpToPlaceholder')}
                className="h-9 w-full max-w-md rounded-md border border-slate-200/80 bg-white px-2 text-xs text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  scrollToElementId(v);
                  setJumpSelectKey((k) => k + 1);
                }}
              >
                <option value="" disabled>
                  {t('settings.promptCatalog.jumpToPlaceholder')}
                </option>
                {navItems.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.75} />
                {t('settings.promptCatalog.loading')}
              </div>
            ) : error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : (
              <div className="space-y-4">
                <section id="catalog-pipeline" className="scroll-mt-6">
                  <h2 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    {t('settings.promptCatalog.pipelineTitle')}
                  </h2>
                  <PipelineDiagram />
                </section>

                {sharedRules.length > 0 ? (
                  <section id="catalog-shared-rules" className="scroll-mt-6 space-y-2">
                    <h2 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {t('settings.promptCatalog.sharedRulesTitle')}
                    </h2>
                    <div className="space-y-2">
                      {sharedRules.map((rule) => (
                        <SharedRulesCard
                          key={rule.name}
                          rule={rule}
                          t={t}
                          onReset={onResetSharedRule}
                          onSaved={loadAll}
                          resetting={resettingSharedRule === rule.name}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {managerEntries.length > 0 ? (
                  <section id="catalog-pipeline-steps" className="scroll-mt-6 space-y-2">
                    <h2 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {t('settings.promptCatalog.managerSectionTitle')}
                    </h2>
                    <div className="space-y-2">
                      {managerEntries.map((entry) => (
                        <PromptCard
                          key={entry.step_name}
                          entry={entry}
                          onChangeModel={(step) => setModelPickerStep(step)}
                          onComposerSaved={loadAll}
                          masterResumePreview={masterResumePreview}
                          masterResumePreviewError={masterResumePreviewError}
                          t={t}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {modelPickerStep && pickerEntry ? (
          <ModelPickerModal
            stepLabel={pickerEntry.label}
            resolvedModel={pickerEntry.model}
            appDefaultModel={defaultModelLabel}
            initialOverride={modelOverrides[modelPickerStep] ?? ''}
            llmConfig={llmConfig}
            onClose={() => setModelPickerStep(null)}
            onApply={(v) => applyModelOverride(modelPickerStep, v)}
            t={t}
          />
        ) : null}
      </div>
    </div>
  );
}
