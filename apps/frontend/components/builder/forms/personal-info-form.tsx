'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PersonalInfo } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { getEditableProfileLinks } from '@/lib/utils/rendercv-fields';
import { InlineResumeField, ResumeCanvasAddLink } from '../inline-resume-field';

interface PersonalInfoFormProps {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
}

function inferIconFromUrl(url: string): string | null {
  const normalized = url.toLowerCase();
  if (normalized.includes('linkedin.com')) return 'linkedin-in';
  if (normalized.includes('github.com')) return 'github';
  if (normalized.includes('twitter.com') || normalized.includes('x.com')) return 'x-twitter';
  return null;
}

function inferLabelFromUrl(url: string): string {
  const normalized = url.toLowerCase();
  if (normalized.includes('linkedin.com')) return 'LinkedIn';
  if (normalized.includes('github.com')) return 'GitHub';
  if (normalized.includes('twitter.com') || normalized.includes('x.com')) return 'X';
  return 'Link';
}

function displayLinkLabel(label: string | undefined, url: string | null | undefined): string {
  const trimmed = label?.trim();
  if (trimmed) return trimmed;
  if (url) return inferLabelFromUrl(url);
  return 'Link';
}

export const PersonalInfoForm: React.FC<PersonalInfoFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const profileLinks = getEditableProfileLinks(data);
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<number, boolean>>({});
  const [showExtras, setShowExtras] = useState(false);

  const buildLegacyProfileState = (
    links: Array<{
      label?: string;
      url?: string | null;
      fontawesome_icon?: string | null;
      fontAwesomeIcon?: string | null;
    }>
  ) => {
    let website = '';
    let linkedin = '';
    let github = '';
    const customConnections: NonNullable<PersonalInfo['customConnections']> = [];
    const socialNetworks: NonNullable<PersonalInfo['socialNetworks']> = [];

    links.forEach((item) => {
      const label = item.label?.trim() || '';
      const normalizedLabel = label.toLowerCase();
      const url = item.url || null;
      const icon = item.fontawesome_icon || item.fontAwesomeIcon || null;

      if (!label && !url) {
        return;
      }

      if (normalizedLabel === 'website' && url && !website) {
        website = url;
        return;
      }

      if (normalizedLabel === 'linkedin' && url && !linkedin) {
        linkedin = url;
        socialNetworks.push({ network: 'LinkedIn', username: url });
        return;
      }

      if (normalizedLabel === 'github' && url && !github) {
        github = url;
        socialNetworks.push({ network: 'GitHub', username: url });
        return;
      }

      customConnections.push({
        placeholder: label,
        url,
        fontawesome_icon: icon,
        fontAwesomeIcon: icon,
      });
    });

    return {
      website,
      linkedin,
      github,
      customConnections,
      socialNetworks,
    };
  };

  const handleChange = (field: keyof PersonalInfo, value: string) => {
    if (field === 'headline' || field === 'title') {
      onChange({
        ...data,
        headline: value,
        title: value,
      });
      return;
    }

    if (field === 'photo' || field === 'photoUrl') {
      onChange({
        ...data,
        photo: value || null,
        photoUrl: value || null,
      });
      return;
    }

    onChange({
      ...data,
      [field]: value,
    });
  };

  const handleProfileLinkChange = (
    index: number,
    field: 'label' | 'url' | 'fontawesome_icon',
    value: string
  ) => {
    const nextProfileLinks = [...profileLinks];
    const current = { ...nextProfileLinks[index], [field]: value || null };
    if (field === 'fontawesome_icon') {
      current.fontAwesomeIcon = value || null;
    }
    if (field === 'url' && value) {
      if (!current.label) {
        current.label = inferLabelFromUrl(value);
      }
      if (!current.fontawesome_icon && !current.fontAwesomeIcon) {
        const inferred = inferIconFromUrl(value);
        if (inferred) {
          current.fontawesome_icon = inferred;
          current.fontAwesomeIcon = inferred;
        }
      }
    }
    nextProfileLinks[index] = current;
    onChange({
      ...data,
      ...buildLegacyProfileState(nextProfileLinks),
      profileLinks: nextProfileLinks,
    });
  };

  const handleAddProfileLink = () => {
    const nextProfileLinks = [
      ...profileLinks,
      { label: '', url: null, fontawesome_icon: null, fontAwesomeIcon: null },
    ];
    onChange({
      ...data,
      ...buildLegacyProfileState(nextProfileLinks),
      profileLinks: nextProfileLinks,
    });
  };

  const handleRemoveProfileLink = (index: number) => {
    const nextProfileLinks = profileLinks.filter((_, itemIndex) => itemIndex !== index);
    onChange({
      ...data,
      ...buildLegacyProfileState(nextProfileLinks),
      profileLinks: nextProfileLinks,
    });
  };

  const toggleAdvanced = (index: number) => {
    setExpandedAdvanced((current) => ({ ...current, [index]: !current[index] }));
  };

  return (
    <div className="resume-canvas-header group/header">
      <div className="resume-canvas-header-inner">
        <InlineResumeField
          pasteMode="plainTextSingleParagraph"
          id="name"
          value={data.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder={t('builder.personalInfoForm.placeholders.name')}
          fieldSize="hero"
          align="center"
          aria-label={t('resume.personalInfo.name')}
        />
        <InlineResumeField
          pasteMode="plainTextSingleParagraph"
          id="headline"
          value={data.headline || data.title || ''}
          onChange={(e) => handleChange('headline', e.target.value)}
          placeholder={t('builder.personalInfoForm.placeholders.title')}
          fieldSize="small"
          align="center"
          className="resume-canvas-field-headline resume-canvas-field-meta"
          aria-label="Headline"
        />

        <div className="resume-canvas-header-contact">
          <InlineResumeField
            pasteMode="plainTextSingleParagraph"
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.location')}
            fieldSize="small"
            align="center"
            className="resume-canvas-field-meta max-w-[9rem]"
            aria-label={t('resume.personalInfo.location')}
          />
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <InlineResumeField
            pasteMode="plainTextSingleParagraph"
            type="email"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.email')}
            fieldSize="small"
            align="center"
            className="resume-canvas-field-meta max-w-[12rem]"
            aria-label={t('resume.personalInfo.email')}
          />
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <InlineResumeField
            pasteMode="plainTextSingleParagraph"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.phone')}
            fieldSize="small"
            align="center"
            className="resume-canvas-field-meta max-w-[9rem]"
            aria-label={t('resume.personalInfo.phone')}
          />

          {profileLinks.map((item, index) => (
            <React.Fragment key={index}>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <span className="resume-canvas-header-link-item group/link">
                <InlineResumeField
                  pasteMode="plainTextSingleParagraph"
                  value={item.url || ''}
                  onChange={(e) => handleProfileLinkChange(index, 'url', e.target.value)}
                  placeholder={displayLinkLabel(item.label, item.url).toLowerCase()}
                  fieldSize="small"
                  className="resume-canvas-field-meta max-w-[8.5rem]"
                  aria-label={displayLinkLabel(item.label, item.url)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.delete')}
                  onClick={() => handleRemoveProfileLink(index)}
                  className="h-4 w-4 shrink-0 text-red-600/70 opacity-0 hover:text-red-600 group-hover/link:opacity-100"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </span>
            </React.Fragment>
          ))}

          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <ResumeCanvasAddLink onClick={handleAddProfileLink} className="text-[10px]">
            + link
          </ResumeCanvasAddLink>

          {!showExtras ? (
            <button
              type="button"
              className="resume-canvas-header-advanced-toggle"
              onClick={() => setShowExtras(true)}
            >
              · extras
            </button>
          ) : null}
        </div>
      </div>

      {showExtras ? (
        <div className="resume-canvas-header-extras">
          <InlineResumeField
            pasteMode="plainTextSingleParagraph"
            value={data.website || ''}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder="Website"
            fieldSize="small"
            className="resume-canvas-field-meta max-w-[12rem]"
            aria-label="Website"
          />
          <InlineResumeField
            pasteMode="plainTextSingleParagraph"
            value={data.photo || data.photoUrl || ''}
            onChange={(e) => handleChange('photo', e.target.value)}
            placeholder="Photo URL"
            fieldSize="small"
            className="resume-canvas-field-meta max-w-[12rem]"
            aria-label="Photo URL"
          />
          {profileLinks.map((item, index) => {
            const showAdvanced = expandedAdvanced[index] ?? false;
            return (
              <div key={`adv-${index}`} className="inline-flex items-center gap-1">
                <InlineResumeField
                  pasteMode="plainTextSingleParagraph"
                  value={item.label || ''}
                  onChange={(e) => handleProfileLinkChange(index, 'label', e.target.value)}
                  placeholder="Label"
                  fieldSize="small"
                  className="w-16 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => toggleAdvanced(index)}
                  className="inline-flex items-center text-[10px] text-muted-foreground"
                  aria-label="Link icon"
                >
                  {showAdvanced ? (
                    <ChevronUp className="h-3 w-3" aria-hidden />
                  ) : (
                    <ChevronDown className="h-3 w-3" aria-hidden />
                  )}
                </button>
                {showAdvanced ? (
                  <InlineResumeField
                    pasteMode="plainTextSingleParagraph"
                    value={item.fontawesome_icon || item.fontAwesomeIcon || ''}
                    onChange={(e) =>
                      handleProfileLinkChange(index, 'fontawesome_icon', e.target.value)
                    }
                    placeholder={t('builder.personalInfoForm.iconPlaceholder')}
                    fieldSize="small"
                    className="w-20"
                  />
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="resume-canvas-header-advanced-toggle"
            onClick={() => setShowExtras(false)}
          >
            hide extras
          </button>
        </div>
      ) : null}
    </div>
  );
};
