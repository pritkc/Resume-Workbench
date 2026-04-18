'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PersonalInfo } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { Plus, Trash2 } from 'lucide-react';
import { getEditableProfileLinks } from '@/lib/utils/rendercv-fields';

interface PersonalInfoFormProps {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
}

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
    <div className="space-y-2.5 border border-black/15 bg-white px-3 py-2.5">
      <h3 className="mb-2 border-b border-black/10 pb-1.5 font-serif text-base font-bold text-gray-900">
        {t('builder.personalInfo')}
      </h3>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-[11px] font-medium text-gray-700">
            {t('resume.personalInfo.name')}
          </Label>
          <Input
            id="name"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.name')}
            className="rounded-none border-black/15 bg-white focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="headline" className="text-[11px] font-medium text-gray-700">
            Headline
          </Label>
          <Input
            id="headline"
            value={data.headline || data.title || ''}
            onChange={(e) => handleChange('headline', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.title')}
            className="rounded-none border-black/15 bg-white focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[11px] font-medium text-gray-700">
            {t('resume.personalInfo.email')}
          </Label>
          <Input
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.email')}
            className="rounded-none border-black/15 bg-white focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-[11px] font-medium text-gray-700">
            {t('resume.personalInfo.phone')}
          </Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.phone')}
            className="rounded-none border-black/15 bg-white focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location" className="text-[11px] font-medium text-gray-700">
            {t('resume.personalInfo.location')}
          </Label>
          <Input
            id="location"
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.location')}
            className="rounded-none border-black/15 bg-white focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="photo" className="text-[11px] font-medium text-gray-700">
            Photo URL <span className="text-gray-400">({t('common.optional')})</span>
          </Label>
          <Input
            id="photo"
            value={data.photo || data.photoUrl || ''}
            onChange={(e) => handleChange('photo', e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="rounded-none border-black/15 bg-white focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-black/10 pt-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
            Profile Links
          </h4>
          <Button
            variant="outline"
            size="xs"
            onClick={handleAddProfileLink}
            className="rounded-none border-black/15"
          >
            <Plus className="mr-1 h-3 w-3" /> Add Link
          </Button>
        </div>
        {profileLinks.length === 0 ? (
          <p className="text-[11px] text-gray-500">No profile links added yet.</p>
        ) : (
          <div className="space-y-2">
            {profileLinks.map((item, index) => (
              <div
                key={index}
                className="space-y-2 border border-dashed border-black/15 bg-gray-50/50 p-2"
              >
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={item.label || ''}
                    onChange={(e) => handleProfileLinkChange(index, 'label', e.target.value)}
                    placeholder="Portfolio"
                    className="rounded-none border-black/15 bg-white"
                  />
                  <Input
                    value={item.url || ''}
                    onChange={(e) => handleProfileLinkChange(index, 'url', e.target.value)}
                    placeholder="https://example.com"
                    className="rounded-none border-black/15 bg-white"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.delete')}
                    onClick={() => handleRemoveProfileLink(index)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={item.fontawesome_icon || item.fontAwesomeIcon || ''}
                  onChange={(e) =>
                    handleProfileLinkChange(index, 'fontawesome_icon', e.target.value)
                  }
                  placeholder="linkedin-in or fa-brands fa-linkedin-in"
                  className="rounded-none border-black/15 bg-white"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
