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
    <div className="space-y-3 border border-black bg-white px-4 py-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]">
      <h3 className="mb-3 border-b border-black pb-2 font-serif text-lg font-bold">
        {t('builder.personalInfo')}
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="name"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.personalInfo.name')}
          </Label>
          <Input
            id="name"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.name')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="headline"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            Headline
          </Label>
          <Input
            id="headline"
            value={data.headline || data.title || ''}
            onChange={(e) => handleChange('headline', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.title')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.personalInfo.email')}
          </Label>
          <Input
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.email')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="phone"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.personalInfo.phone')}
          </Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.phone')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="location"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.personalInfo.location')}
          </Label>
          <Input
            id="location"
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.location')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label
            htmlFor="photo"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            Photo URL <span className="text-gray-400">({t('common.optional')})</span>
          </Label>
          <Input
            id="photo"
            value={data.photo || data.photoUrl || ''}
            onChange={(e) => handleChange('photo', e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-black pt-3">
        <div className="flex items-center justify-between">
          <h4 className="font-mono text-xs uppercase tracking-wider text-gray-500">
            Profile Links
          </h4>
          <Button
            variant="outline"
            size="xs"
            onClick={handleAddProfileLink}
            className="rounded-none border-black"
          >
            <Plus className="mr-1 h-3 w-3" /> Add Link
          </Button>
        </div>
        {profileLinks.length === 0 ? (
          <p className="font-mono text-[11px] text-gray-500">No profile links added yet.</p>
        ) : (
          <div className="space-y-2">
            {profileLinks.map((item, index) => (
              <div key={index} className="space-y-2 border border-dashed border-black/20 p-2">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={item.label || ''}
                    onChange={(e) => handleProfileLinkChange(index, 'label', e.target.value)}
                    placeholder="Portfolio"
                    className="rounded-none border-black bg-transparent"
                  />
                  <Input
                    value={item.url || ''}
                    onChange={(e) => handleProfileLinkChange(index, 'url', e.target.value)}
                    placeholder="https://example.com"
                    className="rounded-none border-black bg-transparent"
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
                  className="rounded-none border-black bg-transparent"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
