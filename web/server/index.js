require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const Queue = require('p-queue').default;
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Multer - memory storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Directory
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

// Rate limiting queue - Telegram allows ~30 req/sec
const telegramQueue = new Queue({ concurrency: 1, interval: 1000, intervalCap: 30, timeout: 30000 });

// Telegram clients cache
const telegramClients = new Map();

// Init Telegram client
async function initTelegramClient(apiId, apiHash, botToken) {
  const key = `${apiId}-${apiHash}-${botToken}`;
  if (telegramClients.has(key)) {
    const c = telegramClients.get(key);
    if (c && c.connected) return c;
  }
  const { TelegramClient } = require('telegram');
  const StringSession = require('telegram').sessions.StringSession;
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
  await client.start({ botAuthToken: botToken });
  telegramClients.set(key, client);
  return client;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Fetch history
app.get('/fetch-history', async (req, res) => {
  const { channelId } = req.query;
  const apiId = req.headers['x-api-id'];
  const apiHash = req.headers['x-api-hash'];
  const botToken = req.headers['x-bot-token'];
  if (!channelId || !apiId || !apiHash || !botToken) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }
  try {
    const client = await initTelegramClient(apiId, apiHash, botToken);
    const result = await telegramQueue.add(async () => {
      const photos = [];
      const entity = await client.getInputEntity(channelId);
      const messages = await client.getMessages(entity, { limit: 50, filter: { _: 'InputMessagesFilterPhotos' } });
      for (const msg of messages) {
        if (msg.media?.photo) {
          const p = msg.media.photo;
          const pid = p.id || p.photoId;
          let largest = 0;
          if (p.sizes) p.sizes.forEach(s => { if (s.size && s.size > largest) largest = s.size; });
          let d = msg.date;
          if (!(d instanceof Date)) d = new Date(typeof d === 'number' ? d * 1000 : Date.now());
          photos.push({
            file_id: pid.toString(), id: pid.toString(), message_id: msg.id,
            date: d.toISOString(), size: largest || p.size || 0,
            size_formatted: formatFileSize(largest || p.size || 0),
            mime_type: 'image/jpeg', width: p.w || 0, height: p.h || 0
          });
        }
      }
      photos.sort((a, b) => new Date(b.date) - new Date(a.date));
      return { success: true, photos, total: photos.length, has_more: photos.length === 50 };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Deep scan
app.get('/deep-scan', async (req, res) => {
  const { channelId } = req.query;
  const apiId = req.headers['x-api-id'];
  const apiHash = req.headers['x-api-hash'];
  const botToken = req.headers['x-bot-token'];
  if (!channelId || !apiId || !apiHash || !botToken) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }
  try {
    const client = await initTelegramClient(apiId, apiHash, botToken);
    let all = [];
    let offset = 0;
    let batch = 0;
    const maxBatch = 1000;
    const batchSize = 100;
    while (batch < maxBatch) {
      const msgs = await telegramQueue.add(async () => {
        const e = await client.getInputEntity(channelId);
        return await client.getMessages(e, { limit: batchSize, offsetId: offset, filter: { _: 'InputMessagesFilterPhotos' } });
      });
      if (msgs.length === 0) break;
      for (const m of msgs) {
        if (m.media?.photo) {
          const p = m.media.photo;
          const pid = p.id || p.photoId;
          let largest = 0;
          if (p.sizes) p.sizes.forEach(s => { if (s.size && s.size > largest) largest = s.size; });
          let d = m.date;
          if (!(d instanceof Date)) d = new Date(typeof d === 'number' ? d * 1000 : Date.now());
          all.push({ file_id: pid.toString(), id: pid.toString(), message_id: m.id,
            date: d.toISOString(), size: largest || p.size || 0, size_formatted: formatFileSize(largest || p.size || 0) });
        }
      }
      offset = msgs[msgs.length - 1]?.id || offset;
      batch++;
      if (batch % 10 === 0) console.log(`Deep scan: ${all.length} photos (batch ${batch})`);
      await new Promise(r => setTimeout(r, 500));
    }
    all.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, photos: all, total: all.length, message: `Found ${all.length} photos` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload
app.post('/upload', upload.single('file'), async (req, res) => {
  const apiId = req.headers['x-api-id'];
  const apiHash = req.headers['x-api-hash'];
  const botToken = req.headers['x-bot-token'];
  const channelId = req.headers['x-channel-id'] || req.body.channel_id;
  if (!apiId || !apiHash || !botToken || !channelId) {
    return res.status(400).json({ success: false, error: 'Missing headers' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file' });
  }
  try {
    const client = await initTelegramClient(apiId, apiHash, botToken);
    const result = await telegramQueue.add(async () => {
      const entity = await client.getInputEntity(channelId);
      let buf = req.file.buffer;
      const orig = buf.length;
      try {
        buf = await sharp(buf).resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      } catch (e) { buf = req.file.buffer; }
      const msg = await client.sendMessage(entity, { file: buf, caption: req.body.caption || '', supportsStreaming: true });
      const up = msg.media?.photo;
      const pid = up?.id || up?.photoId;
      return {
        success: true,
        photo: {
          file_id: pid?.toString() || msg.id.toString(), id: pid?.toString() || msg.id.toString(),
          message_id: msg.id, date: new Date().toISOString(),
          size: buf.length, original_size: orig, size_formatted: formatFileSize(buf.length), mime_type: 'image/jpeg'
        },
        message: 'Uploaded'
      };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch upload
app.post('/upload-batch', upload.array('files', 20), async (req, res) => {
  const apiId = req.headers['x-api-id'];
  const apiHash = req.headers['x-api-hash'];
  const botToken = req.headers['x-bot-token'];
  const channelId = req.headers['x-channel-id'] || req.body.channel_id;
  if (!apiId || !apiHash || !botToken || !channelId) {
    return res.status(400).json({ success: false, error: 'Missing headers' });
  }
  if (!req.files?.length) {
    return res.status(400).json({ success: false, error: 'No files' });
  }
  try {
    const client = await initTelegramClient(apiId, apiHash, botToken);
    const entity = await client.getInputEntity(channelId);
    const promises = req.files.map((f, i) =>
      telegramQueue.add(async () => {
        try {
          let buf = f.buffer;
          try {
            buf = await sharp(buf).resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
          } catch (e) { buf = f.buffer; }
          const msg = await client.sendMessage(entity, { file: buf, supportsStreaming: true });
          const up = msg.media?.photo;
          const pid = up?.id || up?.photoId;
          return { file_index: i, file_name: f.originalname, success: true, photo: { file_id: pid?.toString() || msg.id.toString(), message_id: msg.id, date: new Date().toISOString(), size: buf.length } };
        } catch (e) {
          return { file_index: i, file_name: f.originalname, success: false, error: e.message };
        }
      })
    );
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.success).length;
    res.json({ success: true, total: results.length, successful: ok, failed: results.length - ok, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use((err, req, res, n) => res.status(500).json({ success: false, error: 'Server error' }));

const server = app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`  Nexomemgram Proxy Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Rate Limit: 30/sec`);
  console.log(`===========================================`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));

module.exports = app;
