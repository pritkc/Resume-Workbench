import { expect, test } from '@playwright/test';

const frontendBaseUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3000';
const backendBaseUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:8000';

type ResumeListItem = {
  resume_id: string;
  is_master: boolean;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
};

test.describe('resume viewer journey', () => {
  test('loads preview and navigates between viewer, builder, and dashboard', async ({
    page,
    request,
  }) => {
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleMessages.push(`[${message.type()}] ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('response', async (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const resumesResponse = await request.get(
      `${backendBaseUrl}/api/v1/resumes/list?include_master=true`
    );
    expect(resumesResponse.ok()).toBeTruthy();
    const resumesPayload = (await resumesResponse.json()) as { data: ResumeListItem[] };
    const readyResumes = resumesPayload.data.filter((resume) => resume.processing_status === 'ready');
    expect(readyResumes.length).toBeGreaterThan(0);

    const masterResume = readyResumes.find((resume) => resume.is_master) ?? readyResumes[0];
    const resumeId = masterResume.resume_id;

    await page.addInitScript((storedResumeId: string) => {
      window.localStorage.setItem('master_resume_id', storedResumeId);
    }, masterResume.resume_id);

    await page.goto(`${frontendBaseUrl}/resumes/${resumeId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('RenderCV Preview')).toBeVisible();
    await expect(page.locator('img').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(new RegExp('/dashboard$'));
    await expect(page.getByText(/master resume/i)).toBeVisible();

    await page.getByText(/master resume/i).click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${resumeId}$`));

    await page.getByRole('button', { name: /edit resume/i }).click();
    await expect(page).toHaveURL(new RegExp(`/builder\\?id=${resumeId}$`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /resume builder/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /editor panel/i })).toBeVisible();

    await page.getByRole('button', { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(new RegExp('/dashboard$'));
    await expect(page.getByText(/create resume/i)).toBeVisible();

    expect(
      {
        consoleMessages,
        pageErrors,
        failedResponses,
      },
      `browser issues detected\nconsole=${consoleMessages.join('\n')}\npageErrors=${pageErrors.join('\n')}\nfailedResponses=${failedResponses.join('\n')}`
    ).toEqual({
      consoleMessages: [],
      pageErrors: [],
      failedResponses: [],
    });
  });
});
