export type SummaryAlignment = 'left' | 'center' | 'justify';

const ALIGNMENT_WRAPPER_RE = /^<div data-summary-align="(left|center|justify)">([\s\S]*)<\/div>$/;

export interface SummaryFormatting {
  html: string;
  alignment: SummaryAlignment;
}

export function parseSummaryFormatting(value: string | null | undefined): SummaryFormatting {
  const raw = value ?? '';
  const match = raw.match(ALIGNMENT_WRAPPER_RE);
  if (!match) {
    return { html: raw, alignment: 'justify' };
  }

  return {
    alignment: match[1] as SummaryAlignment,
    html: match[2] ?? '',
  };
}

export function formatSummaryValue(html: string, alignment: SummaryAlignment): string {
  const content = html.trim();
  if (!content) {
    return '';
  }
  if (alignment === 'justify') {
    return content;
  }
  return `<div data-summary-align="${alignment}">${content}</div>`;
}

export function summaryAlignmentClass(alignment: SummaryAlignment): string {
  if (alignment === 'center') {
    return 'text-center';
  }
  if (alignment === 'left') {
    return 'text-left';
  }
  return 'text-justify';
}

export function summaryPlainText(value: string | null | undefined): string {
  const { html } = parseSummaryFormatting(value);
  return html.replace(/<[^>]*>/g, '');
}
