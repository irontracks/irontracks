import React from 'react';
import { useAdminPanel } from './AdminPanelContext';
import { AlertTriangle } from 'lucide-react';

export const PrioritiesTab: React.FC = () => {
    const { prioritiesItems, prioritiesLoading } = useAdminPanel();

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
             <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                <h3 className="font-black text-white text-lg mb-4 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-yellow-500" />
                    Prioridades (Coach Inbox)
                </h3>
                <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
                    <p className="text-neutral-500">Funcionalidade de Prioridades em migração.</p>
                </div>
            </div>
        </div>
    );
};
