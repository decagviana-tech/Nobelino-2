
import { GoogleGenAI } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, PortableProcess, Estimate } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  isLocalResponse: boolean;
  detectedEstimate?: Partial<Estimate>;
}

function normalize(val: string): string {
  return val.replace(/\D/g, "");
}

function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Identifica se a mensagem é apenas um cumprimento inicial
 */
function isGreeting(query: string): boolean {
  const greetings = ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'tudo bem'];
  const normalized = slugify(query);
  return greetings.some(g => normalized === g || normalized.startsWith(g + ' '));
}

/**
 * Motor de busca que prioriza a inteligência das sinopses.
 */
function findRelevantBooks(query: string, inventory: Book[]): Book[] {
  if (isGreeting(query)) return [];

  const normalizedQuery = slugify(query);
  const isbnsInQuery = query.match(/\d{10,13}/g) || [];
  
  if (isbnsInQuery.length > 0) {
    const results = inventory.filter(b => 
      isbnsInQuery.some(isbn => normalize(b.isbn).includes(normalize(isbn)))
    );
    if (results.length > 0) return results;
  }

  const terms = normalizedQuery.split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return [];

  return inventory.filter(book => {
    const searchArea = slugify(`${book.title} ${book.author} ${book.genre || ''} ${book.description || ''}`);
    const matchCount = terms.filter(term => searchArea.includes(term)).length;
    return matchCount >= Math.ceil(terms.length * 0.4);
  }).sort((a, b) => {
    if (a.description && !b.description) return -1;
    if (!a.description && b.description) return 1;
    return 0;
  }).slice(0, 15);
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledge: KnowledgeEntry[] = [],
  salesGoals: any[] = [],
  processes: PortableProcess[] = []
): Promise<AIResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  const relevantBooks = findRelevantBooks(query, inventory);
  const isQueryGreeting = isGreeting(query);
  
  const rulesText = knowledge.map(k => `[INSTRUÇÃO]: ${k.content}`).join('\n');
  const processesText = processes.map(p => `[PROCESSO]: ${p.name} - ${p.steps.join(' -> ')}`).join('\n');

  let stockContext = "";
  if (isQueryGreeting) {
    stockContext = "O colaborador está apenas cumprimentando. Foque na saudação e na identificação.";
  } else if (relevantBooks.length > 0) {
    stockContext = `ITENS DO ACERVO ENCONTRADOS PARA ESTA CONSULTA:\n${relevantBooks.map(b => `- ${b.title} | R$ ${b.price} | Estoque: ${b.stockCount} | ISBN: ${b.isbn}\n  SINOPSES: ${b.description || "Sem sinopse."}`).join('\n\n')}`;
  } else {
    stockContext = "Nenhum livro específico foi encontrado no banco de dados local para esta frase. Se o usuário estiver procurando um livro, informe educadamente que não localizou no estoque imediato e ofereça verificar o catálogo nacional.";
  }

  const systemInstruction = `Você é o NOBELINO, o Consultor Técnico de Suporte da Livraria Nobel.
Sua aparência: Coruja amarela com camisa polo preta.

DIRETRIZ DE IDENTIFICAÇÃO (CRÍTICA):
1. No início de uma nova conversa, sua prioridade é saber com quem fala: "Consultor Nobelino pronto. Com qual colaborador eu falo agora?".
2. Se o usuário já se identificou antes, use o nome dele.

COMPORTAMENTO COM O ESTOQUE:
- Você recebeu dados do estoque para ajudar o vendedor. Use-os com naturalidade.
- NUNCA escreva mensagens técnicas entre parênteses como "*(Nota: ...)*". 
- NUNCA diga "localmente" ou "banco de dados". Fale como se estivesse olhando a prateleira da loja.
- Se não encontrar um livro, diga: "Não localizei esse título aqui no nosso sistema agora, mas posso verificar se conseguimos por encomenda!".

CONTEXTO ATUAL:
${stockContext}

REGRAS E PROCESSOS DA LOJA:
${rulesText}
${processesText}

Tom de voz: Expert, prestativo e focado em vendas. Use 🦉.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.slice(-10).map(m => ({ 
          role: m.role === 'user' ? 'user' : 'model' as any, 
          parts: [{ text: m.content }] 
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: { systemInstruction, temperature: 0.3 }
    });

    return {
      responseText: response.text || "🦉 Como posso ajudar no balcão hoje?",
      recommendedBooks: relevantBooks,
      isLocalResponse: false
    };
  } catch (error) {
    return {
      responseText: "🦉 Tive um pequeno problema de conexão. Pode repetir?",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
