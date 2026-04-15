'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  fetchLlmConfig,
  updateLlmConfig,
  testLlmConnection,
  fetchCLIProxyModels,
  fetchPromptConfig,
  fetchPromptCatalog,
  updatePromptConfig,
  clearAllApiKeys,
  resetDatabase,
  PROVIDER_INFO,
  type AIRoute,
  type CLIProxyProviderFilter,
  type CLIProxyQuickProfile,
  type CLIProxyModelOption,
  type LLMConfigUpdate,
  type LLMProvider,
  type LLMHealthCheck,
  type PromptOption,
  type PromptCatalogEntry,
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
  Eye,
  EyeOff,
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
const AI_ROUTES: AIRoute[] = ['direct_api', 'cliproxyapi'];
const CLIPROXY_PROVIDER_FILTERS: CLIProxyProviderFilter[] = ['codex', 'claude', 'gemini', 'mixed'];

const CLIPROXY_PROVIDER_LABELS: Record<CLIProxyProviderFilter, string> = {
  codex: 'Codex / GPT',
  claude: 'Claude',
  gemini: 'Gemini',
  mixed: 'All providers',
};

/** Sentinel for models with missing / empty `owned_by` in `/v1/models`. */
const CLIPROXY_OWNED_BY_EMPTY = '__owned_by_empty__';

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
  const [aiRoute, setAiRoute] = useState<AIRoute>('direct_api');
  const [cliproxyRouteEnabled, setCliProxyRouteEnabled] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [cliproxyBaseUrl, setCliProxyBaseUrl] = useState('http://127.0.0.1:8317/v1');
  const [cliproxyApiKey, setCliProxyApiKey] = useState('');
  const [hasStoredCLIProxyApiKey, setHasStoredCLIProxyApiKey] = useState(false);
  const [cliproxyProviderFilter, setCliProxyProviderFilter] =
    useState<CLIProxyProviderFilter>('mixed');
  const [cliproxyModelAlias, setCliProxyModelAlias] = useState('');
  const [cliproxyDashboardUrl, setCliProxyDashboardUrl] = useState('');
  const [cliproxyQuickProfiles, setCliProxyQuickProfiles] = useState<CLIProxyQuickProfile[]>([]);
  const [cliproxyProfileName, setCliProxyProfileName] = useState('');
  const [cliproxyModels, setCliProxyModels] = useState<CLIProxyModelOption[]>([]);
  const [cliproxyModelsLoading, setCliProxyModelsLoading] = useState(false);
  const [cliproxyModelsError, setCliProxyModelsError] = useState<string | null>(null);
  const [cliproxyOwnedByFilter, setCliProxyOwnedByFilter] = useState('');
  const [showCliProxyApiKey, setShowCliProxyApiKey] = useState(false);

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
  const [promptCatalog, setPromptCatalog] = useState<PromptCatalogEntry[]>([]);

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
  const isCLIProxyRoute = aiRoute === 'cliproxyapi';
  const requiresApiKey = isCLIProxyRoute ? true : (providerInfo.requiresKey ?? true);
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
  const llmStatusIndicator = useMemo(() => {
    const healthStatus = systemStatus?.llm_health_status;

    switch (healthStatus) {
      case 'healthy':
        return {
          icon: CheckCircle2,
          iconClassName: 'text-green-600',
          label: t('settings.statusValues.healthy'),
        };
      case 'unhealthy':
        return {
          icon: XCircle,
          iconClassName: 'text-red-500',
          label: t('settings.statusValues.offline'),
        };
      case 'not_configured':
        return {
          icon: AlertTriangle,
          iconClassName: 'text-amber-500',
          label: t('settings.statusValues.notSet'),
        };
      case 'unchecked':
      default:
        return {
          icon: AlertTriangle,
          iconClassName: 'text-amber-500',
          label: t('settings.statusValues.notChecked'),
        };
    }
  }, [systemStatus?.llm_health_status, t]);
  const LlmStatusIcon = llmStatusIndicator.icon;

  // Load LLM config and prompt config on mount
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const [llmConfig, promptConfig, promptCatalogResponse] = await Promise.all([
          fetchLlmConfig().catch(() => null),
          fetchPromptConfig().catch(() => null),
          fetchPromptCatalog().catch(() => null),
        ]);

        if (cancelled) return;

        if (llmConfig) {
          const routeFromBackend = llmConfig.ai_route || 'direct_api';
          const safeRoute = AI_ROUTES.includes(routeFromBackend as AIRoute)
            ? (routeFromBackend as AIRoute)
            : 'direct_api';
          const providerFromBackend = llmConfig.provider || 'openai';
          const safeProvider = PROVIDERS.includes(providerFromBackend as LLMProvider)
            ? (providerFromBackend as LLMProvider)
            : 'openai';
          setAiRoute(safeRoute);
          setCliProxyRouteEnabled(Boolean(llmConfig.cliproxy_route_enabled));
          setProvider(safeProvider);
          setModel(llmConfig.model || PROVIDER_INFO[safeProvider].defaultModel);
          const isMaskedKey = Boolean(llmConfig.api_key) && llmConfig.api_key.includes('*');
          setHasStoredApiKey(Boolean(llmConfig.api_key));
          setApiKey(isMaskedKey ? '' : llmConfig.api_key || '');
          setApiBase(llmConfig.api_base || '');

          const cliproxy = llmConfig.cliproxy;
          if (cliproxy) {
            setCliProxyBaseUrl(cliproxy.base_url || 'http://127.0.0.1:8317/v1');
            const isMaskedCLIProxyKey =
              Boolean(cliproxy.client_api_key) && cliproxy.client_api_key.includes('*');
            setHasStoredCLIProxyApiKey(Boolean(cliproxy.client_api_key));
            setCliProxyApiKey(isMaskedCLIProxyKey ? '' : cliproxy.client_api_key || '');
            setCliProxyProviderFilter(
              CLIPROXY_PROVIDER_FILTERS.includes(cliproxy.provider_filter)
                ? cliproxy.provider_filter
                : 'mixed'
            );
            setCliProxyModelAlias(cliproxy.model_alias || '');
            setCliProxyDashboardUrl(cliproxy.dashboard_url || '');
            setCliProxyQuickProfiles(cliproxy.quick_profiles || []);
          }

          if (providerFromBackend !== safeProvider) {
            setError(t('settings.errors.unknownProvider', { provider: providerFromBackend }));
          }
        }

        if (promptConfig) {
          setPromptOptions(promptConfig.prompt_options || []);
          setDefaultPromptId(promptConfig.default_prompt_id || 'keywords');
        }
        if (promptCatalogResponse) {
          setPromptCatalog(promptCatalogResponse.prompts || []);
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

  const cliproxyProviderOptions = useMemo(
    () =>
      CLIPROXY_PROVIDER_FILTERS.map((id) => ({
        id,
        label: CLIPROXY_PROVIDER_LABELS[id],
      })),
    []
  );

  const cliproxyOwnedByOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [{ id: '', label: 'All sources' }];
    const seen = new Set<string>();
    let hasEmptyOwnedBy = false;
    for (const row of cliproxyModels) {
      const ob = (row.owned_by ?? '').trim();
      if (!ob) {
        hasEmptyOwnedBy = true;
        continue;
      }
      seen.add(ob);
    }
    const sorted = [...seen].sort((a, b) => a.localeCompare(b));
    if (hasEmptyOwnedBy) {
      opts.push({ id: CLIPROXY_OWNED_BY_EMPTY, label: '— (no owned_by)' });
    }
    for (const id of sorted) {
      opts.push({ id, label: id });
    }
    return opts;
  }, [cliproxyModels]);

  const cliproxyModelsFiltered = useMemo(() => {
    return cliproxyModels.filter((row) => {
      if (cliproxyOwnedByFilter) {
        const ob = (row.owned_by ?? '').trim();
        if (cliproxyOwnedByFilter === CLIPROXY_OWNED_BY_EMPTY) {
          if (ob !== '') {
            return false;
          }
        } else if (ob !== cliproxyOwnedByFilter) {
          return false;
        }
      }
      if (cliproxyProviderFilter !== 'mixed' && row.provider !== cliproxyProviderFilter) {
        return false;
      }
      return true;
    });
  }, [cliproxyModels, cliproxyOwnedByFilter, cliproxyProviderFilter]);

  const cliproxyModelOptions = useMemo(
    () =>
      cliproxyModelsFiltered.map((row) => {
        const providerLabel =
          row.provider === 'mixed'
            ? 'Other / unclassified'
            : (CLIPROXY_PROVIDER_LABELS[row.provider as CLIProxyProviderFilter] ?? row.provider);

        return {
          id: row.id,
          label: row.id,
          description: [row.owned_by?.trim() || null, providerLabel].filter(Boolean).join(' · '),
        };
      }),
    [cliproxyModelsFiltered]
  );

  const refreshCLIProxyModels = async () => {
    setCliProxyModelsLoading(true);
    setCliProxyModelsError(null);
    try {
      const response = await fetchCLIProxyModels({
        base_url: cliproxyBaseUrl.trim() || null,
        client_api_key: cliproxyApiKey.trim() || undefined,
        provider_filter: 'mixed',
      });
      setCliProxyModels(response.models || []);
      if (!cliproxyModelAlias && response.models?.length) {
        setCliProxyModelAlias(response.models[0].id);
      }
    } catch (err) {
      setCliProxyModelsError((err as Error).message || 'Failed to load CLIProxy models.');
    } finally {
      setCliProxyModelsLoading(false);
    }
  };

  useEffect(() => {
    if (!isCLIProxyRoute || !cliproxyRouteEnabled) {
      return;
    }
    const hasAuth = Boolean(cliproxyApiKey.trim()) || hasStoredCLIProxyApiKey;
    if (!hasAuth || !cliproxyBaseUrl.trim()) {
      setCliProxyModels([]);
      return;
    }
    void refreshCLIProxyModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCLIProxyRoute,
    cliproxyRouteEnabled,
    cliproxyBaseUrl,
    cliproxyApiKey,
    hasStoredCLIProxyApiKey,
  ]);

  useEffect(() => {
    const validOwned = new Set(cliproxyOwnedByOptions.map((o) => o.id));
    if (cliproxyOwnedByFilter && !validOwned.has(cliproxyOwnedByFilter)) {
      setCliProxyOwnedByFilter('');
    }
  }, [cliproxyOwnedByOptions, cliproxyOwnedByFilter]);

  useEffect(() => {
    if (!cliproxyModelsFiltered.length) {
      return;
    }
    setCliProxyModelAlias((current) => {
      if (current && cliproxyModelsFiltered.some((r) => r.id === current)) {
        return current;
      }
      return cliproxyModelsFiltered[0].id;
    });
  }, [cliproxyOwnedByFilter, cliproxyProviderFilter, cliproxyModelsFiltered]);

  const handleSaveCLIProxyProfile = () => {
    const name = cliproxyProfileName.trim();
    const modelAlias = cliproxyModelAlias.trim();
    if (!name || !modelAlias) return;

    const profile: CLIProxyQuickProfile = {
      name,
      provider_filter: cliproxyProviderFilter,
      model_alias: modelAlias,
      base_url: cliproxyBaseUrl.trim() || null,
    };
    const next = cliproxyQuickProfiles.filter((row) => row.name !== name);
    next.unshift(profile);
    setCliProxyQuickProfiles(next.slice(0, 12));
    setCliProxyProfileName('');
  };

  const handleApplyCLIProxyProfile = (profile: CLIProxyQuickProfile) => {
    setAiRoute('cliproxyapi');
    setCliProxyProviderFilter(profile.provider_filter);
    setCliProxyModelAlias(profile.model_alias);
    setCliProxyBaseUrl(profile.base_url || 'http://127.0.0.1:8317/v1');
  };

  const handleDeleteCLIProxyProfile = (profileName: string) => {
    setCliProxyQuickProfiles((prev) => prev.filter((row) => row.name !== profileName));
  };

  // Save configuration
  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    setHealthCheck(null);

    try {
      const config: LLMConfigUpdate = {
        ai_route: aiRoute,
      };

      if (isCLIProxyRoute) {
        if (!cliproxyRouteEnabled) {
          setError('CLIProxy route is disabled by backend configuration.');
          setStatus('error');
          return;
        }
        if (!cliproxyApiKey.trim() && !hasStoredCLIProxyApiKey) {
          setError('CLIProxy API key is required.');
          setStatus('error');
          return;
        }
        if (!cliproxyModelAlias.trim()) {
          setError('CLIProxy model alias is required.');
          setStatus('error');
          return;
        }

        const cliproxyPayload: LLMConfigUpdate['cliproxy'] = {
          base_url: cliproxyBaseUrl.trim() || null,
          provider_filter: cliproxyProviderFilter,
          model_alias: cliproxyModelAlias.trim(),
          dashboard_url: cliproxyDashboardUrl.trim() || null,
          quick_profiles: cliproxyQuickProfiles,
        };
        if (cliproxyApiKey.trim()) {
          cliproxyPayload.client_api_key = cliproxyApiKey.trim();
        } else if (!hasStoredCLIProxyApiKey) {
          cliproxyPayload.client_api_key = '';
        }
        config.cliproxy = cliproxyPayload;
      } else {
        if (requiresApiKey && !apiKey.trim() && !hasStoredApiKey) {
          setError(t('settings.errors.apiKeyRequired'));
          setStatus('error');
          return;
        }

        const trimmedKey = apiKey.trim();
        config.provider = provider;
        config.model = model.trim();
        config.api_base = apiBase.trim() || null;
        if (requiresApiKey) {
          if (trimmedKey) {
            config.api_key = trimmedKey;
          } else if (!hasStoredApiKey) {
            config.api_key = '';
          }
        } else {
          config.api_key = '';
        }
      }

      const saved = await updateLlmConfig(config);

      if (isCLIProxyRoute && saved.cliproxy) {
        const ck = saved.cliproxy.client_api_key || '';
        setHasStoredCLIProxyApiKey(Boolean(ck));
        setCliProxyApiKey(ck.includes('*') ? '' : ck);
      }

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
      const testConfig: LLMConfigUpdate = { ai_route: aiRoute };
      if (isCLIProxyRoute) {
        const cliproxyPayload: LLMConfigUpdate['cliproxy'] = {
          base_url: cliproxyBaseUrl.trim() || null,
          provider_filter: cliproxyProviderFilter,
          model_alias: cliproxyModelAlias.trim() || undefined,
        };
        if (cliproxyApiKey.trim()) {
          cliproxyPayload.client_api_key = cliproxyApiKey.trim();
        }
        testConfig.cliproxy = cliproxyPayload;
        testConfig.model = cliproxyModelAlias.trim() || undefined;
        testConfig.api_base = cliproxyBaseUrl.trim() || null;
      } else {
        testConfig.provider = provider;
        testConfig.model = model.trim() || providerInfo.defaultModel;
        testConfig.api_base = apiBase.trim() || null;
        if (requiresApiKey && apiKey.trim()) {
          testConfig.api_key = apiKey.trim();
        }
      }

      const result = await testLlmConnection(testConfig);
      setHealthCheck(result);
      setStatus('idle');
    } catch (err) {
      console.error('Failed to test connection', err);
      setHealthCheck({
        healthy: false,
        provider: isCLIProxyRoute ? 'cliproxyapi' : provider,
        model: isCLIProxyRoute ? cliproxyModelAlias || 'n/a' : model,
        error: (err as Error).message,
      });
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
        setAiRoute(llmConfig.ai_route || 'direct_api');
        setCliProxyRouteEnabled(Boolean(llmConfig.cliproxy_route_enabled));
        setProvider(llmConfig.provider || 'openai');
        setModel(llmConfig.model || PROVIDER_INFO['openai'].defaultModel);
        const isMaskedKey = Boolean(llmConfig.api_key) && llmConfig.api_key.includes('*');
        setHasStoredApiKey(Boolean(llmConfig.api_key));
        setApiKey(isMaskedKey ? '' : llmConfig.api_key || '');
        setApiBase(llmConfig.api_base || '');
        if (llmConfig.cliproxy) {
          const isMaskedCLIProxyKey =
            Boolean(llmConfig.cliproxy.client_api_key) &&
            llmConfig.cliproxy.client_api_key.includes('*');
          setCliProxyBaseUrl(llmConfig.cliproxy.base_url || 'http://127.0.0.1:8317/v1');
          setHasStoredCLIProxyApiKey(Boolean(llmConfig.cliproxy.client_api_key));
          setCliProxyApiKey(isMaskedCLIProxyKey ? '' : llmConfig.cliproxy.client_api_key || '');
          setCliProxyProviderFilter(llmConfig.cliproxy.provider_filter || 'codex');
          setCliProxyModelAlias(llmConfig.cliproxy.model_alias || '');
          setCliProxyDashboardUrl(llmConfig.cliproxy.dashboard_url || '');
          setCliProxyQuickProfiles(llmConfig.cliproxy.quick_profiles || []);
        }
      } else {
        // Fallback if refetch fails
        setApiKey('');
        setHasStoredApiKey(false);
        setCliProxyApiKey('');
        setHasStoredCLIProxyApiKey(false);
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
                    <LlmStatusIcon className={`w-5 h-5 ${llmStatusIndicator.iconClassName}`} />
                    <span className="font-mono text-sm font-bold">{llmStatusIndicator.label}</span>
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

            <div className={`${sectionCardClass} py-3`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="max-w-2xl">
                  <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
                    Run Timing Analyzer
                  </p>
                  <p className="mt-1 text-[13px] text-gray-700">
                    Open a dedicated page grouped by dashboard resume rows. Each resume shows
                    company/role/location plus nested run and process timings with `N/A` fallback
                    for historical runs without timing data.
                  </p>
                </div>

                <Link href="/run-timing">
                  <Button variant="outline" size="xs" className="gap-1.5">
                    <Clock className="w-4 h-4" />
                    Open Run Timing Analyzer
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
              {/* AI Route Selection */}
              <div className={sectionCardClass}>
                <Label>AI Route</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-2">
                  {AI_ROUTES.map((route) => (
                    <button
                      key={route}
                      onClick={() => setAiRoute(route)}
                      className={`px-2.5 py-2 text-[11px] uppercase ${SEGMENTED_BUTTON_BASE} ${
                        aiRoute === route ? SEGMENTED_BUTTON_ACTIVE : SEGMENTED_BUTTON_INACTIVE
                      }`}
                    >
                      {route === 'cliproxyapi' ? 'CLIProxyAPI' : 'Direct API'}
                    </button>
                  ))}
                </div>
                <p className="mt-1 font-mono text-[11px] text-gray-500">
                  {isCLIProxyRoute
                    ? 'CLIProxyAPI route uses OpenAI-compatible transport with alias-based model routing.'
                    : 'Direct provider API route (existing behavior).'}
                </p>
              </div>

              {!isCLIProxyRoute ? (
                <>
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
                </>
              ) : (
                <>
                  {!cliproxyRouteEnabled && (
                    <div className="border border-amber-400 bg-amber-50 px-3 py-2">
                      <p className="font-mono text-[11px] text-amber-700">
                        CLIProxyAPI route is disabled on backend. Set `ENABLE_CLIPROXY_ROUTE=true`
                        and restart backend.
                      </p>
                    </div>
                  )}

                  <div className={sectionCardClass}>
                    <Label htmlFor="cliproxyBase">CLIProxy Base URL</Label>
                    <Input
                      id="cliproxyBase"
                      value={cliproxyBaseUrl}
                      onChange={(e) => setCliProxyBaseUrl(e.target.value)}
                      placeholder="http://127.0.0.1:8317/v1"
                      className="font-mono"
                    />
                    <p className="mt-1 font-mono text-[11px] text-gray-500">
                      Use your local proxy endpoint (OpenAI-compatible `/v1`).
                    </p>
                  </div>

                  <div className={sectionCardClass}>
                    <Label htmlFor="cliproxyKey">CLIProxy Client API Key</Label>
                    <div className="mt-2 flex flex-wrap items-stretch gap-2">
                      <Input
                        id="cliproxyKey"
                        type={showCliProxyApiKey ? 'text' : 'password'}
                        value={cliproxyApiKey}
                        onChange={(e) => setCliProxyApiKey(e.target.value)}
                        placeholder={
                          hasStoredCLIProxyApiKey && !cliproxyApiKey
                            ? '········ (saved — enter to replace)'
                            : 'sk-...'
                        }
                        className="min-w-[12rem] flex-1 font-mono"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="shrink-0"
                        onClick={() => setShowCliProxyApiKey((v) => !v)}
                        title={showCliProxyApiKey ? 'Hide key' : 'Show key'}
                      >
                        {showCliProxyApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="shrink-0"
                        onClick={() => void refreshCLIProxyModels()}
                        disabled={
                          cliproxyModelsLoading ||
                          !cliproxyBaseUrl.trim() ||
                          (!cliproxyApiKey.trim() && !hasStoredCLIProxyApiKey)
                        }
                        title="Reload models from CLIProxy"
                      >
                        {cliproxyModelsLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {hasStoredCLIProxyApiKey && !cliproxyApiKey && (
                      <p className="mt-1 font-mono text-[11px] text-gray-500">
                        Key is stored on the server (masked in API responses). Enter a new value
                        only to replace it, then Save. Show/hide applies to what you type; after
                        save the API never returns the full key.
                      </p>
                    )}
                  </div>

                  <div className={sectionCardClass}>
                    <Dropdown
                      options={cliproxyOwnedByOptions}
                      value={cliproxyOwnedByFilter}
                      onChange={(value) => setCliProxyOwnedByFilter(String(value))}
                      label="CLIProxy owned_by (source)"
                      description="Filter by parent / source from `/v1/models` when CLIProxy sets it."
                      density="compact"
                    />
                  </div>

                  <div className={sectionCardClass}>
                    <Dropdown
                      options={cliproxyProviderOptions}
                      value={cliproxyProviderFilter}
                      onChange={(value) =>
                        setCliProxyProviderFilter(value as CLIProxyProviderFilter)
                      }
                      label="CLIProxy Provider"
                      description="Narrows the model list (Codex / Claude / Gemini / all). Catalog always loads from the proxy."
                      density="compact"
                    />
                  </div>

                  <div className={sectionCardClass}>
                    {cliproxyModels.length > 0 && cliproxyModelOptions.length === 0 && (
                      <p className="mb-2 font-mono text-[11px] text-amber-700">
                        No models match these filters. Widen owned_by / provider or enter an alias
                        manually.
                      </p>
                    )}
                    {cliproxyModelOptions.length > 0 ? (
                      <Dropdown
                        options={cliproxyModelOptions}
                        value={cliproxyModelAlias}
                        onChange={setCliProxyModelAlias}
                        label="CLIProxy Model Alias"
                        description="Models from `/v1/models` for the provider above (full list loaded once)."
                        density="compact"
                      />
                    ) : (
                      <>
                        <Label htmlFor="cliproxyModelAlias">CLIProxy Model Alias</Label>
                        <Input
                          id="cliproxyModelAlias"
                          value={cliproxyModelAlias}
                          onChange={(e) => setCliProxyModelAlias(e.target.value)}
                          placeholder="codex-jd-fast"
                          className="font-mono"
                        />
                      </>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={refreshCLIProxyModels}
                        disabled={cliproxyModelsLoading}
                      >
                        {cliproxyModelsLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Refresh Aliases
                      </Button>
                      <a
                        href={
                          cliproxyDashboardUrl ||
                          `${(cliproxyBaseUrl || 'http://127.0.0.1:8317/v1').replace(/\/v1\/?$/, '')}/management.html`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="outline" size="xs">
                          Open CLIProxy Dashboard
                        </Button>
                      </a>
                    </div>
                    {cliproxyModelsError && (
                      <p className="mt-2 font-mono text-[11px] text-red-600">
                        {cliproxyModelsError}
                      </p>
                    )}
                  </div>

                  <div className={sectionCardClass}>
                    <Label htmlFor="cliproxyProfileName">Quick Profile Name</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        id="cliproxyProfileName"
                        value={cliproxyProfileName}
                        onChange={(e) => setCliProxyProfileName(e.target.value)}
                        placeholder="Codex Fast"
                        className="font-mono"
                      />
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={handleSaveCLIProxyProfile}
                        disabled={!cliproxyProfileName.trim() || !cliproxyModelAlias.trim()}
                      >
                        Save Profile
                      </Button>
                    </div>
                    {cliproxyQuickProfiles.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {cliproxyQuickProfiles.map((profile) => (
                          <div key={profile.name} className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleApplyCLIProxyProfile(profile)}
                            >
                              {profile.name}
                            </Button>
                            <button
                              onClick={() => handleDeleteCLIProxyProfile(profile.name)}
                              className="border border-black bg-white px-1.5 py-1 text-[10px] font-mono hover:bg-red-50"
                              type="button"
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

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

            <div className={sectionCardClass}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-700">
                  LLM Prompt Catalog
                </h3>
                <span className="font-mono text-[10px] uppercase text-gray-500">
                  {promptCatalog.length} prompts
                </span>
              </div>
              <p className="mt-2 text-[13px] text-gray-600">
                Read-only visibility for all prompt templates currently sent to LLM providers.
              </p>

              <div className="mt-3 space-y-2">
                {promptCatalog.length === 0 ? (
                  <p className="font-mono text-[11px] text-gray-500">
                    Prompt catalog unavailable right now.
                  </p>
                ) : (
                  promptCatalog.map((entry) => (
                    <details key={entry.id} className="border border-black/15 bg-white px-3 py-2">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gray-900">
                            {entry.id}
                          </span>
                          <span className="font-mono text-[10px] uppercase text-gray-500">
                            {entry.operation}
                          </span>
                          {entry.version && (
                            <span className="font-mono text-[10px] uppercase text-gray-500">
                              {entry.version}
                            </span>
                          )}
                          <span className="font-mono text-[10px] uppercase text-gray-500">
                            {entry.read_only ? 'Read-only' : 'Editable'}
                          </span>
                        </div>
                      </summary>

                      <div className="mt-3 space-y-3">
                        {entry.notes && <p className="text-[12px] text-gray-600">{entry.notes}</p>}
                        {entry.system_prompt && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
                              System Prompt
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap border border-black/20 bg-[#FAFAF7] p-2 text-[11px] text-gray-800">
                              {entry.system_prompt}
                            </pre>
                          </div>
                        )}
                        {entry.user_prompt && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
                              User Prompt
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap border border-black/20 bg-[#FAFAF7] p-2 text-[11px] text-gray-800">
                              {entry.user_prompt}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  ))
                )}
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
