import { apiFetch } from './client';

export interface LLMCallRecord {
  llm_call_id: string;
  call_group_id: string;
  trace_id?: string | null;
  request_scope?: string | null;
  operation: string;
  provider: string;
  model: string;
  model_name: string;
  response_model?: string | null;
  request_kind: string;
  success: boolean;
  attempt: number;
  max_tokens?: number | null;
  temperature?: number | null;
  reasoning_effort?: string | null;
  json_mode: boolean;
  latency_ms?: number | null;
  finish_reason?: string | null;
  prompt_chars: number;
  prompt_tokens_est?: number | null;
  response_chars?: number | null;
  response_tokens_est?: number | null;
  usage_input_tokens?: number | null;
  usage_output_tokens?: number | null;
  usage_total_tokens?: number | null;
  estimated_input_cost_usd?: number | null;
  estimated_output_cost_usd?: number | null;
  estimated_total_cost_usd?: number | null;
  error_type?: string | null;
  error_message?: string | null;
  prompt_preview?: string | null;
  response_preview?: string | null;
  request_context?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
}

export interface LLMOperationSummary {
  operation: string;
  calls: number;
  successes: number;
  failures: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface LLMCallSummary {
  trace_id?: string | null;
  request_scope?: string | null;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  usage_backed_calls: number;
  estimated_calls: number;
  operations: LLMOperationSummary[];
}

interface LLMCallListResponse {
  request_id: string;
  data: LLMCallRecord[];
}

interface LLMCallSummaryResponse {
  request_id: string;
  data: LLMCallSummary;
}

export interface FetchLLMCallsParams {
  traceId?: string;
  callGroupId?: string;
  requestScope?: string;
  operation?: string;
  success?: boolean;
  limit?: number;
}

export interface FetchLLMCallSummaryParams {
  traceId?: string;
  requestScope?: string;
}

function appendQueryParam(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined | null
) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  params.set(key, String(value));
}

async function parseJsonResponse<T>(response: Response, errorPrefix: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${errorPrefix} (status ${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}

export async function fetchLlmCalls(params: FetchLLMCallsParams = {}): Promise<LLMCallRecord[]> {
  const query = new URLSearchParams();
  appendQueryParam(query, 'trace_id', params.traceId);
  appendQueryParam(query, 'call_group_id', params.callGroupId);
  appendQueryParam(query, 'request_scope', params.requestScope);
  appendQueryParam(query, 'operation', params.operation);
  appendQueryParam(query, 'success', params.success);
  appendQueryParam(query, 'limit', params.limit ?? 100);

  const response = await apiFetch(`/llm/calls?${query.toString()}`);
  const payload = await parseJsonResponse<LLMCallListResponse>(
    response,
    'Failed to load LLM calls'
  );
  return payload.data;
}

export async function fetchLlmCallSummary(
  params: FetchLLMCallSummaryParams = {}
): Promise<LLMCallSummary> {
  const query = new URLSearchParams();
  appendQueryParam(query, 'trace_id', params.traceId);
  appendQueryParam(query, 'request_scope', params.requestScope);

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiFetch(`/llm/calls/summary${suffix}`);
  const payload = await parseJsonResponse<LLMCallSummaryResponse>(
    response,
    'Failed to load LLM summary'
  );
  return payload.data;
}
