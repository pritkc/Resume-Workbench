'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import type { ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  uploadJobDescriptions,
  previewImproveResume,
  confirmImproveResume,
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
import { Loader2, ArrowLeft, AlertTriangle, Settings } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AdditionalQuestionsPanel } from '@/components/application/additional-questions-panel';

const GENERATION_DEFAULTS_STORAGE_KEY = 'resume_tailor_generation_defaults';

type StoredGenerationDefaults = {
  include_cover_letter: boolean;
  include_outreach_message: boolean;
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

    return {
      prompt_id: parsed.prompt_id,
      include_cover_letter: Boolean(parsed.include_cover_letter),
      include_outreach_message: Boolean(parsed.include_outreach_message),
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
type AdditionalQuestionContext = {
  jobId: string;
  applicationPackId: string | null;
  generationRunId: string | null;
};

export default function TailorPage() {
  const { t } = useTranslations();
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('keywords');
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [includeOutreachMessage, setIncludeOutreachMessage] = useState(false);
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
  const [additionalQuestionContext, setAdditionalQuestionContext] =
    useState<AdditionalQuestionContext | null>(null);
  const [generateStage, setGenerateStage] = useState<GenerateStage>('idle');
  const [isGenerationInFlight, setIsGenerationInFlight] = useState(false);
  const generationAbortRef = useRef<AbortController | null>(null);

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
      generationAbortRef.current?.abort();
    };
  }, []);

  const router = useRouter();
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
    const storedId = localStorage.getItem('master_resume_id');
    if (!storedId) {
      router.push('/dashboard');
    } else {
      setMasterResumeId(storedId);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const localDefaults = readStoredGenerationDefaults();

    if (localDefaults && !hasUserSelectedPrompt.current) {
      setSelectedPromptId(localDefaults.prompt_id);
      setIncludeCoverLetter(localDefaults.include_cover_letter);
      setIncludeOutreachMessage(localDefaults.include_outreach_message);
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
            storeGenerationDefaults(resolvedDefaults);
            setIncludeCoverLetter(resolvedDefaults.include_cover_letter);
            setIncludeOutreachMessage(resolvedDefaults.include_outreach_message);
          } else {
            setIncludeCoverLetter(false);
            setIncludeOutreachMessage(false);
          }

          if (!hasUserSelectedPrompt.current) {
            setSelectedPromptId(
              resolvedDefaults?.prompt_id || config.default_prompt_id || 'keywords'
            );
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
    if (!masterResumeId) {
      throw new Error('Master resume ID is missing.');
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
      resume_id: masterResumeId,
      job_id: result.data.job_id,
      improved_data: resumePreview as ResumeData,
      improvements:
        result.data.improvements?.map((item) => ({
          suggestion: item.suggestion,
          lineNumber: typeof item.lineNumber === 'number' ? item.lineNumber : null,
        })) ?? [],
      application_pack_id: result.data.application_pack_id ?? null,
      generation_run_id: result.data.generation_run_id ?? null,
      include_cover_letter: includeCoverLetter,
      include_outreach_message: includeOutreachMessage,
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
      router.push(`/resumes/${newResumeId}`);
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

  const runGenerate = async (resumeId: string, description: string) => {
    try {
      // 1. Upload Job Description
      // The API expects an array of strings
      setGenerateStage('uploading');
      const jobId = await uploadJobDescriptions([description], resumeId, {
        signal: generationAbortRef.current?.signal,
      });
      incrementJobs(); // Update cached counter

      // 2. Preview Resume
      setGenerateStage('tailoring');
      const result = await previewImproveResume(resumeId, jobId, {
        promptId: selectedPromptId,
        includeCoverLetter,
        includeOutreachMessage,
        signal: generationAbortRef.current?.signal,
      });
      setAdditionalQuestionContext({
        jobId: result.data.job_id,
        applicationPackId: result.data.application_pack_id ?? null,
        generationRunId: result.data.generation_run_id ?? null,
      });

      if (!result?.data?.diff_summary || !result?.data?.detailed_changes) {
        console.warn('Diff data missing for tailor preview; requesting user confirmation.');
        setDiffConfirmError(null);
        setPendingResult(null);
        setShowDiffModal(false);
        setMissingDiffError(null);
        setMissingDiffResult(result);
        setShowMissingDiffDialog(true);
        return;
      }

      // 3. Show diff preview modal
      setDiffConfirmError(null);
      setMissingDiffError(null);
      setPendingResult(result);
      setShowDiffModal(true);
    } catch (err) {
      if (isAbortError(err)) {
        setError(t('tailor.errors.cancelled'));
        return;
      }
      console.error(err);
      // Check for common error patterns
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
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const resumeId = masterResumeId;
    const nextDefaults: StoredGenerationDefaults = {
      prompt_id: selectedPromptId,
      include_cover_letter: includeCoverLetter,
      include_outreach_message: includeOutreachMessage,
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
      const errorMessage = t('tailor.errors.failedToConfirm');
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
      const errorMessage = t('tailor.errors.failedToConfirm');
      setError(errorMessage);
      setMissingDiffError(errorMessage);
    } finally {
      missingDiffConfirmInFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleRegenerateConfirm = async () => {
    setShowRegenerateDialog(false);
    const trimmedDescription = jobDescription.trim();
    if (!trimmedDescription || !masterResumeId) return;
    const validationError = getGenerateValidationError(trimmedDescription);
    if (validationError) {
      setError(validationError);
      return;
    }
    const resumeId = masterResumeId;
    setIsLoading(true);
    setIsGenerationInFlight(true);
    setError(null);
    setGenerateStage('uploading');
    startTimer();
    generationAbortRef.current = new AbortController();
    try {
      await runGenerate(resumeId, trimmedDescription);
    } finally {
      setIsLoading(false);
      setIsGenerationInFlight(false);
      setGenerateStage('idle');
      stopTimer();
      generationAbortRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    if (!isGenerationInFlight) return;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerationInFlight(false);
    setIsLoading(false);
    setGenerateStage('idle');
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
      <div className="mx-auto w-full max-w-6xl border border-black bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black bg-[#F8F7F1] px-4 py-3">
          <div className="space-y-1">
            <Button variant="ghost" size="xs" className="px-0" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
              {t('common.back')}
            </Button>
            <h1 className="font-serif text-2xl font-bold uppercase tracking-tight">
              {t('tailor.heroTitle')}
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-gray-500">
              {t('tailor.pasteJobDescriptionBelow')}
            </p>
          </div>
          <div className="rounded-none border border-black bg-white px-2.5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-gray-600">
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

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="border border-black bg-[#F0F0E8] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-gray-600">
                Job Description
              </p>
              <span className="font-mono text-[11px] text-gray-400">
                {t('tailor.charactersCount', { count: jobDescription.length })}
              </span>
            </div>
            <Textarea
              placeholder={t('tailor.jobDescriptionPlaceholder')}
              className="min-h-[420px] border border-black bg-white font-mono text-sm focus:ring-0 focus:border-blue-700 resize-none rounded-none"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-3">
            <div className="border border-black bg-[#F8F7F1] p-3">
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
                      ]
                }
                value={selectedPromptId}
                onChange={(value) => {
                  hasUserSelectedPrompt.current = true;
                  setSelectedPromptId(value);
                }}
                label={t('tailor.promptLabel')}
                description={t('tailor.promptDescription')}
                disabled={isLoading || promptLoading}
                density="compact"
              />
            </div>

            <div className="space-y-2 border border-black bg-white p-3">
              <ToggleSwitch
                checked={includeCoverLetter}
                onCheckedChange={setIncludeCoverLetter}
                label="Cover letter"
                description="Generate with this resume"
                disabled={isLoading}
                density="compact"
              />
              <ToggleSwitch
                checked={includeOutreachMessage}
                onCheckedChange={setIncludeOutreachMessage}
                label="LinkedIn message"
                description="Generate with this resume"
                disabled={isLoading}
                density="compact"
              />
            </div>

            {error && (
              <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-mono text-red-700">
                {error}
              </div>
            )}

            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={isLoading || statusLoading || !jobDescription.trim() || !isLlmConfigured}
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
            {isGenerationInFlight && (
              <div className="flex items-center justify-between gap-3 border border-black bg-[#F8F7F1] px-3 py-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-gray-600">
                  {progressLabel}
                </p>
                <Button size="xs" variant="outline" onClick={handleCancelGeneration}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-6xl">
        <AdditionalQuestionsPanel
          title="Additional Questions"
          resumeId={masterResumeId}
          jobId={additionalQuestionContext?.jobId ?? null}
          applicationPackId={additionalQuestionContext?.applicationPackId ?? null}
          generationRunId={additionalQuestionContext?.generationRunId ?? null}
          disabled={!additionalQuestionContext}
          disabledReason="Generate a tailored preview first, then paste custom application questions here."
        />
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
          artifacts={pendingResult?.data?.artifacts}
          errorMessage={diffConfirmError ?? undefined}
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
