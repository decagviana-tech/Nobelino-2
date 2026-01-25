
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, SalesGoal } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  groundingUrls?: { uri: string; title: string }[];
  isLocalResponse: boolean;
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const normalizedQuery = query.toLowerCase().trim();
  const activeRules = knowledgeBase.filter(k => k.active);

  // 1. BUSCA LOCAL INSTANTÂNEA EM ESTOQUE (Título ou ISBN)
  const isbnMatch = query.match(/\d{10,13}/);
  if (isbnMatch) {
    const book = inventory.find(b => b.isbn === isbnMatch[0]);
    if (book) {
      return {
        responseText: `Encontrei no estoque! O livro "${book.title}" está disponível por R$ ${Number(book.price).toFixed(2)}. Temos ${book.stockCount} unidades.`,
        recommendedBooks: [book],
        isLocalResponse: true
      };
    }
  }

  // 2. IA COM CONTEXTO HÍBRIDO (ESTOQUE + REGRAS + METAS)
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key não configurada");

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview"; 

  // Status de Metas de Hoje
  const today = new Date().toISOString().split('T')[0];
  const todayGoal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  
  const salesStatus = `STATUS DE VENDAS HOJE:
- Vendido até agora: R$ ${todayGoal.actualSales.toLocaleString('pt-BR')}
- Meta Mínima: R$ ${todayGoal.minGoal.toLocaleString('pt-BR')}
- Super Meta: R$ ${todayGoal.superGoal.toLocaleString('pt-BR')}
- Falta para meta mínima: R$ ${Math.max(0, todayGoal.minGoal - todayGoal.actualSales).toLocaleString('pt-BR')}`;

  const manualContext = activeRules.length > 0 
    ? activeRules.map(k => `REGRA [${k.topic}]: ${k.content}`).join('\n\n')
    : "Nenhuma regra de treinamento cadastrada.";

  const stockContext = inventory.slice(0, 50).map(b => 
    `- ${b.title} (ISBN: ${b.isbn}) | Preço: R$ ${b.price} | Estoque: ${b.stockCount}`
  ).join('\n');

  const systemInstruction = `Você é o NOBELINO, o assistente inteligente da Livraria Nobel.

${salesStatus}

MANUAL DA LOJA (REGRAS E PROCESSOS):
${manualContext}

ESTOQUE EM DESTAQUE:
${stockContext}

INSTRUÇÕES:
1. Responda SEMPRE de forma completa. Nunca corte frases ou valores monetários.
2. Se houver promoções (como a Matilda por 47,90), garanta que o valor completo seja escrito.
3. Priorize as REGRAS e o ESTOQUE para responder dúvidas técnicas.
4. Se perguntarem sobre preços, use o ESTOQUE acima.
5. Seja entusiasmado e use emojis moderadamente.`;

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
        temperature: 0.1,
        maxOutputTokens: 2048 // Aumentado para evitar truncamento como o "R$ 4" incompleto
      }
    });

    return {
      responseText: response.text || "Vou verificar isso com o gerente.",
      recommendedBooks: [],
      isLocalResponse: false
    };
  } catch (error) {
    console.error("Erro na IA:", error);
    return {
      responseText: "Tive um problema ao processar essa informação agora.",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
