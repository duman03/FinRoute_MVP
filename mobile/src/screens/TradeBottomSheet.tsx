import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { axiosInstance } from '../api/axiosInstance';
import {
  beginTradeSession,
  endTradeSession,
  getIdempotencyKey,
} from '../utils/idempotency';

type TradeType = 'BUY' | 'SELL';
type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

interface ApiEnvelope<T> {
  data: T;
  error?: { message?: string } | string;
}

interface QueuedTradeResponse {
  transaction: {
    id: string;
    status: TransactionStatus;
  };
  message: string;
}

interface TransactionListItem {
  id: string;
  status: TransactionStatus;
  failure_reason: string | null;
}

interface Props {
  portfolioId: string;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

const MAX_RETRY = 3;
const BASE_DELAY = 500;
const POLL_INTERVAL_MS = 900;
const POLL_ATTEMPTS = 6;

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown, fallback: string): string {
  const responseError = (error as {
    response?: { data?: { error?: { message?: string } | string } };
  })?.response?.data?.error;

  if (typeof responseError === 'string') {
    return responseError;
  }

  if (responseError && typeof responseError === 'object' && responseError.message) {
    return responseError.message;
  }

  return fallback;
}

export default function TradeBottomSheet({
  portfolioId,
  onClose,
  onSuccess,
}: Props) {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>('BUY');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const attemptRef = useRef(0);

  const waitForTransactionResolution = useCallback(
    async (transactionId: string, symbolValue: string): Promise<TransactionStatus> => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);

        const response = await axiosInstance.get<ApiEnvelope<TransactionListItem[]>>(
          `/portfolios/${portfolioId}/transactions`,
          {
            params: {
              page: 1,
              limit: 20,
              symbol: symbolValue,
            },
          }
        );

        const transaction = (response.data.data ?? []).find((item) => item.id === transactionId);

        if (!transaction) {
          continue;
        }

        if (transaction.status === 'FAILED') {
          throw new Error(transaction.failure_reason || 'İşlem başarısız oldu.');
        }

        if (transaction.status === 'COMPLETED') {
          return 'COMPLETED';
        }
      }

      return 'PENDING';
    },
    [portfolioId]
  );

  const handleSubmit = useCallback(async () => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const normalizedQuantity = quantity.trim();

    if (!normalizedSymbol || !normalizedQuantity) {
      setErrorMsg('Sembol ve miktar zorunludur.');
      return;
    }

    if (Number.isNaN(Number(normalizedQuantity)) || Number(normalizedQuantity) <= 0) {
      setErrorMsg('Geçerli bir miktar girin.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    attemptRef.current = 0;

    const idempotencyKey = beginTradeSession();

    try {
      while (attemptRef.current <= MAX_RETRY) {
        try {
          const response = await axiosInstance.post<ApiEnvelope<QueuedTradeResponse>>(
            `/portfolios/${portfolioId}/transactions`,
            {
              symbol: normalizedSymbol,
              type: tradeType,
              quantity: normalizedQuantity,
            },
            {
              headers: {
                'Idempotency-Key': getIdempotencyKey() ?? idempotencyKey,
              },
            }
          );

          const transactionId = response.data.data.transaction.id;
          const status = await waitForTransactionResolution(transactionId, normalizedSymbol);

          if (status === 'COMPLETED') {
            setSuccessMsg('İşlem tamamlandı.');
          } else {
            setSuccessMsg('İşlem sıraya alındı. Portföy yenileniyor.');
          }

          await Promise.resolve(onSuccess());
          setTimeout(onClose, 900);
          return;
        } catch (err: unknown) {
          const statusCode = (err as { response?: { status?: number } })?.response?.status;

          if (statusCode === 409 && attemptRef.current < MAX_RETRY) {
            attemptRef.current += 1;
            const delay = BASE_DELAY * Math.pow(2, attemptRef.current - 1);
            await sleep(delay);
            continue;
          }

          setErrorMsg(getErrorMessage(err, 'İşlem başarısız oldu.'));
          return;
        }
      }

      setErrorMsg('Maksimum deneme sayısına ulaşıldı. Lütfen tekrar deneyin.');
    } finally {
      endTradeSession();
      setSubmitting(false);
    }
  }, [symbol, quantity, tradeType, portfolioId, waitForTransactionResolution, onSuccess, onClose]);

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={submitting ? undefined : onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.titleRow}>
              <Text style={styles.title}>İşlem Yap</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={submitting}>
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.typeRow}>
              {(['BUY', 'SELL'] as TradeType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeBtn,
                    tradeType === type && (type === 'BUY' ? styles.buyActive : styles.sellActive),
                  ]}
                  onPress={() => setTradeType(type)}
                  disabled={submitting}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      tradeType === type && styles.typeBtnTextActive,
                    ]}
                  >
                    {type === 'BUY' ? 'Al' : 'Sat'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Sembol</Text>
            <TextInput
              style={styles.input}
              value={symbol}
              onChangeText={(value) => setSymbol(value.toUpperCase())}
              placeholder="AAPL, TSLA..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              returnKeyType="next"
              editable={!submitting}
            />

            <Text style={styles.label}>Miktar</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              returnKeyType="done"
              editable={!submitting}
            />

            {errorMsg ? (
              <Text style={styles.error}>{errorMsg}</Text>
            ) : null}

            {successMsg ? (
              <Text style={styles.success}>{successMsg}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                tradeType === 'SELL' && styles.submitSell,
                submitting && styles.submitDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>
                  {tradeType === 'BUY' ? 'Satın Al' : 'Sat'}
                  {attemptRef.current > 0 ? ` (${attemptRef.current}. deneme)` : ''}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kvWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  closeBtn: { padding: 8 },
  closeText: { fontSize: 18, color: '#9CA3AF' },
  typeRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  buyActive: { backgroundColor: '#10B981' },
  sellActive: { backgroundColor: '#EF4444' },
  typeBtnText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  typeBtnTextActive: { color: '#FFFFFF' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 16,
  },
  error: { color: '#EF4444', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  success: {
    color: '#10B981',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitSell: { backgroundColor: '#EF4444' },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
