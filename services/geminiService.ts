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

const isAuthError = (error: any) => {
  const msg = JSON.stringify(error).toLowerCase();
  return msg.includes('401') || msg.includes('403') || msg.includes('api_key') || msg.includes('invalid') || msg.includes('not found');
};

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  // ATENÇÃO: process.env.API_KEY é preenchido pelo Netlify durante o build.
  const apiKey = process.env.API_KEY;
  
  // Se a chave for undefined ou pequena demais, o deploy não pegou a variável ainda
  if (!apiKey || apiKey === "undefined" || apiKey === "" || apiKey.length < 10) {
    return { 
      responseText: "🦉 Deca, eu vi que a chave já está no Netlify! Agora, para eu 'acordar', você precisa fazer um novo PUSH no Git ou clicar em 'Trigger Deploy' no painel do Netlify.", 
      recommendedBooks: [], 
      isAuthError: true 
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const now = new Date();
  const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  const todayGoal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  
  const systemInstruction = `VOCÊ É O NOBELINO 🦉, o assistente da Livraria Nobel. 
Sua missão é ajudar o Deca a vender! 
Meta de hoje: R$ ${todayGoal.minGoal.toFixed(2)}.
Seja rápido, use emojis e foque no estoque da loja.`;

  const contents = history.slice(-6).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content || "" }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: { 
        systemInstruction, 
        tools: [{ functionDeclarations: [consultarEstoqueFunction] }, { googleSearch: {} }], 
        temperature: 0.4
      }
    });

    const candidate = response.candidates?.[0];
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      return {
        responseText: response.text || "🦉 Como posso ajudar no balcão hoje?",
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
      functionResponses.push({
        functionResponse: { name: fc.name, id: fc.id, response: { result: matches.length > 0 ? "Livros encontrados" : "Esgotado no estoque físico" } }
      });
    }

    const secondTurn = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [...contents, { role: 'model', parts: candidate?.content?.parts || [] }, { role: 'user', parts: functionResponses as any }],
      config: { systemInstruction, tools: [{googleSearch: {}}], temperature: 0.2 }
    });

    return {
      responseText: secondTurn.text || "🦉 Encontrei isso no acervo:",
      recommendedBooks: Array.from(new Set(allMatches.map(b => b.id))).map(id => allMatches.find(b => b.id === id)!),
      groundingUrls: secondTurn.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((c: any) => c.web).map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
    };

  } catch (error: any) {
    if (isAuthError(error)) return { responseText: "🦉 Erro de Chave: A API do Google não aceitou a chave. Verifique se ela está ativa no AI Studio.", recommendedBooks: [], isAuthError: true };
    if (isRetryableError(error)) return { responseText: "🦉 Muita gente na livraria! Tente de novo em alguns segundos.", recommendedBooks: [], isQuotaError: true };
    return { responseText: "🦉 Tive um probleminha de conexão. Verifique a chave no Netlify e faça um novo Deploy.", recommendedBooks: [] };
  }
}

export async function speakText(text: string): Promise<string | undefined> {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) return undefined;
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

export async function enrichBooks(books: Book[]): Promise<Partial<Book>[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) return [];
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Enriqueça: ${books.map(b => b.isbn).join(', ')}`,
      config: {
        systemInstruction: "Retorne JSON: [{isbn, author, description, genre, targetAge}]",
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) { return []; }
}