import { useState, useEffect, useRef } from 'react';
import { ProjectFile, MaterialDoc, PurchaseDoc, ClientDoc, Status, RevisionReason, ProjectPhase, Period, ProjectFilterState } from '../types';
import { subscribeToProjects, addProject, updateProjectInDb, deleteProjectFromDb, subscribeToMaterials, addMaterial, updateMaterialInDb, deleteMaterialFromDb, subscribeToPurchases, addPurchase, updatePurchaseInDb, deletePurchaseFromDb, subscribeToClients, addClient, updateClientInDb, deleteClientFromDb, countLinkedRecords, subscribeToHolidays, saveHolidaysToDb, batchUpdateProjectsInDb, batchUpdateMaterialsInDb } from '../services/db';
import { subscribeToAuth } from '../services/auth';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { canTransitionTo, getExecutiveMatchKey, calculateBusinessDaysWithHolidays } from '../utils';
import { parseISO, isValid } from 'date-fns';

export interface ProjectBatchPatch { id: string; changes: Partial<ProjectFile>; }
export interface MaterialBatchPatch { id: string; changes: Partial<MaterialDoc>; }

export function useAppData(projectFilter: ProjectFilterState) {
    const [projects, setProjects] = useState<ProjectFile[]>([]);
    const [materials, setMaterials] = useState<MaterialDoc[]>([]);
    const [purchases, setPurchases] = useState<PurchaseDoc[]>([]);
    const [clients, setClients] = useState<ClientDoc[]>([]);
    const [holidays, setHolidays] = useState<string[]>([]);
    const [dbConnected, setDbConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    useEffect(() => {
        if (!db) {
            setDbConnected(false);
            return;
        }
        setDbConnected(true);

        const unsubProjects = subscribeToProjects(setProjects, projectFilter);
        const unsubMaterials = subscribeToMaterials(setMaterials, projectFilter);

        const unsubPurchases = subscribeToPurchases(setPurchases);
        const unsubClients = subscribeToClients(setClients);
        const unsubHolidays = subscribeToHolidays(setHolidays);
        const unsubAuth = subscribeToAuth((user) => {
            setCurrentUser(user);
        });

        return () => {
            unsubProjects();
            unsubMaterials();
            unsubPurchases();
            unsubClients();
            unsubHolidays();
            unsubAuth();
        };
    }, [projectFilter]);

    // Padronização do ciclo: se o Executivo foi criado antes de o Preliminar ser
    // enviado ao cliente (via promoção ou importação), o envio torna-se
    // desnecessário e o Preliminar é finalizado como 'Executivo Gerado'.
    // Também regulariza registros antigos já existentes no banco.
    const supersededSynced = useRef<Set<string>>(new Set());
    useEffect(() => {
        const executiveKeys = new Set(
            projects.filter(p => p.phase === ProjectPhase.EXECUTIVE).map(getExecutiveMatchKey)
        );
        if (executiveKeys.size === 0) return;
        projects.forEach(p => {
            const phase = p.phase || ProjectPhase.PRELIMINARY;
            if (phase !== ProjectPhase.PRELIMINARY) return;
            if (p.status !== Status.DONE || p.sendDate) return;
            if (!executiveKeys.has(getExecutiveMatchKey(p))) return;
            if (supersededSynced.current.has(p.id)) return;
            supersededSynced.current.add(p.id);
            updateProjectInDb({ ...p, status: Status.SUPERSEDED });
        });
    }, [projects]);

    const updateProject = (updated: ProjectFile) => updateProjectInDb(updated);
    const deleteProject = (id: string) => { deleteProjectFromDb(id); };

    const addProjectRevision = (id: string, reason: RevisionReason, comment: string) => {
        const originalProject = projects.find(p => p.id === id);
        if (!originalProject) return;
        updateProjectInDb({ ...originalProject, status: Status.REVISED });
        const { id: _, ...projectData } = originalProject;

        const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';

        addProject({
            ...projectData,
            filename: originalProject.filename,
            groupId: originalProject.groupId || crypto.randomUUID(),
            revision: (originalProject.revision || 0) + 1,
            status: Status.IN_PROGRESS,
            startDate: new Date().toISOString().split('T')[0],
            startPeriod: currentPeriod,
            endDate: '', sendDate: '', feedbackDate: '', blockedDays: 0,
            revisions: [{ id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], reason, comment }]
        });
    };

    const promoteProjectToExecutive = (id: string) => {
        const original = projects.find(p => p.id === id);
        if (!original) return;

        const closesPreliminary = !original.sendDate;
        const extraInfo = closesPreliminary
            ? '\n\nComo o Preliminar ainda não foi enviado ao cliente, seu ciclo será encerrado como "Executivo Gerado" (envio desnecessário).'
            : '';
        if (!confirm(`Deseja gerar a versão EXECUTIVA a partir de "${original.filename}"? \n\nIsso criará um novo registro limpo, mantendo o histórico da fase Preliminar.${extraInfo}`)) {
            return;
        }

        const newStartDate = new Date().toISOString().split('T')[0];
        const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';

        addProject({
            filename: original.filename,
            groupId: original.groupId || crypto.randomUUID(),
            revision: 0,
            client: original.client,
            base: original.base,
            discipline: original.discipline,
            phase: ProjectPhase.EXECUTIVE,
            status: Status.IN_PROGRESS,
            startDate: newStartDate,
            startPeriod: currentPeriod,
            endDate: '', sendDate: '', feedbackDate: '', blockedDays: 0, revisions: []
        });

        if (closesPreliminary) {
            updateProjectInDb({ ...original, status: Status.SUPERSEDED });
        }
    };

    const updateMaterial = (updated: MaterialDoc) => updateMaterialInDb(updated);
    const deleteMaterial = (id: string) => { console.log('HOOK: Chamando deleteMaterial com ID:', id); deleteMaterialFromDb(id); };
    const addMaterialRevision = (id: string, reason: RevisionReason, comment: string) => {
        const original = materials.find(m => m.id === id);
        if (!original) return;
        updateMaterialInDb({ ...original, status: 'REVISED' });
        const { id: _, ...materialData } = original;

        const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';

        addMaterial({
            ...materialData,
            filename: original.filename,
            groupId: original.groupId || crypto.randomUUID(),
            revision: (original.revision || 0) + 1,
            status: 'IN_PROGRESS',
            startDate: new Date().toISOString().split('T')[0], endDate: '',
            startPeriod: currentPeriod,
            revisions: [{ id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], reason: reason.toString(), comment }]
        });
    };

    const handleAddPurchase = (purchase: Omit<PurchaseDoc, 'id'>) => addPurchase(purchase);
    const handleUpdatePurchase = (updated: PurchaseDoc) => updatePurchaseInDb(updated);
    const handleDeletePurchase = (id: string) => {
        console.log('HOOK: Chamando handleDeletePurchase com ID:', id);
        if (confirm("Confirmar exclusão?")) deletePurchaseFromDb(id);
    };

    const handleAddClient = (client: Omit<ClientDoc, 'id'>) => addClient(client);
    const handleUpdateClient = (client: ClientDoc) => updateClientInDb(client);

    const handleDeleteClient = async (id: string) => {
        const clientToDelete = clients.find(c => c.id === id);
        if (!clientToDelete) return;

        // Conta os vínculos DIRETO no banco. O cache local `projects/materials/purchases`
        // vem limitado a 1000 docs e pode estar filtrado pelo servidor, o que fazia a
        // contagem dar 0 e permitir apagar o cadastro deixando registros órfãos com o nome antigo.
        let counts;
        try {
            counts = await countLinkedRecords(clientToDelete.name);
        } catch (e) {
            console.error("Erro ao verificar registros vinculados:", e);
            alert("Não foi possível verificar os registros vinculados a esta obra. Tente novamente.");
            return;
        }

        const total = counts.projects + counts.materials + counts.purchases;
        if (total > 0) {
            alert(`Não é possível excluir a obra "${clientToDelete.name}".\n\nExistem registros vinculados:\n- ${counts.projects} Projetos\n- ${counts.materials} Listas de Materiais\n- ${counts.purchases} Compras\n\nPor favor, exclua ou reatribua esses registros antes de remover a obra.`);
            return;
        }

        if (confirm(`Tem certeza que deseja excluir a obra "${clientToDelete.name}"?`)) {
            deleteClientFromDb(id);
        }
    };

    // Edição em lote: recebe patches prontos (todas as mudanças de cada documento juntas)
    // e grava tudo em uma única operação atômica por documento via writeBatch.
    const handleBatchUpdate = async (patches: ProjectBatchPatch[]) => {
        if (patches.length === 0) return;
        try {
            await batchUpdateProjectsInDb(patches);
        } catch (e) {
            console.error("Erro na edição em lote de projetos:", e);
            alert("Erro ao aplicar a edição em lote. Nenhuma alteração parcial foi mantida — verifique sua conexão e tente novamente.");
        }
    };

    const handleBatchWorkflow = async (ids: string[], action: 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT', date: string, period: Period = 'TARDE') => {
        let skipped = 0;
        const patches: ProjectBatchPatch[] = [];
        ids.forEach(id => {
            const project = projects.find(p => p.id === id);
            if (!project) return;
            // M2: Validar se a transição é permitida a partir do status atual
            if (!canTransitionTo(project.status, action)) {
                skipped++;
                return;
            }
            const changes: Partial<ProjectFile> = {};
            if (action === 'COMPLETE') { changes.status = Status.DONE; changes.endDate = date; changes.endPeriod = period; }
            if (action === 'SEND') { changes.status = Status.WAITING_APPROVAL; changes.sendDate = date; changes.sendPeriod = period; }
            if (action === 'APPROVE' || action === 'REJECT') {
                changes.status = action === 'APPROVE' ? Status.APPROVED : Status.REJECTED;
                changes.feedbackDate = date;
                changes.feedbackPeriod = period;
                // Mesmo cálculo da edição individual: dias parados aguardando o cliente
                if (project.sendDate) {
                    const send = parseISO(project.sendDate);
                    const feedback = parseISO(date);
                    if (isValid(send) && isValid(feedback) && feedback >= send) {
                        changes.blockedDays = calculateBusinessDaysWithHolidays(send, feedback, holidays, project.sendPeriod || 'MANHA', period);
                    }
                }
            }
            patches.push({ id, changes });
        });
        try {
            await batchUpdateProjectsInDb(patches);
        } catch (e) {
            console.error("Erro na ação de fluxo em lote:", e);
            alert("Erro ao executar a ação em lote. Verifique sua conexão e tente novamente.");
            return;
        }
        if (skipped > 0) {
            alert(`${skipped} arquivo(s) foram ignorados porque não estavam no status correto para a ação "${action}".`);
        }
    };

    const handleMaterialBatchUpdate = async (patches: MaterialBatchPatch[]) => {
        if (patches.length === 0) return;
        try {
            await batchUpdateMaterialsInDb(patches);
        } catch (e) {
            console.error("Erro na edição em lote de materiais:", e);
            alert("Erro ao aplicar a edição em lote. Nenhuma alteração parcial foi mantida — verifique sua conexão e tente novamente.");
        }
    };

    const handleMaterialBatchWorkflow = async (ids: string[], action: 'COMPLETE', date: string, period: Period = 'TARDE') => {
        const patches: MaterialBatchPatch[] = [];
        ids.forEach(id => {
            const material = materials.find(m => m.id === id);
            if (!material) return;
            if (action === 'COMPLETE') {
                patches.push({ id, changes: { status: 'DONE', endDate: date, endPeriod: period } });
            }
        });
        try {
            await batchUpdateMaterialsInDb(patches);
        } catch (e) {
            console.error("Erro na conclusão em lote de materiais:", e);
            alert("Erro ao executar a ação em lote. Verifique sua conexão e tente novamente.");
        }
    };

    const handleUpdateHolidays = (newHolidays: string[]) => saveHolidaysToDb(newHolidays);

    return {
        projects, materials, purchases, clients, holidays, dbConnected, currentUser,
        updateProject, deleteProject, addProjectRevision, promoteProjectToExecutive,
        updateMaterial, deleteMaterial, addMaterialRevision,
        handleAddPurchase, handleUpdatePurchase, handleDeletePurchase,
        handleAddClient, handleUpdateClient, handleDeleteClient,
        handleBatchUpdate, handleBatchWorkflow,
        handleMaterialBatchUpdate, handleMaterialBatchWorkflow,
        handleUpdateHolidays
    };
}
