import React from 'react';

type Props = {
    onFinish: () => void;
    finishing: boolean;
};

export const WorkoutFooter: React.FC<Props> = ({ onFinish, finishing }) => {
    return (
        <div className="p-4 md:px-6 pb-safe safe-area-bottom mt-auto">
            <button
                onClick={onFinish}
                disabled={finishing}
                className="w-full py-4 rounded-xl bg-yellow-500 text-black font-black uppercase tracking-widest hover:bg-yellow-400 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/20"
            >
                {finishing ? 'Finalizando...' : 'Finalizar Treino'}
            </button>
        </div>
    );
};
