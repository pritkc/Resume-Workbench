import { ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  type RenderThemeSettings,
  type RenderPreviewResponse,
  DEFAULT_RENDER_THEME_SETTINGS,
  renderThemeSettingsToQuery,
  serializeRenderThemeSettings,
} from '@/lib/types/render-theme';
import { type Locale } from '@/i18n/config';
import { API_BASE, apiPost, apiPatch, apiDelete, apiFetch } from './client';

// Matches backend schemas/models.py ResumeData
interface ProcessedResume {
  personalInfo?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string | null;
    linkedin?: string | null;
    github?: string | null;
    photoUrl?: string | null;
    socialNetworks?: Array<{
      network?: string;
      username?: string;
    }>;
    customConnections?: Array<{
      placeholder?: string;
      url?: string | null;
      fontawesome_icon?: string | null;
      fontAwesomeIcon?: string | null;
    }>;
  };
  summary?: string;
  workExperience?: Array<{
    id: number;
    title?: string;
    company?: string;
    location?: string | null;
    years?: string;
    description?: string[];
  }>;
  education?: Array<{
    id: number;
    institution?: string;
    degree?: string;
    years?: string;
    description?: string | null;
  }>;
  personalProjects?: Array<{
    id: number;
    name?: string;
    role?: string;
    years?: string;
    github?: string | null;
    website?: string | null;
    description?: string[];
  }>;
  additional?: {
    technicalSkills?: string[];
    languages?: string[];
    certificationsTraining?: string[];
    awards?: string[];
  };
}

interface ResumeResponse {
  request_id: string;
  data: {
    resume_id: string;
    raw_resume: {
      id: number | null;
      content: string;
      content_type: string;
      created_at: string;
      processing_status: 'pending' | 'processing' | 'ready' | 'failed';
    };
    processed_resume: ProcessedResume | null;
    cover_letter?: string | null;
    outreach_message?: string | null;
    parent_id?: string | null; // For determining if resume is tailored
    title?: string | null;
    application_pack_id?: string | null;
    theme_settings?: RenderThemeSettings | null;
  };
}

/** Response from resume upload endpoint */
export interface ResumeUploadResponse {
  message: string;
  request_id: string;
  resume_id: string;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  is_master: boolean;
}

interface ImproveResumeConfirmRequest {
  resume_id: string;
  job_id: string;
  improved_data: ResumeData;
  improvements: Array<{
    suggestion: string;
    lineNumber?: number | null;
  }>;
  application_pack_id?: string | null;
  generation_run_id?: string | null;
  theme_settings?: RenderThemeSettings | null;
}

export interface RawYamlSections {
  cv: string;
  design: string;
  locale: string;
  settings: string;
}

export type RawYamlSection = keyof RawYamlSections;

export interface DraftValidationDetail {
  type?: string;
  message: string;
  section?: RawYamlSection;
  line?: number | null;
  column?: number | null;
  path?: string[];
}

export class DraftRequestError extends Error {
  status: number;
  detail?: DraftValidationDetail;

  constructor(message: string, status: number, detail?: DraftValidationDetail) {
    super(message);
    this.name = 'DraftRequestError';
    this.status = status;
    this.detail = detail;
  }
}

export interface ResumeDraftRequest {
  resume_id?: string | null;
  processed_resume?: ProcessedResume;
  theme_settings?: RenderThemeSettings | null;
  yaml_sections?: RawYamlSections;
}

export interface ResumeDraftResponse {
  request_id: string;
  data: ResumeResponse['data'];
  yaml_sections: RawYamlSections;
}

function normalizeResumeId(resumeId: string): string {
  const normalized = resumeId.trim();
  if (!normalized) {
    throw new Error('Resume ID is required.');
  }
  return normalized;
}

function normalizeDraftValidationDetail(value: unknown): DraftValidationDetail | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (!message) {
    return undefined;
  }

  const path = Array.isArray(raw.path)
    ? raw.path.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : undefined;

  return {
    type: typeof raw.type === 'string' ? raw.type : undefined,
    message,
    section:
      raw.section === 'cv' ||
      raw.section === 'design' ||
      raw.section === 'locale' ||
      raw.section === 'settings'
        ? raw.section
        : undefined,
    line: typeof raw.line === 'number' ? raw.line : null,
    column: typeof raw.column === 'number' ? raw.column : null,
    path,
  };
}

export function isDraftRequestError(error: unknown): error is DraftRequestError {
  return error instanceof DraftRequestError;
}

export function formatDraftValidationDetail(detail?: DraftValidationDetail | null): string {
  if (!detail) {
    return 'Draft validation failed.';
  }

  const locationParts: string[] = [];
  if (detail.section) {
    locationParts.push(detail.section.toUpperCase());
  }
  if (detail.line) {
    locationParts.push(`line ${detail.line}`);
  }
  if (detail.column) {
    locationParts.push(`column ${detail.column}`);
  }
  if (detail.path?.length) {
    locationParts.push(detail.path.join('.'));
  }

  return locationParts.length > 0
    ? `${locationParts.join(' • ')}: ${detail.message}`
    : detail.message;
}

async function throwDraftRequestError(response: Response, fallback: string): Promise<never> {
  const text = await response.text().catch(() => '');

  if (!text) {
    throw new DraftRequestError(fallback, response.status);
  }

  try {
    const payload = JSON.parse(text) as { detail?: unknown };
    const detail = normalizeDraftValidationDetail(payload.detail);
    if (detail) {
      throw new DraftRequestError(formatDraftValidationDetail(detail), response.status, detail);
    }
    if (typeof payload.detail === 'string') {
      throw new DraftRequestError(payload.detail, response.status);
    }
  } catch (parseError) {
    if (parseError instanceof DraftRequestError) {
      throw parseError;
    }
  }

  throw new DraftRequestError(`${fallback}: ${text}`, response.status);
}

export interface ResumeListItem {
  resume_id: string;
  filename: string | null;
  is_master: boolean;
  parent_id: string | null;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
  title?: string | null;
  // Optional lightweight snippet of associated job description (populated client-side)
  jobSnippet?: string;
}

async function postImprove(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<ImprovedResult> {
  let response: Response;
  try {
    response = await apiPost(endpoint, payload, 240_000);
  } catch (networkError) {
    console.error(`Network error during ${endpoint}:`, networkError);
    throw networkError;
  }

  const text = await response.text();
  if (!response.ok) {
    console.error('Improve failed response body:', text);
    throw new Error(`Improve failed with status ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text) as ImprovedResult;
  } catch (parseError) {
    console.error('Failed to parse improve response:', parseError, 'Raw response:', text);
    throw parseError;
  }
}

/** Uploads job descriptions and returns a job_id */
export async function uploadJobDescriptions(
  descriptions: string[],
  resumeId: string
): Promise<string> {
  const res = await apiPost('/jobs/upload', {
    job_descriptions: descriptions,
    resume_id: resumeId,
  });
  if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
  const data = await res.json();
  return data.job_id[0];
}

/** Improves the resume and returns the full preview object */
export async function improveResume(
  resumeId: string,
  jobId: string,
  promptId?: string
): Promise<ImprovedResult> {
  return postImprove('/resumes/improve', {
    resume_id: resumeId,
    job_id: jobId,
    prompt_id: promptId ?? null,
  });
}

/** Previews the resume improvement without saving */
export async function previewImproveResume(
  resumeId: string,
  jobId: string,
  promptId?: string,
  themeSettings: RenderThemeSettings = DEFAULT_RENDER_THEME_SETTINGS
): Promise<ImprovedResult> {
  return postImprove('/application-packs/preview', {
    resume_id: resumeId,
    job_id: jobId,
    prompt_id: promptId ?? null,
    theme_settings: serializeRenderThemeSettings(themeSettings),
  });
}

/** Confirms and saves a tailored resume */
export async function confirmImproveResume(
  payload: ImproveResumeConfirmRequest
): Promise<ImprovedResult> {
  return postImprove('/application-packs/confirm', {
    ...payload,
    theme_settings: payload.theme_settings
      ? serializeRenderThemeSettings(payload.theme_settings)
      : undefined,
  });
}

/** Fetches a raw resume record for previewing the original upload */
export async function fetchResume(resumeId: string): Promise<ResumeResponse['data']> {
  const res = await apiFetch(`/resumes?resume_id=${encodeURIComponent(resumeId)}`);
  if (!res.ok) {
    throw new Error(`Failed to load resume (status ${res.status}).`);
  }
  const payload = (await res.json()) as ResumeResponse;
  // Support both raw_resume content (initial) and processed_resume (if available)
  // The viewer/builder logic should prioritize processed data if present
  return payload.data;
}

export async function fetchResumeList(includeMaster = false): Promise<ResumeListItem[]> {
  const res = await apiFetch(`/resumes/list?include_master=${includeMaster ? 'true' : 'false'}`);
  if (!res.ok) {
    throw new Error(`Failed to load resumes list (status ${res.status}).`);
  }
  const payload = (await res.json()) as { data: ResumeListItem[] };
  return payload.data;
}

export async function updateResume(
  resumeId: string,
  resumeData: ProcessedResume,
  themeSettings?: RenderThemeSettings
): Promise<ResumeResponse['data']> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}`, {
    processed_resume: resumeData,
    theme_settings: themeSettings ? serializeRenderThemeSettings(themeSettings) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update resume (status ${res.status}): ${text}`);
  }
  const payload = (await res.json()) as ResumeResponse;
  return payload.data;
}

export function getResumePdfUrl(
  resumeId: string,
  settings: RenderThemeSettings = DEFAULT_RENDER_THEME_SETTINGS,
  locale?: Locale,
  useSavedThemeSettings = false
): string {
  const normalizedId = normalizeResumeId(resumeId);
  const params = useSavedThemeSettings
    ? new URLSearchParams({ useSavedThemeSettings: 'true' })
    : renderThemeSettingsToQuery(settings);
  if (locale) {
    params.set('lang', locale);
  }

  return `${API_BASE}/resumes/${encodeURIComponent(normalizedId)}/pdf?${params.toString()}`;
}

export async function downloadResumePdf(
  resumeId: string,
  settings: RenderThemeSettings = DEFAULT_RENDER_THEME_SETTINGS,
  locale?: Locale
): Promise<Blob> {
  const res = await apiPost(
    `/resumes/${encodeURIComponent(normalizeResumeId(resumeId))}/pdf`,
    {
      theme_settings: serializeRenderThemeSettings(settings),
      lang: locale,
    },
    240_000
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to download resume (status ${res.status}): ${text}`);
  }
  return await res.blob();
}

/** Deletes a resume by ID */
export async function deleteResume(resumeId: string): Promise<void> {
  const res = await apiDelete(`/resumes/${encodeURIComponent(resumeId)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to delete resume (status ${res.status}): ${text}`);
  }
}

/** Updates the cover letter for a resume */
export async function updateCoverLetter(resumeId: string, content: string): Promise<void> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}/cover-letter`, { content });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update cover letter (status ${res.status}): ${text}`);
  }
}

/** Updates the outreach message for a resume */
export async function updateOutreachMessage(resumeId: string, content: string): Promise<void> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}/outreach-message`, {
    content,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update outreach message (status ${res.status}): ${text}`);
  }
}

/** Renames a resume by updating its title */
export async function renameResume(resumeId: string, title: string): Promise<void> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}/title`, { title });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to rename resume (status ${res.status}): ${text}`);
  }
}

/** Downloads cover letter as PDF */
export function getCoverLetterPdfUrl(
  resumeId: string,
  pageSize: 'A4' | 'LETTER' = 'A4',
  locale?: Locale
): string {
  const normalizedId = normalizeResumeId(resumeId);
  const params = new URLSearchParams({ pageSize });
  if (locale) {
    params.set('lang', locale);
  }
  return `${API_BASE}/resumes/${encodeURIComponent(normalizedId)}/cover-letter/pdf?${params.toString()}`;
}

export async function downloadCoverLetterPdf(
  resumeId: string,
  pageSize: 'A4' | 'LETTER' = 'A4',
  locale?: Locale
): Promise<Blob> {
  const url = getCoverLetterPdfUrl(resumeId, pageSize, locale);
  const res = await apiFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to download cover letter (status ${res.status}): ${text}`);
  }
  return await res.blob();
}

/** Generates a cover letter on-demand for a tailored resume */
export async function generateCoverLetter(resumeId: string): Promise<string> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/generate-cover-letter`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to generate cover letter (status ${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.content;
}

/** Generates an outreach message on-demand for a tailored resume */
export async function generateOutreachMessage(resumeId: string): Promise<string> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/generate-outreach`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to generate outreach message (status ${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.content;
}

/** Retries AI processing for a failed resume */
export async function retryProcessing(resumeId: string): Promise<ResumeUploadResponse> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/retry-processing`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to retry processing (status ${res.status}): ${text}`);
  }
  return res.json();
}

/** Fetches the job description used to tailor a resume */
export async function fetchJobDescription(
  resumeId: string
): Promise<{ job_id: string; content: string }> {
  const res = await apiFetch(`/resumes/${encodeURIComponent(resumeId)}/job-description`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch job description (status ${res.status}): ${text}`);
  }
  return res.json();
}

export async function fetchResumeRenderPreview(
  resumeId: string,
  settings: RenderThemeSettings = DEFAULT_RENDER_THEME_SETTINGS
): Promise<RenderPreviewResponse> {
  const res = await apiPost(
    `/resumes/${encodeURIComponent(normalizeResumeId(resumeId))}/render-preview`,
    {
      theme_settings: serializeRenderThemeSettings(settings),
    },
    240_000
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch render preview (status ${res.status}): ${text}`);
  }
  return res.json();
}

export async function normalizeResumeDraft(
  payload: ResumeDraftRequest
): Promise<ResumeDraftResponse> {
  const res = await apiPost('/resumes/draft/normalize', {
    ...payload,
    theme_settings: payload.theme_settings
      ? serializeRenderThemeSettings(payload.theme_settings)
      : undefined,
  });
  if (!res.ok) {
    await throwDraftRequestError(res, `Failed to normalize draft (status ${res.status})`);
  }
  return res.json();
}

export async function fetchDraftRenderPreview(
  payload: ResumeDraftRequest
): Promise<RenderPreviewResponse> {
  const res = await apiPost(
    '/resumes/draft/render-preview',
    {
      ...payload,
      theme_settings: payload.theme_settings
        ? serializeRenderThemeSettings(payload.theme_settings)
        : undefined,
    },
    240_000
  );
  if (!res.ok) {
    await throwDraftRequestError(
      res,
      `Failed to fetch draft render preview (status ${res.status})`
    );
  }
  return res.json();
}

export async function saveResumeDraft(
  resumeId: string,
  payload: ResumeDraftRequest
): Promise<ResumeDraftResponse> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(normalizeResumeId(resumeId))}/draft`, {
    ...payload,
    theme_settings: payload.theme_settings
      ? serializeRenderThemeSettings(payload.theme_settings)
      : undefined,
  });
  if (!res.ok) {
    await throwDraftRequestError(res, `Failed to save draft (status ${res.status})`);
  }
  return res.json();
}
