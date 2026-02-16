"use client";

interface ConfirmOptions {
    confirmText?: string
    cancelText?: string
    [key: string]: unknown
}

interface DialogState {
    type: 'confirm' | 'alert' | 'prompt' | 'loading'
    title: string
    message: string
    confirmText?: string | null
    cancelText?: string | null
    defaultValue?: string
    onConfirm?: (value?: string) => void
    onCancel?: () => void
}

interface DialogContextValue {
    dialog: DialogState | null
    confirm: (message: string, title?: string, options?: ConfirmOptions | null) => Promise<boolean>
    alert: (message: string, title?: string) => Promise<boolean>
    prompt: (message: string, title?: string, defaultValue?: string) => Promise<string | null>
    showLoading: (message: string, title?: string) => void
    closeDialog: () => void
}

import React, { createContext, useContext, useState, useCallback } from 'react';

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

    const alert = useCallback((message: string, title = 'Atenção') => {
        return new Promise<boolean>((resolve) => {
            setDialog({
                type: 'alert',
                title,
                message,
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
        setDialog({
            type: 'loading',
            title,
            message
        });
    }, []);

    return (
        <DialogContext.Provider value={{ dialog, confirm, alert, prompt, closeDialog, showLoading }}>
            {children}
        </DialogContext.Provider>
    );
};
