# 🎯 Meta Ads / Instagram User Support (@lid Format)

## 📌 Problem

User yang chat dari **Meta Ads/Instagram** menggunakan format khusus:
- ❌ **Bukan** `628xxx@s.whatsapp.net` (nomor telepon standar)
- ✅ **Menggunakan** `121393308033108@lid` (Linked ID format)

Format `@lid` adalah **unique identifier** dari Meta Ads, bukan nomor telepon WhatsApp tradisional.

---

## ✅ Solusi yang Diimplementasikan

### 1. **Enhanced Payload Structure**

Payload webhook sekarang memiliki field tambahan untuk identifikasi user type:

```json
{
  "session": "bot wa",
  "sender": "6289603036419",           // Nomor telepon (jika tersedia)
  "pushname": "isthatkiddo",
  "from": "121393308033108@lid",       // JID asli
  "isGroup": false,
  "type": "text",
  "message": "Hello",
  "timestamp": 1763560858,
  "time": "19/11/25 21:00:58",
  "device": "ios",
  "url": null,
  
  // ✅ NEW FIELDS untuk Meta Ads detection
  "isMetaAdsUser": true,               // true jika user dari Meta Ads
  "userType": "meta_ads",              // "meta_ads" atau "whatsapp"
  "originalJid": "121393308033108@lid" // JID asli dengan format
}
```

---

### 2. **Improved Phone Number Resolution**

#### **Untuk User Biasa (`@s.whatsapp.net`):**
```
from: "6289603036419@s.whatsapp.net"
sender: "6289603036419"
isMetaAdsUser: false
userType: "whatsapp"
```

#### **Untuk Meta Ads User (`@lid`):**
```
from: "121393308033108@lid"
sender: "6289603036419" (jika Baileys bisa resolve via senderPn)
  ATAU "121393308033108" (Linked ID jika nomor tidak tersedia)
isMetaAdsUser: true
userType: "meta_ads"
originalJid: "121393308033108@lid"
```

---

## 🔍 Technical Details

### **Flow untuk @lid Users:**

1. **Message diterima** dari `121393308033108@lid`
2. **Serialize.js** mendeteksi format `@lid`:
   ```javascript
   if (/@lid/.test(msg.key.remoteJid) && msg.key.senderPn) {
     m.fromDisplay = msg.key.senderPn;  // Nomor telepon asli (jika ada)
   }
   m.phoneNumber = await resolvePhoneNumber(..., msg.key.senderPn);
   ```
3. **N8N Service** deteksi user type:
   ```javascript
   const isMetaAdsUser = fromJid.includes("@lid");
   const phoneNumber = extractPhoneNumber(message);  // Prioritas: message.phoneNumber
   ```
4. **Payload dikirim** dengan field lengkap ke N8N

---

## 🚀 Testing

### **Test dengan User Biasa:**
```bash
# Input: Chat dari 6289603036419
# Output payload:
{
  "sender": "6289603036419",
  "from": "6289603036419@s.whatsapp.net",
  "isMetaAdsUser": false,
  "userType": "whatsapp",
  "originalJid": "6289603036419@s.whatsapp.net"
}
```

### **Test dengan Meta Ads User:**
```bash
# Input: Chat dari 121393308033108@lid
# Output payload:
{
  "sender": "6289603036419" (jika resolved) atau "121393308033108",
  "from": "121393308033108@lid",
  "isMetaAdsUser": true,
  "userType": "meta_ads",
  "originalJid": "121393308033108@lid"
}
```

---

## 📊 Debugging

### **Scenario 1: `senderPn` TERSEDIA (Best Case)**
```
[SERIALIZE] Detected @lid user!
[SERIALIZE] msg.key.senderPn: 6289603036419@s.whatsapp.net
[SERIALIZE] msg.key available fields: [ 'remoteJid', 'fromMe', 'id', 'senderPn', ... ]
[SERIALIZE] Using senderPn for fromDisplay: 6289603036419@s.whatsapp.net
[SERIALIZE] resolvePhoneNumber - START
[SERIALIZE] resolvePhoneNumber - senderPn: 6289603036419@s.whatsapp.net
[SERIALIZE] resolvePhoneNumber - Using senderPn: 6289603036419@s.whatsapp.net
[SERIALIZE] resolvePhoneNumber - Resolved from senderPn: 6289603036419
[SERIALIZE] Resolved phoneNumber: 6289603036419 from JID: 121393308033108@lid
[N8N] forwardIncomingMessage - message.phoneNumber: 6289603036419
[N8N] forwardIncomingMessage - extracted phoneNumber: 6289603036419
```
✅ **Result:** `sender: "6289603036419"` (nomor telepon valid)

### **Scenario 2: `senderPn` TIDAK TERSEDIA, `onWhatsApp()` BERHASIL**
```
[SERIALIZE] Detected @lid user!
[SERIALIZE] msg.key.senderPn: undefined
[SERIALIZE] senderPn NOT available, using remoteJid
[SERIALIZE] resolvePhoneNumber - START
[SERIALIZE] resolvePhoneNumber - senderPn: undefined
[SERIALIZE] resolvePhoneNumber - Using JID: 121393308033108@lid
[SERIALIZE] resolvePhoneNumber - Trying onWhatsApp for JID: 121393308033108@lid
[SERIALIZE] resolvePhoneNumber - onWhatsApp result: [{ jid: '6289603036419@s.whatsapp.net', ... }]
[SERIALIZE] resolvePhoneNumber - Resolved from onWhatsApp: 6289603036419
[N8N] forwardIncomingMessage - message.phoneNumber: 6289603036419
```
✅ **Result:** `sender: "6289603036419"` (di-resolve via API)

### **Scenario 3: SEMUA GAGAL - Fallback ke Linked ID**
```
[SERIALIZE] Detected @lid user!
[SERIALIZE] msg.key.senderPn: undefined
[SERIALIZE] senderPn NOT available, using remoteJid
[SERIALIZE] resolvePhoneNumber - START
[SERIALIZE] resolvePhoneNumber - senderPn: undefined
[SERIALIZE] resolvePhoneNumber - Trying onWhatsApp for JID: 121393308033108@lid
[SERIALIZE] resolvePhoneNumber - onWhatsApp failed: User not found
[SERIALIZE] resolvePhoneNumber - Fallback result: 121393308033108
[N8N] forwardIncomingMessage - message.phoneNumber: 121393308033108
```
⚠️ **Result:** `sender: "121393308033108"` (Linked ID, bukan nomor telepon)

### **Troubleshooting:**

#### **Jika stuck di Scenario 3:**

1. **Check Baileys version:**
   ```bash
   npm list @whiskeysockets/baileys
   ```
   Pastikan versi >= 6.7.8 atau dari GitHub latest

2. **Check `msg.key` fields:**
   Log akan menunjukkan: `[SERIALIZE] msg.key available fields: [...]`
   
   Jika `senderPn` tidak ada di list, berarti:
   - Baileys version tidak support
   - User type tidak expose `senderPn`
   - WhatsApp API limitation

3. **Alternative Solution:**
   - Gunakan Linked ID (`121393308033108`) sebagai unique identifier
   - Simpan mapping manual di database
   - Ask user untuk nomor telepon di first contact

---

## 🛠️ N8N Workflow Update

### **Contoh Filter untuk Membedakan User Type:**

```javascript
// Node: Switch berdasarkan userType
if ($json.userType === "meta_ads") {
  // Handle Meta Ads user
  // Gunakan originalJid untuk reply
  return {
    target: $json.originalJid,
    message: "Terima kasih telah menghubungi kami via iklan!"
  };
} else {
  // Handle WhatsApp user biasa
  return {
    target: $json.sender + "@s.whatsapp.net",
    message: "Terima kasih telah menghubungi kami!"
  };
}
```

### **Contoh Validasi Nomor Telepon:**

```javascript
// Node: Check apakah sender adalah nomor telepon valid
const isValidPhoneNumber = /^62\d{9,13}$/.test($json.sender);

if ($json.isMetaAdsUser && !isValidPhoneNumber) {
  // Meta Ads user tanpa nomor telepon resolved
  // Gunakan Linked ID untuk komunikasi
  console.log("Meta Ads user dengan Linked ID:", $json.sender);
} else if (isValidPhoneNumber) {
  // Nomor telepon valid
  console.log("Valid phone number:", $json.sender);
}
```

---

## ⚠️ Important Notes

1. **`sender` field:**
   - Untuk user biasa: **selalu nomor telepon** (e.g., `6289603036419`)
   - Untuk Meta Ads: **nomor telepon jika tersedia**, **Linked ID jika tidak** (e.g., `121393308033108`)
   
   **Resolution Priority:**
   - 🥇 Priority 1: `msg.key.senderPn` (dari Baileys)
   - 🥈 Priority 2: `client.onWhatsApp(jid)` (resolve via API)
   - 🥉 Priority 3: Linked ID (fallback)

2. **`originalJid` field:**
   - **Selalu** berisi JID lengkap dengan format (e.g., `121393308033108@lid`)
   - **Gunakan ini** untuk reply ke user (bukan `sender`)

3. **Reply ke Meta Ads User:**
   ```javascript
   // ✅ BENAR: Gunakan originalJid
   target: message.originalJid  // "121393308033108@lid"
   
   // ❌ SALAH: Gunakan sender + @s.whatsapp.net
   target: message.sender + "@s.whatsapp.net"  // "121393308033108@s.whatsapp.net" (INVALID!)
   ```

4. **Baileys Upgrade:**
   - Baileys versi latest (dari GitHub) **fully support** format `@lid`
   - Tidak ada lagi "Closing stale open session" untuk Meta Ads users
   - Tidak ada lagi reconnection saat user `@lid` chat

---

## 📝 Summary

| Aspect | User Biasa | Meta Ads User |
|--------|-----------|---------------|
| **Format JID** | `628xxx@s.whatsapp.net` | `121xxx@lid` |
| **sender field** | Nomor telepon | Nomor (jika ada) atau Linked ID |
| **isMetaAdsUser** | `false` | `true` |
| **userType** | `"whatsapp"` | `"meta_ads"` |
| **originalJid** | `628xxx@s.whatsapp.net` | `121xxx@lid` |
| **Reply target** | `sender + @s.whatsapp.net` | `originalJid` |

---

## 🎯 Next Steps

1. ✅ **Restart server** untuk apply changes
2. ✅ **Test dengan Meta Ads user** (kirim chat dari iklan)
3. ✅ **Check webhook payload** di N8N (lihat field baru)
4. ✅ **Update N8N workflow** untuk handle `userType`
5. ✅ **Monitor logs** untuk pastikan `senderPn` resolved

---

**Tanggal Update:** 19 November 2025  
**Files Modified:**
- `server/integrations/n8n.service.js` - Enhanced payload structure
- `server/session/Client/handler/Serialize.js` - Improved phone resolution
- `package.json` - Baileys upgrade (support @lid)

