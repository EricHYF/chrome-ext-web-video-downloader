# 视频检测调试指南

## 🔍 收集调试信息

为了帮助您成功下载视频，请按以下步骤收集信息：

### 第一步：检查扩展状态

1. **确认扩展已加载**
   - 访问 `chrome://extensions/`
   - 确认"网页视频下载器"状态为"已启用"
   - 如果有错误，点击"错误"查看详情

2. **重新加载扩展**
   - 点击扩展的"刷新"按钮
   - 重新访问视频页面

### 第二步：检查控制台日志

1. **打开开发者工具**
   - 在视频页面按 `F12` 或右键→检查
   - 切换到 `Console` 标签页
   - 清空控制台（点击清空按钮）

2. **重新扫描视频**
   - 点击扩展图标
   - 点击"刷新"按钮重新扫描
   - 观察控制台输出

### 第三步：提供关键信息

请截图或复制以下信息：

#### A. 控制台日志
查找以下类型的日志：
```
🔍 开始检测视频...
📹 找到 X 个video元素
📺 处理video元素 1: {...}
✅ 视频检测完成
```

#### B. 页面HTML结构
在控制台运行以下命令并提供结果：

```javascript
// 1. 检查所有video元素
console.log('=== 所有Video元素 ===');
document.querySelectorAll('video').forEach((v, i) => {
  console.log(`Video ${i+1}:`, {
    id: v.id,
    className: v.className,
    src: v.src,
    currentSrc: v.currentSrc,
    tagName: v.tagName,
    parentElement: v.parentElement.className
  });
});

// 2. 检查Video.js相关元素
console.log('=== Video.js元素 ===');
document.querySelectorAll('.video-js, .vjs-tech, [class*="vjs"]').forEach((v, i) => {
  console.log(`VJS ${i+1}:`, {
    tagName: v.tagName,
    className: v.className,
    id: v.id,
    src: v.src
  });
});

// 3. 检查网络请求
console.log('=== 网络资源 ===');
performance.getEntriesByType('resource').forEach(entry => {
  if (entry.name.includes('video') || entry.name.includes('blob') || entry.name.includes('.mp4') || entry.name.includes('.m3u8')) {
    console.log('Video资源:', entry.name);
  }
});

// 4. 检查页面标题和URL
console.log('页面信息:', {
  title: document.title,
  url: location.href,
  domain: location.hostname
});
```

#### C. 网络面板检查
1. 在开发者工具切换到 `Network` 标签
2. 刷新页面或重新播放视频
3. 查找包含以下内容的请求：
   - `blob:`
   - `.mp4`
   - `.m3u8`
   - `video`
   - `stream`
   - `media`

### 第四步：特定于您网站的检查

基于您之前提供的HTML代码，请特别检查：

```javascript
// 检查特定的video元素
const specificVideo = document.getElementById('example_media_1_html5_api');
if (specificVideo) {
  console.log('=== 目标Video元素 ===', {
    id: specificVideo.id,
    className: specificVideo.className,
    src: specificVideo.src,
    currentSrc: specificVideo.currentSrc,
    readyState: specificVideo.readyState,
    duration: specificVideo.duration,
    paused: specificVideo.paused,
    parentNode: specificVideo.parentNode.className
  });
} else {
  console.log('❌ 未找到目标video元素');
}

// 检查是否有Video.js实例
if (window.videojs) {
  console.log('✅ 检测到Video.js库');
  try {
    const players = videojs.getPlayers();
    console.log('Video.js播放器:', Object.keys(players));
  } catch (e) {
    console.log('获取播放器信息失败:', e);
  }
} else {
  console.log('❌ 未检测到Video.js库');
}
```

## 🚨 常见问题排查

### 问题1: 扩展图标显示"未检测到视频"

**可能原因：**
- 视频还未开始播放
- blob URL还未生成
- CSP策略阻止了检测

**解决方法：**
1. 先播放视频几秒钟
2. 等待视频完全加载
3. 再点击扩展图标扫描

### 问题2: 控制台显示权限错误

**可能原因：**
- 扩展权限不足
- 网站阻止了扩展运行

**解决方法：**
1. 检查扩展权限设置
2. 确认网站域名在允许列表中

### 问题3: 找到video元素但无src

**可能原因：**
- 视频使用MediaSource API
- src是动态设置的
- 使用了其他加载方式

**解决方法：**
- 提供完整的HTML结构
- 检查网络请求
- 查看是否有JavaScript错误

## 📋 信息收集清单

请提供以下信息：

- [ ] 扩展是否正确加载（无错误）
- [ ] 控制台的完整日志输出
- [ ] 上述JavaScript命令的执行结果
- [ ] 网络面板中的视频相关请求
- [ ] 视频播放的具体步骤
- [ ] 网站的完整URL（如可分享）
- [ ] 任何JavaScript错误信息

## 💡 临时解决方案

如果自动检测失败，您可以尝试：

1. **手动获取blob URL**
   ```javascript
   // 在控制台运行，获取当前视频的URL
   const video = document.querySelector('video');
   console.log('视频URL:', video.src);
   ```

2. **使用浏览器下载**
   - 右键点击视频→"将视频另存为"
   - 或在地址栏输入blob URL尝试直接访问

有了这些信息，我就能针对性地修复检测问题！