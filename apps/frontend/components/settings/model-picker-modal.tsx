'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchCLIProxyModels,
  type CLIProxyModelOption,
  type LLMConfig,
} from '@/lib/api/config';

export function ModelPickerModal({
  stepLabel,
  resolvedModel,
  appDefaultModel,
  initialOverride,
  llmConfig,
  onClose,
  onApply,
  t,
}: {
  stepLabel: string;
  resolvedModel: string;
  appDefaultModel: string;
  initialOverride: string;
  llmConfig: LLMConfig | null;
  onClose: () => void;
  onApply: (value: string | null) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}): React.ReactElement {
  const [value, setValue] = useState(initialOverride);
  const [models, setModels] = useState<CLIProxyModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [pickId, setPickId] = useState('');

  const cliproxyActive =
    llmConfig?.ai_route === 'cliproxyapi' && Boolean(llmConfig.cliproxy_route_enabled);

  useEffect(() => {
    if (!cliproxyActive || !llmConfig?.cliproxy) {
      setModels([]);
      setModelsError(null);
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);
    fetchCLIProxyModels({
      base_url: llmConfig.cliproxy.base_url,
      provider_filter: llmConfig.cliproxy.provider_filter,
    })
      .then((res) => {
        if (!cancelled) {
          setModels(res.models ?? []);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setModels([]);
          setModelsError(
            err instanceof Error ? err.message : t('settings.promptCatalog.modelPickerCliproxyLoadError')
          );
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cliproxyActive, llmConfig, t]);

  const modelSelectOptions = useMemo(() => {
    const pf = llmConfig?.cliproxy?.provider_filter;
    if (!pf || pf === 'mixed') return models;
    return models.filter((m) => m.provider === pf);
  }, [models, llmConfig?.cliproxy?.provider_filter]);

  const formatModelOptionLabel = (m: CLIProxyModelOption): string => {
    const src = (m.owned_by && m.owned_by.trim()) || t('settings.promptCatalog.modelPickerSourceUnknown');
    return `${m.id} — ${src} — ${m.provider}`;
  };

  const applyPick = (): void => {
    const id = pickId.trim();
    if (id) setValue(id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-picker-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded border border-black/20 bg-[#F4F4F0] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.15)]">
        <h2 id="model-picker-title" className="font-mono text-sm font-bold uppercase text-gray-900">
          {t('settings.promptCatalog.modelPickerTitle', { step: stepLabel })}
        </h2>
        <p className="mt-2 font-mono text-[11px] text-gray-600">
          {t('settings.promptCatalog.modelPickerResolved')}: {resolvedModel}
        </p>
        <p className="mt-1 font-mono text-[10px] text-gray-500">
          {t('settings.promptCatalog.modelPickerAppDefault')}: {appDefaultModel}
        </p>
        {cliproxyActive ? (
          <p className="mt-2 font-mono text-[10px] leading-snug text-gray-600">
            {t('settings.promptCatalog.modelPickerCliproxyHint')}
          </p>
        ) : null}

        {cliproxyActive ? (
          <div className="mt-3 space-y-2 rounded border border-black/10 bg-white/60 p-2">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase text-gray-600">
                {t('settings.promptCatalog.modelPickerCliproxyModels')}
              </p>
              <p className="mt-0.5 font-mono text-[8px] leading-snug text-gray-500">
                {t('settings.promptCatalog.modelPickerCliproxyColumns')}
              </p>
            </div>
            {modelsLoading ? (
              <p className="font-mono text-[10px] text-gray-500">…</p>
            ) : modelsError ? (
              <p className="font-mono text-[10px] text-red-700">{modelsError}</p>
            ) : modelSelectOptions.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="cliproxy-model-pick" className="font-mono text-[9px] uppercase">
                    ID
                  </Label>
                  <select
                    id="cliproxy-model-pick"
                    className="mt-0.5 w-full rounded border border-black/15 bg-white px-2 py-1.5 font-mono text-[10px]"
                    value={pickId}
                    onChange={(e) => setPickId(e.target.value)}
                  >
                    <option value="">{t('settings.promptCatalog.modelPickerCliproxySelectPlaceholder')}</option>
                    {modelSelectOptions.map((m) => (
                      <option key={m.id} value={m.id} title={formatModelOptionLabel(m)}>
                        {formatModelOptionLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="outline" size="xs" className="h-8" onClick={applyPick}>
                  {t('settings.promptCatalog.modelPickerCliproxyInsert')}
                </Button>
              </div>
            ) : (
              <p className="font-mono text-[10px] text-gray-500">
                {t('settings.promptCatalog.modelPickerCliproxyLoadError')}
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <Label htmlFor="model-override" className="font-mono text-[10px] uppercase">
            {t('settings.promptCatalog.modelOverrideLabel')}
          </Label>
          <Input
            id="model-override"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="openai/gpt-4o or empty for default"
            className="font-mono text-xs"
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="xs" onClick={onClose}>
            {t('settings.promptCatalog.cancel')}
          </Button>
          <Button
            type="button"
            size="xs"
            onClick={() => {
              const trimmed = value.trim();
              onApply(trimmed === '' ? null : trimmed);
            }}
          >
            {t('settings.promptCatalog.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
