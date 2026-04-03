import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AccountPageShell({
  title,
  subtitle,
  backTo = '/wallet',
  actions,
  children,
}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#042346] px-4 pb-12 pt-24 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate(backTo)}
              className="mt-1 rounded-full border border-white/10 bg-white/5 p-2.5 transition-colors hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5 text-yellow-400" />
            </button>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-400">Account</p>
              <h1 className="mt-2 text-3xl font-black">{title}</h1>
              {subtitle ? <p className="mt-2 max-w-2xl text-slate-300">{subtitle}</p> : null}
            </div>
          </div>

          {actions ? <div className="hidden md:block">{actions}</div> : null}
        </div>

        {actions ? <div className="mb-4 md:hidden">{actions}</div> : null}
        {children}
      </div>
    </div>
  );
}
