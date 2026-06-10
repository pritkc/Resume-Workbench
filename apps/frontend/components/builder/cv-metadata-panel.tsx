'use client';

import { useCallback } from 'react';
import { HelpCircle } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { BuilderFormField } from './builder-form-field';
import {
  parseCvMetadataYaml,
  serializeCvMetadataYaml,
  type CvMetadataFields,
} from '@/lib/cv-metadata';
import type { RenderThemeSettings } from '@/lib/types/render-theme';

interface CvMetadataPanelProps {
  metadataYaml: string;
  themeSettings: RenderThemeSettings;
  onChange: (next: { metadataYaml: string; themeSettings: RenderThemeSettings }) => void;
}

export function CvMetadataPanel({ metadataYaml, themeSettings, onChange }: CvMetadataPanelProps) {
  const { t } = useTranslations();
  const parsed = parseCvMetadataYaml(metadataYaml);

  const commitFields = useCallback(
    (fields: CvMetadataFields) => {
      const bold =
        Array.isArray(themeSettings.settings?.bold_keywords) &&
        themeSettings.settings.bold_keywords.length > 0
          ? themeSettings.settings.bold_keywords
          : parsed.bold_keywords;
      onChange({
        metadataYaml: serializeCvMetadataYaml({ ...fields, bold_keywords: bold }),
        themeSettings,
      });
    },
    [onChange, parsed.bold_keywords, themeSettings]
  );

  const push = (next: Partial<Pick<CvMetadataFields, 'role' | 'company' | 'location'>>) => {
    commitFields({
      role: next.role ?? parsed.role,
      company: next.company ?? parsed.company,
      location: next.location ?? parsed.location,
      bold_keywords: parsed.bold_keywords,
    });
  };

  return (
    <div className="space-y-2 px-1 pb-3">
      <div className="flex items-center gap-1">
        <span className="builder-field-label">{t('builder.metadata.panelTitle')}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          title={t('builder.metadata.hint')}
          aria-label={t('builder.metadata.hint')}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <BuilderFormField label={t('builder.metadata.role')}>
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.role}
            onChange={(e) => push({ role: e.target.value })}
            className="builder-field-input h-7 w-full"
            autoComplete="off"
          />
        </BuilderFormField>
        <BuilderFormField label={t('builder.metadata.company')}>
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.company}
            onChange={(e) => push({ company: e.target.value })}
            className="builder-field-input h-7 w-full"
            autoComplete="off"
          />
        </BuilderFormField>
        <BuilderFormField label={t('builder.metadata.location')} className="sm:col-span-2">
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.location}
            onChange={(e) => push({ location: e.target.value })}
            className="builder-field-input h-7 w-full"
            autoComplete="off"
          />
        </BuilderFormField>
      </div>
    </div>
  );
}
