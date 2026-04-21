import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export function beginTradeSession(): string {
  const { useTradeStore } = require('../store/tradeStore');
  const key = uuidv4();
  useTradeStore.getState().setIdempotencyKey(key);
  return key;
}

export function endTradeSession(): void {
  const { useTradeStore } = require('../store/tradeStore');
  useTradeStore.getState().setIdempotencyKey(null);
}

export function getIdempotencyKey(): string | null {
  const { useTradeStore } = require('../store/tradeStore');
  return useTradeStore.getState().idempotencyKey;
}
