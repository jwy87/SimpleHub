const { Resend } = require('resend');
const { decrypt } = require('./crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 调试日志函数
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] EMAIL DEBUG: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function sendModelChangeNotification(siteName, diff, fastify) {
  debugLog(`=== 开始邮件通知流程 ===`);
  debugLog(`站点名称: ${siteName}`);
  debugLog('变化数据:', diff);
  
  try {
    // 获取邮件配置
    debugLog('正在获取邮件配置...');
    const config = await prisma.emailConfig.findFirst();
    
    debugLog('邮件配置查询结果:', { 
      exists: !!config, 
      enabled: config?.enabled,
      hasApiKey: !!config?.resendApiKeyEnc,
      notifyEmailsRaw: config?.notifyEmails,
      emailCount: config?.notifyEmails ? (() => {
        try {
          return JSON.parse(config.notifyEmails || '[]').length;
        } catch {
          return 0;
        }
      })() : 0
    });
    
    if (!config || !config.enabled) {
      debugLog('❌ 邮件配置未启用或不存在，跳过发送');
      return;
    }

    // 解析邮箱列表（支持两种格式：JSON数组或逗号分隔字符串）
    let emails = [];
    try {
      const emailStr = (config.notifyEmails || '').trim();
      // 检测是否为 JSON 数组格式
      if (emailStr.startsWith('[')) {
        emails = JSON.parse(emailStr);
      } else {
        // 作为逗号或分号分隔的字符串处理
        emails = emailStr.split(/[,;]/).map(e => e.trim()).filter(e => e.length > 0);
      }
      debugLog(`✅ 解析邮箱列表成功: [${emails.join(', ')}]`);
    } catch (error) {
      debugLog('❌ 解析邮箱列表失败:', error.message);
      return;
    }
    
    if (!emails.length) {
      debugLog('❌ 没有配置收件邮箱，跳过发送');
      return;
    }

    // 解密 API Key
    let apiKey;
    try {
      apiKey = decrypt(config.resendApiKeyEnc);
      debugLog('✅ API Key 解密成功');
    } catch (error) {
      debugLog('❌ API Key 解密失败:', error.message);
      return;
    }
    
    debugLog('正在初始化 Resend...');
    const resend = new Resend(apiKey);
    debugLog('✅ Resend 初始化完成');

    // 检查是否有实际变化（只检查新增和删除）
    const hasChanges = (diff.added && diff.added.length > 0) || 
                      (diff.removed && diff.removed.length > 0);
    
    debugLog('📊 变化检查:', {
      hasChanges,
      added: diff.added?.length || 0,
      removed: diff.removed?.length || 0
    });
    
    if (!hasChanges) {
      debugLog('❌ 没有模型变化，跳过发送');
      return;
    }

    // 构建邮件内容
    debugLog('🔧 开始构建邮件内容...');
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">🔔 AI 模型变化通知</h1>
        <p><strong>站点：</strong>${siteName}</p>
        <p><strong>检测时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
    `;
    
    // 如果有签到信息，添加签到结果
    if (diff.checkInResult) {
      const { checkInSuccess, checkInMessage, checkInQuota } = diff.checkInResult;
      const statusIcon = checkInSuccess ? '✅' : '❌';
      const statusColor = checkInSuccess ? '#52c41a' : '#ff4d4f';
      htmlContent += `
        <div style="background: ${checkInSuccess ? '#f6ffed' : '#fff2f0'}; border: 1px solid ${checkInSuccess ? '#b7eb8f' : '#ffccc7'}; padding: 12px; border-radius: 4px; margin: 10px 0;">
          <h3 style="color: ${statusColor}; margin: 0 0 8px 0;">${statusIcon} 签到结果</h3>
          <p style="margin: 0;"><strong>状态：</strong>${checkInMessage || (checkInSuccess ? '签到成功' : '签到失败')}</p>
          ${checkInQuota ? `<p style="margin: 4px 0 0 0;"><strong>获得额度：</strong>${checkInQuota}</p>` : ''}
        </div>
      `;
    }
    
    if (diff.added && diff.added.length > 0) {
      htmlContent += `<h2 style="color: #52c41a;">✅ 新增模型 (${diff.added.length})</h2><ul>`;
      diff.added.forEach(model => {
        htmlContent += `<li>${model.id || 'Unknown'}</li>`;
      });
      htmlContent += '</ul>';
    }
    
    if (diff.removed && diff.removed.length > 0) {
      htmlContent += `<h2 style="color: #ff4d4f;">❌ 移除模型 (${diff.removed.length})</h2><ul>`;
      diff.removed.forEach(model => {
        htmlContent += `<li>${model.id || 'Unknown'}</li>`;
      });
      htmlContent += '</ul>';
    }
    
    htmlContent += `<p style="color: #666; font-size: 12px; margin-top: 30px;">本邮件由 AI 模型监测系统自动发送</p></div>`;
    
    debugLog('✅ 邮件内容构建完成');
    
    // 准备邮件参数（完全按照官方示例）
    const emailParams = {
      from: 'AI模型监测 <onboarding@resend.dev>',
      to: emails,
      subject: `[AI模型监测] ${siteName} - 模型发生变化`,
      html: htmlContent
    };
    
    debugLog('📧 准备发送邮件:', {
      from: emailParams.from,
      to: emailParams.to,
      subject: emailParams.subject,
      htmlLength: htmlContent.length
    });

    // 发送邮件（使用官方示例格式）
    debugLog('🚀 正在调用 Resend API...');
    const result = await resend.emails.send(emailParams);
    
    debugLog('🎉 邮件发送成功！结果:', result);
    fastify?.log?.info(`邮件发送成功: ${siteName} -> ${emails.join(', ')}`);
    return result;

  } catch (error) {
    debugLog('💥 邮件发送过程出错:', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack?.split('\n').slice(0, 3),
      siteName
    });
    fastify?.log?.error(`邮件通知失败: ${siteName}`, error);
    
    // 不抛出错误，避免影响主流程
    console.error(`[EMAIL] 最终错误: ${siteName}`, error.message);
  } finally {
    debugLog(`=== 邮件通知流程结束 ===`);
  }
}

// 聚合发送多个站点的变更通知
async function sendAggregatedNotification(siteChanges, fastify, failedSites = []) {
  debugLog(`=== 开始聚合邮件通知流程 ===`);
  debugLog(`站点变更数量: ${siteChanges.length}`);
  debugLog(`失败站点数量: ${failedSites.length}`);
  
  try {
    // 获取邮件配置
    debugLog('正在获取邮件配置...');
    const config = await prisma.emailConfig.findFirst();
    
    debugLog('邮件配置查询结果:', { 
      exists: !!config, 
      enabled: config?.enabled,
      hasApiKey: !!config?.resendApiKeyEnc
    });
    
    if (!config || !config.enabled) {
      debugLog('❌ 邮件配置未启用或不存在，跳过发送');
      return;
    }

    // 解析邮箱列表
    let emails = [];
    try {
      const emailStr = (config.notifyEmails || '').trim();
      if (emailStr.startsWith('[')) {
        emails = JSON.parse(emailStr);
      } else {
        emails = emailStr.split(/[,;]/).map(e => e.trim()).filter(e => e.length > 0);
      }
      debugLog(`✅ 解析邮箱列表成功: [${emails.join(', ')}]`);
    } catch (error) {
      debugLog('❌ 解析邮箱列表失败:', error.message);
      return;
    }
    
    if (!emails.length) {
      debugLog('❌ 没有配置收件邮箱，跳过发送');
      return;
    }

    // 解密 API Key
    let apiKey;
    try {
      apiKey = decrypt(config.resendApiKeyEnc);
      debugLog('✅ API Key 解密成功');
    } catch (error) {
      debugLog('❌ API Key 解密失败:', error.message);
      return;
    }
    
    debugLog('正在初始化 Resend...');
    const resend = new Resend(apiKey);
    debugLog('✅ Resend 初始化完成');

    // 统计总变更数（只统计新增和删除）
    let totalAdded = 0;
    let totalRemoved = 0;
    siteChanges.forEach(sc => {
      totalAdded += sc.diff.added?.length || 0;
      totalRemoved += sc.diff.removed?.length || 0;
    });

    debugLog('📊 聚合统计:', {
      sitesWithChanges: siteChanges.length,
      totalAdded,
      totalRemoved
    });
    
    // 构建聚合邮件内容
    debugLog('🔧 开始构建聚合邮件内容...');
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🔔 AI 模型变化通知</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">定时检测报告</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: #e6f7ff; border-left: 4px solid #1890ff; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
            <p style="margin: 0; color: #0050b3; font-size: 15px;">
              <strong>📅 检测时间：</strong>${new Date().toLocaleString('zh-CN')}
            </p>
            <p style="margin: 8px 0 0 0; color: #0050b3; font-size: 15px;">
              <strong>🎯 变更站点：</strong>${siteChanges.length} 个
            </p>
            ${failedSites.length > 0 ? `
            <p style="margin: 8px 0 0 0; color: #cf1322; font-size: 15px;">
              <strong>⚠️ 失败站点：</strong>${failedSites.length} 个
            </p>
            ` : ''}
          </div>
          
          <div style="display: flex; gap: 15px; margin-bottom: 30px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 200px; background: #f6ffed; border: 1px solid #b7eb8f; padding: 20px; border-radius: 8px; text-align: center;">
              <div style="font-size: 36px; font-weight: bold; color: #52c41a;">${totalAdded}</div>
              <div style="color: #389e0d; margin-top: 8px; font-size: 15px; font-weight: 600;">➕ 新增模型</div>
            </div>
            <div style="flex: 1; min-width: 200px; background: #fff2f0; border: 1px solid #ffccc7; padding: 20px; border-radius: 8px; text-align: center;">
              <div style="font-size: 36px; font-weight: bold; color: #ff4d4f;">${totalRemoved}</div>
              <div style="color: #cf1322; margin-top: 8px; font-size: 15px; font-weight: 600;">➖ 移除模型</div>
            </div>
          </div>
    `;
    
    // 为每个站点添加变更详情
    siteChanges.forEach((siteChange, index) => {
      const { siteName, diff, checkInResult } = siteChange;
      const siteTotal = (diff.added?.length || 0) + (diff.removed?.length || 0); // 只统计新增和删除
      
      htmlContent += `
        <details style="margin-bottom: 20px; border: 1px solid #e8e8e8; border-radius: 8px; overflow: hidden;" ${index === 0 ? 'open' : ''}>
          <summary style="background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%); padding: 15px 20px; cursor: pointer; font-size: 16px; font-weight: 600; color: #333; user-select: none;">
            🎯 ${siteName}
            <span style="float: right; background: #1890ff; color: white; padding: 2px 12px; border-radius: 12px; font-size: 13px; font-weight: normal;">
              ${siteTotal} 项变更
            </span>
          </summary>
          <div style="padding: 20px; background: #fafafa;">
      `;
      
      // 添加签到结果（如果有）
      if (checkInResult) {
        const { checkInSuccess, checkInMessage, checkInQuota } = checkInResult;
        const statusIcon = checkInSuccess ? '✅' : '❌';
        const statusColor = checkInSuccess ? '#52c41a' : '#ff4d4f';
        htmlContent += `
          <div style="background: ${checkInSuccess ? '#f6ffed' : '#fff2f0'}; border: 1px solid ${checkInSuccess ? '#b7eb8f' : '#ffccc7'}; padding: 10px 12px; border-radius: 4px; margin-bottom: 15px;">
            <div style="font-size: 14px; font-weight: 600; color: ${statusColor}; margin-bottom: 4px;">${statusIcon} 签到: ${checkInMessage || (checkInSuccess ? '成功' : '失败')}</div>
            ${checkInQuota ? `<div style="font-size: 13px; color: #666;">获得额度: ${checkInQuota}</div>` : ''}
          </div>
        `;
      }
      
      // 新增模型
      if (diff.added && diff.added.length > 0) {
        htmlContent += `
          <div style="margin-bottom: 20px;">
            <h3 style="color: #52c41a; margin: 0 0 10px 0; font-size: 15px; display: flex; align-items: center; gap: 8px;">
              <span style="background: #52c41a; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 14px;">➕</span>
              新增模型 (${diff.added.length})
            </h3>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        `;
        diff.added.slice(0, 20).forEach(model => {
          htmlContent += `<span style="background: #f6ffed; border: 1px solid #b7eb8f; color: #389e0d; padding: 4px 12px; border-radius: 16px; font-size: 13px; font-family: monospace;">${model.id}</span>`;
        });
        if (diff.added.length > 20) {
          htmlContent += `<span style="color: #666; font-size: 13px; padding: 4px 12px;">... 还有 ${diff.added.length - 20} 个</span>`;
        }
        htmlContent += `</div></div>`;
      }
      
      // 移除模型
      if (diff.removed && diff.removed.length > 0) {
        htmlContent += `
          <div style="margin-bottom: 20px;">
            <h3 style="color: #ff4d4f; margin: 0 0 10px 0; font-size: 15px; display: flex; align-items: center; gap: 8px;">
              <span style="background: #ff4d4f; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 14px;">➖</span>
              移除模型 (${diff.removed.length})
            </h3>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        `;
        diff.removed.slice(0, 20).forEach(model => {
          htmlContent += `<span style="background: #fff2f0; border: 1px solid #ffccc7; color: #cf1322; padding: 4px 12px; border-radius: 16px; font-size: 13px; font-family: monospace;">${model.id}</span>`;
        });
        if (diff.removed.length > 20) {
          htmlContent += `<span style="color: #666; font-size: 13px; padding: 4px 12px;">... 还有 ${diff.removed.length - 20} 个</span>`;
        }
      htmlContent += `</div></div>`;
      }
      
      htmlContent += `</div></details>`;
    });
    
    // 添加失败站点部分
    if (failedSites.length > 0) {
      htmlContent += `
        <div style="margin-top: 30px; padding: 20px; background: #fff2f0; border: 2px solid #ffccc7; border-radius: 8px;">
          <h2 style="color: #cf1322; margin: 0 0 15px 0; font-size: 18px; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">⚠️</span>
            检测失败的站点 (${failedSites.length})
          </h2>
          <p style="margin: 0 0 15px 0; color: #8c8c8c; font-size: 14px;">
            以下站点在本次检测中出现错误，请检查站点配置或网络连接。
          </p>
      `;
      
      failedSites.forEach((failedSite, index) => {
        htmlContent += `
          <div style="background: white; border-left: 4px solid #ff4d4f; padding: 12px 15px; margin-bottom: ${index < failedSites.length - 1 ? '12px' : '0'}; border-radius: 4px;">
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <span style="background: #ff4d4f; color: white; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; margin-top: 2px;">❌</span>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: #333; font-size: 15px; margin-bottom: 6px;">${failedSite.siteName}</div>
                <div style="color: #8c8c8c; font-size: 13px; font-family: monospace; background: #f5f5f5; padding: 8px 10px; border-radius: 4px; word-break: break-all;">
                  ${failedSite.error}
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      htmlContent += `</div>`;
    }
    
    htmlContent += `
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e8e8e8; color: #999; font-size: 12px; text-align: center;">
            <p style="margin: 0;">本邮件由 AI 模型监测系统自动发送</p>
            <p style="margin: 5px 0 0 0;">🕔 ${new Date().toLocaleString('zh-CN')}</p>
          </div>
        </div>
      </div>
    `;
    
    debugLog('✅ 邮件内容构建完成');
    
    // 准备邮件参数
    let subject = `[AI模型监测] 定时检测报告`;
    if (siteChanges.length > 0 && failedSites.length > 0) {
      subject += ` - ${siteChanges.length}个站点发生变化，${failedSites.length}个站点失败`;
    } else if (siteChanges.length > 0) {
      subject += ` - ${siteChanges.length}个站点发生变化`;
    } else if (failedSites.length > 0) {
      subject += ` - ${failedSites.length}个站点检测失败`;
    }
    
    const emailParams = {
      from: 'AI模型监测 <onboarding@resend.dev>',
      to: emails,
      subject,
      html: htmlContent
    };
    
    debugLog('📧 准备发送邮件:', {
      from: emailParams.from,
      to: emailParams.to,
      subject: emailParams.subject,
      htmlLength: htmlContent.length
    });

    // 发送邮件
    debugLog('🚀 正在调用 Resend API...');
    const result = await resend.emails.send(emailParams);
    
    debugLog('🎉 聚合邮件发送成功！结果:', result);
    const logMsg = failedSites.length > 0 
      ? `聚合邮件发送成功: ${siteChanges.length} 个变更, ${failedSites.length} 个失败 -> ${emails.join(', ')}`
      : `聚合邮件发送成功: ${siteChanges.length} 个站点 -> ${emails.join(', ')}`;
    fastify?.log?.info(logMsg);
    return result;

  } catch (error) {
    debugLog('💥 聚合邮件发送过程出错:', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack?.split('\n').slice(0, 3)
    });
    fastify?.log?.error('聚合邮件通知失败', error);
    console.error('[EMAIL] 聚合邮件最终错误:', error.message);
  } finally {
    debugLog(`=== 聚合邮件通知流程结束 ===`);
  }
}

module.exports = { sendModelChangeNotification, sendAggregatedNotification };
