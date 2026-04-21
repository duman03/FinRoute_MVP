import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ListRenderItem,
  ActivityIndicator,
  StyleSheet,
  AppState,
  AppStateStatus,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { axiosInstance } from '../api/axiosInstance';
import { useMarketWebSocket } from '../hooks/useMarketWebSocket';
import { HoldingTile, HOLDING_ITEM_HEIGHT } from '../components/HoldingTile';
import { WsStatusBadge } from '../components/WsStatusBadge';
import TradeBottomSheet from './TradeBottomSheet';

interface ApiEnvelope<T> {
  data: T;
}

interface PortfolioApiItem {
  id: string;
  name: string;
  description: string | null;
  initial_balance: string;
  current_balance: string;
  holdings_count: string;
}

interface HoldingApiItem {
  id: string;
  symbol: string;
  quantity: string;
  avg_cost_basis: string;
}

interface Holding {
  id: string;
  symbol: string;
  quantity: string;
  avgCost: string;
  displayName: string;
}

interface PortfolioSummary {
  totalValue: string;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const SEPARATOR_HEIGHT = StyleSheet.hairlineWidth;
const ITEM_TOTAL_HEIGHT = HOLDING_ITEM_HEIGHT + SEPARATOR_HEIGHT;

const getItemLayout = (_: unknown, index: number) => ({
  length: ITEM_TOTAL_HEIGHT,
  offset: ITEM_TOTAL_HEIGHT * index,
  index,
});

const keyExtractor = (item: Holding) => item.id;
const Separator = () => <View style={styles.separator} />;

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

function mapHolding(holding: HoldingApiItem): Holding {
  return {
    id: holding.id,
    symbol: holding.symbol,
    quantity: holding.quantity,
    avgCost: holding.avg_cost_basis,
    displayName: holding.symbol,
  };
}

export default function PortfolioScreen() {
  useMarketWebSocket();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);

  const backgroundedAt = useRef<number | null>(null);

  const fetchPortfolio = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!silent) {
      setLoading(true);
    }

    try {
      setError(null);

      const portfoliosResponse = await axiosInstance.get<ApiEnvelope<PortfolioApiItem[]>>('/portfolios');
      const portfolios = portfoliosResponse.data.data ?? [];

      if (portfolios.length === 0) {
        setPortfolioId(null);
        setSummary(null);
        setHoldings([]);
        return;
      }

      const firstPortfolio = portfolios[0];
      setPortfolioId(firstPortfolio.id);
      setSummary({
        totalValue: firstPortfolio.current_balance,
      });

      const holdingsResponse = await axiosInstance.get<ApiEnvelope<HoldingApiItem[]>>(
        `/portfolios/${firstPortfolio.id}/holdings`
      );

      setHoldings((holdingsResponse.data.data ?? []).map(mapHolding));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Portföy yüklenemedi.'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const createFirstPortfolio = useCallback(async () => {
    setCreatingPortfolio(true);
    setError(null);

    try {
      await axiosInstance.post('/portfolios', {
        name: 'Ana Portföy',
        description: 'FinRoute tarafından oluşturulan başlangıç portföyü',
      });
      await fetchPortfolio();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'İlk portföy oluşturulamadı.'));
    } finally {
      setCreatingPortfolio(false);
    }
  }, [fetchPortfolio]);

  useEffect(() => {
    fetchPortfolio().catch(() => undefined);
  }, [fetchPortfolio]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        const bgDuration = backgroundedAt.current
          ? Date.now() - backgroundedAt.current
          : Infinity;

        if (bgDuration >= STALE_THRESHOLD_MS) {
          fetchPortfolio({ silent: true }).catch(() => undefined);
        }

        backgroundedAt.current = null;
      } else if (next === 'background' || next === 'inactive') {
        backgroundedAt.current = Date.now();
      }
    });

    return () => subscription.remove();
  }, [fetchPortfolio]);

  const renderItem = useCallback<ListRenderItem<Holding>>(
    ({ item }) => (
      <HoldingTile
        symbol={item.symbol}
        quantity={item.quantity}
        avgCost={item.avgCost}
        displayName={item.displayName}
      />
    ),
    []
  );

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Henüz varlığınız bulunmuyor</Text>
      <Text style={styles.emptySubtitle}>
        İşlem Yap düğmesiyle ilk alım veya satım emrinizi oluşturabilirsiniz.
      </Text>
    </View>
  ), []);

  const listHeader = useMemo(() => {
    if (!summary) {
      return null;
    }

    return (
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Toplam Portföy Bakiyesi</Text>
        <Text style={styles.totalValue}>${summary.totalValue}</Text>
        <Text style={styles.headerHint}>
          Canlı fiyatlar websocket üzerinden güncellenir. Emir sonrası bakiye otomatik yenilenir.
        </Text>
        <View style={styles.wsBadgeRow}>
          <WsStatusBadge />
        </View>
      </View>
    );
  }, [summary]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (error && !portfolioId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchPortfolio()}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      {portfolioId ? (
        <>
          <FlatList
            data={holdings}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            windowSize={5}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            removeClippedSubviews
            ItemSeparatorComponent={Separator}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={[styles.list, holdings.length === 0 && styles.listEmpty]}
            onRefresh={() => fetchPortfolio({ silent: true })}
            refreshing={false}
          />

          <TouchableOpacity
            style={styles.tradeFab}
            onPress={() => setTradeOpen(true)}
          >
            <Text style={styles.tradeFabText}>İşlem Yap</Text>
          </TouchableOpacity>

          {tradeOpen ? (
            <TradeBottomSheet
              portfolioId={portfolioId}
              onClose={() => setTradeOpen(false)}
              onSuccess={() => fetchPortfolio({ silent: true })}
            />
          ) : null}
        </>
      ) : (
        <View style={styles.noPortfolioContainer}>
          <Text style={styles.noPortfolioTitle}>İlk portföyünüzü oluşturalım</Text>
          <Text style={styles.noPortfolioText}>
            Trade akışını başlatabilmek için önce bir ana portföy gerekiyor.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.retryBtn, creatingPortfolio && styles.disabledBtn]}
            onPress={createFirstPortfolio}
            disabled={creatingPortfolio}
          >
            {creatingPortfolio ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.retryText}>İlk Portföyü Oluştur</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { paddingBottom: 120 },
  listEmpty: { flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 8,
  },
  headerLabel: { fontSize: 13, color: '#9CA3AF', letterSpacing: 0.3 },
  totalValue: { fontSize: 32, fontWeight: '700', color: '#111827', marginTop: 4 },
  headerHint: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
    marginTop: 8,
  },
  wsBadgeRow: {
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  errorText: { color: '#EF4444', marginBottom: 12, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  tradeFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    left: 20,
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 6px 12px rgba(99, 102, 241, 0.3)' as never },
      default: {
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  tradeFabText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  noPortfolioContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noPortfolioTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  noPortfolioText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  disabledBtn: {
    opacity: 0.7,
  },
});
