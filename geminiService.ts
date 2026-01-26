
import { GoogleGenAI } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, SalesGoal, EstimateItem, Estimate } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  groundingUrls?: { uri: string; title: string }[];
  isLocalResponse: boolean;
  isQuotaError?: boolean;
  detectedEstimate?: Partial<Estimate>;
}

function findRelevantBooks(query: string, inventory: Book[], limit = 10): Book[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return inventory.slice(0, 5);

  return inventory
    .map(book => {
      let score = 0;
      const searchable = `${book.title} ${book.author} ${book.genre} ${book.isbn}`.toLowerCase();
      terms.forEach(term => {
        if (searchable.includes(term)) score += 1;
        if (book.title.toLowerCase().includes(term)) score += 3;
      });
      return { book, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.book)
    .slice(0, limit);
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const activeRules = knowledgeBase.filter(k => k.active);
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  const relevantBooks = findRelevantBooks(query, inventory, 15);

  const systemInstruction = `Você é o NOBELINO, assistente da Livraria Nobel.

REGRAS DE CONDUTA:
1. IDENTIFICAÇÃO: Se o histórico estiver vazio ou o usuário não disse quem é, PERGUNTE: "Olá! Nobelino no balcão. Com qual colaborador da loja eu falo agora?".
2. CONTEXTO PATRÍCIA: Se o colaborador for a PATRÍCIA, foque em MARKETING e INSTAGRAM. Gere textos prontos, sugestões de fotos e campanhas de vendas. Seja o braço direito dela no marketing digital.
3. OUTROS COLABORADORES: Foque em estoque, preços e orçamentos de balcão.
4. FATURAMENTO (ORÇAMENTO): Sempre que citarem livros e um nome de cliente, gere um orçamento silenciosamente. Confirme com: "Orçamento salvo para [Nome]".

TREINAMENTO DA LOJA:
${activeRules.map(k => `- ${k.topic}: ${k.content}`).join('\n')}

ESTOQUE DISPONÍVEL:
${relevantBooks.map(b => `- ${b.title} | R$ ${b.price} | Qtd: ${b.stockCount} | ISBN: ${b.isbn}`).join('\n')}`;

  try {
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
        temperature: 0.2
      }
    });

    const text = response.text;
    
    // Detecção Automática de Orçamento (Fatura)
    let detectedItems: EstimateItem[] = [];
    let customerName = "Cliente Balcão";
    
    const nameMatch = query.match(/(?:para|cliente|nome)\s+([A-Z][a-z]+)/);
    if (nameMatch) customerName = nameMatch[1];

    // Se o Nobelino confirmou ou o usuário pediu explicitamente
    if (text.toLowerCase().includes('orçamento') || text.toLowerCase().includes('salvo') || query.toLowerCase().includes('orçamento')) {
      relevantBooks.forEach(b => {
        if (query.toLowerCase().includes(b.title.toLowerCase()) || text.toLowerCase().includes(b.title.toLowerCase())) {
          detectedItems.push({
            bookId: b.id,
            title: b.title,
            isbn: b.isbn,
            price: b.price,
            quantity: 1,
            status: b.stockCount > 0 ? 'available' : 'order'
          });
        }
      });
    }

    return {
      responseText: text,
      recommendedBooks: relevantBooks,
      isLocalResponse: false,
      detectedEstimate: detectedItems.length > 0 ? {
        customerName,
        items: detectedItems,
        total: detectedItems.reduce((s, i) => s + i.price, 0)
      } : undefined
    };
  } catch (error: any) {
    return {
      responseText: "🦉 Nobelino offline. Verifique a conexão.",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
