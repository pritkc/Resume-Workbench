/**
 * API Module Exports
 *
 * Centralized exports for all API-related functionality.
 */

// Client utilities
export {
  API_URL,
  API_BASE,
  apiFetch,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
  getUploadUrl,
} from './client';

// Resume operations
export {
  uploadJobDescriptions,
  improveResume,
  previewImproveResume,
  confirmImproveResume,
  ImproveApiError,
  fetchResume,
  fetchResumeList,
  updateResume,
  downloadResumePdf,
  deleteResume,
  type ResumeListItem,
} from './resume';

// Config operations
export {
  fetchLlmConfig,
  fetchLlmApiKey,
  updateLlmConfig,
  updateLlmApiKey,
  testLlmConnection,
  fetchCLIProxyModels,
  fetchSystemStatus,
  PROVIDER_INFO,
  fetchPromptConfig,
  fetchPromptCatalog,
  putSharedRulesOverride,
  deleteSharedRulesOverride,
  fetchCritiqueConfig,
  updateCritiqueConfig,
  fetchModelOverrides,
  updateModelOverrides,
  updatePromptConfig,
  type AIRoute,
  type CLIProxyProviderFilter,
  type CLIProxyQuickProfile,
  type CLIProxyConfig,
  type CLIProxyModelOption,
  type CLIProxyModelsResponse,
  type LLMProvider,
  type LLMConfig,
  type LLMConfigUpdate,
  type DatabaseStats,
  type SystemStatus,
  type LLMHealthCheck,
  type PromptOption,
  type PromptConfig,
  type PromptConfigUpdate,
  type PromptCatalogEntry,
  type PromptCatalogResponse,
  type PromptCatalogSection,
  type PromptCatalogPolicy,
  type PromptManagerEntry,
  type PromptVariable,
  type SharedRuleEntry,
  type SharedRuleOverrideSuccess,
  type CritiqueConfig,
  type ModelOverridesResponse,
} from './config';

// LLM observability
export {
  fetchLlmCalls,
  fetchLlmCallSummary,
  type LLMCallRecord,
  type LLMCallSummary,
  type LLMOperationSummary,
  type FetchLLMCallsParams,
  type FetchLLMCallSummaryParams,
} from './llm';
