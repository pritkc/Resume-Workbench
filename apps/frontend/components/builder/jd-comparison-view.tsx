'use client';

import { useMemo } from 'react';
import { type ResumeData } from '@/components/dashboard/resume-component';
import { extractKeywords, calculateMatchStats } from '@/lib/utils/keyword-matcher';
import { flattenAdditionalItems } from '@/lib/utils/additional-groups';
import {
  getEducationCredential,
  getEducationDate,
  getEducationHighlights,
  getEducationSummary,
  getExperienceDate,
  getExperienceHighlights,
  getExperiencePosition,
  getExperienceSummary,
  getPersonalHeadline,
  getProjectDate,
  getProjectHighlights,
  getProjectSummary,
} from '@/lib/utils/rendercv-fields';
import { JDDisplay } from './jd-display';
import { HighlightedResumeView } from './highlighted-resume-view';
import { CheckCircle, Target } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface JDComparisonViewProps {
  jobDescription: string;
  resumeData: ResumeData;
}

/**
 * Split view comparing job description with resume.
 * Left: JD (read-only)
 * Right: Resume with matching keywords highlighted
 */
export function JDComparisonView({ jobDescription, resumeData }: JDComparisonViewProps) {
  const { t } = useTranslations();

  // Extract keywords from JD
  const keywords = useMemo(() => extractKeywords(jobDescription), [jobDescription]);

  // Build full resume text for stats calculation
  const resumeText = useMemo(() => {
    const parts: string[] = [];

    const headline = getPersonalHeadline(resumeData.personalInfo);
    if (headline) parts.push(headline);

    if (resumeData.summary) parts.push(resumeData.summary);

    resumeData.workExperience?.forEach((exp) => {
      const position = getExperiencePosition(exp);
      const date = getExperienceDate(exp);
      const summary = getExperienceSummary(exp);

      if (position) parts.push(position);
      if (exp.company) parts.push(exp.company);
      if (exp.location) parts.push(exp.location);
      if (date) parts.push(date);
      if (summary) parts.push(summary);
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

    resumeData.personalProjects?.forEach((proj) => {
      if (proj.name) parts.push(proj.name);
      const summary = getProjectSummary(proj);
      const date = getProjectDate(proj);

      if (summary) parts.push(summary);
      if (date) parts.push(date);
      getProjectHighlights(proj).forEach((d) => parts.push(d));
    });

    flattenAdditionalItems(resumeData.skills ?? resumeData.additional).forEach((item) =>
      parts.push(item)
    );

    return parts.join(' ');
  }, [resumeData]);

  // Calculate match statistics
  const stats = useMemo(() => calculateMatchStats(resumeText, keywords), [resumeText, keywords]);

  return (
    <div className="h-full flex flex-col">
      {/* Stats Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-mono">
              {t('builder.jdMatch.stats.keywordsExtracted', { count: keywords.size })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-mono">
              {t('builder.jdMatch.stats.matchesFound', { count: stats.matchCount })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-gray-600">
            {t('builder.jdMatch.stats.matchRateLabel')}
          </span>
          <span
            className={`text-lg font-bold ${
              stats.matchPercentage >= 50
                ? 'text-green-600'
                : stats.matchPercentage >= 30
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}
          >
            {stats.matchPercentage}%
          </span>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* Left: JD */}
        <div className="border-r border-gray-200 overflow-hidden">
          <JDDisplay content={jobDescription} />
        </div>

        {/* Right: Resume with highlights */}
        <div className="overflow-hidden">
          <HighlightedResumeView resumeData={resumeData} keywords={keywords} />
        </div>
      </div>
    </div>
  );
}
