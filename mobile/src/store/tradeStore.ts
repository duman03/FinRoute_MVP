import { create } from 'zustand';
import { axiosInstance } from '../api/axiosInstance';
import { getIdempotencyKey } from '../utils/idempotency';

interface TradeState {
  idempotencyKey: string | null;
  setIdempotencyKey: (key: string | null) => void;
  executeTrade: (params: {
    portfolioId: string;
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: number
  }) => Promise<{ success: boolean; errorCode?: string; errorMessage?: string }>;
}

export const useTradeStore = create<TradeState>((set) => ({
  idempotencyKey: null,
  setIdempotencyKey: (key) => set({ idempotencyKey: key }),

  executeTrade: async (params) => {
    try {
      // Z-3 Kuralı: Idempotency Key'i header'a ekle
      const key = getIdempotencyKey();

      await axiosInstance.post(`/portfolios/${params.portfolioId}/transactions`, {
        symbol: params.symbol,
        type: params.type,
        quantity: String(params.quantity),
      }, {
        headers: {
          'Idempotency-Key': key || '',
        },
      });

      return { success: true };
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      return {
        success: false,
        errorCode: errorData?.code || 'UNKNOWN_ERROR',
        errorMessage: errorData?.message || 'İşlem sırasında bir hata oluştu.',
      };
    }
  },
}));
