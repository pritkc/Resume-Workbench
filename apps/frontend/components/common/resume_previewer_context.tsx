'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import type {
  SkillGroup,
  SkillsSection as ResumeSkillsSection,
} from '@/components/dashboard/resume-component';
import type { ArtifactSummary, RenderThemeSettings } from '@/lib/types/render-theme';

export interface PersonalInfo {
  name: string;
  title?: string;
  email: string;
  phone: string;
  location: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface ExperienceEntry {
  id: number;
  title: string;
  company: string;
  location?: string;
  years?: string;
  description: string[];
}

export interface EducationEntry {
  id: number;
  institution: string;
  degree: string;
  years?: string;
  description?: string;
}

export interface ProjectEntry {
  id: number;
  name: string;
  role?: string;
  years?: string;
  description: string[];
}

export interface SkillsSection extends ResumeSkillsSection {
  groups?: SkillGroup[];
}

export interface ResumeDiffSummary {
  total_changes: number;
  additional_items_added: number;
  additional_items_removed: number;
  additional_groups_modified: number;
  descriptions_modified: number;
  high_risk_changes: number;
}

export interface ResumeFieldDiff {
  field_path: string;
  field_type:
    | 'additional_item'
    | 'additional_group'
    | 'description'
    | 'summary'
    | 'experience'
    | 'experience_title'
    | 'education'
    | 'project'
    | 'project_title'
    | 'personal_info'
    | 'bold_keywords';
  change_type: 'added' | 'removed' | 'modified';
  original_value?: string;
  new_value?: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface ResumeChange {
  path: string;
  action: 'replace' | 'append' | 'remove' | 'reorder' | 'regroup';
  original?: string;
  value: string | string[] | Array<Record<string, unknown>>;
  reason: string;
}

export interface TailoringStageBreakdown {
  llm_declared_changes: number;
  llm_computed_changes: number;
  llm_applied_changes: number;
  llm_rejected_changes: number;
  cleanup_only_changes: number;
  numeric_claim_changes: number;
  numeric_claim_rejections: number;
  skill_changes: number;
  final_render_changes: number;
  location_source: 'jd' | 'master' | 'none';
  location_value?: string | null;
}

export type SkillsObservationTag = 'unchanged' | 'added' | 'removed' | 'moved';

export interface SkillsObservationValueRow {
  text: string;
  change_tag: SkillsObservationTag | string;
  why?: string | null;
}

export interface SkillsObservationGroupRow {
  group_id: string;
  group_label?: string;
  group_why?: string | null;
  values: SkillsObservationValueRow[];
  removed?: Array<{ text: string; change_tag?: string }>;
}

export interface SkillsObservationPayload {
  version: number;
  groups: SkillsObservationGroupRow[];
}

export interface PipelineTimingEntry {
  host_event: string;
  sub_event?: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  metadata?: Record<string, unknown> | null;
}

export interface PipelineTimingSummary {
  started_at: string;
  ended_at: string;
  total_duration_ms: number;
  entries: PipelineTimingEntry[];
  grouped_wall_clock_ms?: Record<string, number>;
  llm_operations?: Array<{
    operation: string;
    total_latency_ms: number;
    call_count: number;
    successes: number;
    failures: number;
  }>;
}

export interface ResumePreview {
  personalInfo: PersonalInfo;
  summary?: string;
  workExperience: ExperienceEntry[];
  education: EducationEntry[];
  personalProjects: ProjectEntry[];
  skills: SkillsSection;
}

export interface Data {
  request_id: string;
  resume_id: string | null;
  application_pack_id?: string | null;
  generation_run_id?: string | null;
  job_id: string;
  resume_preview: ResumePreview;
  details?: string;
  commentary?: string;
  improvements?: {
    suggestion: string;
    lineNumber?: string | number;
  }[];
  original_resume_markdown?: string;
  updated_resume_markdown?: string;
  job_description?: string;
  job_keywords?: string;
  cover_letter?: string;
  outreach_message?: string;
  artifacts?: ArtifactSummary[];
  theme_settings?: RenderThemeSettings | null;
  warnings?: string[];
  diff_summary?: ResumeDiffSummary;
  detailed_changes?: ResumeFieldDiff[];
  change_manifest?: ResumeChange[];
  change_breakdown?: TailoringStageBreakdown;
  pipeline_timing?: PipelineTimingSummary | null;
  bold_keywords?: string[];
  /** Server-side QA projection; not rendered on PDF. */
  skills_observability?: SkillsObservationPayload | null;
}

export interface ImprovedResult {
  data: Data;
}

interface ContextValue {
  improvedData: ImprovedResult | null;
  setImprovedData: (data: ImprovedResult) => void;
}

const ResumePreviewContext = createContext<ContextValue | undefined>(undefined);

export function ResumePreviewProvider({ children }: { children: ReactNode }) {
  const [improvedData, setImprovedData] = useState<ImprovedResult | null>(null);
  return (
    <ResumePreviewContext.Provider value={{ improvedData, setImprovedData }}>
      {children}
    </ResumePreviewContext.Provider>
  );
}

export function useResumePreview(): ContextValue {
  const ctx = useContext(ResumePreviewContext);
  if (!ctx) throw new Error('useResumePreview must be used within ResumePreviewProvider');
  return ctx;
}
