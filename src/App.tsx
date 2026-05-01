/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Masonry from 'react-masonry-css';
import { 
  Cloud, 
  Upload, 
  LogOut, 
  Search, 
  Image as ImageIcon, 
  Loader2, 
  RefreshCw,
  Plus,
  ArrowRight,
  ShieldCheck,
  Send,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
  Trash2,
  Download,
  Calendar,
  X,
  Sparkles,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { TelegramService, type MediaItem, type TelegramConfig } from './lib/telegram';
import { cn, loadConfig, saveConfig, clearConfig } from './lib/utils';
import { analyzeImage } from './lib/gemini';

// --- UI Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  loading = false, 
  ...props 
}: any) => {
  const variants = {
    primary: 'bg-gradient-to-r from-logo-blue to-logo-purple text-white hover:shadow-lg hover:shadow-logo-blue/20',
    secondary: 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-border-gray dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700',
    outline: 'bg-transparent text-zinc-600 dark:text-zinc-400 border border-border-gray dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white',
    ghost: 'bg-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800',
  };

  return (
    <button 
      disabled={loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-all focus:outline-none disabled:opacity-50',
        variants[variant as keyof typeof variants],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
};

const Input = ({ label, icon: Icon, className, ...props }: any) => (
  <div className="space-y-1.5 text-left">
    {label && <label className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight">{label}</label>}
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />}
      <input 
        className={cn(
          "w-full rounded-md border border-border-gray dark:border-white/10 bg-[#F9FAFB] dark:bg-zinc-800 py-2 text-[13px] outline-none transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-600 focus:border-logo-blue focus:ring-4 focus:ring-logo-blue/5 dark:text-white",
          Icon ? "pl-9 pr-3" : "px-3",
          className
        )}
        {...props}
      />
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadOverlay, setShowUploadOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  
  const serviceRef = useRef<TelegramService | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const saved = loadConfig();
    if (saved) {
      // Use a separate connect version that doesn't trigger initial refresh loop if needed
      // but actually the loop is caused by handleConnect -> setConfig(config) -> useEffect([config])
      const { token, chatId } = saved;
      const newConfig = { botToken: token, chatId };
      const service = new TelegramService(newConfig);
      serviceRef.current = service;
      setConfig(newConfig);
      // Wait for serviceRef to be available
      setTimeout(() => refreshMedia(), 100);
    }

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDraggingGlobal(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDraggingGlobal(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDraggingGlobal(false);
      if (e.dataTransfer?.files && serviceRef.current) {
        handleFileUpload(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []); // Empty dependency array to fix maximum update depth exceeded

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleUnload = () => {
      if (serviceRef.current && config) {
        serviceRef.current.sendKeepAliveMessage(`🚪 WEB INTERFACE DISCONNECTED\n📅 Date: ${new Date().toLocaleDateString()}\n⏰ Time: ${new Date().toLocaleTimeString()}\n\nSession ended.`);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [config]);

  useEffect(() => {
    let interval: any;
    if (isSlideshowActive) {
      interval = setInterval(() => {
        setSlideshowIndex(prev => (prev + 1) % items.length);
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [isSlideshowActive, items.length]);

  const handleConnect = async (token: string, chatId: string) => {
    try {
      const newConfig = { botToken: token, chatId };
      const service = new TelegramService(newConfig);
      serviceRef.current = service;
      
      saveConfig(token, chatId);
      setConfig(newConfig);
      
      // Sending connection message
      await service.sendMessage(`🌐 NEXOMEMGRAM Connected\n📅 Date: ${new Date().toLocaleDateString()}\n⏰ Time: ${new Date().toLocaleTimeString()}\n\nInterface assembled successfully.`);
      
      refreshMedia();
    } catch (err: any) {
      alert('Failed to connect: ' + err.message);
    }
  };

  const refreshMedia = async () => {
    const service = serviceRef.current;
    if (!service) return;
    setIsRefreshing(true);
    try {
      const latestId = await service.getLatestMessageId();
      setItems([]);
      await service.scanBackwards(latestId, 20, (item) => {
        setItems(prev => {
          if (prev.some(i => i.id === item.id)) return prev;
          return [...prev, item].sort((a, b) => b.date - a.date);
        });
      });
    } catch (err: any) {
      console.error('Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const scanMore = async () => {
    const service = serviceRef.current;
    if (!service || isScanning) return;
    setIsScanning(true);
    try {
      const minId = items.length > 0 ? Math.min(...items.map(i => i.messageId)) : await service.getLatestMessageId();
      await service.scanBackwards(minId - 1, 30, (item) => {
        setItems(prev => {
          if (prev.some(i => i.id === item.id)) return prev;
          return [...prev, item].sort((a, b) => b.date - a.date);
        });
      });
    } catch (err: any) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    const service = serviceRef.current;
    if (!files || !service) return;
    setIsUploading(true);
    setShowUploadOverlay(false);
    
    try {
      // First send notification message
      await service.sendMessage(`📤 Uploaded by web [${files.length} fragments]`);
      
      for (let i = 0; i < files.length; i++) {
        const item = await service.uploadFile(files[i]);
        setItems(prev => [item, ...prev].sort((a, b) => b.date - a.date));
      }
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const logout = () => {
    clearConfig();
    setConfig(null);
    setItems([]);
    serviceRef.current = null;
  };

  const filteredItems = items.filter(item => 
    item.caption?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.type.includes(searchQuery.toLowerCase())
  );

  const toggleSelectItem = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = async () => {
    const service = serviceRef.current;
    if (!service || selectedIds.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) return;

    setIsRefreshing(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      for (const id of idsToDelete) {
        const item = items.find(i => i.id === id);
        if (item) {
          await service.deleteMessage(item.messageId);
        }
      }
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      setIsSelectMode(false);
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;
    
    setIsRefreshing(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("nexomemgram_export");
      
      const downloadTasks = Array.from(selectedIds).map(async (id) => {
        const item = items.find(i => i.id === id);
        if (item && folder) {
          const response = await fetch(item.url);
          const blob = await response.blob();
          const fileName = `fragment_${item.messageId}.${item.url.split('.').pop() || 'jpg'}`;
          folder.file(fileName, blob);
        }
      });

      await Promise.all(downloadTasks);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `nexomemgram_export_${Date.now()}.zip`);
    } catch (err: any) {
      alert('Download failed: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedItem || isAnalyzing) return;
    setIsAnalyzing(true);
    setAiInsight(null);
    try {
      const result = await analyzeImage(selectedItem.url);
      setAiInsight(result || "No insights found.");
    } catch (err: any) {
      setAiInsight("Failed to analyze memory: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startSlideshow = () => {
    if (items.length === 0) return;
    setSlideshowIndex(0);
    setIsSlideshowActive(true);
  };

  const breakpointColumnsObj = {
    default: 5,
    1280: 4,
    1024: 3,
    640: 2
  };

  if (!config) {
    return (
      <AnimatePresence mode="wait">
        <LandingSection onConnect={handleConnect} darkMode={darkMode} setDarkMode={setDarkMode} key="landing" />
      </AnimatePresence>
    );
  }

  return (
    <div 
      className="min-h-screen bg-bg-gray text-zinc-900 dark:text-zinc-100 font-sans selection:bg-logo-blue selection:text-white transition-colors duration-300"
    >
      <AnimatePresence>
        {isDraggingGlobal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/40 dark:bg-black/40 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="bg-white dark:bg-zinc-900 p-12 rounded-[60px] shadow-[0_32px_64px_-20px_rgba(0,0,0,0.3)] dark:shadow-[0_32px_64px_-20px_rgba(0,0,0,0.5)] border border-white dark:border-white/5 flex flex-col items-center gap-8 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-logo-blue/5 to-logo-purple/5 pointer-events-none" />
              
              <motion.div 
                animate={{ 
                  y: [0, -10, 0],
                  rotate: [0, 2, -2, 0]
                }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="w-28 h-28 bg-gradient-to-br from-logo-blue to-logo-purple rounded-[40px] flex items-center justify-center shadow-2xl shadow-logo-blue/40 relative z-10"
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-[40px]" />
                <Upload size={48} className="text-white relative z-10" />
              </motion.div>

              <div className="text-center relative z-10">
                <h3 className="text-4xl font-black tracking-tight dark:text-white mb-2">Memory Deposit</h3>
                <p className="text-zinc-500 dark:text-zinc-400 font-bold text-base tracking-wide uppercase opacity-60">Assemble your fragments</p>
              </div>

              <div className="flex gap-2">
                {[1, 2, 3].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-logo-blue"
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-border-gray dark:border-white/5 h-16 flex items-center transition-colors">
        <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between gap-8">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-3"
          >
            <img src="/logo.png" alt="Nexomemgram" className="h-8 w-8 object-contain" />
            <h1 className="text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-logo-blue to-logo-purple hidden sm:block">
              NEXOMEMGRAM
            </h1>
          </motion.div>

          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 dark:text-zinc-600" />
              <input 
                type="text"
                placeholder="Search your memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-gray dark:bg-zinc-800/50 border-none rounded-full py-2.5 pl-11 pr-5 text-sm transition-all outline-none focus:ring-1 focus:ring-logo-blue/50 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={startSlideshow} 
              className="p-2.5 rounded-xl text-zinc-400 hover:text-logo-blue hover:bg-logo-blue/5 dark:hover:bg-logo-blue/10 transition-all active:scale-95"
              title="Play Slideshow"
            >
              <Play size={20} />
            </button>
            <button 
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedIds(new Set());
              }} 
              className={cn(
                "p-2.5 rounded-xl transition-all active:scale-95",
                isSelectMode ? "bg-logo-blue text-white shadow-lg shadow-logo-blue/20" : "text-zinc-400 hover:text-logo-blue hover:bg-logo-blue/5"
              )}
              title="Batch Selection"
            >
              <CheckCircle2 size={20} />
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)} 
              className="p-2.5 rounded-xl text-zinc-400 hover:text-logo-blue hover:bg-logo-blue/5 dark:hover:bg-logo-blue/10 transition-all active:scale-95"
              title="Toggle Theme"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-500 font-bold bg-bg-gray dark:bg-zinc-800 px-3 py-1.5 rounded-full border border-border-gray dark:border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{config.chatId}</span>
            </div>
            <button onClick={logout} className="p-2.5 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all active:scale-95">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {items.length === 0 && !isRefreshing ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[60vh] text-center bg-white dark:bg-zinc-900 border border-border-gray dark:border-white/5 rounded-[40px] p-12 shadow-card transition-colors"
          >
            <div className="w-20 h-20 bg-bg-gray dark:bg-zinc-800 rounded-full flex items-center justify-center mb-8">
              <ImageIcon size={32} className="text-zinc-300 dark:text-zinc-600" />
            </div>
            <h2 className="text-3xl font-black mb-3 tracking-tight dark:text-white">Cloud Empty</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mb-10 text-sm font-medium leading-relaxed">
              Your personal gallery is active. Start by dropping files anywhere on screen or initiate a deep scan.
            </p>
            <div className="flex gap-4">
              <Button onClick={() => setShowUploadOverlay(true)} className="px-10 py-3 rounded-2xl">
                Upload Fragment
              </Button>
              <Button variant="secondary" onClick={refreshMedia} loading={isRefreshing} className="px-10 py-3 rounded-2xl dark:bg-zinc-800 dark:border-white/10 dark:text-white">
                Deep Scan
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8">
            <Masonry
              breakpointCols={breakpointColumnsObj}
              className="flex -ml-6 w-auto"
              columnClassName="pl-6 bg-clip-padding"
            >
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, idx) => (
                  <MediaCard 
                    key={item.id} 
                    item={item} 
                    index={idx} 
                    onClick={isSelectMode ? () => toggleSelectItem(item.id) : setSelectedItem} 
                    isSelected={selectedIds.has(item.id)}
                    isSelectMode={isSelectMode}
                  />
                ))}
              </AnimatePresence>
            </Masonry>
            
            <motion.div 
              layout
              onClick={() => setShowUploadOverlay(true)}
              className="h-32 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl flex items-center justify-center gap-4 bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 text-sm cursor-pointer hover:border-logo-blue hover:text-logo-blue dark:hover:border-logo-blue/50 dark:hover:text-logo-blue hover:bg-logo-blue/5 dark:hover:bg-logo-blue/5 transition-all group overflow-hidden relative"
            >
              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 group-hover:bg-logo-blue/10 transition-colors z-10">
                <Upload size={24} />
              </div>
              <span className="font-semibold z-10 transition-all group-hover:translate-x-1">Append memories directly to <strong>Telegram Cluster</strong></span>
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-logo-blue/5 to-transparent opacity-0 group-hover:opacity-100"
                initial={false}
                transition={{ duration: 0.3 }}
              />
            </motion.div>

            {items.length > 0 && (
              <div className="mt-12 flex justify-center pb-20">
                <Button 
                  variant="outline" 
                  onClick={scanMore} 
                  loading={isScanning} 
                >
                  {isScanning ? 'Scanning History...' : 'Discover More History'}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
            onClick={() => setSelectedItem(null)}
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors p-2"
              onClick={() => setSelectedItem(null)}
            >
              <Plus size={32} className="rotate-45" />
            </motion.button>

            <motion.div
              layoutId={selectedItem.id}
              className="max-w-5xl w-full max-h-full flex flex-col md:flex-row items-center justify-center gap-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 flex flex-col items-center gap-4">
                <img 
                  src={selectedItem.url} 
                  className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl shadow-logo-blue/20"
                  alt="Memory Fragment Full View"
                />
                <div className="text-center space-y-2">
                  <p className="text-white font-bold text-lg">{selectedItem.caption || 'Fragment ID: ' + selectedItem.messageId}</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-[10px] bg-white/10 text-white/80 px-3 py-1 rounded-full font-bold uppercase tracking-widest border border-white/10">
                      {selectedItem.type}
                    </span>
                    <p className="text-xs text-white/50 font-medium">
                      {new Date(selectedItem.date).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-80 space-y-4">
                <button 
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="w-full py-4 bg-gradient-to-r from-logo-blue to-logo-purple rounded-2xl text-white font-black text-sm flex items-center justify-center gap-3 hover:shadow-xl hover:shadow-logo-blue/30 transition-all active:scale-95"
                >
                  {isAnalyzing ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  AI MEMORY INSIGHT
                </button>

                <AnimatePresence mode="wait">
                  {aiInsight ? (
                    <motion.div 
                      key="insight"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-white text-sm leading-relaxed overflow-y-auto max-h-[40vh]"
                    >
                      <p className="opacity-90">{aiInsight}</p>
                    </motion.div>
                  ) : !isAnalyzing && (
                    <motion.div 
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-10 border-2 border-dashed border-white/10 rounded-2xl"
                    >
                      <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Awaiting Analysis</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slideshow Overlay */}
      <AnimatePresence>
        {isSlideshowActive && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center"
          >
            <div className="absolute top-8 left-8 flex items-center gap-4 z-10">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Nexomemgram" className="h-6 w-6" />
                <span className="text-white font-black text-sm tracking-tighter">NEXO_STREAM</span>
              </div>
              <div className="h-4 w-px bg-white/20" />
              <span className="text-white/50 text-xs font-mono">{slideshowIndex + 1} / {items.length}</span>
            </div>

            <div className="absolute top-8 right-8 flex items-center gap-4 z-10">
              <button 
                onClick={() => setIsSlideshowActive(false)}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md"
              >
                <X size={24} />
              </button>
            </div>

            <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={items[slideshowIndex].id}
                  initial={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.95, filter: 'blur(20px)' }}
                  transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex items-center justify-center p-12"
                >
                  <img 
                    src={items[slideshowIndex].url}
                    className="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(37,99,235,0.3)] rounded-lg"
                    alt="Slideshow active fragment"
                  />
                  
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center space-y-4 max-w-2xl px-6">
                    <motion.p 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-white text-xl font-bold tracking-tight bg-black/50 backdrop-blur-md px-6 py-2 rounded-full inline-block border border-white/10"
                    >
                      {items[slideshowIndex].caption || "FRAGMENT_" + items[slideshowIndex].messageId}
                    </motion.p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Slideshow Progress Bar */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
              <motion.div 
                key={slideshowIndex}
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 4, ease: "linear" }}
                className="h-full bg-logo-blue"
              />
            </div>

            {/* Slideshow Controls */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6 z-10 px-8 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full">
              <button 
                onClick={() => setSlideshowIndex(prev => (prev - 1 + items.length) % items.length)}
                className="text-white/50 hover:text-white transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              <button className="text-white bg-logo-blue p-2 rounded-full shadow-lg shadow-logo-blue/40">
                <Pause size={20} fill="white" />
              </button>
              <button 
                onClick={() => setSlideshowIndex(prev => (prev + 1) % items.length)}
                className="text-white/50 hover:text-white transition-colors"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Overlay */}
      <AnimatePresence>
        {showUploadOverlay && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white/60 backdrop-blur-xl flex items-center justify-center p-6"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              handleFileUpload(e.dataTransfer.files);
            }}
          >
            <motion.div 
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="bg-white rounded-[50px] p-12 max-w-lg w-full text-center relative border border-zinc-100 shadow-2xl shadow-zinc-200/50"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowUploadOverlay(false)}
                className="absolute top-8 right-8 p-3 rounded-full hover:bg-zinc-50 text-zinc-300 transition-all hover:rotate-90 hover:text-zinc-900"
              >
                <Plus size={24} className="rotate-45" />
              </button>

              <div className="w-24 h-24 bg-gradient-to-br from-logo-blue to-logo-purple rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-xl shadow-logo-blue/20">
                <Upload size={32} className="text-white" />
              </div>

              <h2 className="text-4xl font-black mb-4 tracking-tighter leading-tight">Drop your memories</h2>
              <p className="text-zinc-500 mb-10 leading-relaxed font-medium">
                Images are sent directly to your Telegram bot. Uncapped, encrypted, and personal.
              </p>

              <div className="flex flex-col gap-3">
                <label className="cursor-pointer group">
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <div className="bg-gradient-to-r from-logo-blue to-logo-purple text-white rounded-2xl py-5 font-bold flex items-center justify-center gap-3 hover:shadow-lg hover:shadow-logo-blue/20 transition-all">
                    <Search size={18} /> Choose Fragments
                  </div>
                </label>
                <Button variant="ghost" onClick={() => setShowUploadOverlay(false)} className="py-4">
                  Stay Hidden
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploading Notification */}
      <AnimatePresence>
        {(isUploading || isRefreshing) && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-black text-white px-8 py-5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex items-center gap-4 border border-white/10"
          >
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <motion.div 
                  key={i}
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                  className="w-1.5 h-1.5 bg-white rounded-full"
                />
              ))}
            </div>
            <span className="font-bold text-xs uppercase tracking-[0.2em]">{isUploading ? 'Syncing Payload...' : 'Mapping Cloud...'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Action Bar */}
      <AnimatePresence>
        {isSelectMode && selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-zinc-900 border border-border-gray dark:border-white/10 px-8 py-4 rounded-[32px] shadow-2xl flex items-center gap-8"
          >
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-logo-blue tracking-widest">Selection</span>
              <span className="text-sm font-black dark:text-white">{selectedIds.size} Fragments</span>
            </div>
            
            <div className="h-8 w-px bg-zinc-100 dark:bg-zinc-800" />

            <div className="flex gap-2">
              <button 
                onClick={handleBatchDownload}
                className="flex items-center gap-2 px-4 py-2 bg-logo-blue text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-logo-blue/20 transition-all active:scale-95"
              >
                <Download size={14} /> ZIP Download
              </button>
              <button 
                onClick={handleBatchDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-red-500/20 transition-all active:scale-95"
              >
                <Trash2 size={14} /> Delete
              </button>
              <button 
                onClick={() => setIsSelectMode(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Subcomponents ---

function LandingSection({ 
  onConnect, 
  darkMode, 
  setDarkMode 
}: { 
  onConnect: (token: string, chatId: string) => Promise<void> | void,
  darkMode: boolean,
  setDarkMode: (d: boolean) => void,
  key?: string
}) {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !chatId) return;
    setIsLoading(true);
    await onConnect(token, chatId);
    setIsLoading(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#F0F2F5] dark:bg-[#0A0D12] flex items-center justify-center p-8 selection:bg-logo-blue selection:text-white transition-colors duration-500"
    >
      <div className="max-w-md w-full relative">
        {/* Theme toggle for landing */}
        <div className="absolute -top-16 right-0">
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-border-gray dark:border-white/5 text-zinc-400 hover:text-logo-blue transition-all shadow-xl"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white dark:bg-zinc-900 rounded-[50px] shadow-2xl shadow-logo-blue/10 border border-border-gray dark:border-white/5 overflow-hidden transition-colors"
        >
          <div className="p-12 space-y-10">
            <div className="text-center space-y-5">
              <motion.img 
                initial={{ scale: 0.8, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                src="/logo.png" 
                alt="Nexomemgram" 
                className="h-20 w-20 mx-auto object-contain mb-2 drop-shadow-2xl" 
              />
              <div>
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-logo-blue to-logo-purple"
                >
                  NEXOMEMGRAM
                </motion.div>
                <p className="text-zinc-400 font-bold text-[10px] mt-2 uppercase tracking-[0.3em] opacity-60">Personal Memory Interface</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Input 
                label="Telegram User ID" 
                placeholder="e.g. 882940211" 
                value={chatId}
                onChange={(e: any) => setChatId(e.target.value)}
                required
                className="dark:bg-zinc-800 dark:border-white/10 dark:text-white"
              />
              <Input 
                label="Bot Token" 
                placeholder="728192:AAH-xX..." 
                type="password"
                value={token}
                onChange={(e: any) => setToken(e.target.value)}
                required
                className="dark:bg-zinc-800 dark:border-white/10 dark:text-white"
              />
              
              <Button 
                type="submit"
                loading={isLoading}
                className="w-full py-4 mt-4 rounded-2xl text-base shadow-xl shadow-logo-blue/20"
              >
                Assemble Connection
              </Button>
            </form>

            <div className="pt-6 border-t border-zinc-100 space-y-4 text-[11px] text-zinc-400 leading-relaxed">
              <p>Connected to Telegram API. Deep scanning enabled. Local storage active.</p>
              <div className="grid grid-cols-1 gap-2">
                <div className="bg-bg-gray p-3 rounded-lg">
                  <p className="font-bold text-zinc-900 mb-0.5">1. Get Token from @BotFather</p>
                </div>
                <div className="bg-bg-gray p-3 rounded-lg">
                  <p className="font-bold text-zinc-900 mb-0.5">2. Get ID from @UserinfoBot</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function MediaCard({ item, index, onClick, isSelected, isSelectMode }: any) {
  return (
    <motion.div 
      layout
      layoutId={item.id}
      initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ delay: Math.min(index * 0.05, 0.5), duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "mb-6 break-inside-avoid group relative transition-all duration-300",
        isSelected && "scale-[0.98]"
      )}
      onClick={() => onClick(item)}
    >
      <div className={cn(
        "relative rounded-[24px] overflow-hidden bg-white dark:bg-zinc-800 border shadow-lg group-hover:shadow-2xl group-hover:scale-[1.02] cursor-pointer transition-all duration-500 ease-out",
        isSelected ? "border-logo-blue ring-4 ring-logo-blue/20" : "border-black/5 dark:border-white/5"
      )}>
        <img 
          src={item.url} 
          alt={item.caption || 'Media fragment'} 
          className={cn(
            "w-full h-auto object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700",
            isSelected && "grayscale-0 opacity-80"
          )}
          loading="lazy"
        />
        
        {/* Selection Indicator */}
        {isSelectMode && (
          <div className="absolute top-4 right-4 z-20">
            <div className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
              isSelected ? "bg-logo-blue border-logo-blue text-white" : "bg-white/20 backdrop-blur-md border-white/50 text-transparent"
            )}>
              <CheckCircle2 size={14} />
            </div>
          </div>
        )}
        
        {/* Hover Overlay */}
        {!isSelectMode && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 p-6 flex flex-col justify-end text-white">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              whileHover={{ y: 0, opacity: 1 }}
              className="space-y-2"
            >
              <p className="text-[13px] font-bold leading-tight line-clamp-2 tracking-tight">
                {item.caption || 'FRAGMENT_' + item.messageId}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  {item.type}
                </span>
                <p className="text-[10px] opacity-70 font-semibold">
                  {new Date(item.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
