import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  fulfillJson,
  frontendBaseUrl,
  gotoWithRetry,
  statusPayload,
} from "./playwright-fixtures";

const llmConfigMock = {
  provider: "openai" as const,
  model: "gpt-4",
  api_key: "",
  api_base: null,
  ai_route: "direct_api" as const,
  cliproxy: {
    base_url: null,
    client_api_key: "",
    provider_filter: "codex" as const,
    model_alias: "",
    quick_profiles: [],
  },
  cliproxy_route_enabled: false,
};

async function installPromptCatalogMocks(
  page: import("@playwright/test").Page,
  options: { trackDeletes?: boolean } = {},
) {
  const deleteCalls: string[] = [];
  let catalogFetches = 0;

  await page.route(/\/api\/v1\/status(?:\?.*)?$/, async (route) => {
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
    await fulfillJson(route, llmConfigMock);
  });

  await page.route(/\/api\/v1\/config\/critique\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, { enabled: true });
  });

  await page.route(/\/api\/v1\/config\/model-overrides\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, { overrides: {} });
  });

  await page.route(/\/api\/v1\/config\/prompts\/catalog\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    catalogFetches += 1;
    const withOverride = catalogFetches === 1;
    await fulfillJson(route, {
      prompts: [],
      entries: [],
      shared_rules: [
        {
          name: "resume_diff",
          label: "Resume diff",
          rules: withOverride ? "OVERRIDDEN_RULES_BODY" : "DEFAULT_RULES_BODY",
          rules_is_override: withOverride,
          rules_default: "DEFAULT_RULES_BODY",
          used_by: ["tailor_resume_full"],
        },
      ],
    });
  });

  await page.route(/\/api\/v1\/config\/shared-rules\/[^/?]+$/, async (route) => {
    const url = route.request().url();
    const name = decodeURIComponent(url.split("/").pop() ?? "");
    if (route.request().method() === "DELETE") {
      if (options.trackDeletes) {
        deleteCalls.push(name);
      }
      await fulfillJson(route, {
        success: true,
        rules_name: name,
        affected_steps: ["tailor_resume_full"],
      });
      return;
    }
    await route.continue();
  });

  return { deleteCalls };
}

test("prompt catalog page loads pipeline and shared rules", async ({ page }) => {
  const browserProblems = await collectBrowserProblems(page);
  await installPromptCatalogMocks(page);

  await gotoWithRetry(page, `${frontendBaseUrl}/settings/prompt-catalog`);
  await expect(
    page.getByRole("heading", { name: "Prompts", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared resume-diff rules", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resume diff" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Resume diff" })).toHaveValue("OVERRIDDEN_RULES_BODY");

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});

test("reset shared rules calls DELETE and refreshes catalog", async ({ page }) => {
  const browserProblems = await collectBrowserProblems(page);
  const { deleteCalls } = await installPromptCatalogMocks(page, { trackDeletes: true });

  await gotoWithRetry(page, `${frontendBaseUrl}/settings/prompt-catalog`);
  await expect(page.getByRole("button", { name: "Reset to shipped" })).toBeVisible();

  await page.getByRole("button", { name: "Reset to shipped" }).click();

  await expect.poll(() => deleteCalls.length).toBe(1);
  expect(deleteCalls[0]).toBe("resume_diff");
  await expect(page.getByRole("button", { name: "Reset to shipped" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Resume diff" })).toHaveValue("DEFAULT_RULES_BODY");

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});
