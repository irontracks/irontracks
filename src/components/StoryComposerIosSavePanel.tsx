'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface StoryComposerIosSavePanelProps {
    saveImageUrl: string | null;
    onClose: () => void;
}

/**
 * StoryComposerIosSavePanel
 *
 * Painel fullscreen iOS "Salvar no Rolo do iPhone".
 * Exibido quando `saveImageUrl` não é null — o usuário deve dar
 * long-press na imagem e escolher "Adicionar à Fotos".
 * Extraído de StoryComposer.tsx (L1672–1711).
 */
export function StoryComposerIosSavePanel({
    saveImageUrl,
    onClose,
}: StoryComposerIosSavePanelProps) {
    if (!saveImageUrl) return null;

    const handleClose = () => {
        try {
            URL.revokeObjectURL(saveImageUrl);
        } catch { }
        onClose();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] bg-black flex flex-col items-center justify-between p-6 pt-safe"
        >
            <div className="text-center pt-8">
                <p className="text-white font-black text-xl leading-tight">Salvar no Rolo do iPhone</p>
                <p className="text-neutral-400 text-sm mt-2 leading-snug">
                    Toque e segure na imagem abaixo
                    <br />e escolha{' '}
                    <span className="text-yellow-400 font-bold">&quot;Adicionar à Fotos&quot;</span>
                </p>
            </div>

            {/* The image — inline style overrides Capacitor's -webkit-touch-callout:none */}
            <img
                src={saveImageUrl}
                alt="Story para salvar"
                className="rounded-2xl shadow-2xl max-h-[60vh] w-auto"
                style={
                    {
                        WebkitTouchCallout: 'default',
                        WebkitUserSelect: 'auto',
                        userSelect: 'auto',
                        touchAction: 'auto',
                    } as React.CSSProperties
                }
            />

            <button
                type="button"
                onClick={handleClose}
                className="w-full max-w-xs h-12 rounded-xl bg-neutral-800 border border-neutral-700 text-white font-bold text-sm hover:bg-neutral-700 active:scale-95 transition-all"
            >
                Fechar
            </button>
        </motion.div>
    );
}
