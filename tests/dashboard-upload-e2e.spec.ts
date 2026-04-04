import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  fulfillJson,
  frontendBaseUrl,
  gotoWithRetry,
  statusPayload,
} from "./playwright-fixtures";

test("dashboard upload sets the master resume and unlocks the main flow", async ({
  page,
}) => {
  const browserProblems = await collectBrowserProblems(page);
  const uploadedResumeId = "uploaded-master-123";

  await page.route("**/api/v1/status", async (route) => {
    await fulfillJson(
      route,
      statusPayload({
        has_master_resume: false,
        database_stats: {
          total_resumes: 0,
          total_jobs: 0,
          total_improvements: 0,
          has_master_resume: false,
        },
      }),
    );
  });
  await page.route(
    "**/api/v1/resumes/list?include_master=true",
    async (route) => {
      await fulfillJson(route, { data: [] });
    },
  );
  await page.route("**/api/v1/resumes/upload", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resume_id: uploadedResumeId,
        processing_status: "ready",
        is_master: true,
      }),
    });
  });
  await page.route(
    /\/api\/v1\/resumes\?resume_id=uploaded-master-123$/,
    async (route) => {
      await fulfillJson(route, {
        request_id: "req-uploaded",
        data: {
          resume_id: uploadedResumeId,
          raw_resume: {
            id: null,
            content: "{}",
            content_type: "json",
            created_at: "2026-04-01T00:00:00Z",
            processing_status: "ready",
          },
          processed_resume: {
            personalInfo: {
              name: "Uploaded Resume",
              title: "Engineer",
              email: "uploaded@example.com",
              phone: "555-0100",
              location: "San Francisco, CA",
            },
            summary: "Uploaded summary",
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
          title: "Uploaded Resume",
          application_pack_id: null,
          theme_settings: null,
        },
      });
    },
  );

  await page.goto(`${frontendBaseUrl}/dashboard`);
  await expect(page.getByText(/initialize master resume/i)).toBeVisible();
  await page.getByText(/initialize master resume/i).click();

  await expect(
    page.getByRole("heading", { name: /upload resume/i }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "sample-resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF",
    ),
  });

  await expect
    .poll(async () => {
      return page.evaluate(() =>
        window.localStorage.getItem("master_resume_id"),
      );
    })
    .toBe(uploadedResumeId);

  await expect(page.getByText(/master resume/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /create resume/i }),
  ).toBeVisible();

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});

test("dashboard filters and sorts tailored resumes in the row view", async ({
  page,
}) => {
  const browserProblems = await collectBrowserProblems(page);

  await page.route("**/api/v1/status", async (route) => {
    await fulfillJson(route, statusPayload());
  });
  await page.route(
    "**/api/v1/resumes/list?include_master=true",
    async (route) => {
      await fulfillJson(route, {
        data: [
          {
            resume_id: "master-123",
            filename: "master.pdf",
            is_master: true,
            parent_id: null,
            processing_status: "ready",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-01T00:00:00Z",
            title: "Master Resume",
            target_company: null,
            target_role: null,
            target_location: null,
          },
          {
            resume_id: "tailored-1",
            filename: "one.pdf",
            is_master: false,
            parent_id: "master-123",
            processing_status: "ready",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-03T00:00:00Z",
            title: "Backend Resume",
            target_company: "Acme",
            target_role: "Backend Engineer",
            target_location: "Remote",
          },
          {
            resume_id: "tailored-2",
            filename: "two.pdf",
            is_master: false,
            parent_id: "master-123",
            processing_status: "ready",
            created_at: "2026-04-02T00:00:00Z",
            updated_at: "2026-04-02T00:00:00Z",
            title: "Frontend Resume",
            target_company: "Beta",
            target_role: "Frontend Engineer",
            target_location: "San Francisco",
          },
        ],
      });
    },
  );
  await page.route(
    /\/api\/v1\/resumes\?resume_id=master-123$/,
    async (route) => {
      await fulfillJson(route, {
        request_id: "req-master",
        data: {
          resume_id: "master-123",
          raw_resume: {
            id: null,
            content: "{}",
            content_type: "json",
            created_at: "2026-04-01T00:00:00Z",
            processing_status: "ready",
          },
          processed_resume: {
            personalInfo: {
              name: "Master Resume",
              title: "Engineer",
              email: "master@example.com",
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
          title: "Master Resume",
          application_pack_id: null,
          theme_settings: null,
        },
      });
    },
  );

  await page.addInitScript(() => {
    window.localStorage.setItem("master_resume_id", "master-123");
  });

  await gotoWithRetry(page, `${frontendBaseUrl}/dashboard`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Backend Resume")).toBeVisible();
  await expect(page.getByText("Frontend Resume")).toBeVisible();

  await page
    .getByPlaceholder(/search title, role, or company/i)
    .fill("frontend");
  await expect(page.getByText("Frontend Resume")).toBeVisible();
  await expect(page.getByText("Backend Resume")).toHaveCount(0);

  await page.getByPlaceholder(/search title, role, or company/i).fill("");
  await page.locator("select").nth(0).selectOption("Acme");
  await expect(page.getByText("Backend Resume")).toBeVisible();
  await expect(page.getByText("Frontend Resume")).toHaveCount(0);

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});
