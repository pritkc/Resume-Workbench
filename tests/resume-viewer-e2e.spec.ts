import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  fulfillJson,
  frontendBaseUrl,
  installArtifactMocks,
  masterResumeId,
  masterResumeResponse,
  pngArtifact,
  statusPayload,
  tailoredResumeId,
  tailoredResumeResponse,
  themeSettings,
} from "./playwright-fixtures";

test.describe("resume viewer journey", () => {
  test("loads preview and navigates between viewer, builder, and dashboard", async ({
    page,
  }) => {
    const browserProblems = await collectBrowserProblems(page);

    await installArtifactMocks(page);
    await page.route(/\/api\/v1\/status(?:\?.*)?$/, async (route) => {
      await fulfillJson(route, statusPayload());
    });
    await page.route(
      /\/api\/v1\/resumes\/list\?include_master=true(?:&.*)?$/,
      async (route) => {
        await fulfillJson(route, {
          data: [
            {
              resume_id: masterResumeId,
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
              resume_id: tailoredResumeId,
              filename: "tailored.pdf",
              is_master: false,
              parent_id: masterResumeId,
              processing_status: "ready",
              created_at: "2026-04-03T00:00:00Z",
              updated_at: "2026-04-03T00:00:00Z",
              title: "FastAPI Tailored Resume",
              target_company: "Example Cloud",
              target_role: "Platform Engineer",
              target_location: "Remote",
            },
          ],
        });
      }
    );
    await page.route(/\/api\/v1\/resumes\?resume_id=[^&]+(?:&.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      const resumeId = url.searchParams.get("resume_id");
      if (resumeId === tailoredResumeId) {
        await fulfillJson(route, tailoredResumeResponse);
        return;
      }
      await fulfillJson(route, masterResumeResponse);
    });
    await page.route(
      /\/api\/v1\/resumes\/[^/]+\/render-preview(?:\?.*)?$/,
      async (route) => {
        const url = route.request().url();
        const resumeId = /\/resumes\/([^/]+)\/render-preview/.exec(url)?.[1];
        await fulfillJson(route, {
          resume_id: resumeId ?? masterResumeId,
          theme_settings: themeSettings,
          artifacts: [pngArtifact],
          preview_artifacts: [pngArtifact],
          pdf_artifact: null,
        });
      }
    );

    await page.addInitScript((storedResumeId: string) => {
      window.localStorage.setItem("master_resume_id", storedResumeId);
    }, masterResumeId);

    await page.goto(`${frontendBaseUrl}/resumes/${masterResumeId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("RenderCV Preview")).toBeVisible();
    await expect(page.getByAltText("preview.png").first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/master resume/i)).toBeVisible();

    await page.getByText(/master resume/i).first().click();
    await expect(page).toHaveURL(new RegExp(`/resumes/${masterResumeId}$`));

    await page.getByRole("button", { name: /edit resume/i }).click();
    await expect(page).toHaveURL(new RegExp(`/builder\\?id=${masterResumeId}$`));
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("switch", { name: "Raw YAML" })).toBeVisible();
    await expect(page.getByText(/resume content/i)).toBeVisible();

    await page.getByRole("button", { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: /create resume/i })).toBeVisible();

    expect(browserProblems).toEqual({
      consoleMessages: [],
      pageErrors: [],
      failedResponses: [],
    });
  });
});
