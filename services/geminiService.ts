
import { GoogleGenAI } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, SalesGoal, EstimateItem, Estimate, PortableProcess } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  groundingUrls?: { uri: string; title: string }[];
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

  // Consolidação de todo o conhecimento disponível
  const rulesText = knowledge
    .filter(k => k.active !== false)
    .map(k => `[REGRA: ${k.topic}]: ${k.content}`)
    .join('\n');

  const processesText = processes
    .map(p => `[PROCESSO: ${p.name}]: ${p.steps.join(' -> ')}`)
    .join('\n');

  const systemInstruction = `Você é o NOBELINO, o assistente virtual da Livraria Nobel.
Sua aparência: Uma coruja amarela com camisa polo preta.

REGRAS CRÍTICAS DE MEMÓRIA:
1. VOCÊ SÓ CONHECE O QUE ESTÁ NA "BASE DE CONHECIMENTO" ABAIXO.
2. SE A BASE ESTIVER VAZIA, diga: "Ainda não recebi instruções sobre funcionários ou regras específicas no meu cérebro."
3. NÃO INVENTE nomes como Patrícia, Andrea ou qualquer outro se não estiverem listados abaixo.
4. Se o usuário se identificar, verifique se o nome consta nos processos ou regras. Se sim, use a função dele.

BASE DE CONHECIMENTO (MEMÓRIAS DO CÉREBRO):
--- REGRAS ---
${rulesText || "Nenhuma regra de negócio cadastrada."}

--- PROCESSOS E EQUIPE ---
${processesText || "Nenhum processo ou nome de colaborador cadastrado."}

ESTOQUE (RESUMO):
${inventory.slice(0, 5).map(b => `${b.title} (R$ ${b.price})`).join(' | ')}

DIRETRIZ: Seja ágil, use emojis de livros 📚 e coruja 🦉. Se identifique como Nobelino no início de novas conversas.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.slice(-10).map(m => ({ 
          role: m.role === 'user' ? 'user' : 'model' as any, 
          parts: [{ text: m.content }] 
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: { 
        systemInstruction, 
        temperature: 0.1, // Quase zero para evitar alucinações e ser fiel aos dados
      }
    });

    return {
      responseText: response.text || "🦉 Estou processando as informações...",
      recommendedBooks: [],
      isLocalResponse: false
    };
  } catch (error: any) {
    return {
      responseText: "🦉 Minha conexão falhou. Verifique se sua Chave API está conectada no menu lateral.",
      recommendedBooks: [],
      isLocalResponse: true
    };
  }
}
