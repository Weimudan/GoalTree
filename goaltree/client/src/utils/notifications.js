/**
 * Web Notification 封装工具
 * 用于发送桌面级系统通知，即使浏览器标签页不在前台也能弹出
 */

/** 检测浏览器是否支持 Notification API */
export const isSupported = () => 'Notification' in window

/**
 * 请求通知权限
 * @returns {Promise<'granted'|'denied'|'default'>} 权限状态
 */
export async function requestPermission() {
  if (!isSupported()) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

/**
 * 发送桌面通知
 * @param {string} title 通知标题
 * @param {string} body 通知正文
 * @param {object} [options] 可选配置
 * @param {string} [options.icon] 通知图标 URL
 * @param {string} [options.tag] 通知标签，相同 tag 的通知会互相替换
 * @param {function} [options.onClick] 点击通知的回调
 */
export function notify(title, body, options = {}) {
  if (!isSupported() || Notification.permission !== 'granted') return null

  try {
    const n = new Notification(title, {
      body,
      icon: options.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🎯</text></svg>',
      tag: options.tag || 'goaltree-reminder',
      requireInteraction: options.requireInteraction ?? false,
      silent: false
    })

    if (options.onClick) {
      n.onclick = () => {
        options.onClick()
        n.close()
      }
    }

    // 5 秒后自动关闭
    setTimeout(() => n.close(), 8000)
    return n
  } catch {
    return null
  }
}
