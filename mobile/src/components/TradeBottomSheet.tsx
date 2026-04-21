import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useTradeStore } from '../store/tradeStore';
import { beginTradeSession, endTradeSession } from '../utils/idempotency';
import { Portfolio } from '../types';

interface Props {
  portfolio: Portfolio;
  onClose: () => void;
  onTradeSuccess: () => void;
}

const SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];

export default function TradeBottomSheet({ portfolio, onClose, onTradeSuccess }: Props) {
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantityStr, setQuantityStr] = useState('');

  // Z-3: Çift tıklama koruması (early return engeli)
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { executeTrade } = useTradeStore();

  const handleSubmit = async () => {
    // Z-3 Koruması: Zaten submit ediliyorsa null gibi davran ve çık
    if (isSubmitting) return;

    const qty = parseFloat(quantityStr);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Hata', 'Lütfen geçerli bir miktar girin.');
      return;
    }

    setIsSubmitting(true);

    // Z-3 Idempotency Flow Kuralı: try-finally ZORUNLU kullanılarak oturum yönetilir
    beginTradeSession();

    try {
      const result = await executeTrade({
        portfolioId: portfolio.id,
        symbol,
        type,
        quantity: qty
      });

      if (result.success) {
        onTradeSuccess();
        onClose();
        return;
      }

      // Hata kodlarına göre kullanıcıya özel Error Dialog'ları
      handleError(result.errorCode, result.errorMessage);

    } finally {
      // Z-3: Her koşulda Idempotency Key oturumu sonlandırılır
      endTradeSession();
      setIsSubmitting(false);
    }
  };

  const handleError = (errorCode?: string, errorMessage?: string) => {
    switch (errorCode) {
      case 'OPTIMISTIC_LOCK_CONFLICT':
      case 'PORTFOLIO_LOCK_CONFLICT':
      case 'HOLDING_LOCK_CONFLICT':
        Alert.alert(
          'Uyarı',
          'Portföy versiyonu değişti. Yeniden denemek ister misiniz?',
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Evet', onPress: handleSubmit } // Dialog üzerinden manuel retry hakkı
          ]
        );
        break;
      case 'INSUFFICIENT_BALANCE':
        Alert.alert('Hata', 'Yetersiz bakiye');
        break;
      case 'INSUFFICIENT_HOLDINGS':
        Alert.alert('Hata', 'Yetersiz pozisyon');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        Alert.alert('Hata', 'Çok fazla işlem');
        break;
      case 'PRICE_UNAVAILABLE':
        Alert.alert('Hata', 'Fiyat verisi alınamıyor');
        break;
      default:
        Alert.alert('Hata', errorMessage || 'İşlem başarısız oldu.');
    }
  };

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>İşlem Yap</Text>

          <Text style={styles.label}>Sembol</Text>
          <View style={styles.row}>
            {SYMBOLS.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.symbolBtn, symbol === s && styles.symbolBtnActive]}
                onPress={() => setSymbol(s)}
                disabled={isSubmitting}
              >
                <Text style={symbol === s ? styles.textWhite : styles.textBlack}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleBtn, type === 'BUY' && styles.buyActive]}
              onPress={() => setType('BUY')}
              disabled={isSubmitting}
            >
              <Text style={type === 'BUY' ? styles.textWhite : styles.textBlack}>AL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, type === 'SELL' && styles.sellActive]}
              onPress={() => setType('SELL')}
              disabled={isSubmitting}
            >
              <Text style={type === 'SELL' ? styles.textWhite : styles.textBlack}>SAT</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Miktar</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={quantityStr}
            onChangeText={setQuantityStr}
            placeholder="0.00"
            editable={!isSubmitting}
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.textWhite}>İptal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.disabledBtn]}
              // isSubmitting durumunda onPress tetiklenmez
              onPress={isSubmitting ? undefined : handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.textWhite}>Onayla</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 5, marginTop: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  symbolBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#eee', margin: 4 },
  symbolBtnActive: { backgroundColor: '#007bff' },
  textWhite: { color: '#fff', fontWeight: 'bold' },
  textBlack: { color: '#333', fontWeight: 'bold' },
  toggleContainer: { flexDirection: 'row', marginTop: 10, marginBottom: 10 },
  toggleBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#eee', marginHorizontal: 5, borderRadius: 8 },
  buyActive: { backgroundColor: '#28a745' },
  sellActive: { backgroundColor: '#dc3545' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, backgroundColor: '#6c757d', padding: 15, borderRadius: 8, alignItems: 'center', marginRight: 10 },
  submitBtn: { flex: 1, backgroundColor: '#007bff', padding: 15, borderRadius: 8, alignItems: 'center', marginLeft: 10 },
  disabledBtn: { opacity: 0.6 }
});
