"use client";
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DialogProvider } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { BackButton } from '@/components/ui/BackButton';
import { StudentIdParamSchema } from '@/schemas/params';
import { createClient } from '@/utils/supabase/client';
import { logWarn } from '@/lib/logger';

export default function NewAssessmentPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = Array.isArray(params?.studentId) ? params.studentId[0] : params?.studentId;
  const result = StudentIdParamSchema.safeParse({ studentId: rawId });

  /**
   * O nome REAL do aluno. Era o literal `'Aluno'`, e ele não ficava só no
   * cabeçalho: essa string é a única fonte de nome do formulário inteiro e
   * chegava ao PDF e ao JSON exportados — o profissional recebia um laudo de
   * "Aluno".
   *
   * Começa VAZIO e os consumidores omitem a linha enquanto não resolve. Um
   * placeholder é pior que a ausência: some com a dúvida sem responder nada, e
   * o nome errado num documento clínico é mais caro que nome nenhum.
   */
  const [studentName, setStudentName] = React.useState('');

  const studentIdResolvido = result.success ? result.data.studentId : null;
  React.useEffect(() => {
    if (!studentIdResolvido) return;
    let vivo = true;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('profiles').select('display_name').eq('id', studentIdResolvido).maybeSingle();
        const nome = String(data?.display_name ?? '').trim();
        if (vivo && nome) setStudentName(nome);
      } catch (e) {
        // Sem nome, o formulário funciona e o laudo sai sem a linha. Falhar
        // aqui não pode impedir a avaliação de ser registrada.
        logWarn('NewAssessmentPage', 'falha ao buscar nome do aluno', { error: String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [studentIdResolvido]);

  if (!result.success) {
    return (
      <DialogProvider>
        <GlobalDialog />
        <div className="min-h-screen bg-neutral-900 text-white p-4 flex items-center justify-center">
          <div className="bg-neutral-800 rounded-2xl border border-red-500/40 px-6 py-5 max-w-md w-full text-center">
            <h3 className="text-red-400 font-bold mb-2">Erro na Avaliação</h3>
            <p className="text-sm text-neutral-300 mb-4">
              Não foi possível identificar o aluno para esta avaliação física.
            </p>
            <BackButton className="bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 w-full" />
          </div>
        </div>
      </DialogProvider>
    );
  }

  const { studentId } = result.data;

  return (
    <DialogProvider>
      <GlobalDialog />
      <div className="min-h-screen bg-neutral-900 text-white px-3 sm:px-4 py-4 pt-safe pb-safe">
        <div className="max-w-5xl mx-auto bg-neutral-800 rounded-2xl border border-neutral-700">
          <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
            <h3 className="font-bold">Nova Avaliação</h3>
            <BackButton className="bg-neutral-900 border border-neutral-700 hover:bg-neutral-800" />
          </div>
          <div className="p-0">
            <AssessmentForm
              studentId={studentId}
              studentName={studentName}
              onSuccess={() => router.back()}
              onCancel={() => router.back()}
            />
          </div>
        </div>
      </div>
    </DialogProvider>
  );
}
