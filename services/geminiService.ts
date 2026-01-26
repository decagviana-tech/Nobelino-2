
import { GoogleGenAI, Type } from "@google/genai";
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
    return matchCount >= Math.ceil(terms.length * 0.4);
  }).sort((a, b) => (a.description ? -1 : 1)).slice(0, 15);
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
    stockContext = "O colaborador está apenas cumprimentando.";
  } else if (relevantBooks.length > 0) {
    stockContext = `DADOS REAIS DO ESTOQUE (USE EXATAMENTE ESTES PREÇOS):\n${relevantBooks.map(b => `- LIVRO: ${b.title} | PREÇO: R$ ${b.price} | ISBN: ${b.isbn}`).join('\n')}`;
  }

  const systemInstruction = `Você é o NOBELINO, o Consultor Técnico da Livraria Nobel.

REGRAS DE OURO PARA PREÇOS:
1. Você JAMAIS deve inventar, arredondar ou estimar um preço.
2. Use EXATAMENTE o valor que aparece em "PREÇO" no contexto acima. 
3. Se o contexto diz "R$ 69.9", o orçamento deve ser "69.9", nunca "68.15" ou qualquer outro valor.

INSTRUÇÃO PARA ORÇAMENTOS (JSON):
Se o usuário pedir orçamento, retorne EXATAMENTE este formato:
{
  "responseText": "Confirmação amigável",
  "estimate": {
    "customerName": "Nome do cliente",
    "items": [
      {"title": "Título exato", "price": 69.90, "isbn": "ISBN exato", "status": "available"}
    ],
    "total": 69.90
  }
}

CONTEXTO DO ACERVO:
${stockContext}

REGRAS DA LOJA:
${rulesText}
${processesText}`;

  try {
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
        temperature: 0.1, // Menor temperatura = maior precisão
        responseMimeType: query.toLowerCase().includes('orçamento') || query.toLowerCase().includes('proposta') ? "application/json" : "text/plain"
      }
    });

    const text = response.text;
    
    if (text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      return {
        responseText: data.responseText || "🦉 Orçamento gerado!",
        recommendedBooks: relevantBooks,
        isLocalResponse: false,
        detectedEstimate: data.estimate
      };
    }

    return {
      responseText: text || "🦉 Em que posso ajudar?",
      recommendedBooks: relevantBooks,
      isLocalResponse: false
    };
  } catch (error) {
    return {
      responseText: "🦉 Tive um erro técnico. Pode repetir?",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
