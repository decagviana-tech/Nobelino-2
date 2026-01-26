
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

export interface EstimateItem {
  bookId?: string;
  title: string;
  isbn?: string;
  price: number;
  quantity: number;
  status: 'available' | 'order' | 'unavailable';
  distributorSource?: string;
}

export interface Estimate {
  id: string;
  customerName: string;
  sellerName: string;
  items: EstimateItem[];
  total: number;
  createdAt: Date;
  status: 'pending' | 'converted' | 'cancelled';
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
  detectedEstimate?: Partial<Estimate>;
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
