'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  fetchLlmConfig,
  updateLlmConfig,
  testLlmConnection,
  fetchPromptConfig,
  updatePromptConfig,
  clearAllApiKeys,
  resetDatabase,
  PROVIDER_INFO,
  type LLMConfig,
  type LLMProvider,
  type LLMHealthCheck,
  type PromptOption,
} from '@/lib/api/config';
import { API_URL } from '@/lib/api/client';
import { getVersionString } from '@/lib/config/version';
import { useStatusCache } from '@/lib/context/status-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dropdown } from '@/components/ui/dropdown';
import {
  Save,
  Key,
  Database,
  Activity,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  FileText,
  Briefcase,
  Sparkles,
  Clock,
  Globe,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/lib/context/language-context';
import { useTranslations } from '@/lib/i18n';
import type { SupportedLanguage } from '@/lib/api/config';
import type { Locale } from '@/i18n/config';

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'testing';

const PROVIDERS: LLMProvider[] = [
  'openai',
  'anthropic',
  'openrouter',
  'gemini',
  'deepseek',
  'ollama',
];

const SEGMENTED_BUTTON_BASE =
  'border border-black font-mono transition-all duration-150 ease-out shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50';
const SEGMENTED_BUTTON_ACTIVE = 'bg-blue-700 text-white border-black hover:bg-blue-800';
const SEGMENTED_BUTTON_INACTIVE = 'bg-white text-black hover:bg-[#E5E5E0]';

const unwrapCodeBlock = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  if (fenced) {
    return fenced[1]?.trimEnd() || null;
  }
  return trimmed;
};

const getHealthCheckMessage = (
  t: (key: string, params?: Record<string, string | number>) => string,
  baseKey: string,
  code?: string,
  fallback?: string
): string | null => {
  if (code) {
    const key = `${baseKey}.${code}`;
    const localized = t(key);
    return localized !== key ? localized : (fallback ?? code);
  }
  return fallback ?? null;
};

export default function SettingsPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  // LLM Config state
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);

  // Use cached system status (loaded on app start, refreshes every 30 min)
  const {
    status: systemStatus,
    isLoading: statusLoading,
    lastFetched,
    refreshStatus,
  } = useStatusCache();

  // Health check result from manual test
  const [healthCheck, setHealthCheck] = useState<LLMHealthCheck | null>(null);

  const [promptConfigLoading, setPromptConfigLoading] = useState(false);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [defaultPromptId, setDefaultPromptId] = useState('keywords');

  // Danger Zone state
  const [showClearApiKeysDialog, setShowClearApiKeysDialog] = useState(false);
  const [showResetDatabaseDialog, setShowResetDatabaseDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessDialogMessage] = useState({ title: '', description: '' });
  const [isResetting, setIsResetting] = useState(false);

  // Language settings
  const {
    contentLanguage,
    uiLanguage,
    setContentLanguage,
    setUiLanguage,
    languageNames,
    supportedLanguages,
    isLoading: languageLoading,
  } = useLanguage();

  // Translations
  const { t } = useTranslations();
  const providerInfo = PROVIDER_INFO[provider] ?? PROVIDER_INFO['openai'];
  const fallbackPromptOptions = useMemo<PromptOption[]>(
    () => [
      {
        id: 'nudge',
        label: t('tailor.promptOptions.nudge.label'),
        description: t('tailor.promptOptions.nudge.description'),
      },
      {
        id: 'keywords',
        label: t('tailor.promptOptions.keywords.label'),
        description: t('tailor.promptOptions.keywords.description'),
      },
      {
        id: 'full',
        label: t('tailor.promptOptions.full.label'),
        description: t('tailor.promptOptions.full.description'),
      },
    ],
    [t]
  );
  const promptOptionOverrides = useMemo<Record<string, { label: string; description: string }>>(
    () => ({
      nudge: {
        label: t('tailor.promptOptions.nudge.label'),
        description: t('tailor.promptOptions.nudge.description'),
      },
      keywords: {
        label: t('tailor.promptOptions.keywords.label'),
        description: t('tailor.promptOptions.keywords.description'),
      },
      full: {
        label: t('tailor.promptOptions.full.label'),
        description: t('tailor.promptOptions.full.description'),
      },
    }),
    [t]
  );
  const localizedPromptOptions = useMemo(() => {
    const options = promptOptions.length ? promptOptions : fallbackPromptOptions;
    return options.map((option) => {
      const override = promptOptionOverrides[option.id];
      return override ? { ...option, ...override } : option;
    });
  }, [promptOptions, fallbackPromptOptions, promptOptionOverrides]);
  const healthDetailItems = useMemo(() => {
    if (!healthCheck) return [];

    return [
      {
        key: 'testPrompt',
        label: t('settings.llmConfiguration.testPromptLabel'),
        value: unwrapCodeBlock(healthCheck.test_prompt),
      },
      {
        key: 'modelOutput',
        label: t('settings.llmConfiguration.modelOutputLabel'),
        value: unwrapCodeBlock(healthCheck.model_output),
      },
      {
        key: 'errorDetail',
        label: t('settings.llmConfiguration.errorDetailLabel'),
        value: unwrapCodeBlock(healthCheck.error_detail),
      },
    ].filter((item) => item.value);
  }, [healthCheck, t]);
  const healthCheckError = useMemo(() => {
    if (!healthCheck) return null;
    return getHealthCheckMessage(
      t,
      'settings.llmConfiguration.healthErrors',
      healthCheck.error_code,
      healthCheck.error
    );
  }, [healthCheck, t]);
  const healthCheckWarning = useMemo(() => {
    if (!healthCheck) return null;
    return getHealthCheckMessage(
      t,
      'settings.llmConfiguration.healthWarnings',
      healthCheck.warning_code,
      healthCheck.warning
    );
  }, [healthCheck, t]);

  // Load LLM config and prompt config on mount
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const [llmConfig, promptConfig] = await Promise.all([
          fetchLlmConfig().catch(() => null),
          fetchPromptConfig().catch(() => null),
        ]);

        if (cancelled) return;

        if (llmConfig) {
          const providerFromBackend = llmConfig.provider || 'openai';
          const safeProvider = PROVIDERS.includes(providerFromBackend as LLMProvider)
            ? (providerFromBackend as LLMProvider)
            : 'openai';
          setProvider(safeProvider);
          setModel(llmConfig.model || PROVIDER_INFO[safeProvider].defaultModel);
          const isMaskedKey = Boolean(llmConfig.api_key) && llmConfig.api_key.includes('*');
          setHasStoredApiKey(Boolean(llmConfig.api_key));
          setApiKey(isMaskedKey ? '' : llmConfig.api_key || '');
          setApiBase(llmConfig.api_base || '');

          if (providerFromBackend !== safeProvider) {
            setError(t('settings.errors.unknownProvider', { provider: providerFromBackend }));
          }
        }

        if (promptConfig) {
          setPromptOptions(promptConfig.prompt_options || []);
          setDefaultPromptId(promptConfig.default_prompt_id || 'keywords');
        }

        setStatus('idle');
      } catch (err) {
        console.error('Failed to load settings', err);
        if (!cancelled) {
          setError(t('settings.errors.unableToConnectBackend'));
          setStatus('error');
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Handle provider change
  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider);
    setModel(PROVIDER_INFO[newProvider].defaultModel);

    if (newProvider === 'ollama' && !apiBase.trim()) {
      setApiBase('http://localhost:11434');
    }

    // Clear API key input when switching providers to avoid accidental cross-provider usage.
    setApiKey('');
    setHasStoredApiKey(false);
  };

  // Save configuration
  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    setHealthCheck(null);

    try {
      if (requiresApiKey && !apiKey.trim() && !hasStoredApiKey) {
        setError(t('settings.errors.apiKeyRequired'));
        setStatus('error');
        return;
      }

      const trimmedKey = apiKey.trim();
      const config: Partial<LLMConfig> = {
        provider,
        model: model.trim(),
        api_base: apiBase.trim() || null,
      };
      if (requiresApiKey) {
        if (trimmedKey) {
          config.api_key = trimmedKey;
        } else if (!hasStoredApiKey) {
          config.api_key = '';
        }
      } else {
        config.api_key = '';
      }

      await updateLlmConfig(config);

      // Refresh cached system status after save
      await refreshStatus();

      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save config', err);
      setError((err as Error).message || t('settings.errors.unableToSaveConfiguration'));
      setStatus('error');
    }
  };

  // Test connection with current form values (pre-save testing)
  const handleTestConnection = async () => {
    setStatus('testing');
    setError(null);
    setHealthCheck(null);

    try {
      // Build config from current form values
      const testConfig: Partial<LLMConfig> = {
        provider,
        model: model.trim() || providerInfo.defaultModel,
        api_base: apiBase.trim() || null,
      };

      // Only include API key if provided or if we have a stored key
      if (requiresApiKey) {
        if (apiKey.trim()) {
          testConfig.api_key = apiKey.trim();
        }
        // If no new key but has stored key, don't send api_key (backend uses stored)
      }

      const result = await testLlmConnection(testConfig);
      setHealthCheck(result);
      setStatus('idle');
    } catch (err) {
      console.error('Failed to test connection', err);
      setHealthCheck({ healthy: false, provider, model, error: (err as Error).message });
      setStatus('idle');
    }
  };

  const handlePromptConfigChange = async (value: string) => {
    setPromptConfigLoading(true);
    setError(null);
    try {
      const updated = await updatePromptConfig({ default_prompt_id: value });
      setDefaultPromptId(updated.default_prompt_id);
      if (updated.prompt_options?.length) {
        setPromptOptions(updated.prompt_options);
      }
    } catch (err) {
      console.error('Failed to update prompt config', err);
      setError((err as Error).message || t('settings.errors.unableToSaveConfiguration'));
    } finally {
      setPromptConfigLoading(false);
    }
  };

  // Handle Clear API Keys
  const handleClearApiKeys = async () => {
    setIsResetting(true);
    try {
      await clearAllApiKeys();

      // Refetch full LLM config to ensure local state is synced with backend
      const llmConfig = await fetchLlmConfig().catch(() => null);
      if (llmConfig) {
        setProvider(llmConfig.provider || 'openai');
        setModel(llmConfig.model || PROVIDER_INFO['openai'].defaultModel);
        const isMaskedKey = Boolean(llmConfig.api_key) && llmConfig.api_key.includes('*');
        setHasStoredApiKey(Boolean(llmConfig.api_key));
        setApiKey(isMaskedKey ? '' : llmConfig.api_key || '');
        setApiBase(llmConfig.api_base || '');
      } else {
        // Fallback if refetch fails
        setApiKey('');
        setHasStoredApiKey(false);
      }

      setHealthCheck(null);
      // Refresh status
      await refreshStatus();
      setError(null);
      setSuccessDialogMessage({
        title: t('common.success'),
        description: t('common.keysCleared'),
      });
      setShowSuccessDialog(true);
    } catch (err) {
      console.error('Failed to clear API keys', err);
      setError(t('settings.errors.failedToClearApiKeys'));
    } finally {
      setIsResetting(false);
      setShowClearApiKeysDialog(false);
    }
  };

  // Handle Reset Database
  const handleResetDatabase = async () => {
    setIsResetting(true);
    try {
      await resetDatabase();

      // Clear all related localStorage keys
      localStorage.removeItem('master_resume_id');
      localStorage.removeItem('resume_builder_draft');
      localStorage.removeItem('resume_builder_settings');
      localStorage.removeItem('resume_matcher_content_language');
      localStorage.removeItem('resume_matcher_ui_language');

      // Refresh status to show empty counts
      await refreshStatus();
      // Clear health check as context is lost
      setHealthCheck(null);
      setError(null);
      setSuccessDialogMessage({
        title: t('common.success'),
        description: t('common.databaseReset'),
      });
      setShowSuccessDialog(true);
    } catch (err) {
      console.error('Failed to reset database', err);
      setError(t('settings.errors.failedToResetDatabase'));
    } finally {
      setIsResetting(false);
      setShowResetDatabaseDialog(false);
    }
  };

  // Format last fetched time for display
  const formatLastFetched = () => {
    if (!lastFetched) return t('settings.systemStatus.lastFetched.never');
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastFetched.getTime()) / 1000);
    if (diff < 60) return t('settings.systemStatus.lastFetched.justNow');
    if (diff < 3600)
      return t('settings.systemStatus.lastFetched.minutesAgo', { minutes: Math.floor(diff / 60) });
    return t('settings.systemStatus.lastFetched.hoursAgo', { hours: Math.floor(diff / 3600) });
  };

  const requiresApiKey = providerInfo.requiresKey ?? true;
  const sectionCardClass =
    'border border-black bg-white px-3 py-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]';

  return (
    <div
      className="min-h-screen overflow-y-auto p-3 md:p-4"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="mx-auto w-full max-w-6xl border border-black bg-[#F0F0E8] shadow-[6px_6px_0px_0px_rgba(0,0,0,0.08)]">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black bg-white px-4 py-3">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight uppercase">
              {t('settings.title')}
            </h1>
            <p className="mt-1 font-mono text-[11px] text-gray-500 uppercase tracking-[0.18em]">
              {t('settings.subtitle')}
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="xs">
              <ArrowLeft className="w-4 h-4" />
              {t('common.back')}
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 p-4 md:p-5 xl:grid-cols-2 xl:items-start">
          {/* API Key Not Configured Warning */}
          {!statusLoading && systemStatus && !systemStatus.llm_configured && (
            <div className="border border-amber-500 bg-amber-50 px-3 py-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)] xl:col-span-2">
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 bg-amber-500 mt-1 shrink-0"></div>
                <div className="flex-1">
                  <p className="font-mono text-xs font-bold uppercase tracking-wider text-amber-800">
                    {t('settings.setupRequired.title')}
                  </p>
                  <p className="font-mono text-xs text-amber-700 mt-1">
                    {t('settings.setupRequired.description')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* System Status Panel */}
          <section className="space-y-3 xl:order-1">
            <div className="flex items-center justify-between border-b border-black/10 pb-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                    {t('settings.systemStatus.title')}
                  </h2>
                </div>
                {lastFetched && (
                  <span className="font-mono text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLastFetched()}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshStatus}
                disabled={statusLoading}
                className="gap-1 text-xs"
              >
                <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
                {t('settings.systemStatus.refresh')}
              </Button>
            </div>

            {statusLoading ? (
              <div className="flex items-center justify-center border border-black bg-white px-3 py-8 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !systemStatus ? (
              <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-red-300 bg-red-50 px-4 py-6">
                <p className="font-mono text-xs text-red-600 uppercase">
                  {t('settings.systemStatus.unableToConnect')}
                </p>
                <p className="font-mono text-xs text-gray-600">
                  {t('settings.systemStatus.expectedAt', { apiUrl: API_URL })}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshStatus}
                  className="gap-1 text-xs"
                >
                  <RefreshCw className="w-3 h-3" />
                  {t('common.retry')}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {/* LLM Status */}
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-[10px] uppercase text-gray-500">
                      {t('settings.statusCards.llm')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {systemStatus.llm_healthy ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-mono text-sm font-bold">
                      {systemStatus.llm_healthy
                        ? t('settings.statusValues.healthy')
                        : t('settings.statusValues.offline')}
                    </span>
                  </div>
                </div>

                {/* Database Status */}
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-[10px] uppercase text-gray-500">
                      {t('settings.statusCards.database')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="font-mono text-sm font-bold">
                      {t('settings.statusValues.connected')}
                    </span>
                  </div>
                </div>

                {/* Resumes Count */}
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-[10px] uppercase text-gray-500">
                      {t('settings.statusCards.resumes')}
                    </span>
                  </div>
                  <span className="font-mono text-xl font-bold">
                    {systemStatus.database_stats.total_resumes}
                  </span>
                </div>

                {/* Jobs Count */}
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-[10px] uppercase text-gray-500">
                      {t('settings.statusCards.jobs')}
                    </span>
                  </div>
                  <span className="font-mono text-xl font-bold">
                    {systemStatus.database_stats.total_jobs}
                  </span>
                </div>
              </div>
            )}

            {/* Additional Stats Row */}
            {systemStatus && (
              <div className="grid grid-cols-2 gap-3">
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-[10px] uppercase text-gray-500">
                      {t('settings.statusCards.improvements')}
                    </span>
                  </div>
                  <span className="font-mono text-xl font-bold">
                    {systemStatus.database_stats.total_improvements}
                  </span>
                </div>
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-[10px] uppercase text-gray-500">
                      {t('settings.statusCards.masterResume')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {systemStatus.has_master_resume ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="font-mono text-sm font-bold">
                          {t('settings.statusValues.configured')}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-amber-500" />
                        <span className="font-mono text-sm font-bold">
                          {t('settings.statusValues.notSet')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3 xl:order-3">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Activity className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                LLM Observability
              </h2>
            </div>

            <div className={`${sectionCardClass} py-3`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="max-w-2xl">
                  <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
                    Internal Debugger
                  </p>
                  <p className="mt-1 text-[13px] text-gray-700">
                    Inspect request scopes, traces, previews, latency, token usage, and cost. Keep
                    this page internal-only because prompt previews can contain resume and job data.
                  </p>
                </div>

                <Link href="/llm-traces">
                  <Button variant="outline" size="xs" className="gap-1.5">
                    <Activity className="w-4 h-4" />
                    Open Trace Viewer
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {/* LLM Configuration */}
          <section className="space-y-3 xl:order-5">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Key className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                {t('settings.llmConfigurationTitle')}
              </h2>
            </div>

            <div className="grid gap-4">
              {/* Provider Selection */}
              <div className={sectionCardClass}>
                <Label>{t('settings.providerLabel')}</Label>
                <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-6">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleProviderChange(p)}
                      className={`px-2.5 py-2 text-[11px] uppercase ${SEGMENTED_BUTTON_BASE} ${
                        provider === p ? SEGMENTED_BUTTON_ACTIVE : SEGMENTED_BUTTON_INACTIVE
                      }`}
                    >
                      {PROVIDER_INFO[p].name.split(' ')[0]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 font-mono text-[11px] text-gray-500">
                  {t('settings.llmConfiguration.selectedProvider', {
                    provider: providerInfo.name,
                  })}
                </p>
              </div>

              {/* Model Input */}
              <div className={sectionCardClass}>
                <Label htmlFor="model">{t('settings.llmConfiguration.modelLabel')}</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={providerInfo.defaultModel}
                  className="font-mono"
                />
                <p className="mt-1 font-mono text-[11px] text-gray-500">
                  {t('settings.llmConfiguration.defaultModel', {
                    model: providerInfo.defaultModel,
                  })}
                </p>
              </div>

              {/* API Key Input */}
              <div className={sectionCardClass}>
                <Label htmlFor="apiKey">
                  {t('settings.llmConfiguration.apiKeyLabel')}{' '}
                  {!requiresApiKey && (
                    <span className="text-gray-400">
                      {t('settings.llmConfiguration.apiKeyOptionalForOllama')}
                    </span>
                  )}
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    requiresApiKey
                      ? t('settings.llmConfiguration.apiKeyPlaceholder')
                      : t('settings.llmConfiguration.apiKeyNotRequiredPlaceholder')
                  }
                  className="font-mono"
                  disabled={!requiresApiKey}
                />
                {requiresApiKey && hasStoredApiKey && !apiKey && (
                  <p className="mt-1 font-mono text-[11px] text-gray-500">
                    {t('settings.llmConfiguration.leaveBlankToKeepExistingKey')}
                  </p>
                )}
              </div>

              {/* API Base URL (optional, for proxies/aggregators/custom endpoints) */}
              <div className={sectionCardClass}>
                <Label htmlFor="apiBase">{t('settings.llmConfiguration.baseUrlLabel')}</Label>
                <Input
                  id="apiBase"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder={t('settings.llmConfiguration.baseUrlPlaceholder')}
                  className="font-mono"
                />
                <p className="mt-1 font-mono text-[11px] text-gray-500">
                  {t('settings.llmConfiguration.baseUrlDescription')}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={status === 'saving' || status === 'loading'}
                  className="flex-1"
                >
                  {status === 'saving' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : status === 'saved' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {t('common.success')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t('common.save')}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={status === 'testing' || status === 'saving'}
                >
                  {status === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      {t('settings.llmConfiguration.testConnection')}
                    </>
                  )}
                </Button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="border border-red-300 bg-red-50 px-3 py-2">
                  <p className="font-mono text-[11px] text-red-600">
                    {t('settings.llmConfiguration.errorPrefix', { error })}
                  </p>
                </div>
              )}

              {/* Health Check Result */}
              {healthCheck && (
                <div
                  className={`border px-3 py-3 ${
                    healthCheck.healthy
                      ? 'border-green-300 bg-green-50'
                      : 'border-red-300 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {healthCheck.healthy ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-mono text-sm font-bold">
                      {healthCheck.healthy
                        ? t('settings.llmConfiguration.connectionSuccessful')
                        : t('settings.llmConfiguration.connectionFailed')}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-gray-600">
                    {t('settings.llmConfiguration.connectionDetails', {
                      provider: healthCheck.provider,
                      model: healthCheck.model,
                    })}
                  </p>
                  {healthCheckError && (
                    <p className="font-mono text-xs text-red-600 mt-1">{healthCheckError}</p>
                  )}
                  {healthCheckWarning && (
                    <p className="font-mono text-xs text-amber-700 mt-1">{healthCheckWarning}</p>
                  )}
                  {healthDetailItems.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {healthDetailItems.map((item) => (
                        <div key={item.key}>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
                            {item.label}
                          </p>
                          <pre className="mt-1 whitespace-pre-wrap rounded-none border border-black bg-white p-3 text-xs text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                            {item.value}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Prompt Defaults Section */}
          <section className="space-y-3 xl:order-2">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Sparkles className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                {t('settings.promptSettings.title')}
              </h2>
            </div>

            <div className={sectionCardClass}>
              <p className="mb-3 text-[13px] text-gray-600">
                Use this as the fallback tailoring intensity when the create-resume flow does not
                already have a last-used choice saved.
              </p>
              <div className="pt-1">
                <Dropdown
                  options={localizedPromptOptions}
                  value={defaultPromptId}
                  onChange={handlePromptConfigChange}
                  label={t('settings.promptSettings.title')}
                  description="Fallback default for new tailoring runs."
                  disabled={promptConfigLoading}
                  density="compact"
                />
              </div>
            </div>
          </section>

          {/* Language Settings Section */}
          <section className="space-y-3 xl:order-4">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Globe className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                {t('settings.uiLanguage')} & {t('settings.contentLanguage')}
              </h2>
            </div>

            {/* UI Language */}
            <div className="space-y-3">
              <div>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                  {t('settings.uiLanguage')}
                </h3>
                <p className="mb-2 text-[13px] text-gray-600">
                  {t('settings.uiLanguageDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={`ui-${lang}`}
                      onClick={() => setUiLanguage(lang as Locale)}
                      disabled={languageLoading}
                      className={`px-3 py-2 text-[11px] ${SEGMENTED_BUTTON_BASE} ${uiLanguage === lang ? SEGMENTED_BUTTON_ACTIVE : SEGMENTED_BUTTON_INACTIVE}`}
                    >
                      {languageNames[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Content Language */}
            <div className="space-y-3 border-t border-gray-200 pt-3">
              <div>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                  {t('settings.contentLanguage')}
                </h3>
                <p className="mb-2 text-[13px] text-gray-600">
                  {t('settings.contentLanguageDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={`content-${lang}`}
                      onClick={() => setContentLanguage(lang as SupportedLanguage)}
                      disabled={languageLoading}
                      className={`px-3 py-2 text-[11px] ${SEGMENTED_BUTTON_BASE} ${contentLanguage === lang ? SEGMENTED_BUTTON_ACTIVE : SEGMENTED_BUTTON_INACTIVE}`}
                    >
                      {languageNames[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="space-y-3 xl:order-6">
            <div className="flex items-center gap-2 border-b border-red-200 pb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-red-600">
                {t('settings.dangerZone')}
              </h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {/* Clear API Keys */}
              <div className="border border-red-200 bg-red-50/50 px-4 py-3 space-y-3">
                <div>
                  <h3 className="font-bold text-sm text-red-900 mb-1">
                    {t('settings.clearApiKeys')}
                  </h3>
                  <p className="text-[11px] text-red-700">
                    {t('settings.clearApiKeysDescription')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  className="w-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-300"
                  onClick={() => setShowClearApiKeysDialog(true)}
                  disabled={isResetting}
                >
                  <Key className="w-4 h-4 mr-2" />
                  {t('settings.clearApiKeys')}
                </Button>
              </div>

              {/* Reset Database */}
              <div className="border border-red-200 bg-red-50/50 px-4 py-3 space-y-3">
                <div>
                  <h3 className="font-bold text-sm text-red-900 mb-1">
                    {t('settings.resetDatabase')}
                  </h3>
                  <p className="text-[11px] text-red-700">
                    {t('settings.resetDatabaseDescription')}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="xs"
                  className="w-full"
                  onClick={() => setShowResetDatabaseDialog(true)}
                  disabled={isResetting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('settings.resetDatabase')}
                </Button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-black bg-[#E5E5E0] px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={20}
              height={20}
              className="h-4 w-4"
            />
            <span className="font-mono text-[10px] text-gray-500">
              {getVersionString().toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {statusLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                <span className="font-mono text-[10px] text-gray-500">
                  {t('settings.footer.status.checking')}
                </span>
              </>
            ) : systemStatus ? (
              <>
                <div
                  className={`w-3 h-3 ${systemStatus.status === 'ready' ? 'bg-green-700' : 'bg-amber-500'}`}
                ></div>
                <span
                  className={`font-mono text-[10px] font-bold ${systemStatus.status === 'ready' ? 'text-green-700' : 'text-amber-600'}`}
                >
                  {systemStatus.status === 'ready'
                    ? t('settings.footer.status.ready')
                    : t('settings.footer.status.setupRequired')}
                </span>
              </>
            ) : (
              <span className="font-mono text-[10px] text-gray-500">
                {t('settings.footer.status.offline')}
              </span>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showClearApiKeysDialog}
        onOpenChange={setShowClearApiKeysDialog}
        title={t('confirmations.clearApiKeys')}
        description={t('confirmations.clearApiKeysDescription')}
        confirmLabel={t('common.delete')}
        variant="warning"
        onConfirm={handleClearApiKeys}
      />

      <ConfirmDialog
        open={showResetDatabaseDialog}
        onOpenChange={setShowResetDatabaseDialog}
        title={t('confirmations.resetDatabase')}
        description={t('confirmations.resetDatabaseDescription')}
        confirmLabel={t('common.reset')}
        variant="danger"
        onConfirm={handleResetDatabase}
      />

      <ConfirmDialog
        open={showSuccessDialog}
        onOpenChange={setShowSuccessDialog}
        title={successMessage.title}
        description={successMessage.description}
        confirmLabel={t('common.close')}
        showCancelButton={false}
        variant="success"
        onConfirm={() => setShowSuccessDialog(false)}
      />
    </div>
  );
}
