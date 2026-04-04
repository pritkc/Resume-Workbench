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
export type RenderAlignment = 'left' | 'center' | 'right' | 'justified';
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
      degree_column?: string;
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
  render_command?: Record<string, unknown>;
}

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
  balanced: '1em',
  spacious: '1.2em',
};

const densityToTextSpacing: Record<RenderDensityProfile, string> = {
  compact: '0.16em',
  balanced: '0.24em',
  spacious: '0.32em',
};

const ACCENT_RGB: Record<RenderAccentColor, string> = {
  blue: 'rgb(0, 79, 144)',
  green: 'rgb(21, 128, 61)',
  orange: 'rgb(249, 115, 22)',
  red: 'rgb(220, 38, 38)',
};

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

function mmToInches(value: number): string {
  return `${(value / 25.4).toFixed(2)}in`;
}

function inchesToMm(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(numeric)) return fallback;
  if (value.includes('cm')) return Math.round(numeric * 10);
  if (value.includes('pt')) return Math.round((numeric / 72) * 25.4);
  if (value.includes('em')) return fallback;
  return Math.round(numeric * 25.4);
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  updates?: Record<string, unknown>
): T {
  if (!updates) return structuredClone(base);

  const output = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(
        output[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
      continue;
    }
    output[key] = value;
  }
  return output as T;
}

function buildDefaultDesign(
  themeId: RenderThemeId,
  pageSize: RenderPageSize,
  density: RenderDensityProfile,
  accentColor: RenderAccentColor,
  showContactIcons: boolean,
  marginsMm: RenderThemeSettings['margins_mm']
): RenderCvDesign {
  const accent = ACCENT_RGB[accentColor];
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
      name: accent,
      headline: accent,
      connections: accent,
      section_titles: accent,
      links: accent,
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
      space_between_regular_entries: densityToRegularSpacing[density],
      space_between_text_based_entries: densityToTextSpacing[density],
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
        main_column: '**NAME** -- **LOCATION**\nSUMMARY\nHIGHLIGHTS',
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
};

export const DEFAULT_RENDER_THEME_SETTINGS: RenderThemeSettings = {
  theme_id: 'classic',
  page_size: 'A4',
  density_profile: 'balanced',
  bold_keywords: false,
  accent_color: 'blue',
  show_contact_icons: false,
  margins_mm: { ...DEFAULT_MARGINS_MM },
  design: buildDefaultDesign('classic', 'A4', 'balanced', 'blue', false, DEFAULT_MARGINS_MM),
  locale: structuredClone(DEFAULT_RENDERCV_LOCALE),
  settings: structuredClone(DEFAULT_RENDERCV_RUNTIME_SETTINGS),
};

function normalizeThemeId(value?: string | null): RenderThemeId {
  return (
    RENDER_THEME_OPTIONS.find((option) => option.id === value)?.id ??
    DEFAULT_RENDER_THEME_SETTINGS.theme_id
  );
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

export function normalizeRenderThemeSettings(
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
  const designDefaults = buildDefaultDesign(
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
  const runtimeSettings = deepMerge(
    DEFAULT_RENDERCV_RUNTIME_SETTINGS as Record<string, unknown>,
    (value?.settings ?? {}) as Record<string, unknown>
  ) as RenderCvRuntimeSettings;

  return {
    ...DEFAULT_RENDER_THEME_SETTINGS,
    ...value,
    theme_id: themeId,
    page_size: pageSize,
    density_profile: density,
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
    locale,
    settings: runtimeSettings,
  };
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
