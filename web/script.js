// Nexomemgram - Telegram Media Gallery Frontend
class Nexomemgram {
  constructor() {
    this.config = { apiId:'', apiHash:'', botToken:'', channelId:'' };
    this.isLoading = false; this.hasMore = true; this.offset = 0;
    this.init();
  }

  init() {
    this.configToggle = document.getElementById('configToggle');
    this.configPanel = document.getElementById('configPanel');
    this.configForm = document.getElementById('configForm');
    this.dropZone = document.getElementById('dropZone');
    this.dropZoneContent = this.dropZone.querySelector('.drop-zone-content');
    this.fileInput = document.getElementById('fileInput');
    this.masonryGrid = document.getElementById('masonryGrid');
    this.loadingIndicator = document.getElementById('loadingIndicator');
    this.toast = document.getElementById('toast');
    this.deepScanBtn = document.getElementById('deepScanBtn');

    this.configToggle.onclick = () => this.toggleConfig();
    document.onclick = (e) => { if(!this.configPanel.contains(e.target) && e.target!==this.configToggle)
      this.closeConfig(); };
    this.configForm.onsubmit = (e) => this.handleConfigSubmit(e);
    this.deepScanBtn.onclick = () => this.deepScan();

    this.dropZoneContent.ondragover = (e) => { e.preventDefault(); this.dropZoneContent.classList.add('dragover'); };
    this.dropZoneContent.ondragleave = (e) => { e.preventDefault(); this.dropZoneContent.classList.remove('dragover'); };
    this.dropZoneContent.ondrop = (e) => this.handleDrop(e);
    this.dropZoneContent.onclick = () => this.fileInput.click();
    this.fileInput.onchange = (e) => this.handleFiles(e.target.files);
    document.ondragover = (e) => { e.preventDefault(); };
    document.ondrop = (e) => { e.preventDefault(); };

    window.onscroll = () => this.handleScroll();
    window.onresize = () => clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.handleScroll(), 100);

    this.loadConfig();
    this.loadCached();
  }

  toggleConfig() { this.configPanel.classList.toggle('active'); }
  closeConfig() { this.configPanel.classList.remove('active'); }

  async handleConfigSubmit(e) {
    e.preventDefault();
    const fd = new FormData(this.configForm);
    this.config = { apiId:fd.get('apiId'), apiHash:fd.get('apiHash'),
      botToken:fd.get('botToken'), channelId:fd.get('channelId') };
    localStorage.setItem('nc_config', JSON.stringify(this.config));
    this.closeConfig();
    this.showToast('Settings saved!', 'success');
    await this.fetchMedia();
  }

  async deepScan() {
    if(!this.validate()) { this.showToast('Configure Telegram first', 'error'); return; }
    this.showToast('Deep scanning...', 'success');
    this.offset = 0; this.hasMore = true; this.masonryGrid.innerHTML = '';
    await this.fetchMedia(true);
    this.showToast('Deep scan complete!', 'success');
  }

  validate() { return this.config.botToken && this.config.channelId; }

  handleDrop(e) {
    e.preventDefault(); this.dropZoneContent.classList.remove('dragover');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if(files.length) this.uploadFiles(files);
  }

  handleFiles(files) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'));
    if(imgs.length) this.uploadFiles(imgs);
  }

  async uploadFiles(files) {
    if(!this.validate()) { this.showToast('Configure Telegram first', 'error'); return; }
    for(const file of files) {
      const url = URL.createObjectURL(file);
      const card = this.createCard({ url, uploading:true, file, size:file.size });
      this.masonryGrid.prepend(card);
      await this.uploadToTelegram(file, card);
    }
  }

  async uploadToTelegram(file, card) {
    if(!this.validate()) return;
    const form = new FormData();
    form.append('file', file);
    form.append('channel_id', this.config.channelId);
    try {
      const resp = await fetch('http://localhost:3001/upload', {
        method:'POST', headers: {
          'X-API-ID': this.config.apiId, 'X-API-Hash': this.config.apiHash,
          'X-Bot-Token': this.config.botToken, 'X-Channel-ID': this.config.channelId
        }, body: form
      });
      const data = await resp.json();
      card.classList.remove('uploading');
      card.querySelector('.card-metadata').style.opacity = 1;
      card.querySelector('.card-metadata').style.visibility = 'visible';
      card.querySelector('.progress-fill').style.width = '100%';
      this.showToast('Uploaded!', 'success');
      this.addToCache(data.photo);
    } catch(err) {
      this.showToast('Upload failed', 'error');
      console.error(err);
    }
  }

  async fetchMedia(deepScan=false) {
    if(this.isLoading || (!this.hasMore && !deepScan)) return;
    this.isLoading = true; this.showLoading(true);
    try {
      const url = deepScan ?
        `http://localhost:3001/deep-scan?channelId=${this.config.channelId}` :
        `http://localhost:3001/fetch-history?channelId=${this.config.channelId}&offset=${this.offset}`;
      const resp = await fetch(url, {
        headers: {
          'X-API-ID': this.config.apiId, 'X-API-Hash': this.config.apiHash,
          'X-Bot-Token': this.config.botToken
        }
      });
      const data = await resp.json();
      if(data.photos && data.photos.length) {
        data.photos.forEach(p => { this.masonryGrid.appendChild(this.createCard(p)); this.offset++; });
        this.addToCache(data.photos);
        this.hasMore = data.has_more !== false;
      } else { this.hasMore = false; }
      this.cacheAll();
    } catch(err) { console.error(err); }
    this.isLoading = false; this.showLoading(false);
  }

  createCard(media) {
    const card = document.createElement('div');
    card.className = 'card';
    if(media.uploading) card.classList.add('uploading');
    const d = new Date(media.date);
    const dateStr = d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const sizeStr = media.size ? (media.size/1024/1024).toFixed(1)+' MB' : '--';
    card.innerHTML = `<div class="card-image-container">
      <img src="${media.url}" class="card-image" loading="lazy">
      ${media.uploading ? '<div class="progress-bar"><div class="progress-fill"></div></div>' : ''}
      <div class="card-metadata">
        <div class="metadata-date"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${dateStr}</div>
        <div class="metadata-size">${sizeStr}</div>
      </div></div>`;
    const img = card.querySelector('.card-image');
    img.onload = () => { img.style.opacity = 1; };
    return card;
  }

  handleScroll() {
    if((window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 500))
      this.fetchMedia();
  }

  showLoading(show) { this.loadingIndicator.style.display = show ? 'block' : 'none'; }

  showToast(msg, type='info') {
    this.toast.textContent = msg; this.toast.className = 'toast '+type;
    this.toast.classList.add('show');
    setTimeout(() => this.toast.classList.remove('show'), 3000);
  }

  addToCache(photo) {
    if(Array.isArray(photo)) { photo.forEach(p => this.addToCache(p)); return; }
    let cache = JSON.parse(localStorage.getItem('nc_media')||'[]');
    if(!cache.find(c => c.file_id === photo.file_id)) cache.unshift(photo);
    localStorage.setItem('nc_media', JSON.stringify(cache.slice(0,200)));
  }

  loadConfig() {
    const c = localStorage.getItem('nc_config');
    if(c) { this.config = JSON.parse(c);
      ['apiId','apiHash','botToken','channelId'].forEach(k => {
        const el = this.configForm.querySelector(`[name="${k}"]`);
        if(el) el.value = this.config[k] || '';
      });
    }
  }

  loadCached() {
    const cache = JSON.parse(localStorage.getItem('nc_media')||'[]');
    if(cache.length) cache.slice(0,50).forEach(p => this.masonryGrid.appendChild(this.createCard(p)));
    else this.fetchMedia();
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new Nexomemgram(); });
