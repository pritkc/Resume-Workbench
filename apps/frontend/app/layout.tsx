import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme/theme-provider';
import './(default)/css/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Resume Workbench',
    template: '%s | Resume Workbench',
  },
  description:
    'A local-first workspace for building, tailoring, reviewing, and exporting complete job application packs.',
  applicationName: 'Resume Workbench',
  keywords: ['resume builder', 'resume tailoring', 'job application', 'local-first', 'RenderCV'],
  metadataBase: new URL('https://github.com/pritkc/Resume-Workbench'),
  openGraph: {
    title: 'Resume Workbench',
    description:
      'Build better job applications with structured resume editing, explainable AI changes, and reproducible PDF exports.',
    type: 'website',
  },
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className="h-full" suppressHydrationWarning>
      <body
        className="min-h-full bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
