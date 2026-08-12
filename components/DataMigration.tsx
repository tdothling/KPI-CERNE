import React, { useState } from 'react';
import { ProjectFile } from '../types';
import { getProjectBaseName, getRevisionNumber } from '../utils';

interface DataMigrationProps {
  projects: ProjectFile[];
  onUpdateProject: (p: ProjectFile) => void;
  legacyDisciplinesCount: { projects: number; referencias: number };
  onUnificarDisciplinaEstruturaCobertura: () => Promise<void>;
}

export const DataMigration: React.FC<DataMigrationProps> = ({
  projects,
  onUpdateProject,
  legacyDisciplinesCount,
  onUnificarDisciplinaEstruturaCobertura,
}) => {
  const [migrating, setMigrating] = useState(false);
  const [unificandoDisciplinas, setUnificandoDisciplinas] = useState(false);

  const handleMigrate = () => {
    if (!confirm('Tem certeza que deseja aplicar a migração de dados antigos?')) return;
    setMigrating(true);
    try {
      // Migrar projetos
      const projectGroups: Record<string, string> = {};
      projects.forEach((p) => {
        if (p.groupId !== undefined && p.revision !== undefined) return; // Ja migrado

        const baseName = getProjectBaseName(p.filename).toLowerCase();
        const key = `${p.client}|${p.discipline}|${baseName}`;

        if (!projectGroups[key]) {
          projectGroups[key] = crypto.randomUUID();
        }

        const revNum = getRevisionNumber(p.filename);
        // Nome puro sem [Rx] nem extensão nem _EXEC
        const pureName = p.filename
          .replace(/\.[^/.]+$/, '')
          .replace(/\s*\[R\d+\]$/i, '')
          .replace(/_EXEC$/i, '');

        onUpdateProject({
          ...p,
          groupId: projectGroups[key],
          revision: revNum,
          filename: pureName,
        });
      });

      alert(
        'Migração concluída com sucesso! Os arquivos antigos agora possuem um rastreamento de revisão robusto.',
      );
    } catch (error) {
      console.error(error);
      alert('Erro na migração. Verifique o console.');
    } finally {
      setMigrating(false);
    }
  };

  const needsMigration = projects.some((p) => p.groupId === undefined || p.revision === undefined);

  const totalLegacyDisciplinas = legacyDisciplinesCount.projects + legacyDisciplinesCount.referencias;

  const handleUnificarDisciplinas = async () => {
    if (
      !confirm(
        `Isso vai atualizar ${legacyDisciplinesCount.projects} projeto(s) e ${legacyDisciplinesCount.referencias} referência(s) do catálogo, trocando a disciplina "Estrutura" ou "Cobertura" por "Estrutura/Cobertura". Não pode ser desfeito automaticamente. Continuar?`,
      )
    )
      return;
    setUnificandoDisciplinas(true);
    try {
      await onUnificarDisciplinaEstruturaCobertura();
    } finally {
      setUnificandoDisciplinas(false);
    }
  };

  if (!needsMigration && totalLegacyDisciplinas === 0) return null;

  return (
    <>
      {needsMigration && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl my-4 animate-in fade-in">
          <h3 className="font-bold text-orange-800 mb-2">
            Migração de Dados Pendente (Apenas Admin)
          </h3>
          <p className="text-sm text-orange-700 mb-4">
            Foi detectado que você possui arquivos antigos que ainda utilizam o modelo antigo de
            rastreamento de revisões usando '[R]'. Clique no botão abaixo para converte-los para o
            novo formato robusto universal.
          </p>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors"
          >
            {migrating ? 'Migrando...' : 'Migrar Documentos para Novo Formato'}
          </button>
        </div>
      )}

      {totalLegacyDisciplinas > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl my-4 animate-in fade-in">
          <h3 className="font-bold text-orange-800 mb-2">
            Unificar disciplinas Estrutura/Cobertura (Apenas Admin)
          </h3>
          <p className="text-sm text-orange-700 mb-4">
            "Estrutura" e "Cobertura" viraram uma única disciplina, "Estrutura/Cobertura". Foram
            encontrados {legacyDisciplinesCount.projects} projeto(s) no Canteiro e{' '}
            {legacyDisciplinesCount.referencias} referência(s) no Catálogo ainda com o valor antigo.
            Clique para atualizá-los — nenhum outro dado é alterado.
          </p>
          <button
            onClick={handleUnificarDisciplinas}
            disabled={unificandoDisciplinas}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors"
          >
            {unificandoDisciplinas ? 'Unificando...' : `Unificar ${totalLegacyDisciplinas} documento(s)`}
          </button>
        </div>
      )}
    </>
  );
};
