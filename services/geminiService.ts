
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

// Updated processUserQuery signature to support additional context from callers like components/ChatView.tsx
export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  // Support optional knowledge and sales goals context as expected by some components
  knowledge: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  // Instrução do Sistema Focada em Identidade e Marketing, enriquecida com regras e metas
  const systemInstruction = `Você é o NOBELINO, assistente digital da Livraria Nobel.

REGRAS DE OURO:
1. IDENTIFICAÇÃO: Sua prioridade zero é saber com quem fala. Se o histórico estiver vazio ou o usuário ainda não disse o nome, pergunte: "Olá! Nobelino no balcão. Com qual colaborador da loja eu falo agora?".
2. MODO PATRÍCIA: Se o colaborador for a PATRÍCIA, você é o Estrategista de Marketing dela. Escreva legendas criativas, sugira fotos para o feed, hashtags e campanhas de vendas. Foque 100% no Instagram e divulgação.
3. OUTROS COLABORADORES: Foque em estoque, preços e orçamentos rápidos de balcão.
4. DIRETO AO PONTO: Não dê instruções de como usar o chat. Vendedores não precisam de manual.

REGRAS ADICIONAIS:
${knowledge.length > 0 ? knowledge.map(k => `- ${k.topic}: ${k.content}`).join('\n') : "Nenhuma regra adicional registrada."}

METAS DE VENDAS ATUAIS:
${salesGoals.length > 0 ? salesGoals.map(g => `- Data: ${g.date} | Meta: R$ ${g.minGoal} | Realizado: R$ ${g.actualSales}`).join('\n') : "Metas não definidas."}

ESTOQUE ATUAL:
${inventory.slice(0, 20).map(b => `- ${b.title} | R$ ${b.price} | ISBN: ${b.isbn}`).join('\n')}`;

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
      config: { 
        systemInstruction,
        temperature: 0.3
      }
    });

    // Accessing .text property directly as per Gemini API guidelines
    const text = response.text || "";
    
    // Detecção simplificada de orçamento
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
      responseText: "🦉 O Nobelino precisou dar uma saída. Verifique sua chave API.",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
