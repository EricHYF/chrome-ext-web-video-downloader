// 内容脚本 - 在网页中运行
class VideoCapture {
  constructor() {
    this.videos = [];
    this.hlsDownloader = null;
    this.processedUrls = new Set();
    this.init();
  }

  init() {
    // 监听来自background script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    // 延迟检测，等待页面完全加载
    setTimeout(() => {
      this.detectVideos();
      this.setupMessageListener();
      this.setupNetworkInterception();
    }, 2000);

    // 监听DOM变化，检测动态加载的视频
    this.observeDOMChanges();
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'DOWNLOAD_HLS':
        this.downloadHLSStream(message.data);
        break;
      case 'DOWNLOAD_BLOB':
        this.downloadBlobVideo(message.data);
        break;
      case 'SCAN_VIDEOS':
        this.detectVideos();
        sendResponse({success: true});
        break;
    }
  }

  async downloadBlobVideo(data) {
    const {blobUrl, title} = data;
    
    try {
      // 使用blob下载器处理
      if (window.blobDownloader) {
        const result = await window.blobDownloader.downloadBlobVideo(blobUrl, title);
        console.log('Blob下载结果:', result);
      } else {
        console.error('Blob下载器未初始化');
      }
    } catch (error) {
      console.error('Blob下载失败:', error);
    }
  }

  detectVideos() {
    console.log('🔍 开始检测视频...');
    
    // 检测HTML5 video元素
    const videoElements = document.querySelectorAll('video');
    console.log(`📹 找到 ${videoElements.length} 个video元素`);
    
    videoElements.forEach((video, index) => {
      console.log(`📺 处理video元素 ${index + 1}:`, {
        id: video.id,
        className: video.className,
        src: video.src,
        currentSrc: video.currentSrc,
        tagName: video.tagName
      });
      this.processVideoElement(video);
    });

    // 检测嵌入的视频播放器
    this.detectEmbeddedPlayers();

    // 检测通过JavaScript动态加载的视频
    this.detectDynamicVideos();
    
    console.log('✅ 视频检测完成');
  }

  processVideoElement(video) {
    const src = video.src || video.currentSrc;
    const isBlob = src && src.startsWith('blob:');
    const isVideoJS = video.classList.contains('vjs-tech') ||
                     video.closest('.video-js') !== null;

    const videoInfo = {
      type: isBlob ? 'blob_video' : 'html5_video',
      element: video,
      src: src,
      poster: video.poster,
      duration: video.duration,
      title: this.extractVideoTitle(video),
      isBlob: isBlob,
      isVideoJS: isVideoJS,
      className: video.className,
      videoId: video.id
    };

    if (videoInfo.src && videoInfo.src !== '') {
      this.reportVideo(videoInfo);
      
      // 对于blob URL，尝试获取更多信息
      if (isBlob) {
        this.processBlobVideo(video, videoInfo);
      }
    }

    // 检测HLS源
    const sources = video.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src && (source.src.includes('.m3u8') || source.type.includes('application/x-mpegURL'))) {
        this.reportVideo({
          ...videoInfo,
          src: source.src,
          type: 'hls',
          isStream: true
        });
      }
    });
  }

  processBlobVideo(video, videoInfo) {
    // 尝试从Video.js播放器获取原始源
    if (video.closest('.video-js')) {
      const playerContainer = video.closest('.video-js');
      const playerId = playerContainer.id;
      
      // 检查是否有Video.js实例
      if (window.videojs && playerId) {
        try {
          const player = window.videojs.getPlayer(playerId);
          if (player) {
            const tech = player.tech();
            const source = player.currentSource();
            
            if (source && source.src && source.src !== video.src) {
              // 找到原始源URL
              this.reportVideo({
                ...videoInfo,
                src: source.src,
                type: 'videojs_source',
                originalBlobSrc: video.src,
                playerSource: source
              });
            }
          }
        } catch (e) {
          console.log('无法获取Video.js源信息:', e);
        }
      }
    }

    // 尝试从网络请求中找到相关的源
    this.trackBlobSource(video.src, videoInfo);
  }

  trackBlobSource(blobUrl, videoInfo) {
    // 存储blob URL和相关信息，用于与网络请求关联
    if (!window.blobVideoTracking) {
      window.blobVideoTracking = new Map();
    }
    
    window.blobVideoTracking.set(blobUrl, {
      ...videoInfo,
      timestamp: Date.now()
    });
  }

  detectEmbeddedPlayers() {
    // 检测常见的视频播放器容器
    const playerSelectors = [
      '.video-player',
      '.player-container', 
      '.video-container',
      '[class*="video"]',
      '[class*="player"]',
      'iframe[src*="video"]',
      'iframe[src*="player"]'
    ];

    playerSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        this.analyzePlayerElement(element);
      });
    });
  }

  analyzePlayerElement(element) {
    // 检查元素的属性和数据
    const attributes = ['data-src', 'data-video-url', 'data-stream-url', 'src'];
    
    attributes.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value && this.isVideoUrl(value)) {
        this.reportVideo({
          type: 'embedded',
          src: value,
          element: element,
          title: this.extractVideoTitle(element)
        });
      }
    });
  }

  detectDynamicVideos() {
    // 不再使用脚本注入，改用直接监控方式避免CSP问题
    this.monitorBlobCreation();
    this.scanForVideoElements();
  }

  setupNetworkInterception() {
    // 设置网络请求监控（不使用脚本注入）
    this.monitorVideoRequests();
  }

  monitorBlobCreation() {
    // 定期检查是否有新的blob视频出现
    setInterval(() => {
      this.scanForBlobVideos();
    }, 3000);
  }

  scanForBlobVideos() {
    const videos = document.querySelectorAll('video[src^="blob:"]');
    console.log(`🔍 扫描blob视频，找到 ${videos.length} 个`);
    
    videos.forEach((video, index) => {
      console.log(`📺 Blob视频 ${index + 1}:`, {
        src: video.src,
        processed: video.dataset.processed,
        id: video.id,
        className: video.className
      });
      
      if (!video.dataset.processed) {
        video.dataset.processed = 'true';
        this.processVideoElement(video);
      }
    });
    
    // 也扫描所有video元素，不只是blob的
    const allVideos = document.querySelectorAll('video');
    console.log(`📊 所有视频元素统计: ${allVideos.length} 个`);
    allVideos.forEach((video, index) => {
      console.log(`Video ${index + 1}:`, {
        src: video.src || '无src',
        currentSrc: video.currentSrc || '无currentSrc',
        id: video.id || '无id',
        classes: video.className || '无class'
      });
    });
  }

  monitorVideoRequests() {
    // 使用performance API监控网络请求
    if (window.performance && window.performance.getEntriesByType) {
      setInterval(() => {
        const entries = performance.getEntriesByType('navigation')
          .concat(performance.getEntriesByType('resource'));
        
        entries.forEach(entry => {
          if (this.isVideoUrl(entry.name) && !this.processedUrls.has(entry.name)) {
            this.processedUrls.add(entry.name);
            this.reportVideo({
              type: 'network_resource',
              src: entry.name,
              title: document.title,
              transferSize: entry.transferSize,
              duration: entry.duration
            });
          }
        });
      }, 5000);
    }
  }

  setupMessageListener() {
    // 设置消息监听，但不依赖注入脚本
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'BLOB_VIDEO_DETECTED') {
        // 处理blob视频检测（如果有其他方式发送消息）
        const blobData = event.data.data;
        this.reportVideo({
          type: 'blob_video',
          src: blobData.url,
          title: blobData.title,
          isBlob: true,
          size: blobData.size,
          duration: blobData.duration,
          width: blobData.width,
          height: blobData.height,
          hasBlob: blobData.hasBlob,
          hasThumbnail: blobData.hasThumbnail,
          cachedInfo: blobData.cachedInfo
        });
      }
    });
  }

  scanForVideoElements() {
    // 扫描Video.js播放器和其他视频元素
    const videoSelectors = [
      'video',
      '.vjs-tech',
      '.video-js video',
      '.video-js',
      '[data-video-url]',
      '[data-src*="video"]',
      '[class*="vjs"]',
      '[class*="video"]'
    ];

    console.log('🔍 扫描视频元素...');
    
    videoSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        console.log(`选择器 "${selector}" 找到 ${elements.length} 个元素`);
        
        elements.forEach((element, index) => {
          console.log(`元素 ${index + 1}:`, {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            src: element.src,
            dataset: Object.keys(element.dataset)
          });
          
          if (element.tagName === 'VIDEO') {
            this.processVideoElement(element);
          } else {
            this.analyzePlayerElement(element);
          }
        });
      } catch (error) {
        console.log('查询选择器失败:', selector, error);
      }
    });
  }

  observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检测新添加的video元素
            if (node.tagName === 'VIDEO') {
              this.processVideoElement(node);
            }
            
            // 检测包含video的容器
            const videos = node.querySelectorAll && node.querySelectorAll('video');
            if (videos) {
              videos.forEach(video => this.processVideoElement(video));
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  extractVideoTitle(element) {
    // 尝试从多个来源提取视频标题
    const titleSources = [
      element.getAttribute('title'),
      element.getAttribute('data-title'),
      element.getAttribute('alt'),
      element.closest('[title]')?.getAttribute('title'),
      document.querySelector('h1')?.textContent,
      document.title
    ];

    for (const title of titleSources) {
      if (title && title.trim()) {
        return title.trim();
      }
    }

    return '未知视频';
  }

  isVideoUrl(url) {
    const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm3u8'];
    const videoKeywords = ['video', 'stream', 'media', 'player'];
    
    return videoExtensions.some(ext => url.includes(`.${ext}`)) ||
           videoKeywords.some(keyword => url.includes(keyword));
  }

  reportVideo(videoInfo) {
    // 发送视频信息到background script
    chrome.runtime.sendMessage({
      type: 'VIDEO_DETECTED',
      data: {
        url: videoInfo.src,
        type: videoInfo.type,
        title: videoInfo.title,
        isStream: videoInfo.isStream || false,
        isBlob: videoInfo.isBlob || false,
        isVideoJS: videoInfo.isVideoJS || false,
        videoId: videoInfo.videoId,
        className: videoInfo.className,
        originalBlobSrc: videoInfo.originalBlobSrc,
        playerSource: videoInfo.playerSource,
        metadata: videoInfo.metadata,
        timestamp: Date.now()
      }
    });
  }

  async downloadHLSStream(data) {
    const {m3u8Url, title} = data;
    
    try {
      // 获取m3u8文件内容
      const response = await fetch(m3u8Url);
      const m3u8Content = await response.text();
      
      // 解析m3u8文件获取视频片段列表
      const segments = this.parseM3U8(m3u8Content, m3u8Url);
      
      if (segments.length > 0) {
        // 下载所有片段
        await this.downloadAndMergeSegments(segments, title);
      }
    } catch (error) {
      console.error('HLS下载失败:', error);
    }
  }

  parseM3U8(content, baseUrl) {
    const lines = content.split('\n');
    const segments = [];
    const baseUri = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#')) {
        // 这是一个片段URL
        const segmentUrl = line.startsWith('http') ? line : baseUri + line;
        segments.push(segmentUrl);
      }
    }

    return segments;
  }

  async downloadAndMergeSegments(segments, title) {
    // 这里实现片段下载和合并逻辑
    // 由于浏览器环境限制，我们提供下载链接让用户使用外部工具
    const downloadInfo = {
      title: title,
      segments: segments,
      totalSegments: segments.length
    };

    // 通知用户下载信息
    chrome.runtime.sendMessage({
      type: 'HLS_DOWNLOAD_INFO',
      data: downloadInfo
    });
  }
}

// 初始化视频捕获
const videoCapture = new VideoCapture();