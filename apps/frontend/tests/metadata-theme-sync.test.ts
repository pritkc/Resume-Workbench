import { describe, expect, it } from 'vitest';
import { DEFAULT_METADATA_YAML } from '@/lib/cv-metadata';
import { mergeBoldKeywordsIntoMetadataYaml } from '@/lib/metadata-theme-sync';

describe('mergeBoldKeywordsIntoMetadataYaml', () => {
  it('writes bold keywords into metadata yaml', () => {
    const yaml = mergeBoldKeywordsIntoMetadataYaml(DEFAULT_METADATA_YAML, ['FastAPI', 'Python']);

    expect(yaml).toContain('bold_keywords:');
    expect(yaml).toContain('FastAPI');
    expect(yaml).toContain('Python');
  });

  it('preserves role and company while updating keywords', () => {
    const source = `metadata:
  role: "SRE"
  company: "Google"
  location: "Remote"
  bold_keywords: []
`;
    const yaml = mergeBoldKeywordsIntoMetadataYaml(source, ['Docker']);

    expect(yaml).toContain('role: SRE');
    expect(yaml).toContain('company: Google');
    expect(yaml).toContain('Docker');
  });
});
