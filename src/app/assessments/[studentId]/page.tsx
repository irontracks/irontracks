import dynamic from 'next/dynamic';
import { StudentIdParamSchema } from '@/schemas/params';
import { notFound } from 'next/navigation';

const AssessmentHistory = dynamic(() => import('@/components/assessment/AssessmentHistory'), {
  ssr: false,
  loading: () => (
    <div className="p-6 flex items-center justify-center bg-neutral-900 text-white min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4" />
        <p className="text-neutral-400">Carregando avaliações...</p>
      </div>
    </div>
  ),
});

export default async function AssessmentHistoryPage({ params }: { params: Promise<{ studentId: string }> }) {
  const p = await params;
  const parsed = StudentIdParamSchema.safeParse(p);

  if (!parsed.success) {
    return notFound();
  }

  return <AssessmentHistory studentId={parsed.data.studentId} />;
}
