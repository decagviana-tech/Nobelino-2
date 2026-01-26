
import { GoogleGenAI, Type } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, PortableProcess, Estimate } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  isLocalResponse: boolean;
  detectedEstimate?: Partial<Estimate>;
  groundingUrls?: { uri: string; title: string }[];
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

function isGreeting(query: string): boolean {
  const greetings = ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'tudo bem'];
  const normalized = slugify(query);
  return greetings.some(g => normalized === g || normalized.startsWith(g + ' '));
}

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
    return matchCount >= Math.ceil(terms.length * 0.3);
  }).sort((a, b) => (a.description ? -1 : 1)).slice(0, 20);
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledge: KnowledgeEntry[] = [],
  processes: PortableProcess[] = []
): Promise<AIResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Usamos gemini-3-flash-preview para suportar Google Search Grounding
  const model = "gemini-3-flash-preview"; 

  const relevantBooks = findRelevantBooks(query, inventory);
  const isQueryGreeting = isGreeting(query);
  
  const rulesText = knowledge.map(k => `[REGRA/TREINAMENTO]: ${k.content}`).join('\n');
  const processesText = processes.map(p => `[PROCESSO]: ${p.name} - ${p.steps.join(' -> ')}`).join('\n');

  let stockContext = "";
  if (isQueryGreeting) {
    stockContext = "O colaborador está apenas cumprimentando. Seja cordial e pergunte o nome dele.";
  } else if (relevantBooks.length > 0) {
    stockContext = `LIVROS DISPONÍVEIS NA NOBEL (NOSSO ESTOQUE REAL):\n${relevantBooks.map(b => `- ${b.title} | Autor: ${b.author} | PREÇO: R$ ${b.price} | ISBN: ${b.isbn} | Qtd: ${b.stockCount}`).join('\n')}`;
  } else {
    stockContext = "Não encontramos livros com esses termos no nosso estoque físico no momento.";
  }

  const systemInstruction = `Você é o NOBELINO, o Corujinha Consultor da Livraria Nobel. 

OBJETIVO:
Ajudar vendedores no balcão a identificar livros, confirmar preços e gerar orçamentos.

LOGICA DE RESPOSTA:
1. PESQUISA EXTERNA: Use a ferramenta de busca para verificar fatos sobre autores e lançamentos (ex: "Qual o livro mais novo da Colleen Hoover?").
2. CONFLITO DE INFORMAÇÃO: Se a busca disser que o livro "X" é o mais novo, mas ele NÃO estiver no contexto de ESTOQUE abaixo, diga: "O lançamento mais recente é o X, mas aqui na nossa loja temos atualmente estes: [listar do estoque]".
3. PREÇOS: Nunca invente preços. Se o livro está no ESTOQUE abaixo, use o preço de lá. Se não está, diga que precisa consultar o sistema de entrada para ver o valor de capa.
4. ORÇAMENTOS: Se pedirem orçamento, retorne JSON:
{
  "responseText": "Sua resposta",
  "estimate": {
    "customerName": "Nome",
    "items": [{"title": "...", "price": 0.0, "isbn": "..."}],
    "total": 0.0
  }
}

CONTEXTO DA NOBEL (NOSSO ESTOQUE):
${stockContext}

REGRAS DA LOJA E PROCESSOS:
${rulesText}
${processesText}`;

  try {
    const isBudgetRequest = query.toLowerCase().includes('orçamento') || query.toLowerCase().includes('proposta');
    
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.slice(-8).map(m => ({ 
          role: m.role === 'user' ? 'user' : 'model' as any, 
          parts: [{ text: m.content }] 
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: { 
        systemInstruction, 
        temperature: 0.2,
        tools: [{ googleSearch: {} }],
        responseMimeType: isBudgetRequest ? "application/json" : "text/plain"
      }
    });

    const text = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const urls = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri || '',
      title: chunk.web?.title || 'Fonte de Informação'
    })).filter((u: any) => u.uri) || [];

    if (isBudgetRequest && text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      return {
        responseText: data.responseText,
        recommendedBooks: relevantBooks,
        isLocalResponse: false,
        detectedEstimate: data.estimate,
        groundingUrls: urls
      };
    }

    return {
      responseText: text,
      recommendedBooks: relevantBooks,
      isLocalResponse: false,
      groundingUrls: urls
    };
  } catch (error) {
    console.error("Erro AI:", error);
    return {
      responseText: "🦉 Tive um pequeno soluço digital ao consultar o cérebro central. Pode repetir?",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
