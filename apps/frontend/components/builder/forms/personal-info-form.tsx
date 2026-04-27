'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PersonalInfo } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { Trash2 } from 'lucide-react';
import { getEditableProfileLinks } from '@/lib/utils/rendercv-fields';

interface PersonalInfoFormProps {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
}

const fieldLabel = 'font-mono text-[10px] uppercase tracking-wider text-black/50';
const inputClass =
  'h-7 rounded-none border border-black/30 bg-white px-2 text-sm focus-visible:border-black focus-visible:ring-0';

export const PersonalInfoForm: React.FC<PersonalInfoFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const profileLinks = getEditableProfileLinks(data);

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
    nextProfileLinks[index] = {
      ...nextProfileLinks[index],
      [field]: value || null,
      ...(field === 'fontawesome_icon' ? { fontAwesomeIcon: value || null } : {}),
    };
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

  return (
    <div className="entry-card-editor space-y-3 border border-black/20 bg-white">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-0.5">
          <span className={fieldLabel}>{t('resume.personalInfo.name')}</span>
          <Input
            pasteMode="plainTextSingleParagraph"
            id="name"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.name')}
            className={inputClass}
          />
        </div>
        <div className="space-y-0.5">
          <span className={fieldLabel}>Headline</span>
          <Input
            pasteMode="plainTextSingleParagraph"
            id="headline"
            value={data.headline || data.title || ''}
            onChange={(e) => handleChange('headline', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.title')}
            className={inputClass}
          />
        </div>
        <div className="space-y-0.5 sm:col-span-2">
          <span className={fieldLabel}>{t('resume.personalInfo.location')}</span>
          <Input
            pasteMode="plainTextSingleParagraph"
            id="location"
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.location')}
            className={inputClass}
          />
        </div>
        <div className="space-y-0.5">
          <span className={fieldLabel}>{t('resume.personalInfo.email')}</span>
          <Input
            pasteMode="plainTextSingleParagraph"
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.email')}
            className={inputClass}
          />
        </div>
        <div className="space-y-0.5">
          <span className={fieldLabel}>{t('resume.personalInfo.phone')}</span>
          <Input
            pasteMode="plainTextSingleParagraph"
            id="phone"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.phone')}
            className={inputClass}
          />
        </div>
        <div className="space-y-0.5 sm:col-span-2">
          <span className={fieldLabel}>Photo URL</span>
          <Input
            pasteMode="plainTextSingleParagraph"
            id="photo"
            value={data.photo || data.photoUrl || ''}
            onChange={(e) => handleChange('photo', e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </div>
        <div className="space-y-0.5 sm:col-span-2">
          <span className={fieldLabel}>Website</span>
          <Input
            pasteMode="plainTextSingleParagraph"
            id="website"
            value={data.website || ''}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </div>
      </div>

      <div className="border-t border-black/10 pt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className={fieldLabel}>Connections</span>
          <button
            type="button"
            onClick={handleAddProfileLink}
            className="font-mono text-[11px] uppercase tracking-wide text-black/50 underline decoration-black/20 underline-offset-2 hover:text-black"
          >
            + Add link
          </button>
        </div>
        {profileLinks.length === 0 ? (
          <p className="font-mono text-[10px] text-black/35">No extra links.</p>
        ) : (
          <div className="space-y-1">
            {profileLinks.map((item, index) => (
              <div
                key={index}
                className="field-row flex min-h-[28px] items-center gap-1.5 border-b border-black/5 py-1 last:border-0"
              >
                <Input
                  pasteMode="plainTextSingleParagraph"
                  value={item.label || ''}
                  onChange={(e) => handleProfileLinkChange(index, 'label', e.target.value)}
                  placeholder="Label"
                  className={`${inputClass} w-24 shrink-0 sm:w-28`}
                />
                <Input
                  pasteMode="plainTextSingleParagraph"
                  value={item.url || ''}
                  onChange={(e) => handleProfileLinkChange(index, 'url', e.target.value)}
                  placeholder="https://…"
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <Input
                  pasteMode="plainTextSingleParagraph"
                  value={item.fontawesome_icon || item.fontAwesomeIcon || ''}
                  onChange={(e) =>
                    handleProfileLinkChange(index, 'fontawesome_icon', e.target.value)
                  }
                  placeholder="Icon (opt.)"
                  title="Font Awesome icon id"
                  className={`${inputClass} hidden w-28 shrink-0 sm:block`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.delete')}
                  onClick={() => handleRemoveProfileLink(index)}
                  className="h-7 w-7 shrink-0 border border-black/20 text-red-600 hover:border-red-600 hover:bg-transparent"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
