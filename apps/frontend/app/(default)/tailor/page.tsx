'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { Textarea } from '@/components/ui/textarea';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  uploadJobDescriptions,
  startLivePreview,
  subscribeLivePreviewEvents,
  fetchLivePreviewResult,
  cancelLivePreview,
  confirmImproveResume,
  ImproveApiError,
  fetchResumeList,
  getActiveResume,
  type LiveGenerationEvent,
  type ResumeListItem,
} from '@/lib/api/resume';
import { normalizeRenderThemeSettings, type RenderThemeSettings } from '@/lib/types/render-theme';
import {
  fetchGenerationDefaults,
  fetchPromptConfig,
  updateGenerationDefaults,
  type PromptOption,
} from '@/lib/api/config';
import { Dropdown } from '@/components/ui/dropdown';
import { useStatusCache } from '@/lib/context/status-cache';
import { Loader2, ArrowLeft, AlertTriangle, Settings, Activity } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const GENERATION_DEFAULTS_STORAGE_KEY = 'resume_tailor_generation_defaults';
const ACTIVE_RESUME_STORAGE_KEY = 'active_resume_id';
const LEGACY_MASTER_RESUME_STORAGE_KEY = 'master_resume_id';

function messageFromImproveFailure(err: unknown, fallback: string): string {
  if (err instanceof ImproveApiError) return err.message;
  return fallback;
}

function migrateLegacyTailorStorage(): void {
  if (typeof window === 'undefined') return;
  const legacy = localStorage.getItem(LEGACY_MASTER_RESUME_STORAGE_KEY);
  if (legacy && !localStorage.getItem(ACTIVE_RESUME_STORAGE_KEY)) {
    localStorage.setItem(ACTIVE_RESUME_STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_MASTER_RESUME_STORAGE_KEY);
  }
}

const PROMPT_ID_MIGRATION: Record<string, string> = {
  nudge: 'lite',
  light: 'lite',
  keywords: 'full',
};

type StoredGenerationDefaults = {
  prompt_id: string;
};

function readStoredGenerationDefaults(): StoredGenerationDefaults | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(GENERATION_DEFAULTS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredGenerationDefaults>;
    if (typeof parsed.prompt_id !== 'string' || !parsed.prompt_id.trim()) {
      return null;
    }

    const pid = PROMPT_ID_MIGRATION[parsed.prompt_id] ?? parsed.prompt_id;
    return {
      prompt_id: pid,
    };
  } catch {
    window.localStorage.removeItem(GENERATION_DEFAULTS_STORAGE_KEY);
    return null;
  }
}

function storeGenerationDefaults(defaults: StoredGenerationDefaults) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(GENERATION_DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

type GenerateStage = 'idle' | 'uploading' | 'tailoring';

type LiveSectionDraft = {
  section_id: string;
  section: string;
  index?: number | null;
  content: string;
  updated_at: string;
};

type LiveTimingRow = {
  key: string;
  host_event: string;
  sub_event?: string | null;
  duration_ms: number;
  at: string;
};

type LiveStreamKind = 'jd_intel' | 'resume_output';

type LiveGenerationState = {
  liveRunId?: string;
  generationRunId?: string;
  traceId?: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage?: string;
  currentOperation?: string;
  currentModel?: string;
  currentPromptId?: string;
  currentPromptHash?: string;
  currentSystemPromptHash?: string | null;
  currentReasoningEffort?: string | null;
  promptChars?: number;
  promptTokensEst?: number;
  timeToFirstTokenMs?: number | null;
  responseChars?: number;
  errorMessage?: string;
  sections: Record<string, LiveSectionDraft>;
  timings: LiveTimingRow[];
  events: LiveGenerationEvent[];
  streams: Record<LiveStreamKind, string>;
};

const EMPTY_LIVE_STATE: LiveGenerationState = {
  status: 'idle',
  sections: {},
  timings: [],
  events: [],
  streams: {
    jd_intel: '',
    resume_output: '',
  },
};

type FrontendTimingSnapshot = {
  flowStartedAt: string;
  flowEndedAt: string;
  totalDurationMs: number;
  uploadStartedAt: string;
  uploadEndedAt: string;
  uploadDurationMs: number;
  previewRequestStartedAt: string;
  previewRequestEndedAt: string;
  previewRequestDurationMs: number;
};

function appendFrontendPipelineTiming(
  result: ImprovedResult,
  snapshot: FrontendTimingSnapshot
): ImprovedResult {
  const existing = result.data.pipeline_timing;
  const frontendEntries = [
    {
      host_event: 'frontend',
      sub_event: 'upload_job_description',
      started_at: snapshot.uploadStartedAt,
      ended_at: snapshot.uploadEndedAt,
      duration_ms: Math.max(0, snapshot.uploadDurationMs),
      metadata: null,
    },
    {
      host_event: 'frontend',
      sub_event: 'preview_request',
      started_at: snapshot.previewRequestStartedAt,
      ended_at: snapshot.previewRequestEndedAt,
      duration_ms: Math.max(0, snapshot.previewRequestDurationMs),
      metadata: null,
    },
    {
      host_event: 'frontend',
      sub_event: 'total_flow',
      started_at: snapshot.flowStartedAt,
      ended_at: snapshot.flowEndedAt,
      duration_ms: Math.max(0, snapshot.totalDurationMs),
      metadata: null,
    },
  ];

  const mergedEntries = [...(existing?.entries ?? []), ...frontendEntries].sort(
    (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)
  );

  const starts = mergedEntries
    .map((entry) => Date.parse(entry.started_at))
    .filter((value) => Number.isFinite(value));
  const ends = mergedEntries
    .map((entry) => Date.parse(entry.ended_at))
    .filter((value) => Number.isFinite(value));

  const startedAtMs =
    starts.length > 0
      ? Math.min(...starts)
      : Date.parse(existing?.started_at ?? snapshot.flowStartedAt);
  const endedAtMs =
    ends.length > 0 ? Math.max(...ends) : Date.parse(existing?.ended_at ?? snapshot.flowEndedAt);

  const startedAtIso = Number.isFinite(startedAtMs)
    ? new Date(startedAtMs).toISOString()
    : snapshot.flowStartedAt;
  const endedAtIso = Number.isFinite(endedAtMs)
    ? new Date(endedAtMs).toISOString()
    : snapshot.flowEndedAt;
  const totalDurationMs =
    Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs
      ? Math.round(endedAtMs - startedAtMs)
      : Math.max(snapshot.totalDurationMs, existing?.total_duration_ms ?? 0);

  return {
    ...result,
    data: {
      ...result.data,
      pipeline_timing: {
        started_at: startedAtIso,
        ended_at: endedAtIso,
        total_duration_ms: totalDurationMs,
        entries: mergedEntries,
      },
    },
  };
}

function formatLiveDuration(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'N/A';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function isLiveStreamKind(value: unknown): value is LiveStreamKind {
  return value === 'jd_intel' || value === 'resume_output';
}

function TypingStreamText({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState('');
  const targetRef = useRef(text);
  const displayLengthRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = text;
    if (displayLengthRef.current > text.length) {
      displayLengthRef.current = text.length;
      setDisplayText(text);
    }

    const tick = () => {
      const target = targetRef.current;
      const remaining = target.length - displayLengthRef.current;
      if (remaining <= 0) {
        frameRef.current = null;
        return;
      }
      const step = Math.min(48, Math.max(2, Math.ceil(remaining / 12)));
      displayLengthRef.current = Math.min(target.length, displayLengthRef.current + step);
      setDisplayText(target.slice(0, displayLengthRef.current));
      frameRef.current = window.requestAnimationFrame(tick);
    };

    if (frameRef.current == null) {
      frameRef.current = window.requestAnimationFrame(tick);
    }

    return () => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [text]);

  return (
    <pre className="min-h-[140px] whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-800">
      {displayText}
      {displayText.length < text.length ? <span className="animate-pulse">|</span> : null}
    </pre>
  );
}

function LiveGenerationPanel({
  state,
  elapsed,
  onCancel,
}: {
  state: LiveGenerationState;
  elapsed: number;
  onCancel: () => void;
}) {
  const currentProcess = state.currentStage || state.currentOperation || state.status;
  const hasJdStream = state.streams.jd_intel.trim().length > 0;
  const hasResumeStream = state.streams.resume_output.trim().length > 0;
  const hasAnyStream = hasJdStream || hasResumeStream;
  const waitingForFirstToken =
    state.status === 'running' &&
    Boolean(state.currentOperation) &&
    state.timeToFirstTokenMs == null &&
    !hasResumeStream;

  return (
    <div className="border border-border bg-card shadow-[4px_4px_0px_0px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-3 border-b border-border bg-secondary px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-gray-700">
              Running now
            </p>
          </div>
          <p
            className="truncate font-mono text-sm font-semibold text-gray-950"
            title={currentProcess}
          >
            {currentProcess}
          </p>
          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-gray-600">
            <span>{elapsed}s elapsed</span>
            {state.currentOperation ? <span>Operation: {state.currentOperation}</span> : null}
            {state.currentModel ? <span>Model: {state.currentModel}</span> : null}
            {waitingForFirstToken ? <span>Waiting for first token...</span> : null}
            {state.timeToFirstTokenMs != null ? (
              <span>First token: {formatLiveDuration(state.timeToFirstTokenMs)}</span>
            ) : null}
          </div>
        </div>
        <Button size="xs" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="max-h-[68vh] min-h-[360px] overflow-y-auto bg-[#FAFAF7] p-4">
        <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-gray-600">
          Live data stream
        </p>
        {state.errorMessage && (
          <div className="mb-3 border border-red-300 bg-red-50 p-3 font-mono text-xs text-red-700">
            {state.errorMessage}
          </div>
        )}
        {!hasAnyStream ? (
          <div className="border border-dashed border-border bg-card p-5 font-mono text-sm text-gray-500">
            Connecting to the live stream...
          </div>
        ) : (
          <div className="space-y-3">
            {hasJdStream ? (
              <div className="border border-border bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-primary">
                    JD Intel
                  </p>
                  <span className="font-mono text-[10px] text-gray-400">
                    {state.streams.jd_intel.length} chars
                  </span>
                </div>
                <TypingStreamText text={state.streams.jd_intel} />
              </div>
            ) : null}
            {hasResumeStream ? (
              <div className="border border-border bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-primary">
                    Resume Output
                  </p>
                  <span className="font-mono text-[10px] text-gray-400">
                    {state.streams.resume_output.length} chars
                  </span>
                </div>
                <TypingStreamText text={state.streams.resume_output} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function closeEventSourceRef(ref: React.MutableRefObject<EventSource | null>) {
  const source = ref.current as EventSource | null;
  source?.close();
  ref.current = null;
}

function TailorPageContent() {
  const { t } = useTranslations();
  const [jobDescription, setJobDescription] = useState('');
  const [customPromptInstructions, setCustomPromptInstructions] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceResumeId, setSourceResumeId] = useState<string | null>(null);
  const [resumeOptions, setResumeOptions] = useState<ResumeListItem[]>([]);
  const [resumeListLoading, setResumeListLoading] = useState(true);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('full');
  const [promptLoading, setPromptLoading] = useState(false);
  const hasUserSelectedPrompt = useRef(false);
  const missingDiffConfirmInFlight = useRef(false);

  // Diff preview modal state
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<ImprovedResult | null>(null);
  const [diffConfirmError, setDiffConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showMissingDiffDialog, setShowMissingDiffDialog] = useState(false);
  const [missingDiffResult, setMissingDiffResult] = useState<ImprovedResult | null>(null);
  const [missingDiffError, setMissingDiffError] = useState<string | null>(null);
  const [generateStage, setGenerateStage] = useState<GenerateStage>('idle');
  const [isGenerationInFlight, setIsGenerationInFlight] = useState(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const [liveState, setLiveState] = useState<LiveGenerationState>(EMPTY_LIVE_STATE);
  const liveEventSourceRef = useRef<EventSource | null>(null);
  const liveRunIdRef = useRef<string | null>(null);
  const jobDescriptionRef = useRef('');
  const customPromptInstructionsRef = useRef('');
  const sourceResumeIdRef = useRef<string | null>(null);

  // Elapsed timer for long operations
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setElapsed(0);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      closeEventSourceRef(liveEventSourceRef);
      generationAbortRef.current?.abort();
    };
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { setImprovedData } = useResumePreview();
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementJobs,
    incrementImprovements,
    incrementResumes,
  } = useStatusCache();

  // Check if LLM is configured
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      migrateLegacyTailorStorage();
      setResumeListLoading(true);
      try {
        const paramSource = searchParams.get('source');
        const { resumes } = await fetchResumeList(true);
        if (cancelled) return;
        setResumeOptions(resumes);
        const fromQuery =
          paramSource && resumes.some((r) => r.resume_id === paramSource) ? paramSource : null;
        const active = await getActiveResume();
        if (cancelled) return;
        const storedId = localStorage.getItem(ACTIVE_RESUME_STORAGE_KEY);
        const fallbackActive = resumes.find((r) => r.is_active)?.resume_id ?? null;
        const resolved =
          fromQuery ??
          (active && resumes.some((r) => r.resume_id === active.resume_id)
            ? active.resume_id
            : null) ??
          (storedId && resumes.some((r) => r.resume_id === storedId) ? storedId : null) ??
          fallbackActive ??
          resumes[0]?.resume_id ??
          null;
        if (!resolved) {
          router.push('/dashboard');
          return;
        }
        sourceResumeIdRef.current = resolved;
        setSourceResumeId(resolved);
        localStorage.setItem(ACTIVE_RESUME_STORAGE_KEY, resolved);
      } catch {
        if (!cancelled) router.push('/dashboard');
      } finally {
        if (!cancelled) setResumeListLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    const localDefaults = readStoredGenerationDefaults();

    if (localDefaults && !hasUserSelectedPrompt.current) {
      setSelectedPromptId(localDefaults.prompt_id);
    }

    const loadPromptConfig = async () => {
      setPromptLoading(true);
      try {
        const [config, generationDefaults] = await Promise.all([
          fetchPromptConfig(),
          fetchGenerationDefaults().catch(() => null),
        ]);
        if (!cancelled) {
          setPromptOptions(config.prompt_options || []);
          const resolvedDefaults = generationDefaults ?? localDefaults;

          if (resolvedDefaults) {
            storeGenerationDefaults({ prompt_id: resolvedDefaults.prompt_id });
          }

          if (!hasUserSelectedPrompt.current) {
            setSelectedPromptId(resolvedDefaults?.prompt_id || config.default_prompt_id || 'full');
          }
        }
      } catch (err) {
        console.error('Failed to load prompt config', err);
        if (!cancelled && !hasUserSelectedPrompt.current && localDefaults?.prompt_id) {
          setSelectedPromptId(localDefaults.prompt_id);
        }
      } finally {
        if (!cancelled) {
          setPromptLoading(false);
        }
      }
    };

    loadPromptConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  const buildConfirmPayload = (result: ImprovedResult) => {
    const resumeId = sourceResumeIdRef.current || sourceResumeId;
    if (!resumeId) {
      throw new Error('Source resume ID is missing.');
    }
    const resumePreview = result.data.resume_preview;
    if (!resumePreview || typeof resumePreview !== 'object' || Array.isArray(resumePreview)) {
      throw new Error('Resume preview data is invalid.');
    }
    const previewRecord = resumePreview as unknown as Record<string, unknown>;
    if (
      !previewRecord.personalInfo ||
      typeof previewRecord.personalInfo !== 'object' ||
      Array.isArray(previewRecord.personalInfo)
    ) {
      throw new Error('Resume preview data is invalid.');
    }
    const boldKeywords = result.data.bold_keywords ?? [];
    const previewTheme = result.data.theme_settings;
    const normalizedBase = normalizeRenderThemeSettings(previewTheme ?? undefined);

    let theme_settings: RenderThemeSettings | undefined;
    if (boldKeywords.length > 0) {
      theme_settings = normalizeRenderThemeSettings({
        ...normalizedBase,
        bold_keywords: true,
        settings: {
          ...normalizedBase.settings,
          bold_keywords: boldKeywords,
        },
      });
    } else if (previewTheme != null) {
      theme_settings = normalizedBase;
    }

    return {
      resume_id: resumeId,
      job_id: result.data.job_id,
      improved_data: resumePreview as ResumeData,
      improvements:
        result.data.improvements?.map((item) => ({
          suggestion: item.suggestion,
          lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : null,
        })) ?? [],
      application_pack_id: result.data.application_pack_id ?? null,
      generation_run_id: result.data.generation_run_id ?? null,
      include_cover_letter: false,
      include_outreach_message: false,
      ...(theme_settings !== undefined ? { theme_settings } : {}),
    };
  };

  const confirmAndNavigate = async (result: ImprovedResult) => {
    const confirmed = await confirmImproveResume(buildConfirmPayload(result));
    incrementImprovements();
    incrementResumes();

    // Preserve bold_keywords from preview: the confirm endpoint doesn't re-run the LLM
    // so it won't produce bold_keywords. Carry them forward so the builder can apply them.
    const boldKeywords = result.data.bold_keywords;
    const augmented: ImprovedResult =
      boldKeywords && boldKeywords.length > 0
        ? { ...confirmed, data: { ...confirmed.data, bold_keywords: boldKeywords } }
        : confirmed;
    setImprovedData(augmented);

    const newResumeId = confirmed?.data?.resume_id;
    if (newResumeId) {
      router.push(`/builder?id=${newResumeId}`);
    } else {
      router.push('/builder');
    }
  };

  const getGenerateValidationError = (trimmedDescription: string) => {
    if (!trimmedDescription) return null;
    if (trimmedDescription.length < 50) {
      return t('tailor.errors.jobDescriptionTooShort');
    }
    return null;
  };

  const applyLiveEvent = useCallback((event: LiveGenerationEvent) => {
    setLiveState((current) => {
      const next: LiveGenerationState = {
        ...current,
        liveRunId: event.live_run_id,
        generationRunId: event.generation_run_id,
        traceId: event.trace_id,
        events: [...current.events, event].slice(-80),
      };
      const data = event.data || {};

      if (event.type === 'run.started') {
        next.status = 'running';
        next.currentPromptId =
          typeof data.prompt_id === 'string' ? data.prompt_id : current.currentPromptId;
      } else if (event.type === 'stage.started') {
        next.status = 'running';
        next.currentStage =
          typeof data.stage_label === 'string'
            ? data.stage_label
            : typeof data.host_event === 'string'
              ? data.host_event
              : current.currentStage;
      } else if (event.type === 'llm.started') {
        next.status = 'running';
        next.currentOperation =
          typeof data.operation === 'string' ? data.operation : current.currentOperation;
        next.currentModel =
          typeof data.model_name === 'string'
            ? data.model_name
            : typeof data.model === 'string'
              ? data.model
              : current.currentModel;
        next.currentPromptId =
          typeof data.prompt_id === 'string' ? data.prompt_id : current.currentPromptId;
        next.currentPromptHash =
          typeof data.prompt_hash === 'string' ? data.prompt_hash : current.currentPromptHash;
        next.currentSystemPromptHash =
          typeof data.system_prompt_hash === 'string'
            ? data.system_prompt_hash
            : current.currentSystemPromptHash;
        next.currentReasoningEffort =
          typeof data.reasoning_effort === 'string'
            ? data.reasoning_effort
            : current.currentReasoningEffort;
        next.promptChars =
          typeof data.prompt_chars === 'number' ? data.prompt_chars : current.promptChars;
        next.promptTokensEst =
          typeof data.prompt_tokens_est === 'number'
            ? data.prompt_tokens_est
            : current.promptTokensEst;
      } else if (event.type === 'llm.delta') {
        const textDelta = typeof data.text_delta === 'string' ? data.text_delta : '';
        const streamKind = isLiveStreamKind(data.stream_kind) ? data.stream_kind : null;
        if (streamKind && textDelta) {
          next.streams = {
            ...current.streams,
            [streamKind]: `${current.streams[streamKind]}${textDelta}`,
          };
        }
      } else if (event.type === 'llm.completed') {
        next.timeToFirstTokenMs =
          typeof data.time_to_first_token_ms === 'number'
            ? data.time_to_first_token_ms
            : current.timeToFirstTokenMs;
        next.responseChars =
          typeof data.response_chars === 'number' ? data.response_chars : current.responseChars;
        if (data.success === false) {
          next.errorMessage =
            typeof data.error_type === 'string' ? data.error_type : 'LLM step failed.';
        }
      } else if (event.type === 'section.updated') {
        const sectionId = typeof data.section_id === 'string' ? data.section_id : null;
        const content = typeof data.content === 'string' ? data.content : null;
        if (sectionId && content) {
          next.sections = {
            ...current.sections,
            [sectionId]: {
              section_id: sectionId,
              section: typeof data.section === 'string' ? data.section : sectionId,
              index: typeof data.index === 'number' ? data.index : null,
              content,
              updated_at: event.at,
            },
          };
          if (sectionId === 'jd_intel' && !current.streams.jd_intel) {
            next.streams = {
              ...next.streams,
              jd_intel: content,
            };
          }
        }
      } else if (event.type === 'timing.entry') {
        const entry = data.entry;
        if (entry && typeof entry === 'object') {
          const row = entry as Record<string, unknown>;
          const hostEvent = typeof row.host_event === 'string' ? row.host_event : 'unknown';
          const subEvent = typeof row.sub_event === 'string' ? row.sub_event : null;
          next.timings = [
            ...current.timings,
            {
              key: `${event.sequence}-${hostEvent}-${subEvent || ''}`,
              host_event: hostEvent,
              sub_event: subEvent,
              duration_ms: typeof row.duration_ms === 'number' ? row.duration_ms : 0,
              at: event.at,
            },
          ].slice(-120);
        }
      } else if (event.type === 'run.completed') {
        next.status = 'completed';
        next.currentStage = 'Completed';
      } else if (event.type === 'run.failed') {
        next.status = 'failed';
        next.errorMessage =
          typeof data.message === 'string' ? data.message : 'Live preview failed.';
      } else if (event.type === 'run.cancelled') {
        next.status = 'cancelled';
        next.currentStage = 'Cancelled';
      }

      return next;
    });
  }, []);

  const waitForLivePreview = useCallback(
    (liveRunId: string, signal?: AbortSignal): Promise<ImprovedResult> =>
      new Promise((resolve, reject) => {
        let settled = false;
        let retriedResult = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          closeEventSourceRef(liveEventSourceRef);
          signal?.removeEventListener('abort', abortHandler);
          fn();
        };
        const fetchResult = async () => {
          try {
            const finalResult = await fetchLivePreviewResult(liveRunId);
            settle(() => resolve(finalResult));
          } catch (resultError) {
            settle(() => reject(resultError));
          }
        };
        const abortHandler = () => {
          void cancelLivePreview(liveRunId).catch(() => undefined);
          settle(() => reject(new DOMException('Aborted', 'AbortError')));
        };
        signal?.addEventListener('abort', abortHandler, { once: true });

        const source = subscribeLivePreviewEvents(liveRunId, {
          onEvent: (event) => {
            applyLiveEvent(event);
            if (event.type === 'run.completed') {
              void fetchResult();
            } else if (event.type === 'run.failed') {
              settle(() =>
                reject(
                  new Error(
                    typeof event.data.message === 'string'
                      ? event.data.message
                      : 'Live preview failed.'
                  )
                )
              );
            } else if (event.type === 'run.cancelled') {
              settle(() => reject(new DOMException('Aborted', 'AbortError')));
            }
          },
          onError: () => {
            if (settled || retriedResult) return;
            retriedResult = true;
            window.setTimeout(() => void fetchResult(), 1200);
          },
        });
        liveEventSourceRef.current = source;
      }),
    [applyLiveEvent]
  );

  const runGenerate = async (resumeId: string, description: string) => {
    try {
      const flowStartedAt = new Date().toISOString();
      const flowStartMs = performance.now();
      let uploadStartedAt = flowStartedAt;
      let uploadEndedAt = flowStartedAt;
      let uploadDurationMs = 0;
      let previewRequestStartedAt = flowStartedAt;
      let previewRequestEndedAt = flowStartedAt;
      let previewRequestDurationMs = 0;

      // 1. Upload Job Description
      // The API expects an array of strings
      setGenerateStage('uploading');
      setLiveState({
        ...EMPTY_LIVE_STATE,
        status: 'running',
        currentStage: 'Uploading job description',
      });
      const uploadStartMs = performance.now();
      uploadStartedAt = new Date().toISOString();
      const jobId = await uploadJobDescriptions([description], resumeId, {
        signal: generationAbortRef.current?.signal,
      });
      uploadEndedAt = new Date().toISOString();
      uploadDurationMs = Math.round(performance.now() - uploadStartMs);
      incrementJobs(); // Update cached counter

      // 2. Preview Resume
      setGenerateStage('tailoring');
      setLiveState((current) => ({
        ...current,
        status: 'running',
        currentStage: 'Starting live preview',
      }));
      const previewStartMs = performance.now();
      previewRequestStartedAt = new Date().toISOString();
      const liveStart = await startLivePreview(resumeId, jobId, {
        promptId: selectedPromptId,
        customPromptInstructions:
          (customPromptInstructionsRef.current || customPromptInstructions).trim() || null,
        includeCoverLetter: false,
        includeOutreachMessage: false,
        signal: generationAbortRef.current?.signal,
      });
      liveRunIdRef.current = liveStart.live_run_id;
      setLiveState((current) => ({
        ...current,
        status: 'running',
        currentStage: 'Connecting live stream',
        liveRunId: liveStart.live_run_id,
        generationRunId: liveStart.generation_run_id,
        traceId: liveStart.trace_id,
      }));
      const result = await waitForLivePreview(
        liveStart.live_run_id,
        generationAbortRef.current?.signal
      );
      previewRequestEndedAt = new Date().toISOString();
      previewRequestDurationMs = Math.round(performance.now() - previewStartMs);
      const flowEndedAt = new Date().toISOString();
      const totalDurationMs = Math.round(performance.now() - flowStartMs);
      const resultWithTiming = appendFrontendPipelineTiming(result, {
        flowStartedAt,
        flowEndedAt,
        totalDurationMs,
        uploadStartedAt,
        uploadEndedAt,
        uploadDurationMs,
        previewRequestStartedAt,
        previewRequestEndedAt,
        previewRequestDurationMs,
      });

      if (!resultWithTiming?.data?.diff_summary || !resultWithTiming?.data?.detailed_changes) {
        console.warn('Diff data missing for tailor preview; requesting user confirmation.');
        setDiffConfirmError(null);
        setPendingResult(null);
        setShowDiffModal(false);
        setMissingDiffError(null);
        setMissingDiffResult(resultWithTiming);
        setShowMissingDiffDialog(true);
        return;
      }

      // 3. Show diff preview modal
      setDiffConfirmError(null);
      setMissingDiffError(null);
      setPendingResult(resultWithTiming);
      setShowDiffModal(true);
    } catch (err) {
      if (isAbortError(err)) {
        setError(t('tailor.errors.cancelled'));
        return;
      }
      console.error(err);
      if (err instanceof ImproveApiError) {
        const msgLower = err.message.toLowerCase();
        if (
          msgLower.includes('api key') ||
          msgLower.includes('authentication') ||
          msgLower.includes('unauthorized') ||
          err.status === 401
        ) {
          setError(t('tailor.errors.apiKeyError'));
          return;
        }
        if (err.status === 429 || msgLower.includes('rate limit')) {
          setError(t('tailor.errors.rateLimit'));
          return;
        }
        setError(err.message);
        return;
      }
      const errorMessage = err instanceof Error ? err.message : '';
      if (
        errorMessage.toLowerCase().includes('api key') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('authentication') ||
        errorMessage.includes('401')
      ) {
        setError(t('tailor.errors.apiKeyError'));
      } else if (
        errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.includes('429')
      ) {
        setError(t('tailor.errors.rateLimit'));
      } else {
        setError(t('tailor.errors.failedToPreview'));
      }
    }
  };

  const handleGenerate = async () => {
    const trimmedDescription = (jobDescriptionRef.current || jobDescription).trim();
    const resumeId = sourceResumeIdRef.current || sourceResumeId;
    if (!trimmedDescription || !resumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const nextDefaults: StoredGenerationDefaults = {
      prompt_id: selectedPromptId,
    };
    storeGenerationDefaults(nextDefaults);

    setIsLoading(true);
    setIsGenerationInFlight(true);
    setError(null);
    setGenerateStage('uploading');
    startTimer();
    generationAbortRef.current = new AbortController();
    try {
      void updateGenerationDefaults(nextDefaults).catch((defaultsError) => {
        console.error('Failed to persist generation defaults', defaultsError);
      });
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
      setIsGenerationInFlight(false);
      setGenerateStage('idle');
      stopTimer();
      generationAbortRef.current = null;
    }
  };

  // User confirms changes
  const handleConfirmChanges = async () => {
    if (!pendingResult || isConfirming) return;

    setIsConfirming(true);
    setError(null);
    setDiffConfirmError(null);

    try {
      await confirmAndNavigate(pendingResult);
      setShowDiffModal(false);
      setPendingResult(null);
    } catch (err) {
      console.error(err);
      const errorMessage = messageFromImproveFailure(err, t('tailor.errors.failedToConfirm'));
      setError(errorMessage);
      setDiffConfirmError(errorMessage);
    } finally {
      setIsConfirming(false);
    }
  };

  // User rejects changes
  const handleRejectChanges = () => {
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
    setShowRegenerateDialog(true);
  };

  const handleCloseDiffModal = () => {
    setShowDiffModal(false);
    setPendingResult(null);
    setDiffConfirmError(null);
  };

  const handleCloseMissingDiffDialog = () => {
    setShowMissingDiffDialog(false);
    setMissingDiffResult(null);
    setMissingDiffError(null);
    missingDiffConfirmInFlight.current = false;
  };

  const handleMissingDiffConfirm = async () => {
    if (!missingDiffResult || isLoading || missingDiffConfirmInFlight.current) return;
    missingDiffConfirmInFlight.current = true;
    setIsLoading(true);
    setError(null);
    setMissingDiffError(null);
    try {
      await confirmAndNavigate(missingDiffResult);
      handleCloseMissingDiffDialog();
    } catch (err) {
      console.error(err);
      const errorMessage = messageFromImproveFailure(err, t('tailor.errors.failedToConfirm'));
      setError(errorMessage);
      setMissingDiffError(errorMessage);
    } finally {
      missingDiffConfirmInFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleRegenerateConfirm = async () => {
    setShowRegenerateDialog(false);
    const trimmedDescription = (jobDescriptionRef.current || jobDescription).trim();
    const resumeId = sourceResumeIdRef.current || sourceResumeId;
    if (!trimmedDescription || !resumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsLoading(true);
    setIsGenerationInFlight(true);
    setError(null);
    setGenerateStage('uploading');
    setLiveState(EMPTY_LIVE_STATE);
    closeEventSourceRef(liveEventSourceRef);
    liveRunIdRef.current = null;
    startTimer();
    generationAbortRef.current = new AbortController();
    try {
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      closeEventSourceRef(liveEventSourceRef);
      liveRunIdRef.current = null;
      setIsLoading(false);
      setIsGenerationInFlight(false);
      setGenerateStage('idle');
      stopTimer();
      generationAbortRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    if (!isGenerationInFlight) return;
    const liveRunId = liveRunIdRef.current;
    if (liveRunId) {
      void cancelLivePreview(liveRunId).catch(() => undefined);
    }
    closeEventSourceRef(liveEventSourceRef);
    liveRunIdRef.current = null;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerationInFlight(false);
    setIsLoading(false);
    setGenerateStage('idle');
    setLiveState((current) => ({ ...current, status: 'cancelled', currentStage: 'Cancelled' }));
    stopTimer();
    setError(t('tailor.errors.cancelled'));
  };

  const progressLabel = (() => {
    if (!isGenerationInFlight) return null;
    if (generateStage === 'uploading') return 'Uploading job description...';
    if (elapsed >= 20) return 'Rendering preview and diff...';
    return 'Generating tailored resume...';
  })();

  return (
    <div
      className="min-h-screen w-full bg-[#F6F5EE] px-3 py-4 font-sans md:px-4 md:py-5"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="mx-auto w-full max-w-6xl border border-border bg-card shadow-[6px_6px_0px_0px_rgba(0,0,0,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-secondary px-4 py-3">
          <div className="space-y-1">
            <LinkButton href="/dashboard" variant="ghost" size="xs" className="px-0">
              <ArrowLeft className="w-4 h-4" />
              {t('common.back')}
            </LinkButton>
            <h1 className="font-serif text-2xl font-bold uppercase tracking-tight">
              {t('tailor.heroTitle')}
            </h1>
          </div>
          <div className="rounded-none border border-border bg-card px-2.5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-gray-600">
            {promptLoading ? t('common.loading') : selectedPromptId}
          </div>
        </div>

        {!statusLoading && !isLlmConfigured && (
          <div className="m-4 border border-amber-500 bg-amber-50 p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                  {t('tailor.setupRequiredTitle')}
                </p>
                <p className="font-mono text-xs text-amber-700 mt-1">
                  {t('tailor.noApiKeyMessage')}
                </p>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 mt-3 text-amber-700 hover:text-amber-900 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase underline">
                    {t('tailor.configureApiKey')}
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 p-4">
          <div className="border border-border bg-secondary p-3">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-gray-600">
              {t('tailor.selectResume')}
            </p>
            <select
              className="mt-2 h-10 w-full border border-border bg-card px-3 font-mono text-sm"
              value={sourceResumeId ?? ''}
              disabled={resumeListLoading || resumeOptions.length === 0}
              onChange={(e) => {
                const id = e.target.value;
                sourceResumeIdRef.current = id;
                setSourceResumeId(id);
                localStorage.setItem(ACTIVE_RESUME_STORAGE_KEY, id);
              }}
            >
              {resumeOptions.map((r) => (
                <option key={r.resume_id} value={r.resume_id}>
                  {(r.title || r.filename || 'Untitled resume') + (r.is_active ? ' (Active)' : '')}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-gray-600">
                  {t('tailor.pasteJobDescription')}
                </p>
                <span className="font-mono text-[11px] text-gray-400">
                  {t('tailor.charactersCount', { count: jobDescription.length })}
                </span>
              </div>
              <Textarea
                placeholder={t('tailor.jobDescriptionPlaceholder')}
                className="min-h-[420px] border border-border bg-card font-mono text-sm focus:ring-0 focus:border-primary resize-none rounded-none"
                value={jobDescription}
                onChange={(e) => {
                  jobDescriptionRef.current = e.target.value;
                  setJobDescription(e.target.value);
                }}
                onKeyDown={handleTextareaKeyDown}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-3">
              <div className="border border-border bg-secondary p-3">
                <Dropdown
                  options={
                    promptOptions.length > 0
                      ? promptOptions.map((opt) => ({
                          id: opt.id,
                          label: t(`tailor.promptOptions.${opt.id}.label`),
                          description: t(`tailor.promptOptions.${opt.id}.description`),
                        }))
                      : [
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
                        ]
                  }
                  value={selectedPromptId}
                  onChange={(value) => {
                    hasUserSelectedPrompt.current = true;
                    setSelectedPromptId(value);
                  }}
                  label={t('tailor.promptLabel')}
                  disabled={isLoading || promptLoading}
                  density="compact"
                />
              </div>

              <div className="border border-border bg-secondary p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-gray-600">
                    {t('tailor.customInstructionsLabel')}
                  </p>
                  <span className="font-mono text-[11px] text-gray-400">
                    {t('tailor.charactersCount', { count: customPromptInstructions.length })}
                  </span>
                </div>
                <Textarea
                  placeholder={t('tailor.customInstructionsPlaceholder')}
                  className="min-h-[220px] border border-border bg-card font-mono text-xs focus:ring-0 focus:border-primary resize-none rounded-none"
                  value={customPromptInstructions}
                  onChange={(e) => {
                    customPromptInstructionsRef.current = e.target.value;
                    setCustomPromptInstructions(e.target.value);
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  disabled={isLoading}
                />
              </div>

              {error && (
                <div className="whitespace-pre-wrap border border-red-300 bg-red-50 px-3 py-2 text-sm font-mono text-red-700">
                  {error}
                </div>
              )}

              <Button
                size="lg"
                onClick={handleGenerate}
                disabled={
                  isLoading ||
                  statusLoading ||
                  resumeListLoading ||
                  !sourceResumeId ||
                  !jobDescription.trim() ||
                  !isLlmConfigured
                }
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('common.processing')}
                    {elapsed > 0 && (
                      <span className="ml-2 font-mono text-xs opacity-70">{elapsed}s</span>
                    )}
                  </>
                ) : statusLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('common.checking')}
                  </>
                ) : !isLlmConfigured ? (
                  t('tailor.configureApiKeyFirst')
                ) : (
                  t('tailor.generateTailored')
                )}
              </Button>
            </div>
          </div>

          {isGenerationInFlight && (
            <LiveGenerationPanel
              state={
                !liveState.currentStage && !liveState.currentOperation && progressLabel
                  ? { ...liveState, currentStage: progressLabel || undefined }
                  : liveState
              }
              elapsed={elapsed}
              onCancel={handleCancelGeneration}
            />
          )}
        </div>
      </div>

      {/* Diff preview modal */}
      {showDiffModal && pendingResult && (
        <DiffPreviewModal
          isOpen={showDiffModal}
          isConfirming={isConfirming}
          onClose={handleCloseDiffModal}
          onReject={handleRejectChanges}
          onConfirm={handleConfirmChanges}
          diffSummary={pendingResult?.data?.diff_summary}
          detailedChanges={pendingResult?.data?.detailed_changes}
          changeBreakdown={pendingResult?.data?.change_breakdown}
          changeManifest={pendingResult?.data?.change_manifest}
          pipelineTiming={pendingResult?.data?.pipeline_timing}
          artifacts={pendingResult?.data?.artifacts}
          skillsObservation={pendingResult?.data?.skills_observability ?? null}
          warnings={pendingResult?.data?.warnings ?? []}
          errorMessage={diffConfirmError ?? undefined}
          resumePreview={pendingResult?.data?.resume_preview ?? null}
        />
      )}

      <ConfirmDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        title={t('tailor.regenerateDialog.title')}
        description={t('tailor.regenerateDialog.description')}
        confirmLabel={t('tailor.regenerateDialog.confirmLabel')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={handleRegenerateConfirm}
      />

      <ConfirmDialog
        open={showMissingDiffDialog}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseMissingDiffDialog();
          }
        }}
        title={t('tailor.missingDiffDialog.title')}
        description={t('tailor.missingDiffDialog.description')}
        confirmLabel={t('tailor.missingDiffDialog.confirmLabel')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        closeOnConfirm={false}
        onConfirm={handleMissingDiffConfirm}
        onCancel={handleCloseMissingDiffDialog}
        confirmDisabled={isLoading || !missingDiffResult}
        errorMessage={missingDiffError ?? undefined}
      />
    </div>
  );
}

export default function TailorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-[#F6F5EE]">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      }
    >
      <TailorPageContent />
    </Suspense>
  );
}
