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

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("A API_KEY não foi encontrada no ambiente.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toISOString().split('T')[0];
  const todayGoal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  
  const salesContext = `[SISTEMA - DADOS PRIVADOS]: Hoje foi vendido R$ ${todayGoal.actualSales.toFixed(2)} de uma meta de R$ ${todayGoal.minGoal.toFixed(2)}.`;
  const personalKnowledge = knowledgeBase.filter(k => k.active).map(k => `[REGRA/CONHECIMENTO]: ${k.topic}: ${k.content}`).join('\n');

  const systemInstruction = `VOCÊ É O NOBELINO 🦉, o assistente digital oficial da Livraria Nobel.
  Sua aparência: Uma corujinha amarela vibrante usando uma camisa polo preta elegante com o logo da Nobel.

  REGRAS CRÍTICAS DE COMPORTAMENTO:
  1. FOCO NO CLIENTE: Ajude o vendedor a encontrar o livro certo.
  2. ESTOQUE: Sempre use a ferramenta de estoque para verificar disponibilidade.
  3. ESTILO: Seja carismático, use emojis e termine com 🦉.`;

  const contents = history.slice(-5).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content || "" }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  // IMPORTANTE: Não misturar googleSearch com functionDeclarations
  const tools = [{ functionDeclarations: [consultarEstoqueFunction] }];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: { systemInstruction, tools, temperature: 0.4 }
    });

    const candidate = response.candidates?.[0];
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      return {
        responseText: response.text || "🦉 Como posso ajudar?",
        recommendedBooks: []
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
      ).slice(0, 3);

      allMatches.push(...matches);
      const inventoryData = matches.length > 0 
        ? matches.map(m => `- ${m.title}: R$ ${m.price.toFixed(2)} [Estoque: ${m.stockCount}]`).join('\n')
        : `Não encontrei "${termoBusca}" no estoque físico.`;
      
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
      responseText: secondTurn.text || "🦉 Encontrei isso no estoque:",
      recommendedBooks: Array.from(new Set(allMatches.map(b => b.id)))
        .map(id => allMatches.find(b => b.id === id)!)
    };

  } catch (error: any) {
    console.error("Erro na API Gemini:", error);
    if (isRetryableError(error)) return { responseText: "🦉 Muita gente falando comigo! Tente de novo em instantes.", recommendedBooks: [], isQuotaError: true };
    throw error;
  }
}

export async function speakText(text: string): Promise<string | undefined> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return undefined;
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Diga carismaticamente como um vendedor: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) {
    console.error("TTS Error:", e);
    return undefined;
  }
}

export async function enrichBooks(books: Book[], retries = 2): Promise<Partial<Book>[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY ausente.");
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Enriqueça estes ISBNs: ${books.map(b => b.isbn).join(', ')}.`,
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