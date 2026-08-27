"use client";

interface ConfirmOptions {
    confirmText?: string
    cancelText?: string
    /**
     * Marca a confirmação como DESTRUTIVA: o botão de ação fica vermelho e o
     * ícone vira alerta, em vez do "?" amarelo que o app usa para tudo.
     *
     * Existe porque o diálogo de cancelar treino era literalmente
     * "Cancelar / [Cancelar] [Confirmar]" — a mesma palavra significando
     * abandonar o treino no título e desistir de abandonar no botão, com o
     * gold (cor de ação positiva) na opção que APAGA a sessão.
     */
    destructive?: boolean
    [key: string]: unknown
}

interface DialogState {
    type: 'confirm' | 'alert' | 'prompt' | 'loading'
    /**
     * Aparência do alerta. O padrão continua 'success' (o check verde de
     * sempre), mas um alerta que diz "Erro ao..." saindo com ícone de sucesso
     * é a cor MENTINDO sobre o conteúdo — quem informa ou avisa de falha passa
     * o tom junto (auditoria do menu Ferramentas, 19/08/2026).
     */
    tone?: 'success' | 'info' | 'error'
    title: string
    message: string
    confirmText?: string | null
    cancelText?: string | null
    destructive?: boolean
    defaultValue?: string
    onConfirm?: (value?: string) => void
    onCancel?: () => void
}

/**
 * O contrato do `confirm`, EXPORTADO para quem o recebe por prop.
 *
 * Dois hooks declaravam a própria versão sem o 3º parâmetro
 * (`(msg, title) => Promise<boolean>`), e o efeito não era cosmético: quem
 * usava aquele tipo NÃO CONSEGUIA passar `destructive: true`, então exclusão de
 * aluno, de professor e de histórico saíam com o botão dourado de ação
 * primária. A assinatura truncada era a causa estrutural, não um descuido de
 * cada chamada.
 */
export type ConfirmFn = (message: string, title?: string, options?: ConfirmOptions | null) => Promise<boolean>

interface DialogContextValue {
    dialog: DialogState | null
    confirm: ConfirmFn
    alert: (message: string, title?: string, tone?: 'success' | 'info' | 'error') => Promise<boolean>
    prompt: (message: string, title?: string, defaultValue?: string) => Promise<string | null>
    showLoading: (message: string, title?: string) => void
    closeDialog: () => void
}

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const DialogContext = createContext<DialogContextValue | null>(null);

export const useDialog = () => {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used within a DialogProvider');
    }
    return context;
};

export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
    const [dialog, setDialog] = useState<DialogState | null>(null);

    const closeDialog = useCallback(() => {
        setDialog(null);
    }, []);

    const confirm = useCallback((message: string, title = 'Confirmação', options: ConfirmOptions | null = null) => {
        return new Promise<boolean>((resolve) => {
            const opts: ConfirmOptions = options && typeof options === 'object' ? options : {};
            setDialog({
                type: 'confirm',
                title,
                message,
                confirmText: typeof opts.confirmText === 'string' ? opts.confirmText : null,
                cancelText: typeof opts.cancelText === 'string' ? opts.cancelText : null,
                destructive: opts.destructive === true,
                onConfirm: () => {
                    closeDialog();
                    resolve(true);
                },
                onCancel: () => {
                    closeDialog();
                    resolve(false);
                }
            });
        });
    }, [closeDialog]);

    const alert = useCallback((message: string, title = 'Atenção', tone: 'success' | 'info' | 'error' = 'success') => {
        return new Promise<boolean>((resolve) => {
            setDialog({
                type: 'alert',
                title,
                message,
                tone,
                onConfirm: () => {
                    closeDialog();
                    resolve(true);
                }
            });
        });
    }, [closeDialog]);

    const prompt = useCallback((message: string, title = 'Entrada', defaultValue = '') => {
        return new Promise<string | null>((resolve) => {
            setDialog({
                type: 'prompt',
                title,
                message,
                defaultValue,
                onConfirm: (value?: string) => {
                    closeDialog();
                    resolve(value ?? null);
                },
                onCancel: () => {
                    closeDialog();
                    resolve(null);
                }
            });
        });
    }, [closeDialog]);

    const showLoading = useCallback((message: string, title = 'Aguarde') => {
        setDialog({ type: 'loading', title, message });
        // Safety timeout: auto-close loading after 30s to prevent stuck spinners
        // (e.g. if caller throws before calling closeDialog)
        setTimeout(() => {
            setDialog((prev) => (prev?.type === 'loading' ? null : prev));
        }, 30_000);
    }, []);

    // Memoiza o value pra evitar re-render de todos os consumers a cada setDialog.
    // confirm/alert/prompt/closeDialog/showLoading já são estáveis (useCallback),
    // então value só muda quando `dialog` mudar — comportamento desejado.
    const value = useMemo(
        () => ({ dialog, confirm, alert, prompt, closeDialog, showLoading }),
        [dialog, confirm, alert, prompt, closeDialog, showLoading]
    );

    return (
        <DialogContext.Provider value={value}>
            {children}
        </DialogContext.Provider>
    );
};
