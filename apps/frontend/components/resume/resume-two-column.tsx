import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type { ResumeData, ResumeSectionHeadings } from '@/components/dashboard/resume-component';
import { getSortedSections, getSectionMeta } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import {
  getEducationCredential,
  getEducationDate,
  getEducationHighlights,
  getEducationSummary,
  RESUME_TECH_STACK_LABEL,
  getExperienceDate,
  getExperienceHighlights,
  getExperiencePosition,
  getExperienceTechStack,
  getExtraContactEntries,
  getPersonalHeadline,
  getProjectDate,
  getProjectHighlights,
  getProjectTechStack,
  personalProjectsVisibleInResume,
} from '@/lib/utils/rendercv-fields';
import { DynamicResumeSection } from './dynamic-resume-section';
import { AdditionalGroupSection } from './additional-group-section';
import { SafeHtml } from './safe-html';
import { SummaryHtml } from './summary-html';
import baseStyles from './styles/_base.module.css';
import styles from './styles/swiss-two-column.module.css';

interface ResumeTwoColumnProps {
  data: ResumeData;
  showContactIcons?: boolean;
  sectionHeadings?: Partial<ResumeSectionHeadings>;
  showSummaryHeading?: boolean;
}

/**
 * Swiss Two-Column Resume Template
 *
 * Two-column layout with experience-focused main column (left) and
 * supporting information sidebar (right).
 *
 * Main Column (62%): Summary, Experience, Projects, Custom Sections
 * Sidebar (38%): Education, Additional Details, Links
 *
 * Best for technical roles with many projects, optimized for one-page resumes.
 */
export const ResumeTwoColumn: React.FC<ResumeTwoColumnProps> = ({
  data,
  showContactIcons = false,
  sectionHeadings,
  showSummaryHeading = false,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, skills } = data;
  const visiblePersonalProjects = personalProjectsVisibleInResume(personalProjects);

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
          <span>{displayText}</span>
        )}
      </span>
    );
  };

  return (
    <>
      {/* Header Section - Centered Layout */}
      {personalInfo && (
        <header
          className={`text-center ${baseStyles['resume-header']} border-b`}
          style={{ borderColor: 'var(--resume-border-primary)' }}
        >
          {/* Name - Centered */}
          {personalInfo.name && (
            <h1 className={`${baseStyles['resume-name']} tracking-tight uppercase mb-1`}>
              {personalInfo.name}
            </h1>
          )}

          {/* Title - Centered, below name */}
          {getPersonalHeadline(personalInfo) && (
            <h2
              className={`${baseStyles['resume-title']} ${baseStyles['resume-meta']} tracking-wide uppercase mb-3`}
            >
              {getPersonalHeadline(personalInfo)}
            </h2>
          )}

          {/* Contact - Own line, centered */}
          <div
            className={`flex flex-wrap justify-center gap-x-1 gap-y-1 ${baseStyles['resume-meta']}`}
          >
            {personalInfo.email && renderContactDetail('Email', personalInfo.email, 'mailto:')}
            {personalInfo.phone && (
              <>
                <span className={baseStyles['text-muted']}>,</span>
                {renderContactDetail('Phone', personalInfo.phone, 'tel:')}
              </>
            )}
            {personalInfo.location && (
              <>
                <span className={baseStyles['text-muted']}>,</span>
                {renderContactDetail('Location', personalInfo.location)}
              </>
            )}
            {extraConnections.map((entry) => (
              <React.Fragment key={`${entry.label}-${entry.displayValue}-${entry.href || ''}`}>
                <span className={baseStyles['text-muted']}>,</span>
                {renderContactDetail(entry.label, entry.displayValue, '', {
                  displayText: entry.displayValue,
                  href: entry.href,
                })}
              </React.Fragment>
            ))}
          </div>
        </header>
      )}

      {/* Two Column Layout - items-start ensures content aligns top while grid maintains equal row height */}
      <div className={styles.grid}>
        {/* Main Column - Left */}
        <div className={styles.mainColumn}>
          {/* Summary Section */}
          {isSectionVisible('summary') && summary && (
            <div className={baseStyles['resume-section']}>
              {showSummaryHeading ? (
                <h3 className={baseStyles['resume-section-title']}>
                  {getSectionDisplayName('summary', headingFallbacks.summary)}
                </h3>
              ) : null}
              <SummaryHtml summary={summary} className={baseStyles['resume-text-sm']} />
            </div>
          )}

          {/* Experience Section */}
          {isSectionVisible('workExperience') && workExperience && workExperience.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title']}>
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
                        <span className={`${baseStyles['resume-date']} ml-2`}>
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

                    {getExperienceTechStack(exp) && (
                      <p className={baseStyles['resume-text-xs']}>
                        <span className="font-semibold">{RESUME_TECH_STACK_LABEL} </span>
                        <SafeHtml html={getExperienceTechStack(exp)} />
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
          {isSectionVisible('personalProjects') && visiblePersonalProjects.length > 0 && (
              <div className={baseStyles['resume-section']}>
                <h3 className={baseStyles['resume-section-title']}>
                  {getSectionDisplayName('personalProjects', headingFallbacks.projects)}
                </h3>
                <div className={baseStyles['resume-items']}>
                  {visiblePersonalProjects.map((project) => (
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
                      {getProjectTechStack(project) && (
                        <p className={baseStyles['resume-text-xs']}>
                          <span className="font-semibold">{RESUME_TECH_STACK_LABEL} </span>
                          <span>{getProjectTechStack(project)}</span>
                        </p>
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
              <h3 className={baseStyles['resume-section-title-sm']}>
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
              headingClassName={baseStyles['resume-section-title-sm']}
              bodyClassName={baseStyles['resume-stack']}
              rowClassName={`flex-col gap-0.5 ${baseStyles['resume-text-xs']}`}
              labelClassName="font-bold"
              valueClassName={baseStyles['sidebar-text-wrap']}
            />
          )}

          {/* Links Section */}
          {personalInfo && extraConnections.length > 0 && (
            <div className={baseStyles['resume-section']}>
              <h3 className={baseStyles['resume-section-title-sm']}>{headingFallbacks.links}</h3>
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

export default ResumeTwoColumn;
