import React, { useMemo, useState } from 'react';
import { HardHat, MapPin, ArrowLeftRight } from 'lucide-react';

// --- Navegação por obra ("gate") — usada nas abas Projetos, Catálogo e Carteira ---
//
// Antes da lista aparece uma tela de cards (uma obra por card, com resumo). A
// escolha fica salva no navegador via storageKey: visitas seguintes entram direto
// na obra; "Trocar Obra" volta aos cards. Com uma única obra, a seleção é automática.
// Catálogo e Carteira COMPARTILHAM a mesma chave (mesmo fluxo de rodovia): trocar
// a obra em uma aba reflete na outra. A aba Projetos tem chave própria.

export function useObraAtiva(storageKey: string, obraNames: string[], legacyKeys: string[] = []) {
    const [salva, setSalva] = useState<string | null>(() => {
        try {
            return localStorage.getItem(storageKey)
                ?? legacyKeys.map(k => localStorage.getItem(k)).find(v => v != null)
                ?? null;
        } catch { return null; }
    });

    const obraAtiva = useMemo(() => {
        if (salva && obraNames.includes(salva)) return salva;
        if (obraNames.length === 1) return obraNames[0];
        return null;
    }, [salva, obraNames]);

    const selecionarObra = (name: string) => {
        setSalva(name);
        try { localStorage.setItem(storageKey, name); } catch { /* modo privado */ }
    };
    const trocarObra = () => {
        setSalva(null);
        try { localStorage.removeItem(storageKey); } catch { /* modo privado */ }
    };

    return { obraAtiva, selecionarObra, trocarObra };
}

// Estatística exibida no card. value '' = linha de texto puro (ex.: dica em itálico).
export interface ObraCardStat {
    label: string;
    value: number | string;
    tone?: string; // classes extras (cor/itálico/col-span-2)
}

export function ObraSelectScreen({ obras, subtitle, statsOf, onSelect, emptyTitle, emptyHint }: {
    obras: { id: string; name: string }[];
    subtitle: string;
    statsOf: (name: string) => ObraCardStat[];
    onSelect: (name: string) => void;
    emptyTitle: string;
    emptyHint: string;
}) {
    return (
        <div className="space-y-4">
            <div className="text-center pt-8 pb-2">
                <HardHat className="mx-auto text-brand-600 dark:text-brand-400 mb-3" size={32} />
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Selecione a Obra</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>
            </div>

            {obras.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                    <MapPin className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{emptyTitle}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{emptyHint}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
                    {obras.map(o => (
                        <button
                            key={o.id}
                            onClick={() => onSelect(o.name)}
                            className="text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all active:scale-[0.99] group"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center group-hover:bg-brand-100 dark:group-hover:bg-brand-900/50 transition-colors">
                                    <HardHat size={18} />
                                </span>
                                <span className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight">{o.name}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {statsOf(o.name).map((s, i) => (
                                    <span key={i} className={s.tone || ''}>
                                        {s.value !== '' && <><strong className={s.tone ? '' : 'text-slate-700 dark:text-slate-200'}>{s.value}</strong>{' '}</>}
                                        {s.label}
                                    </span>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ObraAtivaBar({ obra, canTrocar, onTrocar }: {
    obra: string;
    canTrocar: boolean;
    onTrocar: () => void;
}) {
    return (
        <div className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <HardHat size={16} className="text-brand-600 dark:text-brand-400" /> {obra}
            </span>
            {canTrocar && (
                <button
                    onClick={onTrocar}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 border border-slate-200 dark:border-slate-600 hover:border-brand-300 rounded-lg px-2.5 py-1.5 transition-colors"
                    title="Voltar para a seleção de obras"
                >
                    <ArrowLeftRight size={13} /> Trocar Obra
                </button>
            )}
        </div>
    );
}
