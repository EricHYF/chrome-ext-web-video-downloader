# Blob视频下载指南

## 什么是Blob视频？

Blob（Binary Large Object）视频是通过JavaScript动态创建的视频对象，常见于现代视频播放器中。这种技术通常用于：

- 视频流的缓冲和播放
- 防止直接下载的版权保护
- 动态视频内容加载
- 在线教育平台的课程视频

## 目标网站分析

基于您提供的HTML代码：

```html
<video id="example_media_1_html5_api" 
       class="vjs-tech mtz-vlc-lfdconleibeikjpklmlahaihpnkpmlch" 
       src="blob:http://service-cdn.qiqiuyun.net/4f577369-a48d-4d5f-9f56-05c6519f3187">
```

**关键信息：**
- 🎯 **播放器类型**: Video.js (class="vjs-tech")
- 🔗 **视频源格式**: blob URL
- 🌐 **CDN服务**: qiqiuyun.net (气球云)
- 🛡️ **保护机制**: 禁用下载、全屏等控制

## 扩展检测策略

我们的扩展采用多层检测策略：

### 1. 直接检测
- 监控`<video>`元素的`src`属性
- 识别以`blob:`开头的URL
- 检测Video.js特有的CSS类名

### 2. 拦截创建
- Hook `URL.createObjectURL()` 函数
- 拦截 `MediaSource` 对象创建
- 缓存blob对象以便后续下载

### 3. 事件监听
- 监听视频加载事件（`loadstart`, `canplay`）
- 捕获Video.js播放器初始化
- 追踪blob URL与视频元素的关联

## 下载方法

### 方法1: 直接blob下载
```javascript
// 扩展尝试直接fetch blob URL
const response = await fetch(blobUrl);
const blob = await response.blob();
```

### 方法2: 缓存获取
```javascript
// 从拦截的blob创建过程中获取数据
const cachedBlob = blobCache.get(blobUrl);
if (cachedBlob) {
  // 下载缓存的blob对象
}
```

### 方法3: 播放器源追踪
```javascript
// 尝试从Video.js播放器获取原始源
const player = videojs.getPlayer(playerId);
const source = player.currentSource();
```

## 使用步骤

### 1. 安装和启用扩展
- 按照INSTALL.md安装扩展
- 确保扩展在目标网站上启用

### 2. 访问视频页面
- 打开包含视频的教育网站
- 等待视频开始播放或加载

### 3. 检查检测结果
- 点击扩展图标
- 查看检测到的视频列表
- 确认显示"BLOB"类型的视频

### 4. 尝试下载
- 点击blob视频的下载按钮
- 扩展会尝试多种下载方法
- 查看下载是否成功

## 常见问题

### Q: 为什么检测不到blob视频？
**A: 可能的原因：**
- 网站使用了特殊的加载机制
- blob URL在页面加载后才创建
- 需要手动播放视频触发检测

**解决方法：**
- 先播放视频几秒钟
- 点击扩展的刷新按钮
- 尝试暂停和重新播放

### Q: blob视频下载失败怎么办？
**A: 尝试以下方法：**
1. 确保视频正在播放
2. 检查浏览器控制台是否有错误
3. 尝试在视频播放过程中下载
4. 某些blob可能需要特殊权限

### Q: 下载的文件无法播放？
**A: 可能的问题：**
- blob数据不完整
- 文件格式需要特定解码器
- 建议使用VLC等万能播放器

## 技术限制

### 安全限制
- 浏览器的同源策略限制
- 某些blob URL可能有时效性
- CDN可能有访问控制

### 技术限制
- blob数据可能是分片的
- 某些视频使用了加密
- 动态生成的URL可能无法重复访问

### 法律限制
- 请遵守网站使用条款
- 仅下载您有权限的内容
- 不用于商业用途

## 最佳实践

### 下载时机
- ✅ 在视频播放过程中下载
- ✅ 等待视频完全加载后
- ❌ 不要在视频加载前尝试

### 文件管理
- 及时重命名下载的文件
- 按课程或章节组织文件
- 定期清理下载文件夹

### 性能优化
- 不要同时下载多个blob视频
- 关闭不必要的浏览器标签页
- 确保有足够的存储空间

## 调试信息

如果遇到问题，请检查：

1. **浏览器控制台**
```javascript
// 查看扩展日志
console.log('检测到blob视频:', blobUrl);
console.log('缓存的blob对象:', blobCache);
```

2. **扩展调试**
- 在chrome://extensions/开启开发者模式
- 查看扩展的错误日志
- 检查权限设置

3. **网络面板**
- 查看是否有视频相关的网络请求
- 检查blob URL的创建过程
- 监控MediaSource的使用

## 成功案例

**支持的网站类型：**
- 🎓 现代卓越 (chinapm.org)
- 🎈 气球云平台 (qiqiuyun.net)
- 🎬 其他使用Video.js的网站

**成功下载的视频类型：**
- MP4格式的blob视频
- WebM格式的流媒体
- 分段式视频内容

---

**注意**: Blob视频下载是一个复杂的技术过程，成功率取决于网站的具体实现。我们的扩展会尽力尝试各种方法，但无法保证100%成功。