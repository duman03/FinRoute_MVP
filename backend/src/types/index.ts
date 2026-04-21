// src/interfaces/common.ts

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  pagination?: Pagination;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface Pagination {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
}

// src/interfaces/database.ts

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  deleted_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface Holding {
  id: (string | number);
  portfolio_id: string;
  asset_symbol: string;
  quantity: number;
  average_price: number;
  market_value?: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface Transaction {
  id: string;
  portfolio_id: string;
  type: 'BUY' | 'SELL';
  asset_symbol: string;
  quantity: number;
  price: number;
  total_amount: number;
  transaction_date: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}