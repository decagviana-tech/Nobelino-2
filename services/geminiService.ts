
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
    stockContext = `ITENS DO ACERVO ENCONTRADOS:\n${relevantBooks.map(b => `- ${b.title} | R$ ${b.price} | Estoque: ${b.stockCount} | ISBN: ${b.isbn}`).join('\n')}`;
  }

  const systemInstruction = `Você é o NOBELINO, o Consultor Técnico da Livraria Nobel. 

INSTRUÇÃO PARA ORÇAMENTOS:
Se o usuário pedir para "gerar orçamento", "fazer proposta" ou "salvar lista para cliente", você DEVE responder em formato JSON estrito para que o sistema capture os dados.
O JSON deve ter este formato:
{
  "responseText": "Sua resposta amigável confirmando a criação do orçamento",
  "estimate": {
    "customerName": "Nome do cliente (se mencionado)",
    "items": [
      {"title": "Título", "price": 59.90, "isbn": "12345", "status": "available"}
    ],
    "total": 59.90
  }
}

Se NÃO for um pedido de orçamento, responda apenas com texto normal.

COMPORTAMENTO:
- Saudações: Pergunte o nome do colaborador.
- Sem Notas Técnicas: NUNCA use "*(Nota: ...)*".
- Estoque: Fale com naturalidade sobre disponibilidade.

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
        temperature: 0.2,
        responseMimeType: query.toLowerCase().includes('orçamento') || query.toLowerCase().includes('proposta') ? "application/json" : "text/plain"
      }
    });

    const text = response.text;
    
    if (text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      return {
        responseText: data.responseText || "🦉 Orçamento gerado com sucesso!",
        recommendedBooks: relevantBooks,
        isLocalResponse: false,
        detectedEstimate: data.estimate
      };
    }

    return {
      responseText: text || "🦉 Como posso ajudar no balcão hoje?",
      recommendedBooks: relevantBooks,
      isLocalResponse: false
    };
  } catch (error) {
    return {
      responseText: "🦉 Estou com dificuldades para processar isso agora. Pode tentar de novo?",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
