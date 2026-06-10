import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  Database,
  FileDiff,
  FileText,
  Github,
  Layers3,
  LockKeyhole,
  Network,
  PanelTop,
  ScanSearch,
  Settings2,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';

const GITHUB_URL = 'https://github.com/pritkc/Resume-Workbench';
const DOCS_URL = `${GITHUB_URL}#documentation`;

const features = [
  {
    icon: FileText,
    title: 'Master resume workspace',
    description:
      'Keep one structured source of truth, edit it visually or as YAML, and preview the final document while you work.',
    image: '/showcase/builder.png',
    imageAlt: 'Resume Workbench editor with a fictional resume and live PDF preview',
    className: 'lg:col-span-2',
  },
  {
    icon: FileDiff,
    title: 'Explainable job tailoring',
    description:
      'Create role-specific versions with a reviewable change set instead of accepting an invisible rewrite.',
    image: '/showcase/tailoring.png',
    imageAlt: 'Resume tailoring preview using fictional job and candidate details',
    className: '',
  },
  {
    icon: Layers3,
    title: 'Application packs',
    description:
      'Keep the tailored resume, cover letter, outreach note, questions, and generated files connected to one application.',
    image: '/showcase/dashboard.png',
    imageAlt: 'Application dashboard populated with fictional resume records',
    className: '',
  },
  {
    icon: Settings2,
    title: 'Prompt and model control',
    description:
      'Choose a provider, tune generation modes, and inspect the exact instructions that shape each workflow.',
    image: '/showcase/prompt-catalog.png',
    imageAlt: 'Prompt catalog with safe example configuration',
    className: '',
  },
  {
    icon: ScanSearch,
    title: 'Generation observability',
    description:
      'Inspect model calls, timing, token usage, and output stages when quality or latency needs investigation.',
    image: '/showcase/traces.png',
    imageAlt: 'LLM trace viewer showing fictional generation data',
    className: 'lg:col-span-2',
  },
];

const stack = [
  { name: 'Next.js', detail: 'Web interface', icon: PanelTop },
  { name: 'FastAPI', detail: 'API and orchestration', icon: Braces },
  { name: 'PostgreSQL', detail: 'Structured storage', icon: Database },
  { name: 'RenderCV', detail: 'PDF rendering', icon: FileText },
  { name: 'LiteLLM', detail: 'Provider routing', icon: Network },
];

const privacyPoints = [
  'Runs on your machine or infrastructure',
  'Provider keys stay in local configuration',
  'No bundled analytics or tracking scripts',
];

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-3 font-semibold ${inverse ? 'text-white' : 'text-[#0b1736]'}`}
    >
      <Image src="/logo.svg" alt="" width={34} height={34} priority />
      <span className="text-base tracking-[-0.02em]">Resume Workbench</span>
    </Link>
  );
}

function ArrowLink({
  href,
  children,
  primary = false,
  external = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  external?: boolean;
}) {
  const className = primary
    ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#e9570a] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(233,87,10,0.18)] transition hover:-translate-y-0.5 hover:bg-[#cf4700] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9570a] focus-visible:ring-offset-2'
    : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#cbd5e1] bg-white px-5 py-2.5 text-sm font-semibold text-[#0b1736] transition hover:-translate-y-0.5 hover:border-[#94a3b8] hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b1736] focus-visible:ring-offset-2';

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function Hero() {
  return (
    <div className="min-h-screen bg-white font-sans text-[#0b1736]">
      <header className="sticky top-0 z-50 border-b border-[#e2e8f0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Brand />
          <nav
            className="hidden items-center gap-7 text-sm text-[#42506a] md:flex"
            aria-label="Main"
          >
            <a className="transition hover:text-[#0b1736]" href="#features">
              Features
            </a>
            <a className="transition hover:text-[#0b1736]" href="#architecture">
              Architecture
            </a>
            <a className="transition hover:text-[#0b1736]" href={DOCS_URL}>
              Documentation
            </a>
            <a
              className="transition hover:text-[#0b1736]"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#e9570a] px-4 text-sm font-semibold text-white transition hover:bg-[#cf4700]"
          >
            Open Workbench
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main>
        <section className="overflow-hidden border-b border-[#e2e8f0] bg-[radial-gradient(circle_at_80%_10%,#eff6ff_0,transparent_32%),linear-gradient(#fff,#fbfdff)]">
          <div className="mx-auto grid max-w-[90rem] gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:px-12 lg:pb-24 lg:pt-24">
            <div>
              <h1 className="max-w-[12ch] text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[#0b1736] sm:text-6xl lg:text-7xl">
                Build better applications without losing control.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#526079] sm:text-lg">
                Resume Workbench is a local-first workspace for building a master resume, tailoring
                it to real job descriptions, and exporting complete application packs with every
                AI-assisted change visible.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ArrowLink href="/dashboard" primary>
                  Open Workbench
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ArrowLink>
                <ArrowLink href={GITHUB_URL} external>
                  <Github className="h-4 w-4" aria-hidden />
                  View on GitHub
                </ArrowLink>
              </div>
              <div className="mt-10 grid gap-5 border-t border-[#dbe3ee] pt-7 sm:grid-cols-3">
                {[
                  ['Local-first', 'Your database and files stay in your environment.'],
                  ['Explainable', 'Review changes before creating a tailored copy.'],
                  ['Production-minded', 'Typed APIs, migrations, tests, and reproducible PDFs.'],
                ].map(([title, detail]) => (
                  <div key={title}>
                    <p className="text-sm font-semibold text-[#0b1736]">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#66758f]">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-8 -z-10 bg-[radial-gradient(circle,#dbeafe_0,transparent_68%)] opacity-70" />
              <div className="overflow-hidden rounded-xl border border-[#cbd5e1] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
                <div className="flex h-10 items-center justify-between border-b border-[#e2e8f0] bg-[#f8fafc] px-4">
                  <div className="flex items-center gap-1.5" aria-hidden>
                    <span className="h-2.5 w-2.5 rounded-full bg-[#fca5a5]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#fde68a]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#86efac]" />
                  </div>
                  <span className="font-mono text-[10px] text-[#64748b]">
                    resume-workbench.local
                  </span>
                  <span className="w-10" />
                </div>
                <Image
                  src="/showcase/builder.png"
                  alt="Resume Workbench with a fictional candidate resume open in the editor"
                  width={1440}
                  height={900}
                  unoptimized
                  priority
                  className="aspect-[16/10] w-full bg-[#f1f5f9] object-cover object-top"
                />
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-b border-[#e2e8f0] py-20 lg:py-28">
          <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
            <div className="max-w-3xl">
              <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                One workspace for the full application story.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#5d6c84]">
                Keep the source resume, job-specific decisions, supporting writing, generated files,
                and AI evidence connected instead of scattering them across tools.
              </p>
            </div>

            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className={`group overflow-hidden rounded-xl border border-[#dbe3ee] bg-[#fbfdff] ${feature.className}`}
                  >
                    <div className="p-6 sm:p-7">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#cbd5e1] bg-white text-[#1d4ed8]">
                        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                      </div>
                      <h3 className="mt-5 text-xl font-semibold tracking-[-0.025em]">
                        {feature.title}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#63718a]">
                        {feature.description}
                      </p>
                    </div>
                    <div className="mx-4 mb-4 overflow-hidden rounded-lg border border-[#dbe3ee] bg-white sm:mx-6 sm:mb-6">
                      <Image
                        src={feature.image}
                        alt={feature.imageAlt}
                        width={1440}
                        height={900}
                        unoptimized
                        loading="lazy"
                        className="aspect-[16/9] w-full object-cover object-top transition duration-500 group-hover:scale-[1.01]"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="architecture"
          className="scroll-mt-20 border-b border-[#e2e8f0] bg-[#f7faff] py-20 lg:py-24"
        >
          <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  Built from understandable parts.
                </h2>
                <p className="mt-3 max-w-2xl leading-7 text-[#5d6c84]">
                  A typed web app, a Python API, relational storage, deterministic document
                  rendering, and provider-flexible AI.
                </p>
              </div>
              <a
                href={`${GITHUB_URL}/tree/main/docs/agent/architecture`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#1d4ed8] hover:underline"
              >
                Read the architecture docs
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>

            <div className="mt-12 grid overflow-hidden rounded-xl border border-[#d6e0ec] bg-white sm:grid-cols-2 lg:grid-cols-5">
              {stack.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.name}
                    className={`relative p-6 ${index > 0 ? 'border-t border-[#e2e8f0] sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-t lg:border-t-0' : ''}`}
                  >
                    <Icon className="h-6 w-6 text-[#e9570a]" strokeWidth={1.7} aria-hidden />
                    <p className="mt-7 font-semibold">{item.name}</p>
                    <p className="mt-1 text-sm text-[#718096]">{item.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-[#e2e8f0] py-20 lg:py-28">
          <div className="mx-auto grid max-w-[90rem] gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-12">
            <div className="mx-auto flex aspect-square w-full max-w-sm items-center justify-center rounded-[2rem] bg-[linear-gradient(145deg,#eef4ff,#f8fafc)]">
              <div className="relative flex h-44 w-44 items-center justify-center rounded-[2rem] border border-[#b9c8dc] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                <LockKeyhole className="h-20 w-20 text-[#1d4ed8]" strokeWidth={1.35} aria-hidden />
                <span className="absolute -bottom-3 -right-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9570a] text-white shadow-lg">
                  <Check className="h-7 w-7" strokeWidth={2.2} aria-hidden />
                </span>
              </div>
            </div>
            <div>
              <h2 className="text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
                Your resume data stays in your environment.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#5d6c84]">
                Resume Workbench is designed for local or self-hosted use. It stores application
                data in your PostgreSQL database and only sends generation inputs to the AI provider
                you configure.
              </p>
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {privacyPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm text-[#42506a]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e8f0ff] text-[#1d4ed8]">
                      <Check className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <a
                href={`${GITHUB_URL}/blob/main/docs/PRIVACY.md`}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#1d4ed8] hover:underline"
              >
                Read the privacy model
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </section>

        <section className="bg-[#0b1736] py-20 text-white">
          <div className="mx-auto flex max-w-[90rem] flex-col items-start justify-between gap-9 px-5 sm:px-8 lg:flex-row lg:items-center lg:px-12">
            <div>
              <div className="flex items-center gap-3 text-[#fdba74]">
                <TerminalSquare className="h-6 w-6" aria-hidden />
                <span className="font-mono text-xs uppercase tracking-[0.16em]">Open source</span>
              </div>
              <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Inspect it, run it, and make the workflow yours.
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-[#b8c4d8]">
                The repository includes the application, migrations, automated tests, setup guide,
                architecture handbook, and full attribution to the projects it builds on.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ArrowLink href={GITHUB_URL} external>
                <Github className="h-4 w-4" aria-hidden />
                Explore the code
              </ArrowLink>
              <ArrowLink href={`${GITHUB_URL}/blob/main/SETUP.md`} external>
                <BookOpen className="h-4 w-4" aria-hidden />
                Setup guide
              </ArrowLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#08122b] text-[#aebbd0]">
        <div className="mx-auto grid max-w-[90rem] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr] lg:px-12">
          <div>
            <Brand inverse />
            <p className="mt-4 max-w-sm text-sm leading-6">
              A local-first resume and application workspace built for transparency, repeatable
              output, and ownership of your data.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Project</p>
            <div className="mt-4 grid gap-3 text-sm">
              <a href="#features" className="hover:text-white">
                Features
              </a>
              <a href="#architecture" className="hover:text-white">
                Architecture
              </a>
              <a href={DOCS_URL} className="hover:text-white">
                Documentation
              </a>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Community</p>
            <div className="mt-4 grid gap-3 text-sm">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-white">
                GitHub
              </a>
              <a
                href={`${GITHUB_URL}/issues`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                Issues
              </a>
              <a
                href={`${GITHUB_URL}/blob/main/.github/CONTRIBUTING.md`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                Contributing
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[90rem] flex-col gap-2 px-5 py-5 text-xs sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
            <span>Apache-2.0 licensed. Built on credited open-source foundations.</span>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[#fdba74]" aria-hidden />
              No personal data is included in showcase images.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
