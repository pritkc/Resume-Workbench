'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import {
  deleteSharedRulesOverride,
  fetchLlmConfig,
  fetchModelOverrides,
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
import { useTranslations } from '@/lib/i18n';

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
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll, t]);

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
    <div className="mx-auto max-w-5xl px-3 py-5">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('settings.promptCatalog.backToSettings')}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2 border-b border-black/10 pb-3">
        <FileText className="h-7 w-7 shrink-0 text-gray-800" />
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-tight text-gray-900">
            {t('settings.promptCatalog.pageTitle')}
          </h1>
          <p className="mt-0.5 max-w-2xl text-[12px] leading-snug text-gray-600">
            {t('settings.promptCatalog.metaDescription')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 font-mono text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('settings.promptCatalog.loading')}
        </div>
      ) : error ? (
        <p className="font-mono text-sm text-red-700">{error}</p>
      ) : (
        <div className="space-y-5">
          <nav
            className="rounded border border-black/10 bg-[#FAFAF7] px-3 py-2"
            aria-label={t('settings.promptCatalog.catalogIndexTitle')}
          >
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-gray-600">
              {t('settings.promptCatalog.catalogIndexTitle')}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-blue-900">
              <li>
                <a href="#catalog-pipeline" className="underline decoration-black/20 underline-offset-2 hover:text-blue-950">
                  {t('settings.promptCatalog.catalogIndexPipeline')}
                </a>
              </li>
              {sharedRules.length > 0 ? (
                <li>
                  <a
                    href="#catalog-shared-rules"
                    className="underline decoration-black/20 underline-offset-2 hover:text-blue-950"
                  >
                    {t('settings.promptCatalog.catalogIndexSharedDiff')}
                  </a>
                </li>
              ) : null}
              {managerEntries.map((e) => (
                <li key={e.step_name}>
                  <a
                    href={`#catalog-step-${e.step_name}`}
                    className="underline decoration-black/20 underline-offset-2 hover:text-blue-950"
                  >
                    {e.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section id="catalog-pipeline" className="space-y-2 scroll-mt-4">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-700">
              {t('settings.promptCatalog.pipelineTitle')}
            </h2>
            <PipelineDiagram />
          </section>

          {sharedRules.length > 0 ? (
            <section id="catalog-shared-rules" className="space-y-2 scroll-mt-4">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-700">
                {t('settings.promptCatalog.sharedRulesTitle')}
              </h2>
              <div className="space-y-3">
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
            <section id="catalog-pipeline-steps" className="space-y-2 scroll-mt-4">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-700">
                {t('settings.promptCatalog.managerSectionTitle')}
              </h2>
              <div className="space-y-3">
                {managerEntries.map((entry) => (
                  <PromptCard
                    key={entry.step_name}
                    entry={entry}
                    onChangeModel={(step) => setModelPickerStep(step)}
                    onComposerSaved={loadAll}
                    t={t}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

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
  );
}
