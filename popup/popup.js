document.addEventListener('DOMContentLoaded', () => {
  const expirationDate = new Date('2025-04-02')

  const premiumCategories = [
    '药业',
    '玻璃制品',
    '家居用品',
    '包装材料',
    '包装',
    '箱包',
    '保健品',
    '健康产业',
    '工艺品',
    '玩具',
    '宠物用品',
    '电子材料',
    '电子科技',
    '电子设备',
    '电子有限公司',
    '婚纱礼服',
    '塑料制品',
    '塑业',
    '印刷',
    '餐饮设备',
    '厨具'
  ] // 默认行业列表
  if (Date.now() > expirationDate) {
    document.getElementById('startBtn').disabled = true
    document.getElementById('startBtn').style.cursor = 'not-allowed'
    document.getElementById('saveBtn').style.cursor = 'not-allowed'
    document.getElementById('saveBtn').style.color = '#ccc'
    document.getElementById('stopBtn').disabled = true
    document.getElementById('stopBtn').style.cursor = 'not-allowed'
    document.getElementById('scheduleBtn').disabled = true
    document.getElementById('scheduleBtn').style.cursor = 'not-allowed'
    document.getElementById('licenseStatus').style.display = 'block'
  }

  // 加载历史日志
  chrome.storage.local.get({ logs: [] }, data => {
    const logList = document.getElementById('logList');
    logList.innerHTML = data.logs.map(log => `
        <div class="log-item ${log.type}">
          <span class="timestamp">${new Date(log.timestamp).toLocaleString()}</span>
          <span class="message">${log.text}</span>
        </div>
      `).join('');
  });

  // 清空日志按钮
  document.getElementById('clearLogs').addEventListener('click', () => {
    chrome.storage.local.set({ logs: [] });
    document.getElementById('logList').innerHTML = '';
  });

  // 页面加载完成后
  const saveBtn = document.getElementById('saveBtn') // 保存按钮
  const startBtn = document.getElementById('startBtn') // 开始按钮
  const stopBtn = document.getElementById('stopBtn') // 停止按钮
  const industries = document.getElementById('industries') // 行业输入框
  const maxRetry = document.getElementById('maxRetry') // 最大重试计数

  // 加载保存的配置
  chrome.storage.sync.get(['industries', 'maxRetry'], data => {
    // 设置行业列表（优先使用存储数据）
    industries.value = data.industries?.join('\n') || premiumCategories.join('\n');
    maxRetry.value = data.maxRetry || 1;
    
    // 只在首次运行时初始化默认值
    if (!data.industries) {
      chrome.storage.sync.set({ 
        industries: premiumCategories,
        maxRetry: 1
      });
    }
  });

  // 保存行业配置
  saveBtn.addEventListener('click', () => {
    const industryList = industries.value.split('\n').filter(i => i.trim())
    chrome.storage.sync.set({ industries: industryList })
    chrome.storage.sync.set({ maxRetry: maxRetry.value })
  })

  startBtn.addEventListener('click', () => {
    const industryList = industries.value.split('\n').filter(i => i.trim())
    const maxRetry = document.getElementById('maxRetry') // 最大重试计数
    chrome.runtime.sendMessage({
      action: 'START',
      industries: industryList.length != 0 ? industryList : premiumCategories,
      maxRetry: maxRetry.value
    })
  })

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP' })
  })

  document.getElementById('scheduleBtn').addEventListener('click', () => {
    const scheduleTime = document.getElementById('scheduleTime').value
    const industryList = industries.value.split('\n').filter(i => i.trim())
    const maxRetry = document.getElementById('maxRetry').value // 最大重试计数

    if (scheduleTime) {
      chrome.runtime.sendMessage(
        {
          action: 'SCHEDULE_START',
          industries:
            industryList.length != 0 ? industryList : premiumCategories,
          maxRetry: maxRetry,
          scheduledTime: scheduleTime
        },
        response => {
          alert('定时任务已设置: ' + scheduleTime)
        }
      )
    } else {
      chrome.runtime.sendMessage({
        action: 'START',
        industries: industryList.length != 0 ? industryList : premiumCategories,
        maxRetry: maxRetry
      })
    }
  })
})

  // 监听实时日志
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'LOG') {
      const logList = document.getElementById('logList');
      const logEntry = document.createElement('div');
      logEntry.className = 'log-item info';
      logEntry.innerHTML = `
          <span class="timestamp">${new Date().toLocaleString()}</span>
          <span class="message">${message.text}</span>
        `;
      logList.prepend(logEntry);
      return false; // 重要修复：关闭消息通道
    }
    if (message.type === 'STATUS_UPDATE') {
      document.getElementById('status').textContent = `状态：${message.text}`
      return false; // 重要修复：关闭消息通道
    }
  });

