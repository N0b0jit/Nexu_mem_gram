# Nexomemgram: Unlimited Cloud Gallery via Telegram

Nexomemgram is a high-performance, privacy-focused web application designed to serve as a personal photo cloud. By leveraging the Telegram Bot API and MTProto as a backend, it provides users with unlimited storage for their media, wrapped in a modern, Pinterest-style interface.

The project aims to replicate the simplicity of legacy photo storage apps while bypassing traditional 15GB storage limitations and monthly subscription fees.

## 🚀 Features

### 🖼️ Pinterest-Style Masonry Grid
- **Adaptive Layout**: Dynamic 5-column (desktop), 3-column (tablet), and 2-column (mobile) grid.
- **Fluid UI**: Minimalist design featuring rounded corners (16px), subtle hover shadows, and smooth elevation effects.
- **Metadata Overlay**: Hover over any card to view upload dates and file sizes via a subtle gradient overlay.

### ☁️ Unlimited Telegram Storage
- **Bot-as-a-Service**: Uses a Telegram Bot and Private Channel as a Distributed File System (DFS).
- **Deep Scan Technology**: Features a re-indexing engine that "crawls" your private channel history to find media uploaded before the app was connected.
- **Zero Cost**: No subscription fees—storage is entirely hosted within your own Telegram account.

### 📤 Smart Upload & Sync
- **Global Drag-and-Drop**: Drop images anywhere on the screen to trigger the background upload sequence.
- **Progress Tracking**: Real-time linear progress bars for every active upload.
- **Infinite Scroll**: Seamlessly loads 50+ images at a time using `IntersectionObserver` for a smooth browsing experience.

## 🛠️ Technical Architecture

Nexomemgram is built using a modern React architecture with a focus on performance and local-first data persistence.

- **Frontend**: React / Vite / Tailwind CSS / Inter Font
- **Protocol**: MTProto (via GramJS) & Telegram Bot API
- **Caching**: localStorage & IndexedDB for instant thumbnail retrieval
- **Image Management**: Lazy loading and blob URL generation to bypass CORS restrictions

## ⚙️ Installation & Setup

To run Nexomemgram locally or deploy it to your own server:

1. **Get Telegram API Credentials**:
   Visit [my.telegram.org](https://my.telegram.org) and create a new application to obtain your `API_ID` and `API_HASH`.

2. **Create a Bot**:
   Message [@BotFather](https://t.me/BotFather) on Telegram to create a new bot and copy the **Bot Token**.

3. **Setup the Channel**:
   - Create a Private Channel in Telegram.
   - Add your Bot as an Administrator.

4. **Connect Nexomemgram**:
   Open the app, enter your credentials in the Configuration Panel (⚙️), and click **Sync Gallery**.

## 📁 Project Structure

```bash
├── index.html         # Main application structure
├── src/               # React components, styles, and core logic
│   ├── main.tsx       # Entry point
│   ├── App.tsx        # Main application component
│   └── lib/           # Telegram integration, uploads, and utilities
├── package.json       # Project dependencies
├── vite.config.ts     # Vite bundler configuration
└── README.md          # Project documentation
```

## 🔒 Privacy & Security

Nexomemgram is built with a **Zero-Footprint** philosophy:

- **No Third-Party Servers**: Your data moves directly between your browser and Telegram.
- **Local Credentials**: API keys and Bot tokens are stored securely in your browser's local storage and never leave your device.
- **Private Channels**: Only you (and your authorized bot) have access to the underlying storage channel.

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
