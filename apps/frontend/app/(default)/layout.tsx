import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';
import { StatusCacheProvider } from '@/lib/context/status-cache';
import { LanguageProvider } from '@/lib/context/language-context';
import { LocalizedErrorBoundary } from '@/components/common/error-boundary';
import { AppBuildBadge } from '@/components/common/app-build-badge';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <StatusCacheProvider>
      <LanguageProvider>
        <ResumePreviewProvider>
          <LocalizedErrorBoundary>
            <main className="min-h-screen flex flex-col">{children}</main>
            <AppBuildBadge />
          </LocalizedErrorBoundary>
        </ResumePreviewProvider>
      </LanguageProvider>
    </StatusCacheProvider>
  );
}
