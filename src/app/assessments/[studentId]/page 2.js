import AssessmentHistory from '@/pages/AssessmentHistory';

export default async function AssessmentHistoryPage({ params }) {
  const p = await params;
  return <AssessmentHistory studentId={p.studentId} />;
}
