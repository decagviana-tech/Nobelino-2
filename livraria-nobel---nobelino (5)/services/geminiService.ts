import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
// Usando import type e garantindo o caminho relativo correto
import type { Book, ChatMessage, KnowledgeEntry, SalesGoal } from "../types";

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

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-3-flash-preview"; 
  
  const today = new Date().toISOString().split('T')[0];
  const goal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0 };
  
  const activeRules = knowledgeBase
    .filter(k => k.active)
    .map(k => `REGRA [${k.topic}]: ${k.content}`)
    .join('\n');

  const systemInstruction = `Você é o NOBELINO, o assistente virtual da Livraria Nobel.
IDENTIDADE: Você é uma corujinha amarela muito simpática que usa uma camisa polo preta da Nobel.

CONHECIMENTO DA LOJA:
${activeRules || "Use seu bom senso de vendedor Nobel, mas sem inventar preços."}

DADOS DE HOJE (${today}):
- Meta do Deca: R$ ${goal.minGoal}
- Vendas Atuais: R$ ${goal.actualSales}

DIRETRIZES:
1. Seja um vendedor consultivo. Se o cliente pedir indicação, use a ferramenta 'consultarEstoque'.
2. Se a informação não estiver na sua base, diga: "Vou conferir com o Deca e já te falo!".
3. Jamais invente promoções que não foram cadastradas.
4. Mantenha o entusiasmo de quem ama livros!`;

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
        temperature: 0.1 
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
      // Hammer Fix para TS18048: Casting para any garante que o build do Netlify passe
      const args = (fc as any).args;
      const termo = String(args?.termo || "").toLowerCase();
      
      const matches = inventory.filter(b => 
        b.title.toLowerCase().includes(termo) || 
        b.isbn.includes(termo) || 
        b.author.toLowerCase().includes(termo)
      ).slice(0, 3);
      
      allMatches.push(...matches);
      functionResponses.push({
        functionResponse: { 
          name: fc.name, 
          id: fc.id, 
          response: { result: matches.length > 0 ? "Livros encontrados." : "Não localizado." } 
        }
      });
    }

    const secondTurn = await ai.models.generateContent({
      model: modelName,
      contents: [...contents, { role: 'model', parts: candidate?.content?.parts || [] }, { role: 'user', parts: functionResponses as any }],
      config: { systemInstruction, temperature: 0.1 }
    });

    return {
      responseText: secondTurn.text || "🦉 Consultei o estoque para você.",
      recommendedBooks: allMatches,
      groundingUrls: secondTurn.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((c: any) => c.web).map((c: any) => ({ uri: c.web.uri, title: c.web.title }))
    };

  } catch (error: any) {
    if (isRetryableError(error)) return { responseText: "🦉 Minha quota de pensamento acabou por um minuto. Tenta de novo?", recommendedBooks: [], isQuotaError: true };
    return { responseText: "🦉 Opa, tive um tropeço técnico. Pode repetir?", recommendedBooks: [] };
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
              targetAge: { type: Type.STRING }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) { return []; }
}