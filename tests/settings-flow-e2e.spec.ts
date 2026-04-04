import { expect, test } from '@playwright/test';
import {
  collectBrowserProblems,
  fulfillJson,
  frontendBaseUrl,
  gotoWithRetry,
  statusPayload,
} from './playwright-fixtures';

test('settings saves config, tests connection, updates prompt, and toggles features', async ({
  page,
}) => {
  const browserProblems = await collectBrowserProblems(page);
  const savedConfigs: Array<Record<string, unknown>> = [];
  const testedConfigs: Array<Record<string, unknown>> = [];
  const featureUpdates: Array<Record<string, unknown>> = [];
  const promptUpdates: Array<Record<string, unknown>> = [];

  let featureState = {
    enable_cover_letter: false,
    enable_outreach_message: false,
  };

  await page.route('**/api/v1/status', async (route) => {
    await fulfillJson(route, statusPayload());
  });
  await page.route('**/api/v1/resumes/list?include_master=true', async (route) => {
    await fulfillJson(route, { data: [] });
  });
  await page.route('**/api/v1/config/llm-api-key', async (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      savedConfigs.push(payload);
      await fulfillJson(route, {
        provider: payload.provider,
        model: payload.model,
        api_key: '********',
        api_base: payload.api_base ?? null,
      });
      return;
    }

    await fulfillJson(route, {
      provider: 'openai',
      model: 'gpt-5-nano-2025-08-07',
      api_key: '',
      api_base: null,
    });
  });
  await page.route('**/api/v1/config/llm-test', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    testedConfigs.push(payload);
    await fulfillJson(route, {
      healthy: true,
      provider: payload.provider,
      model: payload.model,
      response_model: payload.model,
      test_prompt: 'ping',
      model_output: 'pong',
    });
  });
  await page.route('**/api/v1/config/features', async (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      featureUpdates.push(payload);
      featureState = {
        ...featureState,
        ...payload,
      };
      await fulfillJson(route, featureState);
      return;
    }

    await fulfillJson(route, featureState);
  });
  await page.route('**/api/v1/config/prompts', async (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      promptUpdates.push(payload);
      await fulfillJson(route, {
        default_prompt_id: payload.default_prompt_id,
        prompt_options: [
          { id: 'keywords', label: 'Keyword enhance', description: 'Tight ATS updates' },
          { id: 'full', label: 'Full tailor', description: 'Rewrite for the role' },
        ],
      });
      return;
    }

    await fulfillJson(route, {
      default_prompt_id: 'keywords',
      prompt_options: [
        { id: 'keywords', label: 'Keyword enhance', description: 'Tight ATS updates' },
        { id: 'full', label: 'Full tailor', description: 'Rewrite for the role' },
      ],
    });
  });

  await gotoWithRetry(page, `${frontendBaseUrl}/dashboard`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: /settings/i })).toBeVisible();
  await gotoWithRetry(page, `${frontendBaseUrl}/settings`);
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  await expect(page.getByText(/llm configuration/i)).toBeVisible();

  await page.getByLabel(/model/i).fill('gpt-5-mini-custom');
  await page.getByLabel(/api key/i).fill('sk-test-123');
  await page.getByRole('button', { name: /test connection/i }).click();
  await expect(page.getByText(/connection successful/i)).toBeVisible();

  await page.getByRole('button', { name: /^save$/i }).click();
  await expect.poll(() => savedConfigs.length).toBe(1);

  const coverLetterSwitch = page.getByRole('switch', { name: /cover letter/i });
  const outreachSwitch = page.getByRole('switch', { name: /cold outreach message/i });
  await coverLetterSwitch.click();
  await outreachSwitch.click();

  const promptDropdown = page.getByRole('button', { name: /keyword enhance/i }).first();
  await promptDropdown.click();
  await page.getByRole('button', { name: /full tailor/i }).click();

  await expect.poll(() => featureUpdates.length).toBe(2);
  await expect.poll(() => promptUpdates.length).toBe(1);
  await expect(coverLetterSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(outreachSwitch).toHaveAttribute('aria-checked', 'true');

  expect(testedConfigs[0]).toMatchObject({
    provider: 'openai',
    model: 'gpt-5-mini-custom',
    api_key: 'sk-test-123',
  });
  expect(savedConfigs[0]).toMatchObject({
    provider: 'openai',
    model: 'gpt-5-mini-custom',
    api_key: 'sk-test-123',
  });
  expect(featureUpdates).toEqual([
    { enable_cover_letter: true },
    { enable_outreach_message: true },
  ]);
  expect(promptUpdates[0]).toEqual({ default_prompt_id: 'full' });

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});
