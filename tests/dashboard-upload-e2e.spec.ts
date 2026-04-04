import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  collectBrowserProblems,
  fulfillJson,
  frontendBaseUrl,
  statusPayload,
} from './playwright-fixtures';

test('dashboard upload sets the master resume and unlocks the main flow', async ({ page }) => {
  const browserProblems = await collectBrowserProblems(page);
  const uploadedResumeId = 'uploaded-master-123';
  const sampleResumePath = path.join(process.cwd(), 'tests', 'Prit-Chakalasiya-DE.pdf');

  await page.route('**/api/v1/status', async (route) => {
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
      })
    );
  });
  await page.route('**/api/v1/resumes/list?include_master=true', async (route) => {
    await fulfillJson(route, { data: [] });
  });
  await page.route('**/api/v1/resumes/upload', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        resume_id: uploadedResumeId,
        processing_status: 'ready',
        is_master: true,
      }),
    });
  });
  await page.route(/\/api\/v1\/resumes\?resume_id=uploaded-master-123$/, async (route) => {
    await fulfillJson(route, {
      request_id: 'req-uploaded',
      data: {
        resume_id: uploadedResumeId,
        raw_resume: {
          id: null,
          content: '{}',
          content_type: 'json',
          created_at: '2026-04-01T00:00:00Z',
          processing_status: 'ready',
        },
        processed_resume: {
          personalInfo: {
            name: 'Uploaded Resume',
            title: 'Engineer',
            email: 'uploaded@example.com',
            phone: '555-0100',
            location: 'San Francisco, CA',
          },
          summary: 'Uploaded summary',
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
        title: 'Uploaded Resume',
        application_pack_id: null,
        theme_settings: null,
      },
    });
  });

  await page.goto(`${frontendBaseUrl}/dashboard`);
  await expect(page.getByText(/initialize master resume/i)).toBeVisible();
  await page
    .locator('[class*="cursor-pointer"]')
    .filter({ hasText: /initialize master resume/i })
    .first()
    .click();

  await expect(page.getByRole('heading', { name: /upload resume/i })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(sampleResumePath);

  await expect.poll(async () => {
    return page.evaluate(() => window.localStorage.getItem('master_resume_id'));
  }).toBe(uploadedResumeId);

  await expect(page.getByText(/master resume/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /create resume/i })).toBeVisible();

  expect(browserProblems).toEqual({
    consoleMessages: [],
    pageErrors: [],
    failedResponses: [],
  });
});
