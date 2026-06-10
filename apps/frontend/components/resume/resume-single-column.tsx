import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
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
import styles from './styles/swiss-single.module.css';

interface ResumeSingleColumnProps {
  data: ResumeData;
  showContactIcons?: boolean;
  showSummaryHeading?: boolean;
}

/**
 * Swiss Single-Column Resume Template
 *
 * Traditional full-width layout with sections stacked vertically.
 * Best for detailed experience descriptions and maximum content density.
 *
 * Section order: Determined by sectionMeta ordering
 */
export const ResumeSingleColumn: React.FC<ResumeSingleColumnProps> = ({
  data,
  showContactIcons = false,
  showSummaryHeading = false,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, skills } = data;

  // Get sorted visible sections
  const sortedSections = getSortedSections(data);
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

  // Render a section based on its key
  const renderSection = (section: SectionMeta) => {
    switch (section.key) {
      case 'personalInfo':
        // Personal info is the header - handled separately
        return null;

      case 'summary':
        if (!summary) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            {showSummaryHeading ? (
              <h3 className={baseStyles['resume-section-title']}>{section.displayName}</h3>
            ) : null}
            <SummaryHtml summary={summary} className={baseStyles['resume-text']} />
          </div>
        );

      case 'workExperience':
        if (!workExperience || workExperience.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={baseStyles['resume-section-title']}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {workExperience.map((exp) => (
                <div key={exp.id} className={baseStyles['resume-item']}>
                  <div
                    className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                  >
                    <h4 className={baseStyles['resume-item-title']}>
                      {getExperiencePosition(exp)}
                    </h4>
                    {getExperienceDate(exp) && (
                      <span className={`${baseStyles['resume-date']} ml-4`}>
                        {formatDateRange(getExperienceDate(exp))}
                      </span>
                    )}
                  </div>
                  <div
                    className={`flex justify-between items-center ${baseStyles['resume-row']} ${baseStyles['resume-item-subtitle']}`}
                  >
                    <span>{exp.company}</span>
                    {exp.location && <span>{exp.location}</span>}
                  </div>
                  {getExperienceTechStack(exp) && (
                    <p className={baseStyles['resume-text-sm']}>
                      <span className="font-semibold">{RESUME_TECH_STACK_LABEL} </span>
                      <SafeHtml html={getExperienceTechStack(exp)} />
                    </p>
                  )}
                  {getExperienceHighlights(exp).length > 0 && (
                    <ul
                      className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-sm']}`}
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
        );

      case 'personalProjects': {
        const visibleProjects = personalProjectsVisibleInResume(personalProjects);
        if (visibleProjects.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={baseStyles['resume-section-title']}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {visibleProjects.map((project) => (
                <div key={project.id} className={baseStyles['resume-item']}>
                  <div
                    className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                  >
                    <div className="flex items-baseline gap-2">
                      <h4 className={baseStyles['resume-item-title']}>{project.name}</h4>
                      {(project.github || project.website) && (
                        <span className="flex gap-1.5">
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
                              <Github size={10} />
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
                              <ExternalLink size={10} />
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
                      <span className={`${baseStyles['resume-date']} ml-4`}>
                        {formatDateRange(getProjectDate(project))}
                      </span>
                    )}
                  </div>
                  {getProjectTechStack(project) && (
                    <p className={baseStyles['resume-text-sm']}>
                      <span className="font-semibold">{RESUME_TECH_STACK_LABEL} </span>
                      <span>{getProjectTechStack(project)}</span>
                    </p>
                  )}
                  {getProjectHighlights(project).length > 0 && (
                    <ul
                      className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-sm']}`}
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
        );
      }

      case 'education':
        if (!education || education.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={baseStyles['resume-section-title']}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {education.map((edu) => (
                <div key={edu.id} className={baseStyles['resume-item']}>
                  <div
                    className={`flex justify-between items-baseline ${baseStyles['resume-row-tight']}`}
                  >
                    <h4 className={baseStyles['resume-item-title']}>{edu.institution}</h4>
                    {getEducationDate(edu) && (
                      <span className={`${baseStyles['resume-date']} ml-4`}>
                        {formatDateRange(getEducationDate(edu))}
                      </span>
                    )}
                  </div>
                  <div
                    className={`flex justify-between ${baseStyles['resume-item-subtitle']} ${baseStyles['resume-row-tight']}`}
                  >
                    <span>{getEducationCredential(edu)}</span>
                  </div>
                  {edu.location && (
                    <p className={`${baseStyles['resume-text-sm']} ${baseStyles['resume-meta']}`}>
                      {edu.location}
                    </p>
                  )}
                  {getEducationSummary(edu) && (
                    <p className={baseStyles['resume-text-sm']}>{getEducationSummary(edu)}</p>
                  )}
                  {getEducationHighlights(edu).length > 0 && (
                    <ul
                      className={`ml-4 ${baseStyles['resume-list']} ${baseStyles['resume-text-sm']}`}
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
        );

      case 'skills':
        if (!skills) return null;
        return (
          <AdditionalSection key={section.id} skills={skills} displayName={section.displayName} />
        );

      default:
        // Custom section - render using DynamicResumeSection
        if (!section.isDefault) {
          return <DynamicResumeSection key={section.id} sectionMeta={section} resumeData={data} />;
        }
        return null;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header Section - Centered Layout (always first) */}
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
            {renderContactDetail('Email', personalInfo.email, 'mailto:')}
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

      {/* Render sections in order based on sectionMeta */}
      {sortedSections
        .filter((section) => section.key !== 'personalInfo')
        .map((section) => renderSection(section))}
    </div>
  );
};

/**
 * Additional info section (skills, languages, certifications, awards)
 */
const AdditionalSection: React.FC<{
  skills: ResumeData['skills'];
  displayName?: string;
}> = ({ skills, displayName = 'Skills' }) => {
  return (
    <AdditionalGroupSection
      skills={skills}
      displayName={displayName}
      className={baseStyles['resume-section']}
      headingClassName={baseStyles['resume-section-title']}
      bodyClassName={`${baseStyles['resume-stack']} ${baseStyles['resume-text-sm']}`}
      rowClassName="gap-2"
      labelClassName="w-32 shrink-0 font-bold"
      valueClassName="min-w-0"
    />
  );
};

export default ResumeSingleColumn;
