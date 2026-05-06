import React from 'react';
import { parseSummaryFormatting, summaryAlignmentClass } from '@/lib/utils/summary-format';
import { SafeHtml } from './safe-html';

interface SummaryHtmlProps {
  summary: string;
  className: string;
}

export function SummaryHtml({ summary, className }: SummaryHtmlProps) {
  const { html, alignment } = parseSummaryFormatting(summary);

  return (
    <SafeHtml as="p" html={html} className={`${summaryAlignmentClass(alignment)} ${className}`} />
  );
}
