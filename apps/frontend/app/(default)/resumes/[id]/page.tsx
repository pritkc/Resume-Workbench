import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ id: string }>;
};

/** Legacy URL: `/resumes/[id]` → canonical editor at `/builder?id=` */
export default async function ResumeIdRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/builder?id=${encodeURIComponent(id)}`);
}
