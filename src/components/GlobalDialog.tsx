"use client";

import React, { useEffect, useRef } from 'react';
import { useDialog } from '@/contexts/DialogContext';
import { AlertCircle, HelpCircle, X, MessageSquare, CheckCircle2 } from 'lucide-react';

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
		} catch { }
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

	// Big centered icon config per dialog type
	const iconConfig = (() => {
		switch (dialog.type) {
			case 'confirm':
				return {
					bg: 'bg-yellow-500/15 border border-yellow-500/30',
					icon: <HelpCircle className="text-yellow-400" size={32} />,
					confirmCls: 'bg-yellow-500 hover:bg-yellow-400 shadow-lg shadow-yellow-900/30 text-black',
				};
			case 'prompt':
				return {
					bg: 'bg-purple-500/15 border border-purple-500/30',
					icon: <MessageSquare className="text-purple-400" size={32} />,
					confirmCls: 'bg-purple-500 hover:bg-purple-400 shadow-lg shadow-purple-900/30 text-white',
				};
			case 'loading':
				return {
					bg: 'bg-blue-500/15 border border-blue-500/30',
					icon: <AlertCircle className="text-blue-400 animate-pulse" size={32} />,
					confirmCls: 'bg-blue-500 hover:bg-blue-400 shadow-lg shadow-blue-900/30 text-white',
				};
			default:
				return {
					bg: 'bg-green-500/15 border border-green-500/30',
					icon: <CheckCircle2 className="text-green-400" size={32} />,
					confirmCls: 'bg-green-500 hover:bg-green-400 shadow-lg shadow-green-900/30 text-black',
				};
		}
	})();

	return (
		<div className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe pb-safe animate-fade-in">
			<div className="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800/80 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-slide-up">

				{/* Premium header with big centered icon */}
				<div className="px-6 pt-6 pb-4 text-center relative">
					<button
						onClick={handleClose}
						className="absolute top-4 right-4 text-neutral-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-neutral-800"
					>
						<X size={18} />
					</button>

					{/* Big icon */}
					<div className={`w-16 h-16 rounded-2xl ${iconConfig.bg} flex items-center justify-center mx-auto mb-4`}>
						{iconConfig.icon}
					</div>

					<h3 className="font-black text-white text-lg tracking-tight">{dialog.title}</h3>
				</div>

				{/* Message */}
				<div className="px-6 pb-2">
					<p className="text-neutral-400 text-center text-sm leading-relaxed whitespace-pre-line">
						{dialog.message}
					</p>
				</div>

				{/* Prompt input */}
				{dialog.type === 'prompt' && (
					<div className="px-6 pb-4">
						<input
							key={`${dialog.type}:${dialog.title}:${dialog.message}:${dialog.defaultValue ?? ''}`}
							ref={inputRef}
							defaultValue={dialog.defaultValue ?? ''}
							onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
							className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white text-center font-bold outline-none focus:border-purple-500 transition-colors mt-2"
							placeholder="Digite aqui..."
						/>
					</div>
				)}

				{/* Action buttons */}
				{dialog.type !== 'loading' && (
					<div className="p-4 flex gap-3">
						{(dialog.type === 'confirm' || dialog.type === 'prompt') && (
							<button
								onClick={dialog.onCancel}
								className="flex-1 py-3.5 rounded-xl bg-neutral-800/80 text-neutral-400 font-black hover:bg-neutral-700 hover:text-white transition-all duration-200 text-sm active:scale-95"
							>
								{dialog.cancelText || 'Cancelar'}
							</button>
						)}
						<button
							onClick={handleConfirm}
							className={`flex-1 py-3.5 rounded-xl font-black transition-all duration-200 text-sm active:scale-95 ${iconConfig.confirmCls}`}
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
