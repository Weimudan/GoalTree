/**
 * 全局错误处理工具
 */
export const errorHandler = {
  /**
   * 处理API错误
   * @param {Error} error - 错误对象
   * @param {string} defaultMessage - 默认错误消息
   * @returns {string} 处理后的错误消息
   */
  handleApiError(error, defaultMessage = '操作失败') {
    let message = defaultMessage;

    if (error.response) {
      // 服务器返回的错误
      const data = error.response.data;
      if (data && data.message) {
        message = data.message;
      } else if (error.response.status === 401) {
        message = '未授权，请登录';
      } else if (error.response.status === 403) {
        message = '权限不足';
      } else if (error.response.status === 404) {
        message = '请求的资源不存在';
      } else if (error.response.status >= 500) {
        message = '服务器内部错误，请稍后重试';
      }
    } else if (error.request) {
      // 请求已发出，但没有收到响应
      message = '网络错误，请检查网络连接';
    } else {
      // 其他错误
      if (error.message) {
        message = error.message;
      }
    }

    // 特殊错误处理
    if (message.includes('Network Error')) {
      message = '网络连接失败，请检查网络设置';
    } else if (message.includes('timeout')) {
      message = '请求超时，请重试';
    }

    return message;
  },

  /**
   * 处理表单验证错误
   * @param {Array} errors - 验证错误数组
   * @returns {string} 处理后的错误消息
   */
  handleValidationErrors(errors) {
    if (!errors || errors.length === 0) {
      return '表单验证失败';
    }

    // 提取第一个错误消息
    const firstError = errors[0];
    if (firstError && firstError.message) {
      return firstError.message;
    }

    return '表单验证失败';
  },

  /**
   * 显示错误提示
   * @param {string} message - 错误消息
   * @param {Function} [callback] - 可选的回调函数
   */
  showError(message, callback) {
    console.error('Error:', message);
    // 这里可以集成Element Plus的ElMessage或其他UI组件
    // 示例：ElMessage.error(message);
    if (typeof callback === 'function') {
      callback(message);
    }
  },

  /**
   * 显示成功提示
   * @param {string} message - 成功消息
   * @param {Function} [callback] - 可选的回调函数
   */
  showSuccess(message, callback) {
    console.log('Success:', message);
    // 这里可以集成Element Plus的ElMessage或其他UI组件
    // 示例：ElMessage.success(message);
    if (typeof callback === 'function') {
      callback(message);
    }
  }
};