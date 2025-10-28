const cron = require('node-cron');
const { prisma } = require('./db');
const { checkSite } = require('./run');
const { sendAggregatedNotification } = require('./notifier');

const jobs = new Map();
const DEFAULT_CRON = '0 9 * * *';
let globalScheduleJob = null;

async function scheduleSite(site, fastify) {
  const key = site.id;
  
  // 停止现有任务
  if (jobs.has(key)) {
    jobs.get(key).stop();
    jobs.delete(key);
  }
  
  // 检查全局配置是否启用了覆盖
  const globalConfig = await prisma.scheduleConfig.findFirst();
  if (globalConfig?.enabled && globalConfig.overrideIndividual) {
    fastify?.log?.info({ siteId: site.id, name: site.name }, 'Global override enabled, site will be handled by global task');
    return;
  }
  
  // 只为有单独定时配置的站点创建任务
  if (!site.scheduleCron || !site.scheduleCron.trim()) {
    fastify?.log?.info({ siteId: site.id, name: site.name }, 'Site has no custom schedule, will be handled by global task');
    return;
  }
  
  const cronExp = site.scheduleCron;
  const job = cron.schedule(cronExp, async () => {
    try {
      // 重新从数据库获取最新的站点信息，避免使用过期的配置
      const latestSite = await prisma.site.findUnique({ where: { id: site.id } });
      if (!latestSite) {
        fastify?.log?.warn({ siteId: site.id }, 'Site not found, skipping scheduled check');
        return;
      }
      // 有单独配置的站点，不跳过通知，单独发送邮件
      await checkSite(latestSite, fastify, { skipNotification: false, isManual: false });
      fastify?.log?.info({ siteId: latestSite.id, name: latestSite.name }, 'Individual scheduled check done');
    } catch (e) {
      fastify?.log?.warn({ siteId: site.id, name: site.name, err: e.message }, 'Individual scheduled check failed');
    }
  }, { 
    timezone: site.timezone || 'UTC',
    scheduled: true  // 确保任务被启动
  });
  
  // 显式启动任务
  job.start();
  
  jobs.set(key, job);
  fastify?.log?.info({ siteId: site.id, name: site.name, cronExp, timezone: site.timezone }, 'Individual schedule task created and started');
}

async function scheduleAll(fastify) {
  const sites = await prisma.site.findMany();
  for (const s of sites) {
    await scheduleSite(s, fastify);
  }
}

function stopAllIndividualJobs(fastify) {
  const count = jobs.size;
  for (const [key, job] of jobs.entries()) {
    job.stop();
    jobs.delete(key);
  }
  fastify?.log?.info({ count }, 'Stopped all individual site jobs');
  return count;
}

function onSiteUpdated(site, fastify) {
  scheduleSite(site, fastify);
}

// 全局定时任务：按配置的时间检测所有没有单独定时配置的站点
// 有单独配置的站点会由 scheduleSite 函数单独调度，并单独发送邮件通知
async function scheduleGlobalTask(config, fastify) {
  // 停止现有的全局任务
  if (globalScheduleJob) {
    globalScheduleJob.stop();
    globalScheduleJob = null;
  }

  if (!config || !config.enabled) {
    fastify?.log?.info('Global schedule task disabled, rescheduling individual site jobs');
    // 全局任务禁用时，重新为有单独配置的站点创建任务
    const allSites = await prisma.site.findMany();
    for (const site of allSites) {
      await scheduleSite(site, fastify);
    }
    return;
  }
  
  // 处理覆盖模式：停止所有单独任务
  if (config.overrideIndividual) {
    fastify?.log?.info('Override mode enabled, stopping all individual site jobs');
    stopAllIndividualJobs(fastify);
  } else {
    // 非覆盖模式：重新为有单独配置的站点创建任务
    fastify?.log?.info('Non-override mode, rescheduling individual site jobs');
    const allSites = await prisma.site.findMany();
    for (const site of allSites) {
      await scheduleSite(site, fastify);
    }
  }

  const { hour, minute, timezone = 'Asia/Shanghai', interval = 30 } = config;
  const cronExp = `${minute} ${hour} * * *`;
  const configId = config.id;

  fastify?.log?.info({ cronExp, timezone, interval }, 'Starting global schedule task');

  globalScheduleJob = cron.schedule(cronExp, async () => {
    try {
      fastify?.log?.info('Global schedule task triggered');
      
      // 重新从数据库获取最新的全局配置，避免使用过期的配置
      const latestConfig = await prisma.scheduleConfig.findUnique({ where: { id: configId } });
      if (!latestConfig || !latestConfig.enabled) {
        fastify?.log?.info('Global schedule task is disabled, skipping');
        return;
      }
      
      const allSites = await prisma.site.findMany();
      
      // 根据最新的 overrideIndividual 决定是否覆盖单独配置
      const sites = latestConfig.overrideIndividual 
        ? allSites  // 覆盖模式：检测所有站点
        : allSites.filter(s => !s.scheduleCron || !s.scheduleCron.trim()); // 只检测没有单独配置的站点
      
      fastify?.log?.info({ 
        totalSites: allSites.length, 
        overrideIndividual: latestConfig.overrideIndividual,
        sitesWithCustomSchedule: allSites.length - sites.length,
        sitesToCheck: sites.length 
      }, 'Global task: filtering sites');
      
      if (sites.length === 0) {
        fastify?.log?.info('No sites to check (all have custom schedules)');
        await prisma.scheduleConfig.update({
          where: { id: latestConfig.id },
          data: { lastRun: new Date() }
        });
        return;
      }
      
      // 收集所有站点的变更和失败信息
      const sitesWithChanges = [];
      const failedSites = [];
      
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        try {
          fastify?.log?.info({ siteId: site.id, name: site.name }, `Checking site ${i + 1}/${sites.length}`);
          
          // 使用 skipNotification 参数跳过单站点邮件通知
          const result = await checkSite(site, fastify, { skipNotification: true, isManual: false });
          
          // 收集需要发送邮件通知的站点：
          // 1. 有模型变更（无论是否开启签到）
          // 2. 有签到结果（开启签到后，每次都发送）
          if (result.hasChanges || result.checkInResult) {
            sitesWithChanges.push({
              siteName: result.siteName,
              diff: result.hasChanges ? result.diff : null,
              checkInResult: result.checkInResult
            });
            
            const reasons = [];
            if (result.hasChanges) reasons.push('模型变更');
            if (result.checkInResult) reasons.push('签到结果');
            
            fastify?.log?.info({ 
              siteId: site.id,
              siteName: result.siteName,
              hasModelChanges: result.hasChanges,
              hasCheckInResult: !!result.checkInResult,
              reasons: reasons.join(' + ')
            }, `✅ 站点已添加到通知列表: ${reasons.join(' + ')}`);
          } else {
            fastify?.log?.info({ 
              siteId: site.id,
              siteName: result.siteName
            }, '⭕ 站点无变更且无签到，跳过通知');
          }
          
          fastify?.log?.info({ 
            siteId: site.id, 
            hasChanges: result.hasChanges,
            checkInChanged: result.checkInChanged 
          }, 'Site check completed');
        } catch (e) {
          fastify?.log?.error({ siteId: site.id, err: e.message }, 'Site check failed');
          // 收集失败的站点信息
          failedSites.push({
            siteName: site.name,
            error: e.message || String(e)
          });
        }
        
        // 等待间隔时间（除了最后一个站点），使用最新的interval配置
        if (i < sites.length - 1) {
          await new Promise(resolve => setTimeout(resolve, latestConfig.interval * 1000));
        }
      }
      
      // 如果有站点发生变更（模型或签到）或有失败，发送聚合邮件
      console.log(`\n[SCHEDULER] ========== 邮件发送检查 ==========`);
      console.log(`[SCHEDULER] 有变更/签到的站点数: ${sitesWithChanges.length}`);
      console.log(`[SCHEDULER] 失败站点数: ${failedSites.length}`);
      
      if (sitesWithChanges.length > 0) {
        console.log(`[SCHEDULER] 站点列表详情:`);
        sitesWithChanges.forEach((sc, idx) => {
          console.log(`  ${idx + 1}. ${sc.siteName}:`);
          console.log(`     - 模型变更: ${sc.diff ? '是' : '否'}`);
          console.log(`     - 签到结果: ${sc.checkInResult ? '是' : '否'}`);
          if (sc.checkInResult) {
            console.log(`       签到状态: ${sc.checkInResult.checkInSuccess ? '成功' : '失败'}`);
            console.log(`       签到消息: ${sc.checkInResult.checkInMessage}`);
          }
        });
      }
      
      if (sitesWithChanges.length > 0 || failedSites.length > 0) {
        try {
          console.log(`[SCHEDULER] 准备发送聚合邮件通知...`);
          fastify?.log?.info({ 
            sitesWithChangesCount: sitesWithChanges.length,
            failedCount: failedSites.length 
          }, 'Sending aggregated notification');
          await sendAggregatedNotification(sitesWithChanges, fastify, failedSites);
          console.log(`[SCHEDULER] ✅ 邮件发送完成`);
        } catch (emailError) {
          console.error(`[SCHEDULER] ❌ 邮件发送失败:`, emailError);
          fastify?.log?.error({ err: emailError.message }, 'Aggregated notification failed');
        }
      } else {
        console.log(`[SCHEDULER] ⭕ 没有需要通知的站点，跳过邮件发送`);
        fastify?.log?.info('No changes or failures detected, skipping notification');
      }
      console.log(`[SCHEDULER] ==========================================\n`);
      
      // 更新最后运行时间
      await prisma.scheduleConfig.update({
        where: { id: latestConfig.id },
        data: { lastRun: new Date() }
      });
      
      fastify?.log?.info('Global schedule task completed');
    } catch (e) {
      fastify?.log?.error({ err: e.message }, 'Global schedule task error');
    }
  }, { 
    timezone,
    scheduled: true  // 确保任务被启动
  });
  
  // 显式启动全局任务
  globalScheduleJob.start();
  
  fastify?.log?.info({ cronExp, timezone }, 'Global schedule task created and started');
}

module.exports = { scheduleAll, onSiteUpdated, scheduleGlobalTask };
