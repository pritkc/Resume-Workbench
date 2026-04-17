import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  confirmedResult,
  fulfillJson,
  frontendBaseUrl,
  gotoWithRetry,
  installArtifactMocks,
  jobDescriptionResponse,
  masterResumeId,
  masterResumeResponse,
  pngArtifact,
  previewResult,
  statusPayload,
  tailoredResumeId,
  tailoredResumeResponse,
  themeSettings,
} from "./playwright-fixtures";

test.describe.configure({ timeout: 120_000 });

test("dashboard to tailor to tailored resume builder flow works with mocked AI seams", async ({
  page,
}) => {
  const browserProblems = await collectBrowserProblems(page);
  const uploadBodies: unknown[] = [];
  const previewBodies: Array<Record<string, unknown>> = [];
  const confirmBodies: Array<Record<string, unknown>> = [];
  const generationDefaultsUpdates: Array<Record<string, unknown>> = [];

  await installArtifactMocks(page);

  await page.route(/\/api\/v1\/status\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, statusPayload());
  });
  await page.route(/\/api\/v1\/config\/prompts\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      default_prompt_id: "keywords",
      prompt_options: [
        {
          id: "keywords",
          label: "Keyword enhance",
          description: "Tight ATS updates",
        },
        {
          id: "full",
          label: "Full tailor",
          description: "Rewrite for the role",
        },
      ],
    });
  });
  await page.route(/\/api\/v1\/config\/generation-defaults\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "PUT") {
      generationDefaultsUpdates.push(
        route.request().postDataJSON() as Record<string, unknown>,
      );
      await fulfillJson(route, route.request().postDataJSON());
      return;
    }

    await fulfillJson(route, {
      include_cover_letter: false,
      include_outreach_message: false,
      prompt_id: "keywords",
    });
  });
  await page.route(/\/api\/v1\/resumes\/list\?include_master=true(?:&.*)?$/, async (route) => {
    await fulfillJson(route, {
      data: [
        {
          resume_id: masterResumeId,
          filename: "master.pdf",
          is_active: true,
          parent_id: null,
          processing_status: "ready",
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
          title: "Master Resume",
        },
      ],
    });
  });
  await page.route(/\/api\/v1\/resumes\?resume_id=[^&]+(?:&.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const resumeId = url.searchParams.get("resume_id");
    if (resumeId === tailoredResumeId) {
      await fulfillJson(route, tailoredResumeResponse);
      return;
    }
    await fulfillJson(route, masterResumeResponse);
  });
  await page.route("**/api/v1/jobs/upload", async (route) => {
    uploadBodies.push(route.request().postDataJSON());
    await fulfillJson(route, { job_id: ["job-123"] });
  });
  await page.route("**/api/v1/application-packs/preview", async (route) => {
    previewBodies.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await fulfillJson(route, previewResult);
  });
  await page.route("**/api/v1/application-packs/confirm", async (route) => {
    confirmBodies.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await fulfillJson(route, confirmedResult);
  });
  await page.route(/\/api\/v1\/resumes\/tailored-123\/job-description(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, jobDescriptionResponse);
  });
  await page.route(/\/api\/v1\/application-packs\/questions(?:\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, { request_id: "req-questions-fetch", data: null });
      return;
    }
    if (method === "POST") {
      await fulfillJson(route, {
        request_id: "req-questions",
        data: {
          application_pack_id: "pack-123",
          generation_run_id: "run-q-123",
          run_kind: "application_pack_questions",
          answers: [],
          warnings: [],
          generated_at: "2026-04-05T12:00:00Z",
          is_stale: false,
          stale_reason: null,
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route(
    /\/api\/v1\/resumes\/tailored-123\/render-preview(\?.*)?$/,
    async (route) => {
      await fulfillJson(route, {
        resume_id: tailoredResumeId,
        theme_settings: themeSettings,
        artifacts: [pngArtifact],
        preview_artifacts: [pngArtifact],
        pdf_artifact: null,
      });
    },
  );

  await page.addInitScript((resumeId: string) => {
    window.localStorage.setItem("active_resume_id", resumeId);
  }, masterResumeId);

  await gotoWithRetry(page, `${frontendBaseUrl}/dashboard`);
  await page.waitForLoadState("networkidle");
  const createResumeCard = page.getByRole("button", { name: /create resume/i });
  await expect(createResumeCard).toBeEnabled();
  await gotoWithRetry(page, `${frontendBaseUrl}/tailor`);

  await page.locator("textarea").fill(jobDescriptionResponse.content);
  await page.getByRole("button", { name: /generate tailored resume/i }).click();

  await expect(
    page.getByRole("button", { name: /^confirm & save$/i }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^confirm & save$/i }).click();
  await expect(page).toHaveURL(
    new RegExp(`/builder\\?id=${tailoredResumeId}$`),
  );
  await expect(page.getByText("RenderCV Preview")).toBeVisible();
  await expect(page.getByAltText("preview.png")).toBeVisible();

  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/FastAPI Tailored Resume/i)).toBeVisible();
  await page.getByRole("button", { name: "COVER LETTER", exact: true }).click();
  await expect(
    page.getByText(/tailored cover letter for the platform team/i).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /outreach mail/i }).click();
  await expect(
    page.getByText(/i am excited about this backend role/i).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "JD MATCH", exact: true }).click();
  await expect(page.getByText(/about jd match/i)).toBeVisible();

  await page.getByRole("button", { name: /back to dashboard/i }).click();
  await expect(page).toHaveURL(new RegExp("/dashboard$"));

  expect(uploadBodies).toEqual([
    {
      job_descriptions: [jobDescriptionResponse.content],
      resume_id: masterResumeId,
    },
  ]);
  expect(previewBodies[0]).toMatchObject({
    resume_id: masterResumeId,
    job_id: "job-123",
    prompt_id: "keywords",
    include_cover_letter: false,
    include_outreach_message: false,
  });
  expect(confirmBodies[0]).toMatchObject({
    resume_id: masterResumeId,
    job_id: "job-123",
    application_pack_id: "pack-123",
    generation_run_id: "run-123",
    include_cover_letter: false,
    include_outreach_message: false,
  });
  expect(generationDefaultsUpdates).toEqual([{ prompt_id: "keywords" }]);

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});
