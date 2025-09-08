// 弹出窗口的主要逻辑
class VideoDownloaderPopup {
  constructor() {
    this.videos = [];
    this.settings = {};
    this.downloads = new Map();
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
    this.loadVideos();
  }

  bindEvents() {
    // 刷新按钮
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadVideos();
    });

    // 下载全部按钮
    document.getElementById('downloadAllBtn').addEventListener('click', () => {
      this.downloadAll();
    });

    // 设置按钮
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.showSettings();
    });

    // 关闭设置按钮
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
      this.hideSettings();
    });

    // 保存设置按钮
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // 重置设置按钮
    document.getElementById('resetSettingsBtn').addEventListener('click', () => {
      this.resetSettings();
    });

    // 关闭下载面板按钮
    document.getElementById('closeDownloadBtn').addEventListener('click', () => {
      this.hideDownloadPanel();
    });

    // 监听来自background script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'HLS_DOWNLOAD_INFO':
        this.handleHLSDownloadInfo(message.data);
        break;
      case 'DOWNLOAD_PROGRESS':
        this.updateDownloadProgress(message.data);
        break;
      case 'DOWNLOAD_COMPLETE':
        this.handleDownloadComplete(message.data);
        break;
    }
  }

  async loadVideos() {
    this.updateStatus('正在扫描视频...', true);
    
    try {
      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error('无法获取当前标签页');
      }
      
      console.log('当前标签页:', tab.id, tab.url);
      
      // 从background script获取检测到的视频
      const response = await chrome.runtime.sendMessage({
        type: 'GET_VIDEOS',
        tabId: tab.id
      });

      console.log('获取视频响应:', response);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      this.videos = response.videos || [];
      this.renderVideoList();
      
      if (this.videos.length === 0) {
        console.log('未检测到视频，触发重新扫描...');
        
        // 触发重新扫描
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_VIDEOS' });
          console.log('重新扫描请求已发送');
        } catch (scanError) {
          console.error('发送扫描请求失败:', scanError);
        }
        
        // 等待一下再次获取
        setTimeout(async () => {
          try {
            const newResponse = await chrome.runtime.sendMessage({
              type: 'GET_VIDEOS',
              tabId: tab.id
            });
            console.log('重新获取视频响应:', newResponse);
            this.videos = newResponse.videos || [];
            this.renderVideoList();
          } catch (retryError) {
            console.error('重新获取视频失败:', retryError);
            this.updateStatus('扫描失败: ' + retryError.message, false);
          }
        }, 3000);
      }

    } catch (error) {
      console.error('加载视频失败:', error);
      this.updateStatus('扫描失败: ' + error.message, false);
    }
  }

  renderVideoList() {
    const videoList = document.getElementById('videoList');
    const emptyState = document.getElementById('emptyState');
    const downloadAllBtn = document.getElementById('downloadAllBtn');

    if (this.videos.length === 0) {
      videoList.style.display = 'none';
      emptyState.style.display = 'block';
      downloadAllBtn.disabled = true;
      this.updateStatus('未检测到视频', false);
      return;
    }

    videoList.style.display = 'block';
    emptyState.style.display = 'none';
    downloadAllBtn.disabled = false;
    this.updateStatus(`检测到 ${this.videos.length} 个视频`, false);

    // 清空列表
    videoList.innerHTML = '';

    // 渲染每个视频项
    this.videos.forEach((video, index) => {
      const videoItem = this.createVideoItem(video, index);
      videoList.appendChild(videoItem);
    });
  }

  createVideoItem(video, index) {
    const template = document.getElementById('videoItemTemplate');
    const videoItem = template.content.cloneNode(true);
    
    const container = videoItem.querySelector('.video-item');
    container.dataset.videoId = index;

    // 设置视频信息
    const typeBadge = videoItem.querySelector('.video-type-badge');
    typeBadge.textContent = this.getVideoTypeDisplay(video.type);
    
    const title = videoItem.querySelector('.video-title');
    title.textContent = video.title || '未知标题';
    title.title = video.title || '未知标题';

    const url = videoItem.querySelector('.video-url');
    url.textContent = this.truncateUrl(video.url);
    url.title = video.url;

    // 设置元数据
    const metaElements = videoItem.querySelectorAll('.video-meta span');
    if (metaElements.length >= 3) {
      metaElements[0].textContent = video.duration ? this.formatDuration(video.duration) : '未知时长';
      metaElements[1].textContent = video.size ? this.formatSize(video.size) : '未知大小';
      metaElements[2].textContent = video.type.toUpperCase();
    }

    // 绑定按钮事件
    const downloadBtn = videoItem.querySelector('.download-btn');
    downloadBtn.addEventListener('click', () => this.downloadVideo(video, index));

    const previewBtn = videoItem.querySelector('.preview-btn');
    previewBtn.addEventListener('click', () => this.previewVideo(video));

    const copyBtn = videoItem.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => this.copyVideoUrl(video.url));

    return videoItem;
  }

  getVideoTypeDisplay(type) {
    const typeMap = {
      'hls': 'HLS',
      'mp4': 'MP4',
      'mkv': 'MKV',
      'avi': 'AVI',
      'mov': 'MOV',
      'wmv': 'WMV',
      'flv': 'FLV',
      'webm': 'WEBM',
      'html5_video': 'H5',
      'embedded': 'EMB',
      'network_request': 'NET',
      'blob_video': 'BLOB',
      'videojs_player': 'VJS',
      'videojs_existing': 'VJS',
      'videojs_source': 'VJS'
    };
    return typeMap[type] || type.toUpperCase();
  }

  truncateUrl(url, maxLength = 50) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
  }

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '未知';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatSize(bytes) {
    if (!bytes || isNaN(bytes)) return '未知';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  async downloadVideo(video, index) {
    try {
      // 获取页面标题作为默认文件名
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error('无法获取当前标签页');
      }
      
      const titleResponse = await chrome.runtime.sendMessage({
        type: 'GET_PAGE_TITLE',
        tabId: tab.id
      });

      const filename = this.generateFilename(video.title || titleResponse.title || '视频', index);
      
      console.log('开始下载视频:', {
        url: video.url,
        title: filename,
        type: video.type,
        isBlob: video.isBlob
      });
      
      // 发送下载请求到background script
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_VIDEO',
        data: {
          url: video.url,
          title: filename,
          type: video.type,
          isBlob: video.isBlob
        }
      });

      console.log('下载响应:', response);

      if (response.success) {
        this.showNotification('开始下载: ' + filename, 'success');
        
        // 如果是HLS流或blob视频，显示下载面板
        if (video.type === 'hls' || video.url.includes('.m3u8') || video.isBlob) {
          this.showDownloadPanel();
        }
      } else {
        this.showNotification('下载失败: ' + (response.message || '未知错误'), 'error');
      }

    } catch (error) {
      console.error('下载失败:', error);
      this.showNotification('下载失败: ' + error.message, 'error');
    }
  }

  async downloadAll() {
    if (this.videos.length === 0) return;

    for (let i = 0; i < this.videos.length; i++) {
      await this.downloadVideo(this.videos[i], i);
      // 添加延迟避免过快的请求
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  previewVideo(video) {
    // 在新标签页中预览视频
    chrome.tabs.create({ url: video.url });
  }

  async copyVideoUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      this.showNotification('链接已复制到剪贴板', 'success');
    } catch (error) {
      console.error('复制失败:', error);
      this.showNotification('复制失败', 'error');
    }
  }

  generateFilename(title, index) {
    const template = this.settings.filenameTemplate || '{title}_{timestamp}';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    return template
      .replace('{title}', this.sanitizeFilename(title))
      .replace('{timestamp}', timestamp)
      .replace('{index}', (index + 1).toString().padStart(2, '0'));
  }

  sanitizeFilename(filename) {
    return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
  }

  updateStatus(text, loading = false) {
    const statusText = document.getElementById('statusText');
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    statusText.textContent = text;
    loadingSpinner.style.display = loading ? 'block' : 'none';
  }

  showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加样式
    Object.assign(notification.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      padding: '12px 16px',
      borderRadius: '6px',
      color: 'white',
      fontSize: '14px',
      fontWeight: '500',
      zIndex: '1000',
      animation: 'slideInRight 0.3s ease-out'
    });

    if (type === 'success') {
      notification.style.background = '#10b981';
    } else if (type === 'error') {
      notification.style.background = '#ef4444';
    } else {
      notification.style.background = '#3b82f6';
    }

    document.body.appendChild(notification);

    // 3秒后自动移除
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  // 设置管理
  showSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    settingsPanel.style.display = 'block';
    this.loadSettingsToForm();
  }

  hideSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    settingsPanel.style.display = 'none';
  }

  loadSettingsToForm() {
    document.getElementById('downloadPath').value = this.settings.downloadPath || '';
    document.getElementById('videoQuality').value = this.settings.videoQuality || 'auto';
    document.getElementById('mergeSegments').checked = this.settings.mergeSegments !== false;
    document.getElementById('filenameTemplate').value = this.settings.filenameTemplate || '{title}_{timestamp}';
  }

  async saveSettings() {
    this.settings = {
      downloadPath: document.getElementById('downloadPath').value,
      videoQuality: document.getElementById('videoQuality').value,
      mergeSegments: document.getElementById('mergeSegments').checked,
      filenameTemplate: document.getElementById('filenameTemplate').value
    };

    await chrome.storage.sync.set({ videoDownloaderSettings: this.settings });
    this.showNotification('设置已保存', 'success');
    this.hideSettings();
  }

  async resetSettings() {
    this.settings = {
      downloadPath: '',
      videoQuality: 'auto',
      mergeSegments: true,
      filenameTemplate: '{title}_{timestamp}'
    };

    await chrome.storage.sync.set({ videoDownloaderSettings: this.settings });
    this.loadSettingsToForm();
    this.showNotification('设置已重置', 'success');
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get('videoDownloaderSettings');
    this.settings = result.videoDownloaderSettings || {
      downloadPath: '',
      videoQuality: 'auto',
      mergeSegments: true,
      filenameTemplate: '{title}_{timestamp}'
    };
  }

  // 下载进度管理
  showDownloadPanel() {
    const downloadPanel = document.getElementById('downloadPanel');
    downloadPanel.style.display = 'block';
  }

  hideDownloadPanel() {
    const downloadPanel = document.getElementById('downloadPanel');
    downloadPanel.style.display = 'none';
  }

  handleHLSDownloadInfo(data) {
    this.showDownloadPanel();
    this.addDownloadItem(data);
  }

  addDownloadItem(downloadData) {
    const downloadContent = document.getElementById('downloadContent');
    const template = document.getElementById('downloadItemTemplate');
    const downloadItem = template.content.cloneNode(true);

    const container = downloadItem.querySelector('.download-item');
    const downloadId = Date.now().toString();
    container.dataset.downloadId = downloadId;

    const title = downloadItem.querySelector('.download-title');
    title.textContent = downloadData.title;

    const progressFill = downloadItem.querySelector('.progress-fill');
    const progressText = downloadItem.querySelector('.progress-text');
    const downloadStatus = downloadItem.querySelector('.download-status');

    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    downloadStatus.textContent = '准备下载...';

    // 绑定控制按钮
    const pauseBtn = downloadItem.querySelector('.pause-btn');
    const cancelBtn = downloadItem.querySelector('.cancel-btn');

    pauseBtn.addEventListener('click', () => this.pauseDownload(downloadId));
    cancelBtn.addEventListener('click', () => this.cancelDownload(downloadId));

    downloadContent.appendChild(downloadItem);

    // 存储下载信息
    this.downloads.set(downloadId, {
      ...downloadData,
      element: container,
      status: 'preparing'
    });
  }

  updateDownloadProgress(data) {
    const download = this.downloads.get(data.downloadId);
    if (!download) return;

    const progressFill = download.element.querySelector('.progress-fill');
    const progressText = download.element.querySelector('.progress-text');
    const downloadSpeed = download.element.querySelector('.download-speed');
    const downloadEta = download.element.querySelector('.download-eta');
    const downloadStatus = download.element.querySelector('.download-status');

    progressFill.style.width = `${data.progress}%`;
    progressText.textContent = `${data.progress}%`;
    
    if (data.speed) {
      downloadSpeed.textContent = this.formatSpeed(data.speed);
    }
    
    if (data.eta) {
      downloadEta.textContent = this.formatTime(data.eta);
    }
    
    downloadStatus.textContent = data.status || '下载中...';
  }

  handleDownloadComplete(data) {
    const download = this.downloads.get(data.downloadId);
    if (!download) return;

    const downloadStatus = download.element.querySelector('.download-status');
    downloadStatus.textContent = data.success ? '下载完成' : '下载失败';
    
    if (data.success) {
      const progressFill = download.element.querySelector('.progress-fill');
      const progressText = download.element.querySelector('.progress-text');
      progressFill.style.width = '100%';
      progressText.textContent = '100%';
    }
  }

  formatSpeed(bytesPerSecond) {
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let speed = bytesPerSecond;
    let unitIndex = 0;
    
    while (speed >= 1024 && unitIndex < units.length - 1) {
      speed /= 1024;
      unitIndex++;
    }
    
    return `${speed.toFixed(1)} ${units[unitIndex]}`;
  }

  formatTime(seconds) {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      return `${Math.round(seconds / 60)}m`;
    } else {
      return `${Math.round(seconds / 3600)}h`;
    }
  }

  pauseDownload(downloadId) {
    // 实现暂停下载逻辑
    console.log('暂停下载:', downloadId);
  }

  cancelDownload(downloadId) {
    // 实现取消下载逻辑
    const download = this.downloads.get(downloadId);
    if (download && download.element) {
      download.element.remove();
      this.downloads.delete(downloadId);
    }
    console.log('取消下载:', downloadId);
  }
}

// 初始化弹出窗口
document.addEventListener('DOMContentLoaded', () => {
  new VideoDownloaderPopup();
});