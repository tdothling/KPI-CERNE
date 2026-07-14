
import { db, auth } from "../firebase";
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc, query, orderBy, limit, QuerySnapshot, DocumentData, getDoc, getDocs, where, writeBatch, arrayUnion, deleteField, runTransaction } from "firebase/firestore";
import { ProjectFile, PurchaseDoc, ClientDoc, ProjectFilterState, SupplyOrder, SupplyStatus, SupplyStatusEvent, PurchaseStatus } from "../types";
import { Referencia, Conjunto, Prancha, planPortfolioMigration, RefStatus, refStatusAposInstanciar } from "../domain/portfolio";

const COLL_PROJECTS = "projects";
const COLL_MATERIALS = "materials";
const COLL_HOLIDAYS = "settings";
const COLL_PURCHASES = "purchases";
const COLL_CLIENTS = "clients";
const COLL_CONFIG = "configuration";
const COLL_SUPPLY = "supplyOrders";
const COLL_REFERENCIAS = "references";
const COLL_CONJUNTOS = "conjuntos";
const COLL_PRANCHAS = "pranchas";
const COLL_TRASH = "trash";

const isDbActive = () => {
  if (!db) return false;
  return true;
};

// Security Hardening: Verificação estrita
const checkAuth = () => {
  if (!auth) {
    console.error("Security Error: Auth service not initialized.");
    return false;
  }
  if (!auth.currentUser) {
    console.warn("Security Alert: Tentativa de escrita não autorizada bloqueada.");
    return false;
  }
  return true;
};

// Normaliza nomes de obra para comparação tolerante a maiúsculas/minúsculas e espaços.
// Necessário porque o nome da obra é denormalizado (copiado) no campo `client` de cada
// projeto/material/compra, e dados importados podem ter capitalização/espaçamento diferente.
const normalizeName = (s: string | undefined | null) => (s || '').trim().toLowerCase();

// Security Helper: Remove campos undefined que podem quebrar o Firestore ou causar inconsistência
// Remove `undefined` recursivamente. O Firestore rejeita `undefined` em QUALQUER
// nível (inclusive dentro de arrays de objetos, ex.: gabarito[].sufixoCodigo),
// então a limpeza precisa descer na estrutura, não só no nível raiz.
const sanitizeData = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }
  // Objetos "puros" (mapas). Datas, Timestamps e outros objetos de classe passam intactos.
  if (data && typeof data === 'object' && (data.constructor === Object || Object.getPrototypeOf(data) === null)) {
    const clean: any = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        clean[key] = sanitizeData(data[key]);
      }
    });
    return clean;
  }
  return data;
};

// --- LIXEIRA (proteção contra exclusão acidental, todas as abas) ---
//
// TODA exclusão do app passa por aqui: a cópia do documento vai para a coleção
// `trash` no MESMO batch que o apaga (atômico — ou os dois acontecem, ou nenhum).
// A tela Lixeira permite restaurar (recria o doc com o MESMO id) ou excluir de vez.

const trashLabelOf = (data: any, docId: string) =>
  data.filename || data.codigoCliente || data.codigoCompleto || data.title || data.name || data.papel || docId;

const buildTrashEntry = (coll: string, docId: string, data: any, opId: string) => sanitizeData({
  coll,
  docId,
  data,
  label: String(trashLabelOf(data, docId)),
  client: String(data.client || (coll === COLL_CLIENTS ? data.name : '') || ''),
  deletedAt: new Date().toISOString(),
  deletedBy: auth?.currentUser?.email || 'desconhecido',
  opId,
});

// Exclusão de 1 doc com passagem pela lixeira. Doc inexistente = nada a fazer.
const deleteWithTrash = async (coll: string, id: string) => {
  const ref = doc(db, coll, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const batch = writeBatch(db);
  batch.set(doc(collection(db, COLL_TRASH)), buildTrashEntry(coll, id, snap.data(), crypto.randomUUID()));
  batch.delete(ref);
  await batch.commit();
};

export const subscribeToTrash = (callback: (items: any[]) => void) => {
  if (!isDbActive()) return () => { };
  const q = query(collection(db, COLL_TRASH), orderBy('deletedAt', 'desc'), limit(500));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (e) => console.error("Erro no listener da lixeira:", e));
};

// Restaura entradas da lixeira: recria cada doc no lugar original (mesmo ID) e
// remove a entrada. Se o doc já existir de novo (foi recriado manualmente), a
// entrada é preservada e o item reportado em `skipped` — nada é sobrescrito.
export const restoreFromTrash = async (trashIds: string[]): Promise<{ restored: string[]; skipped: string[] }> => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  const restored: string[] = [];
  const skipped: string[] = [];
  for (const tid of trashIds) {
    const tRef = doc(db, COLL_TRASH, tid);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) continue;
    const t = tSnap.data() as any;
    const target = doc(db, t.coll, t.docId);
    const cur = await getDoc(target);
    if (cur.exists()) { skipped.push(t.label || t.docId); continue; }
    const batch = writeBatch(db);
    batch.set(target, t.data);
    batch.delete(tRef);
    await batch.commit();
    restored.push(t.label || t.docId);
  }
  return { restored, skipped };
};

// Exclusão definitiva de entradas da lixeira (irreversível)
export const purgeTrashEntries = async (trashIds: string[]) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  const batch = writeBatch(db);
  trashIds.forEach(tid => batch.delete(doc(db, COLL_TRASH, tid)));
  await batch.commit();
};

export const subscribeToProjects = (callback: (data: ProjectFile[]) => void, filter?: ProjectFilterState) => {
  if (!isDbActive()) return () => { };

  let q;

  // Lógica de Filtro Avançado (Server-Side)
  if (filter && filter.isActive) {
    const constraints: any[] = [];

    // Filtro de Clientes (Usa operador 'in' para permitir múltipla escolha)
    if (filter.clients.length > 0) {
      // Firestore limita o operador 'in' a 10 valores (em versões antigas) ou 30 (novas).
      // Por segurança e performance, pegamos os primeiros 10 se houver muitos.
      const safeClients = filter.clients.slice(0, 10);
      constraints.push(where("client", "in", safeClients));
    }

    // Nota: Não adicionamos 'discipline' na query do Firestore para evitar erros de índice composto.
    // O Firestore exige índices específicos para queries com múltiplos campos diferentes.
    // Estratégia: Filtramos Clientes no Servidor (Redução drástica de leituras) e Disciplinas no Cliente (Memória).

    // Se tiver filtro, aumentamos o limite para garantir que o usuário ache o que procura,
    // mas mantemos um teto para segurança de cota.
    constraints.push(limit(1000));

    // Queries com 'where' muitas vezes não suportam 'orderBy' sem índice criado.
    // Removemos 'orderBy' aqui e ordenamos no callback.
    q = query(collection(db, COLL_PROJECTS), ...constraints);

  } else {
    // Padrão: mais recentes primeiro. Sem orderBy o Firestore ordena por ID (aleatório),
    // e com limit isso escondia projetos recém-cadastrados quando a coleção passava do teto.
    q = query(collection(db, COLL_PROJECTS), orderBy("startDate", "desc"), limit(1000));
  }

  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    let projects: ProjectFile[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id;
      projects.push({ id: doc.id, ...data } as ProjectFile);
    });

    // Se estiver filtrando, aplicamos a filtragem de memória secundária (ex: disciplina) e ordenação
    if (filter && filter.isActive) {
      if (filter.disciplines.length > 0) {
        projects = projects.filter(p => filter.disciplines.includes(p.discipline));
      }
      // Ordenação manual pois removemos o orderBy da query filtrada
      projects.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    }

    callback(projects);
  });
  return unsubscribe;
};

export const addProject = async (project: Omit<ProjectFile, 'id'>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...cleanProject } = project as any;
    await addDoc(collection(db, COLL_PROJECTS), sanitizeData(cleanProject));
  } catch (e) { console.error("Erro ao adicionar projeto:", e); throw e; }
};

export const updateProjectInDb = async (project: ProjectFile) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...data } = project;
    const docRef = doc(db, COLL_PROJECTS, id);
    await updateDoc(docRef, sanitizeData(data));
  } catch (e) { console.error("Erro ao atualizar projeto:", e); throw e; }
};

// Atualização em lote: grava TODAS as mudanças de cada documento em uma única escrita.
// Substitui o padrão antigo de várias chamadas updateProjectInDb com o documento inteiro,
// que reescrevia campos a partir do estado local desatualizado e desfazia as gravações
// anteriores (última escrita vencia — datas "voltavam" ao valor antigo na edição em lote).
export interface BatchDocPatch { id: string; changes: Record<string, any>; }

const batchUpdateCollection = async (collName: string, patches: BatchDocPatch[]) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  const CHUNK = 400; // Firestore limita writeBatch a 500 operações
  for (let i = 0; i < patches.length; i += CHUNK) {
    const batch = writeBatch(db);
    patches.slice(i, i + CHUNK).forEach(({ id, changes }) => {
      batch.update(doc(db, collName, id), sanitizeData(changes));
    });
    await batch.commit();
  }
};

export const batchUpdateProjectsInDb = (patches: BatchDocPatch[]) => batchUpdateCollection(COLL_PROJECTS, patches);

export const deleteProjectFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await deleteWithTrash(COLL_PROJECTS, id); } catch (e) { console.error("Erro ao excluir projeto:", e); throw e; }
};

// --- SUPRIMENTOS ---
// (Os módulos antigos de Materiais e Compras foram substituídos por Suprimentos.
//  As coleções `materials` e `purchases` são preservadas no Firestore como arquivo:
//  seguem incluídas na cascata de rename e na contagem de vínculos, e `purchases`
//  é a fonte da migração one-shot abaixo.)

export const subscribeToSupplyOrders = (callback: (data: SupplyOrder[]) => void) => {
  if (!isDbActive()) return () => { };
  const q = query(collection(db, COLL_SUPPLY), orderBy("createdAt", "desc"), limit(500));
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const orders: SupplyOrder[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id;
      orders.push({ id: doc.id, ...data } as SupplyOrder);
    });
    callback(orders);
  });
  return unsubscribe;
};

export const addSupplyOrder = async (order: Omit<SupplyOrder, 'id'>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...cleanOrder } = order as any;
    await addDoc(collection(db, COLL_SUPPLY), sanitizeData(cleanOrder));
  } catch (e) { console.error("Erro ao adicionar pedido de suprimentos:", e); throw e; }
};

export const updateSupplyOrderInDb = async (order: SupplyOrder) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...data } = order;
    // O formulário de edição representa o documento completo: campo opcional
    // esvaziado (undefined) deve ser REMOVIDO do doc, não preservado — por isso
    // undefined vira deleteField() em vez de ser descartado pelo sanitizeData.
    const payload: any = {};
    Object.keys(data).forEach(key => {
      payload[key] = (data as any)[key] === undefined ? deleteField() : (data as any)[key];
    });
    await updateDoc(doc(db, COLL_SUPPLY, id), payload);
  } catch (e) { console.error("Erro ao atualizar pedido de suprimentos:", e); throw e; }
};

// Patch parcial (aceita dot-paths como 'milestones.boughtAt') para a movimentação de
// status: grava só o que mudou em vez do documento inteiro, evitando que estado local
// desatualizado desfaça gravações concorrentes (mesma lição do batchUpdate de projetos).
export const patchSupplyOrderInDb = async (id: string, changes: Record<string, any>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    await updateDoc(doc(db, COLL_SUPPLY, id), sanitizeData(changes));
  } catch (e) { console.error("Erro ao mover pedido de suprimentos:", e); throw e; }
};

export const deleteSupplyOrderFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await deleteWithTrash(COLL_SUPPLY, id); } catch (e) { console.error("Erro ao excluir pedido de suprimentos:", e); throw e; }
};

// Grava uma movimentação de status: aplica o patch parcial e anexa o evento ao
// histórico com arrayUnion — dois usuários movendo o mesmo cartão quase ao mesmo
// tempo não perdem eventos (o array não é reescrito a partir do estado local).
export const applySupplyStatusChange = async (id: string, changes: Record<string, any>, event: SupplyStatusEvent) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    await updateDoc(doc(db, COLL_SUPPLY, id), { ...sanitizeData(changes), statusHistory: arrayUnion(event) });
  } catch (e) { console.error("Erro ao registrar movimentação de suprimentos:", e); throw e; }
};

// Migração one-shot do módulo antigo de Compras: converte cada doc de `purchases`
// em um pedido de suprimentos com 1 item. Idempotente via legacy.originalId —
// rodar de novo não duplica. Nenhum doc de `purchases` é alterado ou apagado.
export const migrateLegacyPurchasesToSupply = async (userName: string): Promise<{ migrated: number; skipped: number }> => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");

  const [purchasesSnap, supplySnap] = await Promise.all([
    getDocs(collection(db, COLL_PURCHASES)),
    getDocs(collection(db, COLL_SUPPLY))
  ]);

  const alreadyMigrated = new Set<string>();
  supplySnap.docs.forEach(d => {
    const legacy = (d.data() as any).legacy;
    if (legacy?.source === 'purchases' && legacy.originalId) alreadyMigrated.add(legacy.originalId);
  });

  const statusMap: Record<string, SupplyStatus> = {
    [PurchaseStatus.PENDING]: SupplyStatus.READY,     // solicitação feita = lista fechada
    [PurchaseStatus.BOUGHT]: SupplyStatus.BOUGHT,
    [PurchaseStatus.DELIVERED]: SupplyStatus.DELIVERED,
    [PurchaseStatus.CANCELED]: SupplyStatus.CANCELED,
  };

  const pending = purchasesSnap.docs.filter(d => !alreadyMigrated.has(d.id));
  const CHUNK = 400;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const batch = writeBatch(db);
    pending.slice(i, i + CHUNK).forEach(d => {
      const p = d.data() as PurchaseDoc;
      const status = statusMap[p.status] || SupplyStatus.READY;
      const delivered = status === SupplyStatus.DELIVERED;

      // Objetos aninhados montados com spreads condicionais: sanitizeData só limpa
      // o nível raiz e o Firestore rejeita `undefined` dentro de mapas/arrays.
      const createdAt = p.requestDate || new Date().toISOString().split('T')[0];
      const order: Omit<SupplyOrder, 'id'> = {
        title: p.description || 'Compra importada',
        client: p.client || '',
        base: p.base || 'Geral',
        ...(p.application ? { application: p.application } : {}),
        requester: p.requester || '',
        priority: 'NORMAL',
        status,
        items: [{
          id: crypto.randomUUID(),
          description: p.description || 'Item importado',
          quantity: 1,
          unit: 'un',
          delivered,
          ...(delivered && p.arrivalDate ? { deliveredAt: p.arrivalDate } : {}),
        }],
        createdAt,
        ...(p.requestPeriod ? { createdPeriod: p.requestPeriod } : {}),
        milestones: {
          readyAt: createdAt,
          ...(p.requestPeriod ? { readyPeriod: p.requestPeriod } : {}),
          ...(delivered && p.arrivalDate ? { deliveredAt: p.arrivalDate, ...(p.arrivalPeriod ? { deliveredPeriod: p.arrivalPeriod } : {}) } : {}),
        },
        statusHistory: [{
          id: crypto.randomUUID(),
          status,
          date: createdAt,
          ...(userName ? { user: userName } : {}),
          comment: 'Importado do módulo de Compras',
        }],
        ...(p.link ? { link: p.link } : {}),
        ...(p.observation ? { observation: p.observation } : {}),
        legacy: { source: 'purchases', originalId: d.id },
      };

      batch.set(doc(collection(db, COLL_SUPPLY)), sanitizeData(order));
    });
    await batch.commit();
  }

  return { migrated: pending.length, skipped: alreadyMigrated.size };
};

// --- CARTEIRA DE RODOVIA (Referência → Conjunto → Prancha) ---
// A lógica de negócio vive em domain/portfolio.ts (puro); aqui só há persistência.

const subscribeToCollection = <T>(collName: string, orderField: string, max: number) =>
  (callback: (data: T[]) => void) => {
    if (!isDbActive()) return () => { };
    const q = query(collection(db, collName), orderBy(orderField), limit(max));
    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const items: T[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if ('id' in data) delete data.id;
        items.push({ id: d.id, ...data } as T);
      });
      callback(items);
    });
  };

export const subscribeToReferencias = subscribeToCollection<Referencia>(COLL_REFERENCIAS, "codigoCliente", 1000);
export const subscribeToConjuntos = subscribeToCollection<Conjunto>(COLL_CONJUNTOS, "base", 2000);
export const subscribeToPranchas = subscribeToCollection<Prancha>(COLL_PRANCHAS, "conjuntoId", 5000);

export const addReferenciaToDb = async (ref: Omit<Referencia, 'id'>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  await addDoc(collection(db, COLL_REFERENCIAS), sanitizeData(ref));
};

export const patchReferenciaInDb = async (id: string, changes: Record<string, any>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  await updateDoc(doc(db, COLL_REFERENCIAS, id), sanitizeData(changes));
};

// Excluir referência só é permitido sem conjuntos filhos (verificado no chamador
// pelo cache e AQUI direto no banco, contra cache desatualizado/limitado).
export const deleteReferenciaFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  const linked = await getDocs(query(collection(db, COLL_CONJUNTOS), where("referenciaId", "==", id), limit(1)));
  if (!linked.empty) throw new Error("Esta referência possui conjuntos instanciados. Exclua os conjuntos antes.");
  await deleteWithTrash(COLL_REFERENCIAS, id);
};

export const patchPranchaInDb = async (id: string, changes: Record<string, any>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  await updateDoc(doc(db, COLL_PRANCHAS, id), sanitizeData(changes));
};

// Transições/edições em lote de pranchas (mesma mecânica do lote de projetos)
export const batchUpdatePranchasInDb = (patches: BatchDocPatch[]) => batchUpdateCollection(COLL_PRANCHAS, patches);

export const addPranchaToDb = async (prancha: Omit<Prancha, 'id'>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  await addDoc(collection(db, COLL_PRANCHAS), sanitizeData(prancha));
};

export const deletePranchaFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  await deleteWithTrash(COLL_PRANCHAS, id);
};

// Instanciar: grava o Conjunto (ID determinístico referência+base) e as pranchas
// pré-geradas em UMA transação. Se o conjunto já existir — inclusive criado por
// outro usuário um segundo antes — a transação falha e nada é gravado parcial.
// Instanciar também ENCERRA o ciclo preliminar da referência: qualquer etapa
// pendente é desconsiderada e ela vira 'Executivo Gerado' (Aprovado é mantido) —
// o trabalho segue apenas no executivo (pranchas da Carteira).
export const instanciarConjuntoInDb = async (conjunto: Conjunto, pranchas: Omit<Prancha, 'id'>[]) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  await runTransaction(db, async (tx) => {
    const conjuntoRef = doc(db, COLL_CONJUNTOS, conjunto.id);
    const refRef = doc(db, COLL_REFERENCIAS, conjunto.referenciaId);
    const [existing, refSnap] = await Promise.all([tx.get(conjuntoRef), tx.get(refRef)]);
    if (existing.exists()) {
      throw new Error(`Esta referência já foi instanciada na base "${conjunto.base}".`);
    }
    const { id, ...conjuntoData } = conjunto;
    tx.set(conjuntoRef, sanitizeData(conjuntoData));
    pranchas.forEach(p => {
      tx.set(doc(collection(db, COLL_PRANCHAS)), sanitizeData(p));
    });
    if (refSnap.exists()) {
      const atual = (refSnap.data() as any).statusAprovacao as RefStatus;
      const fechado = refStatusAposInstanciar(atual);
      if (fechado !== atual) tx.update(refRef, { statusAprovacao: fechado });
    }
  });
};

// Instanciação em LOTE: executa cada conjunto na SUA transação (atômica por
// conjunto — nunca fica prancha órfã). Combinações que falharem (ex.: corrida com
// outro usuário) são coletadas e reportadas; o restante do lote continua.
export const instanciarLoteInDb = async (
  items: { conjunto: Conjunto; pranchas: Omit<Prancha, 'id'>[] }[],
  onProgress?: (done: number, total: number) => void
): Promise<{ criados: number; erros: string[] }> => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  let criados = 0;
  const erros: string[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      await instanciarConjuntoInDb(items[i].conjunto, items[i].pranchas);
      criados++;
    } catch (e: any) {
      erros.push(`Base "${items[i].conjunto.base}": ${e?.message || e}`);
    }
    onProgress?.(i + 1, items.length);
  }
  return { criados, erros };
};

// Exclui o conjunto e TODAS as suas pranchas em lote (nada fica órfão).
export const deleteConjuntoFromDb = async (conjuntoId: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  const pranchasSnap = await getDocs(query(collection(db, COLL_PRANCHAS), where("conjuntoId", "==", conjuntoId)));
  // Conjunto + pranchas compartilham o mesmo opId: na Lixeira a operação inteira
  // aparece agrupada e é restaurada de uma vez.
  const opId = crypto.randomUUID();
  const conjuntoSnap = await getDoc(doc(db, COLL_CONJUNTOS, conjuntoId));
  const batch = writeBatch(db);
  pranchasSnap.docs.forEach(d => {
    batch.set(doc(collection(db, COLL_TRASH)), buildTrashEntry(COLL_PRANCHAS, d.id, d.data(), opId));
    batch.delete(d.ref);
  });
  if (conjuntoSnap.exists()) {
    batch.set(doc(collection(db, COLL_TRASH)), buildTrashEntry(COLL_CONJUNTOS, conjuntoId, conjuntoSnap.data(), opId));
  }
  batch.delete(doc(db, COLL_CONJUNTOS, conjuntoId));
  await batch.commit();
};

// Migração one-shot dos projetos de obras de RODOVIA para o modelo
// Referência→Conjunto→Prancha. A coleção `projects` NÃO é alterada (vira
// arquivo, como `purchases`). Idempotente: os IDs são determinísticos e o
// planejador pula tudo que já existe — rodar de novo não duplica.
export const migrateProjectsToPortfolio = async (
  rodoviaClients: string[]
): Promise<{ referencias: number; conjuntos: number; pranchas: number; skipped: number }> => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");

  const [projectsSnap, refsSnap, conjSnap, prSnap] = await Promise.all([
    getDocs(collection(db, COLL_PROJECTS)),
    getDocs(collection(db, COLL_REFERENCIAS)),
    getDocs(collection(db, COLL_CONJUNTOS)),
    getDocs(collection(db, COLL_PRANCHAS)),
  ]);

  const projects = projectsSnap.docs.map(d => ({ ...(d.data() as any), id: d.id } as ProjectFile));

  const plan = planPortfolioMigration({
    projects,
    rodoviaClients,
    existingReferenciaIds: new Set(refsSnap.docs.map(d => d.id)),
    existingConjuntoIds: new Set(conjSnap.docs.map(d => d.id)),
    existingPranchaIds: new Set(prSnap.docs.map(d => d.id)),
  });

  const writes: { coll: string; id: string; data: Record<string, any> }[] = [
    ...plan.referencias.map(({ id, ...data }) => ({ coll: COLL_REFERENCIAS, id, data })),
    ...plan.conjuntos.map(({ id, ...data }) => ({ coll: COLL_CONJUNTOS, id, data })),
    ...plan.pranchas.map(({ id, ...data }) => ({ coll: COLL_PRANCHAS, id, data })),
  ];

  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(db);
    writes.slice(i, i + CHUNK).forEach(w => batch.set(doc(db, w.coll, w.id), sanitizeData(w.data)));
    await batch.commit();
  }

  return {
    referencias: plan.referencias.length,
    conjuntos: plan.conjuntos.length,
    pranchas: plan.pranchas.length,
    skipped: plan.skippedExisting,
  };
};

export const subscribeToClients = (callback: (data: ClientDoc[]) => void) => {
  if (!isDbActive()) return () => { };
  const q = query(collection(db, COLL_CLIENTS), orderBy("name"), limit(100));
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const clients: ClientDoc[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id;
      clients.push({ id: doc.id, ...data } as ClientDoc);
    });
    callback(clients);
  });
  return unsubscribe;
};

export const addClient = async (client: Omit<ClientDoc, 'id'>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...cleanClient } = client as any;
    await addDoc(collection(db, COLL_CLIENTS), sanitizeData(cleanClient));
  } catch (e) { console.error("Erro ao adicionar cliente:", e); throw e; }
};

export const updateClientInDb = async (client: ClientDoc) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    // 1. Buscar o cliente atual para verificar mudança de nome
    const docRef = doc(db, COLL_CLIENTS, client.id);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) throw new Error("Cliente não encontrado.");

    const oldData = snapshot.data() as ClientDoc;
    const oldName = oldData.name;
    const newName = client.name;

    const { id, ...data } = client;

    // 2. Atualiza o cadastro do cliente
    await updateDoc(docRef, sanitizeData(data));

    // 3. Se o nome mudou, atualiza em cascata (Cascading Update) todas as coleções vinculadas.
    if (oldName && newName && oldName !== newName) {
      console.log(`Iniciando atualização em cascata: ${oldName} -> ${newName}`);
      const target = normalizeName(oldName);

      // Varre as coleções inteiras e casa por nome NORMALIZADO (ignora maiúsc./espaços).
      // O `where("client","==",oldName)` exato deixava para trás registros importados com
      // capitalização/espaçamento diferente — que continuavam aparecendo com o nome antigo.
      // Inclui as coleções legadas (materials/purchases): os dados preservados
      // continuam consistentes se a obra for renomeada.
      const [pSnap, mSnap, cSnap, sSnap, rSnap, cjSnap] = await Promise.all([
        getDocs(collection(db, COLL_PROJECTS)),
        getDocs(collection(db, COLL_MATERIALS)),
        getDocs(collection(db, COLL_PURCHASES)),
        getDocs(collection(db, COLL_SUPPLY)),
        getDocs(collection(db, COLL_REFERENCIAS)),
        getDocs(collection(db, COLL_CONJUNTOS))
      ]);

      const updatePromises: Promise<void>[] = [];
      const collectMatches = (snap: QuerySnapshot<DocumentData>) => {
        snap.docs.forEach(d => {
          if (normalizeName((d.data() as any).client) === target) {
            updatePromises.push(updateDoc(d.ref, { client: newName }));
          }
        });
      };
      collectMatches(pSnap);
      collectMatches(mSnap);
      collectMatches(cSnap);
      collectMatches(sSnap);
      collectMatches(rSnap);
      collectMatches(cjSnap);

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`Sucesso: ${updatePromises.length} registros atualizados para o novo nome.`);
      }
    }

  } catch (e) { console.error("Erro ao atualizar cliente e vínculos:", e); throw e; }
};

// Conta registros vinculados a uma obra lendo DIRETO do banco (não do cache local, que é
// limitado a 1000 docs e pode estar filtrado pelo servidor). Casa por nome normalizado.
// Usado para bloquear a exclusão de obras que ainda possuem projetos/materiais/compras.
export const countLinkedRecords = async (clientName: string): Promise<{ projects: number; materials: number; purchases: number; supplyOrders: number; referencias: number; conjuntos: number }> => {
  if (!isDbActive()) return { projects: 0, materials: 0, purchases: 0, supplyOrders: 0, referencias: 0, conjuntos: 0 };
  const target = normalizeName(clientName);
  const [pSnap, mSnap, cSnap, sSnap, rSnap, cjSnap] = await Promise.all([
    getDocs(collection(db, COLL_PROJECTS)),
    getDocs(collection(db, COLL_MATERIALS)),
    getDocs(collection(db, COLL_PURCHASES)),
    getDocs(collection(db, COLL_SUPPLY)),
    getDocs(collection(db, COLL_REFERENCIAS)),
    getDocs(collection(db, COLL_CONJUNTOS))
  ]);
  const count = (snap: QuerySnapshot<DocumentData>) =>
    snap.docs.filter(d => normalizeName((d.data() as any).client) === target).length;
  return { projects: count(pSnap), materials: count(mSnap), purchases: count(cSnap), supplyOrders: count(sSnap), referencias: count(rSnap), conjuntos: count(cjSnap) };
};

export const deleteClientFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await deleteWithTrash(COLL_CLIENTS, id); } catch (e) { console.error("Erro ao excluir cliente:", e); throw e; }
};

export const subscribeToHolidays = (callback: (holidays: string[]) => void) => {
  if (!isDbActive()) return () => { };
  const docRef = doc(db, COLL_HOLIDAYS, "holidays");
  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data() as any;
      callback(data.dates || []);
    } else {
      callback([]);
    }
  });
  return unsubscribe;
};

export const saveHolidaysToDb = async (holidays: string[]) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await setDoc(doc(db, COLL_HOLIDAYS, "holidays"), { dates: holidays }); } catch (e) { console.error("Erro ao salvar feriados:", e); throw e; }
};

export const getAppConfig = async () => {
  if (!isDbActive()) return null;
  try {
    const docRef = doc(db, COLL_CONFIG, "general");
    const snap = await getDoc(docRef);
    if (snap.exists()) { return snap.data(); }
    return null;
  } catch (e) { console.error("Erro ao buscar configs:", e); return null; }
}
