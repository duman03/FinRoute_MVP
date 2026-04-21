import { create } from 'zustand';

// Tip tanımı ekle:
export type WsStatus = 'connected' | 'connecting' | 'disconnected';

interface PriceState {
  prices: Record<string, string>;
  wsStatus: WsStatus;                           // YENİ
  setPrice: (symbol: string, price: string) => void;
  setWsStatus: (s: WsStatus) => void;               // YENİ
}

export const usePriceStore = create<PriceState>((set) => ({
  prices: {},
  wsStatus: 'disconnected',                     // YENİ
  setPrice: (symbol, price) =>
    set((state) => ({ prices: { ...state.prices, [symbol]: price } })),
  setWsStatus: (s) => set({ wsStatus: s }),         // YENİ
}));

// Granüler hook — Z-2 korundu
export function usePriceSelector(symbol: string): string {
  return usePriceStore(s => s.prices[symbol] ?? '—');
}

