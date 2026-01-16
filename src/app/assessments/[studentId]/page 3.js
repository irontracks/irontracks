import AssessmentHistory from '@/components/assessment/AssessmentHistory';

export default async function AssessmentHistoryPage({ params }) {
  const p = await params;
  return <AssessmentHistory studentId={p.studentId} />;
}
