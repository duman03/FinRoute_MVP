import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { usePriceStore } from '../store/priceStore';
import type { WsStatus } from '../store/priceStore';

interface StatusConfig {
  color: string;
  label: string;
  animated: boolean;
}

const STATUS_MAP: Record<WsStatus, StatusConfig> = {
  connected: { color: '#22C55E', label: 'Canlı', animated: false },
  connecting: { color: '#EAB308', label: 'Bağlanıyor...', animated: true },
  disconnected: { color: '#EF4444', label: 'Bağlantı Yok', animated: false },
};

interface DotProps { config: StatusConfig }

const PulseDot = React.memo(function PulseDot({ config }: DotProps): React.ReactElement {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!config.animated) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [config.animated, opacity]);

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: config.color, opacity }]}
    />
  );
});

function WsStatusBadgeComponent(): React.ReactElement {
  // Granüler Zustand okuma — wsStatus dışında hiçbir alan render'ı tetiklemez
  const wsStatus = usePriceStore(s => s.wsStatus);
  const config = STATUS_MAP[wsStatus];

  return (
    <View style={styles.container}>
      <PulseDot config={config} />
      <Text style={styles.label}>{config.label}</Text>
    </View>
  );
}

// React.memo: wsStatus değişmeden render yok
export const WsStatusBadge = React.memo(WsStatusBadgeComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: '#94A3B8', fontSize: 12, fontWeight: '500' },
});
