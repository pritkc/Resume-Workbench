'use client';

import { useCallback, useMemo, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
        <span
          className="font-mono text-[10px] uppercase tracking-widest text-black/50"
          title={t('builder.metadata.hint')}
        >
          Metadata
        </span>
        <button
          type="button"
          className="text-black/40 hover:text-black"
          title={t('builder.metadata.hint')}
          aria-label={t('builder.metadata.hint')}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-black/50">
            {t('builder.metadata.role')}
          </span>
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.role}
            onChange={(e) => push({ role: e.target.value })}
            className="h-7 rounded-none border border-black/30 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
            autoComplete="off"
          />
        </label>
        <label className="block space-y-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-black/50">
            {t('builder.metadata.company')}
          </span>
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.company}
            onChange={(e) => push({ company: e.target.value })}
            className="h-7 rounded-none border border-black/30 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
            autoComplete="off"
          />
        </label>
        <label className="block space-y-0.5 sm:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-black/50">
            {t('builder.metadata.location')}
          </span>
          <Input
            pasteMode="plainTextSingleParagraph"
            value={parsed.location}
            onChange={(e) => push({ location: e.target.value })}
            className="h-7 rounded-none border border-black/30 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="space-y-1.5 border-t border-black/10 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-black/50">
          {t('builder.metadata.boldKeywords')}
        </span>
        <p className="font-sans text-[10px] leading-snug text-black/40">
          {t('builder.metadata.boldKeywordsHelp')}
        </p>
        {bold_keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {bold_keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex max-w-full items-center gap-0.5 border border-black/20 bg-black/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-black/85"
              >
                <span className="truncate">{kw}</span>
                <button
                  type="button"
                  onClick={() => removeKeyword(kw)}
                  className="shrink-0 rounded-none p-0.5 text-black/40 hover:bg-black/[0.06] hover:text-red-700"
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
            className="h-7 min-w-0 flex-1 rounded-none border border-black/30 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="builderOutline"
            size="xs"
            className="h-7 shrink-0 rounded-none px-2"
            onClick={addKeyword}
          >
            {t('builder.metadata.addKeyword')}
          </Button>
        </div>
      </div>
    </div>
  );
}
