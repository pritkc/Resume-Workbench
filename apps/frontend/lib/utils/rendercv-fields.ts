import type {
  Education,
  Experience,
  PersonalInfo,
  Project,
} from '@/components/dashboard/resume-component';

const BULLET_PREFIX_RE = /^\s*(?:[-*•]+|\d+[.)])\s*/;
const NETWORK_URL_PREFIXES: Record<string, string> = {
  linkedin: 'https://linkedin.com/in/',
  github: 'https://github.com/',
};

export interface ResumeContactEntry {
  label: string;
  displayValue: string;
  href?: string;
}

export interface EditableProfileLink {
  label: string;
  url: string | null;
  fontawesome_icon?: string | null;
  fontAwesomeIcon?: string | null;
}

function cleanText(value?: string | null): string {
  return value?.trim() || '';
}

/** Collapse simple HTML to plain text for comparing rich-text summary vs bullets. */
function plainTextFromRich(html: string): string {
  const t = cleanText(html);
  if (!t) return '';
  return cleanText(t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

/** Shown before work/project tech stack lines on resume templates (builder uses i18n). */
export const RESUME_TECH_STACK_LABEL = 'Tech stack:';
/** @deprecated Use RESUME_TECH_STACK_LABEL */
export const EXPERIENCE_TECH_STACK_LABEL = RESUME_TECH_STACK_LABEL;

function canonicalNetworkLabel(value: string): string {
  const cleaned = cleanText(value);
  const normalized = cleaned.toLowerCase();

  if (normalized === 'linkedin') {
    return 'LinkedIn';
  }

  if (normalized === 'github') {
    return 'GitHub';
  }

  return cleaned;
}

function normalizeList(items?: Array<string | null | undefined>): string[] {
  return (items || []).map((item) => cleanText(item)).filter(Boolean);
}

export function splitDescriptionLines(value?: string | null): string[] {
  return cleanText(value)
    .split(/\r?\n+/)
    .map((line) => line.replace(BULLET_PREFIX_RE, '').trim())
    .filter(Boolean);
}

export function getPersonalHeadline(personalInfo?: PersonalInfo): string {
  return cleanText(personalInfo?.headline || personalInfo?.title);
}

export function getPersonalPhoto(personalInfo?: PersonalInfo): string {
  return cleanText(personalInfo?.photo || personalInfo?.photoUrl);
}

function buildAbsoluteUrl(value: string): string {
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

function formatPartialDate(value?: string | null): string {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return '';
  }

  if (/^\d{4}$/.test(cleaned)) {
    return cleaned;
  }

  const normalized = cleaned.toLowerCase();
  if (normalized === 'present' || normalized === 'current' || normalized === 'ongoing') {
    return 'Present';
  }

  const monthMatch = cleaned.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    const date = new Date(`${year}-${month}-01T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
  }

  const dayMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) {
    const [, year, month, day] = dayMatch;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
  }

  return cleaned;
}

function buildStructuredDateRange(
  startDate?: string | null,
  endDate?: string | null,
  fallbackDate?: string | null
): string {
  const formattedStart = formatPartialDate(startDate);
  const formattedEnd = formatPartialDate(endDate);
  if (formattedStart && formattedEnd) {
    return `${formattedStart} - ${formattedEnd}`;
  }
  if (formattedStart) {
    return `${formattedStart} - Present`;
  }
  if (formattedEnd) {
    return formattedEnd;
  }

  return cleanText(fallbackDate);
}

function buildSocialNetworkHref(network: string, username: string): string | undefined {
  const cleanedUsername = cleanText(username);
  if (!cleanedUsername) {
    return undefined;
  }

  if (cleanedUsername.includes('/') || cleanedUsername.startsWith('http')) {
    return buildAbsoluteUrl(cleanedUsername);
  }

  const prefix = NETWORK_URL_PREFIXES[network.toLowerCase()];
  return prefix ? `${prefix}${cleanedUsername.replace(/^@/, '')}` : undefined;
}

function appendProfileLink(
  entries: EditableProfileLink[],
  seenHrefs: Set<string>,
  label?: string | null,
  url?: string | null,
  icon?: string | null
) {
  const cleanedLabel = cleanText(label);
  const cleanedUrl = cleanText(url);
  if (!cleanedLabel || !cleanedUrl) {
    return;
  }

  const href = buildAbsoluteUrl(cleanedUrl);
  const hrefKey = href.toLowerCase();
  if (seenHrefs.has(hrefKey)) {
    return;
  }

  seenHrefs.add(hrefKey);
  entries.push({
    label: cleanedLabel,
    url: href,
    fontawesome_icon: cleanText(icon) || undefined,
    fontAwesomeIcon: cleanText(icon) || undefined,
  });
}

export function getEditableProfileLinks(personalInfo?: PersonalInfo): EditableProfileLink[] {
  if (!personalInfo) {
    return [];
  }

  const entries: EditableProfileLink[] = [];
  const seenHrefs = new Set<string>();
  const hasExplicitProfileLinks = Array.isArray(personalInfo.profileLinks);

  if (hasExplicitProfileLinks) {
    (personalInfo.profileLinks || []).forEach((item) => {
      appendProfileLink(
        entries,
        seenHrefs,
        item.label,
        item.url,
        item.fontawesome_icon || item.fontAwesomeIcon
      );
    });
    return entries;
  }

  (personalInfo.customConnections || []).forEach((item) => {
    appendProfileLink(
      entries,
      seenHrefs,
      item.placeholder,
      item.url,
      item.fontawesome_icon || item.fontAwesomeIcon
    );
  });

  appendProfileLink(entries, seenHrefs, 'Website', personalInfo.website, 'link');

  const linkedinHref = personalInfo.linkedin
    ? buildSocialNetworkHref('LinkedIn', personalInfo.linkedin)
    : undefined;
  appendProfileLink(entries, seenHrefs, 'LinkedIn', linkedinHref, 'linkedin-in');

  const githubHref = personalInfo.github
    ? buildSocialNetworkHref('GitHub', personalInfo.github)
    : undefined;
  appendProfileLink(entries, seenHrefs, 'GitHub', githubHref, 'github');

  (personalInfo.socialNetworks || []).forEach((item) => {
    const network = canonicalNetworkLabel(item.network || '');
    const href = buildSocialNetworkHref(network, item.username || '');
    appendProfileLink(entries, seenHrefs, network, href);
  });

  return entries;
}

export function getExtraContactEntries(personalInfo?: PersonalInfo): ResumeContactEntry[] {
  return getEditableProfileLinks(personalInfo).map((item) => ({
    label: item.label,
    displayValue: item.label,
    href: item.url || undefined,
  }));
}

export function getExperiencePosition(experience?: Experience): string {
  return cleanText(experience?.position || experience?.title);
}

export function getExperienceDate(experience?: Experience): string {
  return buildStructuredDateRange(
    experience?.start_date,
    experience?.end_date,
    experience?.date || experience?.years
  );
}

export function getExperienceExplicitDate(experience?: Experience): string {
  return cleanText(experience?.date || experience?.years);
}

export function getExperienceSummary(experience?: Experience): string {
  return cleanText(experience?.summary ?? experience?.techStack);
}

/** Per-role tech stack (stored as `summary` on the wire; optional `techStack` for newer payloads). */
export function getExperienceTechStack(experience?: Experience): string {
  return getExperienceSummary(experience);
}

function stripLeadingTechStackDuplicates(
  stack: string,
  highlights: string[],
  richStack: boolean
): string[] {
  if (!highlights.length) return highlights;
  const stackPlain = richStack ? plainTextFromRich(stack) : cleanText(stack);
  if (!stackPlain) return highlights;
  const out = [...highlights];
  while (out.length) {
    const head = richStack ? plainTextFromRich(out[0]) : cleanText(out[0]);
    if (!head || head !== stackPlain) break;
    out.shift();
  }
  return out;
}

export function getExperienceHighlights(experience?: Experience): string[] {
  const stackRaw = experience?.summary ?? experience?.techStack;
  const richStack = Boolean(stackRaw && /<[^>]+>/.test(stackRaw));

  const highlights = normalizeList(experience?.highlights);
  if (highlights.length > 0) {
    return stripLeadingTechStackDuplicates(cleanText(stackRaw || ''), highlights, richStack);
  }

  const description = normalizeList(experience?.description);
  const summary = getExperienceSummary(experience);

  if (summary && description[0] === summary) {
    return description.slice(1);
  }

  return stripLeadingTechStackDuplicates(summary, description, richStack);
}

/** Highlights for the form editor: preserves empty strings (e.g. new bullet rows). */
export function getExperienceHighlightsEditor(experience?: Experience): string[] {
  const raw = experience?.highlights;
  if (Array.isArray(raw) && raw.length > 0) {
    const stackRaw = experience?.summary ?? experience?.techStack;
    const richStack = Boolean(stackRaw && /<[^>]+>/.test(String(stackRaw)));
    const mapped = raw.map((h) => (h == null ? '' : String(h)));
    return stripLeadingTechStackDuplicates(cleanText(String(stackRaw || '')), mapped, richStack);
  }
  if (Array.isArray(raw) && raw.length === 0) {
    const derived = getExperienceHighlights(experience);
    return derived.length > 0 ? derived : [];
  }
  return getExperienceHighlights(experience);
}

export function buildExperienceDescription(
  summary?: string | null,
  highlights?: Array<string | null | undefined>
): string[] {
  const normalizedSummary = cleanText(summary);
  const normalizedHighlights = normalizeList(highlights);
  return normalizedSummary ? [normalizedSummary, ...normalizedHighlights] : normalizedHighlights;
}

export function getEducationDate(education?: Education): string {
  return buildStructuredDateRange(
    education?.start_date,
    education?.end_date,
    education?.date || education?.years
  );
}

export function getEducationExplicitDate(education?: Education): string {
  return cleanText(education?.date || education?.years);
}

export function getEducationSummary(education?: Education): string {
  const summary = cleanText(education?.summary);
  if (summary) {
    return summary;
  }
  return splitDescriptionLines(education?.description)[0] || '';
}

export function getEducationHighlights(education?: Education): string[] {
  const highlights = normalizeList(education?.highlights);
  if (highlights.length > 0) {
    return highlights;
  }

  const descriptionLines = splitDescriptionLines(education?.description);
  const summary = getEducationSummary(education);

  if (summary && descriptionLines[0] === summary) {
    return descriptionLines.slice(1);
  }

  return descriptionLines;
}

/** Highlights for the form editor: preserves empty strings (e.g. new bullet rows). */
export function getEducationHighlightsEditor(education?: Education): string[] {
  const raw = education?.highlights;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((h) => (h == null ? '' : String(h)));
  }
  if (Array.isArray(raw) && raw.length === 0) {
    const derived = getEducationHighlights(education);
    return derived.length > 0 ? derived : [];
  }
  return getEducationHighlights(education);
}

export function buildEducationDescription(
  summary?: string | null,
  highlights?: Array<string | null | undefined>
): string | null {
  const lines = [cleanText(summary), ...normalizeList(highlights)].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

export function getEducationCredential(education?: Education): string {
  const degree = cleanText(education?.degree);
  const area = cleanText(education?.area);

  if (degree && area) {
    return `${degree}, ${area}`;
  }

  return degree || area;
}

export function getProjectSummary(project?: Project): string {
  return getProjectTechStack(project);
}

/** Tech stack / tooling line for a project (stored as `summary`; optional `techStack`). */
export function getProjectTechStack(project?: Project): string {
  return cleanText(project?.summary ?? project?.techStack ?? project?.role);
}

export function getProjectDate(project?: Project): string {
  return cleanText(project?.date || project?.years);
}

function projectStackRawForStrip(project?: Project): string {
  return String(project?.summary ?? project?.techStack ?? project?.role ?? '');
}

export function getProjectHighlights(project?: Project): string[] {
  const stackRaw = projectStackRawForStrip(project);
  const richStack = Boolean(stackRaw && /<[^>]+>/.test(stackRaw));

  const highlights = normalizeList(project?.highlights);
  if (highlights.length > 0) {
    return stripLeadingTechStackDuplicates(stackRaw, highlights, richStack);
  }
  return stripLeadingTechStackDuplicates(stackRaw, normalizeList(project?.description), richStack);
}

/** Highlights for the form editor: preserves empty strings (e.g. new bullet rows). */
export function getProjectHighlightsEditor(project?: Project): string[] {
  const raw = project?.highlights;
  if (Array.isArray(raw) && raw.length > 0) {
    const stackRaw = projectStackRawForStrip(project);
    const richStack = Boolean(stackRaw && /<[^>]+>/.test(stackRaw));
    const mapped = raw.map((h) => (h == null ? '' : String(h)));
    return stripLeadingTechStackDuplicates(stackRaw, mapped, richStack);
  }
  if (Array.isArray(raw) && raw.length === 0) {
    const derived = getProjectHighlights(project);
    return derived.length > 0 ? derived : [];
  }
  return getProjectHighlights(project);
}

export function buildProjectDescription(highlights?: Array<string | null | undefined>): string[] {
  return normalizeList(highlights);
}
