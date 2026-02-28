import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingScreen = () => (
    <div className="fixed inset-0 z-50 bg-neutral-900 flex flex-col items-center justify-center pt-safe pb-safe">
        <Loader2 size={48} className="text-yellow-500 animate-spin mb-4"/>
        <h2 className="text-white font-black text-xl italic tracking-tighter">IRON<span className="text-neutral-500">TRACKS</span></h2>
    </div>
);

export default LoadingScreen;
