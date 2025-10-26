const { decrypt } = require('./crypto');

/**
 * 执行Veloera签到
 * @param {Object} site - 站点信息
 * @returns {Object} - { success: boolean, message: string, quota: number|null, error: string|null }
 */
async function performCheckIn(site) {
  // 只支持Veloera类型
  if (site.apiType !== 'veloera') {
    return {
      success: false,
      message: '不支持的站点类型',
      quota: null,
      error: '仅Veloera类型支持签到'
    };
  }

  // 检查是否启用签到
  if (!site.enableCheckIn) {
    return {
      success: false,
      message: '未启用签到',
      quota: null,
      error: null
    };
  }

  // 检查必要参数
  if (!site.userId) {
    return {
      success: false,
      message: '缺少用户ID',
      quota: null,
      error: '签到需要配置用户ID'
    };
  }

  try {
    // 解密API Key
    const token = decrypt(site.apiKeyEnc);
    
    // 构建签到URL
    const baseUrl = site.baseUrl.replace(/\/+$/, ''); // 移除末尾斜杠
    const checkInUrl = `${baseUrl}/api/user/check_in`;
    
    console.log(`[签到] 开始签到: ${site.name} (${checkInUrl})`);
    
    // 发起签到请求
    const response = await fetch(checkInUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'veloera-user': site.userId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-store'
      },
      timeout: 15000 // 15秒超时
    });

    // 解析响应
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`[签到] 响应解析失败: ${site.name}`, responseText);
      return {
        success: false,
        message: '签到响应解析失败',
        quota: null,
        error: `无效的响应格式: ${responseText.substring(0, 100)}`
      };
    }

    // 检查签到结果
    if (result.success) {
      const quota = result.data?.quota || null;
      const message = result.message || '签到成功';
      console.log(`[签到] ✅ ${site.name} - ${message}, 获得额度: ${quota}`);
      return {
        success: true,
        message,
        quota,
        error: null
      };
    } else {
      const errorMsg = result.message || result.error || '签到失败';
      console.log(`[签到] ❌ ${site.name} - ${errorMsg}`);
      return {
        success: false,
        message: errorMsg,
        quota: null,
        error: errorMsg
      };
    }

  } catch (error) {
    console.error(`[签到] 异常: ${site.name}`, error.message);
    return {
      success: false,
      message: '签到异常',
      quota: null,
      error: error.message || '网络请求失败'
    };
  }
}

/**
 * 判断是否应该执行签到
 * @param {Object} site - 站点信息
 * @param {boolean} isManual - 是否手动触发
 * @returns {boolean}
 */
function shouldCheckIn(site, isManual = false) {
  // 手动触发时，只要启用了签到就执行
  if (isManual) {
    return site.apiType === 'veloera' && site.enableCheckIn;
  }
  
  // 定时任务时，根据 checkInMode 判断
  if (site.apiType !== 'veloera' || !site.enableCheckIn) {
    return false;
  }
  
  const mode = site.checkInMode || 'both';
  return mode === 'checkin' || mode === 'both';
}

/**
 * 判断是否应该执行模型检测
 * @param {Object} site - 站点信息
 * @param {boolean} isManual - 是否手动触发
 * @returns {boolean}
 */
function shouldCheckModels(site, isManual = false) {
  // 手动触发时总是检测模型
  if (isManual) {
    return true;
  }
  
  // 定时任务时，根据 checkInMode 判断
  const mode = site.checkInMode || 'both';
  return mode === 'model' || mode === 'both';
}

module.exports = {
  performCheckIn,
  shouldCheckIn,
  shouldCheckModels
};

