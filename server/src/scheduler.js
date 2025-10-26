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
      // 有单独配置的站点，不跳过通知，单独发送邮件
      await checkSite(site, fastify, { skipNotification: false });
      fastify?.log?.info({ siteId: site.id, name: site.name }, 'Individual scheduled check done');
    } catch (e) {
      fastify?.log?.warn({ siteId: site.id, name: site.name, err: e.message }, 'Individual scheduled check failed');
    }
  }, { timezone: site.timezone || 'UTC' });
  jobs.set(key, job);
  fastify?.log?.info({ siteId: site.id, name: site.name, cronExp, timezone: site.timezone }, 'Individual schedule task created');
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

  fastify?.log?.info({ cronExp, timezone, interval }, 'Starting global schedule task');

  globalScheduleJob = cron.schedule(cronExp, async () => {
    try {
      fastify?.log?.info('Global schedule task triggered');
      const allSites = await prisma.site.findMany();
      
      // 根据 overrideIndividual 决定是否覆盖单独配置
      const sites = config.overrideIndividual 
        ? allSites  // 覆盖模式：检测所有站点
        : allSites.filter(s => !s.scheduleCron || !s.scheduleCron.trim()); // 只检测没有单独配置的站点
      
      fastify?.log?.info({ 
        totalSites: allSites.length, 
        overrideIndividual: config.overrideIndividual,
        sitesWithCustomSchedule: allSites.length - sites.length,
        sitesToCheck: sites.length 
      }, 'Global task: filtering sites');
      
      if (sites.length === 0) {
        fastify?.log?.info('No sites to check (all have custom schedules)');
        await prisma.scheduleConfig.update({
          where: { id: config.id },
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
          const result = await checkSite(site, fastify, { skipNotification: true });
          
          // 如果有变更，收集起来
          if (result.hasChanges && result.diff) {
            sitesWithChanges.push({
              siteName: result.siteName,
              diff: result.diff
            });
          }
          
          fastify?.log?.info({ siteId: site.id, hasChanges: result.hasChanges }, 'Site check completed');
        } catch (e) {
          fastify?.log?.error({ siteId: site.id, err: e.message }, 'Site check failed');
          // 收集失败的站点信息
          failedSites.push({
            siteName: site.name,
            error: e.message || String(e)
          });
        }
        
        // 等待间隔时间（除了最后一个站点）
        if (i < sites.length - 1) {
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
        }
      }
      
      // 如果有站点发生变更或有失败，发送聚合邮件
      if (sitesWithChanges.length > 0 || failedSites.length > 0) {
        try {
          fastify?.log?.info({ 
            changesCount: sitesWithChanges.length, 
            failedCount: failedSites.length 
          }, 'Sending aggregated notification');
          await sendAggregatedNotification(sitesWithChanges, fastify, failedSites);
        } catch (emailError) {
          fastify?.log?.error({ err: emailError.message }, 'Aggregated notification failed');
        }
      } else {
        fastify?.log?.info('No changes or failures detected, skipping notification');
      }
      
      // 更新最后运行时间
      await prisma.scheduleConfig.update({
        where: { id: config.id },
        data: { lastRun: new Date() }
      });
      
      fastify?.log?.info('Global schedule task completed');
    } catch (e) {
      fastify?.log?.error({ err: e.message }, 'Global schedule task error');
    }
  }, { timezone });
}

module.exports = { scheduleAll, onSiteUpdated, scheduleGlobalTask };
