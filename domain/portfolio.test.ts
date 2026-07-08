import { describe, it, expect } from 'vitest';
import {
    RefStatus, PranchaStatus, Referencia, GabaritoItem,
    instanciarConjunto, conjuntoIdFor, rollupConjunto,
    canRefTransition, canPranchaTransition,
    inferRefStatusFromDates, inferPranchaStatusFromDates,
    planInstanciacaoLote,
    catalogoKpis, carteiraKpis, conjuntosKpis,
    planPortfolioMigration, inferPapel, execMoldeKey, buildCodigoCompleto,
} from './portfolio';
import { Discipline, ProjectFile, ProjectPhase, Status } from '../types';

// --- Fixtures ---

const gabaritoBSO: GabaritoItem[] = [
    { id: 'g1', papel: 'Folha 101', sufixoCodigo: 'DE-P1-101' },
    { id: 'g2', papel: 'Folha 102', sufixoCodigo: 'DE-P1-102' },
    { id: 'g3', papel: 'Folha 103', sufixoCodigo: 'DE-P1-103' },
    { id: 'g4', papel: 'Folha 104', sufixoCodigo: 'DE-P1-104' },
    { id: 'g5', papel: 'Folha 105', sufixoCodigo: 'DE-P1-105' },
    { id: 'g6', papel: 'Folha 106', sufixoCodigo: 'DE-P1-106' },
    { id: 'g7', papel: 'Memorial Descritivo', sufixoCodigo: 'MD' },
];

const refBSO: Referencia = {
    id: 'ref-bso',
    codigoCliente: 'BSO-CONSTRUCAP-ARQ-R00',
    client: 'Construcap 040RJ',
    discipline: Discipline.ARCHITECTURE,
    revisao: 0,
    statusAprovacao: RefStatus.RASCUNHO, // instanciar NÃO exige aprovação
    gabarito: gabaritoBSO,
};

const makeProject = (over: Partial<ProjectFile>): ProjectFile => ({
    id: over.id || crypto.randomUUID(),
    filename: 'ARQUIVO',
    client: 'Construcap 040RJ',
    base: 'Geral',
    discipline: Discipline.ARCHITECTURE,
    status: Status.IN_PROGRESS,
    startDate: '2026-01-05',
    endDate: '', sendDate: '', feedbackDate: '',
    blockedDays: 0, revisions: [],
    ...over,
});

// --- (a) Instanciar gera exatamente as pranchas do gabarito ---

describe('instanciarConjunto', () => {
    it('pré-gera exatamente uma prancha por item do gabarito, todas em A Fazer', () => {
        const { conjunto, pranchas } = instanciarConjunto({
            referencia: refBSO,
            base: '104+000',
            codigoRodovia: 'ELO-040RJ-104+000-BSO-EXE',
            existingConjuntos: [],
            today: '2026-07-08',
        });

        expect(pranchas).toHaveLength(refBSO.gabarito.length); // 7 = 6 folhas + MD
        expect(pranchas.map(p => p.papel)).toEqual(refBSO.gabarito.map(g => g.papel));
        expect(pranchas.every(p => p.status === PranchaStatus.A_FAZER)).toBe(true);
        expect(pranchas.every(p => p.conjuntoId === conjunto.id)).toBe(true);

        // Codificação: prefixo manual + sufixo do gabarito (editável depois)
        expect(pranchas[0].codigoCompleto).toBe('ELO-040RJ-104+000-BSO-EXE-DE-P1-101');
        expect(pranchas[6].codigoCompleto).toBe('ELO-040RJ-104+000-BSO-EXE-MD');

        expect(conjunto.referenciaId).toBe(refBSO.id);
        expect(conjunto.base).toBe('104+000');
    });

    it('não exige referência aprovada (processo pode seguir sem aprovação)', () => {
        expect(refBSO.statusAprovacao).toBe(RefStatus.RASCUNHO);
        expect(() => instanciarConjunto({
            referencia: refBSO, base: '090+500', existingConjuntos: [], today: '2026-07-08',
        })).not.toThrow();
    });

    it('sem prefixo de rodovia, o código fica só com o sufixo do gabarito (preenchimento manual)', () => {
        expect(buildCodigoCompleto(undefined, gabaritoBSO[0])).toBe('DE-P1-101');
        expect(buildCodigoCompleto('', { id: 'x', papel: 'Folha 01' })).toBe('');
    });

    it('recusa referência sem gabarito', () => {
        expect(() => instanciarConjunto({
            referencia: { ...refBSO, gabarito: [] }, base: '104+000', existingConjuntos: [], today: '2026-07-08',
        })).toThrow(/gabarito/i);
    });
});

// --- (b) Rollup do Conjunto reflete o status das pranchas ---

describe('rollupConjunto', () => {
    it('deriva o progresso (nada é gravado no conjunto)', () => {
        const r = rollupConjunto([
            { status: PranchaStatus.APROVADO },
            { status: PranchaStatus.ENVIADO },
            { status: PranchaStatus.CONCLUIDO },
            { status: PranchaStatus.CONCLUIDO },
            { status: PranchaStatus.EM_ANDAMENTO },
            { status: PranchaStatus.A_FAZER },
        ]);
        expect(r.total).toBe(6);
        expect(r.executadas).toBe(4);      // "4/6 concluído"
        expect(r.pctExecutado).toBe(67);
        expect(r.isConcluido).toBe(false);
        expect(r.reprovado).toBe(0);
    });

    it('conjunto concluído = todas as pranchas executadas; vazio nunca é concluído', () => {
        expect(rollupConjunto([
            { status: PranchaStatus.APROVADO },
            { status: PranchaStatus.ENVIADO },
            { status: PranchaStatus.CONCLUIDO },
        ]).isConcluido).toBe(true);
        expect(rollupConjunto([]).isConcluido).toBe(false);
        expect(rollupConjunto([]).pctExecutado).toBe(0);
    });

    it('kpis de conjunto contam bases instanciadas/concluídas via rollup', () => {
        const pranchasByConjunto = new Map([
            ['c1', [{ status: PranchaStatus.APROVADO }, { status: PranchaStatus.CONCLUIDO }]],
            ['c2', [{ status: PranchaStatus.A_FAZER }]],
        ]);
        expect(conjuntosKpis([{ id: 'c1' }, { id: 'c2' }], pranchasByConjunto)).toEqual({ bases: 2, concluidas: 1 });
    });
});

// --- (c) Não é possível instanciar a mesma referência na mesma base duas vezes ---

describe('unicidade referência+base', () => {
    it('segunda instanciação na mesma base falha', () => {
        const first = instanciarConjunto({ referencia: refBSO, base: '104+000', existingConjuntos: [], today: '2026-07-08' });
        expect(() => instanciarConjunto({
            referencia: refBSO, base: '104+000', existingConjuntos: [first.conjunto], today: '2026-07-08',
        })).toThrow(/já foi instanciada/i);
    });

    it('a unicidade é tolerante a maiúsculas/espaços/acentos (ID determinístico)', () => {
        expect(conjuntoIdFor('ref-bso', 'KM 104+000')).toBe(conjuntoIdFor('ref-bso', 'km  104+000 '));
        const first = instanciarConjunto({ referencia: refBSO, base: 'KM 104+000', existingConjuntos: [], today: '2026-07-08' });
        expect(() => instanciarConjunto({
            referencia: refBSO, base: 'km 104+000', existingConjuntos: [first.conjunto], today: '2026-07-08',
        })).toThrow(/já foi instanciada/i);
    });

    it('outra base é permitida — a referência continua reutilizável', () => {
        const first = instanciarConjunto({ referencia: refBSO, base: '104+000', existingConjuntos: [], today: '2026-07-08' });
        expect(() => instanciarConjunto({
            referencia: refBSO, base: '090+500', existingConjuntos: [first.conjunto], today: '2026-07-08',
        })).not.toThrow();
    });
});

// --- Instanciação em LOTE (matriz referências × bases) ---

describe('planInstanciacaoLote', () => {
    const refPSP: Referencia = {
        ...refBSO, id: 'ref-psp', codigoCliente: 'PSP-CONSTRUCAP-EST-R00',
        gabarito: [{ id: 'g1', papel: 'Folha 201' }, { id: 'g2', papel: 'Folha 202' }],
    };

    it('cria a matriz completa: N referências × M bases, com as pranchas do gabarito', () => {
        const plan = planInstanciacaoLote({
            referencias: [refBSO, refPSP],
            bases: ['104+000', '090+500', '075+300'],
            existingConjuntos: [],
            today: '2026-07-08',
        });
        expect(plan.items).toHaveLength(6);                    // 2 × 3
        expect(plan.totalPranchas).toBe(3 * 7 + 3 * 2);        // BSO tem 7 no gabarito, PSP tem 2
        expect(plan.puladas).toHaveLength(0);
        // Cada conjunto aponta para a referência certa e cada prancha para o conjunto certo
        plan.items.forEach(({ conjunto, pranchas }) => {
            expect(pranchas.every(p => p.conjuntoId === conjunto.id)).toBe(true);
            expect(pranchas.every(p => p.status === PranchaStatus.A_FAZER)).toBe(true);
        });
    });

    it('pula combinações já instanciadas em vez de duplicar', () => {
        const jaExiste = instanciarConjunto({ referencia: refBSO, base: '104+000', existingConjuntos: [], today: '2026-07-08' });
        const plan = planInstanciacaoLote({
            referencias: [refBSO, refPSP],
            bases: ['104+000', '090+500'],
            existingConjuntos: [jaExiste.conjunto],
            today: '2026-07-08',
        });
        expect(plan.items).toHaveLength(3);                    // 4 combos - 1 existente
        expect(plan.puladas).toEqual([{ codigoCliente: 'BSO-CONSTRUCAP-ARQ-R00', base: '104+000' }]);
    });

    it('bases com grafias equivalentes colapsam (sem redundância dentro do lote)', () => {
        const plan = planInstanciacaoLote({
            referencias: [refBSO],
            bases: ['KM 104+000', 'km  104+000 ', '104+000-x'],
            existingConjuntos: [],
            today: '2026-07-08',
        });
        expect(plan.items).toHaveLength(2);                    // as duas primeiras são a MESMA base
    });

    it('referência sem gabarito é reportada e não gera conjunto vazio', () => {
        const semGab: Referencia = { ...refBSO, id: 'ref-vazia', codigoCliente: 'VAZIA-R00', gabarito: [] };
        const plan = planInstanciacaoLote({
            referencias: [semGab, refPSP],
            bases: ['104+000'],
            existingConjuntos: [],
            today: '2026-07-08',
        });
        expect(plan.semGabarito).toEqual(['VAZIA-R00']);
        expect(plan.items).toHaveLength(1);
    });
});

// --- (d) Os dois ciclos de vida não se cruzam ---

describe('ciclos de vida independentes', () => {
    it('ciclo da referência: rascunho → em elaboração → elaborado → enviado → aprovado/reprovado', () => {
        expect(canRefTransition(RefStatus.RASCUNHO, RefStatus.EM_ELABORACAO)).toBe(true);
        expect(canRefTransition(RefStatus.EM_ELABORACAO, RefStatus.ELABORADO)).toBe(true);
        expect(canRefTransition(RefStatus.ELABORADO, RefStatus.ENVIADO)).toBe(true);
        expect(canRefTransition(RefStatus.ENVIADO, RefStatus.APROVADO)).toBe(true);
        expect(canRefTransition(RefStatus.ENVIADO, RefStatus.REPROVADO)).toBe(true);
        // Reprovado reabre a ELABORAÇÃO (mede o retrabalho), não vai direto ao reenvio
        expect(canRefTransition(RefStatus.REPROVADO, RefStatus.EM_ELABORACAO)).toBe(true);
        expect(canRefTransition(RefStatus.REPROVADO, RefStatus.ENVIADO)).toBe(false);
        // Etapas não podem ser puladas — é isso que garante a medição do tempo
        expect(canRefTransition(RefStatus.RASCUNHO, RefStatus.ENVIADO)).toBe(false);
        expect(canRefTransition(RefStatus.RASCUNHO, RefStatus.ELABORADO)).toBe(false);
        expect(canRefTransition(RefStatus.EM_ELABORACAO, RefStatus.ENVIADO)).toBe(false);
        expect(canRefTransition(RefStatus.RASCUNHO, RefStatus.APROVADO)).toBe(false);
        expect(canRefTransition(RefStatus.APROVADO, RefStatus.RASCUNHO)).toBe(false); // terminal
    });

    it('ciclo da prancha: a_fazer → em_andamento → concluído → enviado → aprovado/reprovado; reprovado reabre via revisão', () => {
        expect(canPranchaTransition(PranchaStatus.A_FAZER, PranchaStatus.EM_ANDAMENTO)).toBe(true);
        expect(canPranchaTransition(PranchaStatus.EM_ANDAMENTO, PranchaStatus.CONCLUIDO)).toBe(true);
        expect(canPranchaTransition(PranchaStatus.CONCLUIDO, PranchaStatus.ENVIADO)).toBe(true);
        expect(canPranchaTransition(PranchaStatus.ENVIADO, PranchaStatus.REPROVADO)).toBe(true);
        expect(canPranchaTransition(PranchaStatus.REPROVADO, PranchaStatus.EM_ANDAMENTO)).toBe(true);
        expect(canPranchaTransition(PranchaStatus.A_FAZER, PranchaStatus.APROVADO)).toBe(false);
    });

    it('a máquina de um ciclo REJEITA estados do outro', () => {
        // Estados exclusivos da prancha não entram no ciclo da referência...
        expect(canRefTransition(PranchaStatus.A_FAZER, RefStatus.ENVIADO)).toBe(false);
        expect(canRefTransition(RefStatus.RASCUNHO, PranchaStatus.EM_ANDAMENTO)).toBe(false);
        expect(canRefTransition(RefStatus.EM_ELABORACAO, PranchaStatus.CONCLUIDO)).toBe(false);
        expect(canRefTransition(PranchaStatus.CONCLUIDO, PranchaStatus.ENVIADO)).toBe(false);
        // ...e estados exclusivos da referência não entram no ciclo da prancha
        expect(canPranchaTransition(RefStatus.RASCUNHO, PranchaStatus.EM_ANDAMENTO)).toBe(false);
        expect(canPranchaTransition(PranchaStatus.A_FAZER, RefStatus.EM_ELABORACAO)).toBe(false);
        expect(canPranchaTransition(RefStatus.EM_ELABORACAO, RefStatus.ELABORADO)).toBe(false);
        expect(canPranchaTransition(PranchaStatus.ENVIADO, RefStatus.RASCUNHO)).toBe(false);
    });

    it('kpis do catálogo contam as etapas de elaboração separadamente', () => {
        const k = catalogoKpis([
            { statusAprovacao: RefStatus.RASCUNHO },
            { statusAprovacao: RefStatus.EM_ELABORACAO },
            { statusAprovacao: RefStatus.EM_ELABORACAO },
            { statusAprovacao: RefStatus.ELABORADO },
            { statusAprovacao: RefStatus.ENVIADO },
            { statusAprovacao: RefStatus.APROVADO },
        ]);
        expect(k).toEqual({ total: 6, rascunho: 1, emElaboracao: 2, elaborado: 1, enviado: 1, aprovado: 1, reprovado: 0 });
    });

    it('status da referência retroage/avança conforme as datas editadas', () => {
        // Apagar início e fim de elaboração retroage "Elaborado" → "Rascunho"
        expect(inferRefStatusFromDates({}, RefStatus.ELABORADO)).toBe(RefStatus.RASCUNHO);
        // Apagar só o fim retroage "Elaborado" → "Em Elaboração"
        expect(inferRefStatusFromDates({ startDate: '2026-05-01' }, RefStatus.ELABORADO)).toBe(RefStatus.EM_ELABORACAO);
        // Datas completas de elaboração → "Elaborado"
        expect(inferRefStatusFromDates({ startDate: '2026-05-01', endDate: '2026-05-10' }, RefStatus.EM_ELABORACAO)).toBe(RefStatus.ELABORADO);
        // Com envio → "Enviado"; apagar envio retroage para "Elaborado"
        expect(inferRefStatusFromDates({ startDate: 'a', endDate: 'b', sendDate: 'c' }, RefStatus.ELABORADO)).toBe(RefStatus.ENVIADO);
        // Terminal preserva a decisão (Aprovado/Reprovado não é derivável de data)
        expect(inferRefStatusFromDates({ startDate: 'a', endDate: 'b', sendDate: 'c', feedbackDate: 'd' }, RefStatus.APROVADO)).toBe(RefStatus.APROVADO);
        expect(inferRefStatusFromDates({ startDate: 'a', endDate: 'b', sendDate: 'c', feedbackDate: 'd' }, RefStatus.REPROVADO)).toBe(RefStatus.REPROVADO);
        // Apagar o feedback tira do terminal e volta para "Enviado"
        expect(inferRefStatusFromDates({ startDate: 'a', endDate: 'b', sendDate: 'c' }, RefStatus.APROVADO)).toBe(RefStatus.ENVIADO);
    });

    it('status da prancha retroage/avança conforme as datas editadas', () => {
        expect(inferPranchaStatusFromDates({}, PranchaStatus.CONCLUIDO)).toBe(PranchaStatus.A_FAZER);
        expect(inferPranchaStatusFromDates({ startDate: 'a' }, PranchaStatus.CONCLUIDO)).toBe(PranchaStatus.EM_ANDAMENTO);
        expect(inferPranchaStatusFromDates({ startDate: 'a', endDate: 'b' }, PranchaStatus.EM_ANDAMENTO)).toBe(PranchaStatus.CONCLUIDO);
        expect(inferPranchaStatusFromDates({ startDate: 'a', endDate: 'b', sendDate: 'c' }, PranchaStatus.CONCLUIDO)).toBe(PranchaStatus.ENVIADO);
        expect(inferPranchaStatusFromDates({ startDate: 'a', endDate: 'b', sendDate: 'c', feedbackDate: 'd' }, PranchaStatus.REPROVADO)).toBe(PranchaStatus.REPROVADO);
        expect(inferPranchaStatusFromDates({ startDate: 'a', endDate: 'b', sendDate: 'c' }, PranchaStatus.REPROVADO)).toBe(PranchaStatus.ENVIADO);
    });

    it('os KPIs contam apenas entidades comparáveis — nunca misturam os níveis', () => {
        const refs = [
            { statusAprovacao: RefStatus.APROVADO },
            { statusAprovacao: RefStatus.ENVIADO },
        ];
        const pranchas = [
            { status: PranchaStatus.APROVADO },
            { status: PranchaStatus.APROVADO },
            { status: PranchaStatus.A_FAZER },
        ];
        const kRef = catalogoKpis(refs);
        const kPr = carteiraKpis(pranchas);
        // "Aprovados" do catálogo conta referências; o da carteira conta pranchas
        expect(kRef.total).toBe(2);
        expect(kRef.aprovado).toBe(1);
        expect(kPr.total).toBe(3);
        expect(kPr.aprovado).toBe(2);
    });
});

// --- Migração ---

describe('planPortfolioMigration', () => {
    const noExisting = {
        existingReferenciaIds: new Set<string>(),
        existingConjuntoIds: new Set<string>(),
        existingPranchaIds: new Set<string>(),
    };

    const prelim = makeProject({
        id: 'p1', filename: 'BSO-CONSTRUCAP-ARQ-R00',
        phase: ProjectPhase.PRELIMINARY, status: Status.APPROVED,
        sendDate: '2026-02-01', feedbackDate: '2026-02-10',
    });
    const execDocs = [
        makeProject({ id: 'e1', filename: 'BSO-CONSTRUCAP-ARQ-R00_EXEC-101', phase: ProjectPhase.EXECUTIVE, base: '104+000', status: Status.APPROVED }),
        makeProject({ id: 'e2', filename: 'BSO-CONSTRUCAP-ARQ-R00_EXEC-102', phase: ProjectPhase.EXECUTIVE, base: '104+000', status: Status.WAITING_APPROVAL }),
        makeProject({ id: 'e3', filename: 'BSO-CONSTRUCAP-ARQ-R00_EXEC-MD', phase: ProjectPhase.EXECUTIVE, base: '104+000', status: Status.IN_PROGRESS }),
        makeProject({ id: 'e4', filename: 'BSO-CONSTRUCAP-ARQ-R00_EXEC-101', phase: ProjectPhase.EXECUTIVE, base: '090+500', status: Status.REJECTED }),
    ];

    it('preliminar vira referência; executivos viram conjuntos por base com suas pranchas', () => {
        const plan = planPortfolioMigration({
            projects: [prelim, ...execDocs],
            rodoviaClients: ['Construcap 040RJ'],
            ...noExisting,
        });

        expect(plan.referencias).toHaveLength(1);
        const ref = plan.referencias[0];
        expect(ref.statusAprovacao).toBe(RefStatus.APROVADO);
        expect(ref.importada).toBeUndefined();

        // 2 bases → 2 conjuntos ligados à MESMA referência (1:N, não mudança de estado)
        expect(plan.conjuntos).toHaveLength(2);
        expect(new Set(plan.conjuntos.map(c => c.referenciaId))).toEqual(new Set([ref.id]));

        // 3 pranchas na base 104+000, 1 na 090+500
        const c104 = plan.conjuntos.find(c => c.base === '104+000')!;
        const pranchas104 = plan.pranchas.filter(p => p.conjuntoId === c104.id);
        expect(pranchas104).toHaveLength(3);
        expect(pranchas104.map(p => p.status).sort()).toEqual(
            [PranchaStatus.APROVADO, PranchaStatus.EM_ANDAMENTO, PranchaStatus.ENVIADO].sort()
        );

        // Reprovado migra fiel (decisão aprovada: reprovado existe no ciclo da prancha)
        const c090 = plan.conjuntos.find(c => c.base === '090+500')!;
        expect(plan.pranchas.find(p => p.conjuntoId === c090.id)!.status).toBe(PranchaStatus.REPROVADO);

        // Gabarito semeado pelo maior conjunto (3 papéis), com papéis inferidos do filename
        expect(ref.gabarito).toHaveLength(3);
        expect(ref.gabarito.map(g => g.papel)).toContain('Memorial Descritivo');
        expect(ref.gabarito.map(g => g.papel)).toContain('Folha 101');
    });

    it('executivo sem preliminar gera referência-stub marcada como importada', () => {
        const plan = planPortfolioMigration({
            projects: [execDocs[0]],
            rodoviaClients: ['Construcap 040RJ'],
            ...noExisting,
        });
        expect(plan.referencias).toHaveLength(1);
        expect(plan.referencias[0].importada).toBe(true);
        expect(plan.conjuntos).toHaveLength(1);
    });

    it('é idempotente: IDs determinísticos já existentes são pulados', () => {
        const first = planPortfolioMigration({ projects: [prelim, ...execDocs], rodoviaClients: ['Construcap 040RJ'], ...noExisting });
        const second = planPortfolioMigration({
            projects: [prelim, ...execDocs],
            rodoviaClients: ['Construcap 040RJ'],
            existingReferenciaIds: new Set(first.referencias.map(r => r.id)),
            existingConjuntoIds: new Set(first.conjuntos.map(c => c.id)),
            existingPranchaIds: new Set(first.pranchas.map(p => p.id)),
        });
        expect(second.referencias).toHaveLength(0);
        expect(second.conjuntos).toHaveLength(0);
        expect(second.pranchas).toHaveLength(0);
        expect(second.skippedExisting).toBe(first.referencias.length + first.conjuntos.length + first.pranchas.length);
    });

    it('só migra obras de rodovia — canteiros seguem o fluxo atual', () => {
        const canteiro = makeProject({ id: 'c1', client: 'Canteiro Sede', phase: ProjectPhase.PRELIMINARY });
        const plan = planPortfolioMigration({
            projects: [canteiro, prelim],
            rodoviaClients: ['Construcap 040RJ'],
            ...noExisting,
        });
        expect(plan.referencias).toHaveLength(1);
        expect(plan.referencias[0].client).toBe('Construcap 040RJ');
    });

    it('preliminar em produção migra para o fluxo de execução com as datas preservadas', () => {
        const emProducao = makeProject({
            id: 'p2', filename: 'PSP-CLIENTE-EST-R00',
            phase: ProjectPhase.PRELIMINARY, status: Status.IN_PROGRESS,
            startDate: '2026-06-01', startPeriod: 'MANHA',
        });
        const concluido = makeProject({
            id: 'p3', filename: 'TCD-CLIENTE-DRE-R00',
            phase: ProjectPhase.PRELIMINARY, status: Status.DONE,
            startDate: '2026-05-04', endDate: '2026-05-22', endPeriod: 'TARDE',
        });
        const plan = planPortfolioMigration({
            projects: [emProducao, concluido],
            rodoviaClients: ['Construcap 040RJ'],
            ...noExisting,
        });
        const psp = plan.referencias.find(r => r.codigoCliente.startsWith('PSP'))!;
        const tcd = plan.referencias.find(r => r.codigoCliente.startsWith('TCD'))!;
        // Em produção → Em Elaboração (o tempo segue correndo); Concluído → Elaborado
        expect(psp.statusAprovacao).toBe(RefStatus.EM_ELABORACAO);
        expect(psp.startDate).toBe('2026-06-01');
        expect(tcd.statusAprovacao).toBe(RefStatus.ELABORADO);
        expect(tcd.endDate).toBe('2026-05-22'); // fecha o tempo de execução medido
        expect(tcd.endPeriod).toBe('TARDE');
    });

    it('famílias de revisão colapsam na revisão vigente', () => {
        const rev0 = makeProject({ id: 'r0', filename: 'PSP-CLIENTE-EST-R00', phase: ProjectPhase.PRELIMINARY, status: Status.REVISED, groupId: 'fam1', revision: 0 });
        const rev1 = makeProject({ id: 'r1', filename: 'PSP-CLIENTE-EST-R00', phase: ProjectPhase.PRELIMINARY, status: Status.WAITING_APPROVAL, groupId: 'fam1', revision: 1, sendDate: '2026-03-01' });
        const plan = planPortfolioMigration({ projects: [rev0, rev1], rodoviaClients: ['Construcap 040RJ'], ...noExisting });
        expect(plan.referencias).toHaveLength(1);
        expect(plan.referencias[0].revisao).toBe(1);
        expect(plan.referencias[0].statusAprovacao).toBe(RefStatus.ENVIADO);
    });
});

// --- Heurísticas de migração ---

describe('heurísticas de nome', () => {
    it('execMoldeKey agrupa folhas do mesmo molde', () => {
        expect(execMoldeKey('BSO-ARQ_EXEC-101')).toBe(execMoldeKey('BSO-ARQ_EXEC-102'));
        expect(execMoldeKey('BSO-ARQ_EXEC-MD')).toBe(execMoldeKey('BSO-ARQ_EXEC-101'));
    });
    it('inferPapel extrai folha/memorial com fallback sequencial', () => {
        expect(inferPapel('ELO-040RJ-104+000-BSO-EXE-DE-P1-101', 0)).toBe('Folha 101');
        expect(inferPapel('BSO-EXE-MD', 0)).toBe('Memorial Descritivo');
        expect(inferPapel('PLANTA BAIXA GERAL', 4)).toBe('Folha 05');
    });
});
