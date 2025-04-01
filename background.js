chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 添加错误处理和改进的权限检查
  try {
    chrome.tabs.query({ active: true }, tabs => {
      // 添加空值检查和错误处理
      if (chrome.runtime.lastError) {
        // console.error('Tabs query error:', chrome.runtime.lastError)
        return
      }
      if (!tabs || tabs.length === 0) {
        // console.error('未找到活动标签页')
        return
      }
      // console.log('message', message, tabs)
      if (tabs[0]?.id) {
        // 使用chrome.scripting.executeScript注入content.js
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0]?.id }, // 使用活动标签页的ID
            files: ['content.js']
          },
          () => {
            // console.log('chrome.runtime.lastError', chrome.runtime.lastError)
            if (chrome.runtime.lastError) {
              console.error('注入失败：', chrome.runtime.lastError.message)
            } else {
              console.log('Content Script 注入成功')
              chrome.tabs.sendMessage(tabs[0].id, message, response => {
                // 添加回调处理
                if (chrome.runtime.lastError) {
                  console.error('消息发送失败:', chrome.runtime.lastError)
                }
              })
            }
          }
        )
      }
    })

    if (message.action === 'SCHEDULE_START') {
      const delay = new Date(message.scheduledTime).getTime() - Date.now()
      if (delay > 0) {
        chrome.alarms.create('scheduledTask', {
          when: Date.now() + delay
        })
      }
    }
  } catch (error) {
    // console.error('Query执行异常:', error)
  }
  return true
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'scheduledTask') {
    chrome.tabs.query({ active: true }, tabs => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'START_TIMED_TASK' })
      }
    })
  }
})
