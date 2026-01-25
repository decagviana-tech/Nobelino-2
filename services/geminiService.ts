
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
  if (!apiKey) throw new Error("A chave de API não foi configurada.");

  // Sempre cria uma nova instância para garantir que usa a chave atualizada do seletor
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview"; 
  
  const activeRules = knowledgeBase
    .filter(k => k.active)
    .map(k => `REGRA: ${k.content}`)
    .join('\n');

  const systemInstruction = `Você é o NOBELINO, assistente oficial da Livraria Nobel.
IDENTIDADE: Coruja amarela simpática de camisa polo preta da Nobel.
CONTEXTO: Vendedor experiente, culto e ágil.
REGRAS ATIVAS:
${activeRules}

Se o cliente perguntar algo sobre livros, use a ferramenta 'consultarEstoque'. 
Se perguntar algo geral ou atual, use a ferramenta 'googleSearch'.
Responda de forma vendedora e carismática.`;

  const contents = history.slice(-5).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  try {
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
                response: { result: matches.length > 0 ? "Livros encontrados no sistema" : "Nenhum livro encontrado com esse nome no estoque atual" } 
              } 
            }] 
          }
        ],
        config: { systemInstruction }
      });

      return {
        responseText: secondTurn.text || "Verifiquei nosso estoque para você.",
        recommendedBooks: matches
      };
    }

    return {
      responseText: response.text || "Olá! Como posso ajudar na Nobel hoje?",
      recommendedBooks: []
    };
  } catch (error: any) {
    if (error.message?.includes("entity was not found")) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      throw new Error("Por favor, selecione uma chave válida.");
    }
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
      contents: [{ parts: [{ text: text.slice(0, 200) }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) { return undefined; }
}
