import { useState, useEffect } from 'react';
import { ProjectFile, MaterialDoc, PurchaseDoc, ClientDoc, Status, RevisionReason, ProjectPhase, Period, ProjectFilterState } from '../types';
import { subscribeToProjects, addProject, updateProjectInDb, deleteProjectFromDb, subscribeToMaterials, addMaterial, updateMaterialInDb, deleteMaterialFromDb, subscribeToPurchases, addPurchase, updatePurchaseInDb, deletePurchaseFromDb, subscribeToClients, addClient, updateClientInDb, deleteClientFromDb, subscribeToHolidays, saveHolidaysToDb } from '../services/db';
import { subscribeToAuth } from '../services/auth';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { generateRevisionFilename, canTransitionTo } from '../utils';

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
            filename: generateRevisionFilename(originalProject.filename),
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

        if (!confirm(`Deseja gerar a versão EXECUTIVA a partir de "${original.filename}"? \n\nIsso criará um novo registro limpo, mantendo o histórico da fase Preliminar.`)) {
            return;
        }

        const newStartDate = new Date().toISOString().split('T')[0];
        const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';

        let newFilename = original.filename;
        if (!newFilename.toLowerCase().includes('exec') && !newFilename.toLowerCase().includes('rev')) {
            const parts = newFilename.split('.');
            if (parts.length > 1) {
                const ext = parts.pop();
                newFilename = `${parts.join('.')}_EXEC.${ext}`;
            } else {
                newFilename = `${newFilename}_EXEC`;
            }
        }

        addProject({
            filename: newFilename,
            client: original.client,
            base: original.base,
            discipline: original.discipline,
            phase: ProjectPhase.EXECUTIVE,
            status: Status.IN_PROGRESS,
            startDate: newStartDate,
            startPeriod: currentPeriod,
            endDate: '', sendDate: '', feedbackDate: '', blockedDays: 0, revisions: []
        });
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
            filename: generateRevisionFilename(original.filename),
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

    const handleDeleteClient = (id: string) => {
        const clientToDelete = clients.find(c => c.id === id);
        if (!clientToDelete) return;

        const associatedProjects = projects.filter(p => p.client === clientToDelete.name).length;
        const associatedMaterials = materials.filter(m => m.client === clientToDelete.name).length;
        const associatedPurchases = purchases.filter(p => p.client === clientToDelete.name).length;

        if (associatedProjects > 0 || associatedMaterials > 0 || associatedPurchases > 0) {
            alert(`Não é possível excluir o cliente "${clientToDelete.name}".\n\nExistem registros vinculados:\n- ${associatedProjects} Projetos\n- ${associatedMaterials} Listas de Materiais\n- ${associatedPurchases} Compras\n\nPor favor, exclua ou reatribua esses registros antes de remover o cliente.`);
            return;
        }

        if (confirm(`Tem certeza que deseja excluir o cliente "${clientToDelete.name}"?`)) {
            deleteClientFromDb(id);
        }
    };

    const handleBatchUpdate = (ids: string[], field: keyof ProjectFile, value: any) => {
        ids.forEach(id => {
            const project = projects.find(p => p.id === id);
            if (project) {
                updateProjectInDb({ ...project, [field]: value });
            }
        });
    };

    const handleBatchWorkflow = (ids: string[], action: 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT', date: string) => {
        let skipped = 0;
        ids.forEach(id => {
            const project = projects.find(p => p.id === id);
            if (!project) return;
            // M2: Validar se a transição é permitida a partir do status atual
            if (!canTransitionTo(project.status, action)) {
                skipped++;
                return;
            }
            const updatedProject = { ...project };
            if (action === 'COMPLETE') { updatedProject.status = Status.DONE; updatedProject.endDate = date; }
            if (action === 'SEND') { updatedProject.status = Status.WAITING_APPROVAL; updatedProject.sendDate = date; }
            if (action === 'APPROVE') { updatedProject.status = Status.APPROVED; updatedProject.feedbackDate = date; }
            if (action === 'REJECT') { updatedProject.status = Status.REJECTED; updatedProject.feedbackDate = date; }
            updateProjectInDb(updatedProject);
        });
        if (skipped > 0) {
            alert(`${skipped} arquivo(s) foram ignorados porque não estavam no status correto para a ação "${action}".`);
        }
    };

    const handleMaterialBatchUpdate = (ids: string[], field: keyof MaterialDoc, value: any) => {
        ids.forEach(id => {
            const material = materials.find(m => m.id === id);
            if (material) {
                updateMaterialInDb({ ...material, [field]: value });
            }
        });
    };

    const handleMaterialBatchWorkflow = (ids: string[], action: 'COMPLETE', date: string) => {
        ids.forEach(id => {
            const material = materials.find(m => m.id === id);
            if (!material) return;

            let updatedMaterial = { ...material };
            if (action === 'COMPLETE') {
                updatedMaterial.status = 'DONE';
                updatedMaterial.endDate = date;
                updateMaterialInDb(updatedMaterial);
            }
        });
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
