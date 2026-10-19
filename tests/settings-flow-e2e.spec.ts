import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  fulfillJson,
  frontendBaseUrl,
  gotoWithRetry,
  statusPayload,
} from "./playwright-fixtures";

test("settings saves config, tests connection, and updates prompt defaults", async ({
  page,
}) => {
  const browserProblems = await collectBrowserProblems(page);
  const savedConfigs: Array<Record<string, unknown>> = [];
  const testedConfigs: Array<Record<string, unknown>> = [];
  const promptUpdates: Array<Record<string, unknown>> = [];

  await page.route(/\/api\/v1\/status(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, statusPayload());
  });
  await page.route(/\/api\/v1\/resumes\/list\?include_active=true(?:&.*)?$/, async (route) => {
    await fulfillJson(route, { data: [] });
  });
  await page.route(/\/api\/v1\/config\/llm-api-key\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      savedConfigs.push(payload);
      await fulfillJson(route, {
        provider: payload.provider,
        model: payload.model,
        api_key: "********",
        api_base: payload.api_base ?? null,
      });
      return;
    }

    await fulfillJson(route, {
      provider: "openai",
      model: "gpt-5-nano-2025-08-07",
      api_key: "",
      api_base: null,
    });
  });
  await page.route(/\/api\/v1\/config\/llm-test\/?(?:\?.*)?$/, async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    testedConfigs.push(payload);
    await fulfillJson(route, {
      healthy: true,
      provider: payload.provider,
      model: payload.model,
      response_model: payload.model,
      test_prompt: "ping",
      model_output: "pong",
    });
  });
  await page.route(/\/api\/v1\/config\/prompts\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      promptUpdates.push(payload);
      await fulfillJson(route, {
        default_prompt_id: payload.default_prompt_id,
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
      return;
    }

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
  await page.route(/\/api\/v1\/config\/language\/?(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      content_language: "en",
      ui_language: "en",
    });
  });

  await gotoWithRetry(page, `${frontendBaseUrl}/settings`);
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  const llmSection = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: /llm configuration/i }),
    })
    .first();
  await expect(llmSection).toBeVisible();

  const modelInput = llmSection.locator("#model");
  const apiKeyInput = llmSection.locator("#apiKey");
  await expect(modelInput).toHaveValue("gpt-5-nano-2025-08-07", {
    timeout: 15_000,
  });
  await modelInput.fill("gpt-5-mini-custom");
  await apiKeyInput.fill("sk-test-123");
  await expect(modelInput).toHaveValue("gpt-5-mini-custom");
  await expect(apiKeyInput).toHaveValue("sk-test-123");

  await llmSection.getByRole("button", { name: /test connection/i }).click();
  await expect.poll(() => testedConfigs.length).toBe(1);

  await llmSection.getByRole("button", { name: /^save$/i }).click();
  await expect.poll(() => savedConfigs.length).toBe(1);
  await expect(page.getByRole("switch", { name: /cover letter/i })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("switch", { name: /cold outreach message/i }),
  ).toHaveCount(0);

  const promptDropdown = page
    .getByRole("button", { name: /keyword enhance/i })
    .first();
  await promptDropdown.click();
  await page.getByRole("button", { name: /full tailor/i }).click();

  await expect.poll(() => promptUpdates.length).toBe(1);

  expect(testedConfigs[0]).toMatchObject({
    provider: "openai",
    model: "gpt-5-mini-custom",
    api_key: "sk-test-123",
  });
  expect(savedConfigs[0]).toMatchObject({
    provider: "openai",
    model: "gpt-5-mini-custom",
    api_key: "sk-test-123",
  });
  expect(promptUpdates[0]).toEqual({ default_prompt_id: "full" });

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});
