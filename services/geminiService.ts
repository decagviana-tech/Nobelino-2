
import { GoogleGenAI } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, SalesGoal, PortableProcess, Estimate } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  isLocalResponse: boolean;
  isQuotaError?: boolean;
  detectedEstimate?: Partial<Estimate>;
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledge: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = [],
  processes: PortableProcess[] = []
): Promise<AIResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  const rulesText = knowledge.map(k => `[INFO]: ${k.content}`).join('\n');
  const processesText = processes.map(p => `[PROCESSO]: ${p.name} - ${p.steps.join(' -> ')}`).join('\n');

  const systemInstruction = `Você é o NOBELINO, o Vendedor Digital da Livraria Nobel.
Sua aparência: Coruja amarela, camisa polo preta e orelhinhas pontiagudas.

DIRETRIZES:
1. Comece identificando o colaborador. Se o nome estiver na lista abaixo, trate-o com carinho.
2. Seja um vendedor consultivo: ofereça livros do estoque real.
3. Se não souber algo, diga: "Ainda estou aprendendo essa parte do cérebro da Nobel 🦉".

MEMÓRIA DA LOJA:
${rulesText || "Sem regras específicas no momento."}
${processesText || "Sem processos de equipe no momento."}

ESTOQUE DESTAQUE:
${inventory.slice(0, 8).map(b => `- ${b.title} (R$ ${b.price})`).join('\n')}

Linguagem: Rápida, eficiente e cheia de emojis de coruja e livros.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.slice(-8).map(m => ({ 
          role: m.role === 'user' ? 'user' : 'model' as any, 
          parts: [{ text: m.content }] 
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: { systemInstruction, temperature: 0.2 }
    });

    return {
      responseText: response.text || "🦉 Pensando...",
      recommendedBooks: [],
      isLocalResponse: false
    };
  } catch (error) {
    return {
      responseText: "🦉 Minha conexão falhou. Verifique sua chave API no menu lateral.",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
