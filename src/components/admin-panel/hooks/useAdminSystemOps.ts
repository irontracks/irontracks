import { useState, useCallback, useRef } from 'react';
import type { AdminUser } from '@/types/admin';
import type { UnknownRecord } from '@/types/app';
import { useDialog } from '@/contexts/DialogContext';
import { exportAllData, importAllData } from '@/actions/admin-actions';
import { parseJsonWithSchema } from '@/utils/zod';
import { z } from 'zod';

export type UseAdminSystemOpsParams = {
    setUsersList: React.Dispatch<React.SetStateAction<AdminUser[]>>;
    setTeachersList: React.Dispatch<React.SetStateAction<AdminUser[]>>;
    setTemplates: React.Dispatch<React.SetStateAction<UnknownRecord[]>>;
};

export const useAdminSystemOps = ({
    setUsersList,
    setTeachersList,
    setTemplates,
}: UseAdminSystemOpsParams) => {
    const { alert, confirm } = useDialog();

    // ─── Modal visibility ─────────────────────────────────────────────────────
    const [dangerOpen, setDangerOpen] = useState<boolean>(false);
    const [exportOpen, setExportOpen] = useState<boolean>(false);
    const [historyOpen, setHistoryOpen] = useState<boolean>(false);
    const [moreTabsOpen, setMoreTabsOpen] = useState<boolean>(false);

    // ─── Danger Zone State ────────────────────────────────────────────────────
    const [dangerActionLoading, setDangerActionLoading] = useState<string | null>(null);
    const [dangerStudentsConfirm, setDangerStudentsConfirm] = useState<string>('');
    const [dangerTeachersConfirm, setDangerTeachersConfirm] = useState<string>('');
    const [dangerWorkoutsConfirm, setDangerWorkoutsConfirm] = useState<string>('');

    // ─── System Export/Import ─────────────────────────────────────────────────
    const [systemExporting, setSystemExporting] = useState<boolean>(false);
    const [systemImporting, setSystemImporting] = useState<boolean>(false);
    const systemFileInputRef = useRef<HTMLInputElement | null>(null);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const handleExportSystem = useCallback(async () => {
        try {
            setSystemExporting(true);
            const res = await exportAllData();
            if (res?.error) throw new Error(String(res.error));
            const json = JSON.stringify(res.data || {}, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `irontracks_full_backup_${new Date().toISOString()}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao exportar: ' + msg);
        } finally {
            setSystemExporting(false);
        }
    }, [alert]);

    const handleImportSystemClick = useCallback(() => {
        systemFileInputRef.current?.click();
    }, []);

    const handleImportSystem = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setSystemImporting(true);
            const text = await file.text();
            const data = parseJsonWithSchema(text, z.record(z.unknown()));
            if (!data) throw new Error('invalid_json');
            if (!(await confirm('Importar backup completo do sistema?', 'Importar Backup'))) return;
            const res = await importAllData(data);
            if (res?.error) throw new Error(String(res.error));
            await alert('Backup importado com sucesso!');
        } catch (err: unknown) {
            const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : String(err);
            await alert('Erro ao importar: ' + msg);
        } finally {
            setSystemImporting(false);
            e.target.value = '';
        }
    }, [alert, confirm]);

    const handleDangerAction = useCallback(async (actionName: string, actionFn: () => Promise<UnknownRecord>) => {
        if (!(await confirm(`Tem certeza que deseja ${actionName}?`, 'ATENÇÃO - PERIGO'))) return false;
        if (!(await confirm(`Esta ação é IRREVERSÍVEL. Todos os dados serão perdidos. Confirmar mesmo?`, 'CONFIRMAÇÃO FINAL'))) return false;
        try {
            const res = await actionFn();
            if (res?.error) throw new Error(String(res.error));
            await alert(`${actionName} realizado com sucesso.`, 'Sucesso');
            setUsersList([]);
            setTeachersList([]);
            setTemplates([]);
            return true;
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert(`Erro ao executar ${actionName}: ` + msg);
            return false;
        }
    }, [alert, confirm, setUsersList, setTeachersList, setTemplates]);

    const runDangerAction = useCallback(async (actionKey: string, actionName: string, actionFn: () => Promise<UnknownRecord>, resetInput: () => void) => {
        setDangerActionLoading(actionKey);
        try {
            const ok = await handleDangerAction(actionName, actionFn);
            if (ok) resetInput();
        } finally {
            setDangerActionLoading(null);
        }
    }, [handleDangerAction]);

    return {
        // Modal visibility
        dangerOpen, setDangerOpen,
        exportOpen, setExportOpen,
        historyOpen, setHistoryOpen,
        moreTabsOpen, setMoreTabsOpen,
        // Danger zone
        dangerActionLoading, setDangerActionLoading,
        dangerStudentsConfirm, setDangerStudentsConfirm,
        dangerTeachersConfirm, setDangerTeachersConfirm,
        dangerWorkoutsConfirm, setDangerWorkoutsConfirm,
        // System export/import
        systemExporting, setSystemExporting,
        systemImporting, setSystemImporting,
        systemFileInputRef,
        // Handlers
        handleExportSystem,
        handleImportSystemClick,
        handleImportSystem,
        handleDangerAction,
        runDangerAction,
    };
};
