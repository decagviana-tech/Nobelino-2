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
    throw new Error("A API_KEY não foi encontrada. Configure-a no ambiente do Netlify.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toISOString().split('T')[0];
  const todayGoal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  
  // Resumo do conhecimento para a IA não esquecer
  const personalKnowledge = knowledgeBase
    .filter(k => k.active)
    .map(k => `[CONHECIMENTO ATIVO]: ${k.topic}: ${k.content}`)
    .join('\n');

  // Amostra rápida do estoque para a IA ter "consciência" do que tem sem precisar chamar função o tempo todo
  const inventorySnapshot = inventory.slice(0, 10).map(b => `${b.title} (${b.author})`).join(', ');

  const systemInstruction = `VOCÊ É O NOBELINO 🦉, o vendedor digital oficial da Livraria Nobel.
  SUA APARÊNCIA: Corujinha amarela vibrante com camisa polo preta (Logo Nobel).
  
  CONTEXTO DE MEMÓRIA:
  ${personalKnowledge}
  ESTOQUE ATUAL (Amostra): ${inventorySnapshot}
  VENDAS HOJE: R$ ${todayGoal.actualSales.toFixed(2)} / Meta: R$ ${todayGoal.minGoal.toFixed(2)}

  REGRAS:
  1. Se o vendedor pedir sugestão, use 'consultarEstoqueInterno'.
  2. Responda SEMPRE de forma carismática e útil.
  3. Use emojis de livros e termine com 🦉.
  4. NUNCA responda apenas com espaços vazios.`;

  const contents = history.slice(-6).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user' as any,
    parts: [{ text: msg.content || "" }]
  }));
  contents.push({ role: 'user', parts: [{ text: query }] });

  const tools = [{ functionDeclarations: [consultarEstoqueFunction] }];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: { systemInstruction, tools, temperature: 0.5 }
    });

    const candidate = response.candidates?.[0];
    const functionCalls = response.functionCalls;

    // Se não chamou função, retorna o texto diretamente
    if (!functionCalls || functionCalls.length === 0) {
      const txt = response.text || "";
      return {
        responseText: txt.trim() || "🦉 Oi! Como posso te ajudar a vender hoje?",
        recommendedBooks: []
      };
    }

    // Processamento de chamadas de função (Estoque)
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
        ? matches.map(m => `- ${m.title}: R$ ${m.price.toFixed(2)} [Qtd: ${m.stockCount}]`).join('\n')
        : `Não encontrei "${termoBusca}" no acervo local.`;
      
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
      responseText: secondTurn.text || "🦉 Aqui estão as opções que encontrei no sistema:",
      recommendedBooks: Array.from(new Set(allMatches.map(b => b.id)))
        .map(id => allMatches.find(b => b.id === id)!)
    };

  } catch (error: any) {
    console.error("Erro Nobelino AI:", error);
    if (isRetryableError(error)) {
      return { 
        responseText: "🦉 Vixi, estou com muita demanda! Me dá um segundo e tenta de novo?", 
        recommendedBooks: [], 
        isQuotaError: true 
      };
    }
    return { 
      responseText: "🦉 Desculpe, tive um soluço técnico aqui no sistema da Nobel. Pode repetir?", 
      recommendedBooks: [] 
    };
  }
}

export async function speakText(text: string): Promise<string | undefined> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return undefined;
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Nobelino diz: ${text}` }] }],
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
      contents: `Enriqueça os dados técnicos desses ISBNs: ${books.map(b => b.isbn).join(', ')}.`,
      config: {
        systemInstruction: "Retorne estritamente um JSON: [{isbn, author, description, genre, targetAge}]",
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
      await new Promise(r => setTimeout(r, 10000));
      return enrichBooks(books, retries - 1);
    }
    return [];
  }
}