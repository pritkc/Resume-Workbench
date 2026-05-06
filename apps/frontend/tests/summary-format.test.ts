import { describe, expect, it } from 'vitest';
import {
  formatSummaryValue,
  parseSummaryFormatting,
  summaryAlignmentClass,
  summaryPlainText,
} from '@/lib/utils/summary-format';

describe('summary formatting', () => {
  it('keeps existing plain summaries justified by default', () => {
    expect(parseSummaryFormatting('Builder of typed APIs.')).toEqual({
      html: 'Builder of typed APIs.',
      alignment: 'justify',
    });
    expect(formatSummaryValue('Builder of typed APIs.', 'justify')).toBe('Builder of typed APIs.');
    expect(summaryAlignmentClass('justify')).toBe('text-justify');
  });

  it('wraps and restores centered summaries without changing the resume schema shape', () => {
    const stored = formatSummaryValue('<strong>Platform engineer</strong>', 'center');

    expect(stored).toBe(
      '<div data-summary-align="center"><strong>Platform engineer</strong></div>'
    );
    expect(parseSummaryFormatting(stored)).toEqual({
      html: '<strong>Platform engineer</strong>',
      alignment: 'center',
    });
    expect(summaryAlignmentClass('center')).toBe('text-center');
  });

  it('strips summary formatting for keyword matching contexts', () => {
    expect(
      summaryPlainText(
        '<div data-summary-align="center"><strong>FastAPI</strong> platform engineer</div>'
      )
    ).toBe('FastAPI platform engineer');
  });
});
