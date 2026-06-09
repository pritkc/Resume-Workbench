import {
  parseCvMetadataYaml,
  serializeCvMetadataYaml,
  type CvMetadataFields,
} from '@/lib/cv-metadata';

export function mergeBoldKeywordsIntoMetadataYaml(
  metadataYaml: string,
  boldKeywords: string[] | undefined
): string {
  const parsed = parseCvMetadataYaml(metadataYaml);
  const fields: CvMetadataFields = {
    ...parsed,
    bold_keywords: Array.isArray(boldKeywords) ? boldKeywords : parsed.bold_keywords,
  };
  return serializeCvMetadataYaml(fields);
}
