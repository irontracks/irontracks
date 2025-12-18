import React from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';

const NotificationToast = ({ notification, onClose }) => {
    if (!notification) return null;
    return (
        <div onClick={onClose} className="fixed top-4 left-4 right-4 z-[2000] bg-neutral-800 border-l-4 border-yellow-500 rounded-r-lg shadow-2xl p-4 flex items-center gap-3 animate-slide-down cursor-pointer">
            {notification.photoURL ? <Image src={notification.photoURL} width={40} height={40} className="w-10 h-10 rounded-full border border-neutral-600 object-cover" alt="Notif" /> : <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center font-bold">{notification.displayName?.[0] || 'S'}</div>}
            <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-yellow-500">{notification.senderName || 'Aviso do Sistema'}</p>
                <p className="text-sm text-white break-words">{notification.text}</p>
            </div>
            <button className="text-neutral-400"><X size={16}/></button>
        </div>
    );
};

export default NotificationToast;
