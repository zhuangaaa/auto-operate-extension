if (!window.AutoOperator) {
  const EXPIRATION_DATE = new Date('2025-05-02').getTime() // 设置过期时间
  window.AutoOperator = class AutoOperator {
    constructor() {
      this.isRunning = false // 运行状态
      this.currentPage = 1 // 当前页面
      this.retryCount = 0 // 重试计数
      this.maxRetry = 0 // 最大重试次数，设置为0不重试，只执行一次
      this.operationWaitingTime = 500 // 挑入或则收藏操作等待时间(ms)
      this.dataLoadingWaitingTime = 600 // 翻页数据加载等待时间(ms)
      this.excludedArea = ['佛山'] // 排除的区域
      this.scheduledTimer = null // 新增定时器标识
      this.currentWaitPromise = null // 新增异步操作标识
      this.pageId = Math.random().toString(36).substr(2, 9); // 生成随机页面ID
    }

    async start (industries, maxRetry) {
      this.updateStatus('正在运行')
      // 每次启动时检查
      if (Date.now() > EXPIRATION_DATE) {
        this.log('插件已过期')
        return this.stop()
      }
      this.isRunning = true
      this.industries = industries
      this.maxRetry = maxRetry
      this.retryCount = 0
      await this.processPage()
    }

    stop () {
      // 过期验证
      if (Date.now() > EXPIRATION_DATE) {
        this.log('插件已过期')
        return this.stop()
      }

      // 新增定时器清除
      if (this.scheduledTimer) {
        clearTimeout(this.scheduledTimer)
        this.scheduledTimer = null
      }
      this.retryCount = this.maxRetry; // 强制达到最大重试次数
      this.isRunning = false
      // 新增异步操作中断
      if (this.currentWaitPromise) {
        clearTimeout(this.currentWaitPromise);
      }
      this.updateStatus('已停止')
    }

    async processPage () {
      try {
        // 每次处理新页面前隐式检查（通过 isRunning 状态）
        if (!this.isRunning) return
        // 获取符合条件的行
        const rows = this.getQualifiedRows()
        console.log('rows', rows);
        for (const row of rows) {
          if (!this.isRunning) {
            this.log('操作已中止');
            return; // 提前退出
          }
          await this.processRow(row);
          if (!this.isRunning) break; // 每次循环后检查
        }
        if (this.isRunning && (await this.hasNextPage())) {
          // 如果还有下一页且下一页的按钮不是被禁用且仍在运行
          this.currentPage++
          document.querySelector('.ant-pagination-next').click() // 点击下一页按钮
          await this.waitFor(this.dataLoadingWaitingTime + 1000) // 等待翻页数据加载完成
          await this.processPage() // 继续处理下一页
        } else {
          await this.retryOrStop() // 重试或则停止
        }
      } catch (error) {
        this.log(`错误：${error.message}`)
        await this.retryOrStop() // 重试或则停止
      }
    }

    async processRow (row) {
      await this.waitFor(this.operationWaitingTime) // 等待600ms之后才执行下一次的挑入或则收藏操作，预防挑入或则收藏太快被查
      // 获取行索引（假设行元素有 data-row-index 属性）
      const rowIndex = row.getAttribute('row-index')
      // 通过行索引定位操作按钮
      const pickinBtn = document.querySelector(
        `.ag-pinned-right-cols-container .ag-row[row-index="${rowIndex}"]  .crm-grid-cell-render-action a[data-logmeta*="actionName=pickin"]`
      )
      const favoriteBtn = document.querySelector(
        `.ag-pinned-right-cols-container .ag-row[row-index="${rowIndex}"] .crm-grid-cell-render-action a[data-logmeta*="actionName=favorite"]`
      )

      // 如果挑入按钮存在且没有被禁用，则执行操作
      if (pickinBtn && !pickinBtn.classList.contains('text-disabled')) {
        await this.handleOperation(pickinBtn, '挑入')
      }

      // 如果收藏按钮存在且没有被禁用，则执行操作
      if (
        favoriteBtn &&
        favoriteBtn?.style &&
        favoriteBtn?.style?.cursor !== 'not-allowed'
      ) {
        await this.handleOperation(favoriteBtn, '收藏')
      }
    }

    // 处理挑入或则收藏操作
    async handleOperation (button, type) {
      button.click()
      const modal = await this.waitForElement('.ant-modal', type, 600); // 缩短超时时间
      if (!modal) return;
      const confirmBtn = await modal[0].querySelector('.ant-btn-primary')
      if (confirmBtn) {
        confirmBtn.click()
        // 添加网络请求监听
        const requestPromise = new Promise((resolve, reject) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries().filter(entry =>
              entry.initiatorType === 'xmlhttprequest' &&
              entry.name.includes('/rpc/work/getDiorData') // 根据实际接口路径修改
            );
            if (entries.length > 0) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe({ entryTypes: ['resource'] });
        });
        requestPromise.finally(() => {
          this.handleResult(type)
        })
      }
    }

    // 处理操作结果
    async handleResult (type) {
      const errorModal = document.querySelector('.ant-modal-confirm-warning');
      if (errorModal) {
        errorModal.querySelector('.ant-btn').click();
           // 新增弹窗关闭等待
           const startTime = Date.now();
           while (Date.now() - startTime < 2000) { // 最多等待2秒
             if (!document.querySelector('.ant-modal-confirm-warning')) {
               break; // 弹窗已消失
             }
             await this.waitFor(100); // 每100ms检查一次
           }
        this.log(`${type}失败：资源已被占用`)
        return;
      }

      const successMsg = document.querySelector('.ant-message-success')
      if (successMsg) {
        this.log(`${type}成功`)
        return
      }
    }

    getQualifiedRows () {
      const rows = document.querySelectorAll('.ag-row:has([col-id="companynameprecise"])')
      const excludePattern = new RegExp(this.excludedArea.join('|')) // 使用数组生成正则
      const industryPattern = new RegExp(this.industries.join('|'))
      const agRow = []
      for (const row of rows) {
        const companyCell = row.querySelector('[col-id="companynameprecise"]')
        const companyName = companyCell?.textContent?.trim() || ''

        if (industryPattern.test(companyName) && !excludePattern.test(companyName)) {
          agRow.push(row)
        }
      }
      return agRow
    }

    // 检查是否还有下一页
    async hasNextPage () {
      return !!document.querySelector(
        '.ant-pagination-next:not(.ant-pagination-disabled)'
      )
    }

    async waitFor (ms) {
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        this.currentWaitPromise = timer; // 记录当前定时器
      });
    }

    // 新增等待元素方法
    async waitForElement (selector, type, timeout = 5000) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        let textToFind = type === '挑入' ? '确认挑入该客户？' : '是否确认收藏？'
        // 获取所有匹配元素
        const elements = document.querySelectorAll(selector)
        // 新增弹框过滤逻辑
        const visibleModals = Array.from(elements).filter(modal => {
          return modal.innerText.includes(textToFind)
        })
        if (visibleModals) return visibleModals
        await this.waitFor(100)
      }
      throw new Error('元素加载超时')
    }

    // 新增定时方法
    scheduleStart (industries, maxRetry, timestamp) {
      if (this.scheduledTimer) {
        clearTimeout(this.scheduledTimer)
      }

      const delay = timestamp - Date.now()
      if (delay > 0) {
        this.scheduledTimer = setTimeout(() => {
          this.start(industries, maxRetry)
          this.scheduledTimer = null
        }, delay)
        this.log(`定时任务已设置，将在 ${Math.round(delay / 1000)} 秒后执行`)
      } else {
        this.log('设置时间已过，立即执行')
        this.start(industries, maxRetry)
      }
    }

    // 重试或则停止
    async retryOrStop () {
      if (!this.isRunning) return // 添加运行状态检查
      if (this.retryCount < this.maxRetry) {
        this.retryCount++
        this.currentPage = 1
        // 模拟翻页事件回到第一页且刷新列表数据
        if (document.querySelector('.ant-pagination-item-1:not(.ant-pagination-item-active)')) { // 如果有数据且当前页不是第一页，模拟点击第一页
          document.querySelector('.ant-pagination-item-1').click()
          document
            .querySelector(
              '.ag-header-cell[col-id="maturity"] .ag-header-cell-label'
            )
            .click()
          this.updateStatus('第' + this.retryCount + '次重试')
          await this.waitFor(this.dataLoadingWaitingTime + 1000) // 这个是翻页有数据的情况，可以加点额外的时间去加载数据
        } else {
          // 如果没有数据，模拟点击成熟度获取最新数据
          document
            .querySelector(
              '.ag-header-cell[col-id="maturity"] .ag-header-cell-label'
            )
            .click()
          this.updateStatus('第' + this.retryCount + '次重试')
          await this.waitFor(this.dataLoadingWaitingTime) // 这个是翻页没有数据的情况，场景是挑资源或则盯资源的情况
        }

        // 添加运行状态检查
        if (!this.isRunning) return

        await this.processPage()
      } else {
        this.stop()
      }
    }

    log (text) {
      const logEntry = {
        pageId: this.pageId,
        timestamp: new Date().toISOString(),
        text: text,
        type: 'info'
      }

      chrome.storage.local.get({ logs: [] }, data => {
        const updatedLogs = [logEntry, ...data.logs].slice(0, 200) // 保留最近200条
        chrome.storage.local.set({ logs: updatedLogs })
      })
      try {
        chrome.runtime.sendMessage({ type: 'LOG', text: logEntry.text }, () => {
          // 添加错误回调处理
          if (chrome.runtime.lastError) {
            console.warn('消息发送失败:', chrome.runtime.lastError)
          }
        })
      } catch (e) {
        console.error('日志发送异常:', e)
      }
    }

    // 新增错误日志方法
    logError (text) {
      const logEntry = {
        pageId: this.pageId,
        timestamp: new Date().toISOString(),
        text: text,
        type: 'error'
      }

      chrome.storage.local.get({ logs: [] }, data => {
        const updatedLogs = [logEntry, ...data.logs].slice(0, 200)
        chrome.storage.local.set({ logs: updatedLogs })
      })
      try {
        chrome.runtime.sendMessage({ type: 'LOG', text: logEntry.text }, () => {
          // 添加错误回调处理
          if (chrome.runtime.lastError) {
            console.warn('消息发送失败:', chrome.runtime.lastError)
          }
        })
      } catch (e) {
        console.error('日志发送异常:', e)
      }
    }

    // 新增更新状态方法
    updateStatus (text) {
      chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', text })
    }
  }
}

// 在文件顶部添加注册标记
if (!window.__message_listener_registered__) {
  window.__message_listener_registered__ = true

  // 后台通信
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message', message)
    // 新增定时启动处理
    if (message.action === 'SCHEDULE_START') {
      if (!window.operator) window.operator = new AutoOperator()
      // 转换时间戳（假设收到的是ISO格式时间字符串）
      const timestamp = new Date(message.scheduledTime).getTime()
      window.operator.scheduleStart(
        message.industries,
        message.maxRetry,
        timestamp
      )
      sendResponse({ status: 'scheduled' })
    }

    if (message.action === 'START') {
      if (!window.operator) window.operator = new AutoOperator()
      window.operator.start(message.industries, message.maxRetry)
      sendResponse({ status: 'success' }) // 必须调用 sendResponse 来响应发送方的消息
    }

    if (message.action === 'STOP' && window.operator) {
      window.operator.stop()
      sendResponse({ status: 'success' }) // 必须调用 sendResponse 来响应发送方的消息
    }
    return true // 保持消息端口打开，等待异步响应
  })
}
