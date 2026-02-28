"use client";

import React, { useEffect, useRef } from 'react';
import { useDialog } from '@/contexts/DialogContext';
import { AlertCircle, HelpCircle, X, MessageSquare } from 'lucide-react';

const GlobalDialog = () => {
	const { dialog, closeDialog } = useDialog();
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (dialog?.type === 'prompt') {
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [dialog?.type]);

	if (!dialog) return null;

	const handleClose = () => {
		try {
			if ((dialog.type === 'confirm' || dialog.type === 'prompt') && typeof dialog.onCancel === 'function') {
				dialog.onCancel();
				return;
			}
		} catch {}
		closeDialog();
	};

	const handleConfirm = () => {
		if (dialog.type === 'prompt') {
			const value = inputRef.current?.value ?? dialog.defaultValue ?? '';
			if (typeof dialog.onConfirm === 'function') dialog.onConfirm(value);
		} else if (typeof dialog.onConfirm === 'function') {
			dialog.onConfirm();
		}
	};

	const getIcon = () => {
		switch (dialog.type) {
			case 'confirm':
				return <HelpCircle className="text-yellow-500" size={20} />;
			case 'prompt':
				return <MessageSquare className="text-purple-500" size={20} />;
			default:
				return <AlertCircle className="text-blue-500" size={20} />;
		}
	};

	const getConfirmButtonColor = () => {
		switch (dialog.type) {
			case 'confirm':
				return 'bg-yellow-500 hover:bg-yellow-400 shadow-yellow-900/20';
			case 'prompt':
				return 'bg-purple-500 hover:bg-purple-400 shadow-purple-900/20';
			default:
				return 'bg-blue-500 hover:bg-blue-400 shadow-blue-900/20';
		}
	};

	return (
		<div className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe pb-safe animate-fade-in">
			<div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-in">
				<div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-800/50">
					<h3 className="font-bold text-white flex items-center gap-2">
						{getIcon()}
						{dialog.title}
					</h3>
				<button onClick={handleClose} className="text-neutral-500 hover:text-white transition-colors">
					<X size={20} />
				</button>
			</div>

				<div className="p-6">
					<p className="text-neutral-300 text-center text-sm leading-relaxed whitespace-pre-line mb-4">
						{dialog.message}
					</p>

					{dialog.type === 'prompt' && (
						<input
							key={`${dialog.type}:${dialog.title}:${dialog.message}:${dialog.defaultValue ?? ''}`}
							ref={inputRef}
							defaultValue={dialog.defaultValue ?? ''}
							onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
							className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white text-center font-bold outline-none focus:border-purple-500 transition-colors"
							placeholder="Digite aqui..."
						/>
					)}
				</div>

				{dialog.type !== 'loading' && (
					<div className="p-4 bg-neutral-950/50 flex gap-3">
						{(dialog.type === 'confirm' || dialog.type === 'prompt') && (
						<button
							onClick={dialog.onCancel}
							className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-400 font-bold hover:bg-neutral-700 transition-colors text-sm"
						>
							{dialog.cancelText || 'Cancelar'}
						</button>
					)}
					<button
						onClick={handleConfirm}
						className={`flex-1 py-3 rounded-xl font-bold text-black transition-colors text-sm shadow-lg ${getConfirmButtonColor()}`}
					>
						{dialog.type === 'confirm' ? (dialog.confirmText || 'Confirmar') : (dialog.confirmText || 'OK')}
					</button>
				</div>
			)}
			</div>
		</div>
	);
};

export default GlobalDialog;
