const crypto = require('crypto');
const { prisma } = require('./db');
const { decrypt } = require('./crypto');
const { sendModelChangeNotification } = require('./notifier');
const { performCheckIn, shouldCheckIn, shouldCheckModels } = require('./checkin');

// 辅助函数：获取嵌套对象的值
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

function normalizeModels(response) {
  if (!response) return [];
  const arr = Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : [];
  const list = arr.map((m) => {
    // 处理字符串类型的模型ID（newapi/Veloare返回字符串数组）
    if (typeof m === 'string') {
      return {
        id: m,
        object: 'model',
        owned_by: 'unknown',
        created: Date.now() / 1000
      };
    }
    // 处理对象类型的模型
    return {
      id: m.id || m.model || m,
      object: m.object || 'model',
      owned_by: m.owned_by || m.ownedBy || 'unknown',
      permission: m.permission,
      created: m.created || Date.now() / 1000,
      root: m.root,
      parent: m.parent,
      ...('type' in m ? { type: m.type } : {}),
    };
  });
  list.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  return list;
}

function hashModels(models) {
  const json = JSON.stringify(models);
  return crypto.createHash('sha256').update(json).digest('hex');
}

function computeDiff(prevList, nextList) {
  const prevMap = new Map(prevList.map((m) => [m.id, m]));
  const nextMap = new Map(nextList.map((m) => [m.id, m]));
  const added = [];
  const removed = [];
  
  // 只检测模型ID的新增和删除，不关注属性变化
  for (const [id, m] of nextMap) {
    if (!prevMap.has(id)) added.push(m);
  }
  for (const [id, m] of prevMap) {
    if (!nextMap.has(id)) removed.push(m);
  }
  
  return { added, removed, changed: [] };
}

// Newapi/Veloera API：获取模型列表
async function fetchModelsNewapi(baseUrl, apiKey, userId, apiType, fastify) {
  const url = new URL('api/user/models', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15000);
  const startTime = Date.now();
  
  const userHeader = apiType === 'newapi' ? 'new-api-user' : 'veloera-user';
  
  try {
    console.log(`[NEWAPI-REQ] GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        [userHeader]: userId,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: ac.signal
    });
    
    const responseTime = Date.now() - startTime;
    const rawText = await res.text();
    console.log(`[NEWAPI-RES] Status: ${res.status}`);
    console.log(`[NEWAPI-RES] Body: ${rawText.substring(0, 500)}...`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const json = JSON.parse(rawText);
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error('Invalid response format');
    }
    
    // 转换为OpenAI格式
    // Newapi/Veloera返回的是字符串数组，不是对象数组
    const models = json.data.map(m => {
      if (typeof m === 'string') {
        return {
          id: m,
          object: 'model',
          owned_by: apiType === 'newapi' ? 'new-api' : 'veloera',
          created: Date.now() / 1000
        };
      }
      return {
        id: m.id || m.model || m,
        object: 'model',
        owned_by: m.owned_by || (apiType === 'newapi' ? 'new-api' : 'veloera'),
        created: Date.now() / 1000
      };
    });
    
    return {
      models,
      rawResponse: rawText,
      statusCode: res.status,
      responseTime,
      errorMessage: null
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`[NEWAPI-ERR] ${error.message}`);
    throw {
      error,
      rawResponse: null,
      statusCode: null,
      responseTime,
      errorMessage: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Newapi/Veloera API：获取用户信息（billing）
async function fetchUserInfoNewapi(baseUrl, apiKey, userId, apiType, fastify) {
  const url = new URL('api/user/self', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10000);
  
  const userHeader = apiType === 'newapi' ? 'new-api-user' : 'veloera-user';
  
  try {
    console.log(`[NEWAPI-REQ] GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        [userHeader]: userId,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: ac.signal
    });
    
    const rawText = await res.text();
    console.log(`[NEWAPI-RES] Status: ${res.status}`);
    console.log(`[NEWAPI-RES] Body: ${rawText}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    if (!data.success || !data.data) {
      throw new Error('Invalid user info response');
    }
    
    const userData = data.data;
    // 根据API类型设置不同的转换比例
    let conversionRatio;
    if (apiType === 'newapi') {
      conversionRatio = 500000; // Newapi: 500000 = $1
    } else if (apiType === 'veloera') {
      conversionRatio = 500000; // Veloera: 500000 = $1 (修正后)
    } else {
      conversionRatio = 500000; // 默认值
    }
    
    console.log(`[QUOTA-CONVERSION] API类型: ${apiType}, 转换比例: ${conversionRatio}:1`);
    console.log(`[QUOTA-CONVERSION] 原始quota: ${userData.quota || 0}, 原始used_quota: ${userData.used_quota || 0}`);
    
    const quotaInDollars = (userData.quota || 0) / conversionRatio;
    const usedQuotaInDollars = (userData.used_quota || 0) / conversionRatio;
    
    console.log(`[QUOTA-CONVERSION] 转换后quota: $${quotaInDollars.toFixed(6)}, 转换后used_quota: $${usedQuotaInDollars.toFixed(6)}`);
    const totalQuotaInDollars = quotaInDollars + usedQuotaInDollars; // 总额度 = 当前余额 + 已使用
    
    console.log(`[QUOTA-CONVERSION] 当前余额: $${quotaInDollars.toFixed(6)}, 已使用: $${usedQuotaInDollars.toFixed(6)}, 总额度: $${totalQuotaInDollars.toFixed(6)}`);
    
    return {
      quota: totalQuotaInDollars, // 返回总额度
      usedQuota: usedQuotaInDollars, // 返回已使用额度
      status: userData.status
    };
  } catch (error) {
    console.log(`[NEWAPI-ERR] User info: ${error.message}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// DoneHub API：获取模型列表
async function fetchModelsDonehub(baseUrl, apiKey, fastify) {
  const url = new URL('api/available_model', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15000);
  const startTime = Date.now();
  
  try {
    console.log(`[DONEHUB-REQ] GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: ac.signal
    });
    
    const responseTime = Date.now() - startTime;
    const rawText = await res.text();
    console.log(`[DONEHUB-RES] Status: ${res.status}`);
    console.log(`[DONEHUB-RES] Body: ${rawText.substring(0, 500)}...`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const json = JSON.parse(rawText);
    if (!json.data) {
      throw new Error('Invalid response format');
    }
    
    // 提取模型名称
    const models = Object.keys(json.data).map(modelId => ({
      id: modelId,
      object: 'model',
      owned_by: json.data[modelId].owned_by || 'unknown',
      created: Date.now() / 1000
    }));
    
    return {
      models,
      rawResponse: rawText,
      statusCode: res.status,
      responseTime,
      errorMessage: null
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`[DONEHUB-ERR] ${error.message}`);
    throw {
      error,
      rawResponse: null,
      statusCode: null,
      responseTime,
      errorMessage: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

// VOAPI API：获取用户信息（billing）
async function fetchUserInfoVoapi(baseUrl, jwtToken, fastify) {
  const url = new URL('api/user/info', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10000);
  
  try {
    console.log(`[VOAPI-REQ] GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': jwtToken, // VOAPI直接使用JWT token
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: ac.signal
    });
    
    const rawText = await res.text();
    console.log(`[VOAPI-RES] Status: ${res.status}`);
    console.log(`[VOAPI-RES] Body: ${rawText}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    if (data.code !== 0 || !data.data) {
      throw new Error('Invalid user info response');
    }
    
    const userData = data.data;
    // VOAPI: bindBalance + basicBalance = 总余额, usedBindBalance + usedBasicBalance = 已使用
    const totalBalance = parseFloat(userData.bindBalance || 0) + parseFloat(userData.basicBalance || 0);
    const totalUsed = parseFloat(userData.usedBindBalance || 0) + parseFloat(userData.usedBasicBalance || 0);
    
    console.log(`[VOAPI-QUOTA] 总余额: $${totalBalance.toFixed(6)}, 已使用: $${totalUsed.toFixed(6)}`);
    
    return {
      quota: totalBalance,
      usedQuota: totalUsed,
      status: userData.ban ? 'banned' : 'active'
    };
  } catch (error) {
    console.log(`[VOAPI-ERR] User info: ${error.message}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// DoneHub API：获取用户信息（billing）
async function fetchUserInfoDonehub(baseUrl, apiKey, fastify) {
  const url = new URL('api/user/self', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10000);
  
  try {
    console.log(`[DONEHUB-REQ] GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: ac.signal
    });
    
    const rawText = await res.text();
    console.log(`[DONEHUB-RES] Status: ${res.status}`);
    console.log(`[DONEHUB-RES] Body: ${rawText}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    if (!data.success || !data.data) {
      throw new Error('Invalid user info response');
    }
    
    const userData = data.data;
    // DoneHub: 500000 = $1 (可配置)
    const conversionRatio = 500000; // DoneHub的转换比例
    const quotaInDollars = (userData.quota || 0) / conversionRatio;
    const usedQuotaInDollars = (userData.used_quota || 0) / conversionRatio;
    
    console.log(`[DONEHUB-QUOTA-CONVERSION] 转换后quota: $${quotaInDollars.toFixed(6)}, 转换后used_quota: $${usedQuotaInDollars.toFixed(6)}`);
    const totalQuotaInDollars = quotaInDollars + usedQuotaInDollars; // 总额度 = 当前余额 + 已使用
    
    console.log(`[DONEHUB-QUOTA-CONVERSION] 当前余额: $${quotaInDollars.toFixed(6)}, 已使用: $${usedQuotaInDollars.toFixed(6)}, 总额度: $${totalQuotaInDollars.toFixed(6)}`);
    
    return {
      quota: totalQuotaInDollars, // 返回总额度
      usedQuota: usedQuotaInDollars, // 返回已使用额度
      status: userData.status
    };
  } catch (error) {
    console.log(`[DONEHUB-ERR] User info: ${error.message}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// 获取billing订阅额度信息
async function fetchBillingSubscription(baseUrl, apiKey, fastify) {
  const url = new URL('v1/dashboard/billing/subscription', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10000);
  
  try {
    console.log(`[BILLING-REQ] GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: ac.signal
    });
    
    const rawText = await res.text();
    console.log(`[BILLING-RES] Status: ${res.status}`);
    console.log(`[BILLING-RES] Body: ${rawText}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    return data.system_hard_limit_usd || null;
  } catch (error) {
    console.log(`[BILLING-ERR] Subscription: ${error.message}`);
    fastify?.log?.warn({ msg: 'Failed to fetch billing subscription', error: error.message });
    throw error; // 抛出错误而不是返回null
  } finally {
    clearTimeout(timeout);
  }
}

// 获取自定义billing信息
async function fetchCustomBilling(site, fastify) {
  if (!site.billingUrl) {
    throw new Error('No custom billing URL configured');
  }
  
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10000);
  
  try {
    console.log(`[CUSTOM-BILLING-REQ] GET ${site.billingUrl}`);
    
    // 准备认证头
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    };
    
    if (site.billingAuthValue) {
      const authValue = decrypt(site.billingAuthValue);
      if (site.billingAuthType === 'token') {
        headers['Authorization'] = authValue.startsWith('Bearer ') ? authValue : `Bearer ${authValue}`;
      } else if (site.billingAuthType === 'cookie') {
        headers['Cookie'] = authValue;
      }
    }
    
    const res = await fetch(site.billingUrl, {
      method: 'GET',
      headers,
      signal: ac.signal
    });
    
    const rawText = await res.text();
    console.log(`[CUSTOM-BILLING-RES] Status: ${res.status}`);
    console.log(`[CUSTOM-BILLING-RES] Body: ${rawText}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    
    // 尝试从响应中提取billing信息
    let billingLimit = null;
    let billingUsage = null;
    
    // 使用自定义字段映射（如果配置了）
    if (site.billingLimitField && site.billingUsageField) {
      // 支持嵌套字段，如 "data.balance"
      const limitValue = getNestedValue(data, site.billingLimitField);
      const usageValue = getNestedValue(data, site.billingUsageField);
      
      if (limitValue !== undefined) billingLimit = parseFloat(limitValue);
      if (usageValue !== undefined) billingUsage = parseFloat(usageValue);
      
      console.log(`[CUSTOM-BILLING] 使用自定义字段映射: ${site.billingLimitField}=${limitValue}, ${site.billingUsageField}=${usageValue}`);
    } else {
      // 使用默认的字段名匹配
      // 常见的字段名
      if (data.limit !== undefined) billingLimit = parseFloat(data.limit);
      if (data.usage !== undefined) billingUsage = parseFloat(data.usage);
      if (data.quota !== undefined) billingLimit = parseFloat(data.quota);
      if (data.used !== undefined) billingUsage = parseFloat(data.used);
      if (data.balance !== undefined) billingLimit = parseFloat(data.balance);
      if (data.consumed !== undefined) billingUsage = parseFloat(data.consumed);
      
      // OpenAI格式
      if (data.system_hard_limit_usd !== undefined) billingLimit = parseFloat(data.system_hard_limit_usd);
      if (data.total_usage !== undefined) billingUsage = parseFloat(data.total_usage) * 0.01;
    }
    
    return {
      billingLimit,
      billingUsage,
      rawResponse: rawText
    };
  } catch (error) {
    console.log(`[CUSTOM-BILLING-ERR] ${error.message}`);
    fastify?.log?.warn({ msg: 'Failed to fetch custom billing', error: error.message });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// 获取billing使用量信息
async function fetchBillingUsage(baseUrl, apiKey, fastify) {
  const url = new URL('v1/dashboard/billing/usage', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10000);
  
  try {
    console.log(`[BILLING-REQ] GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: ac.signal
    });
    
    const rawText = await res.text();
    console.log(`[BILLING-RES] Status: ${res.status}`);
    console.log(`[BILLING-RES] Body: ${rawText}`);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    // total_usage 单位为 0.01 美元，需要乘以 0.01
    return data.total_usage ? (data.total_usage * 0.01) : null;
  } catch (error) {
    console.log(`[BILLING-ERR] Usage: ${error.message}`);
    fastify?.log?.warn({ msg: 'Failed to fetch billing usage', error: error.message });
    throw error; // 抛出错误而不是返回null
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchModels(baseUrl, apiKey, fastify) {
  // 使用相对路径（不带前导/）以保留 baseUrl 中的路径部分（如 /api）
  const url = new URL('v1/models', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15000);
  const startTime = Date.now();
  
  try {
    // VERSION: v2.0-simplified (只用2个头，模仿Python)
    fastify?.log?.info({ msg: 'Fetching with v2.0-simplified headers', url: url.toString() });
    
    const res = await fetch(url, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: ac.signal
    });
    
    const responseTime = Date.now() - startTime;
    const rawText = await res.text();
    
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${rawText.substring(0, 200)}`);
    }
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText.substring(0, 200)}`);
    }
    
    const models = normalizeModels(json);
    
    return {
      models,
      rawResponse: rawText,
      statusCode: res.status,
      responseTime,
      errorMessage: null
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // 详细的错误日志
    fastify?.log?.error({
      msg: 'Fetch error details',
      url: url.toString(),
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack?.split('\n')[0],
      responseTime
    });
    
    throw {
      error,
      rawResponse: null,
      statusCode: null,
      responseTime,
      errorMessage: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkSiteById(siteId, fastify, options = {}) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error('Site not found');
  return checkSite(site, fastify, options);
}

/**
 * 判断是否为手动触发（立即检测、一键检测）
 */
function isManualTrigger(options = {}) {
  return options.isManual === true;
}

async function checkSite(site, fastify, options = {}) {
  const { skipNotification = false } = options;
  const isManual = isManualTrigger(options);
  const apiKey = decrypt(site.apiKeyEnc);
  let fetchResult;
  let models;
  let rawResponse = null;
  let errorMessage = null;
  let statusCode = null;
  let responseTime = null;
  
  // 并行获取billing信息（不阻塞主检测流程）
  let billingLimit = null;
  let billingUsage = null;
  let billingError = null;
  
  // 签到相关变量
  let checkInSuccess = null;
  let checkInMessage = null;
  let checkInQuota = null;
  let checkInError = null;
  
  console.log(`\n[CHECK] ========== 开始检测站点: ${site.name} (${site.apiType || 'other'}) ==========`);
  console.log(`[CHECK] 触发方式: ${isManual ? '手动' : '定时'}, 模式: ${site.checkInMode || 'both'}`);
  
  // 判断是否需要执行签到和模型检测
  const needCheckIn = shouldCheckIn(site, isManual);
  const needCheckModels = shouldCheckModels(site, isManual);
  
  console.log(`[CHECK] 需要签到: ${needCheckIn}, 需要检测模型: ${needCheckModels}`);
  
  // 执行签到（如果需要）
  if (needCheckIn) {
    console.log(`[CHECK] 开始执行签到...`);
    try {
      const checkInResult = await performCheckIn(site);
      checkInSuccess = checkInResult.success;
      checkInMessage = checkInResult.message;
      checkInQuota = checkInResult.quota;
      checkInError = checkInResult.error;
      
      console.log(`[CHECK] 签到完成: ${checkInSuccess ? '成功' : '失败'} - ${checkInMessage}`);
    } catch (error) {
      console.error(`[CHECK] 签到异常:`, error);
      checkInSuccess = false;
      checkInError = error.message || '签到异常';
    }
  }
  
  // 如果不需要检测模型，直接保存签到结果并返回
  if (!needCheckModels) {
    console.log(`[CHECK] 仅签到模式，跳过模型检测`);
    const now = new Date();
    await prisma.modelSnapshot.create({
      data: {
        siteId: site.id,
        modelsJson: '[]',
        hash: '',
        fetchedAt: now,
        rawResponse: null,
        errorMessage: null,
        statusCode: null,
        responseTime: null,
        billingLimit: null,
        billingUsage: null,
        billingError: null,
        checkInSuccess,
        checkInMessage,
        checkInQuota,
        checkInError
      }
    });
    await prisma.site.update({ 
      where: { id: site.id }, 
      data: { lastCheckedAt: now } 
    });
    return { 
      ok: true, 
      hasChanges: false,
      diff: null,
      siteName: site.name,
      checkInOnly: true,
      checkInResult: { checkInSuccess, checkInMessage, checkInQuota, checkInError }
    };
  }
  
  // 检查是否为无限余额站点
  if (site.unlimitedQuota) {
    console.log(`[CHECK] 站点 ${site.name} 标记为无限余额，跳过billing检测`);
    billingLimit = null; // 无限余额不设置限制
    billingUsage = null; // 无限余额不检测使用量
    billingError = null;
  }
  
  // 根据API类型选择对应的获取函数
  let billingPromises;
  let fetchModelsFunc;
  
  if (site.apiType === 'newapi' || site.apiType === 'veloera') {
    // Newapi/Veloera：使用userId进行鉴权
    if (!site.userId) {
      console.log(`[WARN] ${site.apiType} requires userId but it's not set`);
    }
    if (!site.unlimitedQuota) {
      billingPromises = Promise.allSettled([
        fetchUserInfoNewapi(site.baseUrl, apiKey, site.userId || '1', site.apiType, fastify)
      ]);
    }
    fetchModelsFunc = () => fetchModelsNewapi(site.baseUrl, apiKey, site.userId || '1', site.apiType, fastify);
  } else if (site.apiType === 'donehub') {
    // DoneHub：不需要userId
    if (!site.unlimitedQuota) {
      billingPromises = Promise.allSettled([
        fetchUserInfoDonehub(site.baseUrl, apiKey, fastify)
      ]);
    }
    fetchModelsFunc = () => fetchModelsDonehub(site.baseUrl, apiKey, fastify);
  } else if (site.apiType === 'voapi') {
    // VOAPI：使用JWT token获取用量，apiKey获取模型
    if (!site.unlimitedQuota) {
      const jwtToken = site.billingAuthValue ? decrypt(site.billingAuthValue) : null;
      if (jwtToken) {
        billingPromises = Promise.allSettled([
          fetchUserInfoVoapi(site.baseUrl, jwtToken, fastify)
        ]);
      } else {
        console.log(`[VOAPI-WARN] No JWT token configured for billing`);
      }
    }
    fetchModelsFunc = () => fetchModels(site.baseUrl, apiKey, fastify); // 使用标准OpenAI模式获取模型
  } else {
    // Other: 使用原有的OpenAI兼容方式或自定义billing
    if (!site.unlimitedQuota) {
      if (site.billingUrl) {
        // 使用自定义billing URL
        billingPromises = Promise.allSettled([
          fetchCustomBilling(site, fastify)
        ]);
      } else {
        // 使用默认的OpenAI兼容billing
        billingPromises = Promise.allSettled([
          fetchBillingSubscription(site.baseUrl, apiKey, fastify),
          fetchBillingUsage(site.baseUrl, apiKey, fastify)
        ]);
      }
    }
    fetchModelsFunc = () => fetchModels(site.baseUrl, apiKey, fastify);
  }
  
  try {
    const [fetchResult] = await Promise.all([
      fetchModelsFunc()
    ]);
    
    // 等待billing结果（仅对非无限余额站点）
    if (!site.unlimitedQuota && billingPromises) {
      const billingResults = await billingPromises;
      
      // 根据API类型处理billing结果
      if (site.apiType === 'newapi' || site.apiType === 'veloera' || site.apiType === 'donehub' || site.apiType === 'voapi') {
        // Newapi/Veloera/DoneHub返回 {quota, usedQuota, status}
        if (billingResults[0].status === 'fulfilled') {
          const userInfo = billingResults[0].value;
          billingLimit = userInfo.quota;
          billingUsage = userInfo.usedQuota;
        } else {
          billingError = billingResults[0].reason?.message || String(billingResults[0].reason);
        }
      } else {
        // Other类型：可能是自定义billing或默认OpenAI兼容billing
        if (site.billingUrl) {
          // 自定义billing返回单个对象
          if (billingResults[0].status === 'fulfilled') {
            const customBilling = billingResults[0].value;
            billingLimit = customBilling.billingLimit;
            billingUsage = customBilling.billingUsage;
          } else {
            billingError = billingResults[0].reason?.message || String(billingResults[0].reason);
          }
        } else {
          // 默认OpenAI兼容billing返回两个单独的值
          billingLimit = billingResults[0].status === 'fulfilled' ? billingResults[0].value : null;
          billingUsage = billingResults[1].status === 'fulfilled' ? billingResults[1].value : null;
          
          const errors = [];
          if (billingResults[0].status === 'rejected') errors.push(`Subscription: ${billingResults[0].reason?.message || billingResults[0].reason}`);
          if (billingResults[1].status === 'rejected') errors.push(`Usage: ${billingResults[1].reason?.message || billingResults[1].reason}`);
          if (errors.length > 0) billingError = errors.join('; ');
        }
      }
    }
    
    // 输出billing汇总结果
    console.log(`[BILLING] ========== 站点: ${site.name} - 结果汇总 ==========`);
    if (site.unlimitedQuota) {
      console.log(`[BILLING] 无限余额站点，跳过billing检测`);
    } else {
    console.log(`[BILLING] 总额度: ${billingLimit !== null ? '$' + billingLimit.toFixed(2) : '获取失败'}`);
    console.log(`[BILLING] 已使用: ${billingUsage !== null ? '$' + billingUsage.toFixed(2) : '获取失败'}`);
    if (billingLimit !== null && billingUsage !== null) {
      const remaining = billingLimit - billingUsage;
      const percentage = ((billingLimit - billingUsage) / billingLimit * 100).toFixed(1);
      console.log(`[BILLING] 剩余额度: $${remaining.toFixed(2)} (${percentage}%)`);
    }
    if (billingError) {
      console.log(`[BILLING] 错误: ${billingError}`);
    }
    }
    console.log(`[BILLING] ========================================\n`);
    models = fetchResult.models;
    rawResponse = fetchResult.rawResponse;
    statusCode = fetchResult.statusCode;
    responseTime = fetchResult.responseTime;
  } catch (e) {
    // 请求失败时创建错误快照用于调试，但不用于对比（有 errorMessage）
    const now = new Date();
    await prisma.modelSnapshot.create({
      data: {
        siteId: site.id,
        modelsJson: '[]',
        hash: '',
        fetchedAt: now,
        rawResponse: e.rawResponse,
        errorMessage: e.errorMessage || e.error?.message || String(e),
        statusCode: e.statusCode,
        responseTime: e.responseTime,
        billingLimit: null,
        billingUsage: null,
        billingError: null,
        checkInSuccess,
        checkInMessage,
        checkInQuota,
        checkInError
      }
    });
    await prisma.site.update({ 
      where: { id: site.id }, 
      data: { lastCheckedAt: now } 
    });
    fastify?.log?.warn({ 
      siteId: site.id, 
      siteName: site.name,
      err: e.errorMessage || e.error?.message,
      statusCode: e.statusCode,
      responseTime: e.responseTime
    }, 'Fetch failed - error snapshot created for debugging');
    throw e.error || e;
  }
  
  const hash = hashModels(models);
  // 只查找成功的快照进行对比（errorMessage 为 null）
  const lastSnap = await prisma.modelSnapshot.findFirst({ 
    where: { 
      siteId: site.id,
      errorMessage: null  // 只取成功的快照
    }, 
    orderBy: { fetchedAt: 'desc' } 
  });
  const now = new Date();
  let diff = { added: [], removed: [], changed: [] };
  let hasChanges = false;
  let checkInChanged = false;
  
  // 检测签到状态是否发生变化
  console.log(`[CHECK-IN] ========== 签到状态检测 ==========`);
  console.log(`[CHECK-IN] needCheckIn=${needCheckIn}`);
  
  if (needCheckIn) {
    console.log(`[CHECK-IN] 开始检测签到状态变化...`);
    console.log(`[CHECK-IN] 当前签到结果: success=${checkInSuccess}, message=${checkInMessage}, error=${checkInError}`);
    
    if (!lastSnap) {
      // 首次检测：如果有签到结果，标记为变更
      console.log(`[CHECK-IN] 首次检测，无历史快照`);
      if (checkInSuccess !== null) {
        checkInChanged = true;
        console.log(`[CHECK-IN] ✅ 首次签到标记为变更: ${checkInSuccess ? '成功' : '失败'}`);
      }
    } else {
      // 非首次检测：对比上次快照
      const lastCheckInSuccess = lastSnap.checkInSuccess;
      const lastCheckInError = lastSnap.checkInError;
      
      console.log(`[CHECK-IN] 上次签到结果: success=${lastCheckInSuccess}, error=${lastCheckInError}`);
      
      // 签到状态发生变化的情况：
      // 1. 从无记录到有记录
      // 2. 从成功变为失败，或从失败变为成功
      // 3. 错误信息发生变化
      if (lastCheckInSuccess === null && checkInSuccess !== null) {
        checkInChanged = true;
        console.log(`[CHECK-IN] ✅ 签到状态变化: 无记录 -> ${checkInSuccess ? '成功' : '失败'}`);
      } else if (lastCheckInSuccess !== null && checkInSuccess !== null && lastCheckInSuccess !== checkInSuccess) {
        checkInChanged = true;
        console.log(`[CHECK-IN] ✅ 签到状态变化: ${lastCheckInSuccess ? '成功' : '失败'} -> ${checkInSuccess ? '成功' : '失败'}`);
      } else if (checkInSuccess === false && lastCheckInError !== checkInError) {
        checkInChanged = true;
        console.log(`[CHECK-IN] ✅ 签到错误信息变化: "${lastCheckInError}" -> "${checkInError}"`);
      } else {
        console.log(`[CHECK-IN] ⭕ 签到状态无变化`);
      }
    }
    
    console.log(`[CHECK-IN] 检测结果: checkInChanged=${checkInChanged}`);
  } else {
    console.log(`[CHECK-IN] 跳过签到变更检测 (needCheckIn=${needCheckIn})`);
  }
  
  // 每次检测都创建快照（不管是否有变更），这样"请求详情"能显示最新结果
  const snap = await prisma.modelSnapshot.create({
    data: {
      siteId: site.id,
      modelsJson: JSON.stringify(models),
      hash,
      fetchedAt: now,
      rawResponse,
      errorMessage: null,
      statusCode,
      responseTime,
      billingLimit,
      billingUsage,
      billingError,
      checkInSuccess,
      checkInMessage,
      checkInQuota,
      checkInError
    }
  });
  
  // 检查是否有变更
  if (lastSnap && lastSnap.hash !== hash) {
    let prev = [];
    try { prev = JSON.parse(lastSnap.modelsJson) } catch (_) { prev = [] }
    diff = computeDiff(Array.isArray(prev) ? prev : [], models);
    hasChanges = diff.added.length > 0 || diff.removed.length > 0; // 只检测新增和删除
    
    // 只有当有变更时才创建 diff 记录
    if (hasChanges) {
      await prisma.modelDiff.create({
        data: {
          siteId: site.id,
          diffAt: now,
          addedJson: JSON.stringify(diff.added),
          removedJson: JSON.stringify(diff.removed),
          changedJson: JSON.stringify(diff.changed),
          snapshotFromId: lastSnap.id,
          snapshotToId: snap.id,
        },
      });
    }
  } else if (!lastSnap) {
    // 首次检测：不创建 diff 记录，也不发送通知
    hasChanges = false;
    fastify?.log?.info({ siteId: site.id, siteName: site.name, modelCount: models.length }, 'First check - snapshot created, no diff record');
  }
  
  // 发送邮件通知（只有当有实际变更时才发送）
  if (hasChanges && !skipNotification) {
    try {
      console.log(`[EMAIL] 尝试发送邮件通知 - 站点: ${site.name}`);
      console.log(`[EMAIL] 变化内容:`, {
        added: diff.added?.length || 0,
        removed: diff.removed?.length || 0
      });
      
      await sendModelChangeNotification(site.name, diff, fastify);
    } catch (emailError) {
      console.error(`[EMAIL] 邮件通知失败: ${site.name}`, emailError);
      fastify?.log?.error(`邮件通知失败: ${site.name}`, emailError);
    }
  } else if (hasChanges && skipNotification) {
    console.log(`[EMAIL] 跳过单站点邮件通知（将聚合发送）- 站点: ${site.name}`);
  }
  
  await prisma.site.update({ where: { id: site.id }, data: { lastCheckedAt: now } });
  
  // 返回变更信息供聚合使用（包含签到结果）
  // 只要执行了签到，就返回签到结果（用于邮件通知）
  const hasCheckInResult = needCheckIn && checkInSuccess !== null;
  
  console.log(`\n[CHECK] ========== 检测结果汇总 ==========`);
  console.log(`[CHECK] 站点: ${site.name}`);
  console.log(`[CHECK] 模型变更: ${hasChanges}`);
  console.log(`[CHECK] 执行签到: ${needCheckIn}`);
  console.log(`[CHECK] 有签到结果: ${hasCheckInResult}`);
  if (hasCheckInResult) {
    console.log(`[CHECK] 签到状态: ${checkInSuccess ? '成功' : '失败'}`);
    console.log(`[CHECK] 签到消息: ${checkInMessage}`);
  }
  console.log(`[CHECK] 将发送通知: ${hasChanges || hasCheckInResult ? '是' : '否'}`);
  console.log(`[CHECK] ======================================\n`);
  
  return { 
    ok: true, 
    hasChanges,
    diff: hasChanges ? diff : null,
    siteName: site.name,
    checkInChanged, // 保留用于日志
    checkInResult: hasCheckInResult ? { checkInSuccess, checkInMessage, checkInQuota, checkInError } : null
  };
}

module.exports = { normalizeModels, hashModels, computeDiff, fetchModels, checkSiteById, checkSite };
