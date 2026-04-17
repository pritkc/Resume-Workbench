import { expect, test, type Page } from "@playwright/test";
import { fulfillJson, frontendBaseUrl } from "./playwright-fixtures";

const resumeId = "3ed603c4-82a1-43a9-a64d-4b22df2bd7b6";

async function mockBuilderRoutes(page: Page) {
  await page.route(/\/api\/v1\/status(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      status: "ready",
      llm_configured: true,
      llm_healthy: true,
      has_active_resume: true,
      database_stats: {
        total_resumes: 1,
        total_jobs: 1,
        total_improvements: 0,
        has_active_resume: true,
      },
    });
  });

  await page.route(/\/api\/v1\/config\/generation-defaults(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      include_cover_letter: true,
      include_outreach_message: true,
      prompt_id: "keywords",
    });
  });

  await page.route(/\/api\/v1\/resumes\?resume_id=[^&]+(?:&.*)?$/, async (route) => {
    await fulfillJson(route, {
      request_id: "req-builder-tabs",
      data: {
        resume_id: resumeId,
        raw_resume: {
          id: null,
          content: "{}",
          content_type: "json",
          created_at: "2026-04-01T00:00:00Z",
          processing_status: "ready",
        },
        processed_resume: {
          personalInfo: {
            name: "Jane Doe",
            title: "Engineer",
            email: "jane@example.com",
            phone: "555-0100",
            location: "San Francisco, CA",
          },
          summary: "Summary",
          workExperience: [],
          education: [],
          personalProjects: [],
          additional: {
            technicalSkills: [],
            languages: [],
            certificationsTraining: [],
            awards: [],
          },
        },
        cover_letter: null,
        outreach_message: null,
        parent_id: null,
        title: "Jane Doe Resume",
        application_pack_id: null,
        theme_settings: {
          theme_id: "engineeringresumes",
          page_size: "LETTER",
          density_profile: "compact",
          bold_keywords: false,
          accent_color: "blue",
          show_contact_icons: true,
          margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
        },
      },
    });
  });

  await page.route("**/api/v1/resumes/draft/render-preview", async (route) => {
    await fulfillJson(route, {
      resume_id: resumeId,
      theme_settings: {
        theme_id: "engineeringresumes",
        page_size: "LETTER",
        density_profile: "compact",
        bold_keywords: false,
        accent_color: "blue",
        show_contact_icons: true,
        margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
        design: { theme: "engineeringresumes" },
        theme_profiles: {},
        locale: { language: "english" },
        settings: { current_date: "today" },
      },
      artifacts: [],
      preview_artifacts: [],
      pdf_artifact: null,
    });
  });

  await page.route(
    new RegExp(`/api/v1/resumes/${resumeId}/render-preview(?:\\?.*)?$`),
    async (route) => {
      await fulfillJson(route, {
        resume_id: resumeId,
        theme_settings: {
          theme_id: "engineeringresumes",
          page_size: "LETTER",
          density_profile: "compact",
          bold_keywords: false,
          accent_color: "blue",
          show_contact_icons: true,
          margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
          design: { theme: "engineeringresumes" },
          theme_profiles: {},
          locale: { language: "english" },
          settings: { current_date: "today" },
        },
        artifacts: [],
        preview_artifacts: [],
        pdf_artifact: null,
      });
    }
  );

  await page.route("**/api/v1/resumes/draft/normalize", async (route) => {
    await fulfillJson(route, {
      request_id: "req-builder-draft-normalize",
      data: {
        resume_id: resumeId,
        raw_resume: {
          id: null,
          content: "{}",
          content_type: "json",
          created_at: "2026-04-01T00:00:00Z",
          processing_status: "ready",
        },
        processed_resume: {
          personalInfo: {
            name: "Jane Doe",
            title: "Engineer",
            email: "jane@example.com",
            phone: "555-0100",
            location: "San Francisco, CA",
          },
          summary: "Summary",
          workExperience: [],
          education: [],
          personalProjects: [],
          additional: {
            technicalSkills: [],
            languages: [],
            certificationsTraining: [],
            awards: [],
          },
        },
        cover_letter: null,
        outreach_message: null,
        parent_id: null,
        title: "Jane Doe Resume",
        application_pack_id: null,
        theme_settings: {
          theme_id: "engineeringresumes",
          page_size: "LETTER",
          density_profile: "compact",
          bold_keywords: false,
          accent_color: "blue",
          show_contact_icons: true,
          margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
          design: { theme: "engineeringresumes" },
          theme_profiles: {},
          locale: { language: "english" },
          settings: { current_date: "today" },
        },
      },
      yaml_sections: {
        cv: "cv:\n  name: Jane Doe\n",
        design: "design:\n  theme: engineeringresumes\n",
        locale: "locale:\n  language: english\n",
        settings: "settings:\n  current_date: today\n",
      },
    });
  });

  await page.route(`**/api/v1/resumes/${resumeId}/draft`, async (route) => {
    await fulfillJson(route, {
      request_id: "req-builder-draft-save",
      data: {
        resume_id: resumeId,
        raw_resume: {
          id: null,
          content: "{}",
          content_type: "json",
          created_at: "2026-04-01T00:00:00Z",
          processing_status: "ready",
        },
        processed_resume: {
          personalInfo: {
            name: "Jane Doe",
            title: "Engineer",
            email: "jane@example.com",
            phone: "555-0100",
            location: "San Francisco, CA",
          },
          summary: "Summary",
          workExperience: [],
          education: [],
          personalProjects: [],
          additional: {
            technicalSkills: [],
            languages: [],
            certificationsTraining: [],
            awards: [],
          },
        },
        cover_letter: null,
        outreach_message: null,
        parent_id: null,
        title: "Jane Doe Resume",
        application_pack_id: null,
        theme_settings: {
          theme_id: "engineeringresumes",
          page_size: "LETTER",
          density_profile: "compact",
          bold_keywords: false,
          accent_color: "blue",
          show_contact_icons: true,
          margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
          design: { theme: "engineeringresumes" },
          theme_profiles: {},
          locale: { language: "english" },
          settings: { current_date: "today" },
        },
      },
      yaml_sections: {
        cv: "cv:\n  name: Jane Doe\n",
        design: "design:\n  theme: engineeringresumes\n",
        locale: "locale:\n  language: english\n",
        settings: "settings:\n  current_date: today\n",
      },
    });
  });
}

test("builder shows RenderCV CV/Design/Locale/Settings tabs", async ({
  page,
}) => {
  await mockBuilderRoutes(page);
  const resumeId = "3ed603c4-82a1-43a9-a64d-4b22df2bd7b6";

  await page.goto(`${frontendBaseUrl}/builder?id=${resumeId}`);
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("button", { name: "Show split view" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show preview only" }),
  ).toBeVisible();
  await expect(page.getByRole("switch", { name: "Raw YAML" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Locale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();

  await page.getByRole("switch", { name: "Raw YAML" }).click();
  await expect(
    page.getByRole("button", { name: "Copy Full YAML" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Design" }).click();
  await expect(page.getByLabel("Design raw YAML editor")).toBeVisible();

  await page.getByRole("switch", { name: "Raw YAML" }).click();
  await expect(page.getByText("RenderCV Design")).toBeVisible();
  await expect(page.getByRole("button", { name: "Core" })).toBeVisible();
  await expect(page.getByText("Theme Profile")).toHaveCount(0);

  await page.getByRole("button", { name: "Show preview only" }).click();
  await expect(page.getByRole("switch", { name: "Raw YAML" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Refresh preview" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Show editor only" }).click();
  await expect(page.getByRole("switch", { name: "Raw YAML" })).toBeVisible();
});

test("builder undo restores the previous raw yaml draft", async ({ page }) => {
  await mockBuilderRoutes(page);

  await page.goto(`${frontendBaseUrl}/builder?id=${resumeId}`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("switch", { name: "Raw YAML" }).click();

  const editor = page.getByLabel("CV raw YAML editor");
  await expect(editor).toHaveValue("cv:\n  name: Jane Doe\n");

  await editor.fill("cv:\n  name: Jane Doe\n  headline: Updated Engineer\n");
  await expect(editor).toHaveValue(
    "cv:\n  name: Jane Doe\n  headline: Updated Engineer\n",
  );

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(editor).toHaveValue("cv:\n  name: Jane Doe\n");

  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect(editor).toHaveValue(
    "cv:\n  name: Jane Doe\n  headline: Updated Engineer\n",
  );
});
