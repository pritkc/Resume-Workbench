import themeBaselineData from '@/lib/rendercv/theme-baselines.json';

export type RenderThemeId =
  | 'classic'
  | 'moderncv'
  | 'sb2nov'
  | 'engineeringresumes'
  | 'engineeringclassic'
  | 'harvard'
  | 'opal'
  | 'ember'
  | 'ink';
export type RenderPageSize = 'A4' | 'LETTER';
export type RenderDensityProfile = 'compact' | 'balanced' | 'spacious';
export type RenderAccentColor = 'blue' | 'green' | 'orange' | 'red';
export type RenderAlignment =
  | 'left'
  | 'center'
  | 'right'
  | 'justified'
  | 'justified-with-no-hyphenation';
export type RenderDateAlignment = 'left' | 'center' | 'right';
export type RenderPhoneNumberFormat = 'national' | 'international' | 'E164';
export type RenderPhotoPosition = 'left' | 'right';
export type RenderSectionTitleType =
  | 'with_partial_line'
  | 'with_full_line'
  | 'without_line'
  | 'moderncv'
  | 'centered_without_line'
  | 'centered_with_partial_line'
  | 'centered_with_centered_partial_line'
  | 'centered_with_full_line';
export type RenderLanguage =
  | 'english'
  | 'arabic'
  | 'danish'
  | 'dutch'
  | 'french'
  | 'german'
  | 'hebrew'
  | 'hindi'
  | 'hungarian'
  | 'indonesian'
  | 'italian'
  | 'japanese'
  | 'korean'
  | 'mandarin_chinese'
  | 'norwegian_bokmål'
  | 'norwegian_nynorsk'
  | 'persian'
  | 'portuguese'
  | 'russian'
  | 'spanish'
  | 'turkish'
  | 'vietnamese';
export type RenderDimensionUnit = 'cm' | 'mm' | 'in' | 'pt' | 'em' | 'ex';
export type RenderBullet = '●' | '•' | '◦' | '-' | '◆' | '★' | '■' | '—' | '○';

export interface RenderCvDesign {
  theme?: RenderThemeId;
  page?: {
    size?: 'a4' | 'us-letter';
    top_margin?: string;
    bottom_margin?: string;
    left_margin?: string;
    right_margin?: string;
    show_footer?: boolean;
    show_top_note?: boolean;
  };
  colors?: {
    body?: string;
    name?: string;
    headline?: string;
    connections?: string;
    section_titles?: string;
    links?: string;
    footer?: string;
    top_note?: string;
  };
  typography?: {
    line_spacing?: string;
    alignment?: RenderAlignment;
    date_and_location_column_alignment?: RenderDateAlignment;
    font_family?: {
      body?: string;
      name?: string;
      headline?: string;
      connections?: string;
      section_titles?: string;
    };
    font_size?: {
      body?: string;
      name?: string;
      headline?: string;
      connections?: string;
      section_titles?: string;
    };
    small_caps?: {
      name?: boolean;
      headline?: boolean;
      connections?: boolean;
      section_titles?: boolean;
    };
    bold?: {
      name?: boolean;
      headline?: boolean;
      connections?: boolean;
      section_titles?: boolean;
    };
  };
  links?: {
    underline?: boolean;
    show_external_link_icon?: boolean;
  };
  header?: {
    alignment?: RenderDateAlignment;
    photo_width?: string;
    photo_position?: RenderPhotoPosition;
    photo_space_left?: string;
    photo_space_right?: string;
    space_below_name?: string;
    space_below_headline?: string;
    space_below_connections?: string;
    connections?: {
      phone_number_format?: RenderPhoneNumberFormat;
      hyperlink?: boolean;
      show_icons?: boolean;
      display_urls_instead_of_usernames?: boolean;
      separator?: string;
      space_between_connections?: string;
    };
  };
  section_titles?: {
    type?: RenderSectionTitleType;
    line_thickness?: string;
    space_above?: string;
    space_below?: string;
  };
  sections?: {
    allow_page_break?: boolean;
    space_between_regular_entries?: string;
    space_between_text_based_entries?: string;
    show_time_spans_in?: string[];
  };
  entries?: {
    date_and_location_width?: string;
    side_space?: string;
    space_between_columns?: string;
    allow_page_break?: boolean;
    short_second_row?: boolean;
    degree_width?: string;
    summary?: {
      space_above?: string;
      space_left?: string;
    };
    highlights?: {
      bullet?: string;
      nested_bullet?: string;
      space_left?: string;
      space_above?: string;
      space_between_items?: string;
      space_between_bullet_and_text?: string;
    };
  };
  templates?: {
    footer?: string;
    top_note?: string;
    single_date?: string;
    date_range?: string;
    time_span?: string;
    one_line_entry?: {
      main_column?: string;
    };
    education_entry?: {
      main_column?: string;
      degree_column?: string | null;
      date_and_location_column?: string;
    };
    normal_entry?: {
      main_column?: string;
      date_and_location_column?: string;
    };
    experience_entry?: {
      main_column?: string;
      date_and_location_column?: string;
    };
    publication_entry?: {
      main_column?: string;
      date_and_location_column?: string;
    };
  };
}

export interface RenderCvLocale {
  language?: RenderLanguage;
  last_updated?: string;
  present?: string;
  month?: string;
  months?: string;
  year?: string;
  years?: string;
  phrases?: {
    degree_with_area?: string;
  };
  month_abbreviations?: string[];
  month_names?: string[];
}

export interface RenderCvRuntimeSettings {
  current_date?: string;
  bold_keywords?: string[];
  pdf_title?: string;
  show_summary_heading?: boolean;
  render_command?: Record<string, unknown>;
}

export interface RenderThemeProfileSettings {
  page_size?: RenderPageSize;
  density_profile?: RenderDensityProfile;
  accent_color?: RenderAccentColor;
  show_contact_icons?: boolean;
  margins_mm?: Partial<{
    top: number;
    bottom: number;
    left: number;
    right: number;
  }>;
  design?: RenderCvDesign;
}

export type RenderThemeProfiles = Partial<Record<RenderThemeId, RenderThemeProfileSettings>>;

export interface RenderThemeSettings {
  theme_id: RenderThemeId;
  page_size: RenderPageSize;
  density_profile: RenderDensityProfile;
  bold_keywords: boolean;
  accent_color: RenderAccentColor;
  show_contact_icons: boolean;
  margins_mm: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  design: RenderCvDesign;
  theme_profiles: RenderThemeProfiles;
  locale: RenderCvLocale;
  settings: RenderCvRuntimeSettings;
}

export interface ArtifactSummary {
  artifact_id: string;
  kind: string;
  mime_type: string;
  file_name: string;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RenderPreviewResponse {
  resume_id: string;
  theme_settings: RenderThemeSettings;
  artifacts: ArtifactSummary[];
  preview_artifacts: ArtifactSummary[];
  pdf_artifact?: ArtifactSummary | null;
}

const DEFAULT_THEME_ID: RenderThemeId = 'classic';
const DEFAULT_MARGINS_MM = {
  top: 10,
  bottom: 10,
  left: 10,
  right: 10,
};

const DEFAULT_MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'June',
  'July',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
];

const DEFAULT_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const densityToLineSpacing: Record<RenderDensityProfile, string> = {
  compact: '0.48em',
  balanced: '0.6em',
  spacious: '0.72em',
};

const densityToRegularSpacing: Record<RenderDensityProfile, string> = {
  compact: '0.8em',
  balanced: '1.2em',
  spacious: '1.6em',
};

const densityToTextSpacing: Record<RenderDensityProfile, string> = {
  compact: '0.16em',
  balanced: '0.3em',
  spacious: '0.42em',
};

const ACCENT_RGB: Record<RenderAccentColor, string> = {
  blue: 'rgb(0, 79, 144)',
  green: 'rgb(21, 128, 61)',
  orange: 'rgb(249, 115, 22)',
  red: 'rgb(220, 38, 38)',
};

const legacyDensityToRegularSpacing: Record<RenderDensityProfile, string> = {
  compact: '0.8em',
  balanced: '1em',
  spacious: '1.2em',
};

const legacyDensityToTextSpacing: Record<RenderDensityProfile, string> = {
  compact: '0.16em',
  balanced: '0.24em',
  spacious: '0.32em',
};

const THEME_BASELINES = themeBaselineData as Record<RenderThemeId, RenderCvDesign>;

export const RENDER_THEME_OPTIONS: Array<{
  id: RenderThemeId;
  label: string;
  description: string;
}> = [
  { id: 'classic', label: 'Classic', description: 'ATS-first academic single column.' },
  { id: 'ember', label: 'Ember', description: 'Warm modern styling with stronger accents.' },
  {
    id: 'engineeringclassic',
    label: 'Engineering Classic',
    description: 'Traditional engineering presentation with tight hierarchy.',
  },
  {
    id: 'engineeringresumes',
    label: 'Engineering Resumes',
    description: 'Hosted RenderCV engineering layout with compact spacing.',
  },
  { id: 'harvard', label: 'Harvard', description: 'Formal academic styling.' },
  { id: 'ink', label: 'Ink', description: 'Editorial, high-contrast design.' },
  { id: 'moderncv', label: 'ModernCV', description: 'RenderCV sidebar-style classic.' },
  { id: 'opal', label: 'Opal', description: 'Softer modern hierarchy and rhythm.' },
  { id: 'sb2nov', label: 'Sb2nov', description: 'Student-focused compact layout.' },
];

export const RENDER_DENSITY_OPTIONS: Array<{
  id: RenderDensityProfile;
  label: string;
}> = [
  { id: 'compact', label: 'Compact' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'spacious', label: 'Spacious' },
];

export const RENDER_ACCENT_OPTIONS: RenderAccentColor[] = ['blue', 'green', 'orange', 'red'];

export const RENDER_LANGUAGE_OPTIONS: Array<{ id: RenderLanguage; label: string }> = [
  { id: 'english', label: 'English' },
  { id: 'arabic', label: 'Arabic' },
  { id: 'danish', label: 'Danish' },
  { id: 'dutch', label: 'Dutch' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'hebrew', label: 'Hebrew' },
  { id: 'hindi', label: 'Hindi' },
  { id: 'hungarian', label: 'Hungarian' },
  { id: 'indonesian', label: 'Indonesian' },
  { id: 'italian', label: 'Italian' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'korean', label: 'Korean' },
  { id: 'mandarin_chinese', label: 'Mandarin Chinese' },
  { id: 'norwegian_bokmål', label: 'Norwegian Bokmal' },
  { id: 'norwegian_nynorsk', label: 'Norwegian Nynorsk' },
  { id: 'persian', label: 'Persian' },
  { id: 'portuguese', label: 'Portuguese' },
  { id: 'russian', label: 'Russian' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'turkish', label: 'Turkish' },
  { id: 'vietnamese', label: 'Vietnamese' },
];

export const RENDER_ALIGNMENT_OPTIONS: Array<{ id: RenderAlignment; label: string }> = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
  { id: 'justified', label: 'Justified' },
  { id: 'justified-with-no-hyphenation', label: 'Justified (No Hyphenation)' },
];

export const RENDER_DATE_ALIGNMENT_OPTIONS: Array<{ id: RenderDateAlignment; label: string }> = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

export const RENDER_PHONE_NUMBER_FORMAT_OPTIONS: Array<{
  id: RenderPhoneNumberFormat;
  label: string;
}> = [
  { id: 'national', label: 'National' },
  { id: 'international', label: 'International' },
  { id: 'E164', label: 'E164' },
];

export const RENDER_PHOTO_POSITION_OPTIONS: Array<{
  id: RenderPhotoPosition;
  label: string;
}> = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

export const RENDER_SECTION_TITLE_TYPE_OPTIONS: Array<{
  id: RenderSectionTitleType;
  label: string;
}> = [
  { id: 'with_partial_line', label: 'Partial Line' },
  { id: 'with_full_line', label: 'Full Line' },
  { id: 'without_line', label: 'No Line' },
  { id: 'moderncv', label: 'ModernCV' },
  { id: 'centered_without_line', label: 'Centered No Line' },
  { id: 'centered_with_partial_line', label: 'Centered Partial Line' },
  { id: 'centered_with_centered_partial_line', label: 'Centered Split Line' },
  { id: 'centered_with_full_line', label: 'Centered Full Line' },
];

export const RENDER_FONT_FAMILY_OPTIONS = [
  'DejaVu Sans Mono',
  'EB Garamond',
  'Fontin',
  'Gentium Book Plus',
  'Lato',
  'Libertinus Serif',
  'Mukta',
  'New Computer Modern',
  'Noto Sans',
  'Open Sans',
  'Open Sauce Sans',
  'Poppins',
  'Raleway',
  'Roboto',
  'Source Sans 3',
  'Ubuntu',
  'XCharter',
] as const;

export const RENDER_BULLET_OPTIONS: RenderBullet[] = ['●', '•', '◦', '-', '◆', '★', '■', '—', '○'];
export const RENDER_DIMENSION_UNITS: RenderDimensionUnit[] = ['cm', 'mm', 'in', 'pt', 'em', 'ex'];

export const TEMPLATE_HINTS = {
  footer: 'Placeholders: NAME, PAGE_NUMBER, TOTAL_PAGES, CURRENT_DATE, MONTH_NAME, YEAR.',
  top_note: 'Placeholders: LAST_UPDATED, CURRENT_DATE, NAME, MONTH_NAME, YEAR.',
  single_date: 'Placeholders: MONTH_NAME, MONTH_ABBREVIATION, MONTH, DAY, YEAR.',
  date_range: 'Placeholders: START_DATE, END_DATE.',
  time_span: 'Placeholders: HOW_MANY_YEARS, YEARS, HOW_MANY_MONTHS, MONTHS.',
  one_line_entry: 'Placeholders: LABEL, DETAILS.',
  education_entry:
    'Placeholders: INSTITUTION, AREA, DEGREE, DEGREE_WITH_AREA, SUMMARY, HIGHLIGHTS, LOCATION, DATE.',
  normal_entry: 'Used for Projects. Placeholders: NAME, SUMMARY, HIGHLIGHTS, LOCATION, DATE.',
  experience_entry: 'Placeholders: COMPANY, POSITION, SUMMARY, HIGHLIGHTS, LOCATION, DATE.',
  publication_entry: 'Placeholders: TITLE, AUTHORS, SUMMARY, DOI, URL, JOURNAL, DATE.',
} as const;

const DEFAULT_RENDERCV_LOCALE: RenderCvLocale = {
  language: 'english',
  last_updated: 'Last updated in',
  present: 'present',
  month: 'month',
  months: 'months',
  year: 'year',
  years: 'years',
  phrases: {
    degree_with_area: 'DEGREE in AREA',
  },
  month_abbreviations: DEFAULT_MONTH_ABBREVIATIONS,
  month_names: DEFAULT_MONTH_NAMES,
};

const DEFAULT_RENDERCV_RUNTIME_SETTINGS: RenderCvRuntimeSettings = {
  current_date: 'today',
  bold_keywords: [],
  pdf_title: 'NAME - CV',
  show_summary_heading: false,
};

function normalizeRuntimeSettings(
  value: RenderCvRuntimeSettings,
  source?: Record<string, unknown> | null
): RenderCvRuntimeSettings {
  const rest: RenderCvRuntimeSettings = { ...value };
  delete rest.show_summary_heading;
  const sourceShowSummaryHeading =
    source && typeof source.show_summary_heading === 'boolean'
      ? source.show_summary_heading
      : undefined;
  const showSummaryHeading =
    typeof sourceShowSummaryHeading === 'boolean'
      ? sourceShowSummaryHeading
      : typeof value.show_summary_heading === 'boolean'
        ? value.show_summary_heading
        : false;

  return {
    ...rest,
    show_summary_heading: showSummaryHeading,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  updates?: Record<string, unknown>
): T {
  if (!updates) {
    return clone(base);
  }

  const output = clone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'undefined') {
      continue;
    }
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key] as Record<string, unknown>, value);
      continue;
    }
    output[key] = clone(value);
  }
  return output as T;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    return aKeys.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

function diffObject(base: unknown, value: unknown): unknown {
  if (deepEqual(base, value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return clone(value);
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const baseRecord = isPlainObject(base) ? base : {};
  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const diff = diffObject(baseRecord[key], nestedValue);
    if (typeof diff !== 'undefined') {
      output[key] = diff;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function mmToInches(value: number): string {
  return `${(value / 25.4).toFixed(2)}in`;
}

function inchesToMm(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const numeric = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(numeric)) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith('mm')) return Math.round(numeric);
  if (normalized.endsWith('cm')) return Math.round(numeric * 10);
  if (normalized.endsWith('pt')) return Math.round((numeric / 72) * 25.4);
  if (normalized.endsWith('in')) return Math.round(numeric * 25.4);
  if (normalized.endsWith('em') || normalized.endsWith('ex')) return fallback;
  return Math.round(numeric * 25.4);
}

function normalizeColorValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/\s+/g, '').toLowerCase();
}

function applyDensityToDesign(
  design: RenderCvDesign,
  density: RenderDensityProfile
): RenderCvDesign {
  return {
    ...design,
    typography: {
      ...design.typography,
      line_spacing: densityToLineSpacing[density],
    },
    sections: {
      ...design.sections,
      space_between_regular_entries: densityToRegularSpacing[density],
      space_between_text_based_entries: densityToTextSpacing[density],
    },
  };
}

function applyAccentToDesign(
  design: RenderCvDesign,
  accentColor: RenderAccentColor
): RenderCvDesign {
  const accent = ACCENT_RGB[accentColor];
  return {
    ...design,
    colors: {
      ...design.colors,
      name: accent,
      headline: accent,
      connections: accent,
      section_titles: accent,
      links: accent,
    },
  };
}

function buildLegacyDefaultDesign(
  themeId: RenderThemeId,
  pageSize: RenderPageSize,
  density: RenderDensityProfile,
  accentColor: RenderAccentColor,
  showContactIcons: boolean,
  marginsMm: RenderThemeSettings['margins_mm']
): RenderCvDesign {
  return {
    theme: themeId,
    page: {
      size: pageSize === 'A4' ? 'a4' : 'us-letter',
      top_margin: mmToInches(marginsMm.top),
      bottom_margin: mmToInches(marginsMm.bottom),
      left_margin: mmToInches(marginsMm.left),
      right_margin: mmToInches(marginsMm.right),
      show_footer: false,
      show_top_note: false,
    },
    colors: {
      body: 'rgb(0, 0, 0)',
      name: ACCENT_RGB[accentColor],
      headline: ACCENT_RGB[accentColor],
      connections: ACCENT_RGB[accentColor],
      section_titles: ACCENT_RGB[accentColor],
      links: ACCENT_RGB[accentColor],
      footer: 'rgb(128, 128, 128)',
      top_note: 'rgb(128, 128, 128)',
    },
    typography: {
      line_spacing: densityToLineSpacing[density],
      alignment: 'left',
      date_and_location_column_alignment: 'right',
      font_family: {
        body: 'XCharter',
        name: 'XCharter',
        headline: 'XCharter',
        connections: 'XCharter',
        section_titles: 'XCharter',
      },
      font_size: {
        body: '10pt',
        name: themeId === 'engineeringresumes' ? '25pt' : '18pt',
        headline: '10pt',
        connections: '10pt',
        section_titles: '1.2em',
      },
      small_caps: {
        name: false,
        headline: false,
        connections: false,
        section_titles: false,
      },
      bold: {
        name: false,
        headline: false,
        connections: false,
        section_titles: true,
      },
    },
    links: {
      underline: true,
      show_external_link_icon: false,
    },
    header: {
      alignment: 'center',
      photo_width: '3.5cm',
      photo_position: 'left',
      photo_space_left: '0.4cm',
      photo_space_right: '0.4cm',
      space_below_name: '0.4cm',
      space_below_headline: '0.4cm',
      space_below_connections: '0.4cm',
      connections: {
        phone_number_format: 'national',
        hyperlink: true,
        show_icons: showContactIcons,
        display_urls_instead_of_usernames: true,
        separator: '|',
        space_between_connections: '0.5cm',
      },
    },
    section_titles: {
      type: themeId === 'moderncv' ? 'moderncv' : 'with_partial_line',
      line_thickness: '0.5pt',
      space_above: '0.5cm',
      space_below: '0.3cm',
    },
    sections: {
      allow_page_break: true,
      space_between_regular_entries: legacyDensityToRegularSpacing[density],
      space_between_text_based_entries: legacyDensityToTextSpacing[density],
      show_time_spans_in: [],
    },
    entries: {
      date_and_location_width: '4.15cm',
      side_space: '0cm',
      space_between_columns: '0.1cm',
      allow_page_break: false,
      short_second_row: false,
      degree_width: '1cm',
      summary: {
        space_above: '0.08cm',
        space_left: '0cm',
      },
      highlights: {
        bullet: '●',
        nested_bullet: '●',
        space_left: '0cm',
        space_above: '0.08cm',
        space_between_items: '0.08cm',
        space_between_bullet_and_text: '0.3em',
      },
    },
    templates: {
      footer: '*NAME -- PAGE_NUMBER/TOTAL_PAGES*',
      top_note: '*LAST_UPDATED CURRENT_DATE*',
      single_date: 'MONTH_ABBREVIATION YEAR',
      date_range: 'START_DATE - END_DATE',
      time_span: 'HOW_MANY_YEARS YEARS HOW_MANY_MONTHS MONTHS',
      one_line_entry: {
        main_column: '**LABEL:** DETAILS',
      },
      education_entry: {
        main_column: '**INSTITUTION**, DEGREE_WITH_AREA -- LOCATION\nSUMMARY\nHIGHLIGHTS',
        degree_column: '',
        date_and_location_column: 'DATE',
      },
      normal_entry: {
        main_column: '**NAME** *| SUMMARY*\nHIGHLIGHTS',
        date_and_location_column: 'DATE',
      },
      experience_entry: {
        main_column: '**POSITION**, COMPANY -- LOCATION\nSUMMARY\nHIGHLIGHTS',
        date_and_location_column: 'DATE',
      },
      publication_entry: {
        main_column: '**TITLE**\nSUMMARY\nAUTHORS\nURL (JOURNAL)',
        date_and_location_column: 'DATE',
      },
    },
  };
}

function normalizeThemeId(value?: string | null): RenderThemeId {
  return RENDER_THEME_OPTIONS.find((option) => option.id === value)?.id ?? DEFAULT_THEME_ID;
}

function normalizePageSize(value?: string | null): RenderPageSize {
  return value === 'LETTER' ? 'LETTER' : 'A4';
}

function normalizeDensity(value?: string | null): RenderDensityProfile {
  return RENDER_DENSITY_OPTIONS.find((option) => option.id === value)?.id ?? 'balanced';
}

function normalizeAccent(value?: string | null): RenderAccentColor {
  return RENDER_ACCENT_OPTIONS.includes(value as RenderAccentColor)
    ? (value as RenderAccentColor)
    : 'blue';
}

function normalizeThemeProfile(
  value?: Partial<RenderThemeProfileSettings> | null
): RenderThemeProfileSettings {
  const margins = value?.margins_mm;
  const normalizedMargins =
    isPlainObject(margins) && Object.keys(margins).length > 0
      ? {
          ...(typeof margins.top === 'number' ? { top: margins.top } : {}),
          ...(typeof margins.bottom === 'number' ? { bottom: margins.bottom } : {}),
          ...(typeof margins.left === 'number' ? { left: margins.left } : {}),
          ...(typeof margins.right === 'number' ? { right: margins.right } : {}),
        }
      : undefined;

  return {
    ...(value?.page_size ? { page_size: normalizePageSize(value.page_size) } : {}),
    ...(value?.density_profile ? { density_profile: normalizeDensity(value.density_profile) } : {}),
    ...(value?.accent_color ? { accent_color: normalizeAccent(value.accent_color) } : {}),
    ...(typeof value?.show_contact_icons === 'boolean'
      ? { show_contact_icons: value.show_contact_icons }
      : {}),
    ...(normalizedMargins && Object.keys(normalizedMargins).length > 0
      ? { margins_mm: normalizedMargins }
      : {}),
    ...(isPlainObject(value?.design) ? { design: clone(value.design as RenderCvDesign) } : {}),
  };
}

function normalizeThemeProfiles(value: unknown): RenderThemeProfiles {
  if (!isPlainObject(value)) {
    return {};
  }

  const nextProfiles: RenderThemeProfiles = {};
  for (const option of RENDER_THEME_OPTIONS) {
    const rawProfile = value[option.id];
    if (!isPlainObject(rawProfile)) {
      continue;
    }
    const normalized = normalizeThemeProfile(rawProfile as RenderThemeProfileSettings);
    if (isThemeProfileEmpty(normalized)) {
      continue;
    }
    nextProfiles[option.id] = normalized;
  }
  return nextProfiles;
}

export function getThemeDesignBaseline(themeId: RenderThemeId): RenderCvDesign {
  const classicBaseline = clone(THEME_BASELINES.classic);
  if (themeId === 'classic') {
    return classicBaseline;
  }
  const override = THEME_BASELINES[themeId] ?? { theme: themeId };
  return {
    ...(deepMerge(
      classicBaseline as Record<string, unknown>,
      override as Record<string, unknown>
    ) as RenderCvDesign),
    theme: themeId,
  };
}

function inferAccentFromDesign(design: RenderCvDesign): RenderAccentColor {
  const accentCandidates = [
    design.colors?.name,
    design.colors?.headline,
    design.colors?.connections,
    design.colors?.section_titles,
    design.colors?.links,
  ]
    .map((value) => normalizeColorValue(value))
    .filter(Boolean) as string[];

  for (const [accent, rgb] of Object.entries(ACCENT_RGB) as Array<[RenderAccentColor, string]>) {
    const normalizedRgb = normalizeColorValue(rgb);
    if (accentCandidates.length > 0 && accentCandidates.every((value) => value === normalizedRgb)) {
      return accent;
    }
  }

  const nameColor = normalizeColorValue(design.colors?.name);
  for (const [accent, rgb] of Object.entries(ACCENT_RGB) as Array<[RenderAccentColor, string]>) {
    if (nameColor === normalizeColorValue(rgb)) {
      return accent;
    }
  }

  return 'blue';
}

function inferDensityFromDesign(design: RenderCvDesign): RenderDensityProfile {
  const lineSpacing = design.typography?.line_spacing;
  const regularSpacing = design.sections?.space_between_regular_entries;
  const textSpacing = design.sections?.space_between_text_based_entries;

  for (const density of RENDER_DENSITY_OPTIONS.map((option) => option.id)) {
    if (
      lineSpacing === densityToLineSpacing[density] &&
      regularSpacing === densityToRegularSpacing[density] &&
      textSpacing === densityToTextSpacing[density]
    ) {
      return density;
    }
  }

  return 'balanced';
}

function resolveThemeProfileState(
  themeId: RenderThemeId,
  profile?: RenderThemeProfileSettings
): Pick<
  RenderThemeSettings,
  'page_size' | 'density_profile' | 'accent_color' | 'show_contact_icons' | 'margins_mm' | 'design'
> {
  const activeProfile = normalizeThemeProfile(profile);
  let design = deepMerge(
    getThemeDesignBaseline(themeId) as Record<string, unknown>,
    (activeProfile.design ?? {}) as Record<string, unknown>
  ) as RenderCvDesign;

  if (activeProfile.page_size) {
    design = {
      ...design,
      page: {
        ...design.page,
        size: activeProfile.page_size === 'A4' ? 'a4' : 'us-letter',
      },
    };
  }

  if (activeProfile.margins_mm) {
    design = {
      ...design,
      page: {
        ...design.page,
        ...(typeof activeProfile.margins_mm.top === 'number'
          ? { top_margin: mmToInches(activeProfile.margins_mm.top) }
          : {}),
        ...(typeof activeProfile.margins_mm.bottom === 'number'
          ? { bottom_margin: mmToInches(activeProfile.margins_mm.bottom) }
          : {}),
        ...(typeof activeProfile.margins_mm.left === 'number'
          ? { left_margin: mmToInches(activeProfile.margins_mm.left) }
          : {}),
        ...(typeof activeProfile.margins_mm.right === 'number'
          ? { right_margin: mmToInches(activeProfile.margins_mm.right) }
          : {}),
      },
    };
  }

  if (typeof activeProfile.show_contact_icons === 'boolean') {
    design = {
      ...design,
      header: {
        ...design.header,
        connections: {
          ...design.header?.connections,
          show_icons: activeProfile.show_contact_icons,
        },
      },
    };
  }

  if (activeProfile.density_profile) {
    design = applyDensityToDesign(design, activeProfile.density_profile);
  }

  if (activeProfile.accent_color) {
    design = applyAccentToDesign(design, activeProfile.accent_color);
  }

  const pageSize =
    design.page?.size === 'us-letter'
      ? 'LETTER'
      : design.page?.size === 'a4'
        ? 'A4'
        : (activeProfile.page_size ?? 'A4');

  const marginsMm = {
    top: inchesToMm(design.page?.top_margin, DEFAULT_MARGINS_MM.top),
    bottom: inchesToMm(design.page?.bottom_margin, DEFAULT_MARGINS_MM.bottom),
    left: inchesToMm(design.page?.left_margin, DEFAULT_MARGINS_MM.left),
    right: inchesToMm(design.page?.right_margin, DEFAULT_MARGINS_MM.right),
  };

  const showContactIcons =
    typeof activeProfile.show_contact_icons === 'boolean'
      ? activeProfile.show_contact_icons
      : (design.header?.connections?.show_icons ?? false);

  return {
    page_size: pageSize,
    density_profile: activeProfile.density_profile ?? inferDensityFromDesign(design),
    accent_color: activeProfile.accent_color ?? inferAccentFromDesign(design),
    show_contact_icons: showContactIcons,
    margins_mm: marginsMm,
    design: {
      ...design,
      theme: themeId,
      page: {
        ...design.page,
        size: pageSize === 'A4' ? 'a4' : 'us-letter',
      },
      header: {
        ...design.header,
        connections: {
          ...design.header?.connections,
          show_icons: showContactIcons,
        },
      },
    },
  };
}

function isThemeProfileEmpty(profile?: RenderThemeProfileSettings | null): boolean {
  if (!profile) {
    return true;
  }
  return !(
    profile.page_size ||
    profile.density_profile ||
    profile.accent_color ||
    typeof profile.show_contact_icons === 'boolean' ||
    (profile.margins_mm && Object.keys(profile.margins_mm).length > 0) ||
    (profile.design && Object.keys(profile.design).length > 0)
  );
}

function cleanThemeProfile(
  profile?: RenderThemeProfileSettings | null
): RenderThemeProfileSettings | null {
  if (!profile) {
    return null;
  }

  const nextProfile: RenderThemeProfileSettings = {};
  if (profile.page_size) {
    nextProfile.page_size = normalizePageSize(profile.page_size);
  }
  if (profile.density_profile) {
    nextProfile.density_profile = normalizeDensity(profile.density_profile);
  }
  if (profile.accent_color) {
    nextProfile.accent_color = normalizeAccent(profile.accent_color);
  }
  if (typeof profile.show_contact_icons === 'boolean') {
    nextProfile.show_contact_icons = profile.show_contact_icons;
  }
  if (profile.margins_mm && Object.keys(profile.margins_mm).length > 0) {
    nextProfile.margins_mm = clone(profile.margins_mm);
  }
  if (profile.design) {
    const cleanedDesign = diffObject({}, profile.design);
    if (cleanedDesign && isPlainObject(cleanedDesign)) {
      nextProfile.design = cleanedDesign as RenderCvDesign;
    }
  }

  return isThemeProfileEmpty(nextProfile) ? null : nextProfile;
}

function normalizeLegacyRenderThemeSettings(
  value?: Partial<RenderThemeSettings> | null
): RenderThemeSettings {
  const themeId = normalizeThemeId(
    (value?.design as RenderCvDesign | undefined)?.theme ?? value?.theme_id
  );
  const density = normalizeDensity(value?.density_profile);
  const accentColor = normalizeAccent(value?.accent_color);
  const marginsMm = {
    ...DEFAULT_MARGINS_MM,
    ...(value?.margins_mm ?? {}),
  };
  const designDefaults = buildLegacyDefaultDesign(
    themeId,
    normalizePageSize(value?.page_size),
    density,
    accentColor,
    Boolean(value?.show_contact_icons),
    marginsMm
  );
  const design = deepMerge(
    designDefaults as Record<string, unknown>,
    (value?.design ?? {}) as Record<string, unknown>
  ) as RenderCvDesign;
  const pageSize =
    design.page?.size === 'us-letter'
      ? 'LETTER'
      : design.page?.size === 'a4'
        ? 'A4'
        : normalizePageSize(value?.page_size);
  const nextMargins = {
    top: inchesToMm(design.page?.top_margin, marginsMm.top),
    bottom: inchesToMm(design.page?.bottom_margin, marginsMm.bottom),
    left: inchesToMm(design.page?.left_margin, marginsMm.left),
    right: inchesToMm(design.page?.right_margin, marginsMm.right),
  };
  const locale = deepMerge(
    DEFAULT_RENDERCV_LOCALE as Record<string, unknown>,
    (value?.locale ?? {}) as Record<string, unknown>
  ) as RenderCvLocale;
  const runtimeSettings = normalizeRuntimeSettings(
    deepMerge(
      DEFAULT_RENDERCV_RUNTIME_SETTINGS as Record<string, unknown>,
      (value?.settings ?? {}) as Record<string, unknown>
    ) as RenderCvRuntimeSettings,
    (value?.settings ?? {}) as Record<string, unknown>
  );

  return {
    theme_id: themeId,
    page_size: pageSize,
    density_profile: density,
    bold_keywords: Boolean(value?.bold_keywords ?? false),
    accent_color: accentColor,
    show_contact_icons:
      design.header?.connections?.show_icons ?? value?.show_contact_icons ?? false,
    margins_mm: nextMargins,
    design: {
      ...design,
      theme: themeId,
      page: {
        ...design.page,
        size: pageSize === 'A4' ? 'a4' : 'us-letter',
      },
      header: {
        ...design.header,
        connections: {
          ...design.header?.connections,
          show_icons: design.header?.connections?.show_icons ?? value?.show_contact_icons ?? false,
        },
      },
    },
    theme_profiles: {},
    locale,
    settings: runtimeSettings,
  };
}

function migrateLegacyThemeSettings(
  value?: Partial<RenderThemeSettings> | null
): RenderThemeSettings {
  const legacySettings = normalizeLegacyRenderThemeSettings(value);
  const baselineState = resolveThemeProfileState(legacySettings.theme_id, {});
  const designDiff = diffObject(
    getThemeDesignBaseline(legacySettings.theme_id),
    legacySettings.design
  ) as RenderCvDesign | undefined;

  const migratedProfile = cleanThemeProfile({
    ...(legacySettings.page_size !== baselineState.page_size
      ? { page_size: legacySettings.page_size }
      : {}),
    ...(legacySettings.density_profile !== baselineState.density_profile
      ? { density_profile: legacySettings.density_profile }
      : {}),
    ...(legacySettings.accent_color !== baselineState.accent_color
      ? { accent_color: legacySettings.accent_color }
      : {}),
    ...(legacySettings.show_contact_icons !== baselineState.show_contact_icons
      ? { show_contact_icons: legacySettings.show_contact_icons }
      : {}),
    ...(!deepEqual(legacySettings.margins_mm, baselineState.margins_mm)
      ? { margins_mm: legacySettings.margins_mm }
      : {}),
    ...(designDiff ? { design: designDiff } : {}),
  });

  return normalizeRenderThemeSettings({
    theme_id: legacySettings.theme_id,
    theme_profiles: migratedProfile ? { [legacySettings.theme_id]: migratedProfile } : {},
    locale: legacySettings.locale,
    settings: legacySettings.settings,
    bold_keywords: legacySettings.bold_keywords,
  });
}

export function normalizeRenderThemeSettings(
  value?: Partial<RenderThemeSettings> | null
): RenderThemeSettings {
  if (!value) {
    const resolved = resolveThemeProfileState(DEFAULT_THEME_ID, {});
    return {
      theme_id: DEFAULT_THEME_ID,
      page_size: resolved.page_size,
      density_profile: resolved.density_profile,
      bold_keywords: false,
      accent_color: resolved.accent_color,
      show_contact_icons: resolved.show_contact_icons,
      margins_mm: resolved.margins_mm,
      design: resolved.design,
      theme_profiles: {},
      locale: clone(DEFAULT_RENDERCV_LOCALE),
      settings: clone(DEFAULT_RENDERCV_RUNTIME_SETTINGS),
    };
  }

  if (!('theme_profiles' in value)) {
    return migrateLegacyThemeSettings(value);
  }

  const themeId = normalizeThemeId(value.theme_id);
  const themeProfiles = normalizeThemeProfiles(value.theme_profiles);
  const resolved = resolveThemeProfileState(themeId, themeProfiles[themeId]);
  const locale = deepMerge(
    DEFAULT_RENDERCV_LOCALE as Record<string, unknown>,
    (value.locale ?? {}) as Record<string, unknown>
  ) as RenderCvLocale;
  const runtimeSettings = normalizeRuntimeSettings(
    deepMerge(
      DEFAULT_RENDERCV_RUNTIME_SETTINGS as Record<string, unknown>,
      (value.settings ?? {}) as Record<string, unknown>
    ) as RenderCvRuntimeSettings,
    (value.settings ?? {}) as Record<string, unknown>
  );

  return {
    theme_id: themeId,
    page_size: resolved.page_size,
    density_profile: resolved.density_profile,
    bold_keywords: Boolean(value.bold_keywords ?? false),
    accent_color: resolved.accent_color,
    show_contact_icons: resolved.show_contact_icons,
    margins_mm: resolved.margins_mm,
    design: resolved.design,
    theme_profiles: themeProfiles,
    locale,
    settings: runtimeSettings,
  };
}

export const DEFAULT_RENDER_THEME_SETTINGS = normalizeRenderThemeSettings({
  theme_id: DEFAULT_THEME_ID,
  theme_profiles: {},
  locale: DEFAULT_RENDERCV_LOCALE,
  settings: DEFAULT_RENDERCV_RUNTIME_SETTINGS,
});

export function serializeRenderThemeSettings(
  value?: RenderThemeSettings | null
): Record<string, unknown> {
  const resolved = normalizeRenderThemeSettings(value);
  const themeProfiles: Record<string, RenderThemeProfileSettings> = {};

  for (const option of RENDER_THEME_OPTIONS) {
    const cleanedProfile = cleanThemeProfile(resolved.theme_profiles[option.id]);
    if (cleanedProfile) {
      themeProfiles[option.id] = cleanedProfile;
    }
  }

  return {
    theme_id: resolved.theme_id,
    bold_keywords: resolved.bold_keywords,
    locale: clone(resolved.locale),
    settings: clone(resolved.settings),
    theme_profiles: themeProfiles,
  };
}

export function switchActiveRenderTheme(
  settings: RenderThemeSettings,
  themeId: RenderThemeId
): RenderThemeSettings {
  return normalizeRenderThemeSettings({
    ...settings,
    theme_id: themeId,
    theme_profiles: settings.theme_profiles,
  });
}

export function resetActiveRenderThemeProfile(settings: RenderThemeSettings): RenderThemeSettings {
  const nextProfiles = { ...settings.theme_profiles };
  delete nextProfiles[settings.theme_id];
  return normalizeRenderThemeSettings({
    ...settings,
    theme_profiles: nextProfiles,
  });
}

export function updateActiveRenderTheme(
  settings: RenderThemeSettings,
  mutate: (draft: { design: RenderCvDesign; profile: RenderThemeProfileSettings }) => void
): RenderThemeSettings {
  const themeId = settings.theme_id;
  const draftDesign = clone(settings.design);
  const draftProfile = normalizeThemeProfile(settings.theme_profiles[themeId]);

  mutate({ design: draftDesign, profile: draftProfile });

  const designDiff = diffObject(getThemeDesignBaseline(themeId), draftDesign) as
    | RenderCvDesign
    | undefined;

  const cleanedProfile = cleanThemeProfile({
    ...draftProfile,
    ...(designDiff ? { design: designDiff } : { design: undefined }),
  });

  const nextProfiles = { ...settings.theme_profiles };
  if (cleanedProfile) {
    nextProfiles[themeId] = cleanedProfile;
  } else {
    delete nextProfiles[themeId];
  }

  return normalizeRenderThemeSettings({
    ...settings,
    theme_profiles: nextProfiles,
  });
}

export function renderThemeSettingsToQuery(settings?: RenderThemeSettings): URLSearchParams {
  const resolved = normalizeRenderThemeSettings(settings);
  const density = resolved.density_profile;
  const params = new URLSearchParams();
  params.set('template', resolved.theme_id);
  params.set('pageSize', resolved.page_size);
  params.set('compactMode', String(density === 'compact'));
  params.set('sectionSpacing', density === 'compact' ? '1' : density === 'spacious' ? '4' : '3');
  params.set('itemSpacing', density === 'compact' ? '1' : density === 'spacious' ? '4' : '2');
  params.set('lineHeight', density === 'compact' ? '1' : density === 'spacious' ? '4' : '3');
  params.set('accentColor', resolved.accent_color);
  params.set('showContactIcons', String(resolved.show_contact_icons));
  params.set('marginTop', String(resolved.margins_mm.top));
  params.set('marginBottom', String(resolved.margins_mm.bottom));
  params.set('marginLeft', String(resolved.margins_mm.left));
  params.set('marginRight', String(resolved.margins_mm.right));
  return params;
}
