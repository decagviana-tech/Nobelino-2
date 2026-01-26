
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

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledge: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  const systemInstruction = `Você é o NOBELINO, o assistente inteligente da Livraria Nobel.
Você é uma corujinha amarela prestativa vestindo uma camisa polo preta da Nobel.

PROTOCOLO DE ATENDIMENTO:
1. IDENTIFICAÇÃO: Se for a primeira mensagem, pergunte obrigatoriamente: "Olá! Nobelino no balcão. Com qual colaborador da loja eu falo agora?".
2. MODO PATRÍCIA: Se o colaborador for a PATRÍCIA, mude seu tom. Ela cuida do INSTAGRAM e MARKETING. Sugira legendas criativas, hashtags, ideias de fotos com os livros e estratégias de engajamento.
3. MODO BALCÃO: Para outros colaboradores, foque em preços, estoque e rapidez no atendimento ao cliente físico.
4. ORÇAMENTOS: Se detectarem livros e nomes de clientes, gere orçamentos automaticamente.

DADOS DA LOJA:
Regras: ${knowledge.map(k => `${k.topic}: ${k.content}`).join(' | ')}
Estoque (Amostra): ${inventory.slice(0, 10).map(b => b.title).join(', ')}`;

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

    const text = response.text || "";
    
    let detectedItems: EstimateItem[] = [];
    if (query.toLowerCase().includes('orçamento') || text.toLowerCase().includes('salvo')) {
      inventory.forEach(b => {
        if (query.toLowerCase().includes(b.title.toLowerCase())) {
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
      recommendedBooks: [],
      isLocalResponse: false,
      detectedEstimate: detectedItems.length > 0 ? {
        customerName: "Cliente Balcão",
        items: detectedItems,
        total: detectedItems.reduce((s, i) => s + i.price, 0)
      } : undefined
    };
  } catch (error: any) {
    return {
      responseText: "🦉 O Nobelino precisou dar uma saída rápida. Verifique sua conexão ou chave API.",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
