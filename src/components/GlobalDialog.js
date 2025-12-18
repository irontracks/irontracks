import React, { useState, useEffect, useRef } from 'react';
import { useDialog } from '@/contexts/DialogContext';
import { AlertCircle, HelpCircle, X, MessageSquare } from 'lucide-react';

const GlobalDialog = () => {
    const { dialog, closeDialog } = useDialog();
    const [promptValue, setPromptValue] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (dialog?.type === 'prompt') {
            setPromptValue(dialog.defaultValue || '');
            // Focus input after render
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [dialog]);

    if (!dialog) return null;

    const handleConfirm = () => {
        if (dialog.type === 'prompt') {
            dialog.onConfirm(promptValue);
        } else {
            dialog.onConfirm();
        }
    };

    const getIcon = () => {
        switch (dialog.type) {
            case 'confirm': return <HelpCircle className="text-yellow-500" size={20} />;
            case 'prompt': return <MessageSquare className="text-purple-500" size={20} />;
            default: return <AlertCircle className="text-blue-500" size={20} />;
        }
    };

    const getConfirmButtonColor = () => {
        switch (dialog.type) {
            case 'confirm': return 'bg-yellow-500 hover:bg-yellow-400 shadow-yellow-900/20';
            case 'prompt': return 'bg-purple-500 hover:bg-purple-400 shadow-purple-900/20';
            default: return 'bg-blue-500 hover:bg-blue-400 shadow-blue-900/20';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-800/50">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        {getIcon()}
                        {dialog.title}
                    </h3>
                    <button onClick={closeDialog} className="text-neutral-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-neutral-300 text-center text-sm leading-relaxed whitespace-pre-line mb-4">
                        {dialog.message}
                    </p>

                    {dialog.type === 'prompt' && (
                        <input
                            ref={inputRef}
                            value={promptValue}
                            onChange={(e) => setPromptValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white text-center font-bold outline-none focus:border-purple-500 transition-colors"
                            placeholder="Digite aqui..."
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-neutral-950/50 flex gap-3">
                    {(dialog.type === 'confirm' || dialog.type === 'prompt') && (
                        <button
                            onClick={dialog.onCancel}
                            className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-400 font-bold hover:bg-neutral-700 transition-colors text-sm"
                        >
                            Cancelar
                        </button>
                    )}
                    <button
                        onClick={handleConfirm}
                        className={`flex-1 py-3 rounded-xl font-bold text-black transition-colors text-sm shadow-lg ${getConfirmButtonColor()}`}
                    >
                        {dialog.type === 'confirm' ? 'Confirmar' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalDialog;
