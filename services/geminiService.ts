
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Book, ChatMessage, KnowledgeEntry, SalesGoal } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  groundingUrls?: { uri: string; title: string }[];
  isQuotaError?: boolean;
}

const consultarEstoqueFunction: FunctionDeclaration = {
  name: "consultarEstoqueInterno",
  parameters: {
    type: Type.OBJECT,
    description: "Busca livros no estoque físico da livraria por título, autor ou ISBN.",
    properties: {
      termo: { type: Type.STRING, description: "O nome do livro, autor ou termo de busca." },
    },
    required: ["termo"],
  },
};

const isRetryableError = (error: any) => {
  const msg = JSON.stringify(error).toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('limit') || 
         msg.includes('500') || msg.includes('unknown');
};

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = [],
  disableGrounding: boolean = false
): Promise<AIResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const today = new Date().toISOString().split('T')[0];
  const todayGoal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  
  const salesContext = `[SISTEMA - DADOS PRIVADOS]: Hoje foi vendido R$ ${todayGoal.actualSales.toFixed(2)} de uma meta de R$ ${todayGoal.minGoal.toFixed(2)}.`;
  const personalKnowledge = knowledgeBase.filter(k => k.active).map(k => `[REGRA/CONHECIMENTO]: ${k.topic}: ${k.content}`).join('\n');

  const systemInstruction = `VOCÊ É O NOBELINO 🦉, o assistente digital oficial da Livraria Nobel.
  Sua aparência: Uma corujinha amarela vibrante usando uma camisa polo preta elegante com o logo da Nobel.

  REGRAS CRÍTICAS DE COMPORTAMENTO:
  1. FOCO NO CLIENTE: Seu objetivo principal é ajudar o vendedor a encontrar o livro certo e dar argumentos de venda.
  2. SIGILO DE DADOS FINANCEIROS: Você tem acesso aos dados de metas, mas NÃO deve mencioná-los em conversas sobre indicações de livros ou dúvidas gerais. Só informe valores de venda ou progresso de metas se o vendedor perguntar EXPLICITAMENTE.
  3. WHATSAPP E REDES SOCIAIS: NÃO gere automaticamente "Dicas de Venda" ou modelos de mensagem. Forneça esses textos APENAS se o usuário solicitar ajuda específica.
  4. ESTOQUE: Sempre priorize o que está no estoque físico. Use o gatilho de "última unidade no balcão" se houver 1 ou 2.
  5. PARCEIROS: Se não houver estoque, lembre o vendedor de consultar Catavento ou Ramalivros.
  6. ESTILO: Seja carismático, use emojis de livros e termine com 🦉.

  CONTEXTO ATUAL:
  ${salesContext}
  ${personalKnowledge}`;

  const contents = history.slice(-5).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content || "" }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  const tools: any[] = [{ functionDeclarations: [consultarEstoqueFunction] }];
  if (!disableGrounding) tools.push({ googleSearch: {} });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: { systemInstruction, tools, temperature: 0.4 }
    });

    const candidate = response.candidates?.[0];
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      const parts = candidate?.content?.parts || [];
      const text = parts.filter(p => p.text).map(p => p.text).join("\n") || "🦉 Como posso ajudar?";
      
      return {
        responseText: text,
        recommendedBooks: [],
        groundingUrls: (candidate?.groundingMetadata?.groundingChunks || [])
          .filter((c: any) => c.web)
          .map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
      };
    }

    const functionResponses = [];
    const allMatches: Book[] = [];

    for (const fc of functionCalls) {
      const termoBusca = String(fc.args.termo || "").toLowerCase();
      const matches = inventory.filter(b => 
        b.title.toLowerCase().includes(termoBusca) || 
        b.isbn.includes(termoBusca) || 
        b.author.toLowerCase().includes(termoBusca)
      ).slice(0, 3);

      allMatches.push(...matches);
      const inventoryData = matches.length > 0 
        ? matches.map(m => `- ${m.title}: R$ ${m.price.toFixed(2)} [Estoque: ${m.stockCount}]`).join('\n')
        : `Não encontrei "${termoBusca}" no estoque físico. Sugiro olhar no sistema central ou distribuidores.`;
      
      functionResponses.push({
        functionResponse: {
          name: fc.name,
          id: fc.id,
          response: { result: inventoryData }
        }
      });
    }

    const secondTurn = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...contents,
        { role: 'model', parts: candidate?.content?.parts || [] },
        { role: 'user', parts: functionResponses as any }
      ],
      config: { systemInstruction, temperature: 0.3 }
    });

    return {
      responseText: secondTurn.text || "🦉 Encontrei isso para você no estoque:",
      recommendedBooks: Array.from(new Set(allMatches.map(b => b.id)))
        .map(id => allMatches.find(b => b.id === id)!)
    };

  } catch (error: any) {
    if (isRetryableError(error)) return { responseText: "🦉 Estou processando muitas informações! Um segundo...", recommendedBooks: [], isQuotaError: true };
    return { responseText: "🦉 Tive um pequeno problema técnico. Pode repetir?", recommendedBooks: [] };
  }
}

export async function enrichBooks(books: Book[], retries = 2): Promise<Partial<Book>[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Enriqueça estes ISBNs para venda: ${books.map(b => b.isbn).join(', ')}.`,
      config: {
        systemInstruction: "Retorne JSON: [{isbn, author, description, genre, targetAge}]",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              isbn: { type: Type.STRING },
              author: { type: Type.STRING },
              description: { type: Type.STRING },
              genre: { type: Type.STRING },
              targetAge: { type: Type.STRING },
            },
            required: ["isbn", "author", "description", "genre", "targetAge"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e: any) {
    if (retries > 0 && isRetryableError(e)) {
      await new Promise(r => setTimeout(r, 15000));
      return enrichBooks(books, retries - 1);
    }
    throw e;
  }
}
