export interface LevelDefinition {
  level: number;
  title: string;
  minXp: number;
  maxXp: number | null; // null = son seviye
  badge: string;
}

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  { level: 1, title: 'Çaylak',          minXp: 0,    maxXp: 299,   badge: '🌱' },
  { level: 2, title: 'Stajyer',         minXp: 300,  maxXp: 749,   badge: '📚' },
  { level: 3, title: 'Kalfa',           minXp: 750,  maxXp: 1999,  badge: '⚖️' },
  { level: 4, title: 'Uzman',           minXp: 2000, maxXp: 4999,  badge: '📊' },
  { level: 5, title: 'Usta Yatırımcı',  minXp: 5000, maxXp: null,  badge: '🏆' },
];

export function getLevelForXp(totalXp: number): LevelDefinition {
  for (const def of LEVEL_DEFINITIONS) {
    if (totalXp >= def.minXp && (def.maxXp === null || totalXp <= def.maxXp)) {
      return def;
    }
  }
  // Eşleşme bulunamazsa en yüksek seviyeyi fallback olarak döndürüyoruz
  return LEVEL_DEFINITIONS[LEVEL_DEFINITIONS.length - 1];
}

export function getLevelProgressPercent(totalXp: number): number {
  const currentLevel = getLevelForXp(totalXp);

  // Eğer en üst seviyeye ulaşıldıysa progress %100'dür
  if (currentLevel.maxXp === null) {
    return 100;
  }

  // Bir sonraki seviyeye geçmek için gereken toplam aralık (örn: Level 1 için 0'dan 300'e)
  const requiredXpForNextLevel = (currentLevel.maxXp + 1) - currentLevel.minXp;
  const xpInCurrentLevel = totalXp - currentLevel.minXp;

  const progress = (xpInCurrentLevel / requiredXpForNextLevel) * 100;
  return Math.min(Math.max(Math.round(progress), 0), 100);
}