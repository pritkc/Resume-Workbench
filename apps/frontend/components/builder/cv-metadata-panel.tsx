'use client';

import { useCallback, useMemo, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

function normalizeBoldKeywords(list: string[]): string[] {
  const next = list.map((s) => s.trim()).filter((s) => s.length >= 2);
  next.sort((a, b) => b.length - a.length);
  return next;
}

export function CvMetadataPanel({ metadataYaml, themeSettings, onChange }: CvMetadataPanelProps) {
  const { t } = useTranslations();
  const parsed = parseCvMetadataYaml(metadataYaml);
  const boldFromSettings = Array.isArray(themeSettings.settings?.bold_keywords)
    ? themeSettings.settings.bold_keywords
    : parsed.bold_keywords;

  const bold_keywords = useMemo(
    () => normalizeBoldKeywords([...boldFromSettings]),
    [boldFromSettings]
  );

  const [draftKeyword, setDraftKeyword] = useState('');

  const commitFields = useCallback(
    (fields: CvMetadataFields) => {
      const bold = normalizeBoldKeywords(fields.bold_keywords);
      onChange({
        metadataYaml: serializeCvMetadataYaml({ ...fields, bold_keywords: bold }),
        themeSettings: {
          ...themeSettings,
          settings: { ...themeSettings.settings, bold_keywords: bold },
        },
      });
    },
    [onChange, themeSettings]
  );

  const push = (next: Partial<Pick<CvMetadataFields, 'role' | 'company' | 'location'>>) => {
    const fields: CvMetadataFields = {
      role: next.role ?? parsed.role,
      company: next.company ?? parsed.company,
      location: next.location ?? parsed.location,
      bold_keywords,
    };
    commitFields(fields);
  };

  const addKeyword = () => {
    const w = draftKeyword.trim();
    if (w.length < 2) return;
    if (bold_keywords.some((k) => k.toLowerCase() === w.toLowerCase())) {
      setDraftKeyword('');
      return;
    }
    setDraftKeyword('');
    commitFields({
      role: parsed.role,
      company: parsed.company,
      location: parsed.location,
      bold_keywords: [...bold_keywords, w],
    });
  };

  const removeKeyword = (word: string) => {
    commitFields({
      role: parsed.role,
      company: parsed.company,
      location: parsed.location,
      bold_keywords: bold_keywords.filter((k) => k !== word),
    });
  };

  return (
    <div className="space-y-3 px-1 pb-3">
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
            className="builder-field-input w-full"
            autoComplete="off"
          />
        </BuilderFormField>
        <BuilderFormField label={t('builder.metadata.company')}>
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.company}
            onChange={(e) => push({ company: e.target.value })}
            className="builder-field-input w-full"
            autoComplete="off"
          />
        </BuilderFormField>
        <BuilderFormField label={t('builder.metadata.location')} className="sm:col-span-2">
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.location}
            onChange={(e) => push({ location: e.target.value })}
            className="builder-field-input w-full"
            autoComplete="off"
          />
        </BuilderFormField>
      </div>

      <div className="space-y-1.5 border-t border-border pt-2">
        <span className="builder-field-label block">{t('builder.metadata.boldKeywords')}</span>
        <p className="builder-form-hint">{t('builder.metadata.boldKeywordsHelp')}</p>
        {bold_keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {bold_keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex max-w-full items-center gap-0.5 border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/85"
              >
                <span className="truncate">{kw}</span>
                <button
                  type="button"
                  onClick={() => removeKeyword(kw)}
                  className="shrink-0 rounded-none p-0.5 text-muted-foreground hover:bg-black/[0.06] hover:text-red-700"
                  aria-label={t('common.delete')}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex gap-1">
          <Input
            pasteMode="plainTextSingleParagraph"
            value={draftKeyword}
            onChange={(e) => setDraftKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder={t('builder.metadata.boldKeywordPlaceholder')}
            className="builder-field-input min-w-0 flex-1"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="builderOutline"
            size="xs"
            className="h-8 shrink-0 rounded-none px-2"
            onClick={addKeyword}
          >
            {t('builder.metadata.addKeyword')}
          </Button>
        </div>
      </div>
    </div>
  );
}
