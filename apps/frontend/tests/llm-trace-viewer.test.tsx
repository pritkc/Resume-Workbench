import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LLMTraceViewer } from '@/components/observability/llm-trace-viewer';
import { LanguageProvider } from '@/lib/context/language-context';

vi.mock('@/lib/api/config', () => ({
  fetchLanguageConfig: vi.fn(async () => ({
    content_language: 'en',
    ui_language: 'en',
  })),
  updateLanguageConfig: vi.fn(async () => ({})),
}));

const fetchLlmCallSummary = vi.fn();
const fetchLlmCalls = vi.fn();

vi.mock('@/lib/api/llm', () => ({
  fetchLlmCallSummary: (...args: unknown[]) => fetchLlmCallSummary(...args),
  fetchLlmCalls: (...args: unknown[]) => fetchLlmCalls(...args),
}));

function renderWithLanguage(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('LLMTraceViewer', () => {
  beforeEach(() => {
    fetchLlmCallSummary.mockReset();
    fetchLlmCalls.mockReset();

    fetchLlmCallSummary.mockResolvedValue({
      trace_id: 'trace-123',
      request_scope: 'resumes.improve_preview',
      total_calls: 2,
      successful_calls: 1,
      failed_calls: 1,
      input_tokens: 1200,
      output_tokens: 800,
      total_tokens: 2000,
      estimated_cost_usd: 0.0042,
      usage_backed_calls: 2,
      estimated_calls: 0,
      operations: [
        {
          operation: 'resume_generate_diffs',
          calls: 2,
          successes: 1,
          failures: 1,
          input_tokens: 1200,
          output_tokens: 800,
          total_tokens: 2000,
          estimated_cost_usd: 0.0042,
        },
      ],
    });

    fetchLlmCalls.mockResolvedValue([
      {
        llm_call_id: 'call-1',
        call_group_id: 'group-1',
        trace_id: 'trace-123',
        request_scope: 'resumes.improve_preview',
        operation: 'resume_generate_diffs',
        provider: 'gemini',
        model: 'gemini/gemini-2.5-flash',
        model_name: 'gemini-2.5-flash',
        response_model: null,
        request_kind: 'json',
        success: false,
        attempt: 1,
        max_tokens: 8192,
        temperature: 0.2,
        reasoning_effort: null,
        json_mode: true,
        latency_ms: 1100,
        finish_reason: 'length',
        prompt_chars: 1500,
        prompt_tokens_est: 375,
        response_chars: 300,
        response_tokens_est: 75,
        usage_input_tokens: 390,
        usage_output_tokens: 80,
        usage_total_tokens: 470,
        estimated_input_cost_usd: 0.0001,
        estimated_output_cost_usd: 0.0002,
        estimated_total_cost_usd: 0.0003,
        error_type: 'ValueError',
        error_message: 'No JSON found in response',
        prompt_preview: 'Resume JSON...',
        response_preview: '{"changes": [',
        request_context: {
          job_id: 'job-123',
          compact_diff_validation: {
            phase: 'primary_tailor',
            valid: false,
            errors: ['experience[0]: why is required'],
            warnings: [],
            error_count: 1,
            warning_count: 0,
            origin: 'orchestration fixture line',
          },
        },
        created_at: '2026-04-02T00:00:01Z',
        updated_at: '2026-04-02T00:00:01Z',
        completed_at: '2026-04-02T00:00:02Z',
      },
      {
        llm_call_id: 'call-2',
        call_group_id: 'group-1',
        trace_id: 'trace-123',
        request_scope: 'resumes.improve_preview',
        operation: 'resume_generate_diffs',
        provider: 'gemini',
        model: 'gemini/gemini-2.5-flash',
        model_name: 'gemini-2.5-flash',
        response_model: null,
        request_kind: 'json',
        success: true,
        attempt: 2,
        max_tokens: 8192,
        temperature: 0.2,
        reasoning_effort: null,
        json_mode: true,
        latency_ms: 980,
        finish_reason: 'stop',
        prompt_chars: 1500,
        prompt_tokens_est: 375,
        response_chars: 800,
        response_tokens_est: 200,
        usage_input_tokens: 410,
        usage_output_tokens: 220,
        usage_total_tokens: 630,
        estimated_input_cost_usd: 0.0001,
        estimated_output_cost_usd: 0.0005,
        estimated_total_cost_usd: 0.0006,
        error_type: null,
        error_message: null,
        prompt_preview: 'Resume JSON...',
        response_preview: '{"changes": []}',
        request_context: { job_id: 'job-123' },
        created_at: '2026-04-02T00:00:03Z',
        updated_at: '2026-04-02T00:00:03Z',
        completed_at: '2026-04-02T00:00:04Z',
      },
    ]);
  });

  it('loads a trace and renders summary plus timeline cards', async () => {
    renderWithLanguage(<LLMTraceViewer initialTraceId="trace-123" defaultAutoRefresh={false} />);

    await waitFor(() =>
      expect(fetchLlmCallSummary).toHaveBeenCalledWith({
        traceId: 'trace-123',
        resumeCode: undefined,
        resumeId: undefined,
        requestScope: undefined,
      })
    );
    expect(fetchLlmCalls).toHaveBeenCalledWith({
      traceId: 'trace-123',
      resumeCode: undefined,
      resumeId: undefined,
      requestScope: undefined,
      success: undefined,
      limit: 100,
    });

    expect((await screen.findAllByText('resume_generate_diffs')).length).toBeGreaterThan(0);
    expect(screen.getByText('Chronological trace flow')).toBeInTheDocument();
    expect(screen.getByText(/No JSON found in response/)).toBeInTheDocument();
    expect(screen.getByText(/Response: 300 total chars/)).toBeInTheDocument();
    expect(screen.getAllByText(/stored preview is truncated/).length).toBeGreaterThan(0);

    expect(screen.getByText('Compact envelope validation')).toBeInTheDocument();
    expect(screen.getAllByText(/orchestration fixture line/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/experience\[0\]: why is required/).length).toBeGreaterThanOrEqual(
      1
    );

    fireEvent.click(screen.getAllByText(/Prompt & response previews/)[0]);

    await waitFor(() => expect(screen.getAllByText('Resume JSON...').length).toBeGreaterThan(0));
  });

  it('applies request scope filters from the form', async () => {
    renderWithLanguage(<LLMTraceViewer defaultAutoRefresh={false} />);

    await waitFor(() => expect(fetchLlmCalls).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Request scope'), {
      target: { value: 'resumes.improve_confirm' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'success' }));
    fireEvent.click(screen.getByRole('button', { name: '25' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(fetchLlmCallSummary).toHaveBeenLastCalledWith({
        traceId: undefined,
        resumeCode: undefined,
        resumeId: undefined,
        requestScope: 'resumes.improve_confirm',
      })
    );
    expect(fetchLlmCalls).toHaveBeenLastCalledWith({
      traceId: undefined,
      resumeCode: undefined,
      resumeId: undefined,
      requestScope: 'resumes.improve_confirm',
      success: true,
      limit: 25,
    });
  });

  it('applies resume code filters from the form', async () => {
    renderWithLanguage(<LLMTraceViewer initialResumeCode="ABC123" defaultAutoRefresh={false} />);

    await waitFor(() =>
      expect(fetchLlmCallSummary).toHaveBeenCalledWith({
        traceId: undefined,
        resumeCode: 'ABC123',
        resumeId: undefined,
        requestScope: undefined,
      })
    );
    expect(fetchLlmCalls).toHaveBeenCalledWith({
      traceId: undefined,
      resumeCode: 'ABC123',
      resumeId: undefined,
      requestScope: undefined,
      success: undefined,
      limit: 100,
    });
    expect(screen.getByText('All calls linked to this resume')).toBeInTheDocument();
  });
});
