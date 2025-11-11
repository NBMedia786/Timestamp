# Diagnostic Guide: "Stuck on Connecting to Server"

## 🔍 How to Determine: Code Issue vs VPS Issue

### **Quick Test: Does it work on localhost?**
1. Test on your local machine: `http://localhost:3000`
2. If it works locally → **VPS Configuration Issue**
3. If it fails locally → **Code Issue** (but we just fixed these!)

---

## ✅ **CODE ISSUES (Already Fixed)**

We just fixed these in the latest update:

1. ✅ **No timeout on fetch** - Added 30-second timeout
2. ✅ **Headers sent too late** - Moved headers before multer processing
3. ✅ **No immediate acknowledgment** - Added `[Notice] Request received. Processing...`

**These fixes should work on both localhost AND VPS.**

---

## 🔧 **VPS CONFIGURATION ISSUES** (Most Likely Cause)

If it works on localhost but fails on VPS, check these:

### 1. **Nginx Reverse Proxy Buffering** (Very Common!)

**Problem:** Nginx buffers responses by default, which delays streaming responses.

**Solution:** Add these to your nginx config:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # ⚠️ CRITICAL: Disable buffering for streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_request_buffering off;
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # For file uploads
        client_max_body_size 2048M;
        client_body_timeout 300s;
    }
}
```

**After changing nginx config:**
```bash
sudo nginx -t  # Test configuration
sudo systemctl reload nginx  # Reload nginx
```

---

### 2. **Server Not Running/Listening**

**Check if server is running:**
```bash
# Check if process is running
ps aux | grep node
# OR
pm2 list

# Check if port is listening
netstat -tulpn | grep 3000
# OR
ss -tulpn | grep 3000
```

**Check server logs:**
```bash
# If using PM2
pm2 logs video-analysis

# If running directly
# Check console output for errors
```

---

### 3. **Firewall Blocking Connection**

**Check firewall:**
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

### 4. **Server Binding Issue**

**Problem:** Server might be binding to `localhost` instead of `0.0.0.0`

**Check server.js:** Look for:
```javascript
app.listen(PORT, () => { ... })
```

Should be:
```javascript
app.listen(PORT, '0.0.0.0', () => { ... })
```

Or in your `.env`:
```env
HOST=0.0.0.0
PORT=3000
```

---

### 5. **Network Connectivity**

**Test from VPS itself:**
```bash
# Test if server responds locally
curl -X POST http://localhost:3000/upload -v

# Test from your local machine
curl -X POST http://your-vps-ip:3000/upload -v
```

**Check browser console:**
- Open DevTools (F12)
- Go to Network tab
- Submit form
- Check the `/upload` request:
  - Status code?
  - Timing?
  - Error messages?

---

### 6. **Missing Environment Variables**

**Check `.env` file exists on VPS:**
```bash
cat .env
# Should have:
# PORT=3000
# GEMINI_API_KEY=your_key_here
```

**Check if server loads it:**
```bash
node -e "require('dotenv').config(); console.log(process.env.PORT, process.env.GEMINI_API_KEY)"
```

---

## 🧪 **Diagnostic Steps**

### Step 1: Test Locally
```bash
# On your local machine
node server.js
# Open http://localhost:3000
# Try to analyze a video
```

**Result:**
- ✅ Works → VPS issue
- ❌ Fails → Code issue (shouldn't happen after our fixes)

---

### Step 2: Test Direct Connection (Bypass Reverse Proxy)

**Access directly:**
```
http://your-vps-ip:3000
```

**Result:**
- ✅ Works directly → Reverse proxy issue
- ❌ Still fails → Server configuration issue

---

### Step 3: Check Browser Console

Open DevTools → Network tab → Submit form

**What to look for:**
1. **Pending/Failed request** → Connection issue
2. **Status 200 but no response** → Buffering issue
3. **Timeout error** → Timeout issue (should show error now)
4. **CORS error** → Missing CORS headers (unlikely for same-origin)

---

### Step 4: Check Server Logs

**On VPS:**
```bash
# If using PM2
pm2 logs video-analysis --lines 50

# Check for:
# - "Request received" message
# - Error messages
# - Stack traces
```

---

## 📊 **Most Likely Causes (In Order)**

1. **🥇 Nginx buffering** (90% of cases)
   - Fix: Add `proxy_buffering off;` to nginx config

2. **🥈 Server not running/listening**
   - Fix: Start server with PM2

3. **🥉 Firewall blocking port**
   - Fix: Allow port 3000 in firewall

4. **4️⃣ Server binding to localhost only**
   - Fix: Bind to `0.0.0.0` or set HOST in .env

5. **5️⃣ Network connectivity issues**
   - Fix: Check server can reach internet (for Gemini API)

---

## ✅ **Quick Fix Checklist**

Run these commands on your VPS:

```bash
# 1. Check server is running
pm2 list

# 2. Check server logs
pm2 logs video-analysis --lines 20

# 3. Check port is open
sudo netstat -tulpn | grep 3000

# 4. Check firewall
sudo ufw status

# 5. Test direct connection (from VPS)
curl -I http://localhost:3000

# 6. Check nginx config (if using)
sudo nginx -t
cat /etc/nginx/sites-available/your-site
```

---

## 🎯 **Conclusion**

**If it works on localhost:** 99% chance it's a **VPS configuration issue**, most likely **nginx buffering**.

**If it fails on localhost:** Even after our fixes, check:
- Server actually starting?
- Port already in use?
- Environment variables loaded?
- Dependencies installed?

The code fixes we made should handle both scenarios, but VPS infrastructure (especially reverse proxies) often needs specific configuration for streaming responses.

