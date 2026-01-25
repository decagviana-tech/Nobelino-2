
export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  description: string;
  genre: string;
  targetAge: string;
  price: number;
  stockCount: number;
  enriched?: boolean;
}

export interface SalesGoal {
  id: string;
  date: string;
  minGoal: number;
  superGoal: number;
  actualSales: number;
}

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  type: 'promotion' | 'training' | 'rule';
  active: boolean;
}

export interface PortableProcess {
  id: string;
  name: string;
  steps: string[];
  category: 'venda' | 'organizacao' | 'atendimento';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestedBooks?: Book[];
  groundingUrls?: { uri: string; title: string }[];
  advisorNotes?: string;
  isQuotaError?: boolean;
  estimatedCost?: number;
  isLocalResponse?: boolean;
}

export interface UsageMetrics {
  dailyRequests: number;
  dailyEnrichments: number;
  lastResetDate: string;
  totalTokensEstimate: number;
  usageLimit?: number;
  estimatedTotalCost: number;
  localResolutionsCount: number;
}
