/**
 * End-to-end seam test for Phase 3.7.5 prompt manager + application-pack tailor flow.
 *
 * The backend and LLM are fully mocked via Playwright routes. This verifies UI wiring,
 * request payloads, and that the tailored resume preview/builder reflect the mocked
 * preview/confirm responses — not real model quality.
 */
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

/** Synthetic JD for upload body assertions (extends the shared fixture string). */
const SYNTHETIC_JD = `${jobDescriptionResponse.content}

Additional context: PostgreSQL, observability, CI/CD, and LLM-assisted tooling.`;

const managerEntryMock = {
  step_name: "tailor_resume_full",
  label: "Tailor (full)",
  version: "1",
  file_path: "prompts/tailor_resume_full.py",
  pipeline: "full" as const,
  pipeline_order: 5,
  receives_from: ["extract_jd_intel"] as string[],
  feeds_into: ["critique_resume"] as string[],
  instructions: "Instructions body",
  instructions_is_override: false,
  instructions_default: "Instructions body",
  rules: "Per-step rules",
  rules_source: "resume_diff",
  rules_is_override: false,
  rules_default: "Per-step rules",
  data_template: "{}",
  variables: [] as { name: string; description: string }[],
  model: "openai/gpt-4",
  model_is_override: false,
  read_only: true,
};

test.describe.configure({ timeout: 180_000 });

test("prompt manager (critique, shared rules reset, model override) then full tailor flow with synthetic JD", async ({
  page,
}) => {
  const browserProblems = await collectBrowserProblems(page);

  const critiquePuts: boolean[] = [];
  let critiqueEnabled = true;

  const modelOverridePuts: Array<Record<string, unknown>> = [];
  let storedModelOverrides: Record<string, string | null> = {};

  const sharedRuleDeleteCalls: string[] = [];
  let catalogFetchCount = 0;

  const uploadBodies: unknown[] = [];
  const previewBodies: Array<Record<string, unknown>> = [];
  const confirmBodies: Array<Record<string, unknown>> = [];
  const generationDefaultsUpdates: Array<Record<string, unknown>> = [];

  await installArtifactMocks(page);

  await page.route(/\/api\/v1\/status\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, statusPayload());
  });

  await page.route(/\/api\/v1\/config\/language\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      content_language: "en",
      ui_language: "en",
      supported_languages: ["en"],
    });
  });

  await page.route(/\/api\/v1\/config\/llm-api-key\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      provider: "openai",
      model: "gpt-4",
      api_key: "",
      api_base: null,
      ai_route: "direct_api",
      cliproxy: {
        base_url: null,
        client_api_key: "",
        provider_filter: "codex",
        model_alias: "",
        quick_profiles: [],
      },
      cliproxy_route_enabled: false,
    });
  });

  await page.route(/\/api\/v1\/config\/critique\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { enabled: boolean };
      critiquePuts.push(body.enabled);
      critiqueEnabled = body.enabled;
      await fulfillJson(route, { enabled: critiqueEnabled });
      return;
    }
    await fulfillJson(route, { enabled: critiqueEnabled });
  });

  await page.route(/\/api\/v1\/config\/model-overrides\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        overrides: Record<string, string | null>;
      };
      modelOverridePuts.push(body.overrides);
      storedModelOverrides = { ...body.overrides };
      await fulfillJson(route, { overrides: storedModelOverrides });
      return;
    }
    await fulfillJson(route, { overrides: storedModelOverrides });
  });

  await page.route(/\/api\/v1\/config\/prompts\/catalog\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    catalogFetchCount += 1;
    const firstLoad = catalogFetchCount === 1;
    await fulfillJson(route, {
      prompts: [],
      entries: [managerEntryMock],
      shared_rules: [
        {
          name: "resume_diff",
          label: "Resume diff",
          rules: firstLoad ? "OVERRIDDEN_SHARED_RULES" : "DEFAULT_SHARED_RULES",
          rules_is_override: firstLoad,
          rules_default: "DEFAULT_SHARED_RULES",
          used_by: ["tailor_resume_full"],
        },
      ],
    });
  });

  await page.route(/\/api\/v1\/config\/shared-rules\/[^/?]+$/, async (route) => {
    const url = route.request().url();
    const name = decodeURIComponent(url.split("/").pop() ?? "");
    if (route.request().method() === "DELETE") {
      sharedRuleDeleteCalls.push(name);
      await fulfillJson(route, {
        success: true,
        rules_name: name,
        affected_steps: ["tailor_resume_full"],
      });
      return;
    }
    await route.continue();
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

  // Dashboard first: warms status cache + resume list (matches real usage; avoids tailor stuck on LLM gate).
  await gotoWithRetry(page, `${frontendBaseUrl}/dashboard`);
  await page.waitForLoadState("networkidle");

  // --- Prompt catalog: critique toggle, shared rules reset, model override ---
  await gotoWithRetry(page, `${frontendBaseUrl}/settings/prompt-catalog`);
  await expect(
    page.getByRole("heading", { name: "LLM Prompt Catalog", exact: true }),
  ).toBeVisible();

  await expect(page.getByText("OVERRIDDEN_SHARED_RULES")).toBeVisible();
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect.poll(() => sharedRuleDeleteCalls).toEqual(["resume_diff"]);
  await expect(page.getByText("DEFAULT_SHARED_RULES")).toBeVisible();
  expect(catalogFetchCount).toBeGreaterThanOrEqual(2);

  const critiqueToggle = page.locator("#critique-toggle");
  await expect(critiqueToggle).toBeChecked();
  await critiqueToggle.click();
  await expect(critiqueToggle).not.toBeChecked();
  await critiqueToggle.click();
  await expect(critiqueToggle).toBeChecked();
  expect(critiquePuts).toEqual([false, true]);

  await page.getByRole("button", { name: "Change model" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#model-override").fill("openai/gpt-pipeline-test");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(modelOverridePuts.length).toBe(1);
  expect(modelOverridePuts[0]).toMatchObject({
    tailor_resume_full: "openai/gpt-pipeline-test",
  });

  // --- Tailor flow with synthetic JD (dashboard first matches user flow + status/master seams) ---
  await gotoWithRetry(page, `${frontendBaseUrl}/dashboard`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: /create resume/i }),
  ).toBeEnabled();
  await gotoWithRetry(page, `${frontendBaseUrl}/tailor`);
  await page.locator("textarea").fill(SYNTHETIC_JD);
  await expect(
    page.getByRole("button", { name: /generate tailored resume/i }),
  ).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: /generate tailored resume/i }).click();

  await expect(
    page.getByRole("button", { name: /^confirm & save$/i }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^confirm & save$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/builder\\?id=${tailoredResumeId}$`));
  await expect(page.getByText("RenderCV Preview")).toBeVisible();

  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/FastAPI Tailored Resume/i)).toBeVisible();

  expect(uploadBodies).toEqual([
    {
      job_descriptions: [SYNTHETIC_JD],
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
