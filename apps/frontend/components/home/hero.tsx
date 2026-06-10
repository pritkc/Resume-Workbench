'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleCheck,
  Code2,
  Database,
  Eye,
  FileCheck2,
  FileText,
  Github,
  GitPullRequestArrow,
  Layers3,
  LockKeyhole,
  Network,
  PanelTop,
  ScanSearch,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  WandSparkles,
} from 'lucide-react';

const GITHUB_URL = 'https://github.com/pritkc/Resume-Workbench';

const workflowSteps = [
  {
    number: '01',
    title: 'Keep one trusted source',
    body: 'Build and maintain a structured master resume instead of editing disconnected files.',
    icon: FileText,
  },
  {
    number: '02',
    title: 'Add the real job',
    body: 'Paste a job description and choose how deeply the workflow should tailor your resume.',
    icon: GitPullRequestArrow,
  },
  {
    number: '03',
    title: 'Review every change',
    body: 'Inspect the diff, warnings, preview, and model evidence before saving anything.',
    icon: Eye,
  },
  {
    number: '04',
    title: 'Ship one connected pack',
    body: 'Keep the resume, letter, outreach note, answers, and generated files together.',
    icon: Layers3,
  },
];

const architecture = [
  { name: 'Next.js', detail: 'Product interface', icon: PanelTop },
  { name: 'FastAPI', detail: 'Workflow API', icon: Server },
  { name: 'PostgreSQL', detail: 'Application data', icon: Database },
  { name: 'RenderCV', detail: 'Document output', icon: FileText },
  { name: 'AI provider', detail: 'Configured by you', icon: Network },
];

const packItems = [
  ['Tailored resume', 'PDF + editable source', FileCheck2],
  ['Cover letter', 'Job-specific draft', FileText],
  ['Outreach note', 'Short recruiter message', WandSparkles],
  ['Application answers', 'Saved with the job', CircleCheck],
];

const diffRows = [
  {
    section: 'Summary',
    before: 'Backend engineer building APIs and internal tools.',
    after: 'Platform engineer building reliable APIs and developer tooling.',
    reason: 'Matches the role language without adding a new claim.',
  },
  {
    section: 'Experience',
    before: 'Improved data pipeline monitoring.',
    after: 'Improved data pipeline observability and incident response.',
    reason: 'Clarifies the verified impact already present in the source.',
  },
  {
    section: 'Skills',
    before: 'Python, PostgreSQL, React',
    after: 'Python, FastAPI, PostgreSQL, React',
    reason: 'Surfaces a supported skill required by the job.',
  },
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

function ActionLink({
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
    ? 'inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#e9570a] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(233,87,10,0.2)] transition hover:-translate-y-0.5 hover:bg-[#cf4700] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9570a] focus-visible:ring-offset-2'
    : 'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#cbd5e1] bg-white px-6 py-3 text-sm font-semibold text-[#0b1736] transition hover:-translate-y-0.5 hover:border-[#94a3b8] hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b1736] focus-visible:ring-offset-2';

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

function DiffDemo() {
  const [selected, setSelected] = useState(0);
  const active = diffRows[selected];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7e0eb] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.1)]">
      <div className="flex flex-col gap-4 border-b border-[#dbe3ee] bg-[#f8fafc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748b]">
            Review changes
          </p>
          <p className="mt-1 text-sm font-semibold text-[#0b1736]">Platform Engineer · Northstar</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-[#166534]">
          <ShieldCheck className="h-4 w-4" aria-hidden />0 unsupported claims
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr]">
        <div className="border-b border-[#dbe3ee] bg-[#fbfdff] p-3 lg:border-b-0 lg:border-r">
          {diffRows.map((row, index) => (
            <button
              key={row.section}
              type="button"
              onClick={() => setSelected(index)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition ${
                selected === index
                  ? 'bg-[#0b1736] text-white'
                  : 'text-[#42506a] hover:bg-[#edf3fa] hover:text-[#0b1736]'
              }`}
            >
              <span>{row.section}</span>
              <span
                className={`font-mono text-[10px] ${
                  selected === index ? 'text-[#fdba74]' : 'text-[#94a3b8]'
                }`}
              >
                MODIFIED
              </span>
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-7">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[#fecaca] bg-[#fff8f7] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#b91c1c]">
                  Before
                </span>
                <span className="font-mono text-xs text-[#ef4444]">−</span>
              </div>
              <p className="text-sm leading-6 text-[#5f3440]">{active.before}</p>
            </div>
            <div className="rounded-xl border border-[#bbf7d0] bg-[#f5fff8] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#166534]">
                  Tailored
                </span>
                <span className="font-mono text-xs text-[#16a34a]">+</span>
              </div>
              <p className="text-sm leading-6 text-[#214c32]">{active.after}</p>
            </div>
          </div>
          <div className="mt-5 flex items-start gap-3 border-t border-[#e2e8f0] pt-5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#e9570a]" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                Why it changed
              </p>
              <p className="mt-1 text-sm leading-6 text-[#526079]">{active.reason}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#cbd5e1] bg-white px-4 text-xs font-semibold uppercase tracking-wide text-[#42506a] hover:bg-[#f8fafc]"
            >
              Reject change
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#16803b] px-4 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#126d32]"
            >
              <Check className="h-4 w-4" aria-hidden />
              Confirm & save
            </button>
          </div>
        </div>
      </div>
    </div>
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
            <a className="transition hover:text-[#0b1736]" href="#workflow">
              Workflow
            </a>
            <a className="transition hover:text-[#0b1736]" href="#review">
              Review
            </a>
            <a className="transition hover:text-[#0b1736]" href="#architecture">
              Architecture
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
        <section className="overflow-hidden border-b border-[#e2e8f0] bg-[radial-gradient(circle_at_82%_18%,#eaf2ff_0,transparent_31%),linear-gradient(#fff,#fbfdff)]">
          <div className="mx-auto grid max-w-[90rem] gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-12 lg:pb-24 lg:pt-24">
            <div>
              <h1 className="max-w-[11ch] text-5xl font-semibold leading-[0.97] tracking-[-0.06em] text-[#0b1736] sm:text-6xl lg:text-[4.7rem]">
                Turn one trusted resume into a complete, reviewable application.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#526079] sm:text-lg">
                Resume Workbench connects your master resume, the job, every AI-assisted decision,
                and every final document in one local-first workflow.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink href="/dashboard" primary>
                  Open Workbench
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink href={GITHUB_URL} external>
                  <Github className="h-4 w-4" aria-hidden />
                  View on GitHub
                </ActionLink>
              </div>
              <div className="mt-10 grid gap-3 border-t border-[#dbe3ee] pt-7 sm:grid-cols-3">
                {[
                  ['Source of truth', 'Structured master resume'],
                  ['Review gate', 'Nothing saves silently'],
                  ['Connected output', 'One application pack'],
                ].map(([title, detail]) => (
                  <div key={title}>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#718096]">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-10 -z-10 rounded-full bg-[#dce9ff] opacity-65 blur-3xl" />
              <div className="overflow-hidden rounded-2xl border border-[#cbd5e1] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
                <div className="flex h-11 items-center justify-between border-b border-[#e2e8f0] bg-[#f8fafc] px-4">
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
                  alt="Resume Workbench editor with a fictional resume and live PDF preview"
                  width={1440}
                  height={900}
                  unoptimized
                  priority
                  className="aspect-[16/10] w-full bg-[#f1f5f9] object-cover object-top"
                />
              </div>
              <div className="absolute -bottom-5 left-5 hidden items-center gap-3 rounded-xl border border-[#d6e0ec] bg-white px-4 py-3 shadow-lg sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ecfdf3] text-[#16803b]">
                  <CircleCheck className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold">Preview and source stay connected</p>
                  <p className="mt-0.5 text-[11px] text-[#718096]">
                    Edit once, render consistently.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 border-b border-[#e2e8f0] py-20 lg:py-28">
          <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <h2 className="max-w-[12ch] text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
                From master resume to application pack.
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-[#5d6c84] lg:justify-self-end">
                The workflow preserves context from beginning to end, so each document can be traced
                back to the job, source resume, prompt, and confirmed changes.
              </p>
            </div>

            <div className="mt-14 border-y border-[#dbe3ee]">
              {workflowSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className="grid gap-5 border-b border-[#dbe3ee] py-7 last:border-b-0 md:grid-cols-[80px_64px_0.7fr_1fr] md:items-center"
                  >
                    <span className="font-mono text-sm font-semibold text-[#e9570a]">
                      {step.number}
                    </span>
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef4ff] text-[#1d4ed8]">
                      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <h3 className="text-xl font-semibold tracking-[-0.025em]">{step.title}</h3>
                    <p className="max-w-xl text-sm leading-6 text-[#63718a]">{step.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="review"
          className="scroll-mt-20 border-b border-[#dbe3ee] bg-[#f5f8fc] py-20 lg:py-28"
        >
          <div className="mx-auto grid max-w-[90rem] gap-12 px-5 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:px-12">
            <div>
              <h2 className="max-w-[12ch] text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
                Every AI change stays reviewable.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#5d6c84]">
                Workbench proposes changes; you decide what becomes part of the application. Review
                the wording, reasoning, warnings, and rendered result before saving a tailored copy.
              </p>
              <ul className="mt-8 grid gap-4">
                {[
                  'Side-by-side before and after values',
                  'A reason attached to each proposed change',
                  'Local validation for unsupported claims',
                  'A final preview before creating the tailored resume',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-[#42506a]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e6f7ec] text-[#16803b]">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <DiffDemo />
          </div>
        </section>

        <section className="border-b border-[#e2e8f0] py-20 lg:py-28">
          <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div className="lg:sticky lg:top-28">
                <h2 className="max-w-[12ch] text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
                  One job. One connected application pack.
                </h2>
                <p className="mt-5 max-w-lg text-lg leading-8 text-[#5d6c84]">
                  Stop hunting through folders for the matching resume and letter. Every output
                  remains attached to the job and its generation history.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#d6e0ec]">
                <div className="border-b border-[#dbe3ee] bg-[#0b1736] px-6 py-5 text-white">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#fdba74]">
                        Application pack
                      </p>
                      <h3 className="mt-2 text-xl font-semibold">Platform Engineer · Northstar</h3>
                    </div>
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-[#dbeafe]">
                      <CircleCheck className="h-3.5 w-3.5 text-[#86efac]" aria-hidden />
                      Ready to review
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-[#dbe3ee]">
                  {packItems.map(([title, detail, Icon], index) => (
                    <div
                      key={title as string}
                      className="grid gap-4 bg-white px-5 py-5 transition hover:bg-[#fbfdff] sm:grid-cols-[56px_1fr_auto] sm:items-center sm:px-7"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef4ff] text-[#1d4ed8]">
                        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold">{title as string}</p>
                        <p className="mt-1 text-sm text-[#718096]">{detail as string}</p>
                      </div>
                      <span className="flex items-center gap-2 text-xs font-semibold text-[#526079]">
                        {index === 0 ? 'Generated' : 'Editable'}
                        <ChevronRight className="h-4 w-4 text-[#94a3b8]" aria-hidden />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 border-t border-[#dbe3ee] bg-[#f8fafc] px-5 py-4 text-xs text-[#64748b] sm:flex-row sm:items-center sm:justify-between sm:px-7">
                  <span>Linked to master resume · job · generation run</span>
                  <span className="font-mono">PACK NW4K2Q</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="architecture"
          className="scroll-mt-20 border-b border-[#dbe3ee] bg-[#f7faff] py-20 lg:py-24"
        >
          <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
              <div>
                <h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                  Built for local control.
                </h2>
                <p className="mt-4 max-w-xl text-lg leading-8 text-[#5d6c84]">
                  A normal web application with understandable boundaries, durable storage, and
                  inspectable generation history.
                </p>
              </div>
              <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-[#42506a] lg:justify-end">
                {[
                  'Typed contracts',
                  'Versioned migrations',
                  'Automated tests',
                  'Provider choice',
                ].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#16803b]" aria-hidden />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-12 grid overflow-hidden rounded-2xl border border-[#d6e0ec] bg-white sm:grid-cols-2 lg:grid-cols-5">
              {architecture.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.name}
                    className={`relative p-6 ${
                      index > 0 ? 'border-t border-[#e2e8f0] sm:border-l sm:border-t-0' : ''
                    } ${index === 2 ? 'sm:border-t lg:border-t-0' : ''}`}
                  >
                    <Icon className="h-6 w-6 text-[#e9570a]" strokeWidth={1.7} aria-hidden />
                    <p className="mt-8 font-semibold">{item.name}</p>
                    <p className="mt-1 text-sm text-[#718096]">{item.detail}</p>
                    {index < architecture.length - 1 ? (
                      <ArrowRight
                        className="absolute -right-2.5 top-8 z-10 hidden h-5 w-5 rounded-full bg-white text-[#94a3b8] lg:block"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 grid gap-6 rounded-2xl border border-[#d6e0ec] bg-[#0b1736] p-6 text-white md:grid-cols-[0.8fr_1.2fr] md:items-center md:p-8">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#fdba74]">
                  <ScanSearch className="h-7 w-7" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">Generation evidence is part of the product.</p>
                  <p className="mt-1 text-sm leading-6 text-[#b8c4d8]">
                    Inspect model, timing, token, prompt, response, and workflow-stage details.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-4">
                {[
                  ['Calls', '3'],
                  ['Tokens', '8,940'],
                  ['Status', 'Complete'],
                  ['Trace', 'demo-2026'],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#101f43] px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-[#8fa3c4]">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[#e2e8f0] py-20 lg:py-28">
          <div className="mx-auto grid max-w-[90rem] gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-12">
            <div className="relative mx-auto flex aspect-square w-full max-w-sm items-center justify-center rounded-[2.5rem] bg-[#eef4ff]">
              <div className="absolute inset-8 rounded-[2rem] border border-[#c8d7eb]" />
              <div className="relative flex h-40 w-40 items-center justify-center rounded-[2rem] border border-[#b9c8dc] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                <LockKeyhole className="h-20 w-20 text-[#1d4ed8]" strokeWidth={1.35} aria-hidden />
                <span className="absolute -bottom-3 -right-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9570a] text-white shadow-lg">
                  <Check className="h-7 w-7" strokeWidth={2.2} aria-hidden />
                </span>
              </div>
            </div>
            <div>
              <h2 className="max-w-[14ch] text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
                Your resume data stays in your environment.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#5d6c84]">
                Application data lives in your PostgreSQL database. Generated files stay in your
                configured artifact storage. AI inputs go only to the provider you choose when you
                run a generation feature.
              </p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {[
                  [
                    'Self-hosted by design',
                    'Run the full stack on your machine or infrastructure.',
                  ],
                  [
                    'No bundled tracking',
                    'No advertising analytics or hosted Workbench data service.',
                  ],
                  [
                    'Local secret files',
                    'Provider credentials remain in ignored local configuration.',
                  ],
                  [
                    'Visible provider boundary',
                    'Know when resume content leaves your environment.',
                  ],
                ].map(([title, body]) => (
                  <div key={title} className="border-l-2 border-[#e9570a] pl-4">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#718096]">{body}</p>
                  </div>
                ))}
              </div>
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
          <div className="mx-auto grid max-w-[90rem] gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:px-12">
            <div>
              <div className="flex items-center gap-3 text-[#fdba74]">
                <TerminalSquare className="h-6 w-6" aria-hidden />
                <span className="font-mono text-xs uppercase tracking-[0.16em]">Open source</span>
              </div>
              <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Inspect the code. Own the workflow.
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-[#b8c4d8]">
                The repository includes the frontend, API, migrations, prompt system, document
                pipeline, automated tests, setup guide, and project attribution.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ActionLink href={GITHUB_URL} external>
                <Github className="h-4 w-4" aria-hidden />
                Explore the code
              </ActionLink>
              <ActionLink href={`${GITHUB_URL}/blob/main/SETUP.md`} external>
                <BookOpen className="h-4 w-4" aria-hidden />
                Setup guide
              </ActionLink>
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
            <p className="text-sm font-semibold text-white">Product</p>
            <div className="mt-4 grid gap-3 text-sm">
              <a href="#workflow" className="hover:text-white">
                Workflow
              </a>
              <a href="#review" className="hover:text-white">
                Review model
              </a>
              <a href="#architecture" className="hover:text-white">
                Architecture
              </a>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Project</p>
            <div className="mt-4 grid gap-3 text-sm">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-white">
                GitHub
              </a>
              <a
                href={`${GITHUB_URL}/blob/main/README.md`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                Documentation
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
              <Code2 className="h-3.5 w-3.5 text-[#fdba74]" aria-hidden />
              Website interface is built from code, with one real product screenshot.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
