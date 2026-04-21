import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePriceSelector } from '../store/priceStore';

export interface HoldingTileProps {
  symbol: string;
  quantity: string;   // A-03: STRING
  avgCost: string;   // A-03: STRING
  displayName: string;
}

// ITEM_HEIGHT dışarıya export edilir → PortfolioScreen getItemLayout kullanır
export const HOLDING_ITEM_HEIGHT = 70;

function HoldingTileBase({
  symbol,
  quantity,
  avgCost,
  displayName,
}: HoldingTileProps) {
  // Z-2: Granüler fiyat okuma — sadece bu sembol değişince render tetiklenir
  const currentPrice = usePriceSelector(symbol);

  const qty = parseFloat(quantity);
  const cost = parseFloat(avgCost);
  const price = parseFloat(currentPrice);

  const totalValue = isNaN(price) ? null : price * qty;
  const pl = totalValue !== null ? totalValue - cost * qty : null;
  const isProfit = pl !== null && pl >= 0;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.symbol}>{symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
      </View>
      <View style={styles.right}>
        {totalValue !== null && (
          <Text style={styles.totalValue}>
            ${totalValue.toFixed(2)}
          </Text>
        )}
        {pl !== null && (
          <Text style={[styles.pl, isProfit ? styles.profit : styles.loss]}>
            {isProfit ? '+' : ''}
            {pl.toFixed(2)}
          </Text>
        )}
        <Text style={styles.price}>{currentPrice}</Text>
      </View>
    </View>
  );
}

/**
 * Custom comparator: Sadece fiyat prop'a yansıdığında
 * (usePriceSelector tarafından store değişimi zaten yönetiliyor)
 * veya quantity / avgCost değiştiğinde render tetiklenir.
 */
export const HoldingTile = memo(HoldingTileBase, (prev, next) =>
  prev.symbol === next.symbol &&
  prev.quantity === next.quantity &&
  prev.avgCost === next.avgCost &&
  prev.displayName === next.displayName
);

const styles = StyleSheet.create({
  row: {
    height: HOLDING_ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  left: { flex: 1, marginRight: 12 },
  right: { alignItems: 'flex-end' },
  symbol: { fontSize: 15, fontWeight: '600', color: '#111827', letterSpacing: 0.4 },
  name: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  totalValue: { fontSize: 15, fontWeight: '600', color: '#111827' },
  pl: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  price: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  profit: { color: '#10B981' },
  loss: { color: '#EF4444' },
});
