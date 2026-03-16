
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-1.5-flash"; // Modelo mais rápido e barato

  const relevantBooks = findRelevantBooks(query, inventory);
  const relevantKnowledge = findRelevantKnowledge(query, knowledge);
  const isQueryGreeting = isGreeting(query);
  const isBudgetRequest = query.toLowerCase().includes('orçamento') || query.toLowerCase().includes('proposta');
  
  // Só ativa o Google Search se não tivermos nada no estoque E for uma dúvida de assunto
  const shouldSearchWeb = !isQueryGreeting && relevantBooks.length === 0 && query.length > 15;

  const rulesText = relevantKnowledge.map(k => `[INSTRUÇÃO LOJA]: ${k.content}`).join('\n');
  const processesText = processes.length > 0 && !isQueryGreeting ? `[PROCESSO SUGERIDO]: ${processes[0].name} (${processes[0].steps.join(' -> ')})` : '';

  let stockContext = "";
  if (isQueryGreeting) {
    stockContext = "O vendedor está iniciando o atendimento.";
  } else if (relevantBooks.length > 0) {
    stockContext = `ESTOQUE LOCAL (PRIORIDADE):
${relevantBooks.slice(0, 5).map(b => `- ${b.title} | R$ ${b.price} | SINOPSE: ${b.description?.slice(0, 100)}...`).join('\n')}`;
  } else if (!shouldSearchWeb) {
    stockContext = "Não encontramos livros com esse termo exato no estoque local.";
  }

  const systemInstruction = `Você é o NOBELINO, o Corujinha Consultor da Nobel Petrópolis. 

MISSÃO: Ajudar o vendedor a encontrar livros pelo ASSUNTO nas SINOPSES.

REGRAS:
1. Priorize o ESTOQUE LOCAL. Se encontrar algo na SINOPSE que bate com o assunto, indique com entusiasmo.
2. Se não houver estoque local relevante, use sua inteligência geral para sugerir autores/títulos e mencione que podemos encomendar.
3. Mantenha respostas curtas e objetivas (máx 3 parágrafos).
4. Se o cliente for comprar, lembre o vendedor de lançar a venda no Painel para atualizar o estoque.

${rulesText}
${processesText}
${stockContext}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.slice(-4).map(m => ({ // Reduzi histórico para economizar tokens
          role: m.role === 'user' ? 'user' : 'model' as any, 
          parts: [{ text: m.content }] 
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: { 
        systemInstruction, 
        temperature: 0.1, 
        tools: shouldSearchWeb ? [{ googleSearch: {} }] : [],
        responseMimeType: isBudgetRequest ? "application/json" : "text/plain"
      }
    });

    const text = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const urls = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri || '',
      title: chunk.web?.title || 'Referência'
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
      responseText: "🦉 Tive um pequeno soluço digital. Pode repetir a pergunta sobre o assunto?",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
