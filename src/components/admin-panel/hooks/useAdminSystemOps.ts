import { useState, useCallback, useRef } from 'react';
import { useDialog } from '@/contexts/DialogContext';
import { exportAllData, importAllData } from '@/actions/admin-actions';
import { parseJsonWithSchema } from '@/utils/zod';
import { z } from 'zod';

/**
 * Não recebe mais as três listas (`setUsersList`, `setTeachersList`,
 * `setTemplates`): elas serviam só à Danger Zone, que as esvaziava depois de
 * apagar tudo. A seção foi removida em 27/08/2026 — a UI existia, o backend
 * não. Ver o comentário no topo do `SystemTab`.
 */
export const useAdminSystemOps = () => {
    const { alert, confirm } = useDialog();

    // ─── Modal visibility ─────────────────────────────────────────────────────
    const [exportOpen, setExportOpen] = useState<boolean>(false);
    const [historyOpen, setHistoryOpen] = useState<boolean>(false);
    const [moreTabsOpen, setMoreTabsOpen] = useState<boolean>(false);


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

    return {
        // Modal visibility
        exportOpen, setExportOpen,
        historyOpen, setHistoryOpen,
        moreTabsOpen, setMoreTabsOpen,
        // System export/import
        systemExporting, setSystemExporting,
        systemImporting, setSystemImporting,
        systemFileInputRef,
        // Handlers
        handleExportSystem,
        handleImportSystemClick,
        handleImportSystem,
    };
};
