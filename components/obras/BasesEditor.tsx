import React, { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, X, MapPin, GripVertical, Wand2 } from 'lucide-react';
import { slugify } from '../../domain/portfolio';
import { inputCls } from './shared';

// Rodovia: bases nomeadas com dedupe tolerante a grafia. A ordem é a PRIORIDADE da
// obra (ex.: sequência de execução), não a ordem numérica do KM — por isso a
// reordenação é manual (arrastar), nunca automática.

// Formata um km fracionário na notação rodoviária "12+500" (metros arredondados).
function formatKm(km: number): string {
  const whole = Math.floor(km);
  const meters = Math.round((km - whole) * 1000);
  return `${whole}+${String(Math.max(0, meters)).padStart(3, '0')}`;
}

const SEPARATORS = /[,;\n\t]+/;

export function BasesEditor({
  bases,
  onChange,
}: {
  bases: string[];
  onChange: (bases: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ original: string; value: string } | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [kmStart, setKmStart] = useState('');
  const [kmEnd, setKmEnd] = useState('');
  const [kmStep, setKmStep] = useState('1');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Acrescenta um lote de valores, ignorando os que colidem (por grafia normalizada)
  // com os já existentes ou entre si, e avisa quantos entraram/foram ignorados.
  const addMany = (values: string[]) => {
    const incoming = values.map((v) => v.trim()).filter(Boolean);
    if (incoming.length === 0) return;

    const seenSlugs = new Set(bases.map((b) => slugify(b)));
    const toAdd: string[] = [];
    let skipped = 0;
    for (const v of incoming) {
      const slug = slugify(v);
      if (seenSlugs.has(slug)) {
        skipped++;
        continue;
      }
      seenSlugs.add(slug);
      toAdd.push(v);
    }

    if (toAdd.length > 0) onChange([...bases, ...toAdd]);

    if (skipped > 0) {
      if (toAdd.length === 0) {
        alert(
          incoming.length === 1
            ? `A base "${incoming[0]}" já está registrada (grafia equivalente).`
            : `Todas as ${skipped} bases já estavam registradas.`,
        );
      } else {
        alert(`${toAdd.length} base(s) adicionada(s). ${skipped} já existiam e foram ignoradas.`);
      }
    }
  };

  const add = () => {
    addMany([draft]);
    setDraft('');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!SEPARATORS.test(text)) return; // valor único: deixa o paste normal do input
    e.preventDefault();
    addMany(text.split(SEPARATORS));
  };

  const handleGenerate = () => {
    const start = parseFloat(kmStart.replace(',', '.'));
    const end = parseFloat(kmEnd.replace(',', '.'));
    const step = parseFloat(kmStep.replace(',', '.'));
    if (!isFinite(start) || !isFinite(end) || !isFinite(step) || step <= 0) {
      alert('Informe KM inicial, KM final e intervalo válidos (intervalo maior que zero).');
      return;
    }
    const count = Math.floor(Math.abs(end - start) / step) + 1;
    if (count > 300) {
      alert('Isso geraria mais de 300 bases. Reduza o intervalo ou aumente o passo.');
      return;
    }
    const dir = end >= start ? 1 : -1;
    const generated = Array.from({ length: count }, (_, i) => formatKm(start + dir * i * step));
    addMany(generated);
    setShowGenerator(false);
    setKmStart('');
    setKmEnd('');
    setKmStep('1');
  };

  const startEdit = (base: string) => setEditing({ original: base, value: base });

  const commitEdit = () => {
    if (!editing) return;
    const { original, value } = editing;
    const trimmed = value.trim();
    setEditing(null);
    if (!trimmed || trimmed === original) {
      if (!trimmed) onChange(bases.filter((b) => b !== original)); // esvaziar = remover
      return;
    }
    const collision = bases.some((b) => b !== original && slugify(b) === slugify(trimmed));
    if (collision) {
      alert(`Já existe uma base equivalente a "${trimmed}".`);
      return;
    }
    onChange(bases.map((b) => (b === original ? trimmed : b)));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = bases.indexOf(String(active.id));
    const newIndex = bases.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(bases, oldIndex, newIndex));
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ex: 104+000 — cole uma lista para adicionar várias de uma vez"
          className={inputCls + ' font-mono'}
        />
        <button
          type="button"
          onClick={add}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-2 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <Plus size={13} /> Adicionar
        </button>
        <button
          type="button"
          onClick={() => setShowGenerator((s) => !s)}
          title="Gerar sequência de bases por intervalo de KM"
          className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
            showGenerator
              ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-400'
              : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Wand2 size={13} /> Gerar
        </button>
      </div>

      {showGenerator && (
        <div className="mb-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 animate-in fade-in slide-in-from-top-2 duration-150">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
            Gera bases em sequência (ex.: 0+000, 20+000, 40+000...). A ordem de prioridade continua
            sendo definida arrastando os cartões abaixo.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                KM inicial
              </label>
              <input
                type="number"
                value={kmStart}
                onChange={(e) => setKmStart(e.target.value)}
                placeholder="0"
                className={inputCls + ' w-24'}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                KM final
              </label>
              <input
                type="number"
                value={kmEnd}
                onChange={(e) => setKmEnd(e.target.value)}
                placeholder="100"
                className={inputCls + ' w-24'}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                A cada (km)
              </label>
              <input
                type="number"
                value={kmStep}
                onChange={(e) => setKmStep(e.target.value)}
                placeholder="20"
                className={inputCls + ' w-24'}
              />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              className="px-3 py-2 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Gerar sequência
            </button>
          </div>
        </div>
      )}

      {bases.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={bases} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-1.5">
              {bases.map((b) => (
                <BaseChip
                  key={b}
                  value={b}
                  isEditing={editing?.original === b}
                  editValue={editing?.original === b ? editing.value : b}
                  onStartEdit={() => startEdit(b)}
                  onEditChange={(v) => setEditing({ original: b, value: v })}
                  onCommitEdit={commitEdit}
                  onCancelEdit={() => setEditing(null)}
                  onRemove={() => onChange(bases.filter((x) => x !== b))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function BaseChip({
  value,
  isEditing,
  editValue,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onRemove,
}: {
  key?: string; // sem @types/react instalado, o TS não injeta o atributo especial "key" automaticamente
  value: string;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: value,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      className="inline-flex items-center gap-0.5 pl-1 pr-1 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastar para reordenar"
        aria-label={`Reordenar ${value}`}
        className="p-0.5 rounded text-slate-300 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={12} />
      </button>
      <MapPin size={10} className="text-brand-600 dark:text-brand-400 flex-shrink-0" />
      {isEditing ? (
        <input
          autoFocus
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommitEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancelEdit();
            }
          }}
          onFocus={(e) => e.target.select()}
          className="bg-white dark:bg-slate-900 border border-brand-400 rounded px-1 py-0.5 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 outline-none w-20"
        />
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          title="Clique para editar"
          className="px-0.5 hover:text-brand-700 dark:hover:text-brand-400"
        >
          {value}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-rose-600"
        title={`Remover ${value}`}
      >
        <X size={11} />
      </button>
    </span>
  );
}
