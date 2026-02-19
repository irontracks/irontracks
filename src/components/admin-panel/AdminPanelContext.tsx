import { createContext, useContext } from 'react';
import { useAdminPanelController } from './useAdminPanelController';

type AdminPanelContextType = ReturnType<typeof useAdminPanelController>;

const AdminPanelContext = createContext<AdminPanelContextType | null>(null);

export const useAdminPanel = () => {
  const ctx = useContext(AdminPanelContext);
  if (!ctx) throw new Error('useAdminPanel must be used within AdminPanelProvider');
  return ctx;
};

export const AdminPanelProvider = AdminPanelContext.Provider;
