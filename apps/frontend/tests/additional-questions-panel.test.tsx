import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdditionalQuestionsPanel } from '@/components/application/additional-questions-panel';

const fetchApplicationQuestionAnswers = vi.fn();
const answerApplicationQuestions = vi.fn();
const saveApplicationQuestionAnswers = vi.fn();

vi.mock('@/lib/api/resume', () => ({
  fetchApplicationQuestionAnswers: (...args: unknown[]) => fetchApplicationQuestionAnswers(...args),
  answerApplicationQuestions: (...args: unknown[]) => answerApplicationQuestions(...args),
  saveApplicationQuestionAnswers: (...args: unknown[]) => saveApplicationQuestionAnswers(...args),
}));

describe('AdditionalQuestionsPanel', () => {
  beforeEach(() => {
    fetchApplicationQuestionAnswers.mockReset();
    answerApplicationQuestions.mockReset();
    saveApplicationQuestionAnswers.mockReset();

    fetchApplicationQuestionAnswers.mockResolvedValue({
      request_id: 'req-fetch',
      data: null,
    });
    answerApplicationQuestions.mockResolvedValue({
      request_id: 'req-answer',
      data: {
        application_pack_id: 'pack-123',
        generation_run_id: 'run-q-123',
        run_kind: 'application_pack_questions',
        answers: [
          {
            question_id: 'q_0',
            question: 'Why this role?',
            answer: 'My experience aligns with this role and team.',
            confidence: 'high',
            warnings: [],
            is_user_edited: false,
          },
        ],
        warnings: [],
        generated_at: '2026-04-05T12:00:00Z',
        is_stale: false,
        stale_reason: null,
      },
    });
    saveApplicationQuestionAnswers.mockResolvedValue({
      request_id: 'req-save',
      data: {
        application_pack_id: 'pack-123',
        generation_run_id: 'run-q-manual',
        run_kind: 'application_pack_questions_manual',
        answers: [
          {
            question_id: 'q_0',
            question: 'Why this role?',
            answer: 'Edited answer',
            confidence: 'high',
            warnings: [],
            is_user_edited: true,
          },
        ],
        warnings: [],
        generated_at: '2026-04-05T12:01:00Z',
        is_stale: false,
        stale_reason: null,
      },
    });
  });

  it('generates answers from pasted questions and saves manual edits', async () => {
    render(
      <AdditionalQuestionsPanel
        resumeId="resume-123"
        jobId="job-123"
        applicationPackId="pack-123"
      />
    );

    await waitFor(() =>
      expect(fetchApplicationQuestionAnswers).toHaveBeenCalledWith({
        resume_id: 'resume-123',
        job_id: 'job-123',
        application_pack_id: 'pack-123',
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate Answers' })).toBeEnabled()
    );

    fireEvent.change(screen.getByPlaceholderText('Paste one question per line...'), {
      target: { value: 'Why this role?\nDescribe a challenge you solved.' },
    });
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Paste one question per line...')).toHaveValue(
        'Why this role?\nDescribe a challenge you solved.'
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate Answers' }));

    await waitFor(() => expect(answerApplicationQuestions).toHaveBeenCalledTimes(1));
    expect(answerApplicationQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        resume_id: 'resume-123',
        job_id: 'job-123',
        regenerate: false,
      })
    );

    const answerBox = await screen.findByDisplayValue(
      'My experience aligns with this role and team.'
    );
    fireEvent.change(answerBox, { target: { value: 'Edited answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Edits' }));

    await waitFor(() => expect(saveApplicationQuestionAnswers).toHaveBeenCalledTimes(1));
    expect(saveApplicationQuestionAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        resume_id: 'resume-123',
        job_id: 'job-123',
        answers: [
          expect.objectContaining({
            question_id: 'q_0',
            answer: 'Edited answer',
            is_user_edited: true,
          }),
        ],
      })
    );
  });
});
