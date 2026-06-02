'use client';

import { useMemo } from 'react';
import { type ResumeData } from '@/components/dashboard/resume-component';
import {
  extractKeywords,
  calculateMatchStats,
  getMissingKeywords,
} from '@/lib/utils/keyword-matcher';
import { flattenAdditionalItems } from '@/lib/utils/additional-groups';
import {
  getEducationCredential,
  getEducationDate,
  getEducationHighlights,
  getEducationSummary,
  getExperienceDate,
  getExperienceHighlights,
  getExperiencePosition,
  getExperienceTechStack,
  getPersonalHeadline,
  getProjectDate,
  getProjectHighlights,
  getProjectTechStack,
  personalProjectsVisibleInResume,
} from '@/lib/utils/rendercv-fields';
import { JDDisplay } from './jd-display';
import { HighlightedResumeView } from './highlighted-resume-view';
import { CheckCircle, Target } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface JDComparisonViewProps {
  jobDescription: string;
  resumeData: ResumeData;
}

function buildResumeText(resumeData: ResumeData): string {
  const parts: string[] = [];

  const headline = getPersonalHeadline(resumeData.personalInfo);
  if (headline) parts.push(headline);

  if (resumeData.summary) parts.push(resumeData.summary);

  resumeData.workExperience?.forEach((exp) => {
    const position = getExperiencePosition(exp);
    const date = getExperienceDate(exp);
    const techStack = getExperienceTechStack(exp);

    if (position) parts.push(position);
    if (exp.company) parts.push(exp.company);
    if (exp.location) parts.push(exp.location);
    if (date) parts.push(date);
    if (techStack) parts.push(techStack);
    getExperienceHighlights(exp).forEach((d) => parts.push(d));
  });

  resumeData.education?.forEach((edu) => {
    const credential = getEducationCredential(edu);
    const date = getEducationDate(edu);
    const summary = getEducationSummary(edu);

    if (credential) parts.push(credential);
    if (edu.institution) parts.push(edu.institution);
    if (edu.location) parts.push(edu.location);
    if (date) parts.push(date);
    if (summary) parts.push(summary);
    getEducationHighlights(edu).forEach((d) => parts.push(d));
  });

  personalProjectsVisibleInResume(resumeData.personalProjects).forEach((proj) => {
    if (proj.name) parts.push(proj.name);
    const techStack = getProjectTechStack(proj);
    const date = getProjectDate(proj);

    if (techStack) parts.push(techStack);
    if (date) parts.push(date);
    getProjectHighlights(proj).forEach((d) => parts.push(d));
  });

  flattenAdditionalItems(resumeData.skills ?? resumeData.additional).forEach((item) =>
    parts.push(item)
  );

  return parts.join(' ');
}

/**
 * Split view comparing job description with resume.
 * Left: JD (read-only)
 * Right: Resume with matching keywords highlighted
 */
export function JDComparisonView({ jobDescription, resumeData }: JDComparisonViewProps) {
  const { t } = useTranslations();

  const keywords = useMemo(() => extractKeywords(jobDescription), [jobDescription]);
  const resumeText = useMemo(() => buildResumeText(resumeData), [resumeData]);
  const stats = useMemo(() => calculateMatchStats(resumeText, keywords), [resumeText, keywords]);
  const missingKeywords = useMemo(
    () => getMissingKeywords(resumeText, keywords, 10),
    [resumeText, keywords]
  );

  const matchTone =
    stats.matchPercentage >= 50
      ? 'text-green-700 bg-green-50 border-green-200'
      : stats.matchPercentage >= 30
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-red-700 bg-red-50 border-red-200';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-card px-2 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span>{t('builder.jdMatch.stats.keywordsExtracted', { count: keywords.size })}</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 text-green-700" aria-hidden />
              <span>{t('builder.jdMatch.stats.matchesFound', { count: stats.matchCount })}</span>
            </div>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-none border px-3 py-1 ${matchTone}`}
          >
            <span className="text-[12px] font-medium">
              {t('builder.jdMatch.stats.matchRateLabel')}
            </span>
            <span className="text-xl font-bold tabular-nums">{stats.matchPercentage}%</span>
          </div>
        </div>

        {missingKeywords.length > 0 ? (
          <div className="mt-2 border-t border-border/5 pt-2">
            <p className="builder-field-caption mb-1.5">
              {t('builder.jdMatch.stats.missingKeywordsTitle')}
            </p>
            <div className="flex flex-wrap gap-1">
              {missingKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex border border-border bg-accent px-1.5 py-0.5 font-sans text-[11px] text-accent-foreground"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <div className="min-h-0 overflow-hidden border-b border-border md:border-b-0 md:border-r">
          <JDDisplay content={jobDescription} />
        </div>
        <div className="min-h-0 overflow-hidden">
          <HighlightedResumeView resumeData={resumeData} keywords={keywords} />
        </div>
      </div>
    </div>
  );
}
