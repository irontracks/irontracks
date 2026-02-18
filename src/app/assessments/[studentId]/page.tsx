import AssessmentHistory from '@/components/assessment/AssessmentHistory';

export default async function AssessmentHistoryPage({ params }: { params: Promise<{ studentId: string }> }) {
  const p = await params;
  return <AssessmentHistory studentId={p.studentId} />;
}
