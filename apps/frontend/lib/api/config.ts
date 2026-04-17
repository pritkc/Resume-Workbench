import { apiDelete, apiFetch } from './client';

// Supported LLM providers
export type LLMProvider = 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'deepseek' | 'ollama';
export type AIRoute = 'direct_api' | 'cliproxyapi';
export type CLIProxyProviderFilter = 'codex' | 'claude' | 'gemini' | 'mixed';

export interface CLIProxyQuickProfile {
  name: string;
  provider_filter: CLIProxyProviderFilter;
  model_alias: string;
  base_url: string | null;
}

export interface CLIProxyConfig {
  base_url: string | null;
  client_api_key: string;
  provider_filter: CLIProxyProviderFilter;
  model_alias: string;
  dashboard_url: string | null;
  quick_profiles: CLIProxyQuickProfile[];
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  api_key: string;
  api_base: string | null;
  ai_route: AIRoute;
  cliproxy: CLIProxyConfig;
  cliproxy_route_enabled: boolean;
}

export interface LLMConfigUpdate {
  provider?: LLMProvider;
  model?: string;
  api_key?: string;
  api_base?: string | null;
  ai_route?: AIRoute;
  cliproxy?: Partial<CLIProxyConfig>;
}

export interface DatabaseStats {
  total_resumes: number;
  total_jobs: number;
  total_improvements: number;
  has_master_resume: boolean;
}

export interface SystemStatus {
  status: 'ready' | 'setup_required';
  llm_configured: boolean;
  llm_healthy: boolean;
  llm_health_status?: 'healthy' | 'unhealthy' | 'unchecked' | 'not_configured';
  llm_health_checked?: boolean;
  llm_health_checked_at?: string | null;
  has_master_resume: boolean;
  database_stats: DatabaseStats;
}

export interface LLMHealthCheck {
  healthy: boolean;
  provider: string;
  model: string;
  error?: string;
  error_code?: string;
  response_model?: string;
  warning?: string;
  warning_code?: string;
  test_prompt?: string;
  model_output?: string;
  error_detail?: string;
}

export interface CLIProxyModelOption {
  id: string;
  provider: CLIProxyProviderFilter;
  /** OpenAI-style `/v1/models` field when CLIProxy provides it (source / parent). */
  owned_by?: string | null;
}

export interface CLIProxyModelsResponse {
  models: CLIProxyModelOption[];
  provider_filter: CLIProxyProviderFilter;
}

export interface GenerationRunTimingRow {
  generation_run_id: string;
  run_kind: string;
  status: string;
  prompt_id: string | null;
  application_pack_id: string | null;
  original_resume_id: string | null;
  tailored_resume_id: string | null;
  job_id: string | null;
  created_at: string | null;
  completed_at: string | null;
  total_duration_ms: number | null;
  total_events: number;
  llm_total_calls: number | null;
  llm_latency_total_ms: number | null;
  llm_total_tokens: number | null;
  llm_estimated_cost_usd: number | null;
}

export interface GenerationRunProcessTiming {
  process_key: string;
  host_event: string;
  sub_event: string | null;
  duration_ms: number;
}

export interface GenerationRunTimingDetailRow {
  generation_run_id: string;
  run_kind: string;
  status: string;
  prompt_id: string | null;
  application_pack_id: string | null;
  original_resume_id: string | null;
  tailored_resume_id: string | null;
  job_id: string | null;
  created_at: string | null;
  completed_at: string | null;
  total_duration_ms: number | null;
  llm_total_calls: number | null;
  llm_latency_total_ms: number | null;
  llm_total_tokens: number | null;
  llm_estimated_cost_usd: number | null;
  process_timings: GenerationRunProcessTiming[];
}

// Fetch full LLM configuration
export async function fetchLlmConfig(): Promise<LLMConfig> {
  const res = await apiFetch('/config/llm-api-key', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load LLM config (status ${res.status}).`);
  }

  return res.json();
}

// Legacy function for backwards compatibility
export async function fetchLlmApiKey(): Promise<string> {
  const config = await fetchLlmConfig();
  return config.api_key ?? '';
}

// Update LLM configuration
export async function updateLlmConfig(config: LLMConfigUpdate): Promise<LLMConfig> {
  const res = await apiFetch('/config/llm-api-key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update LLM config (status ${res.status}).`);
  }

  return res.json();
}

// Legacy function for backwards compatibility
export async function updateLlmApiKey(value: string): Promise<string> {
  const config = await updateLlmConfig({ api_key: value });
  return config.api_key ?? '';
}

// Test LLM connection with optional config (for pre-save testing)
export async function testLlmConnection(config?: LLMConfigUpdate): Promise<LLMHealthCheck> {
  const options: RequestInit = {
    method: 'POST',
    credentials: 'include',
  };

  // If config provided, send it in the request body
  if (config) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(config);
  }

  const res = await apiFetch('/config/llm-test', options);

  if (!res.ok) {
    throw new Error(`Failed to test LLM connection (status ${res.status}).`);
  }

  return res.json();
}

export async function fetchCLIProxyModels(
  payload?: Partial<Pick<CLIProxyConfig, 'base_url' | 'client_api_key' | 'provider_filter'>>
): Promise<CLIProxyModelsResponse> {
  const res = await apiFetch('/config/cliproxy-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload ?? {}),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to fetch CLIProxy models (status ${res.status}).`);
  }

  return res.json();
}

// Fetch system status
export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await apiFetch('/status', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to fetch system status (status ${res.status}).`);
  }

  return res.json();
}

export async function fetchGenerationRunTimingLogs(options?: {
  runKind?: string;
  status?: string;
  limit?: number;
}): Promise<GenerationRunTimingRow[]> {
  const params = new URLSearchParams();
  if (options?.runKind) params.set('run_kind', options.runKind);
  if (options?.status) params.set('status', options.status);
  params.set('limit', String(options?.limit ?? 100));

  const res = await apiFetch(`/llm/runs/timing?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch run timing logs (status ${res.status}).`);
  }
  const payload = await res.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchGenerationRunTimingDetails(options?: {
  runKind?: string;
  status?: string;
  limit?: number;
}): Promise<GenerationRunTimingDetailRow[]> {
  const params = new URLSearchParams();
  if (options?.runKind) params.set('run_kind', options.runKind);
  if (options?.status) params.set('status', options.status);
  params.set('limit', String(options?.limit ?? 50));

  const res = await apiFetch(`/llm/runs/timing-detailed?${params.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch run timing details (status ${res.status}).`);
  }
  const payload = await res.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

// Provider display names and default models
export const PROVIDER_INFO: Record<
  LLMProvider,
  { name: string; defaultModel: string; requiresKey: boolean }
> = {
  openai: { name: 'OpenAI', defaultModel: 'gpt-5-nano-2025-08-07', requiresKey: true },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-haiku-4-5-20251001', requiresKey: true },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'deepseek/deepseek-chat',
    requiresKey: true,
  },
  gemini: { name: 'Google Gemini', defaultModel: 'gemini-3-flash-preview', requiresKey: true },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat', requiresKey: true },
  ollama: { name: 'Ollama (Local)', defaultModel: 'gemma3:4b', requiresKey: false },
};

// Feature configuration types
export interface FeatureConfig {
  enable_cover_letter: boolean;
  enable_outreach_message: boolean;
}

export interface FeatureConfigUpdate {
  enable_cover_letter?: boolean;
  enable_outreach_message?: boolean;
}

// Fetch feature configuration
export async function fetchFeatureConfig(): Promise<FeatureConfig> {
  const res = await apiFetch('/config/features', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load feature config (status ${res.status}).`);
  }

  return res.json();
}

// Update feature configuration
export async function updateFeatureConfig(config: FeatureConfigUpdate): Promise<FeatureConfig> {
  const res = await apiFetch('/config/features', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update feature config (status ${res.status}).`);
  }

  return res.json();
}

// Language configuration types
export type SupportedLanguage = 'en' | 'es' | 'zh' | 'ja' | 'pt';

export interface LanguageConfig {
  ui_language: SupportedLanguage;
  content_language: SupportedLanguage;
  supported_languages: SupportedLanguage[];
}

export interface LanguageConfigUpdate {
  ui_language?: SupportedLanguage;
  content_language?: SupportedLanguage;
}

// Fetch language configuration
export async function fetchLanguageConfig(): Promise<LanguageConfig> {
  const res = await apiFetch('/config/language', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load language config (status ${res.status}).`);
  }

  return res.json();
}

// Update language configuration
export async function updateLanguageConfig(update: LanguageConfigUpdate): Promise<LanguageConfig> {
  const res = await apiFetch('/config/language', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update language config (status ${res.status}).`);
  }

  return res.json();
}

export interface PromptOption {
  id: string;
  label: string;
  description: string;
}

export interface PromptConfig {
  default_prompt_id: string;
  prompt_options: PromptOption[];
}

export interface PromptConfigUpdate {
  default_prompt_id?: string;
}

export type PromptCatalogPolicy =
  | 'system'
  | 'user_editable_future'
  | 'user_choice'
  | 'runtime_injected';

export interface PromptCatalogSection {
  id: string;
  label: string;
  note?: string | null;
  policy?: PromptCatalogPolicy | null;
  content?: string | null;
  children: PromptCatalogSection[];
}

export interface PromptCatalogEntry {
  id: string;
  operation: string;
  version?: string | null;
  read_only: boolean;
  system_prompt?: string | null;
  user_prompt?: string | null;
  notes?: string | null;
  sections?: PromptCatalogSection[] | null;
}

export interface PromptVariable {
  name: string;
  description: string;
}

export type PromptPipeline = 'full' | 'lite' | 'standalone';

export interface PromptManagerEntry {
  step_name: string;
  label: string;
  version: string;
  file_path: string;
  pipeline: PromptPipeline;
  pipeline_order: number;
  receives_from: string[];
  feeds_into: string[];
  instructions: string;
  instructions_is_override: boolean;
  instructions_default: string;
  rules: string;
  rules_source: string | null;
  rules_is_override: boolean;
  rules_default: string;
  data_template: string;
  variables: PromptVariable[];
  model: string;
  model_is_override: boolean;
  read_only: boolean;
  /** Phase 3.7.6 composer: two-scroll model + optional JSON override */
  composer_override_active?: boolean;
  system_shipped?: string;
  user_template_shipped?: string;
  system_resolved?: string;
  user_template_resolved?: string;
}

export interface PromptComposerPayload {
  system: string;
  user: string;
}

export interface PromptComposerResponse {
  step_name: string;
  composer_override_active: boolean;
  system: string;
  user: string;
  system_shipped: string;
  user_template_shipped: string;
}

export interface SharedRuleEntry {
  name: string;
  label: string;
  rules: string;
  rules_is_override: boolean;
  rules_default: string;
  used_by: string[];
}

export interface SharedRuleOverrideSuccess {
  success: boolean;
  rules_name: string;
  affected_steps: string[];
}

export interface PromptCatalogResponse {
  prompts: PromptCatalogEntry[];
  entries?: PromptManagerEntry[];
  shared_rules?: SharedRuleEntry[];
}

export interface CritiqueConfig {
  enabled: boolean;
}

export interface ModelOverridesResponse {
  overrides: Record<string, string | null>;
}

export interface GenerationDefaults {
  include_cover_letter: boolean;
  include_outreach_message: boolean;
  prompt_id: string;
}

export interface GenerationDefaultsUpdate {
  include_cover_letter?: boolean;
  include_outreach_message?: boolean;
  prompt_id?: string;
}

// Fetch prompt configuration
export async function fetchPromptConfig(): Promise<PromptConfig> {
  const res = await apiFetch('/config/prompts', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load prompt config (status ${res.status}).`);
  }

  return res.json();
}

// Update prompt configuration
export async function updatePromptConfig(update: PromptConfigUpdate): Promise<PromptConfig> {
  const res = await apiFetch('/config/prompts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update prompt config (status ${res.status}).`);
  }

  return res.json();
}

// Fetch read-only LLM prompt catalog
export async function fetchPromptCatalog(): Promise<PromptCatalogResponse> {
  const res = await apiFetch('/config/prompts/catalog', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load prompt catalog (status ${res.status}).`);
  }

  return res.json();
}

export async function fetchPromptComposer(stepName: string): Promise<PromptComposerResponse> {
  const res = await apiFetch(
    `/config/prompts/${encodeURIComponent(stepName)}/composer`,
    { credentials: 'include' }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail ||
        `Failed to load prompt composer (status ${res.status}).`
    );
  }
  return res.json();
}

export async function putPromptComposer(
  stepName: string,
  payload: PromptComposerPayload
): Promise<PromptComposerResponse> {
  const res = await apiFetch(`/config/prompts/${encodeURIComponent(stepName)}/composer`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail ||
        `Failed to save prompt composer (status ${res.status}).`
    );
  }
  return res.json();
}

export async function deletePromptComposer(stepName: string): Promise<PromptComposerResponse> {
  const res = await apiDelete(`/config/prompts/${encodeURIComponent(stepName)}/composer`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail ||
        `Failed to reset prompt composer (status ${res.status}).`
    );
  }
  return res.json();
}

export async function putSharedRulesOverride(
  rulesName: string,
  rules: string
): Promise<SharedRuleOverrideSuccess> {
  const res = await apiFetch(`/config/shared-rules/${encodeURIComponent(rulesName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail ||
        `Failed to save shared rules (status ${res.status}).`
    );
  }
  return res.json();
}

export async function deleteSharedRulesOverride(
  rulesName: string
): Promise<SharedRuleOverrideSuccess> {
  const res = await apiDelete(`/config/shared-rules/${encodeURIComponent(rulesName)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail ||
        `Failed to delete shared rules override (status ${res.status}).`
    );
  }
  return res.json();
}

export async function fetchCritiqueConfig(): Promise<CritiqueConfig> {
  const res = await apiFetch('/config/critique', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to load critique config (status ${res.status}).`);
  }
  return res.json();
}

export async function updateCritiqueConfig(enabled: boolean): Promise<CritiqueConfig> {
  const res = await apiFetch('/config/critique', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update critique config (status ${res.status}).`);
  }
  return res.json();
}

export async function fetchModelOverrides(): Promise<ModelOverridesResponse> {
  const res = await apiFetch('/config/model-overrides', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to load model overrides (status ${res.status}).`);
  }
  return res.json();
}

export async function updateModelOverrides(
  overrides: Record<string, string | null>
): Promise<ModelOverridesResponse> {
  const res = await apiFetch('/config/model-overrides', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ overrides }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to save model overrides (status ${res.status}).`);
  }
  return res.json();
}

export async function fetchGenerationDefaults(): Promise<GenerationDefaults> {
  const res = await apiFetch('/config/generation-defaults', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load generation defaults (status ${res.status}).`);
  }

  return res.json();
}

export async function updateGenerationDefaults(
  update: GenerationDefaultsUpdate
): Promise<GenerationDefaults> {
  const res = await apiFetch('/config/generation-defaults', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update generation defaults (status ${res.status}).`);
  }

  return res.json();
}

// API Key Management types
export type ApiKeyProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'deepseek';

export interface ApiKeyProviderStatus {
  provider: ApiKeyProvider;
  configured: boolean;
  masked_key: string | null;
}

export interface ApiKeyStatusResponse {
  providers: ApiKeyProviderStatus[];
}

export interface ApiKeysUpdateRequest {
  openai?: string;
  anthropic?: string;
  google?: string;
  openrouter?: string;
  deepseek?: string;
}

export interface ApiKeysUpdateResponse {
  message: string;
  updated_providers: string[];
}

// Provider display names for API keys
export const API_KEY_PROVIDER_INFO: Record<ApiKeyProvider, { name: string; description: string }> =
  {
    openai: { name: 'OpenAI', description: 'GPT-4, GPT-4o, etc.' },
    anthropic: { name: 'Anthropic', description: 'Claude 3.5, Claude 4, etc.' },
    google: { name: 'Google', description: 'Gemini 1.5, Gemini 2, etc.' },
    openrouter: { name: 'OpenRouter', description: 'Access multiple providers' },
    deepseek: { name: 'DeepSeek', description: 'DeepSeek chat models' },
  };

// Fetch API key status for all providers
export async function fetchApiKeyStatus(): Promise<ApiKeyStatusResponse> {
  const res = await apiFetch('/config/api-keys', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load API key status (status ${res.status}).`);
  }

  return res.json();
}

// Update API keys for one or more providers
export async function updateApiKeys(keys: ApiKeysUpdateRequest): Promise<ApiKeysUpdateResponse> {
  const res = await apiFetch('/config/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(keys),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update API keys (status ${res.status}).`);
  }

  return res.json();
}

// Delete API key for a specific provider
export async function deleteApiKey(provider: ApiKeyProvider): Promise<void> {
  const res = await apiFetch(`/config/api-keys/${provider}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to delete API key (status ${res.status}).`);
  }
}

// Clear all API keys
export async function clearAllApiKeys(): Promise<void> {
  const res = await apiFetch('/config/api-keys?confirm=CLEAR_ALL_KEYS', {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to clear API keys (status ${res.status}).`);
  }
}

// Reset database
export async function resetDatabase(): Promise<void> {
  const res = await apiFetch('/config/reset', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET_ALL_DATA' }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to reset database (status ${res.status}).`);
  }
}
