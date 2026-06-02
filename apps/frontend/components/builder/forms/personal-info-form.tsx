'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PersonalInfo } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { getEditableProfileLinks } from '@/lib/utils/rendercv-fields';
import { cn } from '@/lib/utils';
import { BuilderFormField } from '../builder-form-field';

interface PersonalInfoFormProps {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
}

const inputClass = 'builder-field-input w-full';

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
  return '';
}

export const PersonalInfoForm: React.FC<PersonalInfoFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const profileLinks = getEditableProfileLinks(data);
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<number, boolean>>({});

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
    <div className="entry-card-editor space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <BuilderFormField label={t('resume.personalInfo.name')} htmlFor="name">
          <Input
            pasteMode="plainTextSingleParagraph"
            id="name"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.name')}
            className={inputClass}
          />
        </BuilderFormField>
        <BuilderFormField label="Headline" htmlFor="headline">
          <Input
            pasteMode="plainTextSingleParagraph"
            id="headline"
            value={data.headline || data.title || ''}
            onChange={(e) => handleChange('headline', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.title')}
            className={inputClass}
          />
        </BuilderFormField>
        <BuilderFormField
          label={t('resume.personalInfo.location')}
          htmlFor="location"
          className="sm:col-span-2"
        >
          <Input
            pasteMode="plainTextSingleParagraph"
            id="location"
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.location')}
            className={inputClass}
          />
        </BuilderFormField>
        <BuilderFormField label={t('resume.personalInfo.email')} htmlFor="email">
          <Input
            pasteMode="plainTextSingleParagraph"
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.email')}
            className={inputClass}
          />
        </BuilderFormField>
        <BuilderFormField label={t('resume.personalInfo.phone')} htmlFor="phone">
          <Input
            pasteMode="plainTextSingleParagraph"
            id="phone"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.phone')}
            className={inputClass}
          />
        </BuilderFormField>
        <BuilderFormField label="Photo URL" htmlFor="photo" className="sm:col-span-2">
          <Input
            pasteMode="plainTextSingleParagraph"
            id="photo"
            value={data.photo || data.photoUrl || ''}
            onChange={(e) => handleChange('photo', e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </BuilderFormField>
        <BuilderFormField label="Website" htmlFor="website" className="sm:col-span-2">
          <Input
            pasteMode="plainTextSingleParagraph"
            id="website"
            value={data.website || ''}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </BuilderFormField>
      </div>

      <div className="border-t border-border pt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="builder-field-label block">Connections</span>
          <button
            type="button"
            onClick={handleAddProfileLink}
            className="builder-field-caption underline decoration-black/20 underline-offset-2 hover:text-foreground"
          >
            + Add link
          </button>
        </div>
        {profileLinks.length === 0 ? (
          <p className="builder-field-caption">No extra links.</p>
        ) : (
          <div className="space-y-2">
            {profileLinks.map((item, index) => {
              const showAdvanced = expandedAdvanced[index] ?? false;
              return (
                <div
                  key={index}
                  className="space-y-1 border-b border-border/5 pb-2 last:border-0 last:pb-0"
                >
                  <div className="field-row flex items-center gap-1.5">
                    <Input
                      pasteMode="plainTextSingleParagraph"
                      value={item.label || ''}
                      onChange={(e) => handleProfileLinkChange(index, 'label', e.target.value)}
                      placeholder="Label"
                      className={cn(inputClass, 'w-28 shrink-0 sm:w-32')}
                    />
                    <Input
                      pasteMode="plainTextSingleParagraph"
                      value={item.url || ''}
                      onChange={(e) => handleProfileLinkChange(index, 'url', e.target.value)}
                      placeholder="https://…"
                      className={cn(inputClass, 'min-w-0 flex-1')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('common.delete')}
                      onClick={() => handleRemoveProfileLink(index)}
                      className="h-8 w-8 shrink-0 border border-border text-red-600 hover:border-red-600 hover:bg-transparent"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAdvanced(index)}
                    className="inline-flex items-center gap-1 builder-field-caption hover:text-foreground"
                  >
                    {showAdvanced ? (
                      <ChevronUp className="h-3 w-3" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                    {t('builder.personalInfoForm.advancedLinkOptions')}
                  </button>
                  {showAdvanced ? (
                    <Input
                      pasteMode="plainTextSingleParagraph"
                      value={item.fontawesome_icon || item.fontAwesomeIcon || ''}
                      onChange={(e) =>
                        handleProfileLinkChange(index, 'fontawesome_icon', e.target.value)
                      }
                      placeholder={t('builder.personalInfoForm.iconPlaceholder')}
                      title="Font Awesome icon id"
                      className={inputClass}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
