# Nexomemgram

Cloud-synced Telegram media gallery with Pinterest-style masonry layout.

## Features

- **Pinterest-Style Masonry Grid**: Dynamic staggered layout with fixed-width cards
- **Drag & Drop Upload**: Global drop zone for instant image uploads to Telegram
- **Telegram Integration**: MTProto-based backend using gramjs/telegram library
- **Infinite Scroll**: Auto-load 50 images per scroll batch
- **Local Caching**: Browser storage for instant thumbnail loading
- **Metadata Overlay**: Hover to see upload date and file size
- **Rate-Limited Queue**: p-queue manages Telegram API limits (30 req/sec)
- **Deep Scan**: Index all historical media in channel

## Architecture

```
Nexomemgram/
├── web/
│   ├── index.html          # Frontend structure
│   ├── styles.css          # Responsive styling & masonry grid
│   ├── script.js           # Frontend logic (drag-drop, caching, infinite scroll)
│   └── server/
│       ├── index.js        # Express proxy (Telegram Bot API + MTProto)
│       ├── package.json    # Dependencies
│       └── .gitignore      # Ignore node_modules, .env, uploads/
```

## Frontend

### Layout
- **5-column masonry** (desktop ≥1600px)
- **3-column masonry** (tablet ≤900px)
- **2-column masonry** (mobile ≤640px)
- White background (#FFFFFF), 16px rounded cards, subtle hover shadows

### Features
1. **Config Panel** (⚙️): Store API_ID, API_HASH, BOT_TOKEN, CHANNEL_ID in localStorage
2. **Drag & Drop**: Works anywhere on page; images auto-upload to Telegram channel
3. **Progress Bar**: Linear progress at bottom of uploading cards
4. **Infinite Scroll**: Fetches 50 images per batch as user scrolls
5. **Local Cache**: Thumbnails cached in localStorage for instant reload
6. **Metadata Overlay**: Gradient overlay on hover shows date and file size

## Backend

### Endpoints

#### `GET /health`
Health check endpoint.

#### `GET /fetch-history?channelId=<id>`
Fetch latest 50 photos from channel.
- Headers: `X-API-ID`, `X-API-Hash`, `X-Bot-Token`
- Returns: `{ success, photos[], total, has_more }`

#### `GET /deep-scan?channelId=<id>`
Comprehensive scan of all historical media.
- Fetches 100 messages per batch (up to 1000 batches)
- Rate-limited via p-queue (30 req/sec)
- Returns: `{ success, photos[], total }`

#### `POST /upload`
Upload single image to channel.
- Headers: `X-API-ID`, `X-API-Hash`, `X-Bot-Token`, `X-Channel-ID`
- Body: multipart/form-data with `file` field
- Optional: `caption` field
- Returns: `{ success, photo{file_id, date, size, ...} }`

#### `POST /upload-batch`
Upload multiple images (max 20 files).
- Same headers as `/upload`
- Body: multipart/form-data with `files[]`
- Returns: `{ success, total, successful, failed, results[] }`

### Telegram Integration

- **Library**: `telegram` (gramjs) v2.26.22
- **Session**: Anonymous StringSession (no persistent auth needed for bot)
- **Rate Limiting**: p-queue with 30 req/sec cap (Telegram's limit)
- **Optimization**: sharp resizes images (max width 2000px, 85% quality JPEG)

### Configuration

Copy `.env.example` to `.env` in `server/`:

```bash
BOT_TOKEN=your_bot_token_here
API_ID=your_api_id_here
API_HASH=your_api_hash_here
FRONTEND_URL=http://localhost:5173
PORT=3001
NODE_ENV=development
```

## Running the Project

### Backend
```bash
cd web/server
npm install
node index.js
```
Server runs on `http://localhost:3001`

### Frontend
```bash
cd web
npx serve -s . -l 5173
```
Frontend runs on `http://localhost:5173`

## Security Notes

- Bot token is passed via headers (use HTTPS in production)
- Configuration stored in localStorage (encrypt for sensitive data)
- Rate limiting prevents Telegram API bans
- Optional backend proxy recommended for production to hide credentials

## API Rate Limits

Telegram Bot API: ~30 requests/second
The p-queue ensures this limit is never exceeded during deep scans or batch uploads.
