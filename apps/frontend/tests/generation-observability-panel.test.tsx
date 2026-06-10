import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenerationObservabilityPanel } from '@/components/builder/generation-observability-panel';
import { LanguageProvider } from '@/lib/context/language-context';

const fetchLlmCallSummary = vi.fn();
const fetchLlmCalls = vi.fn();
const fetchGenerationRunTimingDetails = vi.fn();
const fetchLanguageConfig = vi.fn();
const updateLanguageConfig = vi.fn();

function renderPanel(props: React.ComponentProps<typeof GenerationObservabilityPanel>) {
  return render(
    <LanguageProvider>
      <GenerationObservabilityPanel {...props} />
    </LanguageProvider>
  );
}

vi.mock('@/lib/api/llm', () => ({
  fetchLlmCallSummary: (...args: unknown[]) => fetchLlmCallSummary(...args),
  fetchLlmCalls: (...args: unknown[]) => fetchLlmCalls(...args),
}));

vi.mock('@/lib/api/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/config')>();
  return {
    ...actual,
    fetchLanguageConfig: (...args: unknown[]) => fetchLanguageConfig(...args),
    updateLanguageConfig: (...args: unknown[]) => updateLanguageConfig(...args),
    fetchGenerationRunTimingDetails: (...args: unknown[]) =>
      fetchGenerationRunTimingDetails(...args),
  };
});

describe('GenerationObservabilityPanel', () => {
  beforeEach(() => {
    fetchLlmCallSummary.mockReset();
    fetchLlmCalls.mockReset();
    fetchGenerationRunTimingDetails.mockReset();
    fetchLanguageConfig.mockReset();
    updateLanguageConfig.mockReset();

    fetchLanguageConfig.mockResolvedValue({
      ui_language: 'en',
      content_language: 'en',
      supported_languages: ['en'],
    });
    updateLanguageConfig.mockResolvedValue({
      ui_language: 'en',
      content_language: 'en',
      supported_languages: ['en'],
    });

    fetchLlmCallSummary.mockResolvedValue({
      trace_id: 'trace-123',
      total_calls: 1,
      successful_calls: 1,
      failed_calls: 0,
      latency_total_ms: 1200,
      input_tokens: 800,
      output_tokens: 300,
      total_tokens: 1100,
      estimated_cost_usd: 0.0032,
      usage_backed_calls: 1,
      estimated_calls: 0,
      operations: [
        {
          operation: 'resume_generate_full',
          calls: 1,
          successes: 1,
          failures: 0,
          latency_total_ms: 1200,
          input_tokens: 800,
          output_tokens: 300,
          total_tokens: 1100,
          estimated_cost_usd: 0.0032,
        },
      ],
    });

    fetchLlmCalls.mockResolvedValue([
      {
        llm_call_id: 'call-1',
        call_group_id: 'group-1',
        trace_id: 'trace-123',
        operation: 'resume_generate_full',
        provider: 'gemini',
        model: 'gemini/gemini-2.5-flash',
        model_name: 'gemini-2.5-flash',
        request_kind: 'text',
        success: true,
        attempt: 1,
        json_mode: false,
        latency_ms: 1200,
        finish_reason: 'stop',
        prompt_chars: 1000,
        total_tokens: 1100,
        prompt_preview: 'Tailor this resume for the role.',
        response_preview: '=== SUMMARY ===',
        created_at: '2026-04-02T00:00:01Z',
      },
    ]);

    fetchGenerationRunTimingDetails.mockResolvedValue([
      {
        generation_run_id: 'run-123',
        run_kind: 'application_pack_preview',
        status: 'completed',
        total_duration_ms: 4500,
        total_events: 2,
        llm_total_calls: 1,
        llm_latency_total_ms: 1200,
        llm_total_tokens: 1100,
        llm_estimated_cost_usd: 0.0032,
        process_timings: [
          {
            process_key: 'tailoring / generate_full_resume',
            host_event: 'tailoring',
            sub_event: 'generate_full_resume',
            duration_ms: 1200,
            event_count: 1,
          },
        ],
      },
    ]);
  });

  it('loads only the linked trace and generation run', async () => {
    renderPanel({ traceId: 'trace-123', generationRunId: 'run-123' });

    await waitFor(() =>
      expect(fetchLlmCalls).toHaveBeenCalledWith({ traceId: 'trace-123', limit: 500 })
    );
    expect(fetchLlmCallSummary).toHaveBeenCalledWith({ traceId: 'trace-123' });
    expect(fetchGenerationRunTimingDetails).toHaveBeenCalledWith({
      generationRunId: 'run-123',
      limit: 1,
    });

    expect(await screen.findByText('resume_generate_full')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(screen.getByText('tailoring / generate_full_resume')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Raw Prompts' }));
    expect(screen.getByText('Tailor this resume for the role.')).toBeInTheDocument();
    expect(screen.getByText('=== SUMMARY ===')).toBeInTheDocument();
  });

  it('shows a clear empty state when no generation unit is linked', () => {
    renderPanel({ traceId: null, generationRunId: null });

    expect(screen.getByText(/No generation trace is linked/)).toBeInTheDocument();
    expect(fetchLlmCalls).not.toHaveBeenCalled();
    expect(fetchGenerationRunTimingDetails).not.toHaveBeenCalled();
  });

  it('loads resume-linked calls when a resume code is available', async () => {
    fetchLlmCalls.mockImplementation((params: { traceId?: string }) => {
      if (params.traceId) {
        return Promise.resolve([
          {
            llm_call_id: 'call-current',
            call_group_id: 'group-current',
            trace_id: 'trace-123',
            operation: 'resume_generate_full',
            provider: 'gemini',
            model: 'gemini/gemini-2.5-flash',
            model_name: 'gemini-2.5-flash',
            request_kind: 'text',
            success: true,
            attempt: 1,
            json_mode: false,
            latency_ms: 1200,
            finish_reason: 'stop',
            prompt_chars: 1000,
            total_tokens: 1100,
            prompt_preview: 'Current generation prompt.',
            response_preview: '=== SUMMARY ===',
            created_at: '2026-04-02T00:00:01Z',
          },
        ]);
      }
      return Promise.resolve([
        {
          llm_call_id: 'call-old',
          call_group_id: 'group-old',
          trace_id: 'trace-old',
          operation: 'resume_generate_full',
          provider: 'gemini',
          model: 'gemini/gemini-2.5-flash',
          model_name: 'gemini-2.5-flash',
          request_kind: 'text',
          success: true,
          attempt: 1,
          json_mode: false,
          latency_ms: 2400,
          finish_reason: 'stop',
          prompt_chars: 900,
          total_tokens: 1000,
          prompt_preview: 'Old generation prompt.',
          response_preview: 'old response',
          created_at: '2026-04-01T00:00:01Z',
        },
        {
          llm_call_id: 'call-current',
          call_group_id: 'group-current',
          trace_id: 'trace-123',
          operation: 'resume_generate_full',
          provider: 'gemini',
          model: 'gemini/gemini-2.5-flash',
          model_name: 'gemini-2.5-flash',
          request_kind: 'text',
          success: true,
          attempt: 1,
          json_mode: false,
          latency_ms: 1200,
          finish_reason: 'stop',
          prompt_chars: 1000,
          total_tokens: 1100,
          prompt_preview: 'Current generation prompt.',
          response_preview: '=== SUMMARY ===',
          created_at: '2026-04-02T00:00:01Z',
        },
      ]);
    });

    renderPanel({
      traceId: 'trace-123',
      generationRunId: 'run-123',
      resumeId: 'res-123',
      resumeCode: 'ABC123',
    });

    await waitFor(() =>
      expect(fetchLlmCalls).toHaveBeenCalledWith({ traceId: 'trace-123', limit: 500 })
    );
    expect(fetchLlmCalls).toHaveBeenCalledWith({
      resumeCode: 'ABC123',
      resumeId: 'res-123',
      limit: 500,
    });
    expect(fetchLlmCallSummary).toHaveBeenCalledWith({ traceId: 'trace-123' });

    fireEvent.click(screen.getByRole('button', { name: 'Raw Prompts' }));
    expect(await screen.findByText('Current generation prompt.')).toBeInTheDocument();
    expect(screen.queryByText('Old generation prompt.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trace' }));
    expect(await screen.findByText('Archived Generation Requests')).toBeInTheDocument();
    expect(screen.getByText(/trace-old/)).toBeInTheDocument();
  });
});
