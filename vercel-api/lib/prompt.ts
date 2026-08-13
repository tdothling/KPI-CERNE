import { NarrativePayload } from './narrativePayload';

/** Monta o prompt em pt-BR enviado ao Gemini a partir do resumo de KPIs do período. */
export function buildPrompt(p: NarrativePayload): string {
  const linhas: string[] = [];

  linhas.push(
    'Você é um analista de projetos de engenharia da Cerne Construções, escrevendo a ' +
      'análise executiva de um relatório interno de indicadores. Escreva em português do ' +
      'Brasil, em texto corrido, entre 3 e 5 parágrafos curtos, sem títulos, sem markdown ' +
      '(nada de #, *, listas ou negrito) e sem repetir todos os números do resumo — cite só ' +
      'os que sustentam sua análise.',
  );
  linhas.push(
    'Cubra: (1) uma leitura geral do período, (2) os principais riscos — atrasados e itens ' +
      'a vencer, (3) como OTD e IAPR estão em relação à meta, (4) a tendência de entregas em ' +
      'relação aos 30 dias anteriores, e (5) 2 a 3 recomendações práticas e específicas para a ' +
      'equipe de coordenação de projetos.',
  );
  linhas.push('Dados do período (JSON):');
  linhas.push(JSON.stringify(p));

  if (p.filtroDeStatusAtivo) {
    linhas.push(
      'Atenção: há filtro de status ativo nos dados acima — OTD e IAPR refletem só o recorte ' +
        'filtrado, não a operação completa. Deixe isso claro se comentar esses indicadores.',
    );
  }

  return linhas.join('\n\n');
}
