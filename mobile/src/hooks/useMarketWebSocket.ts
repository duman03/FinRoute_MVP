import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePriceStore } from '../store/priceStore';
import { priceStreamService } from '../services/priceStreamService';

export function useMarketWebSocket(): void {
  const accessToken = useAuthStore((state) => state.accessToken);
  const authStatus = useAuthStore((state) => state.authStatus);

  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED' || !accessToken) {
      priceStreamService.disconnect();
      usePriceStore.getState().setWsStatus('disconnected');
      return;
    }

    usePriceStore.getState().setWsStatus('connecting');
    priceStreamService.connect(accessToken);

    return () => {
      priceStreamService.disconnect();
    };
  }, [accessToken, authStatus]);
}
