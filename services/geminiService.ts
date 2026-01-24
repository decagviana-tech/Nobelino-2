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
    description: "Busca livros no estoque da Nobel.",
    properties: {
      termo: { type: Type.STRING, description: "Título ou autor." },
    },
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
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    return { 
      responseText: "🦉 Deca, a chave sumiu! Verifique o Netlify.", 
      recommendedBooks: [], 
      isAuthError: true 
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toISOString().split('T')[0];
  const goal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0 };
  
  const systemInstruction = `Você é o NOBELINO, assistente da Livraria Nobel. 
Ajude o Deca a vender. Meta de hoje: R$ ${goal.minGoal}. 
Seja breve e direto.`;

  const contents = history.slice(-4).map(msg => ({
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
        temperature: 0.3
      }
    });

    const candidate = response.candidates?.[0];
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      return {
        responseText: response.text || "🦉 Como posso ajudar?",
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
      const termo = String(args.termo || "").toLowerCase();
      const matches = inventory.filter(b => 
        b.title.toLowerCase().includes(termo) || b.isbn.includes(termo)
      ).slice(0, 3);
      allMatches.push(...matches);
      functionResponses.push({
        functionResponse: { name: fc.name, id: fc.id, response: { result: matches.length > 0 ? "Encontrado" : "Esgotado" } }
      });
    }

    const secondTurn = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [...contents, { role: 'model', parts: candidate?.content?.parts || [] }, { role: 'user', parts: functionResponses as any }],
      config: { systemInstruction, temperature: 0.2 }
    });

    return {
      responseText: secondTurn.text || "🦉 Encontrei isso:",
      recommendedBooks: Array.from(new Set(allMatches.map(b => b.id))).map(id => allMatches.find(b => b.id === id)!),
      groundingUrls: secondTurn.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((c: any) => c.web).map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
    };

  } catch (error: any) {
    console.error("Erro Gemini:", error);
    if (isRetryableError(error)) return { responseText: "🦉 O Google me deu um cansaço! Muita gente perguntando ao mesmo tempo.", recommendedBooks: [], isQuotaError: true };
    return { responseText: "🦉 Tive um tropeço técnico. Tente de novo?", recommendedBooks: [] };
  }
}

export async function speakText(text: string): Promise<string | undefined> {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.length < 10) return undefined;
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text.slice(0, 200) }] }], // Limita texto para poupar quota
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
  if (!apiKey || apiKey.length < 10) return [];
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `ISBNs: ${books.map(b => b.isbn).join(',')}`,
      config: {
        systemInstruction: "JSON: [{isbn, author, description, genre, targetAge}]",
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) { return []; }
}