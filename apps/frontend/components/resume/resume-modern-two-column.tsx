import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type {
  ResumeData,
  ResumeSectionHeadings,
  ResumeFallbackLabels,
} from '@/components/dashboard/resume-component';
import { getSortedSections, getSectionMeta } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import {
  getEducationCredential,
  getEducationDate,
  getEducationHighlights,
  getEducationSummary,
  getExperienceDate,
  getExperienceHighlights,
  getExperiencePosition,
  getExperienceSummary,
  getExtraContactEntries,
  getPersonalHeadline,
  getProjectDate,
  getProjectHighlights,
  getProjectSummary,
} from '@/lib/utils/rendercv-fields';
import { DynamicResumeSection } from './dynamic-resume-section';
import { AdditionalGroupSection } from './additional-group-section';
import { SafeHtml } from './safe-html';
import baseStyles from './styles/_base.module.css';
import styles from './styles/modern-two-column.module.css';

interface ResumeModernTwoColumnProps {
  data: ResumeData;
  showContactIcons?: boolean;
  sectionHeadings?: Partial<ResumeSectionHeadings>;
  fallbackLabels?: Partial<ResumeFallbackLabels>;
}

/**
 * Modern Two-Column Resume Template
 *
 * Two-column layout with modern colorful accents and customizable theme colors.
 * Combines the efficiency of two-column layout with vibrant modern design.
 *
 * Main Column (65%): Summary, Experience, Projects, Custom Sections
 * Sidebar (35%): Education, Additional Details, Links
 *
 * Best for professionals who want modern aesthetics with space-efficient layout.
 */
export const ResumeModernTwoColumn: React.FC<ResumeModernTwoColumnProps> = ({
  data,
  showContactIcons = false,
  sectionHeadings,
  fallbackLabels,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, skills } = data;

  // Get sorted visible sections
  const sortedSections = getSortedSections(data);

  // Get all sections (including hidden) for visibility checks
  const allSections = getSectionMeta(data);

  const headingFallbacks: ResumeSectionHeadings = {
    summary: sectionHeadings?.summary ?? 'Summary',
    experience: sectionHeadings?.experience ?? 'Experience',
    education: sectionHeadings?.education ?? 'Education',
    projects: sectionHeadings?.projects ?? 'Projects',
    certifications: sectionHeadings?.certifications ?? 'Training & Certifications',
    skills: sectionHeadings?.skills ?? 'Skills',
    languages: sectionHeadings?.languages ?? 'Languages',
    awards: sectionHeadings?.awards ?? 'Awards',
    links: sectionHeadings?.links ?? 'Links',
  };

  const nameFallback = fallbackLabels?.name ?? 'Your Name';

  // Get section display name from metadata
  const getSectionDisplayName = (sectionKey: string, fallback: string): string => {
    const section = sortedSections.find((s) => s.key === sectionKey);
    return section?.displayName || fallback;
  };

  // Check if a section is visible (use allSections, not sortedSections)
  const isSectionVisible = (sectionKey: string): boolean => {
    const section = allSections.find((s) => s.key === sectionKey);
    return section?.isVisible ?? true;
  };

  // Get custom sections (non-default)
  const customSections = sortedSections.filter((s) => !s.isDefault);
  const extraConnections = getExtraContactEntries(personalInfo);

  // Icon mapping for contact types
  const contactIcons: Record<string, React.ReactNode> = {
    Email: <Mail size={12} />,
    Phone: <Phone size={12} />,
    Location: <MapPin size={12} />,
    Website: <Globe size={12} />,
    LinkedIn: <Linkedin size={12} />,
    GitHub: <Github size={12} />,
  };

  // Helper function to render contact details
  const renderContactDetail = (
    label: string,
    value?: string,
    hrefPrefix: string = '',
    options?: { displayText?: string; href?: string }
  ) => {
    if (!value) return null;

    let finalHrefPrefix = hrefPrefix;
    if (
      ['Website', 'LinkedIn', 'GitHub'].includes(label) &&
      !value.startsWith('http') &&
      !value.startsWith('//')
    ) {
      finalHrefPrefix = 'https://';
    }

    const href = options?.href || finalHrefPrefix + value;
    const isLink =
      Boolean(options?.href) ||
      finalHrefPrefix.startsWith('http') ||
      finalHrefPrefix.startsWith('mailto:') ||
      finalHrefPrefix.startsWith('tel:');

    let displayText = options?.displayText || value;
    if (isLink && (label === 'LinkedIn' || label === 'GitHub' || label === 'Website')) {
      displayText = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }

    return (
      <span className="inline-flex items-center gap-1">
        {showContactIcons && contactIcons[label]}
        {isLink ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${baseStyles['resume-link']} hover:underline`}
          >
            {displayText}
          </a>
        ) : (
          <span style={{ color: 'var(--resume-text-primary)' }}>{displayText}</span>
        )}
      </span>
    );
  };

  return (
    <>
      {/* Header */}
      <div className={baseStyles['resume-header']}>
        <h1 className={`${baseStyles['resume-name']} ${styles.nameAccent}`}>
          {personalInfo?.name || nameFallback}
        </h1>
        {getPersonalHeadline(personalInfo) && (
          <div className={`${baseStyles['resume-title']} mt-1`}>
            {getPersonalHeadline(personalInfo)}
          </div>
        )}
        {personalInfo && (
          <div className={`${baseStyles['resume-meta']} flex flex-wrap gap-x-3 gap-y-1 mt-2`}>
            {renderContactDetail('Email', personalInfo.email, 'mailto:')}
            {renderContactDetail('Phone', personalInfo.phone, 'tel:')}
            {renderContactDetail('Location', personalInfo.location)}
            {extraConnections.map((entry) => (
              <React.Fragment key={`${entry.label}-${entry.displayValue}-${entry.href || ''}`}>
                {renderContactDetail(entry.label, entry.displayValue, '', {
                  displayText: entry.displayValue,
                  href: entry.href,
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Two-Column Grid */}
      <div className={styles.grid}>
        {/* Main Column - Left */}
        <div className={styles.mainColumn}>
          {/* Summary Section */}
          {isSectionVisible('summary') && summary && (
            <div className={baseStyles['resume-section']}>
              <h3 className={styles.sectionTitleAccent}>
                {getSectionDisplayName('summary', headingFallbacks.summary)}
              </h3>
              <p className={`text-justify ${baseStyles['resume-text']}`}>{summary}</p>
            </div>
          )}

          {/* Experience Section */}
          {isSectionVisible('workExperience') && workExperience && workExperience.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={styles.sectionTitleAccent}>
                {getSectionDisplayName('workExperience', headingFallbacks.experience)}
              </h3>
              <div className={baseStyles['resume-items']}>
                {workExperience.map((exp) => (
                  <div key={exp.id} className={baseStyles['resume-item']}>
                    <div
                      className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                    >
                      <h4 className={baseStyles['resume-item-title-sm']}>
                        {getExperiencePosition(exp)}
                      </h4>
                      {getExperienceDate(exp) && (
                        <span className={`${baseStyles['resume-date']} ml-4`}>
                          {formatDateRange(getExperienceDate(exp))}
                        </span>
                      )}
                    </div>

                    <div
                      className={`flex justify-between items-center ${baseStyles['resume-row-tight']} ${baseStyles['resume-item-subtitle-sm']}`}
                    >
                      <span>
                        {exp.company}
                        {exp.location && <> • {exp.location}</>}
                      </span>
                    </div>

                    {getExperienceSummary(exp) && (
                      <p className={baseStyles['resume-text-xs']}>
                        <SafeHtml html={getExperienceSummary(exp)} />
                      </p>
                    )}
                    {getExperienceHighlights(exp).length > 0 && (
                      <ul
                        className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                      >
                        {getExperienceHighlights(exp).map((desc, index) => (
                          <li key={index} className="flex">
                            <span className="mr-1.5 flex-shrink-0">•&nbsp;</span>
                            <span>
                              <SafeHtml html={desc} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects Section */}
          {isSectionVisible('personalProjects') &&
            personalProjects &&
            personalProjects.length > 0 && (
              <div className={baseStyles['resume-section']}>
                <h3 className={styles.sectionTitleAccent}>
                  {getSectionDisplayName('personalProjects', headingFallbacks.projects)}
                </h3>
                <div className={baseStyles['resume-items']}>
                  {personalProjects.map((project) => (
                    <div key={project.id} className={baseStyles['resume-item']}>
                      <div
                        className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                      >
                        <div className="flex items-baseline gap-1.5">
                          <h4 className={baseStyles['resume-item-title-sm']}>{project.name}</h4>
                          {(project.github || project.website) && (
                            <span className="flex gap-1">
                              {project.github && (
                                <a
                                  href={
                                    project.github.startsWith('http')
                                      ? project.github
                                      : `https://${project.github}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={baseStyles['resume-link-pill']}
                                >
                                  <Github size={9} />
                                  {project.github
                                    .replace(/^https?:\/\//, '')
                                    .replace(/^www\./, '')
                                    .replace(/\/$/, '')}
                                </a>
                              )}
                              {project.website && (
                                <a
                                  href={
                                    project.website.startsWith('http')
                                      ? project.website
                                      : `https://${project.website}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={baseStyles['resume-link-pill']}
                                >
                                  <ExternalLink size={9} />
                                  {project.website
                                    .replace(/^https?:\/\//, '')
                                    .replace(/^www\./, '')
                                    .replace(/\/$/, '')}
                                </a>
                              )}
                            </span>
                          )}
                        </div>
                        {getProjectDate(project) && (
                          <span className={`${baseStyles['resume-date']} ml-2`}>
                            {formatDateRange(getProjectDate(project))}
                          </span>
                        )}
                      </div>
                      {getProjectSummary(project) && (
                        <div
                          className={`${baseStyles['resume-row-tight']} ${baseStyles['resume-item-subtitle-sm']}`}
                        >
                          <span>{getProjectSummary(project)}</span>
                        </div>
                      )}
                      {getProjectHighlights(project).length > 0 && (
                        <ul
                          className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                        >
                          {getProjectHighlights(project).map((desc, index) => (
                            <li key={index} className="flex">
                              <span className="mr-1.5 flex-shrink-0">•&nbsp;</span>
                              <span>
                                <SafeHtml html={desc} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Custom Sections - Main column */}
          {customSections.map((section) => (
            <DynamicResumeSection key={section.id} sectionMeta={section} resumeData={data} />
          ))}
        </div>

        {/* Sidebar Column - Right */}
        <div className={styles.sidebarColumn}>
          {/* Education Section */}
          {isSectionVisible('education') && education && education.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3
                className={`${baseStyles['resume-section-title-sm']} text-[var(--resume-accent-primary)]`}
              >
                {getSectionDisplayName('education', headingFallbacks.education)}
              </h3>
              <div className={baseStyles['resume-stack']}>
                {education.map((edu) => (
                  <div key={edu.id}>
                    <h4
                      className={`${baseStyles['resume-item-title-sm']} ${baseStyles['sidebar-text-wrap']}`}
                    >
                      {edu.institution}
                      {getEducationDate(edu) && (
                        <span
                          className={`font-normal ${baseStyles['resume-date']} ${baseStyles['text-muted']}`}
                        >
                          {' '}
                          | {formatDateRange(getEducationDate(edu))}
                        </span>
                      )}
                    </h4>
                    <p className={baseStyles['resume-item-subtitle-sm']}>
                      {getEducationCredential(edu)}
                    </p>
                    {edu.location && (
                      <p className={`${baseStyles['resume-text-xs']} ${baseStyles['resume-meta']}`}>
                        {edu.location}
                      </p>
                    )}
                    {getEducationSummary(edu) && (
                      <p className={`${baseStyles['resume-text-xs']} ${baseStyles['resume-meta']}`}>
                        {getEducationSummary(edu)}
                      </p>
                    )}
                    {getEducationHighlights(edu).length > 0 && (
                      <ul
                        className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-xs']}`}
                      >
                        {getEducationHighlights(edu).map((highlight, index) => (
                          <li key={index} className="flex">
                            <span className="mr-1.5 flex-shrink-0">•&nbsp;</span>
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSectionVisible('skills') && (
            <AdditionalGroupSection
              skills={skills}
              displayName={getSectionDisplayName('skills', headingFallbacks.skills)}
              className={baseStyles['resume-section']}
              headingClassName={`${baseStyles['resume-section-title-sm']} text-[var(--resume-accent-primary)]`}
              bodyClassName={baseStyles['resume-stack']}
              rowClassName={`flex-col gap-0.5 ${baseStyles['resume-text-xs']}`}
              labelClassName="font-bold"
              valueClassName={baseStyles['sidebar-text-wrap']}
            />
          )}

          {/* Links Section */}
          {personalInfo && extraConnections.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3
                className={`${baseStyles['resume-section-title-sm']} text-[var(--resume-accent-primary)]`}
              >
                {headingFallbacks.links}
              </h3>
              <div
                className={`${baseStyles['resume-stack-tight']} ${baseStyles['resume-meta-sm']}`}
              >
                {extraConnections.map((entry) => (
                  <div key={`${entry.label}-${entry.displayValue}-${entry.href || ''}`}>
                    {renderContactDetail(entry.label, entry.displayValue, '', {
                      displayText: entry.displayValue,
                      href: entry.href,
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ResumeModernTwoColumn;
