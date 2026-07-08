// --- CARTEIRA DE PROJETOS DE RODOVIA (Referência → Conjunto → Prancha) ---
//
// Módulo de domínio PURO: nenhuma dependência de Firestore ou React, para que
// toda a lógica (instanciar, rollup, ciclos de vida e migração) seja testável.
//
// Modelo (vínculo por FK, nunca por mudança de estado):
//   Referencia (molde/catálogo, 1 por tipo de obra)  1—N
//   Conjunto   (instância do molde em uma base/KM)   1—N
//   Prancha    (documento individual do conjunto)
//
// Os DOIS ciclos de vida são independentes e nunca compartilham a mesma coluna:
//   Referência (elaboração + validação): Rascunho → Em Elaboração → Elaborado → Enviado → Aprovado/Reprovado
//   Prancha (execução/entrega): A Fazer → Em Andamento → Concluído → Enviado → Aprovado/Reprovado
// "Reprovado" é terminal encerrável nos dois ciclos: gera-se uma revisão e o ciclo recomeça.
// As etapas de elaboração da referência existem para MEDIR o tempo de execução do
// projeto preliminar (início→conclusão) e os dias com o cliente (envio→feedback).

import { Discipline, Period, ProjectFile, ProjectPhase, Revision, Status } from '../types';
import { getProjectBaseName } from '../utils';

// --- CICLO DA REFERÊNCIA (elaboração do preliminar + validação com o cliente) ---
// Os valores são strings DISTINTAS das do ciclo da prancha ("Em Elaboração" ≠
// "Em Andamento") para que uma máquina de estado rejeite status da outra.

export enum RefStatus {
    RASCUNHO = 'Rascunho',                 // registrada, elaboração ainda não iniciada
    EM_ELABORACAO = 'Em Elaboração',       // preliminar sendo produzido (mede execução)
    ELABORADO = 'Elaborado',               // execução concluída, pronto para envio
    ENVIADO = 'Enviado ao Cliente',
    APROVADO = 'Aprovado',
    REPROVADO = 'Reprovado',
}

// --- CICLO DA PRANCHA (execução/entrega) ---

export enum PranchaStatus {
    A_FAZER = 'A Fazer',
    EM_ANDAMENTO = 'Em Andamento',
    CONCLUIDO = 'Concluído',
    ENVIADO = 'Enviado',
    APROVADO = 'Aprovado',
    REPROVADO = 'Reprovado',
}

// --- ENTIDADES ---

// Item do gabarito: uma saída esperada da referência (ex.: folha 101, memorial)
export interface GabaritoItem {
    id: string;
    papel: string;          // ex.: "Folha 101", "Memorial Descritivo"
    sufixoCodigo?: string;  // sufixo opcional do código (ex.: "DE-P1-101") — a codificação é manual
}

export interface Referencia {
    id: string;
    codigoCliente: string;      // codificação do cliente (ex.: BSO-CONSTRUCAP-ARQ-R00)
    client: string;             // obra — nome denormalizado, igual às demais coleções
    discipline: Discipline;
    revisao: number;
    statusAprovacao: RefStatus;
    gabarito: GabaritoItem[];   // saídas esperadas ao instanciar (NUNCA é consumida)

    startDate?: string;         // ISO — início da elaboração do molde
    startPeriod?: Period;
    endDate?: string;           // conclusão da elaboração (fecha o tempo de execução)
    endPeriod?: Period;
    sendDate?: string;          // envio ao cliente
    sendPeriod?: Period;
    feedbackDate?: string;      // aprovação/reprovação
    feedbackPeriod?: Period;
    blockedDays?: number;       // dias úteis parados com o cliente (envio→feedback)

    observacao?: string;
    importada?: boolean;        // stub criado pela migração (executivo sem preliminar)
    legacy?: { source: 'projects'; originalId: string };
}

// Conjunto NÃO tem status próprio: o estado é derivado por rollup das pranchas.
export interface Conjunto {
    id: string;                 // determinístico: `${referenciaId}__${slug(base)}` — o ID é a
    referenciaId: string;       // constraint de unicidade referência+base (Firestore não tem unique)
    client: string;
    base: string;               // KM / trecho (ex.: "104+000")
    codigoRodovia?: string;     // prefixo manual da codificação (ex.: ELO-040RJ-104+000)
    createdAt: string;          // ISO
    legacy?: { source: 'projects'; originalId: string };
}

export interface Prancha {
    id: string;
    conjuntoId: string;
    papel: string;              // vem do gabarito da referência
    codigoCompleto: string;     // codificação manual/editável (pré-preenchida se houver sufixo)
    status: PranchaStatus;
    revisao: number;

    startDate?: string;  startPeriod?: Period;
    endDate?: string;    endPeriod?: Period;   // fim da execução
    sendDate?: string;   sendPeriod?: Period;  // envio
    feedbackDate?: string; feedbackPeriod?: Period;
    blockedDays?: number;

    revisions?: Revision[];
    observacao?: string;
    legacy?: { source: 'projects'; originalId: string };
}

// --- MÁQUINAS DE ESTADO (independentes: uma NÃO aceita status da outra) ---

const REF_TRANSITIONS: Record<RefStatus, RefStatus[]> = {
    [RefStatus.RASCUNHO]: [RefStatus.EM_ELABORACAO],
    [RefStatus.EM_ELABORACAO]: [RefStatus.ELABORADO],
    [RefStatus.ELABORADO]: [RefStatus.ENVIADO],
    [RefStatus.ENVIADO]: [RefStatus.APROVADO, RefStatus.REPROVADO],
    // Reprovado: o retrabalho reabre a ELABORAÇÃO (nova revisão do molde) — assim
    // o tempo de retrabalho também é medido antes do reenvio
    [RefStatus.REPROVADO]: [RefStatus.EM_ELABORACAO],
    [RefStatus.APROVADO]: [],
};

const PRANCHA_TRANSITIONS: Record<PranchaStatus, PranchaStatus[]> = {
    [PranchaStatus.A_FAZER]: [PranchaStatus.EM_ANDAMENTO],
    [PranchaStatus.EM_ANDAMENTO]: [PranchaStatus.CONCLUIDO],
    [PranchaStatus.CONCLUIDO]: [PranchaStatus.ENVIADO],
    [PranchaStatus.ENVIADO]: [PranchaStatus.APROVADO, PranchaStatus.REPROVADO],
    // Reprovado é terminal encerrável: a revisão reabre a execução
    [PranchaStatus.REPROVADO]: [PranchaStatus.EM_ANDAMENTO],
    [PranchaStatus.APROVADO]: [],
};

const isRefStatus = (v: unknown): v is RefStatus =>
    Object.values(RefStatus).includes(v as RefStatus);
const isPranchaStatus = (v: unknown): v is PranchaStatus =>
    Object.values(PranchaStatus).includes(v as PranchaStatus);

// Retorna true apenas se AMBOS os estados pertencem ao ciclo da referência e a
// transição é permitida. Status do ciclo da prancha são rejeitados aqui.
export const canRefTransition = (from: unknown, to: unknown): boolean => {
    if (!isRefStatus(from) || !isRefStatus(to)) return false;
    return REF_TRANSITIONS[from].includes(to);
};

export const canPranchaTransition = (from: unknown, to: unknown): boolean => {
    if (!isPranchaStatus(from) || !isPranchaStatus(to)) return false;
    return PRANCHA_TRANSITIONS[from].includes(to);
};

// --- IDENTIDADE DO CONJUNTO (unicidade referência+base) ---

// Slug tolerante a maiúsculas/acentos/espaços: "KM 104+000" e "km 104+000"
// apontam para o MESMO conjunto — é isso que impede a instanciação duplicada.
export const slugify = (s: string): string =>
    (s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export const conjuntoIdFor = (referenciaId: string, base: string): string =>
    `${referenciaId}__${slugify(base)}`;

// --- CODIFICAÇÃO (manual, com pré-preenchimento conveniente) ---

// A codificação da rodovia varia por órgão regulamentador, então ela é digitada
// pelo usuário. Aqui apenas montamos uma sugestão editável: prefixo + sufixo.
export const buildCodigoCompleto = (codigoRodovia: string | undefined, item: GabaritoItem): string => {
    const prefixo = (codigoRodovia || '').trim().replace(/-+$/, '');
    const sufixo = (item.sufixoCodigo || '').trim().replace(/^-+/, '');
    if (prefixo && sufixo) return `${prefixo}-${sufixo}`;
    return prefixo || sufixo || '';
};

// --- INSTANCIAR (o novo comportamento do botão de promoção) ---

export interface InstanciarInput {
    referencia: Referencia;
    base: string;
    codigoRodovia?: string;
    existingConjuntos: Pick<Conjunto, 'id'>[]; // para barrar duplicidade na mesma base
    today: string;                             // ISO — injetado para testabilidade
}

export interface InstanciarResult {
    conjunto: Conjunto;
    pranchas: Omit<Prancha, 'id'>[];
}

// Cria 1 Conjunto ligado à Referência e PRÉ-GERA uma prancha por item do gabarito.
// A Referência não é alterada: continua disponível para instanciar em outras bases.
export const instanciarConjunto = (input: InstanciarInput): InstanciarResult => {
    const { referencia, codigoRodovia, existingConjuntos, today } = input;
    const base = (input.base || '').trim();

    if (!base) throw new Error('Informe a base (KM) onde a referência será instanciada.');
    if (!referencia.gabarito || referencia.gabarito.length === 0) {
        throw new Error('A referência não possui gabarito de entregáveis. Cadastre as saídas esperadas no Catálogo antes de instanciar.');
    }

    const id = conjuntoIdFor(referencia.id, base);
    if (existingConjuntos.some(c => c.id === id)) {
        throw new Error(`A referência "${referencia.codigoCliente}" já foi instanciada na base "${base}".`);
    }

    const conjunto: Conjunto = {
        id,
        referenciaId: referencia.id,
        client: referencia.client,
        base,
        ...(codigoRodovia?.trim() ? { codigoRodovia: codigoRodovia.trim() } : {}),
        createdAt: today,
    };

    const pranchas: Omit<Prancha, 'id'>[] = referencia.gabarito.map(item => ({
        conjuntoId: id,
        papel: item.papel,
        codigoCompleto: buildCodigoCompleto(codigoRodovia, item),
        status: PranchaStatus.A_FAZER,
        revisao: 0,
    }));

    return { conjunto, pranchas };
};

// --- ROLLUP (Conjunto deriva das pranchas; nada é gravado) ---

export interface ConjuntoRollup {
    total: number;
    aFazer: number;
    emAndamento: number;
    concluido: number;   // execução concluída, ainda não enviada
    enviado: number;
    aprovado: number;
    reprovado: number;
    executadas: number;  // execução terminou: Concluído + Enviado + Aprovado
    pctExecutado: number; // 0–100
    isConcluido: boolean; // todas as pranchas executadas
}

const EXECUTADA: PranchaStatus[] = [PranchaStatus.CONCLUIDO, PranchaStatus.ENVIADO, PranchaStatus.APROVADO];

export const rollupConjunto = (pranchas: Pick<Prancha, 'status'>[]): ConjuntoRollup => {
    const r: ConjuntoRollup = {
        total: pranchas.length,
        aFazer: 0, emAndamento: 0, concluido: 0, enviado: 0, aprovado: 0, reprovado: 0,
        executadas: 0, pctExecutado: 0, isConcluido: false,
    };
    pranchas.forEach(p => {
        if (p.status === PranchaStatus.A_FAZER) r.aFazer++;
        else if (p.status === PranchaStatus.EM_ANDAMENTO) r.emAndamento++;
        else if (p.status === PranchaStatus.CONCLUIDO) r.concluido++;
        else if (p.status === PranchaStatus.ENVIADO) r.enviado++;
        else if (p.status === PranchaStatus.APROVADO) r.aprovado++;
        else if (p.status === PranchaStatus.REPROVADO) r.reprovado++;
        if (EXECUTADA.includes(p.status)) r.executadas++;
    });
    r.pctExecutado = r.total > 0 ? Math.round((r.executadas / r.total) * 100) : 0;
    r.isConcluido = r.total > 0 && r.executadas === r.total;
    return r;
};

// --- KPIs EM 3 NÍVEIS (cada nível conta APENAS entidades comparáveis) ---

// Nível Referência: elaboração + validação dos tipos com o cliente
export const catalogoKpis = (referencias: Pick<Referencia, 'statusAprovacao'>[]) => {
    const k = { total: referencias.length, rascunho: 0, emElaboracao: 0, elaborado: 0, enviado: 0, aprovado: 0, reprovado: 0 };
    referencias.forEach(r => {
        if (r.statusAprovacao === RefStatus.RASCUNHO) k.rascunho++;
        else if (r.statusAprovacao === RefStatus.EM_ELABORACAO) k.emElaboracao++;
        else if (r.statusAprovacao === RefStatus.ELABORADO) k.elaborado++;
        else if (r.statusAprovacao === RefStatus.ENVIADO) k.enviado++;
        else if (r.statusAprovacao === RefStatus.APROVADO) k.aprovado++;
        else if (r.statusAprovacao === RefStatus.REPROVADO) k.reprovado++;
    });
    return k;
};

// Nível Conjunto: bases instanciadas / concluídas (via rollup das pranchas)
export const conjuntosKpis = (
    conjuntos: Pick<Conjunto, 'id'>[],
    pranchasByConjunto: Map<string, Pick<Prancha, 'status'>[]>
) => {
    let concluidos = 0;
    conjuntos.forEach(c => {
        if (rollupConjunto(pranchasByConjunto.get(c.id) || []).isConcluido) concluidos++;
    });
    return { bases: conjuntos.length, concluidas: concluidos };
};

// Nível Prancha: execução fina
export const carteiraKpis = (
    pranchas: Pick<Prancha, 'status'>[],
    isOverdue: (p: any) => boolean = () => false
) => {
    const k = {
        total: pranchas.length,
        aFazer: 0, emAndamento: 0, concluido: 0, aguardando: 0, aprovado: 0, reprovado: 0, atrasado: 0,
    };
    pranchas.forEach(p => {
        if (p.status === PranchaStatus.A_FAZER) k.aFazer++;
        else if (p.status === PranchaStatus.EM_ANDAMENTO) k.emAndamento++;
        else if (p.status === PranchaStatus.CONCLUIDO) k.concluido++;
        else if (p.status === PranchaStatus.ENVIADO) k.aguardando++;
        else if (p.status === PranchaStatus.APROVADO) k.aprovado++;
        else if (p.status === PranchaStatus.REPROVADO) k.reprovado++;
        if (isOverdue(p)) k.atrasado++;
    });
    return k;
};

// --- MIGRAÇÃO (planejador puro; a escrita no Firestore fica em services/db.ts) ---
//
// Entrada: docs atuais da coleção `projects` das obras de rodovia.
//  - Preliminares  → Referencias (1 por família de revisão)
//  - Executivos    → Conjuntos (por molde+base) com suas Pranchas
//  - Executivo sem preliminar → Referencia-stub marcada `importada`
// IDs determinísticos → rodar de novo não duplica (idempotência por ID).
// A coleção `projects` NUNCA é alterada: vira arquivo, igual a `purchases`.

// Nome limpo do molde: sem extensão, sem [Rn], sem sufixo _EXEC
export const cleanMoldeName = (filename: string): string =>
    getProjectBaseName(filename)
        .replace(/\s*\[R\d+\]/gi, '')
        .replace(/[_\s-]*EXEC$/i, '')
        .trim();

// Chave do molde para EXECUTIVOS: além da limpeza padrão, remove o sufixo de
// folha (ex.: "-101", "_104", " 03") e o marcador de memorial ("MD"), para que
// as 5–6 pranchas do mesmo molde caiam no mesmo Conjunto.
export const execMoldeKey = (filename: string): string =>
    cleanMoldeName(filename)
        .replace(/[-_\s]+MD$/i, '')
        .replace(/[-_\s]+\d{2,4}(\s*[+]\s*\d{3})?$/, '')
        // _EXEC pode estar no meio (ex.: "..._EXEC-101"): só é removível
        // depois que o sufixo de folha cai e ele volta a ficar no final
        .replace(/[_\s-]*EXEC$/i, '')
        .trim();

// Papel inferido do nome do arquivo (heurística aprovada; fallback "Folha NN")
export const inferPapel = (filename: string, fallbackIndex: number): string => {
    const name = cleanMoldeName(filename);
    if (/(^|[-_\s])(MD|MEMORIAL)([-_\s]|$)/i.test(name)) return 'Memorial Descritivo';
    const m = name.match(/(\d{2,4})\s*$/);
    if (m) return `Folha ${m[1]}`;
    return `Folha ${String(fallbackIndex + 1).padStart(2, '0')}`;
};

const REF_STATUS_MAP: Partial<Record<Status, RefStatus>> = {
    [Status.IN_PROGRESS]: RefStatus.EM_ELABORACAO,
    [Status.DONE]: RefStatus.ELABORADO,
    [Status.WAITING_APPROVAL]: RefStatus.ENVIADO,
    [Status.APPROVED]: RefStatus.APROVADO,
    [Status.REJECTED]: RefStatus.REPROVADO,
    // Preliminar substituído pelo executivo: a elaboração terminou, mesmo sem envio
    [Status.SUPERSEDED]: RefStatus.ELABORADO,
};

const PRANCHA_STATUS_MAP: Partial<Record<Status, PranchaStatus>> = {
    [Status.IN_PROGRESS]: PranchaStatus.EM_ANDAMENTO,
    [Status.DONE]: PranchaStatus.CONCLUIDO,
    [Status.WAITING_APPROVAL]: PranchaStatus.ENVIADO,
    [Status.APPROVED]: PranchaStatus.APROVADO,
    [Status.REJECTED]: PranchaStatus.REPROVADO,
};

const normalizeClient = (s: string | undefined | null) => (s || '').trim().toLowerCase();

// Agrupa por família de revisão e devolve a revisão vigente + o histórico
const groupFamilies = (docs: ProjectFile[], keyOf: (p: ProjectFile) => string) => {
    const families = new Map<string, ProjectFile[]>();
    docs.forEach(p => {
        const key = keyOf(p);
        if (!families.has(key)) families.set(key, []);
        families.get(key)!.push(p);
    });
    families.forEach(fam => fam.sort((a, b) => (a.revision || 0) - (b.revision || 0)));
    return families;
};

export interface MigrationPlan {
    referencias: Referencia[];
    conjuntos: Conjunto[];
    pranchas: Prancha[];
    skippedExisting: number; // já migrados em execuções anteriores
}

export interface MigrationInput {
    projects: ProjectFile[];
    rodoviaClients: string[];          // nomes das obras tipo "Obra de Rodovia"
    existingReferenciaIds: Set<string>;
    existingConjuntoIds: Set<string>;
    existingPranchaIds: Set<string>;
}

export const planPortfolioMigration = (input: MigrationInput): MigrationPlan => {
    const rodoviaSet = new Set(input.rodoviaClients.map(normalizeClient));
    const scoped = input.projects.filter(p => rodoviaSet.has(normalizeClient(p.client)));

    const prelims = scoped.filter(p => (p.phase || ProjectPhase.PRELIMINARY) === ProjectPhase.PRELIMINARY);
    const execs = scoped.filter(p => p.phase === ProjectPhase.EXECUTIVE);

    const plan: MigrationPlan = { referencias: [], conjuntos: [], pranchas: [], skippedExisting: 0 };

    // Chave do molde compartilhada entre preliminar e executivo:
    // obra | disciplina | nome do molde (executivos passam pelo strip de folha)
    const refKeyOf = (client: string, discipline: Discipline, molde: string) =>
        `${normalizeClient(client)}|${discipline}|${slugify(molde)}`;
    const refIdOf = (key: string) => `ref__${slugify(key.replace(/\|/g, ' '))}`;

    // 1) Preliminares → Referencias (1 por família de revisão)
    const refByKey = new Map<string, Referencia>();
    const prelimFamilies = groupFamilies(prelims, p => refKeyOf(p.client, p.discipline, cleanMoldeName(p.filename)));
    prelimFamilies.forEach((fam, key) => {
        const latest = fam[fam.length - 1];
        // Vigente = maior revisão não-Revisado se existir; senão, a última mesmo
        const active = [...fam].reverse().find(p => p.status !== Status.REVISED) || latest;
        const ref: Referencia = {
            id: refIdOf(key),
            codigoCliente: cleanMoldeName(active.filename),
            client: active.client,
            discipline: active.discipline,
            revisao: active.revision || 0,
            statusAprovacao: REF_STATUS_MAP[active.status] || RefStatus.RASCUNHO,
            gabarito: [], // semeado no passo 3
            ...(active.startDate ? { startDate: active.startDate } : {}),
            ...(active.startPeriod ? { startPeriod: active.startPeriod } : {}),
            ...(active.endDate ? { endDate: active.endDate } : {}),
            ...(active.endPeriod ? { endPeriod: active.endPeriod } : {}),
            ...(active.sendDate ? { sendDate: active.sendDate } : {}),
            ...(active.sendPeriod ? { sendPeriod: active.sendPeriod } : {}),
            ...(active.feedbackDate ? { feedbackDate: active.feedbackDate } : {}),
            ...(active.feedbackPeriod ? { feedbackPeriod: active.feedbackPeriod } : {}),
            ...(active.blockedDays ? { blockedDays: active.blockedDays } : {}),
            legacy: { source: 'projects', originalId: active.id },
        };
        refByKey.set(key, ref);
    });

    // 2) Executivos → Conjuntos + Pranchas
    // Família de revisão do executivo (groupId ou nome exato) → 1 prancha vigente
    const execFamilies = groupFamilies(
        execs,
        p => `${normalizeClient(p.client)}|${p.discipline}|${normalizeClient(p.base || 'Geral')}|${p.groupId || slugify(cleanMoldeName(p.filename))}`
    );

    // Conjunto: molde + base
    interface ConjuntoDraft { client: string; discipline: Discipline; base: string; refKey: string; pranchas: { fam: ProjectFile[] }[] }
    const conjuntoDrafts = new Map<string, ConjuntoDraft>();
    execFamilies.forEach(fam => {
        const latest = fam[fam.length - 1];
        const molde = execMoldeKey(latest.filename);
        const base = (latest.base || 'Geral').trim() || 'Geral';
        const refKey = refKeyOf(latest.client, latest.discipline, molde);
        const cKey = `${refKey}|${slugify(base)}`;
        if (!conjuntoDrafts.has(cKey)) {
            conjuntoDrafts.set(cKey, { client: latest.client, discipline: latest.discipline, base, refKey, pranchas: [] });
        }
        conjuntoDrafts.get(cKey)!.pranchas.push({ fam });
    });

    // Referencia-stub para executivos órfãos (sem preliminar correspondente)
    conjuntoDrafts.forEach(draft => {
        if (refByKey.has(draft.refKey)) return;
        const sample = draft.pranchas[0].fam[draft.pranchas[0].fam.length - 1];
        refByKey.set(draft.refKey, {
            id: refIdOf(draft.refKey),
            codigoCliente: execMoldeKey(sample.filename) || cleanMoldeName(sample.filename),
            client: draft.client,
            discipline: draft.discipline,
            revisao: 0,
            statusAprovacao: RefStatus.RASCUNHO,
            gabarito: [],
            importada: true,
            legacy: { source: 'projects', originalId: sample.id },
        });
    });

    // Materializa conjuntos e pranchas
    const gabaritoCandidates = new Map<string, GabaritoItem[]>(); // refKey → papéis do maior conjunto
    conjuntoDrafts.forEach(draft => {
        const ref = refByKey.get(draft.refKey)!;
        const conjuntoId = conjuntoIdFor(ref.id, draft.base);
        const conjunto: Conjunto = {
            id: conjuntoId,
            referenciaId: ref.id,
            client: draft.client,
            base: draft.base,
            createdAt: draft.pranchas
                .map(p => p.fam[0].startDate || '')
                .filter(Boolean)
                .sort()[0] || new Date().toISOString().split('T')[0],
            legacy: { source: 'projects', originalId: draft.pranchas[0].fam[0].id },
        };

        const papeis: GabaritoItem[] = [];
        draft.pranchas.forEach(({ fam }, idx) => {
            const active = [...fam].reverse().find(p => p.status !== Status.REVISED) || fam[fam.length - 1];
            const papel = inferPapel(active.filename, idx);
            papeis.push({ id: `gab-${slugify(papel)}`, papel });

            // Histórico: revisões próprias + docs antigos da família viram entradas de revisão
            const mergedRevisions: Revision[] = fam.flatMap(p => p.revisions || []);

            plan.pranchas.push({
                id: `pr__${active.id}`,
                conjuntoId,
                papel,
                codigoCompleto: active.filename,
                status: PRANCHA_STATUS_MAP[active.status] || PranchaStatus.EM_ANDAMENTO,
                revisao: active.revision || 0,
                ...(active.startDate ? { startDate: active.startDate } : {}),
                ...(active.startPeriod ? { startPeriod: active.startPeriod } : {}),
                ...(active.endDate ? { endDate: active.endDate } : {}),
                ...(active.endPeriod ? { endPeriod: active.endPeriod } : {}),
                ...(active.sendDate ? { sendDate: active.sendDate } : {}),
                ...(active.sendPeriod ? { sendPeriod: active.sendPeriod } : {}),
                ...(active.feedbackDate ? { feedbackDate: active.feedbackDate } : {}),
                ...(active.feedbackPeriod ? { feedbackPeriod: active.feedbackPeriod } : {}),
                ...(active.blockedDays ? { blockedDays: active.blockedDays } : {}),
                ...(mergedRevisions.length > 0 ? { revisions: mergedRevisions } : {}),
                legacy: { source: 'projects', originalId: active.id },
            });
        });

        // Candidato a gabarito: o conjunto com MAIS pranchas define o gabarito da referência
        const current = gabaritoCandidates.get(draft.refKey);
        if (!current || papeis.length > current.length) gabaritoCandidates.set(draft.refKey, papeis);

        plan.conjuntos.push(conjunto);
    });

    // 3) Semeia gabaritos (referência sem executivo ganha 1 item para completar depois)
    refByKey.forEach((ref, key) => {
        ref.gabarito = gabaritoCandidates.get(key) || [{ id: 'gab-folha-01', papel: 'Folha 01' }];
        plan.referencias.push(ref);
    });

    // 4) Idempotência: remove o que já existe no banco (IDs determinísticos)
    const before = plan.referencias.length + plan.conjuntos.length + plan.pranchas.length;
    plan.referencias = plan.referencias.filter(r => !input.existingReferenciaIds.has(r.id));
    plan.conjuntos = plan.conjuntos.filter(c => !input.existingConjuntoIds.has(c.id));
    plan.pranchas = plan.pranchas.filter(p => !input.existingPranchaIds.has(p.id));
    plan.skippedExisting = before - (plan.referencias.length + plan.conjuntos.length + plan.pranchas.length);

    return plan;
};
