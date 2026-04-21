<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# FinRoute v4.6 — Kusursuz Üretim Blueprint'i

## Hastalığın Tıbbi Teşhisi

Dosyalar harfi harfine okundu. Hastalığın adı **"Süslü Kutu Yanılsaması"** — v4.0'dan v4.5'e uzanan 5 sürümde aynı mekanizma tekrarlandı:[^1_1]

> **Dekoratif ASCII kutuları ve Değişiklik Logları** her sürümde DOĞRU güncellendi (`rows[^1_0]` yazıldı, `split(' ')[^1_1]` yazıldı). Ancak **§1.3 TypeScript kod bloğu, §2.1 auth.route.ts gerçek kodu, §2.2 auth.middleware.ts gerçek kodu, §4.x DoD kriterleri ve Final Mühür Satırları** bir önceki sürümden kopyalanıp yapıştırıldı → bu alanlar sürüm sonuna kadar hatalı kaldı.

Denetçi raporları bu paterni sürüm sürüm belgeledi:[^1_1]


| Sürüm | Süslü Kutu (görsel) | §1.3 TypeScript Kodu | DoD Kriteri | Final Mühür | Sonuç |
| :-- | :-- | :-- | :-- | :-- | :-- |
| v4.0 | `rows[5⁰]` ✓ | `rows.permanently` ✗ | `rows.permanently` ✗ | `rows.permanently` ✗ | REDDEDİLDİ |
| v4.1 | `rows[8⁰]` ✓ | `rows[8⁰]` ✓ | `rows[8⁰]` ✓ | **Etiket satırı** `rows.permanently` ✗ | REDDEDİLDİ |
| v4.2 | `rows[9⁰]` ✓ | `rows[9⁰]` ✓ | — | Etiket `rows.permanently` ✗; EC-18 SET yok ✗ | REDDEDİLDİ |
| v4.3 | `rows[10⁰]` ✓ | `rows.permanently` ✗ | `rows.permanently` ✗ | `rows.permanently` ✗ | REDDEDİLDİ |
| v4.4 | `rows[12⁰]` ✓ | `rows.permanently` ✗ | `rows.permanently` ✗ | `split` `;` hâlâ orada ✗ | REDDEDİLDİ |
| v4.5 | `rows[14⁰]` ✓ | `rows.permanently` ✗ | `rows.permanently` ✗ | `split` `;` hâlâ orada ✗ | REDDEDİLDİ |

**Kök Neden:** Belge her seferinde önceki sürümden açılıp üste birkaç satır değiştiriliyor; alttaki asal kod blokları, DoD tablosu ve Final Mühür alanları dokunulmadan bırakılıyor. Compiler görmüyor, gözden kaçıyor.[^1_1]

***

## 4 Altın Satır — Atomik Kilitleme

Bu 4 satır Space talimatları ve denetçi kayıtlarına göre değişmez kanondur:[^1_1]

```
① const count = result.rows[^1_0].permanently_delete_expired_users;
② const user = result.rows[^1_0];
③ if (!userRes.rows[^1_0]?.is_active) {
④ const token = authHeader.split(' ')[^1_1];
   └─ Noktalı virgül SADECE satır sonunda. split ile ' ' arasında ASLA ';' veya boşluk YOK.
```


***

## v4.6 Demir İradeli Üretim Blueprint'i

### AŞAMA 0 — Üretim Öncesi Kilit

Belge açılmadan önce bu 4 satır bir notepad'e yazılır. Hiçbir sürüm dosyası açılmaz. Önceki belge referans olarak kullanılmaz.

***

### AŞAMA 1 — §1.3 Hesap Silme Cron Bloğu

**Kural:** Bu bölümün TypeScript kod bloğuna girildiğinde, `permanentlyDeleteExpiredUsers` sorgu sonucunu atan satır **yalnızca ve yalnızca Satır ①** olacaktır.

```
// §1.3 içinde ZORUNLU:
const count = result.rows[^1_0].permanently_delete_expired_users;
```

**Yasak:** `result.rows.permanently…`, `result.rows[5⁰]`, `result.rows[10⁰]` gibi hiçbir varyant. Bu satır yazıldıktan hemen sonra `grep -n "result\.rows\." account-cleanup.cron.ts` çalıştırılır → çıktı BOŞ olmalı.

***

### AŞAMA 2 — §2.1 Auth Route: Login Bloğu

**Kural:** `pool.query(…)` çağrısından sonra gelen kullanıcı atama satırı **yalnızca Satır ②** olacaktır.

```
// §2.1 POST /auth/login içinde ZORUNLU:
const user = result.rows[^1_0];
```

**Yasak:** `result.rows` (indekssiz), `result.rows[12⁰]` gibi herhangi bir Footnote kalıntısı.

***

### AŞAMA 3 — §2.1 Auth Route: Refresh Bloğu

**Kural:** `SELECT is_active FROM users` sorgusunun ardından gelen kontrol satırı **yalnızca Satır ③** olacaktır.

```
// §2.1 POST /auth/refresh içinde ZORUNLU:
if (!userRes.rows[^1_0]?.is_active) {
```

**Yasak:** `userRes.rows?.is_active`, `userRes.rows[12⁰]?.is_active`. EC-19 `redisClient.expire` satırına **bu satırdan sonra** ulaşılır; bu satır hatalıysa EC-19 hiç çalışmaz — bu gerçek 5 sürümdür belgelendi.[^1_1]

***

### AŞAMA 4 — §2.2 Auth Middleware Bloğu

**Kural:** `authHeader` ayrıştırma satırı **yalnızca Satır ④** olacaktır. Noktalı virgül `split` ile `'` arasına ASLA girmez.

```
// §2.2 requireAuth içinde ZORUNLU:
const token = authHeader.split(' ')[^1_1];
```

**Yasak:** `split(' ');[^1_1]`, `split(' ')[^1_3]`, `split(' ')[^1_1]` (araya noktalı virgül girmiş varyantlar). v4.3'te `[^1_3]`, v4.4'te `[^1_1]` ama noktalı virgül kaldı, v4.5'te zero-width character hilesi tespit edildi — her varyant `jwt.verify(Array, secret)` ile tüm backend'i çökertti.[^1_1]

***

### AŞAMA 5 — §4.1 DoD Matrisi (Tamamlanma Kriterleri)

Bu tablo **kod bloklarından SONRA** yazılır, önce değil. Her satır için:


| DoD Kriteri | Zorunlu İçerik |
| :-- | :-- |
| F1-DOC satırı | `const count = result.rows[^1_0].permanently_delete_expired_users;` |
| LOGIN-FIX satırı | `const user = result.rows[^1_0];` |
| REFRESH-FIX satırı | `if (!userRes.rows[^1_0]?.is_active) {` |
| MW-FIX satırı | `const token = authHeader.split(' ')[^1_1];` |

**Kural:** DoD tablosunun "Doğru Satır" sütunu kod bloklarındaki satırların **birebir kopyasıdır** — yorum eklenmez, dipnot eklenmez, indeks numarası değiştirilmez.

***

### AŞAMA 6 — Final Mühür Satırları

Mühür bloğu belgenin **son bölümüdür** ve bu 4 satırı **olduğu gibi** içerir:

```
① const count = result.rows[^1_0].permanently_delete_expired_users;
② const user = result.rows[^1_0];
③ if (!userRes.rows[^1_0]?.is_active) {
④ const token = authHeader.split(' ')[^1_1];
```

**Kural:** Mühür ASCII kutusu SADECE bu 4 satır doğrulandıktan sonra çizilir. Kutu dekoratiftir, derleyici görmez; asıl doğrulama yukarıdaki AŞAMA 1–5'tir.[^1_1]

***

### AŞAMA 7 — Zorunlu Çapraz Doğrulama (Üretim Sonrası)

Belge teslim edilmeden önce aşağıdaki 4 grep/tsc komutu sıfır hata vermelidir:

```bash
# 1. Compiler
tsc --noEmit                                    # BEKLENEN: 0 hata

# 2. F1 lâneti kontrolü (boş çıktı = geçti)
grep -n "result\.rows\." src/jobs/account-cleanup.cron.ts

# 3. MW noktalı virgül kontrolü (boş çıktı = geçti)
grep -n "split.*'[[:space:]]'.*;" src/middleware/auth.middleware.ts

# 4. Genel rows kalıntısı (SADECE [^1_0] içeren satırlar olmalı)
grep -rn "result\.rows[^[]" src/
```

**Kural:** Bu 4 komuttan herhangi biri çıktı verirse belge teslim EDİLMEZ. Önce düzeltilir, komutlar tekrar çalıştırılır.

***

## Blueprint Özeti — Bölüm × Satır Matrisi

| Belge Bölümü | Satır ① `rows[^1_0].permanently…` | Satır ② `rows[^1_0]` | Satır ③ `rows[^1_0]?.is_active` | Satır ④ `split(' ')[^1_1]` |
| :-- | :--: | :--: | :--: | :--: |
| §1.3 TypeScript Kod Bloğu | **ZORUNLU** | — | — | — |
| §2.1 Login Kod Bloğu | — | **ZORUNLU** | — | — |
| §2.1 Refresh Kod Bloğu | — | — | **ZORUNLU** | — |
| §2.2 Middleware Kod Bloğu | — | — | — | **ZORUNLU** |
| §4.1 DoD Matrisi (her kriter satırı) | **ZORUNLU** | **ZORUNLU** | **ZORUNLU** | **ZORUNLU** |
| Final Mühür Satırları | **ZORUNLU** | **ZORUNLU** | **ZORUNLU** | **ZORUNLU** |

> **Demir Kural:** Süslü ASCII kutu asla doğrulama değildir. Derleyici kutuyu okumaz. Sadece gerçek kod bloklarındaki satırlar ve §7'deki grep/tsc sonuçları geçerlidir.
<span style="display:none">[^1_10][^1_11][^1_2][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: FinRoute_MVP_Mufettis_v4.5.md

[^1_2]: FinRoute_10.hafta Kontrol.md

[^1_3]: FinRoute_9.hafta Kontrol.md

[^1_4]: FinRoute_8.hafta Kontrol.md

[^1_5]: FinRoute_7.hafta Kontrol.md

[^1_6]: FinRoute_6.hafta Kontrol.md

[^1_7]: FinRoute_5.hafta Kontrol.md

[^1_8]: FinRoute_4.hafta Kontrol.md

[^1_9]: FinRoute_2.Hafta_Kontrol.pdf

[^1_10]: FinRoute_1.Hafta_Kontrol.pdf

[^1_11]: FinRoute 3.hafta Kontrol.md

