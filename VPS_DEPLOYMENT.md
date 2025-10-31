# VPS Deployment Guide

## ✅ What Will Work Automatically

1. **History Storage**: The `data/history.json` file will persist as long as the `data/` directory exists. No changes needed.

2. **Shared Links**: Already updated to automatically detect your VPS domain/IP from the request headers. Will work with:
   - `http://your-domain.com`
   - `https://your-domain.com`
   - `http://your-ip:3001`
   - Behind reverse proxies (nginx, Apache) with proper headers

3. **Video Storage**: The `shared/` directory for uploaded videos will persist. Make sure it exists.

4. **Client-side URL Construction**: Uses `window.location.origin`, so it will automatically adapt to your VPS domain.

## ⚙️ Configuration Needed

### 1. Environment Variables

Create a `.env` file in your project root:

```env
PORT=3000
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### 2. Reverse Proxy (Recommended for HTTPS)

If using nginx as reverse proxy, add this configuration:

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
        
        # For file uploads
        client_max_body_size 2048M;
    }
}
```

### 3. Process Manager (PM2 - Recommended)

Install PM2 to keep your server running:

```bash
npm install -g pm2
pm2 start server.js --name video-analysis
pm2 save
pm2 startup
```

### 4. File Permissions

Make sure the server can write to these directories:
```bash
chmod -R 755 data/
chmod -R 755 shared/
```

### 5. Firewall

Open the port your app runs on (default 3000):
```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## 🔒 Security Considerations

1. **HTTPS**: Use a reverse proxy (nginx) with Let's Encrypt SSL certificate
2. **Rate Limiting**: Consider adding rate limiting for `/upload` and `/api/share` endpoints
3. **File Size Limits**: Currently set to 2GB - adjust in `server.js` if needed
4. **CORS**: If accessing from different domains, you may need to configure CORS

## 📁 Directory Structure

Ensure these directories exist and are writable:
```
your-project/
├── data/
│   ├── history.json
│   └── shared_analyses.json
├── shared/          # For uploaded video files
└── server.js
```

## 🚀 Deployment Steps

1. **Upload your project** to VPS (via git, scp, or FTP)

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create `.env` file** with your `GEMINI_API_KEY`

4. **Start the server**:
   ```bash
   node server.js
   # OR with PM2:
   pm2 start server.js --name video-analysis
   ```

5. **Test shareable links** - They should automatically use your domain

## ✅ Testing Checklist

- [ ] Main page loads at `http://your-domain:3000`
- [ ] Can analyze videos (both local upload and YouTube)
- [ ] History saves and loads correctly
- [ ] Shareable links work: `http://your-domain:3000/share/abc123`
- [ ] Shared videos play correctly
- [ ] Storage bar updates correctly

## 🐛 Troubleshooting

**Issue**: Shareable links show `localhost:3000`
- **Fix**: Make sure your reverse proxy (if using) sets the `Host` header correctly

**Issue**: Files not persisting
- **Fix**: Check `data/` and `shared/` directory permissions

**Issue**: Port already in use
- **Fix**: Change `PORT` in `.env` or kill the process using that port

## 📝 Notes

- The app automatically detects HTTPS from `X-Forwarded-Proto` header
- Client-side uses `window.location.origin` so it adapts automatically
- All relative paths (`/shared/`, `/api/share`) will work correctly
- History and shared analyses are stored in JSON files - backup regularly!

