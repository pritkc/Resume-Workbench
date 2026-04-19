import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const DEFAULT_METADATA_YAML = `metadata:
  role: ""
  company: ""
  location: ""
  bold_keywords: []
`;

export type CvMetadataFields = {
  role: string;
  company: string;
  location: string;
  bold_keywords: string[];
};

export function parseCvMetadataYaml(raw: string): CvMetadataFields {
  const text = raw?.trim() ? raw : DEFAULT_METADATA_YAML;
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return { role: '', company: '', location: '', bold_keywords: [] };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { role: '', company: '', location: '', bold_keywords: [] };
  }
  const root = doc as Record<string, unknown>;
  const inner = root.metadata;
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
    return { role: '', company: '', location: '', bold_keywords: [] };
  }
  const m = inner as Record<string, unknown>;
  const role = typeof m.role === 'string' ? m.role : '';
  const company = typeof m.company === 'string' ? m.company : '';
  const location = typeof m.location === 'string' ? m.location : '';
  const rawList = m.bold_keywords;
  const bold_keywords: string[] = [];
  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      if (typeof item === 'string') {
        const w = item.trim();
        if (w.length >= 2) {
          bold_keywords.push(w);
        }
      }
    }
  }
  bold_keywords.sort((a, b) => b.length - a.length);
  return { role, company, location, bold_keywords };
}

export function serializeCvMetadataYaml(fields: CvMetadataFields): string {
  const payload = {
    metadata: {
      role: fields.role,
      company: fields.company,
      location: fields.location,
      bold_keywords: fields.bold_keywords,
    },
  };
  return stringifyYaml(payload, { lineWidth: 120 });
}

/** Minimal bundle for external LLM: `metadata:` and `cv:` only (no comment lines). */
export function buildLlmClipboardBundle(rawYamlSections: { cv: string; metadata: string }): string {
  return [rawYamlSections.metadata.trimEnd(), '', rawYamlSections.cv.trimEnd(), ''].join('\n');
}

/** Try to extract `metadata:` and `cv:` blocks from a pasted bundle (plain two-root YAML or legacy commented paste). */
export function tryParseLlmClipboardBundle(text: string): {
  metadata: string | null;
  cv: string | null;
} {
  const full = text.replace(/\r\n/g, '\n').trim();
  let metadata: string | null = null;
  let cv: string | null = null;

  try {
    const doc = parseYaml(full) as Record<string, unknown> | null;
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      if (doc.metadata && typeof doc.metadata === 'object') {
        metadata = stringifyYaml({ metadata: doc.metadata }).trimEnd() + '\n';
      }
      if (doc.cv && typeof doc.cv === 'object') {
        cv = stringifyYaml({ cv: doc.cv }).trimEnd() + '\n';
      }
    }
  } catch {
    // fall through to line-based extraction
  }

  if (!metadata || !cv) {
    const metaMatch = full.match(/(^|\n)(metadata:\s*\n(?:[ \t].*\n?)*)/);
    const cvMatch = full.match(/(^|\n)(cv:\s*\n(?:[ \t].*\n?)*)/);
    if (!metadata && metaMatch?.[2]) {
      metadata = metaMatch[2].trimEnd() + '\n';
    }
    if (!cv && cvMatch?.[2]) {
      cv = cvMatch[2].trimEnd() + '\n';
    }
  }

  return { metadata, cv };
}
