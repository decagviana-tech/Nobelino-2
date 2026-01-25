import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import { Book, ChatMessage, KnowledgeEntry, SalesGoal } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  groundingUrls?: { uri: string; title: string }[];
  isQuotaError?: boolean;
  isAuthError?: boolean;
}

const consultarEstoqueFunction: FunctionDeclaration = {
  name: "consultarEstoque",
  parameters: {
    type: Type.OBJECT,
    description: "Busca livros no estoque da Nobel por título, autor ou ISBN.",
    properties: { termo: { type: Type.STRING, description: "O nome do livro ou autor" } },
    required: ["termo"],
  },
};

const isRetryableError = (error: any) => {
  const msg = JSON.stringify(error).toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('limit');
};

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.length < 10) return { responseText: "🦉 Chave ausente no Netlify.", recommendedBooks: [], isAuthError: true };

  // Usamos o Flash Lite que é mais resiliente a erros de quota (429)
  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-flash-lite-latest"; 
  
  const today = new Date().toISOString().split('T')[0];
  const goal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0 };
  
  // PREPARAÇÃO DA MEMÓRIA: Pegamos as regras ativas para injetar no sistema
  const activeRules = knowledgeBase
    .filter(k => k.active)
    .map(k => `REGRA [${k.topic}]: ${k.content}`)
    .join('\n');

  const systemInstruction = `Você é o NOBELINO, o assistente de vendas da Livraria Nobel.
SUA MEMÓRIA ATUALIZADA (REGRAS DA LOJA):
${activeRules || "Nenhuma regra específica cadastrada ainda."}

DADOS DE HOJE (${today}):
- Meta do dia: R$ ${goal.minGoal}
- Vendas até agora: R$ ${goal.actualSales}

DIRETRIZES:
1. Use as REGRAS acima como prioridade absoluta. Nunca invente promoções que não estão nas regras.
2. Se o cliente perguntar algo que não está nas regras nem no estoque, diga que não sabe ou ofereça buscar informações (Search).
3. Seja breve, simpático e focado em fechar a venda.`;

  const contents = history.slice(-4).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content || "" }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: { 
        systemInstruction, 
        tools: [{ functionDeclarations: [consultarEstoqueFunction] }, { googleSearch: {} }], 
        temperature: 0.2
      }
    });

    const candidate = response.candidates?.[0];
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      return {
        responseText: response.text || "🦉 Como posso ajudar?",
        recommendedBooks: [],
        groundingUrls: candidate?.groundingMetadata?.groundingChunks
          ?.filter((c: any) => c.web).map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
      };
    }

    const functionResponses = [];
    const allMatches: Book[] = [];

    for (const fc of functionCalls) {
      const termo = String(fc.args.termo || "").toLowerCase();
      const matches = inventory.filter(b => 
        b.title.toLowerCase().includes(termo) || 
        b.isbn.includes(termo) || 
        b.author.toLowerCase().includes(termo)
      ).slice(0, 3);
      allMatches.push(...matches);
      functionResponses.push({
        functionResponse: { name: fc.name, id: fc.id, response: { result: matches.length > 0 ? "Livros encontrados no estoque." : "Item esgotado no momento." } }
      });
    }

    const secondTurn = await ai.models.generateContent({
      model: modelName,
      contents: [...contents, { role: 'model', parts: candidate?.content?.parts || [] }, { role: 'user', parts: functionResponses as any }],
      config: { systemInstruction, temperature: 0.2 }
    });

    return {
      responseText: secondTurn.text || "🦉 Verifiquei o estoque para você.",
      recommendedBooks: allMatches,
      groundingUrls: secondTurn.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((c: any) => c.web).map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
    };

  } catch (error: any) {
    if (isRetryableError(error)) return { responseText: "🦉 O Google me deu um cansaço (limite de velocidade)! Vamos aguardar uns segundos e tentar de novo?", recommendedBooks: [], isQuotaError: true };
    return { responseText: "🦉 Tive um tropeço técnico. Pode repetir?", recommendedBooks: [] };
  }
}

export async function speakText(text: string): Promise<string | undefined> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return undefined;
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text.slice(0, 200) }] }], 
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) { return undefined; }
}

export async function enrichBooks(books: Book[]): Promise<Partial<Book>[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Enriqueça estes ISBNs: ${books.map(b => b.isbn).join(',')}`,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) { return []; }
}