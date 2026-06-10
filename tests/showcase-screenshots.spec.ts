import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  fulfillJson,
  frontendBaseUrl,
  installArtifactMocks,
  jobDescriptionResponse,
  masterResumeId,
  masterResumeResponse,
  pngArtifact,
  previewResult,
  resumePreview,
  statusPayload,
  themeSettings,
} from "./playwright-fixtures";

const captureEnabled = process.env.CAPTURE_SHOWCASE === "1";
const outputDir = resolve(process.cwd(), "apps/frontend/public/showcase");
const docsImageDir = resolve(process.cwd(), "docs/images/showcase");

test.describe("public showcase screenshots", () => {
  test.skip(
    !captureEnabled,
    "Set CAPTURE_SHOWCASE=1 to regenerate public screenshots.",
  );
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeAll(() => {
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(docsImageDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.route("**/api/v1/**", (route) =>
      fulfillJson(
        route,
        {
          detail:
            "Blocked by showcase privacy guard: every screenshot API call must use fictional data.",
        },
        404,
      ),
    );
    await page.addInitScript(() => {
      window.localStorage.setItem("theme", "light");
      window.localStorage.setItem("active_resume_id", "master-123");
    });
  });

  test("dashboard", async ({ page }) => {
    await installDashboardMocks(page);
    await page.setViewportSize({ width: 1440, height: 520 });
    await page.goto(`${frontendBaseUrl}/dashboard`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Platform Engineer @ Northstar Labs"),
    ).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "dashboard.png") });
  });

  test("builder", async ({ page }) => {
    await installBuilderMocks(page);
    await page.goto(`${frontendBaseUrl}/builder?id=${masterResumeId}`);
    await page.waitForLoadState("networkidle");

    const splitView = page.getByRole("button", { name: "Show split view" });
    if (await splitView.isVisible()) {
      await splitView.click();
    }

    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "builder.png") });
  });

  test("tailoring review", async ({ page }) => {
    await installTailorMocks(page);
    await page.goto(`${frontendBaseUrl}/tailor`);
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("textbox", { name: "Paste the job description" })
      .fill(jobDescriptionResponse.content);
    await page
      .getByRole("button", { name: /generate tailored resume/i })
      .click();
    await expect(
      page.getByRole("button", { name: /^confirm & save$/i }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: resolve(outputDir, "tailoring.png") });
  });

  test("prompt catalog", async ({ page }) => {
    await installPromptCatalogMocks(page);
    await page.goto(`${frontendBaseUrl}/settings/prompt-catalog`);
    await expect(page.getByRole("heading", { name: "Prompts" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tailor resume" }),
    ).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "prompt-catalog.png") });
  });

  test("generation traces", async ({ page }) => {
    await installTraceMocks(page);
    await page.goto(`${frontendBaseUrl}/llm-traces?trace_id=trace-demo-2026`);
    await expect(page.getByText("tailor_resume_full").first()).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "traces.png") });
  });

  test("landing page", async ({ page }) => {
    await page.goto(frontendBaseUrl);
    await expect(
      page.getByRole("heading", {
        name: "Turn one trusted resume into a complete, reviewable application.",
      }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(docsImageDir, "landing.png"),
      fullPage: true,
    });
  });
});

async function installDashboardMocks(page: Page) {
  await page.route(/\/api\/v1\/status(?:\?.*)?$/, (route) =>
    fulfillJson(
      route,
      statusPayload({
        database_stats: {
          total_resumes: 4,
          total_jobs: 3,
          total_improvements: 3,
          has_active_resume: true,
        },
      }),
    ),
  );
  await page.route(
    /\/api\/v1\/resumes\/list\?include_active=true(?:&.*)?$/,
    (route) =>
      fulfillJson(route, {
        data: [
          {
            resume_id: masterResumeId,
            resume_code: "MASTER",
            filename: "avery-chen-master.pdf",
            is_active: true,
            is_pinned: true,
            parent_id: null,
            processing_status: "ready",
            created_at: "2026-05-01T09:00:00Z",
            updated_at: "2026-06-08T15:30:00Z",
            title: "Master Resume",
            target_company: null,
            target_role: null,
            target_location: null,
          },
          {
            resume_id: "tailored-northstar",
            resume_code: "NW4K2Q",
            filename: "northstar-platform.pdf",
            is_active: false,
            is_pinned: true,
            parent_id: masterResumeId,
            processing_status: "ready",
            created_at: "2026-06-08T10:00:00Z",
            updated_at: "2026-06-09T14:20:00Z",
            title: "Platform Engineer @ Northstar Labs",
            target_company: "Northstar Labs",
            target_role: "Platform Engineer",
            target_location: "Remote",
            llm_trace_id: "trace-northstar",
          },
          {
            resume_id: "tailored-atlas",
            resume_code: "AT7M3P",
            filename: "atlas-backend.pdf",
            is_active: false,
            is_pinned: false,
            parent_id: masterResumeId,
            processing_status: "ready",
            created_at: "2026-06-06T10:00:00Z",
            updated_at: "2026-06-07T16:45:00Z",
            title: "Senior Backend Engineer @ Atlas Systems",
            target_company: "Atlas Systems",
            target_role: "Senior Backend Engineer",
            target_location: "Austin, TX",
            llm_trace_id: "trace-atlas",
          },
          {
            resume_id: "tailored-lumen",
            resume_code: "LU8C5R",
            filename: "lumen-api.pdf",
            is_active: false,
            is_pinned: false,
            parent_id: masterResumeId,
            processing_status: "ready",
            created_at: "2026-06-03T10:00:00Z",
            updated_at: "2026-06-04T11:10:00Z",
            title: "API Engineer @ Lumen Cloud",
            target_company: "Lumen Cloud",
            target_role: "API Engineer",
            target_location: "Chicago, IL",
            llm_trace_id: "trace-lumen",
          },
        ],
        active_resume_id: masterResumeId,
      }),
  );
  await page.route(/\/api\/v1\/resumes\?resume_id=[^&]+(?:&.*)?$/, (route) =>
    fulfillJson(route, masterResumeResponse),
  );
}

async function installBuilderMocks(page: Page) {
  await installArtifactMocks(page);
  await page.route(/\/api\/v1\/status(?:\?.*)?$/, (route) =>
    fulfillJson(route, statusPayload()),
  );
  await page.route(
    /\/api\/v1\/config\/generation-defaults(?:\?.*)?$/,
    (route) =>
      fulfillJson(route, {
        include_cover_letter: false,
        include_outreach_message: false,
        prompt_id: "full",
      }),
  );
  await page.route(/\/api\/v1\/resumes\?resume_id=[^&]+(?:&.*)?$/, (route) =>
    fulfillJson(route, {
      ...masterResumeResponse,
      data: {
        ...masterResumeResponse.data,
        processed_resume: {
          ...resumePreview,
          personalInfo: {
            ...resumePreview.personalInfo,
            name: "Avery Chen",
            title: "Platform Engineer",
            email: "avery.chen@example.com",
            phone: "(555) 014-8820",
            location: "Chicago, IL",
            linkedin: "linkedin.com/in/averychen-demo",
            github: "github.com/averychen-demo",
          },
          summary:
            "Platform engineer building reliable APIs, internal developer tooling, and observable data systems.",
        },
        title: "Avery Chen - Master Resume",
      },
    }),
  );
  await page.route(
    /\/api\/v1\/resumes\/master-123\/render-preview(?:\?.*)?$/,
    (route) =>
      fulfillJson(route, {
        resume_id: masterResumeId,
        theme_settings: themeSettings,
        artifacts: [pngArtifact],
        preview_artifacts: [pngArtifact],
        pdf_artifact: null,
      }),
  );
  await page.route("**/api/v1/resumes/draft/render-preview", (route) =>
    fulfillJson(route, {
      resume_id: masterResumeId,
      theme_settings: themeSettings,
      artifacts: [pngArtifact],
      preview_artifacts: [pngArtifact],
      pdf_artifact: null,
    }),
  );
  await page.route("**/api/v1/resumes/draft/normalize", (route) =>
    fulfillJson(route, {
      ...masterResumeResponse,
      yaml_sections: {
        cv: "cv:\n  name: Avery Chen\n  headline: Platform Engineer\n",
        design: "design:\n  theme: moderncv\n",
        locale: "locale:\n  language: english\n",
        settings: "settings:\n  current_date: today\n",
        metadata: "metadata:\n  role: Platform Engineer\n",
      },
    }),
  );
  await page.route("**/api/v1/resumes/master-123/draft", (route) =>
    fulfillJson(route, {
      ...masterResumeResponse,
      yaml_sections: {
        cv: "cv:\n  name: Avery Chen\n",
        design: "design:\n  theme: moderncv\n",
        locale: "locale:\n  language: english\n",
        settings: "settings:\n  current_date: today\n",
        metadata: "metadata:\n  role: Platform Engineer\n",
      },
    }),
  );
}

async function installTailorMocks(page: Page) {
  await installArtifactMocks(page);
  await page.route(/\/api\/v1\/status\/?(?:\?.*)?$/, (route) =>
    fulfillJson(route, statusPayload()),
  );
  await page.route(/\/api\/v1\/config\/prompts\/?(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      default_prompt_id: "full",
      prompt_options: [
        {
          id: "full",
          label: "Full tailor",
          description: "Deep role alignment with a reviewable diff",
        },
        {
          id: "lite",
          label: "Lite tailor",
          description: "Focused wording and keyword updates",
        },
      ],
    }),
  );
  await page.route(
    /\/api\/v1\/config\/generation-defaults\/?(?:\?.*)?$/,
    (route) => {
      if (route.request().method() === "PUT") {
        return fulfillJson(route, route.request().postDataJSON());
      }
      return fulfillJson(route, {
        include_cover_letter: false,
        include_outreach_message: false,
        prompt_id: "full",
      });
    },
  );
  await page.route(
    /\/api\/v1\/resumes\/list\?include_active=true(?:&.*)?$/,
    (route) =>
      fulfillJson(route, {
        data: [
          {
            resume_id: masterResumeId,
            filename: "avery-chen-master.pdf",
            is_active: true,
            parent_id: null,
            processing_status: "ready",
            created_at: "2026-05-01T09:00:00Z",
            updated_at: "2026-06-08T15:30:00Z",
            title: "Avery Chen - Master Resume",
          },
        ],
        active_resume_id: masterResumeId,
      }),
  );
  await page.route(/\/api\/v1\/resumes\?resume_id=[^&]+(?:&.*)?$/, (route) =>
    fulfillJson(route, masterResumeResponse),
  );
  await page.route("**/api/v1/jobs/upload", (route) =>
    fulfillJson(route, { job_id: ["job-123"] }),
  );
  await page.route("**/api/v1/application-packs/preview/live", (route) =>
    fulfillJson(route, {
      request_id: "req-live-start",
      data: {
        live_run_id: "live-showcase",
        generation_run_id: "run-showcase",
        trace_id: "trace-showcase",
        status: "running",
      },
    }),
  );
  await page.route(
    "**/api/v1/application-packs/preview/live/live-showcase/events",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
        body: [
          "event: stage.completed",
          `data: ${JSON.stringify({
            event_id: "event-stage",
            sequence: 1,
            live_run_id: "live-showcase",
            generation_run_id: "run-showcase",
            trace_id: "trace-showcase",
            type: "stage.completed",
            at: "2026-06-09T14:20:10Z",
            data: { stage: "Tailoring resume" },
          })}`,
          "",
          "event: run.completed",
          `data: ${JSON.stringify({
            event_id: "event-complete",
            sequence: 2,
            live_run_id: "live-showcase",
            generation_run_id: "run-showcase",
            trace_id: "trace-showcase",
            type: "run.completed",
            at: "2026-06-09T14:20:18Z",
            data: { status: "completed" },
          })}`,
          "",
          "",
        ].join("\n"),
      }),
  );
  await page.route(
    "**/api/v1/application-packs/preview/live/live-showcase/result",
    (route) => fulfillJson(route, previewResult),
  );
  await page.route("**/api/v1/application-packs/preview", (route) =>
    fulfillJson(route, previewResult),
  );
}

async function installPromptCatalogMocks(page: Page) {
  await page.route(/\/api\/v1\/status(?:\?.*)?$/, (route) =>
    fulfillJson(route, statusPayload()),
  );
  await page.route(/\/api\/v1\/config\/llm-api-key\/?(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      provider: "openai",
      model: "example-production-model",
      api_key: "********",
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
    }),
  );
  await page.route(/\/api\/v1\/config\/model-overrides\/?(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      overrides: { tailor_resume_full: "example-reasoning-model" },
    }),
  );
  await page.route(
    /\/api\/v1\/config\/prompts\/catalog\/?(?:\?.*)?$/,
    (route) =>
      fulfillJson(route, {
        prompts: [],
        shared_rules: [
          {
            name: "resume_diff",
            label: "Resume truth and diff rules",
            rules:
              "Preserve verified facts. Never invent employers, tools, credentials, dates, or metrics. Return only reviewable changes.",
            rules_is_override: false,
            rules_default: "Preserve verified facts.",
            used_by: ["tailor_resume_full", "tailor_resume_lite"],
          },
        ],
        entries: [
          promptEntry("extract_jd_intel", "Understand the job", "full", 1),
          promptEntry("tailor_resume_full", "Tailor resume", "full", 2),
          promptEntry("critique_resume", "Quality review", "full", 3),
        ],
      }),
  );
  await page.route(
    /\/api\/v1\/config\/prompts\/catalog\/master-resume-preview\/?(?:\?.*)?$/,
    (route) =>
      fulfillJson(route, {
        serialized_original_resume:
          '{"name":"Avery Chen","title":"Platform Engineer","skills":["Python","FastAPI","PostgreSQL"]}',
        truncated: false,
      }),
  );
  await page.route(
    /\/api\/v1\/config\/prompts\/catalog\/response-contract-preview\/?(?:\?.*)?$/,
    (route) =>
      fulfillJson(route, {
        full: { serialized: '{"changes":[],"warnings":[]}', truncated: false },
        lite: { serialized: '{"changes":[]}', truncated: false },
      }),
  );
}

function promptEntry(
  stepName: string,
  label: string,
  pipeline: "full" | "lite",
  order: number,
) {
  return {
    step_name: stepName,
    label,
    version: "2026.06",
    file_path: `apps/backend/app/prompts/${stepName}.py`,
    system_prompt_files: [
      `apps/backend/app/prompts/text/${stepName}/system.txt`,
    ],
    user_prompt_file: `apps/backend/app/prompts/text/${stepName}/user.txt`,
    pipeline,
    pipeline_order: order,
    receives_from: [],
    feeds_into: [],
    instructions:
      "Use only supplied evidence. Improve relevance, clarity, and recruiter readability.",
    instructions_is_override: false,
    instructions_default: "Use only supplied evidence.",
    rules: "Preserve truth and return structured output.",
    rules_source: "resume_diff",
    rules_is_override: false,
    rules_default: "Preserve truth.",
    data_template: "Job: $job_description\nResume: $original_resume",
    variables: [
      { name: "job_description", description: "The target role" },
      { name: "original_resume", description: "The verified source resume" },
    ],
    model:
      stepName === "tailor_resume_full"
        ? "example-reasoning-model"
        : "default model",
    model_is_override: stepName === "tailor_resume_full",
    read_only: false,
    composer_override_active: false,
    system_shipped:
      "You are a precise resume editor. Preserve all verified facts.",
    user_template_shipped: "Job: $job_description\nResume: $original_resume",
    system_resolved:
      "You are a precise resume editor. Preserve all verified facts.",
    user_template_resolved: "Job: $job_description\nResume: $original_resume",
  };
}

async function installTraceMocks(page: Page) {
  await page.route(/\/api\/v1\/llm\/calls\/summary(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      request_id: "req-trace-summary",
      data: {
        trace_id: "trace-demo-2026",
        request_scope: "resumes.improve_preview",
        total_calls: 3,
        successful_calls: 3,
        failed_calls: 0,
        latency_total_ms: 18420,
        latency_avg_ms: 6140,
        llm_wall_clock_ms: 18420,
        first_call_at: "2026-06-09T14:20:00Z",
        last_call_at: "2026-06-09T14:20:18Z",
        input_tokens: 6420,
        output_tokens: 2520,
        total_tokens: 8940,
        estimated_cost_usd: 0.0472,
        usage_backed_calls: 3,
        estimated_calls: 0,
        operations: [
          operationSummary("extract_jd_intel", 1, 2240, 0.0081),
          operationSummary("tailor_resume_full", 1, 5210, 0.0314),
          operationSummary("critique_resume", 1, 1490, 0.0077),
        ],
      },
    }),
  );
  await page.route(/\/api\/v1\/llm\/calls\?(?:.*)$/, (route) =>
    fulfillJson(route, {
      request_id: "req-trace-calls",
      data: [
        traceCall("call-1", "extract_jd_intel", 4280, 2240, "stop"),
        traceCall("call-2", "tailor_resume_full", 9320, 5210, "stop"),
        traceCall("call-3", "critique_resume", 4820, 1490, "stop"),
      ],
    }),
  );
}

function operationSummary(
  operation: string,
  calls: number,
  totalTokens: number,
  cost: number,
) {
  return {
    operation,
    calls,
    successes: calls,
    failures: 0,
    latency_total_ms: 6000,
    latency_avg_ms: 6000,
    input_tokens: Math.round(totalTokens * 0.7),
    output_tokens: Math.round(totalTokens * 0.3),
    total_tokens: totalTokens,
    estimated_cost_usd: cost,
  };
}

function traceCall(
  id: string,
  operation: string,
  latencyMs: number,
  tokens: number,
  finishReason: string,
) {
  return {
    llm_call_id: id,
    call_group_id: `group-${id}`,
    trace_id: "trace-demo-2026",
    request_scope: "resumes.improve_preview",
    operation,
    provider: "openai",
    model: "example-production-model",
    model_name: "example-production-model",
    response_model: null,
    request_kind: "chat",
    success: true,
    attempt: 1,
    max_tokens: 12000,
    temperature: 0.2,
    reasoning_effort: "medium",
    json_mode: true,
    latency_ms: latencyMs,
    finish_reason: finishReason,
    prompt_chars: 12600,
    prompt_tokens_est: Math.round(tokens * 0.7),
    response_chars: 4820,
    response_tokens_est: Math.round(tokens * 0.3),
    usage_input_tokens: Math.round(tokens * 0.7),
    usage_output_tokens: Math.round(tokens * 0.3),
    usage_total_tokens: tokens,
    estimated_input_cost_usd: 0.01,
    estimated_output_cost_usd: 0.008,
    estimated_total_cost_usd: 0.018,
    error_type: null,
    error_message: null,
    prompt_preview:
      "Tailor the verified resume to the supplied platform engineering role. Preserve facts and return structured changes.",
    response_preview:
      '{"changes":[{"field":"summary","reason":"Clarify platform and reliability scope"}]}',
    request_context: {
      resume_code: "NW4K2Q",
      resume_id: "tailored-northstar",
      generation_run_id: "run-demo-2026",
    },
    created_at: "2026-06-09T14:20:00Z",
    updated_at: "2026-06-09T14:20:18Z",
    completed_at: "2026-06-09T14:20:18Z",
  };
}
