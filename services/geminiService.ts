
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
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

/**
 * Enriches a batch of books with metadata from Gemini using structured output.
 */
export async function enrichBooks(books: Book[]): Promise<Partial<Book>[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("A API_KEY não foi encontrada.");

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const prompt = `Enriqueça as informações dos seguintes livros para o acervo da Livraria Nobel. 
  Forneça autor, descrição/sinopse detalhada em português, gênero literário e faixa etária sugerida.
  Retorne APENAS o JSON conforme o esquema solicitado.
  
  Livros para processar:
  ${books.map(b => `ISBN: ${b.isbn} | Título: ${b.title}`).join('\n')}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
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
          required: ["isbn", "author", "description", "genre", "targetAge"],
        },
      },
      temperature: 0.1,
    },
  });

  try {
    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (e) {
    console.error("Erro ao parsear resposta de enriquecimento:", e);
    return [];
  }
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("A API_KEY não foi encontrada.");

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  // Sincronização rigorosa de data (Local ISO)
  const now = new Date();
  const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  
  const todayGoal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  
  const systemInstruction = `VOCÊ É O NOBELINO 🦉, o assistente cognitivo e vendedor digital da Livraria Nobel.

VOCÊ TEM ACESSO AO PAINEL DE PERFORMANCE AGORA:
- DATA DE REFERÊNCIA: ${today}
- VENDA JÁ REALIZADA HOJE: R$ ${todayGoal.actualSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- META MÍNIMA DEFINIDA: R$ ${todayGoal.minGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- SUPER META (120%): R$ ${(todayGoal.minGoal * 1.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

SEU COMPORTAMENTO:
1. Quando o usuário (Deca ou equipe) perguntar sobre a meta, confirme que você está vendo o valor de R$ ${todayGoal.minGoal.toFixed(2)}.
2. Se a venda for zero, incentive a primeira venda do dia com entusiasmo.
3. Se a venda estiver perto da meta, use frases como "Estamos quase lá, só faltam R$ X para batermos a meta!".
4. Use o Google Search para tendências literárias se não souber algo.
5. Seja o parceiro número 1 do vendedor de balcão. Use emojis 🦉🚀✨.

REGRAS:
- Nunca invente números. Use APENAS os dados fornecidos acima.
- Se o estoque local for zero para um livro buscado, sugira consultar os distribuidores oficiais (Catavento ou Ramalivros).`;

  const contents = history.slice(-6).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content || "" }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  const tools = [{ functionDeclarations: [consultarEstoqueFunction] }, { googleSearch: {} }];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: { systemInstruction, tools, temperature: 0.3 }
    });

    const candidate = response.candidates?.[0];
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      return {
        responseText: response.text || "🦉 Como posso te ajudar a vender mais hoje?",
        recommendedBooks: [],
        groundingUrls: candidate?.groundingMetadata?.groundingChunks
          ?.filter((c: any) => c.web)
          .map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
      };
    }

    const functionResponses = [];
    const allMatches: Book[] = [];

    for (const fc of functionCalls) {
      const args = fc.args as any;
      const termoBusca = String(args.termo || "").toLowerCase();
      const matches = inventory.filter(b => 
        b.title.toLowerCase().includes(termoBusca) || 
        b.isbn.includes(termoBusca) || 
        b.author.toLowerCase().includes(termoBusca)
      ).slice(0, 5);

      allMatches.push(...matches);
      const inventoryData = matches.length > 0 
        ? matches.map(m => `- ${m.title}: R$ ${m.price.toFixed(2)} [ESTOQUE: ${m.stockCount}]`).join('\n')
        : `ESTOQUE LOCAL ZERADO para "${termoBusca}". Verifique distribuidores.`;
      
      functionResponses.push({
        functionResponse: { name: fc.name, id: fc.id, response: { result: inventoryData } }
      });
    }

    const secondTurn = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...contents,
        { role: 'model', parts: candidate?.content?.parts || [] },
        { role: 'user', parts: functionResponses as any }
      ],
      config: { systemInstruction, tools: [{googleSearch: {}}], temperature: 0.2 }
    });

    return {
      responseText: secondTurn.text || "🦉 Encontrei essas informações no sistema:",
      recommendedBooks: Array.from(new Set(allMatches.map(b => b.id)))
        .map(id => allMatches.find(b => b.id === id)!),
      groundingUrls: secondTurn.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.filter((c: any) => c.web)
        .map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
    };

  } catch (error: any) {
    if (isRetryableError(error)) return { responseText: "🦉 Estou processando muitos dados agora. Pode tentar novamente em 5 segundos?", recommendedBooks: [], isQuotaError: true };
    return { responseText: "🦉 Tive um pequeno soluço digital. Vamos tentar de novo?", recommendedBooks: [] };
  }
}

export async function speakText(text: string): Promise<string | undefined> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return undefined;
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) { return undefined; }
}
