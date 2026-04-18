'use client';

import { useMemo } from 'react';
import { type ResumeData } from '@/components/dashboard/resume-component';
import { segmentTextByKeywords } from '@/lib/utils/keyword-matcher';
import {
  getAdditionalGroupsWithContent,
  getAdditionalGroupDisplayLabel,
} from '@/lib/utils/additional-groups';
import {
  getEducationCredential,
  getEducationDate,
  getEducationHighlights,
  getEducationSummary,
  getExperienceDate,
  getExperienceHighlights,
  getExperiencePosition,
  getExperienceSummary,
  getProjectDate,
  getProjectHighlights,
  getProjectSummary,
} from '@/lib/utils/rendercv-fields';
import { FileUser, Briefcase, GraduationCap, FolderKanban, Wrench } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface HighlightedResumeViewProps {
  resumeData: ResumeData;
  keywords: Set<string>;
}

/**
 * Display resume content with matching keywords highlighted.
 * Shows all resume sections with visual highlighting of JD matches.
 */
export function HighlightedResumeView({ resumeData, keywords }: HighlightedResumeViewProps) {
  const { t } = useTranslations();
  const skillGroups = useMemo(
    () => getAdditionalGroupsWithContent(resumeData.skills ?? resumeData.additional),
    [resumeData.skills, resumeData.additional]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-black/10 bg-white px-2.5 py-1.5">
        <FileUser className="h-3.5 w-3.5 text-gray-500" aria-hidden />
        <h3 className="text-[12px] font-semibold text-gray-800">
          {t('builder.jdMatch.yourResume')}
        </h3>
        <span className="text-[11px] text-gray-500">
          {t('builder.jdMatch.matchingKeywordsHighlighted')}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2.5">
        {/* Summary */}
        {resumeData.summary && (
          <Section title={t('resume.sections.summary')} icon={<FileUser className="w-4 h-4" />}>
            <HighlightedText text={resumeData.summary} keywords={keywords} />
          </Section>
        )}

        {/* Work Experience */}
        {resumeData.workExperience && resumeData.workExperience.length > 0 && (
          <Section title={t('resume.sections.experience')} icon={<Briefcase className="w-4 h-4" />}>
            {resumeData.workExperience.map((exp) => (
              <div key={exp.id} className="mb-4 last:mb-0">
                <div className="font-semibold text-gray-900">
                  <HighlightedText text={getExperiencePosition(exp)} keywords={keywords} />
                  {exp.company && (
                    <span className="text-gray-600">
                      {t('builder.jdMatch.atSeparator')}
                      <HighlightedText text={exp.company} keywords={keywords} />
                    </span>
                  )}
                </div>
                {getExperienceDate(exp) && (
                  <div className="mb-1 text-xs text-gray-500">{getExperienceDate(exp)}</div>
                )}
                {getExperienceSummary(exp) && (
                  <div className="mb-2 text-sm text-gray-700">
                    <HighlightedText text={getExperienceSummary(exp)} keywords={keywords} />
                  </div>
                )}
                {getExperienceHighlights(exp).length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {getExperienceHighlights(exp).map((bullet, i) => (
                      <li key={i} className="text-gray-700">
                        <HighlightedText text={bullet} keywords={keywords} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Education */}
        {resumeData.education && resumeData.education.length > 0 && (
          <Section
            title={t('resume.sections.education')}
            icon={<GraduationCap className="w-4 h-4" />}
          >
            {resumeData.education.map((edu) => (
              <div key={edu.id} className="mb-3 last:mb-0">
                <div className="font-semibold text-gray-900">
                  <HighlightedText text={getEducationCredential(edu)} keywords={keywords} />
                </div>
                {edu.institution && (
                  <div className="text-sm text-gray-600">
                    <HighlightedText text={edu.institution} keywords={keywords} />
                  </div>
                )}
                {(edu.location || getEducationDate(edu)) && (
                  <div className="text-xs text-gray-500">
                    {[edu.location, getEducationDate(edu)].filter(Boolean).join(' | ')}
                  </div>
                )}
                {getEducationSummary(edu) && (
                  <div className="mt-1 text-sm text-gray-700">
                    <HighlightedText text={getEducationSummary(edu)} keywords={keywords} />
                  </div>
                )}
                {getEducationHighlights(edu).length > 0 && (
                  <ul className="mt-1 list-disc list-inside space-y-1 text-sm">
                    {getEducationHighlights(edu).map((bullet, i) => (
                      <li key={i} className="text-gray-700">
                        <HighlightedText text={bullet} keywords={keywords} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Projects */}
        {resumeData.personalProjects && resumeData.personalProjects.length > 0 && (
          <Section
            title={t('resume.sections.projects')}
            icon={<FolderKanban className="w-4 h-4" />}
          >
            {resumeData.personalProjects.map((proj) => (
              <div key={proj.id} className="mb-4 last:mb-0">
                <div className="font-semibold text-gray-900">
                  <HighlightedText text={proj.name || ''} keywords={keywords} />
                  {getProjectSummary(proj) && (
                    <span className="text-gray-600 font-normal">
                      {' '}
                      {t('builder.jdMatch.roleSeparator')}{' '}
                      <HighlightedText text={getProjectSummary(proj)} keywords={keywords} />
                    </span>
                  )}
                </div>
                {getProjectDate(proj) && (
                  <div className="mb-1 text-xs text-gray-500">{getProjectDate(proj)}</div>
                )}
                {getProjectHighlights(proj).length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {getProjectHighlights(proj).map((bullet, i) => (
                      <li key={i} className="text-gray-700">
                        <HighlightedText text={bullet} keywords={keywords} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Skills */}
        {skillGroups.length > 0 && (
          <Section title={t('resume.sections.skills')} icon={<Wrench className="w-4 h-4" />}>
            {skillGroups.map((group, groupIndex) => (
              <div key={`${group.label}-${groupIndex}`} className="mb-3">
                <div className="text-xs font-mono uppercase text-gray-500 mb-1">
                  {getAdditionalGroupDisplayLabel(group, t)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {group.values.map((item, index) => (
                    <SkillTag key={`${group.label}-${index}`} text={item} keywords={keywords} />
                  ))}
                </div>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

/**
 * Section wrapper component
 */
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-black/10 bg-white">
      <div className="flex items-center gap-1.5 border-b border-black/10 bg-gray-50/80 px-2 py-1.5">
        <span className="text-gray-500 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
          {title}
        </span>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

/**
 * Component to render text with highlighted keywords.
 */
function HighlightedText({ text, keywords }: { text: string; keywords: Set<string> }) {
  const segments = useMemo(() => segmentTextByKeywords(text, keywords), [text, keywords]);

  return (
    <span>
      {segments.map((segment, i) =>
        segment.isMatch ? (
          <mark key={i} className="bg-yellow-200 text-black px-0.5">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </span>
  );
}

/**
 * Skill tag with optional highlighting
 */
function SkillTag({ text, keywords }: { text: string; keywords: Set<string> }) {
  const isMatch = keywords.has(text.toLowerCase());

  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs ${
        isMatch ? 'bg-yellow-200 text-black font-medium' : 'bg-[#F0F0E8] text-gray-600'
      }`}
    >
      {text}
    </span>
  );
}
