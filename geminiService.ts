
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, SalesGoal } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  groundingUrls?: { uri: string; title: string }[];
}

const consultarEstoqueFunction: FunctionDeclaration = {
  name: "consultarEstoque",
  parameters: {
    type: Type.OBJECT,
    description: "Busca livros no estoque da Nobel por título ou autor.",
    properties: { termo: { type: Type.STRING, description: "O nome do livro ou autor" } },
    required: ["termo"],
  },
};

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview"; 
  
  const activeRules = knowledgeBase
    .filter(k => k.active)
    .map(k => `REGRA: ${k.content}`)
    .join('\n');

  const systemInstruction = `Você é o NOBELINO, o assistente virtual da Livraria Nobel.
IDENTIDADE: Uma corujinha amarela simpática com camisa polo preta da Nobel.
REGRAS:
${activeRules}
Use ferramentas para consultar o estoque quando necessário. Seja um vendedor experiente.`;

  const contents = history.slice(-5).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  const response = await ai.models.generateContent({
    model,
    contents,
    config: { 
      systemInstruction, 
      tools: [{ functionDeclarations: [consultarEstoqueFunction] }, { googleSearch: {} }],
    }
  });

  const candidate = response.candidates?.[0];
  const functionCalls = response.functionCalls;

  if (functionCalls && functionCalls.length > 0) {
    const fc = functionCalls[0];
    const termo = String((fc as any).args?.termo || "").toLowerCase();
    const matches = inventory.filter(b => 
      b.title.toLowerCase().includes(termo) || b.author.toLowerCase().includes(termo)
    ).slice(0, 3);

    const secondTurn = await ai.models.generateContent({
      model,
      contents: [
        ...contents, 
        { role: 'model', parts: candidate?.content?.parts || [] },
        { 
          role: 'user', 
          parts: [{ 
            functionResponse: { 
              name: fc.name, 
              id: fc.id, 
              response: { result: matches.length > 0 ? "Livros encontrados" : "Não encontrado" } 
            } 
          }] 
        }
      ],
      config: { systemInstruction }
    });

    return {
      responseText: secondTurn.text || "Consultei o estoque para você.",
      recommendedBooks: matches
    };
  }

  return {
    responseText: response.text || "Não entendi, pode repetir?",
    recommendedBooks: []
  };
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
