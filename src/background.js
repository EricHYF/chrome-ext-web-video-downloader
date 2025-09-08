// 后台服务脚本
class VideoDetector {
  constructor() {
    this.detectedVideos = new Map();
    this.downloadsPath = null;
    this.init();
  }

  async init() {
    // 初始化下载路径
    await this.initializeDownloadsPath();
    
    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 保持消息通道开放
    });

    // 监听网络请求以检测视频流
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.detectVideoInRequest(details),
      {
        urls: [
          "*://*/*.m3u8*",
          "*://*/*.mp4*", 
          "*://*/*.mkv*",
          "*://*/*.avi*",
          "*://*/*.mov*",
          "*://*/*.wmv*",
          "*://*/*.flv*",
          "*://*/*.webm*",
          "*://*/video/*",
          "*://*/stream/*"
        ]
      },
      ["requestBody"]
    );
  }

  handleMessage(message, sender, sendResponse) {
    console.log('收到消息:', message.type, 'sender:', sender);
    
    // 使用Promise包装异步处理，确保正确的响应处理
    (async () => {
      try {
        switch (message.type) {
          case 'GET_VIDEOS':
            if (message.tabId) {
              // 来自popup的请求，使用指定的tabId
              this.getVideosForTab(message.tabId, sendResponse);
            } else if (sender.tab && sender.tab.id) {
              // 来自content script的请求
              this.getVideosForTab(sender.tab.id, sendResponse);
            } else {
              console.error('无法确定标签页ID');
              sendResponse({videos: [], error: '无法确定标签页ID'});
            }
            break;
          case 'DOWNLOAD_VIDEO':
            await this.downloadVideo(message.data, sendResponse);
            break;
          case 'VIDEO_DETECTED':
            if (sender.tab && sender.tab.id) {
              this.addDetectedVideo(sender.tab.id, message.data);
              sendResponse({success: true});
            } else {
              console.error('无法确定标签页ID用于视频检测');
              sendResponse({success: false, error: '无法确定标签页ID'});
            }
            break;
          case 'GET_PAGE_TITLE':
            if (message.tabId) {
              await this.getPageTitle(message.tabId, sendResponse);
            } else if (sender.tab && sender.tab.id) {
              await this.getPageTitle(sender.tab.id, sendResponse);
            } else {
              sendResponse({title: '未知标题'});
            }
            break;
          case 'BLOB_DOWNLOAD_REQUEST':
            await this.handleBlobDownloadRequest(message.data, sendResponse);
            break;
          case 'GET_DOWNLOADS_PATH':
            await this.getDownloadsPath(sendResponse);
            break;
          case 'OPEN_DOWNLOADS_FOLDER':
            await this.openDownloadsFolder(sendResponse);
            break;
          case 'REINITIALIZE_DOWNLOADS_PATH':
            await this.reinitializeDownloadsPath(sendResponse);
            break;
          default:
            console.warn('未知的消息类型:', message.type);
            sendResponse({success: false, error: '未知的消息类型'});
        }
      } catch (error) {
        console.error('处理消息时发生错误:', error);
        sendResponse({success: false, error: error.message});
      }
    })();

    // 返回true表示会异步响应
    return true;
  }

  async reinitializeDownloadsPath(sendResponse) {
    try {
      await this.initializeDownloadsPath();
      sendResponse({ success: true, message: '下载路径已重新初始化' });
    } catch (error) {
      console.error('重新初始化下载路径失败:', error);
      sendResponse({ success: false, message: '重新初始化下载路径失败: ' + error.message });
    }
  }

  async initializeDownloadsPath() {
    try {
      // 从存储中获取设置的下载路径
      const result = await chrome.storage.sync.get('videoDownloaderSettings');
      const settings = result.videoDownloaderSettings || {};
      
      if (settings.downloadPath) {
        this.downloadsPath = settings.downloadPath;
      } else {
        // 使用默认的Downloads文件夹
        this.downloadsPath = await this.getDefaultDownloadsPath();
        
        // 保存到设置中
        settings.downloadPath = this.downloadsPath;
        await chrome.storage.sync.set({ videoDownloaderSettings: settings });
      }
      
      console.log('初始化下载路径:', this.downloadsPath);
    } catch (error) {
      console.error('初始化下载路径失败:', error);
      this.downloadsPath = 'Downloads'; // 降级到相对路径
    }
  }

  async getDefaultDownloadsPath() {
    // 获取用户的默认下载目录
    // Chrome扩展使用Downloads API自动处理跨平台路径
    try {
      const platform = await this.getPlatform();
      console.log('检测到操作系统:', platform);
      
      // Chrome Downloads API会自动处理不同平台的Downloads文件夹
      // Windows: %USERPROFILE%\Downloads
      // macOS: ~/Downloads
      // Linux: ~/Downloads
      return 'Downloads'; // Chrome会自动映射到正确的系统路径
    } catch (error) {
      console.error('获取默认下载路径失败:', error);
      return 'Downloads';
    }
  }

  async getPlatform() {
    return new Promise((resolve) => {
      chrome.runtime.getPlatformInfo((info) => {
        resolve(info.os);
      });
    });
  }

  async getDownloadsPath(sendResponse) {
    try {
      if (!this.downloadsPath) {
        await this.initializeDownloadsPath();
      }
      sendResponse({ path: this.downloadsPath, success: true });
    } catch (error) {
      console.error('获取下载路径失败:', error);
      sendResponse({ path: 'Downloads', success: false, error: error.message });
    }
  }

  async openDownloadsFolder(sendResponse) {
    let responseSent = false;
    
    const safeResponse = (response) => {
      if (!responseSent) {
        responseSent = true;
        sendResponse(response);
      }
    };
    
    try {
      const platform = await this.getPlatform();
      console.log('尝试在平台上打开下载文件夹:', platform);
      
      // 首先尝试使用Chrome原生API
      try {
        chrome.downloads.showDefaultFolder();
        safeResponse({ success: true, message: '已打开下载文件夹' });
        return;
      } catch (nativeError) {
        console.warn('Chrome原生API失败，尝试降级方案:', nativeError);
      }
      
      // 降级方案：打开Chrome下载页面
      try {
        await chrome.tabs.create({
          url: 'chrome://downloads/',
          active: true
        });
        safeResponse({ success: true, message: '已打开Chrome下载页面' });
      } catch (tabError) {
        console.error('打开下载页面也失败:', tabError);
        safeResponse({
          success: false,
          message: '无法打开下载文件夹，请手动访问 chrome://downloads/'
        });
      }
      
    } catch (error) {
      console.error('打开下载文件夹完全失败:', error);
      safeResponse({
        success: false,
        message: '打开下载文件夹失败，请手动访问 chrome://downloads/'
      });
    }
  }

  detectVideoInRequest(details) {
    const url = details.url;
    const tabId = details.tabId;

    // 检测各种视频格式
    const videoInfo = {
      url: url,
      type: this.getVideoType(url),
      timestamp: Date.now(),
      tabId: tabId
    };

    // 如果检测到HLS流(.m3u8)
    if (url.includes('.m3u8')) {
      videoInfo.type = 'hls';
      videoInfo.isStream = true;
    }

    this.addDetectedVideo(tabId, videoInfo);
  }

  getVideoType(url) {
    const extension = url.split('.').pop().split('?')[0].toLowerCase();
    const typeMap = {
      'm3u8': 'hls',
      'mp4': 'mp4',
      'mkv': 'mkv',
      'avi': 'avi',
      'mov': 'mov',
      'wmv': 'wmv',
      'flv': 'flv',
      'webm': 'webm'
    };
    return typeMap[extension] || 'unknown';
  }

  addDetectedVideo(tabId, videoInfo) {
    if (!this.detectedVideos.has(tabId)) {
      this.detectedVideos.set(tabId, []);
    }
    
    const videos = this.detectedVideos.get(tabId);
    // 避免重复添加相同的视频
    const exists = videos.some(v => v.url === videoInfo.url);
    if (!exists) {
      videos.push(videoInfo);
      console.log('检测到视频:', videoInfo);
    }
  }

  getVideosForTab(tabId, sendResponse) {
    if (!tabId) {
      console.error('getVideosForTab: tabId为空');
      sendResponse({videos: [], error: 'tabId为空'});
      return;
    }
    
    const videos = this.detectedVideos.get(tabId) || [];
    console.log(`获取标签页 ${tabId} 的视频列表:`, videos.length, '个视频');
    sendResponse({videos: videos});
  }

  async getPageTitle(tabId, sendResponse) {
    if (!tabId) {
      console.error('getPageTitle: tabId为空');
      sendResponse({title: '未知标题'});
      return;
    }
    
    try {
      const tab = await chrome.tabs.get(tabId);
      sendResponse({title: tab.title});
    } catch (error) {
      console.error('获取页面标题失败:', error);
      sendResponse({title: '未知标题'});
    }
  }

  async downloadVideo(videoData, sendResponse) {
    try {
      const {url, title, type, isBlob} = videoData;
      
      if (type === 'hls' || url.includes('.m3u8')) {
        // 对于HLS流，需要特殊处理
        await this.downloadHLSStream(url, title);
      } else if (isBlob || url.startsWith('blob:')) {
        // 对于blob URL，需要特殊处理
        await this.downloadBlobVideo(url, title);
      } else {
        // 直接下载普通视频文件
        await this.downloadDirectVideo(url, title);
      }
      
      sendResponse({success: true, message: '开始下载视频'});
    } catch (error) {
      console.error('下载失败:', error);
      sendResponse({success: false, message: '下载失败: ' + error.message});
    }
  }

  async downloadBlobVideo(blobUrl, title) {
    // 对于blob URL，需要通过content script来处理
    const message = {
      type: 'DOWNLOAD_BLOB',
      data: {
        blobUrl: blobUrl,
        title: title
      }
    };

    // 发送消息到当前活动标签页
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    }
  }

  async downloadDirectVideo(url, title) {
    const filename = `${this.sanitizeFilename(title)}.mp4`;
    
    // 确保下载路径已初始化
    if (!this.downloadsPath) {
      await this.initializeDownloadsPath();
    }
    
    // 构建完整的文件路径，使用正斜杠确保跨平台兼容性
    const fullPath = this.downloadsPath === 'Downloads' ? filename : `${this.downloadsPath}/${filename}`;
    
    try {
      await chrome.downloads.download({
        url: url,
        filename: fullPath,
        saveAs: false, // 不弹出保存对话框，直接保存到指定目录
        conflictAction: 'uniquify' // 如果文件已存在，自动重命名
      });
      console.log('文件下载开始:', fullPath);
    } catch (error) {
      console.error('下载失败:', error);
      // 如果指定路径失败，降级到默认路径
      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
    }
  }

  async downloadHLSStream(m3u8Url, title) {
    // 对于HLS流，我们需要下载所有片段并合并
    // 这里创建一个下载任务，实际的合并逻辑在content script中处理
    const message = {
      type: 'DOWNLOAD_HLS',
      data: {
        m3u8Url: m3u8Url,
        title: title
      }
    };

    // 发送消息到当前活动标签页
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message);
    }
  }

  sanitizeFilename(filename) {
    // 移除或替换在不同操作系统中不被允许的字符
    // Windows: < > : " | ? * \
    // macOS/Linux: / 和 null字符
    return filename
      .replace(/[<>:"|?*\\\/\x00-\x1f]/g, '') // 移除非法字符
      .replace(/\s+/g, '_') // 空格替换为下划线
      .replace(/\.+$/g, '') // 移除末尾的点
      .substring(0, 200); // 限制文件名长度，避免路径过长问题
  }

  async handleBlobDownloadRequest(data, sendResponse) {
    try {
      // blob视频的下载通过content script处理
      // 这里主要是记录和协调
      console.log('处理blob下载请求:', data);
      if (sendResponse) {
        sendResponse({success: true, message: 'blob下载请求已处理'});
      }
    } catch (error) {
      console.error('blob下载处理失败:', error);
      if (sendResponse) {
        sendResponse({success: false, message: error.message});
      }
    }
  }
}

// 初始化视频检测器
const videoDetector = new VideoDetector();