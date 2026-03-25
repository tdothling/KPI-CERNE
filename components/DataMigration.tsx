import React, { useState } from 'react';
import { ProjectFile, MaterialDoc } from '../types';
import { getProjectBaseName, getRevisionNumber } from '../utils';

interface DataMigrationProps {
    projects: ProjectFile[];
    materials: MaterialDoc[];
    onUpdateProject: (p: ProjectFile) => void;
    onUpdateMaterial: (m: MaterialDoc) => void;
}

export const DataMigration: React.FC<DataMigrationProps> = ({ projects, materials, onUpdateProject, onUpdateMaterial }) => {
    const [migrating, setMigrating] = useState(false);

    const handleMigrate = () => {
        if (!confirm("Tem certeza que deseja aplicar a migração de dados antigos?")) return;
        setMigrating(true);
        try {
            // Migrar projetos
            const projectGroups: Record<string, string> = {};
            projects.forEach(p => {
                if (p.groupId !== undefined && p.revision !== undefined) return; // Ja migrado

                const baseName = getProjectBaseName(p.filename).toLowerCase();
                const key = `${p.client}|${p.discipline}|${baseName}`;

                if (!projectGroups[key]) {
                    projectGroups[key] = crypto.randomUUID();
                }

                const revNum = getRevisionNumber(p.filename);
                // Nome puro sem [Rx] nem extensão nem _EXEC
                const pureName = p.filename.replace(/\.[^/.]+$/, "").replace(/\s*\[R\d+\]$/i, "").replace(/_EXEC$/i, "");

                onUpdateProject({
                    ...p,
                    groupId: projectGroups[key],
                    revision: revNum,
                    filename: pureName
                });
            });

            // Migrar materiais
            const materialGroups: Record<string, string> = {};
            materials.forEach(m => {
                if (m.groupId !== undefined && m.revision !== undefined) return;

                const baseName = getProjectBaseName(m.filename).toLowerCase();
                const key = `${m.client}|${m.discipline}|${baseName}`;

                if (!materialGroups[key]) {
                    materialGroups[key] = crypto.randomUUID();
                }

                const revNum = getRevisionNumber(m.filename);
                const pureName = m.filename.replace(/\.[^/.]+$/, "").replace(/\s*\[R\d+\]$/i, "").replace(/_EXEC$/i, "");

                onUpdateMaterial({
                    ...m,
                    groupId: materialGroups[key],
                    revision: revNum,
                    filename: pureName
                });
            });

            alert("Migração concluída com sucesso! Os arquivos antigos agora possuem um rastreamento de revisão robusto.");
        } catch (error) {
            console.error(error);
            alert("Erro na migração. Verifique o console.");
        } finally {
            setMigrating(false);
        }
    };

    const needsMigration = projects.some(p => p.groupId === undefined || p.revision === undefined) || 
                           materials.some(m => m.groupId === undefined || m.revision === undefined);

    if (!needsMigration) return null;

    return (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl my-4 animate-in fade-in">
            <h3 className="font-bold text-orange-800 mb-2">Migração de Dados Pendente (Apenas Admin)</h3>
            <p className="text-sm text-orange-700 mb-4">Foi detectado que você possui arquivos antigos que ainda utilizam o modelo antigo de rastreamento de revisões usando '[R]'. Clique no botão abaixo para converte-los para o novo formato robusto universal.</p>
            <button 
                onClick={handleMigrate}
                disabled={migrating}
                className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors"
            >
                {migrating ? 'Migrando...' : 'Migrar Documentos para Novo Formato'}
            </button>
        </div>
    );
};
