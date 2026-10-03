'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MedicationInput } from '@/schemas/medications';
import type { Medication, MedicationIntake } from '@/types/medications';
import { dosesDoDia, weekdayDoDia } from '@/lib/medications/agenda';
import { brtDateKey, brtDateKeyDaysAgo } from '@/utils/cron/dateBrt';
import MedicationForm from '@/components/medications/MedicationForm';
import MedicationList from '@/components/medications/MedicationList';
import { useAdminPanel } from './AdminPanelContext';

/**
 * Aba "Remédios" do aluno no painel do professor.
 *
 * O professor VÊ e EDITA a lista (decisão do dono, 03/10/2026) e lê a adesão dos
 * últimos 7 dias em TEXTO. Ele NÃO marca "Tomei": a tomada é do aluno, e uma
 * marca do professor reescreveria a adesão que ele mesmo lê.
 *
 * `studentId` é o id de AUTH do aluno (`students.user_id`) — é o `user_id` das
 * tabelas de medicamentos. O id da LINHA de `students` não serve: a rota o recusa
 * (`canCoachStudent` não acha vínculo) e, pior, num caso de colisão apontaria para
 * outra pessoa. Quem monta esta aba passa o `user_id`.
 *
 * Dado de saúde: erro do servidor nunca vai para a tela em texto cru — a mensagem
 * sai do CÓDIGO.
 */

const DIAS_DE_ADESAO = 7;
const NOMES_DO_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MENSAGEM_GENERICA = 'Não consegui concluir. Tente de novo.';

const MENSAGENS_POR_CODIGO: Record<string, string> = {
    forbidden: 'Você não tem acesso à lista deste aluno.',
    rate_limited: 'Muitas tentativas seguidas. Espere um instante e tente de novo.',
    limite_atingido: 'Este aluno já tem o máximo de 30 medicamentos.',
    nao_encontrado: 'Medicamento não encontrado. Atualize a lista.',
    datas_invalidas: 'A data final não pode ser anterior à inicial.',
};

const mensagemDoCodigo = (codigo: unknown): string =>
    MENSAGENS_POR_CODIGO[String(codigo ?? '')] ?? MENSAGEM_GENERICA;

/** `YYYY-MM-DD` → `DD/MM`, sem passar por `Date` (nada de fuso). */
const diaMes = (dateKey: string): string => {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dateKey);
    return m ? `${m[2]}/${m[1]}` : dateKey;
};

const formatadorDeHora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Sao_Paulo',
});

/** Hora BRT (`HH:MM`) de um instante ISO; vazio se não for data. */
const horaBrt = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : formatadorDeHora.format(d);
};

type LinhaDeAdesao = {
    chave: string;
    tomada: boolean;
    /** Parte final ("tomado às 08:03" / "pendente"), separada para pintar só ela. */
    estado: string;
    inicio: string;
};

/** Os últimos 7 dias, do mais recente para o mais antigo, uma linha por dose. */
function montarAdesao(medications: Medication[], intakes: MedicationIntake[], hoje: string): LinhaDeAdesao[] {
    const linhas: LinhaDeAdesao[] = [];
    for (let atras = 0; atras < DIAS_DE_ADESAO; atras += 1) {
        const dateKey = atras === 0 ? hoje : brtDateKeyDaysAgo(atras);
        const doDia = intakes.filter((t) => t.date === dateKey);
        const rotuloDia = `${NOMES_DO_DIA[weekdayDoDia(dateKey)]} ${diaMes(dateKey)}`;
        for (const dose of dosesDoDia(medications, doDia, dateKey)) {
            const hora = horaBrt(dose.takenAt);
            const estado = dose.tomada ? (hora ? `tomado às ${hora}` : 'tomado') : 'pendente';
            linhas.push({
                chave: `${dose.medicationId}:${dateKey}:${dose.time}`,
                inicio: `${rotuloDia} · ${dose.time} ${dose.nome}`,
                estado,
                tomada: dose.tomada,
            });
        }
    }
    return linhas;
}

type Formulario = { tipo: 'novo' } | { tipo: 'editar'; medicamento: Medication };

const BOTAO_PRIMARIO = 'min-h-[44px] rounded-xl bg-yellow-500 px-5 text-sm font-black text-black active:scale-95';
const BOTAO_SECUNDARIO =
    'min-h-[44px] rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-4 text-sm font-bold text-neutral-200 hover:text-white';

export const StudentMedicationsTab: React.FC<{ studentId: string }> = ({ studentId }) => {
    const { getAdminAuthHeaders } = useAdminPanel();
    // Por ref: função instável vinda do contexto não pode refazer a carga (e piscar a
    // tela) a cada render — o defeito que já pegou o painel de controle do treino.
    const headersRef = useRef(getAdminAuthHeaders);
    headersRef.current = getAdminAuthHeaders;
    const [medications, setMedications] = useState<Medication[]>([]);
    const [intakes, setIntakes] = useState<MedicationIntake[]>([]);
    const [loading, setLoading] = useState(true);
    const [carregou, setCarregou] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [formulario, setFormulario] = useState<Formulario | null>(null);
    /** Respostas de um aluno anterior não podem pintar a lista do atual. */
    const geracao = useRef(0);

    const id = String(studentId || '').trim();

    const chamar = useCallback(
        async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', corpo?: Record<string, unknown>) => {
            const authHeaders = await headersRef.current();
            const url = method === 'GET'
                ? `/api/teacher/medications?studentId=${encodeURIComponent(id)}`
                : '/api/teacher/medications';
            const res = await fetch(url, {
                method,
                credentials: 'include',
                headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...authHeaders },
                ...(corpo ? { body: JSON.stringify(corpo) } : {}),
            });
            const json = await res.json().catch(() => ({}));
            return { ok: Boolean(res.ok && json?.ok), json: json as Record<string, unknown> };
        },
        [id],
    );

    const carregar = useCallback(async (): Promise<boolean> => {
        const minha = ++geracao.current;
        if (!id) { setLoading(false); return false; }
        setLoading(true);
        try {
            const r = await chamar('GET');
            if (minha !== geracao.current) return false;
            if (!r.ok) {
                setErro(mensagemDoCodigo(r.json?.error));
                return false;
            }
            setMedications(Array.isArray(r.json.medications) ? (r.json.medications as Medication[]) : []);
            setIntakes(Array.isArray(r.json.intakes) ? (r.json.intakes as MedicationIntake[]) : []);
            setErro(null);
            setCarregou(true);
            return true;
        } catch {
            if (minha === geracao.current) setErro('Não consegui carregar os remédios do aluno.');
            return false;
        } finally {
            if (minha === geracao.current) setLoading(false);
        }
    }, [id, chamar]);

    useEffect(() => {
        setCarregou(false);
        setFormulario(null);
        setMedications([]);
        setIntakes([]);
        void carregar();
    }, [carregar]);

    /** Escreve e relê. Devolve `true` se gravou — o formulário só fecha com `true`. */
    const escrever = useCallback(
        async (method: 'POST' | 'PATCH' | 'DELETE', corpo: Record<string, unknown>): Promise<boolean> => {
            setErro(null);
            try {
                const r = await chamar(method, { studentId: id, ...corpo });
                if (!r.ok) {
                    setErro(mensagemDoCodigo(r.json?.error));
                    return false;
                }
                await carregar();
                return true;
            } catch {
                setErro(MENSAGEM_GENERICA);
                return false;
            }
        },
        [chamar, carregar, id],
    );

    const enviarFormulario = useCallback(
        (input: MedicationInput): Promise<boolean> =>
            formulario?.tipo === 'editar'
                ? escrever('PATCH', { id: formulario.medicamento.id, ...input })
                : escrever('POST', { ...input }),
        [formulario, escrever],
    );

    const adesao = useMemo(
        () => montarAdesao(medications, intakes, brtDateKey()),
        [medications, intakes],
    );

    if (!id) {
        return (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4">
                <p className="text-sm text-neutral-300">
                    Este aluno ainda não tem conta no app — não há lista de remédios para ver ou editar.
                </p>
            </div>
        );
    }

    const vazio = carregou && !loading && medications.length === 0;

    return (
        <div className="space-y-4">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-black text-white tracking-tight">Remédios</h3>
                        <p className="mt-1 text-xs text-neutral-400">
                            Dado de saúde do aluno. O aluno é avisado quando você altera esta lista.
                        </p>
                    </div>
                    {!formulario && carregou && (
                        <button type="button" onClick={() => setFormulario({ tipo: 'novo' })} className={BOTAO_PRIMARIO}>
                            Adicionar
                        </button>
                    )}
                </div>
            </div>

            {erro && (
                <div role="alert" className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-bold text-red-400">{erro}</p>
                    {!carregou && (
                        <button type="button" onClick={() => void carregar()} className={BOTAO_SECUNDARIO}>
                            Tentar de novo
                        </button>
                    )}
                </div>
            )}

            {loading && !carregou && <p className="text-sm text-neutral-400 animate-pulse">Carregando remédios...</p>}

            {formulario ? (
                <MedicationForm
                    // Remonta ao trocar de remédio: o estado interno nasce do `initial`.
                    key={formulario.tipo === 'editar' ? formulario.medicamento.id : 'novo'}
                    initial={formulario.tipo === 'editar' ? formulario.medicamento : undefined}
                    onSubmit={enviarFormulario}
                    onSaved={() => setFormulario(null)}
                    onCancel={() => setFormulario(null)}
                />
            ) : (
                <>
                    {vazio && (
                        <p className="text-sm text-neutral-300">Nenhum medicamento cadastrado para este aluno.</p>
                    )}

                    {carregou && medications.length > 0 && (
                        <MedicationList
                            medications={medications}
                            onEdit={(m) => setFormulario({ tipo: 'editar', medicamento: m })}
                            onToggleActive={(m) => escrever('PATCH', { id: m.id, active: !m.active })}
                            onDelete={(m) => escrever('DELETE', { id: m.id })}
                        />
                    )}

                    {carregou && medications.length > 0 && (
                        <section aria-labelledby="med-adesao" className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4">
                            <h4 id="med-adesao" className="text-sm font-black text-white">Últimos 7 dias</h4>
                            {adesao.length === 0 ? (
                                <p className="mt-2 text-sm text-neutral-300">Nenhuma dose programada nos últimos 7 dias.</p>
                            ) : (
                                <ul className="mt-2 space-y-1">
                                    {adesao.map((l) => (
                                        <li key={l.chave} className="text-sm text-neutral-300">
                                            {l.inicio} —{' '}
                                            <span className={l.tomada ? 'text-green-400' : 'text-neutral-300'}>{l.estado}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}
                </>
            )}
        </div>
    );
};

export default StudentMedicationsTab;
