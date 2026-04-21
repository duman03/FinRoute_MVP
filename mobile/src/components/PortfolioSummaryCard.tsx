import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Portfolio } from '../types';
import { usePriceStore } from '../store/priceStore';

interface Props {
  portfolio: Portfolio;
}

export default function PortfolioSummaryCard({ portfolio }: Props) {
  // Z-2 Trade-Off: Toplam bakiyeyi anlık hesaplamak için tüm 'prices' objesine abone oluyoruz.
  // Bu komponent fiyat değiştikçe mecburen render olur çünkü P&L toplam rakamı değişir.
  const prices = usePriceStore(s => s.prices);

  const cashBalance = parseFloat(portfolio.cash_balance) || 0;

  let totalHoldingsValue = 0;
  let totalCost = 0;

  portfolio.holdings.forEach(h => {
    const qty = parseFloat(h.quantity);
    const avgCost = parseFloat(h.avg_cost);
    const livePrice = parseFloat(prices[h.symbol] || '0') || avgCost;

    totalHoldingsValue += qty * livePrice;
    totalCost += qty * avgCost;
  });

  const totalValue = cashBalance + totalHoldingsValue;
  const totalPnl = totalHoldingsValue - totalCost;
  const isProfit = totalPnl >= 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Toplam Portföy Değeri</Text>
      <Text style={styles.value}>${totalValue.toFixed(2)}</Text>

      <View style={styles.row}>
        <View>
          <Text style={styles.subLabel}>Nakit Bakiye</Text>
          <Text style={styles.subValue}>${cashBalance.toFixed(2)}</Text>
        </View>
        <View style={styles.rightAlign}>
          <Text style={styles.subLabel}>Toplam P&L</Text>
          <Text style={[styles.subValue, { color: isProfit ? '#28a745' : '#dc3545' }]}>
            {isProfit ? '+' : ''}${Math.abs(totalPnl).toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 20,
    padding: 20,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    ...Platform.select({
      web: { boxShadow: '0px 4px 10px rgba(0,0,0,0.1)' as any },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      },
    }),
  },
  label: { color: '#A0A0A0', fontSize: 14, fontWeight: '600' },
  value: { color: '#FFF', fontSize: 36, fontWeight: 'bold', marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  subLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  subValue: { color: '#CCC', fontSize: 16, fontWeight: 'bold' },
  rightAlign: { alignItems: 'flex-end' }
});
