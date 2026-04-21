// Portfolio
export interface Portfolio {
  id: string;
  user_id: string;
  cash_balance: string; // NUMERIC → string (Kritik kural A-03, W4-R4: UI'da parseFloat kullanılabilir ancak API'ye string gönderilmeli)
  version: number;      // optimistic locking (P-01)
  holdings: Holding[];
}

export interface Holding {
  id: string;
  portfolio_id: string;
  symbol: string;
  quantity: string;      // NUMERIC → string
  avg_cost: string;      // NUMERIC → string
  version: number;       // optimistic locking
}

// Trade
export interface TradeSuccess {
  transactionId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  message: string;
}

export interface TradeError {
  code: string;
  message: string;
}

// Price
export interface PriceData {
  symbol: string;
  price: number;
  ts: number;
  source: string;
  stream_id?: string;
}
