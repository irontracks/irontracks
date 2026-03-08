import { StudentIdParamSchema } from '@/schemas/params';
import { notFound } from 'next/navigation';
import AssessmentHistory from '@/components/assessment/AssessmentHistory';

export default async function AssessmentHistoryPage({ params }: { params: Promise<{ studentId: string }> }) {
  const p = await params;
  const parsed = StudentIdParamSchema.safeParse(p);

  if (!parsed.success) {
    return notFound();
  }

  return <AssessmentHistory studentId={parsed.data.studentId} />;
}
