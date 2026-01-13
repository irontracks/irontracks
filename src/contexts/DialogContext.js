"use client";
import React, { createContext, useContext, useState, useCallback } from 'react';

const DialogContext = createContext();

export const useDialog = () => {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used within a DialogProvider');
    }
    return context;
};

export const DialogProvider = ({ children }) => {
    const [dialog, setDialog] = useState(null);

    const closeDialog = useCallback(() => {
        setDialog(null);
    }, []);

    const confirm = useCallback((message, title = 'Confirmação', options = null) => {
        return new Promise((resolve) => {
            const opts = options && typeof options === 'object' ? options : {};
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

    const alert = useCallback((message, title = 'Atenção') => {
        return new Promise((resolve) => {
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

    const prompt = useCallback((message, title = 'Entrada', defaultValue = '') => {
        return new Promise((resolve) => {
            setDialog({
                type: 'prompt',
                title,
                message,
                defaultValue,
                onConfirm: (value) => {
                    closeDialog();
                    resolve(value);
                },
                onCancel: () => {
                    closeDialog();
                    resolve(null);
                }
            });
        });
    }, [closeDialog]);

    const showLoading = useCallback((message, title = 'Aguarde') => {
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
