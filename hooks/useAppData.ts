import { useState, useEffect, useRef } from 'react';
import { ProjectFile, ClientDoc, Status, RevisionReason, ProjectPhase, Period, ProjectFilterState, SupplyOrder, SupplyStatus, SiteType } from '../types';
import { subscribeToProjects, addProject, updateProjectInDb, deleteProjectFromDb, subscribeToClients, addClient, updateClientInDb, deleteClientFromDb, countLinkedRecords, subscribeToHolidays, saveHolidaysToDb, batchUpdateProjectsInDb, subscribeToSupplyOrders, addSupplyOrder, updateSupplyOrderInDb, deleteSupplyOrderFromDb, applySupplyStatusChange, patchSupplyOrderInDb, migrateLegacyPurchasesToSupply, subscribeToReferencias, subscribeToConjuntos, subscribeToPranchas, addReferenciaToDb, patchReferenciaInDb, deleteReferenciaFromDb, instanciarConjuntoInDb, instanciarLoteInDb, deleteConjuntoFromDb, patchPranchaInDb, addPranchaToDb, deletePranchaFromDb, migrateProjectsToPortfolio } from '../services/db';
import { Referencia, Conjunto, Prancha, PranchaStatus, RefStatus, canRefTransition, canPranchaTransition, instanciarConjunto, planInstanciacaoLote } from '../domain/portfolio';
import { buildStatusChangePatch } from '../components/supply/supplyUtils';
import { formatUsername } from '../services/auth';
import { subscribeToAuth } from '../services/auth';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { canTransitionTo, getExecutiveMatchKey, calculateBusinessDaysWithHolidays } from '../utils';
import { parseISO, isValid } from 'date-fns';

export interface ProjectBatchPatch { id: string; changes: Partial<ProjectFile>; }

export function useAppData(projectFilter: ProjectFilterState) {
    const [projects, setProjects] = useState<ProjectFile[]>([]);
    const [supplyOrders, setSupplyOrders] = useState<SupplyOrder[]>([]);
    const [clients, setClients] = useState<ClientDoc[]>([]);
    const [holidays, setHolidays] = useState<string[]>([]);
    const [dbConnected, setDbConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Carteira de rodovia (Referência → Conjunto → Prancha)
    const [referencias, setReferencias] = useState<Referencia[]>([]);
    const [conjuntos, setConjuntos] = useState<Conjunto[]>([]);
    const [pranchas, setPranchas] = useState<Prancha[]>([]);

    useEffect(() => {
        if (!db) {
            setDbConnected(false);
            return;
        }
        setDbConnected(true);

        const unsubProjects = subscribeToProjects(setProjects, projectFilter);
        const unsubSupply = subscribeToSupplyOrders(setSupplyOrders);
        const unsubClients = subscribeToClients(setClients);
        const unsubHolidays = subscribeToHolidays(setHolidays);
        const unsubReferencias = subscribeToReferencias(setReferencias);
        const unsubConjuntos = subscribeToConjuntos(setConjuntos);
        const unsubPranchas = subscribeToPranchas(setPranchas);
        const unsubAuth = subscribeToAuth((user) => {
            setCurrentUser(user);
        });

        return () => {
            unsubProjects();
            unsubSupply();
            unsubClients();
            unsubHolidays();
            unsubReferencias();
            unsubConjuntos();
            unsubPranchas();
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

    // --- CARTEIRA DE RODOVIA (Referência → Conjunto → Prancha) ---

    const handleAddReferencia = (ref: Omit<Referencia, 'id'>) => {
        addReferenciaToDb(ref).catch(e => alert("Erro ao criar a referência: " + (e?.message || e)));
    };

    // Recalcula os dias úteis parados com o cliente (envio→feedback) a partir do
    // estado resultante da edição. Retorna 0 quando falta alguma das duas datas.
    const recomputeBlockedDays = (sendDate?: string, sendPeriod?: Period, feedbackDate?: string, feedbackPeriod?: Period) => {
        if (!sendDate || !feedbackDate) return 0;
        const send = parseISO(sendDate);
        const feedback = parseISO(feedbackDate);
        if (isValid(send) && isValid(feedback) && feedback >= send) {
            return calculateBusinessDaysWithHolidays(send, feedback, holidays, sendPeriod || 'MANHA', feedbackPeriod || 'TARDE');
        }
        return 0;
    };

    const handleUpdateReferencia = (id: string, changes: Partial<Referencia>) => {
        const patch: Record<string, any> = { ...changes };
        // Se a edição tocou envio/feedback, mantém blockedDays coerente
        if (['sendDate', 'sendPeriod', 'feedbackDate', 'feedbackPeriod'].some(k => k in changes)) {
            const ref = referencias.find(r => r.id === id);
            const next = { ...ref, ...changes };
            patch.blockedDays = recomputeBlockedDays(next.sendDate, next.sendPeriod, next.feedbackDate, next.feedbackPeriod);
        }
        patchReferenciaInDb(id, patch).catch(e => alert("Erro ao salvar a referência: " + (e?.message || e)));
    };

    const handleDeleteReferencia = (id: string) => {
        const ref = referencias.find(r => r.id === id);
        if (!ref) return;
        const vinculados = conjuntos.filter(c => c.referenciaId === id).length;
        if (vinculados > 0) {
            alert(`A referência "${ref.codigoCliente}" possui ${vinculados} conjunto(s) instanciado(s). Exclua os conjuntos na Carteira antes.`);
            return;
        }
        if (!confirm(`Excluir a referência "${ref.codigoCliente}" do catálogo?`)) return;
        deleteReferenciaFromDb(id).catch(e => alert("Erro ao excluir a referência: " + (e?.message || e)));
    };

    // Ciclo da Referência: elaboração do preliminar (mede o tempo de execução) +
    // validação com o cliente. Independente do ciclo das pranchas.
    const handleMoveReferencia = (ref: Referencia, to: RefStatus, date: string, period: Period) => {
        if (!canRefTransition(ref.statusAprovacao, to)) {
            alert(`Transição inválida: "${ref.statusAprovacao}" não pode ir para "${to}".`);
            return;
        }
        const changes: Record<string, any> = { statusAprovacao: to };
        if (to === RefStatus.EM_ELABORACAO) {
            changes.startDate = date;
            changes.startPeriod = period;
            // Retrabalho após reprovação = nova revisão do molde, ciclo recomeça
            if (ref.statusAprovacao === RefStatus.REPROVADO) {
                changes.revisao = (ref.revisao || 0) + 1;
                changes.endDate = ''; changes.sendDate = ''; changes.feedbackDate = '';
            }
        }
        if (to === RefStatus.ELABORADO) {
            changes.endDate = date;   // fecha o tempo de execução do preliminar
            changes.endPeriod = period;
        }
        if (to === RefStatus.ENVIADO) {
            changes.sendDate = date;
            changes.sendPeriod = period;
        }
        if (to === RefStatus.APROVADO || to === RefStatus.REPROVADO) {
            changes.feedbackDate = date;
            changes.feedbackPeriod = period;
            // Dias parados aguardando o cliente — mesmo cálculo das pranchas/projetos
            if (ref.sendDate) {
                const send = parseISO(ref.sendDate);
                const feedback = parseISO(date);
                if (isValid(send) && isValid(feedback) && feedback >= send) {
                    changes.blockedDays = calculateBusinessDaysWithHolidays(send, feedback, holidays, ref.sendPeriod || 'MANHA', period);
                }
            }
        }
        patchReferenciaInDb(ref.id, changes).catch(e => alert("Erro ao mover a referência: " + (e?.message || e)));
    };

    // Instanciar: cria 1 Conjunto na base escolhida e PRÉ-GERA as pranchas do
    // gabarito. A referência não muda de estado e segue disponível para outras bases.
    const handleInstanciar = async (referencia: Referencia, base: string, codigoRodovia?: string) => {
        try {
            const { conjunto, pranchas: novas } = instanciarConjunto({
                referencia,
                base,
                codigoRodovia,
                existingConjuntos: conjuntos,
                today: new Date().toISOString().split('T')[0],
            });
            await instanciarConjuntoInDb(conjunto, novas);
            return true;
        } catch (e: any) {
            alert(e?.message || String(e));
            return false;
        }
    };

    // Instanciação em LOTE: matriz referências × bases. O planejador puro deduplica
    // bases equivalentes e pula combinações já existentes; a escrita é atômica por
    // conjunto e reporta progresso. Retorna o resumo para a UI exibir.
    const handleInstanciarLote = async (
        refs: Referencia[],
        bases: string[],
        onProgress?: (done: number, total: number) => void
    ): Promise<{ criados: number; puladas: number; semGabarito: string[]; erros: string[] } | null> => {
        try {
            const plan = planInstanciacaoLote({
                referencias: refs,
                bases,
                existingConjuntos: conjuntos,
                today: new Date().toISOString().split('T')[0],
            });
            if (plan.items.length === 0) {
                return { criados: 0, puladas: plan.puladas.length, semGabarito: plan.semGabarito, erros: [] };
            }
            const { criados, erros } = await instanciarLoteInDb(plan.items, onProgress);
            return { criados, puladas: plan.puladas.length, semGabarito: plan.semGabarito, erros };
        } catch (e: any) {
            alert("Erro na instanciação em lote: " + (e?.message || e));
            return null;
        }
    };

    const handleDeleteConjunto = (conjunto: Conjunto) => {
        const n = pranchas.filter(p => p.conjuntoId === conjunto.id).length;
        if (!confirm(`Excluir o conjunto da base "${conjunto.base}" e suas ${n} prancha(s)? Esta ação não pode ser desfeita.`)) return;
        deleteConjuntoFromDb(conjunto.id).catch(e => alert("Erro ao excluir o conjunto: " + (e?.message || e)));
    };

    // Ciclo de execução/entrega da Prancha
    const handleMovePrancha = (
        prancha: Prancha,
        to: PranchaStatus,
        date: string,
        period: Period,
        options: { reason?: RevisionReason; comment?: string } = {}
    ) => {
        if (!canPranchaTransition(prancha.status, to)) {
            alert(`Transição inválida: "${prancha.status}" não pode ir para "${to}".`);
            return;
        }
        const changes: Record<string, any> = { status: to };
        if (to === PranchaStatus.EM_ANDAMENTO) {
            changes.startDate = date;
            changes.startPeriod = period;
            // Reabertura após reprovação = revisão da prancha
            if (prancha.status === PranchaStatus.REPROVADO) {
                changes.revisao = (prancha.revisao || 0) + 1;
                changes.endDate = ''; changes.sendDate = ''; changes.feedbackDate = '';
                changes.revisions = [
                    ...(prancha.revisions || []),
                    { id: crypto.randomUUID(), date, reason: options.reason || RevisionReason.CLIENT_REQUEST, comment: options.comment || '' }
                ];
            }
        }
        if (to === PranchaStatus.CONCLUIDO) { changes.endDate = date; changes.endPeriod = period; }
        if (to === PranchaStatus.ENVIADO) { changes.sendDate = date; changes.sendPeriod = period; }
        if (to === PranchaStatus.APROVADO || to === PranchaStatus.REPROVADO) {
            changes.feedbackDate = date;
            changes.feedbackPeriod = period;
            // Dias parados aguardando o cliente — mesmo cálculo do fluxo de projetos
            if (prancha.sendDate) {
                const send = parseISO(prancha.sendDate);
                const feedback = parseISO(date);
                if (isValid(send) && isValid(feedback) && feedback >= send) {
                    changes.blockedDays = calculateBusinessDaysWithHolidays(send, feedback, holidays, prancha.sendPeriod || 'MANHA', period);
                }
            }
        }
        patchPranchaInDb(prancha.id, changes).catch(e => alert("Erro ao mover a prancha: " + (e?.message || e)));
    };

    const handleUpdatePrancha = (id: string, changes: Partial<Prancha>) => {
        const patch: Record<string, any> = { ...changes };
        if (['sendDate', 'sendPeriod', 'feedbackDate', 'feedbackPeriod'].some(k => k in changes)) {
            const prancha = pranchas.find(p => p.id === id);
            const next = { ...prancha, ...changes };
            patch.blockedDays = recomputeBlockedDays(next.sendDate, next.sendPeriod, next.feedbackDate, next.feedbackPeriod);
        }
        patchPranchaInDb(id, patch).catch(e => alert("Erro ao salvar a prancha: " + (e?.message || e)));
    };

    // Prancha extra fora do gabarito (ex.: detalhe específico de uma base)
    const handleAddPrancha = (prancha: Omit<Prancha, 'id'>) => {
        addPranchaToDb(prancha).catch(e => alert("Erro ao adicionar a prancha: " + (e?.message || e)));
    };

    const handleDeletePrancha = (prancha: Prancha) => {
        if (!confirm(`Excluir a prancha "${prancha.codigoCompleto || prancha.papel}"?`)) return;
        deletePranchaFromDb(prancha.id).catch(e => alert("Erro ao excluir a prancha: " + (e?.message || e)));
    };

    // Migração one-shot: projetos das obras de RODOVIA → Catálogo/Carteira.
    // `projects` não é alterada (vira arquivo). Idempotente — pode rodar de novo.
    const handleMigratePortfolio = async () => {
        const rodoviaClients = clients.filter(c => c.type === SiteType.HIGHWAY).map(c => c.name);
        if (rodoviaClients.length === 0) {
            alert('Nenhuma obra classificada como "Obra de Rodovia". Ajuste o tipo da obra na aba Obras antes de migrar.');
            return;
        }
        try {
            const r = await migrateProjectsToPortfolio(rodoviaClients);
            alert(`Migração concluída:\n- ${r.referencias} referências\n- ${r.conjuntos} conjuntos\n- ${r.pranchas} pranchas\n- ${r.skipped} registros já migrados (ignorados)`);
        } catch (e: any) {
            alert("Erro na migração: " + (e?.message || e));
        }
    };

    // --- SUPRIMENTOS ---

    const handleAddSupplyOrder = (order: Omit<SupplyOrder, 'id'>) => {
        addSupplyOrder(order).catch(e => alert("Erro ao criar o pedido: " + (e?.message || e)));
    };

    const handleUpdateSupplyOrder = (order: SupplyOrder) => {
        updateSupplyOrderInDb(order).catch(e => alert("Erro ao salvar o pedido: " + (e?.message || e)));
    };

    const handleDeleteSupplyOrder = (id: string) => {
        if (confirm("Confirmar exclusão do pedido? Esta ação não pode ser desfeita.")) {
            deleteSupplyOrderFromDb(id).catch(e => alert("Erro ao excluir o pedido: " + (e?.message || e)));
        }
    };

    // Movimentação de status (Kanban ou painel): monta o patch parcial
    // (status + milestones + itens quando entrega total) e anexa o evento ao histórico.
    const handleMoveSupplyStatus = (
        order: SupplyOrder,
        to: SupplyStatus,
        date: string,
        period: Period,
        options: { comment?: string; deliverAllItems?: boolean } = {}
    ) => {
        const { changes, event } = buildStatusChangePatch({
            order, to, date, period,
            user: currentUser?.email ? formatUsername(currentUser.email) : undefined,
            comment: options.comment,
            deliverAllItems: options.deliverAllItems,
        });
        applySupplyStatusChange(order.id, changes, event)
            .catch(e => alert("Erro ao mover o pedido: " + (e?.message || e)));
    };

    // Entrega parcial: alterna a entrega de um item individual
    const handleToggleSupplyItem = (orderId: string, itemId: string, delivered: boolean) => {
        const order = supplyOrders.find(o => o.id === orderId);
        if (!order) return;
        const today = new Date().toISOString().split('T')[0];
        const items = order.items.map(item => {
            if (item.id !== itemId) return item;
            const { deliveredAt, ...rest } = item;
            return delivered ? { ...rest, delivered: true, deliveredAt: today } : { ...rest, delivered: false };
        });
        patchSupplyOrderInDb(orderId, { items })
            .catch(e => alert("Erro ao atualizar o item: " + (e?.message || e)));
    };

    const handleMigrateLegacyPurchases = () =>
        migrateLegacyPurchasesToSupply(currentUser?.email ? formatUsername(currentUser.email) : '');

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

        const total = counts.projects + counts.materials + counts.purchases + counts.supplyOrders + counts.referencias + counts.conjuntos;
        if (total > 0) {
            alert(`Não é possível excluir a obra "${clientToDelete.name}".\n\nExistem registros vinculados:\n- ${counts.projects} Projetos\n- ${counts.referencias} Referências (Catálogo)\n- ${counts.conjuntos} Conjuntos (Carteira)\n- ${counts.supplyOrders} Pedidos de Suprimentos\n- ${counts.materials} Listas de Materiais (arquivo)\n- ${counts.purchases} Compras (arquivo)\n\nPor favor, exclua ou reatribua esses registros antes de remover a obra.`);
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

    const handleUpdateHolidays = (newHolidays: string[]) => saveHolidaysToDb(newHolidays);

    return {
        projects, supplyOrders, clients, holidays, dbConnected, currentUser,
        updateProject, deleteProject, addProjectRevision, promoteProjectToExecutive,
        referencias, conjuntos, pranchas,
        handleAddReferencia, handleUpdateReferencia, handleDeleteReferencia, handleMoveReferencia,
        handleInstanciar, handleInstanciarLote, handleDeleteConjunto,
        handleMovePrancha, handleUpdatePrancha, handleAddPrancha, handleDeletePrancha,
        handleMigratePortfolio,
        handleAddSupplyOrder, handleUpdateSupplyOrder, handleDeleteSupplyOrder,
        handleMoveSupplyStatus, handleToggleSupplyItem, handleMigrateLegacyPurchases,
        handleAddClient, handleUpdateClient, handleDeleteClient,
        handleBatchUpdate, handleBatchWorkflow,
        handleUpdateHolidays
    };
}
