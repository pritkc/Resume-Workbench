import type { Page, Route } from "@playwright/test";

export const frontendBaseUrl =
  process.env.E2E_FRONTEND_URL ?? "http://127.0.0.1:3100";
export const masterResumeId = "master-123";
export const tailoredResumeId = "tailored-123";

export const themeSettings = {
  theme_id: "moderncv" as const,
  page_size: "A4" as const,
  density_profile: "balanced" as const,
  bold_keywords: false,
  accent_color: "blue" as const,
  show_contact_icons: false,
  margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
};

export const resumePreview = {
  personalInfo: {
    name: "Avery Chen",
    title: "Platform Engineer",
    email: "avery.chen@example.com",
    phone: "(555) 014-8820",
    location: "Chicago, IL",
    linkedin: "linkedin.com/in/averychen-demo",
    github: "github.com/averychen-demo",
  },
  summary:
    "Platform engineer focused on APIs, reliability, and analytics workflows.",
  workExperience: [
    {
      id: 1,
      title: "Senior Backend Engineer",
      company: "Example Cloud",
      location: "Remote",
      years: "2023 - Present",
      description: [
        "Built FastAPI services for internal platform automation.",
        "Improved data pipeline observability for product analytics.",
      ],
    },
  ],
  education: [
    {
      id: 1,
      institution: "State University",
      degree: "B.S. Computer Science",
      years: "2018 - 2022",
      description: "GPA: 3.9",
    },
  ],
  personalProjects: [
    {
      id: 1,
      name: "Resume Forge",
      role: "Creator",
      years: "2025",
      description: [
        "Built a resume workflow tool with typed rendering and preview support.",
      ],
    },
  ],
  additional: {
    technicalSkills: ["FastAPI", "PostgreSQL", "Python", "Playwright"],
    languages: ["English"],
    certificationsTraining: [],
    awards: ["Hackathon Winner"],
  },
};

export const pngArtifact = {
  artifact_id: "artifact-preview",
  kind: "resume_preview_png",
  mime_type: "image/png",
  file_name: "preview.png",
  url: "/api/v1/artifacts/artifact-preview",
};

export const pdfArtifact = {
  artifact_id: "artifact-pdf",
  kind: "resume_pdf",
  mime_type: "application/pdf",
  file_name: "resume.pdf",
  url: "/api/v1/artifacts/artifact-pdf",
};

export const previewResult = {
  data: {
    request_id: "req-preview",
    resume_id: null,
    application_pack_id: "pack-123",
    generation_run_id: "run-123",
    job_id: "job-123",
    resume_preview: resumePreview,
    improvements: [
      {
        suggestion: "Highlight FastAPI and API reliability work.",
        lineNumber: 1,
      },
    ],
    cover_letter:
      "Tailored cover letter for the platform team.\n\nI build API systems that are observable and recruiter-readable.",
    outreach_message:
      "Hi team, I am excited about this backend role and would love to share why my API and analytics experience matches the position.",
    artifacts: [pngArtifact, pdfArtifact],
    theme_settings: themeSettings,
    warnings: ["Maintained one-page layout."],
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
        field_path: "summary",
        field_type: "summary",
        change_type: "modified",
        original_value: "Original summary",
        new_value:
          "Platform engineer focused on APIs, reliability, and analytics workflows.",
        confidence: "high",
      },
      {
        field_path: "additional.technicalSkills[0]",
        field_type: "skill",
        change_type: "added",
        original_value: "",
        new_value: "FastAPI",
        confidence: "high",
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
  request_id: "req-master",
  data: {
    resume_id: masterResumeId,
    raw_resume: {
      id: null,
      content: JSON.stringify(resumePreview),
      content_type: "json",
      created_at: "2026-04-01T00:00:00Z",
      processing_status: "ready" as const,
    },
    processed_resume: resumePreview,
    cover_letter: null,
    outreach_message: null,
    parent_id: null,
    title: "Master Resume",
    application_pack_id: null,
    theme_settings: themeSettings,
  },
};

export const tailoredResumeResponse = {
  request_id: "req-tailored",
  data: {
    resume_id: tailoredResumeId,
    raw_resume: {
      id: null,
      content: JSON.stringify(resumePreview),
      content_type: "json",
      created_at: "2026-04-01T00:00:00Z",
      processing_status: "ready" as const,
    },
    processed_resume: resumePreview,
    cover_letter: confirmedResult.data.cover_letter,
    outreach_message: confirmedResult.data.outreach_message,
    parent_id: masterResumeId,
    title: "FastAPI Tailored Resume",
    application_pack_id: confirmedResult.data.application_pack_id,
    theme_settings: themeSettings,
  },
};

export const jobDescriptionResponse = {
  job_id: "job-123",
  content:
    "Senior backend role focused on FastAPI, recruiter-friendly impact bullets, data quality, testing, and one-page ATS resume alignment.",
};

export function statusPayload(overrides?: Partial<Record<string, unknown>>) {
  return {
    status: "ready",
    llm_configured: true,
    llm_healthy: true,
    has_active_resume: true,
    database_stats: {
      total_resumes: 2,
      total_jobs: 4,
      total_improvements: 3,
      has_active_resume: true,
    },
    ...overrides,
  };
}

export async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
}

export async function installArtifactMocks(page: Page) {
  const previewSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" viewBox="0 0 600 840">
      <rect width="600" height="840" fill="#f4f3ed" />
      <rect x="28" y="20" width="544" height="800" fill="#ffffff" stroke="#d4d4d0" />
      <text x="56" y="68" font-family="Georgia, serif" font-size="28" font-weight="700" fill="#111827">Avery Chen</text>
      <text x="56" y="94" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#ea580c">PLATFORM ENGINEER</text>
      <text x="56" y="117" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#4b5563">Chicago, IL  •  avery.chen@example.com  •  (555) 014-8820</text>
      <line x1="56" y1="137" x2="544" y2="137" stroke="#111827" stroke-width="2" />

      <text x="56" y="169" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">SUMMARY</text>
      <text x="56" y="191" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">Platform engineer building reliable APIs, internal developer tooling, and observable data systems.</text>

      <text x="56" y="231" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">EXPERIENCE</text>
      <line x1="56" y1="239" x2="544" y2="239" stroke="#d1d5db" />
      <text x="56" y="264" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#111827">Senior Backend Engineer</text>
      <text x="544" y="264" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#4b5563">2023 – Present</text>
      <text x="56" y="282" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#ea580c">Example Cloud  •  Remote</text>
      <text x="65" y="306" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">• Built FastAPI services for internal platform automation and safer releases.</text>
      <text x="65" y="326" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">• Improved data pipeline observability and shortened incident response time.</text>
      <text x="65" y="346" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">• Added typed contracts and focused test coverage across critical workflows.</text>

      <text x="56" y="390" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">PROJECTS</text>
      <line x1="56" y1="398" x2="544" y2="398" stroke="#d1d5db" />
      <text x="56" y="423" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#111827">Resume Forge</text>
      <text x="544" y="423" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#4b5563">2025</text>
      <text x="65" y="447" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">• Built a typed resume workflow with reviewable AI changes and PDF previews.</text>
      <text x="65" y="467" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">• Added prompt controls, trace inspection, and reusable application packs.</text>

      <text x="56" y="511" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">EDUCATION</text>
      <line x1="56" y1="519" x2="544" y2="519" stroke="#d1d5db" />
      <text x="56" y="544" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#111827">B.S. Computer Science</text>
      <text x="544" y="544" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#4b5563">2018 – 2022</text>
      <text x="56" y="564" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">State University  •  GPA 3.9</text>

      <text x="56" y="608" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">TECHNICAL SKILLS</text>
      <line x1="56" y1="616" x2="544" y2="616" stroke="#d1d5db" />
      <text x="56" y="641" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#374151">Python  •  FastAPI  •  PostgreSQL  •  TypeScript  •  React  •  Playwright  •  Docker</text>
    </svg>
  `.trim();
  const pdfBody = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 18 Tf 36 360 Td (Mock PDF Artifact) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
  );
  await page.route("**/api/v1/artifacts/**", async (route) => {
    const url = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: url.includes("artifact-pdf")
        ? "application/pdf"
        : "image/svg+xml",
      body: url.includes("artifact-pdf") ? pdfBody : previewSvg,
    });
  });
}

export async function gotoWithRetry(page: Page, url: string, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
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

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", async (response) => {
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
