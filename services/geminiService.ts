
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

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledge: KnowledgeEntry[] = [],
  processes: PortableProcess[] = []
): Promise<AIResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  const relevantBooks = findRelevantBooks(query, inventory);
  const isQueryGreeting = isGreeting(query);
  
  const rulesText = knowledge.map(k => `[REGRA]: ${k.content}`).join('\n');
  const processesText = processes.map(p => `[PROCESSO]: ${p.name}`).join('\n');

  let stockContext = "";
  if (isQueryGreeting) {
    stockContext = "O vendedor está apenas iniciando o turno ou cumprimentando.";
  } else if (relevantBooks.length > 0) {
    stockContext = `ESTOQUE LOCAL (PRIORIDADE):
${relevantBooks.map(b => `- ${b.title} | R$ ${b.price} | ISBN: ${b.isbn} | SINOPSE: ${b.description?.slice(0, 150)}...`).join('\n')}`;
  } else {
    stockContext = "AVISO: Não encontrei nada EXATO no estoque. Use sua base de conhecimento para sugerir autores, mas avise que não temos no momento.";
  }

  const systemInstruction = `Você é o NOBELINO, o Corujinha Consultor. 

MISSÃO:
Encontrar livros pelo ASSUNTO. Se o cliente quer "meditação" e o título não diz, você DEVE ler as SINOPSES no contexto abaixo para encontrar.

REGRAS DE OURO:
1. Se o assunto (ex: elementais) estiver na SINOPSE de um livro do estoque, INDIQUE-O imediatamente.
2. Seja um vendedor proativo: "No título não diz, mas a sinopse deste livro fala exatamente sobre o que você procura".
3. Se não encontrar no estoque, use o Google Search para descobrir qual livro trata desse assunto e diga: "O livro ideal seria X, não temos hoje, mas posso encomendar".
4. Mantenha as respostas curtas (máximo 3 parágrafos) para economizar processamento.

CONTEXTO DE ESTOQUE ATUAL:
${stockContext}

OUTRAS REGRAS:
${rulesText}
${processesText}`;

  try {
    const isBudgetRequest = query.toLowerCase().includes('orçamento') || query.toLowerCase().includes('proposta');
    
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.slice(-6).map(m => ({ 
          role: m.role === 'user' ? 'user' : 'model' as any, 
          parts: [{ text: m.content }] 
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: { 
        systemInstruction, 
        temperature: 0.1, // Menor temperatura = mais foco no estoque e menos "alucinação"
        tools: [{ googleSearch: {} }],
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
