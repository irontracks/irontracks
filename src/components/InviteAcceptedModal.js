import React from 'react';
import { Users } from 'lucide-react';
import Image from 'next/image';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';

export default function InviteAcceptedModal() {
  const { acceptedInviteNotice, dismissAcceptedInvite } = useTeamWorkout();

  const notice = acceptedInviteNotice && typeof acceptedInviteNotice === 'object' ? acceptedInviteNotice : null;
  const displayName = String(notice?.user?.displayName || '').trim() || 'Seu parceiro';
  const photoURL = notice?.user?.photoURL ? String(notice.user.photoURL) : '';

  if (!notice) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
      <div className="bg-neutral-800 p-6 rounded-3xl border border-yellow-500 shadow-2xl max-w-sm w-full text-center">
        <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4">
          {photoURL ? (
            <div className="relative w-20 h-20 rounded-full overflow-hidden">
              <Image src={photoURL} alt={displayName} fill className="object-cover" />
            </div>
          ) : (
            <Users size={32} className="text-black" />
          )}
        </div>
        <h3 className="text-2xl font-black text-white mb-2">Convite aceito!</h3>
        <p className="text-neutral-300 mb-6">
          <span className="text-yellow-500 font-bold">{displayName}</span> aceitou seu convite para treinar junto.
        </p>
        <button
          type="button"
          onClick={dismissAcceptedInvite}
          className="w-full py-3 rounded-xl bg-yellow-500 text-black font-bold shadow-lg shadow-yellow-900/20 hover:bg-yellow-400 transition-colors"
        >
          Show!
        </button>
      </div>
    </div>
  );
}

