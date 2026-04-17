'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  answerApplicationQuestions,
  fetchApplicationQuestionAnswers,
  saveApplicationQuestionAnswers,
  type ApplicationQuestionAnswer,
  type ApplicationQuestionsData,
} from '@/lib/api/resume';
import { Loader2, Copy, Check, RefreshCcw, Save } from 'lucide-react';

interface AdditionalQuestionsPanelProps {
  resumeId: string | null;
  jobId: string | null;
  applicationPackId?: string | null;
  generationRunId?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  title?: string;
  onDataChange?: (data: ApplicationQuestionsData) => void;
}

type GenerationState = 'idle' | 'loading' | 'generating' | 'saving';

function normalizeQuestionLine(value: string): string {
  return value.replace(/^\s*\d+\s*[\).:-]\s*/, '').trim();
}

function buildQuestionsFromText(value: string) {
  return value
    .split(/\r?\n+/)
    .map(normalizeQuestionLine)
    .filter(Boolean)
    .map((question, index) => ({
      question_id: `q_${index}`,
      question,
    }));
}

function buildTextFromAnswers(answers: ApplicationQuestionAnswer[]): string {
  return answers.map((item) => item.question).join('\n');
}

export function AdditionalQuestionsPanel({
  resumeId,
  jobId,
  applicationPackId,
  generationRunId,
  disabled = false,
  disabledReason,
  title = 'Additional Questions',
  onDataChange,
}: AdditionalQuestionsPanelProps) {
  const [questionsText, setQuestionsText] = useState('');
  const [answers, setAnswers] = useState<ApplicationQuestionAnswer[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [isStale, setIsStale] = useState(false);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [localPackId, setLocalPackId] = useState<string | null>(applicationPackId ?? null);
  const [localGenerationRunId, setLocalGenerationRunId] = useState<string | null>(
    generationRunId ?? null
  );

  /** Avoid depending on questionsText in loadExistingAnswers — that would refetch on every keystroke. */
  const questionsTextRef = useRef(questionsText);
  useEffect(() => {
    questionsTextRef.current = questionsText;
  }, [questionsText]);

  useEffect(() => {
    setLocalPackId(applicationPackId ?? null);
  }, [applicationPackId]);

  useEffect(() => {
    setLocalGenerationRunId(generationRunId ?? null);
  }, [generationRunId]);

  const canFetchExisting = useMemo(() => Boolean(localPackId || resumeId), [localPackId, resumeId]);

  const loadExistingAnswers = useCallback(async () => {
    if (!canFetchExisting || disabled) {
      return;
    }

    setGenerationState('loading');
    setError(null);
    try {
      const response = await fetchApplicationQuestionAnswers({
        resume_id: resumeId,
        job_id: jobId,
        application_pack_id: localPackId,
      });
      if (!response.data) {
        setGenerationState('idle');
        return;
      }

      setAnswers(response.data.answers);
      setWarnings(response.data.warnings);
      setIsStale(response.data.is_stale);
      setStaleReason(response.data.stale_reason ?? null);
      if (!questionsTextRef.current.trim()) {
        setQuestionsText(buildTextFromAnswers(response.data.answers));
      }
      if (response.data.application_pack_id) {
        setLocalPackId(response.data.application_pack_id);
      }
      if (response.data.generation_run_id) {
        setLocalGenerationRunId(response.data.generation_run_id);
      }
      onDataChange?.(response.data);
    } catch (loadError) {
      console.error('Failed to load additional question answers:', loadError);
    } finally {
      setGenerationState('idle');
    }
  }, [canFetchExisting, disabled, jobId, localPackId, onDataChange, resumeId]);

  useEffect(() => {
    void loadExistingAnswers();
  }, [loadExistingAnswers]);

  const runGeneration = useCallback(
    async (targetQuestionIds: string[] = []) => {
      if (disabled) {
        return;
      }
      if (!resumeId || !jobId) {
        setError('Resume and job context are required before generating answers.');
        return;
      }

      const parsedQuestions =
        answers.length > 0 && targetQuestionIds.length > 0
          ? answers.map((item) => ({
              question_id: item.question_id,
              question: item.question,
            }))
          : buildQuestionsFromText(questionsText);
      if (parsedQuestions.length === 0) {
        setError('Add at least one question before generating answers.');
        return;
      }

      setGenerationState('generating');
      setError(null);
      try {
        const response = await answerApplicationQuestions({
          resume_id: resumeId,
          job_id: jobId,
          application_pack_id: localPackId,
          generation_run_id: localGenerationRunId,
          questions: parsedQuestions,
          regenerate: targetQuestionIds.length > 0,
          target_question_ids: targetQuestionIds,
        });
        setAnswers(response.data.answers);
        setWarnings(response.data.warnings);
        setIsStale(response.data.is_stale);
        setStaleReason(response.data.stale_reason ?? null);
        setQuestionsText(buildTextFromAnswers(response.data.answers));
        setIsDirty(false);
        if (response.data.application_pack_id) {
          setLocalPackId(response.data.application_pack_id);
        }
        if (response.data.generation_run_id) {
          setLocalGenerationRunId(response.data.generation_run_id);
        }
        onDataChange?.(response.data);
      } catch (generationError) {
        console.error('Failed to generate additional question answers:', generationError);
        const message =
          generationError instanceof Error
            ? generationError.message
            : 'Failed to generate answers.';
        setError(message);
      } finally {
        setGenerationState('idle');
      }
    },
    [
      answers,
      disabled,
      jobId,
      localGenerationRunId,
      localPackId,
      onDataChange,
      questionsText,
      resumeId,
    ]
  );

  const handleSaveEdits = useCallback(async () => {
    if (disabled) {
      return;
    }
    if (!resumeId || !jobId || answers.length === 0) {
      return;
    }
    setGenerationState('saving');
    setError(null);
    try {
      const response = await saveApplicationQuestionAnswers({
        resume_id: resumeId,
        job_id: jobId,
        application_pack_id: localPackId,
        generation_run_id: localGenerationRunId,
        answers,
      });
      setAnswers(response.data.answers);
      setWarnings(response.data.warnings);
      setIsStale(response.data.is_stale);
      setStaleReason(response.data.stale_reason ?? null);
      setIsDirty(false);
      if (response.data.application_pack_id) {
        setLocalPackId(response.data.application_pack_id);
      }
      if (response.data.generation_run_id) {
        setLocalGenerationRunId(response.data.generation_run_id);
      }
      onDataChange?.(response.data);
    } catch (saveError) {
      console.error('Failed to save additional question answers:', saveError);
      const message = saveError instanceof Error ? saveError.message : 'Failed to save answers.';
      setError(message);
    } finally {
      setGenerationState('idle');
    }
  }, [answers, disabled, jobId, localGenerationRunId, localPackId, onDataChange, resumeId]);

  const copyText = useCallback(async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1200);
    } catch (copyError) {
      console.error('Failed to copy answer text:', copyError);
    }
  }, []);

  const handleCopyAll = useCallback(async () => {
    const payload = answers.map((item) => `${item.question}\n${item.answer}`).join('\n\n');
    await copyText(payload, 'all');
  }, [answers, copyText]);

  const isBusy = generationState === 'loading' || generationState === 'generating';

  return (
    <div className="space-y-3 border border-black bg-[#F8F7F1] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">{title}</p>
        <div className="flex items-center gap-2">
          {isStale && (
            <span className="border border-amber-500 bg-amber-50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-700">
              stale
            </span>
          )}
          {generationState === 'loading' && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
              loading
            </span>
          )}
          {generationState === 'generating' && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
              generating
            </span>
          )}
          {generationState === 'saving' && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
              saving
            </span>
          )}
        </div>
      </div>

      {disabled && (
        <div className="border border-dashed border-black bg-white px-3 py-2 font-mono text-xs text-gray-600">
          {disabledReason || 'Generate a resume preview first to enable custom questions.'}
        </div>
      )}

      {staleReason && (
        <div className="border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {staleReason}
        </div>
      )}

      {!disabled && (
        <>
          <div className="space-y-2">
            <Textarea
              placeholder="Paste one question per line..."
              className="min-h-[120px] border border-black bg-white font-mono text-sm focus:ring-0 focus:border-blue-700 resize-y rounded-none"
              value={questionsText}
              onChange={(event) => setQuestionsText(event.target.value)}
              disabled={isBusy}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void runGeneration()}
                disabled={isBusy || generationState === 'saving'}
              >
                {generationState === 'generating' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Answers'
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCopyAll()}
                disabled={answers.length === 0}
              >
                {copiedId === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSaveEdits()}
                disabled={generationState !== 'idle' || !isDirty || answers.length === 0}
              >
                <Save className="w-4 h-4" />
                Save Edits
              </Button>
            </div>
          </div>

          {error && (
            <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="border border-black bg-white p-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Warnings
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {answers.length > 0 && (
            <div className="space-y-3">
              {answers.map((item) => (
                <div key={item.question_id} className="border border-black bg-white p-3">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Question
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{item.question}</p>

                  <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Answer
                  </p>
                  <Textarea
                    className="mt-1 min-h-[96px] border border-black bg-white text-sm focus:ring-0 focus:border-blue-700 rounded-none"
                    value={item.answer}
                    disabled={generationState !== 'idle'}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setAnswers((current) =>
                        current.map((entry) =>
                          entry.question_id === item.question_id
                            ? {
                                ...entry,
                                answer: nextValue,
                                is_user_edited: true,
                              }
                            : entry
                        )
                      );
                      setIsDirty(true);
                    }}
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="border border-black bg-[#F8F7F1] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-gray-700">
                      confidence: {item.confidence}
                    </span>
                    {item.is_user_edited && (
                      <span className="border border-black bg-[#F8F7F1] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-gray-700">
                        edited
                      </span>
                    )}
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void copyText(item.answer, item.question_id)}
                    >
                      {copiedId === item.question_id ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={generationState !== 'idle'}
                      onClick={() => void runGeneration([item.question_id])}
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                      Regenerate
                    </Button>
                  </div>

                  {item.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                      {item.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
