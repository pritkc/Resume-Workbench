import type { Page, Route } from '@playwright/test';

export const frontendBaseUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3000';
export const masterResumeId = 'master-123';
export const tailoredResumeId = 'tailored-123';

export const themeSettings = {
  theme_id: 'moderncv' as const,
  page_size: 'A4' as const,
  density_profile: 'balanced' as const,
  bold_keywords: false,
  accent_color: 'blue' as const,
  show_contact_icons: false,
  margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
};

export const resumePreview = {
  personalInfo: {
    name: 'Jane Doe',
    title: 'Platform Engineer',
    email: 'jane@example.com',
    phone: '555-0100',
    location: 'San Francisco, CA',
    linkedin: 'linkedin.com/in/janedoe',
    github: 'github.com/janedoe',
  },
  summary: 'Platform engineer focused on APIs, reliability, and analytics workflows.',
  workExperience: [
    {
      id: 1,
      title: 'Senior Backend Engineer',
      company: 'Example Cloud',
      location: 'Remote',
      years: '2023 - Present',
      description: [
        'Built FastAPI services for internal platform automation.',
        'Improved data pipeline observability for product analytics.',
      ],
    },
  ],
  education: [
    {
      id: 1,
      institution: 'State University',
      degree: 'B.S. Computer Science',
      years: '2018 - 2022',
      description: 'GPA: 3.9',
    },
  ],
  personalProjects: [
    {
      id: 1,
      name: 'Resume Forge',
      role: 'Creator',
      years: '2025',
      description: ['Built a resume workflow tool with typed rendering and preview support.'],
    },
  ],
  additional: {
    technicalSkills: ['FastAPI', 'PostgreSQL', 'Python', 'Playwright'],
    languages: ['English'],
    certificationsTraining: [],
    awards: ['Hackathon Winner'],
  },
};

export const pngArtifact = {
  artifact_id: 'artifact-preview',
  kind: 'resume_preview_png',
  mime_type: 'image/png',
  file_name: 'preview.png',
  url: '/api/v1/artifacts/artifact-preview',
};

export const pdfArtifact = {
  artifact_id: 'artifact-pdf',
  kind: 'resume_pdf',
  mime_type: 'application/pdf',
  file_name: 'resume.pdf',
  url: '/api/v1/artifacts/artifact-pdf',
};

export const previewResult = {
  data: {
    request_id: 'req-preview',
    resume_id: null,
    application_pack_id: 'pack-123',
    generation_run_id: 'run-123',
    job_id: 'job-123',
    resume_preview: resumePreview,
    improvements: [{ suggestion: 'Highlight FastAPI and API reliability work.', lineNumber: 1 }],
    cover_letter:
      'Tailored cover letter for the platform team.\n\nI build API systems that are observable and recruiter-readable.',
    outreach_message:
      'Hi team, I am excited about this backend role and would love to share why my API and analytics experience matches the position.',
    artifacts: [pngArtifact, pdfArtifact],
    theme_settings: themeSettings,
    warnings: ['Maintained one-page layout.'],
    diff_summary: {
      total_changes: 3,
      skills_added: 1,
      skills_removed: 0,
      descriptions_modified: 1,
      certifications_added: 0,
      high_risk_changes: 0,
    },
    detailed_changes: [
      {
        field_path: 'summary',
        field_type: 'summary',
        change_type: 'modified',
        original_value: 'Original summary',
        new_value: 'Platform engineer focused on APIs, reliability, and analytics workflows.',
        confidence: 'high',
      },
      {
        field_path: 'additional.technicalSkills[0]',
        field_type: 'skill',
        change_type: 'added',
        original_value: '',
        new_value: 'FastAPI',
        confidence: 'high',
      },
    ],
  },
};

export const confirmedResult = {
  data: {
    ...previewResult.data,
    resume_id: tailoredResumeId,
  },
};

export const masterResumeResponse = {
  request_id: 'req-master',
  data: {
    resume_id: masterResumeId,
    raw_resume: {
      id: null,
      content: JSON.stringify(resumePreview),
      content_type: 'json',
      created_at: '2026-04-01T00:00:00Z',
      processing_status: 'ready' as const,
    },
    processed_resume: resumePreview,
    cover_letter: null,
    outreach_message: null,
    parent_id: null,
    title: 'Master Resume',
    application_pack_id: null,
    theme_settings: themeSettings,
  },
};

export const tailoredResumeResponse = {
  request_id: 'req-tailored',
  data: {
    resume_id: tailoredResumeId,
    raw_resume: {
      id: null,
      content: JSON.stringify(resumePreview),
      content_type: 'json',
      created_at: '2026-04-01T00:00:00Z',
      processing_status: 'ready' as const,
    },
    processed_resume: resumePreview,
    cover_letter: confirmedResult.data.cover_letter,
    outreach_message: confirmedResult.data.outreach_message,
    parent_id: masterResumeId,
    title: 'FastAPI Tailored Resume',
    application_pack_id: confirmedResult.data.application_pack_id,
    theme_settings: themeSettings,
  },
};

export const jobDescriptionResponse = {
  job_id: 'job-123',
  content:
    'Senior backend role focused on FastAPI, recruiter-friendly impact bullets, data quality, testing, and one-page ATS resume alignment.',
};

export function statusPayload(overrides?: Partial<Record<string, unknown>>) {
  return {
    status: 'ready',
    llm_configured: true,
    llm_healthy: true,
    has_master_resume: true,
    database_stats: {
      total_resumes: 2,
      total_jobs: 4,
      total_improvements: 3,
      has_master_resume: true,
    },
    ...overrides,
  };
}

export async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

export async function installArtifactMocks(page: Page) {
  const pngBody = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p7xLZcAAAAASUVORK5CYII=',
    'base64'
  );
  await page.route('**/api/v1/artifacts/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: pngBody,
    });
  });
}

export async function gotoWithRetry(page: Page, url: string, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

export async function collectBrowserProblems(page: Page) {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('response', async (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  return {
    consoleMessages,
    pageErrors,
    failedResponses,
  };
}
