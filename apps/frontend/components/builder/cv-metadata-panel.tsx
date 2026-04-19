'use client';

import { useTranslations } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  parseCvMetadataYaml,
  serializeCvMetadataYaml,
  type CvMetadataFields,
} from '@/lib/cv-metadata';
import type { RenderThemeSettings } from '@/lib/types/render-theme';
import { normalizeRenderThemeSettings } from '@/lib/types/render-theme';

interface CvMetadataPanelProps {
  metadataYaml: string;
  themeSettings: RenderThemeSettings;
  onChange: (next: { metadataYaml: string; themeSettings: RenderThemeSettings }) => void;
}

function keywordsToText(keywords: string[]): string {
  return keywords.join('\n');
}

function textToKeywords(text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const w = line.trim();
    if (w.length < 2) {
      continue;
    }
    const k = w.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(w);
  }
  out.sort((a, b) => b.length - a.length);
  return out;
}

export function CvMetadataPanel({ metadataYaml, themeSettings, onChange }: CvMetadataPanelProps) {
  const { t } = useTranslations();
  const parsed = parseCvMetadataYaml(metadataYaml);
  const themeKw = themeSettings.settings?.bold_keywords;
  const fields: CvMetadataFields = {
    ...parsed,
    bold_keywords: Array.isArray(themeKw) ? themeKw : parsed.bold_keywords,
  };

  const push = (nextFields: CvMetadataFields) => {
    const metadataYamlNext = serializeCvMetadataYaml(nextFields);
    const settings = { ...themeSettings.settings, bold_keywords: nextFields.bold_keywords };
    const themeNext = normalizeRenderThemeSettings({
      ...themeSettings,
      bold_keywords: nextFields.bold_keywords.length > 0,
      settings,
    });
    onChange({ metadataYaml: metadataYamlNext, themeSettings: themeNext });
  };

  return (
    <div className="space-y-4 px-1 pb-4">
      <p className="text-[13px] leading-relaxed text-gray-600">{t('builder.metadata.hint')}</p>
      <div className="grid gap-3 sm:grid-cols-1">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
            {t('builder.metadata.role')}
          </span>
          <Input
            value={fields.role}
            onChange={(e) => push({ ...fields, role: e.target.value })}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
            {t('builder.metadata.company')}
          </span>
          <Input
            value={fields.company}
            onChange={(e) => push({ ...fields, company: e.target.value })}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
            {t('builder.metadata.location')}
          </span>
          <Input
            value={fields.location}
            onChange={(e) => push({ ...fields, location: e.target.value })}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
            {t('builder.metadata.boldKeywords')}
          </span>
          <span className="block text-[11px] text-gray-500">
            {t('builder.metadata.boldKeywordsHelp')}
          </span>
          <Textarea
            value={keywordsToText(fields.bold_keywords)}
            onChange={(e) => push({ ...fields, bold_keywords: textToKeywords(e.target.value) })}
            rows={5}
            className="font-mono text-sm"
            spellCheck={false}
          />
        </label>
      </div>
    </div>
  );
}
