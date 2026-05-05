'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  fetchLlmConfig,
  updateLlmConfig,
  testLlmConnection,
  fetchCLIProxyModels,
  fetchCritiqueConfig,
  fetchPromptConfig,
  updateCritiqueConfig,
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
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

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

/** Monochrome toggles — aligned with builder / Retro density. */
const segmentBtn =
  'border border-black/15 bg-white px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-black/60 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] transition-colors hover:border-black/25 hover:text-black disabled:cursor-not-allowed disabled:opacity-50';
const segmentBtnOn = 'border-black/40 bg-black/[0.05] font-semibold text-black';

const settingsLabelClass = 'font-mono text-[10px] uppercase tracking-wider text-black/50';
const settingsInputClass =
  'h-7 rounded-none border border-black/30 bg-white px-2 font-mono text-sm focus-visible:border-black focus-visible:ring-0';

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
  const [defaultPromptId, setDefaultPromptId] = useState('full');
  const [critiqueEnabled, setCritiqueEnabled] = useState(true);
  const [critiqueLoading, setCritiqueLoading] = useState(false);

  // Danger Zone state
  const [showClearApiKeysDialog, setShowClearApiKeysDialog] = useState(false);
  const [showResetDatabaseDialog, setShowResetDatabaseDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Translations
  const { t } = useTranslations();
  const providerInfo = PROVIDER_INFO[provider] ?? PROVIDER_INFO['openai'];
  const isCLIProxyRoute = aiRoute === 'cliproxyapi';
  const requiresApiKey = isCLIProxyRoute ? true : (providerInfo.requiresKey ?? true);
  const fallbackPromptOptions = useMemo<PromptOption[]>(
    () => [
      {
        id: 'full',
        label: t('tailor.promptOptions.full.label'),
        description: t('tailor.promptOptions.full.description'),
      },
      {
        id: 'lite',
        label: t('tailor.promptOptions.lite.label'),
        description: t('tailor.promptOptions.lite.description'),
      },
    ],
    [t]
  );
  const promptOptionOverrides = useMemo<Record<string, { label: string; description: string }>>(
    () => ({
      full: {
        label: t('tailor.promptOptions.full.label'),
        description: t('tailor.promptOptions.full.description'),
      },
      lite: {
        label: t('tailor.promptOptions.lite.label'),
        description: t('tailor.promptOptions.lite.description'),
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
        const [llmConfig, promptConfig, critiqueCfg] = await Promise.all([
          fetchLlmConfig().catch(() => null),
          fetchPromptConfig().catch(() => null),
          fetchCritiqueConfig().catch(() => null),
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
          setDefaultPromptId(promptConfig.default_prompt_id || 'full');
        }

        if (critiqueCfg) {
          setCritiqueEnabled(critiqueCfg.enabled);
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
      localStorage.removeItem('active_resume_id');
      localStorage.removeItem('resume_builder_draft');
      localStorage.removeItem('resume_builder_settings');
      localStorage.removeItem('resume_matcher_content_language');
      localStorage.removeItem('resume_matcher_ui_language');

      // Refresh status to show empty counts
      await refreshStatus();
      // Clear health check as context is lost
      setHealthCheck(null);
      setError(null);
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

  const sectionCardClass = 'entry-card-editor space-y-1.5';

  return (
    <div className="min-h-screen overflow-y-auto bg-[#E8E8E0] p-2 md:p-3">
      <div className="mx-auto w-full max-w-6xl border border-black/15 bg-[#F0F0E8] shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
        {/* Header — builder-aligned shell */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/15 bg-white px-2 py-1.5 md:px-2.5">
          <div className="min-w-0">
            <h1 className="font-mono text-xs font-semibold uppercase tracking-widest text-black">
              {t('settings.title')}
            </h1>
          </div>
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 shrink-0 border border-black/30 p-0 text-black/60 hover:border-black hover:text-black"
              aria-label={t('common.back')}
              title={t('common.back')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-1.5 p-2 md:p-2 xl:grid-cols-12 xl:items-start xl:gap-2">
          {/* API Key Not Configured Warning */}
          {!statusLoading && systemStatus && !systemStatus.llm_configured && (
            <div className="border border-amber-500/60 bg-amber-50/90 px-2 py-1.5 xl:col-span-12">
              <div className="flex items-start gap-1.5">
                <div className="mt-0.5 h-2 w-2 shrink-0 bg-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                    {t('settings.setupRequired.title')}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] leading-snug text-amber-800/90">
                    {t('settings.setupRequired.description')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* System Status Panel */}
          <section className="space-y-1.5 xl:col-span-12">
            <div className="flex items-center justify-between gap-2 border-b border-black/15 pb-1">
              <div className="flex min-w-0 items-center gap-2">
                <Activity className="h-3.5 w-3.5 shrink-0 text-black/45" />
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-black">
                  {t('settings.systemStatus.title')}
                </h2>
                {lastFetched ? (
                  <span className="hidden items-center gap-0.5 font-mono text-[9px] text-black/35 sm:inline-flex">
                    <Clock className="h-3 w-3" />
                    {formatLastFetched()}
                  </span>
                ) : null}
              </div>
              <Button
                variant="builderOutline"
                size="icon-sm"
                onClick={refreshStatus}
                disabled={statusLoading}
                className="h-6 w-6 shrink-0 p-0"
                aria-label={t('settings.systemStatus.refresh')}
                title={t('settings.systemStatus.refresh')}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {statusLoading ? (
              <div className="entry-card-editor flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-black/30" />
              </div>
            ) : !systemStatus ? (
              <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-red-300/80 bg-red-50/50 px-2 py-4">
                <p className="font-mono text-[10px] font-semibold uppercase text-red-700">
                  {t('settings.systemStatus.unableToConnect')}
                </p>
                <p className="text-center font-mono text-[9px] text-black/50">
                  {t('settings.systemStatus.expectedAt', { apiUrl: API_URL })}
                </p>
                <Button
                  variant="builderOutline"
                  size="icon-sm"
                  onClick={refreshStatus}
                  className="h-6 w-6 p-0"
                  aria-label={t('common.retry')}
                  title={t('common.retry')}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="entry-card-editor">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="min-w-0 border border-black/10 bg-white/90 p-1.5">
                    <div className="mb-0.5 flex items-center gap-1">
                      <Server className="h-3 w-3 shrink-0 text-black/40" />
                      <span className="truncate font-mono text-[9px] uppercase text-black/45">
                        {t('settings.statusCards.llm')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <LlmStatusIcon className={`h-3.5 w-3.5 shrink-0 ${llmStatusIndicator.iconClassName}`} />
                      <span className="truncate font-mono text-[11px] font-semibold leading-tight">
                        {llmStatusIndicator.label}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 border border-black/10 bg-white/90 p-1.5">
                    <div className="mb-0.5 flex items-center gap-1">
                      <Database className="h-3 w-3 shrink-0 text-black/40" />
                      <span className="truncate font-mono text-[9px] uppercase text-black/45">
                        {t('settings.statusCards.database')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      <span className="font-mono text-[11px] font-semibold">
                        {t('settings.statusValues.connected')}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 border border-black/10 bg-white/90 p-1.5">
                    <div className="mb-0.5 flex items-center gap-1">
                      <FileText className="h-3 w-3 shrink-0 text-black/40" />
                      <span className="truncate font-mono text-[9px] uppercase text-black/45">
                        {t('settings.statusCards.resumes')}
                      </span>
                    </div>
                    <span className="font-mono text-lg font-bold leading-none">
                      {systemStatus.database_stats.total_resumes}
                    </span>
                  </div>
                  <div className="min-w-0 border border-black/10 bg-white/90 p-1.5">
                    <div className="mb-0.5 flex items-center gap-1">
                      <Briefcase className="h-3 w-3 shrink-0 text-black/40" />
                      <span className="truncate font-mono text-[9px] uppercase text-black/45">
                        {t('settings.statusCards.jobs')}
                      </span>
                    </div>
                    <span className="font-mono text-lg font-bold leading-none">
                      {systemStatus.database_stats.total_jobs}
                    </span>
                  </div>
                  <div className="min-w-0 border border-black/10 bg-white/90 p-1.5">
                    <div className="mb-0.5 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 shrink-0 text-black/40" />
                      <span className="truncate font-mono text-[9px] uppercase text-black/45">
                        {t('settings.statusCards.improvements')}
                      </span>
                    </div>
                    <span className="font-mono text-lg font-bold leading-none">
                      {systemStatus.database_stats.total_improvements}
                    </span>
                  </div>
                  <div className="min-w-0 border border-black/10 bg-white/90 p-1.5">
                    <div className="mb-0.5 flex items-center gap-1">
                      <FileText className="h-3 w-3 shrink-0 text-black/40" />
                      <span className="truncate font-mono text-[9px] uppercase text-black/45">
                        {t('settings.statusCards.masterResume')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {systemStatus.has_active_resume ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                          <span className="truncate font-mono text-[11px] font-semibold">
                            {t('settings.statusValues.configured')}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span className="truncate font-mono text-[11px] font-semibold">
                            {t('settings.statusValues.notSet')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* LLM Configuration — primary column on xl */}
          <section className="space-y-1.5 xl:col-span-7">
            <div className="flex items-center gap-1.5 border-b border-black/15 pb-1">
              <Key className="h-3.5 w-3.5 shrink-0 text-black/45" />
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-black">
                {t('settings.llmConfigurationTitle')}
              </h2>
            </div>

            <div className="grid gap-2">
              {/* AI Route Selection */}
              <div className={sectionCardClass}>
                <Label className={settingsLabelClass}>AI Route</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 md:grid-cols-2">
                  {AI_ROUTES.map((route) => (
                    <button
                      key={route}
                      type="button"
                      onClick={() => setAiRoute(route)}
                      className={cn(segmentBtn, aiRoute === route && segmentBtnOn)}
                    >
                      {route === 'cliproxyapi' ? 'CLIProxyAPI' : 'Direct API'}
                    </button>
                  ))}
                </div>
              </div>

              {!isCLIProxyRoute ? (
                <>
                  {/* Provider Selection */}
                  <div className={sectionCardClass}>
                    <Label className={settingsLabelClass}>{t('settings.providerLabel')}</Label>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5 md:grid-cols-6">
                      {PROVIDERS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleProviderChange(p)}
                          className={cn(segmentBtn, provider === p && segmentBtnOn)}
                        >
                          {PROVIDER_INFO[p].name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Model Input */}
                  <div className={sectionCardClass}>
                    <Label htmlFor="model" className={settingsLabelClass}>
                      {t('settings.llmConfiguration.modelLabel')}
                    </Label>
                    <Input
                      id="model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={providerInfo.defaultModel}
                      className={settingsInputClass}
                      title={t('settings.llmConfiguration.defaultModel', {
                        model: providerInfo.defaultModel,
                      })}
                    />
                  </div>

                  {/* API Key Input */}
                  <div className={sectionCardClass}>
                    <Label htmlFor="apiKey" className={settingsLabelClass}>
                      {t('settings.llmConfiguration.apiKeyLabel')}{' '}
                      {!requiresApiKey && (
                        <span className="font-normal text-black/35">
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
                      className={settingsInputClass}
                      disabled={!requiresApiKey}
                      title={
                        requiresApiKey && hasStoredApiKey
                          ? t('settings.llmConfiguration.leaveBlankToKeepExistingKey')
                          : undefined
                      }
                    />
                  </div>

                  {/* API Base URL (optional, for proxies/aggregators/custom endpoints) */}
                  <div className={sectionCardClass}>
                    <Label htmlFor="apiBase" className={settingsLabelClass}>
                      {t('settings.llmConfiguration.baseUrlLabel')}
                    </Label>
                    <Input
                      id="apiBase"
                      value={apiBase}
                      onChange={(e) => setApiBase(e.target.value)}
                      placeholder={t('settings.llmConfiguration.baseUrlPlaceholder')}
                      className={settingsInputClass}
                      title={t('settings.llmConfiguration.baseUrlDescription')}
                    />
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
                    <Label htmlFor="cliproxyBase" className={settingsLabelClass}>
                      CLIProxy Base URL
                    </Label>
                    <Input
                      id="cliproxyBase"
                      value={cliproxyBaseUrl}
                      onChange={(e) => setCliProxyBaseUrl(e.target.value)}
                      placeholder="http://127.0.0.1:8317/v1"
                      className={settingsInputClass}
                      title="OpenAI-compatible /v1"
                    />
                  </div>

                  <div className={sectionCardClass}>
                    <Label htmlFor="cliproxyKey" className={settingsLabelClass}>
                      CLIProxy Client API Key
                    </Label>
                    <div className="mt-1.5 flex flex-wrap items-stretch gap-1.5">
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
                        className={cn(settingsInputClass, 'min-w-[12rem] flex-1')}
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="builderOutline"
                        size="icon-sm"
                        className="h-6 w-6 shrink-0 p-0"
                        onClick={() => setShowCliProxyApiKey((v) => !v)}
                        title={showCliProxyApiKey ? 'Hide key' : 'Show key'}
                        aria-label={showCliProxyApiKey ? 'Hide key' : 'Show key'}
                      >
                        {showCliProxyApiKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="builderOutline"
                        size="icon-sm"
                        className="h-6 w-6 shrink-0 p-0"
                        onClick={() => void refreshCLIProxyModels()}
                        disabled={
                          cliproxyModelsLoading ||
                          !cliproxyBaseUrl.trim() ||
                          (!cliproxyApiKey.trim() && !hasStoredCLIProxyApiKey)
                        }
                        title="Reload models from CLIProxy"
                        aria-label="Reload models from CLIProxy"
                      >
                        {cliproxyModelsLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className={sectionCardClass}>
                    <Dropdown
                      options={cliproxyOwnedByOptions}
                      value={cliproxyOwnedByFilter}
                      onChange={(value) => setCliProxyOwnedByFilter(String(value))}
                      label="owned_by"
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
                        label="Model alias"
                        density="compact"
                      />
                    ) : (
                      <>
                        <Label htmlFor="cliproxyModelAlias" className={settingsLabelClass}>
                          CLIProxy Model Alias
                        </Label>
                        <Input
                          id="cliproxyModelAlias"
                          value={cliproxyModelAlias}
                          onChange={(e) => setCliProxyModelAlias(e.target.value)}
                          placeholder="codex-jd-fast"
                          className={settingsInputClass}
                        />
                      </>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Button
                        variant="builderOutline"
                        size="xs"
                        onClick={refreshCLIProxyModels}
                        disabled={cliproxyModelsLoading}
                        className="h-6 gap-1 px-2 text-[10px]"
                      >
                        {cliproxyModelsLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Refresh
                      </Button>
                      <a
                        href={
                          cliproxyDashboardUrl ||
                          `${(cliproxyBaseUrl || 'http://127.0.0.1:8317/v1').replace(/\/v1\/?$/, '')}/management.html`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="builderOutline" size="xs" className="h-6 px-2 text-[10px]">
                          Dashboard
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
                    <Label htmlFor="cliproxyProfileName" className={settingsLabelClass}>
                      Quick Profile Name
                    </Label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Input
                        id="cliproxyProfileName"
                        value={cliproxyProfileName}
                        onChange={(e) => setCliProxyProfileName(e.target.value)}
                        placeholder="Codex Fast"
                        className={cn(settingsInputClass, 'min-w-0 flex-1')}
                      />
                      <Button
                        variant="builderOutline"
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
                              variant="builderOutline"
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
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="builderCta"
                  size="xs"
                  onClick={handleSave}
                  disabled={status === 'saving' || status === 'loading'}
                  className="min-w-[7rem] flex-1"
                >
                  {status === 'saving' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : status === 'saved' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('common.success')}
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      {t('common.save')}
                    </>
                  )}
                </Button>
                <Button
                  variant="builderOutline"
                  size="xs"
                  onClick={handleTestConnection}
                  disabled={status === 'testing' || status === 'saving'}
                  className="min-w-[7rem] flex-1 sm:flex-none"
                >
                  {status === 'testing' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Activity className="h-3.5 w-3.5" />
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
                  <div className="mb-1.5 flex items-center gap-1.5">
                    {healthCheck.healthy ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-mono text-xs font-bold">
                      {healthCheck.healthy
                        ? t('settings.llmConfiguration.connectionSuccessful')
                        : t('settings.llmConfiguration.connectionFailed')}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-black/55">
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
                    <div className="mt-2 space-y-2">
                      {healthDetailItems.map((item) => (
                        <div key={item.key}>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-black/45">
                            {item.label}
                          </p>
                          <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-none border border-black/20 bg-white p-2 font-mono text-[11px] text-black/80">
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

          {/* Prompt, locale, observability, danger — sidebar on xl */}
          <div className="space-y-1.5 xl:col-span-5">
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 border-b border-black/15 pb-1">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-black/45" />
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-black">
                  {t('settings.promptSettings.title')}
                </h2>
              </div>

              <div className={sectionCardClass}>
                <Dropdown
                  options={localizedPromptOptions}
                  value={defaultPromptId}
                  onChange={handlePromptConfigChange}
                  label={t('settings.promptSettings.title')}
                  disabled={promptConfigLoading}
                  density="compact"
                />
                <p className="font-mono text-[10px] leading-snug text-black/45">
                  {t('settings.appEnglishOnly')}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-black/10 pt-1.5">
                  <label
                    className="flex min-w-0 cursor-pointer items-center gap-1.5 font-mono text-[10px] text-black/75"
                    title={t('settings.critiquePipeline.description')}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 shrink-0 accent-black"
                      checked={critiqueEnabled}
                      disabled={critiqueLoading}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        setCritiqueLoading(true);
                        try {
                          const r = await updateCritiqueConfig(next);
                          setCritiqueEnabled(r.enabled);
                        } catch {
                          setCritiqueEnabled(!next);
                        } finally {
                          setCritiqueLoading(false);
                        }
                      }}
                    />
                    <span className="truncate">{t('settings.critiquePipeline.toggle')}</span>
                  </label>
                  <Link href="/settings/prompt-catalog">
                    <Button variant="builderOutline" size="xs" className="h-6 gap-1 px-2 text-[10px]">
                      <FileText className="h-3 w-3" />
                      {t('settings.promptCatalog.openCatalog')}
                    </Button>
                  </Link>
                </div>
              </div>
            </section>

            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 border-b border-black/15 pb-1">
                <Activity className="h-3.5 w-3.5 shrink-0 text-black/45" />
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-black">
                  LLM observability
                </h2>
              </div>
              <div className="entry-card-editor flex flex-wrap gap-1">
                <Link
                  href="/llm-traces"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 sm:flex-none"
                >
                  <Button
                    variant="builderOutline"
                    size="xs"
                    className="h-6 w-full gap-1 px-2 text-[10px] sm:w-auto"
                    title="Traces, latency, tokens — internal use only"
                  >
                    <Activity className="h-3 w-3 shrink-0" />
                    Traces
                  </Button>
                </Link>
                <Link
                  href="/run-timing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 sm:flex-none"
                >
                  <Button
                    variant="builderOutline"
                    size="xs"
                    className="h-6 w-full gap-1 px-2 text-[10px] sm:w-auto"
                    title="Run timing by resume row"
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    Run timing
                  </Button>
                </Link>
              </div>
            </section>

            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 border-b border-red-200/80 pb-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-red-700">
                  {t('settings.dangerZone')}
                </h2>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="flex flex-col gap-1 border border-red-200/70 bg-red-50/40 p-1.5">
                  <p className="font-mono text-[9px] leading-snug text-red-900/90">
                    {t('settings.clearApiKeys')}
                  </p>
                  <Button
                    variant="builderOutline"
                    size="xs"
                    className="h-6 w-full gap-1 border-red-300/80 px-2 text-[10px] text-red-800 hover:bg-red-50/80"
                    onClick={() => setShowClearApiKeysDialog(true)}
                    disabled={isResetting}
                    title={t('settings.clearApiKeysDescription')}
                  >
                    <Key className="h-3 w-3 shrink-0" />
                    {t('settings.clearApiKeys')}
                  </Button>
                </div>
                <div className="flex flex-col gap-1 border border-red-200/70 bg-red-50/40 p-1.5">
                  <p className="font-mono text-[9px] leading-snug text-red-900/90">
                    {t('settings.resetDatabase')}
                  </p>
                  <Button
                    variant="destructive"
                    size="xs"
                    className="h-6 w-full gap-1 rounded-none px-2 text-[10px]"
                    onClick={() => setShowResetDatabaseDialog(true)}
                    disabled={isResetting}
                    title={t('settings.resetDatabaseDescription')}
                  >
                    <Trash2 className="h-3 w-3 shrink-0" />
                    {t('settings.resetDatabase')}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-black/10 bg-white/90 px-2 py-1 text-[11px] text-black/60 no-print md:px-2.5">
          <div className="flex items-center gap-1.5">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={14}
              height={14}
              className="h-3.5 w-3.5 opacity-80"
            />
            <span className="font-mono text-[10px] text-black/45">
              {getVersionString().toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {statusLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-black/40" />
                <span className="font-mono text-[10px] text-black/45">
                  {t('settings.footer.status.checking')}
                </span>
              </>
            ) : systemStatus ? (
              <>
                <div
                  className={`h-2 w-2 shrink-0 ${systemStatus.status === 'ready' ? 'bg-green-700' : 'bg-amber-500'}`}
                />
                <span
                  className={`font-mono text-[10px] font-semibold ${systemStatus.status === 'ready' ? 'text-green-800' : 'text-amber-700'}`}
                >
                  {systemStatus.status === 'ready'
                    ? t('settings.footer.status.ready')
                    : t('settings.footer.status.setupRequired')}
                </span>
              </>
            ) : (
              <span className="font-mono text-[10px] text-black/45">
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
    </div>
  );
}
