'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { fetchPromptCatalog, type PromptCatalogEntry } from '@/lib/api/config';
import { PromptCatalogTree } from '@/components/settings/prompt-catalog-tree';
import { useTranslations } from '@/lib/i18n';

const sectionCardClass =
  'rounded border border-black/15 bg-[#F4F4F0] p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.12)]';

function RawPromptBlocks({
  entry,
  t,
}: {
  entry: PromptCatalogEntry;
  t: (key: string, params?: Record<string, string | number>) => string;
}): React.ReactElement {
  return (
    <>
      {entry.system_prompt ? (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
            {t('settings.promptCatalog.systemPrompt')}
          </p>
          <pre className="mt-1 max-h-[min(360px,50vh)] overflow-auto whitespace-pre-wrap border border-black/20 bg-[#FAFAF7] p-2 text-[11px] text-gray-800">
            {entry.system_prompt}
          </pre>
        </div>
      ) : null}
      {entry.user_prompt ? (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
            {t('settings.promptCatalog.userPrompt')}
          </p>
          <pre className="mt-1 max-h-[min(360px,50vh)] overflow-auto whitespace-pre-wrap border border-black/20 bg-[#FAFAF7] p-2 text-[11px] text-gray-800">
            {entry.user_prompt}
          </pre>
        </div>
      ) : null}
      {!entry.system_prompt && !entry.user_prompt ? (
        <p className="font-mono text-[11px] text-gray-500">—</p>
      ) : null}
    </>
  );
}

export default function PromptCatalogPage(): React.ReactElement {
  const { t } = useTranslations();
  const [entries, setEntries] = useState<PromptCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchPromptCatalog();
        if (!cancelled) {
          setEntries(res.prompts || []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(t('settings.promptCatalog.loadError'));
          setEntries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('settings.promptCatalog.backToSettings')}
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3 border-b border-black/10 pb-4">
        <FileText className="h-8 w-8 text-gray-800" />
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-tight text-gray-900">
            {t('settings.promptCatalog.pageTitle')}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-gray-600">
            {t('settings.promptCatalog.metaDescription')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 font-mono text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('settings.promptCatalog.loading')}
        </div>
      ) : error ? (
        <p className="font-mono text-sm text-red-700">{error}</p>
      ) : entries.length === 0 ? (
        <p className="font-mono text-sm text-gray-600">{t('settings.promptCatalog.empty')}</p>
      ) : (
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
            {t('settings.promptCatalog.promptCount', { count: entries.length })}
          </p>

          {entries.map((entry) => (
            <article key={entry.id} className={sectionCardClass}>
              <div className="flex flex-wrap items-center gap-2 border-b border-black/10 pb-3">
                <span className="font-mono text-sm font-bold text-gray-900">{entry.id}</span>
                <span className="font-mono text-[10px] uppercase text-gray-500">{entry.operation}</span>
                {entry.version ? (
                  <span className="font-mono text-[10px] uppercase text-gray-500">{entry.version}</span>
                ) : null}
                <span className="font-mono text-[10px] uppercase text-gray-500">
                  {entry.read_only ? 'Read-only' : 'Editable'}
                </span>
              </div>

              {entry.notes ? (
                <p className="mt-3 text-[13px] text-gray-600">{entry.notes}</p>
              ) : null}

              {entry.sections && entry.sections.length > 0 ? (
                <div className="mt-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600">
                    {t('settings.promptCatalog.structuredSections')}
                  </p>
                  <div className="mt-2">
                    <PromptCatalogTree sections={entry.sections} label={t} />
                  </div>
                </div>
              ) : null}

              {entry.sections && entry.sections.length > 0 ? (
                <details className="mt-4 group">
                  <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600 hover:text-gray-900">
                    {t('settings.promptCatalog.rawTemplates')}
                  </summary>
                  <div className="mt-3 space-y-3 border-t border-black/10 pt-3">
                    <RawPromptBlocks entry={entry} t={t} />
                  </div>
                </details>
              ) : (
                <div className="mt-4 space-y-3">
                  <RawPromptBlocks entry={entry} t={t} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
