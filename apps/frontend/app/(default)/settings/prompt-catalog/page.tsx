'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
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
  const [jumpSelectKey, setJumpSelectKey] = useState(0);

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

  const jumpOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: 'catalog-pipeline', label: t('settings.promptCatalog.catalogIndexPipeline') },
    ];
    if (sharedRules.length > 0) {
      opts.push({
        value: 'catalog-shared-rules',
        label: t('settings.promptCatalog.catalogIndexSharedDiff'),
      });
    }
    for (const e of managerEntries) {
      opts.push({ value: `catalog-step-${e.step_name}`, label: e.label });
    }
    return opts;
  }, [managerEntries, sharedRules.length, t]);

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
    <div className="min-h-screen overflow-y-auto bg-[#E8E8E0] p-2 md:p-3">
      <div className="mx-auto w-full max-w-6xl border border-black/15 bg-[#F0F0E8] shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/15 bg-white px-2 py-1.5 md:px-2.5">
          <h1
            className="min-w-0 font-mono text-xs font-semibold uppercase tracking-widest text-black"
            title={t('settings.promptCatalog.metaDescription')}
          >
            {t('settings.promptCatalog.pageTitle')}
          </h1>
          <Link href="/settings">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 shrink-0 border border-black/30 p-0 text-black/60 hover:border-black hover:text-black"
              aria-label={t('settings.promptCatalog.backToSettings')}
              title={t('settings.promptCatalog.backToSettings')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="p-2 md:p-2">
          {loading ? (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-black/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('settings.promptCatalog.loading')}
            </div>
          ) : error ? (
            <p className="font-mono text-[11px] text-red-700">{error}</p>
          ) : (
            <div className="space-y-1.5">
              <select
                key={jumpSelectKey}
                defaultValue=""
                aria-label={t('settings.promptCatalog.jumpToPlaceholder')}
                className="h-7 w-full max-w-md border border-black/30 bg-white px-2 font-mono text-[10px] text-black/85 focus-visible:border-black focus-visible:outline-none"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  document.getElementById(v)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                  setJumpSelectKey((k) => k + 1);
                }}
              >
                <option value="" disabled>
                  {t('settings.promptCatalog.jumpToPlaceholder')}
                </option>
                {jumpOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <section id="catalog-pipeline" className="scroll-mt-3 space-y-1">
                <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wide text-black/65">
                  {t('settings.promptCatalog.pipelineTitle')}
                </h2>
                <PipelineDiagram />
              </section>

              {sharedRules.length > 0 ? (
                <section id="catalog-shared-rules" className="scroll-mt-3 space-y-1">
                  <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wide text-black/65">
                    {t('settings.promptCatalog.sharedRulesTitle')}
                  </h2>
                  <div className="space-y-1.5">
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
                <section id="catalog-pipeline-steps" className="scroll-mt-3 space-y-1">
                  <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wide text-black/65">
                    {t('settings.promptCatalog.managerSectionTitle')}
                  </h2>
                  <div className="space-y-1.5">
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
