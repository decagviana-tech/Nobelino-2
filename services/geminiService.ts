
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import type { Book, ChatMessage, KnowledgeEntry, SalesGoal } from "../types";

export interface AIResult {
  responseText: string;
  recommendedBooks: Book[];
  groundingUrls?: { uri: string; title: string }[];
  isLocalResponse: boolean;
  isQuotaError?: boolean;
}

// Função de busca local para reduzir o contexto enviado à IA
function findRelevantBooks(query: string, inventory: Book[], limit = 5): Book[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return inventory.slice(0, limit);

  return inventory
    .map(book => {
      let score = 0;
      const searchable = `${book.title} ${book.author} ${book.genre} ${book.isbn}`.toLowerCase();
      terms.forEach(term => {
        if (searchable.includes(term)) score += 1;
        if (book.title.toLowerCase().includes(term)) score += 2; // Título vale mais
      });
      return { book, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.book)
    .slice(0, limit);
}

export async function processUserQuery(
  query: string,
  inventory: Book[],
  history: ChatMessage[],
  knowledgeBase: KnowledgeEntry[] = [],
  salesGoals: SalesGoal[] = []
): Promise<AIResult> {
  const normalizedQuery = query.toLowerCase().trim();
  const activeRules = knowledgeBase.filter(k => k.active);

  // 1. BUSCA LOCAL INSTANTÂNEA (ISBN ou Termo Exato)
  const isbnMatch = query.match(/\d{10,13}/);
  if (isbnMatch) {
    const book = inventory.find(b => b.isbn.includes(isbnMatch[0]));
    if (book) {
      return {
        responseText: `Localizei no acervo! O livro "${book.title}" de ${book.author} está disponível por R$ ${Number(book.price).toFixed(2)}. Temos ${book.stockCount} unidades em estoque.`,
        recommendedBooks: [book],
        isLocalResponse: true
      };
    }
  }

  // 2. SELEÇÃO DE CONTEXTO RELEVANTE (RAG Local)
  // Em vez de enviar 50 livros, enviamos apenas os 6 mais prováveis
  const relevantBooks = findRelevantBooks(query, inventory, 6);
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key não configurada");

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview"; 

  const today = new Date().toISOString().split('T')[0];
  const todayGoal = salesGoals.find(g => g.date === today) || { actualSales: 0, minGoal: 0, superGoal: 0 };
  
  const salesStatus = `VENDAS HOJE: R$ ${todayGoal.actualSales.toFixed(2)} (Meta: R$ ${todayGoal.minGoal.toFixed(2)})`;

  const manualContext = activeRules.length > 0 
    ? activeRules.map(k => `- ${k.topic}: ${k.content}`).join('\n')
    : "Sem regras específicas.";

  // Contexto de estoque filtrado (Muito mais leve em tokens!)
  const stockContext = relevantBooks.length > 0
    ? relevantBooks.map(b => `- ${b.title} | R$ ${b.price} | Stock: ${b.stockCount} | ISBN: ${b.isbn}`).join('\n')
    : "Nenhum livro específico encontrado na busca rápida. Use o conhecimento geral da Nobel.";

  const systemInstruction = `Você é o NOBELINO, assistente da Livraria Nobel.
${salesStatus}

REGRAS DA LOJA:
${manualContext}

LIVROS MAIS RELEVANTES PARA ESTA PERGUNTA:
${stockContext}

DIRETRIZES:
1. Seja breve e direto. Use o estoque acima para preços.
2. Se o livro não estiver na lista acima, diga que vai verificar no sistema master.
3. Mantenha o tom profissional e vendedor.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        // Enviamos apenas as últimas 4 mensagens para economizar tokens
        ...history.slice(-4).map(m => ({ 
          role: m.role === 'user' ? 'user' : 'model' as any, 
          parts: [{ text: m.content }] 
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: { 
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 800 
      }
    });

    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA");

    return {
      responseText: text,
      recommendedBooks: relevantBooks,
      isLocalResponse: false
    };
  } catch (error: any) {
    console.error("Erro na IA:", error);
    
    // FALLBACK: Se a IA falhar (por cota ou rede), tentamos uma resposta local baseada na busca
    if (relevantBooks.length > 0) {
      return {
        responseText: `Estou com uma alta demanda de consultas agora, mas verifiquei rapidamente no meu banco de dados local: Encontrei "${relevantBooks[0].title}" por R$ ${relevantBooks[0].price.toFixed(2)}. Posso ajudar com mais detalhes deste título?`,
        recommendedBooks: [relevantBooks[0]],
        isLocalResponse: true,
        isQuotaError: true
      };
    }

    return {
      responseText: "Tive um problema de conexão com meus servidores centrais. Posso tentar novamente em alguns segundos ou você pode buscar pelo ISBN diretamente.",
      recommendedBooks: [],
      isLocalResponse: true,
      isQuotaError: true
    };
  }
}
