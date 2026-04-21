-- Freeze earn endpoint'i için ek güvenlik (Kontrol dokümanı önerisi)
-- freeze_count update'i sadece LEAST ile yapılabilir
-- Bu migration uygulama katmanı notu olarak bırakılır — DB constraint zaten 015'te var
-- (Bu dosya ileride Hafta 7 freeze earn endpoint'i için kullanılacak)

-- Streak info performans index'i
CREATE INDEX IF NOT EXISTS idx_user_streaks_updated
  ON user_streaks (user_id, updated_at DESC);