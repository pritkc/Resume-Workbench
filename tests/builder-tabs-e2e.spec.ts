import { expect, test } from '@playwright/test';
import { fulfillJson, frontendBaseUrl } from './playwright-fixtures';

test('builder shows RenderCV CV/Design/Locale/Settings tabs', async ({ page }) => {
  const resumeId = '3ed603c4-82a1-43a9-a64d-4b22df2bd7b6';

  await page.route(/\/api\/v1\/resumes\?resume_id=.*$/, async (route) => {
    await fulfillJson(route, {
      request_id: 'req-builder-tabs',
      data: {
        resume_id: resumeId,
        raw_resume: {
          id: null,
          content: '{}',
          content_type: 'json',
          created_at: '2026-04-01T00:00:00Z',
          processing_status: 'ready',
        },
        processed_resume: {
          personalInfo: {
            name: 'Jane Doe',
            title: 'Engineer',
            email: 'jane@example.com',
            phone: '555-0100',
            location: 'San Francisco, CA',
          },
          summary: 'Summary',
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
        title: 'Jane Doe Resume',
        application_pack_id: null,
        theme_settings: {
          theme_id: 'engineeringresumes',
          page_size: 'LETTER',
          density_profile: 'compact',
          bold_keywords: false,
          accent_color: 'blue',
          show_contact_icons: true,
          margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
        },
      },
    });
  });

  await page.goto(`${frontendBaseUrl}/builder?id=${resumeId}`);
  await page.waitForLoadState('networkidle');

  await expect(page.getByText('RenderCV Editor Tabs')).toBeVisible();
  await expect(page.getByRole('button', { name: 'CV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Design' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Locale' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();

  await page.getByRole('button', { name: 'Design' }).click();
  await expect(page.getByText('RenderCV Design')).toBeVisible();
  await expect(page.getByText('Theme')).toBeVisible();
});
