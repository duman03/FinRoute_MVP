import { AppState, AppStateStatus } from 'react-native';
import { axiosInstance } from '../api/axiosInstance';
import { usePriceStore } from '../store/priceStore';

const DEFAULT_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];

class PriceStreamService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private symbols: string[] = DEFAULT_SYMBOLS;

  // W4-R3: Cold start initial ID '0-0'
  private lastStreamId: string = '0-0';

  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isIntentionallyClosed: boolean = false;
  private appStateSubscription: any = null;

  constructor() {
    // Z-1 Düzeltmesi: Lifecycle takibi (Background/Foreground)
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      this.pause();
    } else if (nextAppState === 'active') {
      this.resume();
    }
  };

  private getWsUrl(): string {
    const httpUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    // Remove /api/v1 if present to get the base domain
    const baseHost = httpUrl.replace(/\/api\/v1\/?$/, '');
    const wsHost = baseHost.replace('http://', 'ws://').replace('https://', 'wss://');
    return `${wsHost}/ws/prices?token=${this.token}`;
  }

  public connect(token: string, symbols: string[] = DEFAULT_SYMBOLS) {
    this.token = token;
    this.symbols = symbols;
    this.isIntentionallyClosed = false;
    this.reconnectAttempts = 0;

    // N-01 Replay mekanizması ile başla (veriler tamamlandıktan sonra WS açılır)
    this.replayAndConnect();
  }

  private async replayAndConnect() {
    if (this.isIntentionallyClosed) return;

    try {
      // 1. Replay İsteği At (Kaçırılan verileri topla)
      const symbolsQuery = this.symbols.join(',');

      const response = await axiosInstance.get('/prices/replay', {
        params: {
          since_id: this.lastStreamId,
          symbols: symbolsQuery
        }
      });

      if (response.data?.success && response.data.data) {
        const replayEntries = response.data.data;
        if (response.data.last_id) {
          this.lastStreamId = response.data.last_id; // Update stream ID
        }

        // Replay'den dönen verileri Store'a yaz
        replayEntries.forEach((entry: any) => {
          this.handlePriceUpdate(entry);
        });
      }
    } catch (err) {
      console.warn('Replay fetch fail:', err);
    }

    // 2. WebSocket'i Başlat
    this.establishConnection();
  }

  private establishConnection() {
    if (this.isIntentionallyClosed || !this.token) return;

    this.ws = new WebSocket(this.getWsUrl());

    this.ws.onopen = () => {
      console.log('Price WS Connected');
      this.reconnectAttempts = 0; // Reset exponential backoff
      usePriceStore.getState().setWsStatus('connected');

      // Default sembollere subscribe ol
      this.symbols.forEach((symbol) => {
        this.ws?.send(JSON.stringify({ action: 'subscribe', symbol }));
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'price_update') {
          // Gelen mesajda stream_id varsa, lastStreamId'yi replay için güncelle
          if (data.stream_id) {
            this.lastStreamId = data.stream_id;
          }
          this.handlePriceUpdate(data);
        }
      } catch (err) {
        console.error('Error parsing WS message', err);
      }
    };

    this.ws.onclose = () => {
      console.log('Price WS Disconnected');
      this.ws = null;
      usePriceStore.getState().setWsStatus('disconnected');
      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('Price WS Error:', error);
      // onclose otomatik çalışıp reconnect'i tetikleyecek
    };
  }

  private handlePriceUpdate(data: any) {
    if (data && data.symbol) {
      usePriceStore.getState().setPrice(data.symbol, String(data.price));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    let delay = Math.pow(2, this.reconnectAttempts) * 1000;
    if (delay > 30000) delay = 30000;

    this.reconnectAttempts++;
    console.log(`Scheduling WS reconnect in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.replayAndConnect();
    }, delay);
  }

  public disconnect() {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public pause() {
    console.log('AppState Background -> Pausing WS');
    this.disconnect();
    // Intentionally closed, but keep tokens and config for resume
    this.isIntentionallyClosed = true;
  }

  public resume() {
    if (this.token) {
      console.log('AppState Active -> Resuming WS');
      this.isIntentionallyClosed = false;
      this.reconnectAttempts = 0;
      this.replayAndConnect();
    }
  }
}

export const priceStreamService = new PriceStreamService();
