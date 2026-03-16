
import { GoogleGenAI, Type } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, PortableProcess, Estimate } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  isLocalResponse: boolean;
  detectedEstimate?: Partial<Estimate>;
  groundingUrls?: { uri: string; title: string }[];
}

const STOP_WORDS = new Set(['temos', 'algum', 'livro', 'sobre', 'fala', 'que', 'voce', 'teria', 'queria', 'saber', 'procurando', 'estou', 'onde', 'fica', 'qual', 'quais', 'pode', 'me', 'ajudar', 'com', 'uma', 'pelo', 'assunto', 'tema']);

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
  
  const rawTerms = slugify(query).split(/\s+/).filter(t => t.length > 2);
  // Filtra palavras comuns para focar no assunto real (ex: 'meditacao' em vez de 'temos livro sobre')
  const searchTerms = rawTerms.filter(t => !STOP_WORDS.has(t));
  
  const isbnsInQuery = query.match(/\d{10,13}/g) || [];
  if (isbnsInQuery.length > 0) {
    const results = inventory.filter(b => 
      isbnsInQuery.some(isbn => normalize(b.isbn).includes(normalize(isbn)))
    );
    if (results.length > 0) return results;
  }

  if (searchTerms.length === 0) return [];

  return inventory.map(book => {
    const titleArea = slugify(book.title);
    const synopsisArea = slugify(book.description || '');
    const authorArea = slugify(book.author);
    
    let score = 0;
    searchTerms.forEach(term => {
      if (titleArea.includes(term)) score += 10;      // Título tem peso máximo
      if (authorArea.includes(term)) score += 5;     // Autor tem peso médio
      if (synopsisArea.includes(term)) score += 8;   // SINOPSE tem peso alto (aqui está a mágica!)
    });
    
    return { book, score };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 12) // Limitamos a 12 para economizar tokens/dinheiro na API
  .map(item => item.book);
}

function findRelevantKnowledge(query: string, knowledge: KnowledgeEntry[], limit = 3): KnowledgeEntry[] {
  const terms = slugify(query).split(/\s+/).filter(t => t.length > 3 && !STOP_WORDS.has(t));
  if (terms.length === 0) return [];

  return knowledge
    .map(k => {
      const area = slugify(k.topic + " " + k.content);
      let score = 0;
      terms.forEach(t => { if (area.includes(t)) score += 1; });
      return { k, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.k);
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledge: KnowledgeEntry[] = [],
  processes: PortableProcess[] = []
): Promise<AIResult> {
  // Busca a chave em múltiplas fontes (env, window, ou fallback)
  const apiKey = (process.env.API_KEY || (window as any).API_KEY || "");
  
  if (!apiKey) {
    console.warn("API_KEY não encontrada.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-1.5-flash";

  const relevantBooks = findRelevantBooks(query, inventory);
  const relevantKnowledge = findRelevantKnowledge(query, knowledge);
  const isQueryGreeting = isGreeting(query);
  const isBudgetRequest = query.toLowerCase().includes('orçamento') || query.toLowerCase().includes('proposta');
  
  const shouldSearchWeb = !isQueryGreeting && relevantBooks.length === 0 && query.trim().length > 10;

  const rulesText = relevantKnowledge.map(k => `[LOJA]: ${k.content}`).join('\n');
  const processesText = processes.length > 0 && !isQueryGreeting ? `[PROCESSO]: ${processes[0].name}` : '';

  let stockContext = "";
  if (isQueryGreeting) {
    stockContext = "Início de conversa.";
  } else if (relevantBooks.length > 0) {
    stockContext = `ESTOQUE LOCAL:
${relevantBooks.slice(0, 5).map(b => `- ${b.title} | R$ ${b.price} | SINOPSE: ${b.description?.slice(0, 100) || 'Sem sinopse'}`).join('\n')}`;
  } else if (!shouldSearchWeb) {
    stockContext = "Nada encontrado no estoque local.";
  }

  const systemInstruction = `Você é o NOBELINO, o Corujinha Consultor. 
AJUDE o vendedor a achar livros pelo ASSUNTO. 
REGRAS:
1. Priorize ESTOQUE LOCAL.
2. Respostas curtas e amigáveis.
3. Se vender, peça para registrar no Painel.

${rulesText}
${processesText}
${stockContext}`;

  try {
    const chatHistory = history.slice(-4).map(m => ({
      role: m.role === 'user' ? 'user' : 'model' as any,
      parts: [{ text: m.content || "" }]
    }));

    const response = await ai.models.generateContent({
      model,
      contents: [...chatHistory, { role: 'user', parts: [{ text: query }] }],
      config: { 
        systemInstruction, 
        temperature: 0.1, 
        tools: shouldSearchWeb ? [{ googleSearch: {} }] : [],
        responseMimeType: isBudgetRequest ? "application/json" : "text/plain"
      }
    });

    // Acesso seguro ao texto (pode ser property ou function em algumas versões/SDKs)
    let text = "";
    try {
      text = typeof (response as any).text === 'function' ? (response as any).text() : response.text;
    } catch (e) {
      text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    if (!text) throw new Error("Resposta AI vazia");

    const urls = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((chunk: any) => ({
        uri: chunk.web?.uri || '',
        title: chunk.web?.title || 'Referência'
      })).filter((u: any) => u.uri) || [];

    if (isBudgetRequest && text.trim().startsWith('{')) {
      try {
        const data = JSON.parse(text);
        return {
          responseText: data.responseText || "Aqui está o orçamento solicitado.",
          recommendedBooks: relevantBooks,
          isLocalResponse: false,
          detectedEstimate: data.estimate,
          groundingUrls: urls
        };
      } catch (jsonErr) {
        // Fallback se o JSON falhar
        return { responseText: text, recommendedBooks: relevantBooks, isLocalResponse: false, groundingUrls: urls };
      }
    }

    return {
      responseText: text,
      recommendedBooks: relevantBooks,
      isLocalResponse: false,
      groundingUrls: urls
    };
  } catch (error: any) {
    console.error("Erro AI:", error);
    return {
      responseText: `🦉 Tive um pequeno soluço digital: ${error.message || 'Erro desconhecido'}. Verifique se a chave API está conectada.`,
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
