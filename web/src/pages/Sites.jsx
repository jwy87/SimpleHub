import { useEffect, useState, memo, useCallback } from 'react'
import { Button, Card, Form, Input, Modal, Space, Table, Tag, message, InputNumber, Typography, Popconfirm, TimePicker, Switch, Tooltip, Progress, Select, Collapse, Divider } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { PlusOutlined, EyeOutlined, ThunderboltOutlined, ClockCircleOutlined, GlobalOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, BugOutlined, MailOutlined, CheckCircleOutlined, PushpinOutlined, PushpinFilled, StopOutlined, DownOutlined, RightOutlined, SearchOutlined, FolderOutlined, AppstoreAddOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

// 添加金光闪闪动画样式
const shimmerStyle = document.createElement('style');
shimmerStyle.textContent = `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
document.head.appendChild(shimmerStyle);

function authHeaders(includeJson = false) {
  const t = localStorage.getItem('token');
  const h = { 'Authorization': `Bearer ${t}` };
  if (includeJson) h['Content-Type'] = 'application/json';
  return h;
}

export default function Sites() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingSite, setEditingSite] = useState(null)
  const [form] = Form.useForm()
  const [timeOpen, setTimeOpen] = useState(false)
  const [timeForm] = Form.useForm()
  const [timeSite, setTimeSite] = useState(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugData, setDebugData] = useState(null)
  const [debugLoading, setDebugLoading] = useState(false)
  const [emailConfigOpen, setEmailConfigOpen] = useState(false)
  const [emailConfigForm] = Form.useForm()
  const [emailConfigData, setEmailConfigData] = useState(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleForm] = Form.useForm()
  const [scheduleConfig, setScheduleConfig] = useState({ enabled: false, hour: 9, minute: 0, interval: 30 })
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = localStorage.getItem('sitesCurrentPage')
    return saved ? parseInt(saved, 10) : 1
  })
  const [batchChecking, setBatchChecking] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentSite: '' })
  const [batchResultOpen, setBatchResultOpen] = useState(false)
  const [batchResults, setBatchResults] = useState({ changes: [], failures: [], timestamp: null, totalSites: 0 })
  const [expandedSites, setExpandedSites] = useState(new Set())
  const [hasLastResult, setHasLastResult] = useState(false)
  const [billingConfigExpanded, setBillingConfigExpanded] = useState(false)
  
  const [searchKeyword, setSearchKeyword] = useState('')
  const [categories, setCategories] = useState([])
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryForm] = Form.useForm()
  const [editingCategory, setEditingCategory] = useState(null)
  const [categoryCheckingId, setCategoryCheckingId] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    const saved = sessionStorage.getItem('sitesCollapsedGroups')
    if (saved) {
      try {
        return new Set(JSON.parse(saved))
      } catch (e) {
        console.error('恢复分类状态失败:', e)
      }
    }
    return new Set(['pinned', 'uncategorized'])
  })
  
  const nav = useNavigate()
  const location = useLocation()

  const load = async (search = '') => {
    setLoading(true)
    try {
      const url = search ? `/api/sites?search=${encodeURIComponent(search)}` : '/api/sites'
      const res = await fetch(url, { headers: authHeaders() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '加载站点列表失败')
      }
      const data = await res.json()
      setList(data)
    } catch (e) {
      message.error(e.message || '加载站点列表失败')
    } finally { setLoading(false) }
  }

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/categories', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
        const saved = sessionStorage.getItem('sitesCollapsedGroups')
        if (!saved) {
          setCollapsedGroups(new Set(['pinned', 'uncategorized', ...data.map(c => c.id)]))
        }
      }
    } catch (e) {
      console.error('加载分类失败:', e)
    }
  }

  const toggleGroupCollapse = (groupId) => {
    const newCollapsed = new Set(collapsedGroups)
    if (newCollapsed.has(groupId)) {
      newCollapsed.delete(groupId)
    } else {
      newCollapsed.add(groupId)
    }
    setCollapsedGroups(newCollapsed)
  }

  const loadScheduleConfig = async () => {
    try {
      const res = await fetch('/api/schedule-config', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.ok) setScheduleConfig(data.config)
      }
    } catch (e) {
      console.error('加载定时配置失败:', e)
    }
  }

  useEffect(() => {
    const initData = async () => {
      // 检查是否需要恢复滚动位置
      const savedScrollPos = sessionStorage.getItem('sitesScrollPosition')
      const needRestore = !!savedScrollPos
      
      // 加载数据
      await Promise.all([
        load(searchKeyword),
        loadCategories(),
        loadEmailConfig(),
        loadScheduleConfig()
      ])
      
      checkLastBatchResult()
      
      // 立即恢复滚动位置，无需延迟
      if (needRestore && savedScrollPos) {
        const scrollY = parseInt(savedScrollPos, 10)
        // 使用 requestIdleCallback 或 requestAnimationFrame 确保在下一帧执行
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => {
            window.scrollTo(0, scrollY)
            sessionStorage.removeItem('sitesScrollPosition')
          }, { timeout: 100 })
        } else {
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollY)
            sessionStorage.removeItem('sitesScrollPosition')
          })
        }
      }
    }
    
    initData()
  }, [location])

  const handleSearch = (value) => {
    setSearchKeyword(value)
    load(value)
  }

  const openCategoryModal = (category = null) => {
    setEditingCategory(category)
    if (category) {
      // 编辑模式
      let cnHour = undefined, cnMinute = undefined
      if (category.scheduleCron && category.timezone === 'Asia/Shanghai') {
        const parts = String(category.scheduleCron).trim().split(/\s+/)
        if (parts.length >= 2) {
          cnMinute = Number(parts[0])
          cnHour = Number(parts[1])
        }
      }
      categoryForm.setFieldsValue({
        name: category.name,
        cnHour,
        cnMinute
      })
    } else {
      categoryForm.resetFields()
    }
    setCategoryModalOpen(true)
  }

  const saveCategoryHandler = async () => {
    try {
      const v = await categoryForm.validateFields()
      
      // 处理定时计划
      let scheduleCron = null
      let timezone = 'Asia/Shanghai'
      if (v.cnHour !== undefined && v.cnMinute !== undefined && v.cnHour !== null && v.cnMinute !== null) {
        const h = Math.max(0, Math.min(23, Number(v.cnHour)))
        const m = Math.max(0, Math.min(59, Number(v.cnMinute)))
        scheduleCron = `${m} ${h} * * *`
      }

      const data = { name: v.name, scheduleCron, timezone }

      if (editingCategory) {
        // 更新分类
        const res = await fetch(`/api/categories/${editingCategory.id}`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify(data)
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || '更新分类失败')
        }
        message.success('分类更新成功')
      } else {
        // 创建分类
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(data)
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || '创建分类失败')
        }
        message.success('分类创建成功')
      }

      setCategoryModalOpen(false)
      setEditingCategory(null)
      categoryForm.resetFields()
      await loadCategories()
    } catch (e) {
      message.error(e.message || '保存失败')
    }
  }

  const deleteCategory = async (categoryId) => {
    try {
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || '删除分类失败')
      }
      message.success('分类删除成功')
      await loadCategories()
      await load(searchKeyword)
    } catch (e) {
      message.error(e.message || '删除失败')
    }
  }

  const checkCategory = async (categoryId, categoryName) => {
    if (categoryCheckingId) {
      message.warning('正在检测中，请稍候...')
      return
    }

    setCategoryCheckingId(categoryId)
    const hide = message.loading(`正在检测分类 "${categoryName}" 下的站点...`, 0)
    
    try {
      const res = await fetch(`/api/categories/${categoryId}/check?skipNotification=true`, {
        method: 'POST',
        headers: authHeaders()
      })
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        throw new Error(data.error || '检测失败')
      }

      hide()
      setCategoryCheckingId(null)

      // 显示结果
      const results = data.results || { changes: [], failures: [], totalSites: 0 }
      setBatchResults({
        ...results,
        timestamp: new Date().toISOString()
      })
      setExpandedSites(new Set())
      setBatchResultOpen(true)

      await load(searchKeyword)

      if (results.changes.length === 0 && results.failures.length === 0) {
        message.success('检测完成，所有站点无变更')
      } else {
        message.success('检测完成！')
      }
    } catch (e) {
      hide()
      setCategoryCheckingId(null)
      message.error(e.message || '检测失败')
    }
  }

  // 一键检测指定分组（置顶、未分类等）
  const checkGroup = async (groupType, groupName) => {
    if (categoryCheckingId) {
      message.warning('正在检测中，请稍候...')
      return
    }

    let sitesToCheck = []
    if (groupType === 'pinned') {
      sitesToCheck = list.filter(s => s.pinned && !s.excludeFromBatch)
    } else if (groupType === 'uncategorized') {
      sitesToCheck = list.filter(s => !s.categoryId && !s.pinned && !s.excludeFromBatch)
    }

    if (sitesToCheck.length === 0) {
      message.warning(`${groupName}下没有可检测的站点`)
      return
    }

    setCategoryCheckingId(groupType)
    const hide = message.loading(`正在检测${groupName}下的 ${sitesToCheck.length} 个站点...`, 0)

    const results = {
      changes: [],
      failures: [],
      totalSites: sitesToCheck.length
    }

    try {
      // 依次检测每个站点（5秒间隔）
      for (let i = 0; i < sitesToCheck.length; i++) {
        const site = sitesToCheck[i]
        try {
          const res = await fetch(`/api/sites/${site.id}/check?skipNotification=true`, {
            method: 'POST',
            headers: authHeaders()
          })
          const data = await res.json().catch(() => ({}))
          
          if (!res.ok) {
            results.failures.push({
              siteName: site.name,
              error: data.error || '检测失败'
            })
          } else if (data.hasChanges && data.diff) {
            results.changes.push({
              siteName: site.name,
              diff: data.diff
            })
          }
        } catch (e) {
          results.failures.push({
            siteName: site.name,
            error: e.message || '网络错误'
          })
        }

        // 如果不是最后一个站点，等待5秒
        if (i < sitesToCheck.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }

      hide()
      setCategoryCheckingId(null)

      // 显示结果
      setBatchResults({
        ...results,
        timestamp: new Date().toISOString()
      })
      setExpandedSites(new Set())
      setBatchResultOpen(true)

      await load(searchKeyword)

      if (results.changes.length === 0 && results.failures.length === 0) {
        message.success('检测完成，所有站点无变更')
      } else {
        message.success('检测完成！')
      }
    } catch (e) {
      hide()
      setCategoryCheckingId(null)
      message.error(e.message || '检测失败')
    }
  }

  const checkLastBatchResult = () => {
    try {
      const saved = localStorage.getItem('lastBatchCheckResult')
      setHasLastResult(!!saved)
    } catch (e) {
      setHasLastResult(false)
    }
  }

  const loadLastBatchResult = () => {
    try {
      const saved = localStorage.getItem('lastBatchCheckResult')
      if (saved) {
        const results = JSON.parse(saved)
        setBatchResults(results)
        setExpandedSites(new Set())
        setBatchResultOpen(true)
      } else {
        message.info('没有历史检测结果')
      }
    } catch (e) {
      message.error('加载历史结果失败')
    }
  }

  const loadEmailConfig = async () => {
    try {
      const res = await fetch('/api/email-config', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setEmailConfigData(data)
      }
    } catch (e) {
      console.error('Failed to load email config:', e)
    }
  }

  const openEmailConfigModal = () => {
    if (emailConfigData) {
      emailConfigForm.setFieldsValue({
        resendApiKey: '',
        notifyEmails: emailConfigData.notifyEmails || ''
      })
    }
    setEmailConfigOpen(true)
  }

  const saveEmailConfig = async () => {
    try {
      const v = await emailConfigForm.validateFields()

      const res = await fetch('/api/email-config', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          resendApiKey: v.resendApiKey,
          notifyEmails: v.notifyEmails,
          enabled: true
        })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '保存失败')
      }

      setEmailConfigOpen(false)
      emailConfigForm.resetFields()
      await loadEmailConfig()
      message.success('邮件通知配置成功')
    } catch (e) {
      message.error(e.message || '保存失败，请重试')
    }
  }

  const onAdd = async () => {
    try {
      const v = await form.validateFields()
      if (v.cnHour !== undefined && v.cnMinute !== undefined && v.cnHour !== null && v.cnMinute !== null) {
        const h = Math.max(0, Math.min(23, Number(v.cnHour)))
        const m = Math.max(0, Math.min(59, Number(v.cnMinute)))
        v.scheduleCron = `${m} ${h} * * *`
        v.timezone = 'Asia/Shanghai'
      }
      delete v.cnHour; delete v.cnMinute
      if (!v.apiType) v.apiType = 'other'
      if (v.enableCheckIn && !v.checkInMode) v.checkInMode = 'both'

      const res = await fetch('/api/sites', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(v) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '创建站点失败')
      }
      setOpen(false); form.resetFields(); await load(); message.success('站点创建成功')
    } catch (e) {
      message.error(e.message || '创建站点失败')
    }
  }

  const openEditModal = (site) => {
    setEditMode(true)
    setEditingSite(site)

    let cnHour = undefined, cnMinute = undefined
    if (site.scheduleCron && site.timezone === 'Asia/Shanghai') {
      const parts = String(site.scheduleCron).trim().split(/\s+/)
      if (parts.length >= 2) {
        cnMinute = Number(parts[0])
        cnHour = Number(parts[1])
      }
    }

    form.setFieldsValue({
      name: site.name,
      baseUrl: site.baseUrl,
      apiKey: '',
      apiType: site.apiType || 'other',
      userId: site.userId || '',
      cnHour,
      cnMinute,
      pinned: site.pinned || false,
      excludeFromBatch: site.excludeFromBatch || false,
      categoryId: site.categoryId || null,
      unlimitedQuota: site.unlimitedQuota || false,
      billingUrl: site.billingUrl || '',
      billingAuthType: site.billingAuthType || 'token',
      billingAuthValue: '',
      billingLimitField: site.billingLimitField || '',
      billingUsageField: site.billingUsageField || '',
      enableCheckIn: site.enableCheckIn || false,
      checkInMode: site.checkInMode || 'both',
      extralink: site.extralink || '',
      remark: site.remark || ''
    })
    setOpen(true)
  }

  const onEdit = async () => {
    try {
      const v = await form.validateFields()

      const updateData = {
        name: v.name,
        baseUrl: v.baseUrl,
        apiType: v.apiType || 'other',
        userId: v.userId || null,
        pinned: v.pinned || false,
        excludeFromBatch: v.excludeFromBatch || false,
        categoryId: v.categoryId || null,
        unlimitedQuota: v.unlimitedQuota || false,
        billingUrl: v.billingUrl || null,
        billingAuthType: v.billingAuthType || 'token',
        billingAuthValue: v.billingAuthValue || null,
        billingLimitField: v.billingLimitField || null,
        billingUsageField: v.billingUsageField || null,
        enableCheckIn: v.enableCheckIn || false,
        extralink: v.extralink || null,
        remark: v.remark || null
      }
      
      if (v.enableCheckIn && v.checkInMode) {
        updateData.checkInMode = v.checkInMode
      } else if (v.enableCheckIn) {
        updateData.checkInMode = 'both'
      }

      if (v.apiKey && v.apiKey.trim()) {
        updateData.apiKey = v.apiKey
      }

      if (v.cnHour !== undefined && v.cnMinute !== undefined && v.cnHour !== null && v.cnMinute !== null) {
        const h = Math.max(0, Math.min(23, Number(v.cnHour)))
        const m = Math.max(0, Math.min(59, Number(v.cnMinute)))
        updateData.scheduleCron = `${m} ${h} * * *`
        updateData.timezone = 'Asia/Shanghai'
      } else {
        updateData.scheduleCron = null
        updateData.timezone = 'UTC'
      }

      console.log('更新数据:', updateData)

      const res = await fetch(`/api/sites/${editingSite.id}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(updateData)
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '更新站点失败')
      }

      setOpen(false)
      setEditMode(false)
      setEditingSite(null)
      form.resetFields()
      await load()
      message.success('站点更新成功')
    } catch (e) {
      message.error(e.message || '更新站点失败，请检查输入信息')
    }
  }

  const onDelete = async (site) => {
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: 'DELETE',
        headers: authHeaders()
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '删除站点失败')
      }

      await load()
      message.success(`站点"${site.name}"已删除`)
    } catch (e) {
      message.error(e.message || '删除站点失败')
    }
  }

  const deleteUncategorizedSites = async () => {
    try {
      const uncategorizedSites = list.filter(s => !s.categoryId && !s.pinned)
      
      if (uncategorizedSites.length === 0) {
        message.info('没有未分类站点可删除')
        return
      }

      // 批量删除所有未分类站点
      const deletePromises = uncategorizedSites.map(site => 
        fetch(`/api/sites/${site.id}`, {
          method: 'DELETE',
          headers: authHeaders()
        })
      )

      const results = await Promise.allSettled(deletePromises)
      
      // 统计成功和失败的数量
      const successCount = results.filter(r => r.status === 'fulfilled').length
      const failCount = results.length - successCount

      await load()
      
      if (failCount === 0) {
        message.success(`已成功删除 ${successCount} 个未分类站点`)
      } else {
        message.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      }
    } catch (e) {
      message.error(e.message || '批量删除失败')
    }
  }

  const handleModalOk = () => {
    if (editMode) {
      onEdit()
    } else {
      onAdd()
    }
  }

  const handleModalCancel = () => {
    setOpen(false)
    setEditMode(false)
    setEditingSite(null)
    setBillingConfigExpanded(false) // 重置billing配置展开状态
    form.resetFields()
  }

  const onCheck = async (id) => {
    const hide = message.loading('正在检测中...', 0)
    try {
      const res = await fetch(`/api/sites/${id}/check?skipNotification=true`, { method: 'POST', headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || '检测失败')
      hide()
      
      if (data.hasChanges && data.diff) {
        const site = list.find(s => s.id === id)
        const siteName = site?.name || '未知站点'
        
        Modal.info({
          title: '🔄 检测到模型变更',
          width: 600,
          content: (
            <div style={{ marginTop: 16 }}>
              <Typography.Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
                站点：{siteName}
              </Typography.Text>
              
              {data.diff.added && data.diff.added.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text strong style={{ color: '#52c41a' }}>
                    ✅ 新增模型 ({data.diff.added.length}个)：
                  </Typography.Text>
                  <div style={{ marginTop: 4, paddingLeft: 16 }}>
                    {data.diff.added.slice(0, 10).map((model, index) => (
                      <Tag key={index} color="green" style={{ margin: '2px 4px 2px 0' }}>
                        {model.id}
                      </Tag>
                    ))}
                    {data.diff.added.length > 10 && (
                      <Typography.Text type="secondary">
                        ...还有 {data.diff.added.length - 10} 个
                      </Typography.Text>
                    )}
                  </div>
                </div>
              )}
              
              {data.diff.removed && data.diff.removed.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text strong style={{ color: '#ff4d4f' }}>
                    ❌ 移除模型 ({data.diff.removed.length}个)：
                  </Typography.Text>
                  <div style={{ marginTop: 4, paddingLeft: 16 }}>
                    {data.diff.removed.slice(0, 10).map((model, index) => (
                      <Tag key={index} color="red" style={{ margin: '2px 4px 2px 0' }}>
                        {model.id}
                      </Tag>
                    ))}
                    {data.diff.removed.length > 10 && (
                      <Typography.Text type="secondary">
                        ...还有 {data.diff.removed.length - 10} 个
                      </Typography.Text>
                    )}
                  </div>
                </div>
              )}
              
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                💡 点击"查看详情"按钮可查看完整的变更历史
              </Typography.Text>
            </div>
          ),
          okText: '知道了',
          onOk: () => {
            // 可选：自动跳转到站点详情页
            // nav(`/sites/${id}`)
          }
        })
        
        message.success('检测完成，发现模型变更！')
      } else {
        message.success('检测完成，无模型变更')
      }
      
      await load()
    } catch (e) {
      hide()
      message.error(e.message || '检测失败，请检查站点配置')
    }
  }

  const onCheckAllSites = async () => {
    if (list.length === 0) {
      message.warning('没有可检测的站点')
      return
    }

    // 过滤掉excludeFromBatch=true的站点
    const sitesToCheck = list.filter(site => !site.excludeFromBatch)

    if (sitesToCheck.length === 0) {
      message.warning('没有可参与一键检测的站点，所有站点均已排除')
      return
    }

    if (sitesToCheck.length < list.length) {
      message.info(`已排除 ${list.length - sitesToCheck.length} 个站点，将检测 ${sitesToCheck.length} 个站点`)
    }

    setBatchChecking(true)
    setBatchProgress({ current: 0, total: sitesToCheck.length, currentSite: '' })

    const intervalMs = 5000 // 5秒间隔
    const sitesWithChanges = []
    const failedSites = []

    for (let i = 0; i < sitesToCheck.length; i++) {
      const site = sitesToCheck[i]
      setBatchProgress({ current: i + 1, total: list.length, currentSite: site.name })

      try {
        // 添加 skipNotification=true 参数，不发送邮件
        const res = await fetch(`/api/sites/${site.id}/check?skipNotification=true`, {
          method: 'POST',
          headers: authHeaders()
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          failedSites.push({
            siteName: site.name,
            error: data?.error || '未知错误'
          })
        } else if (data.hasChanges && data.diff) {
          // 收集有变更的站点
          sitesWithChanges.push({
            siteName: site.name,
            diff: data.diff
          })
        }
      } catch (e) {
        failedSites.push({
          siteName: site.name,
          error: e.message || '网络错误'
        })
      }

      // 如果不是最后一个站点，等待间隔时间
      if (i < sitesToCheck.length - 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }
    }

    setBatchChecking(false)
    setBatchProgress({ current: 0, total: 0, currentSite: '' })

    // 刷新列表
    await load()

    // 保存结果到 state 和 localStorage
    const results = {
      changes: sitesWithChanges,
      failures: failedSites,
      timestamp: new Date().toISOString(),
      totalSites: sitesToCheck.length
    }
    setBatchResults(results)

    // 保存到 localStorage（只保留最近一次）
    try {
      localStorage.setItem('lastBatchCheckResult', JSON.stringify(results))
      setHasLastResult(true) // 更新按钮显示状态
    } catch (e) {
      console.error('保存检测结果失败:', e)
    }

    setExpandedSites(new Set()) // 重置展开状态
    setBatchResultOpen(true)
  }

  const openTimeModal = (r) => {
    setTimeSite(r)
    let h = undefined, m = undefined
    if (r.scheduleCron && r.timezone === 'Asia/Shanghai') {
      const parts = String(r.scheduleCron).trim().split(/\s+/)
      if (parts.length >= 2) { m = Number(parts[0]); h = Number(parts[1]) }
    }
    timeForm.setFieldsValue({ cnHour: h, cnMinute: m })
    setTimeOpen(true)
  }

  const saveTime = async () => {
    try {
      const v = await timeForm.validateFields()
      if (!timeSite) return

      // 检查是否输入了时间，如果都为空/null则取消定时计划
      const hour = v.cnHour;
      const minute = v.cnMinute;

      if ((hour === undefined || hour === null) && (minute === undefined || minute === null)) {
        // 取消定时计划
        const res = await fetch(`/api/sites/${timeSite.id}`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify({ scheduleCron: null, timezone: 'UTC' })
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || '保存失败')
        }
        setTimeOpen(false); setTimeSite(null); await load(); message.success('已取消定时检测')
      } else if ((hour !== undefined && hour !== null) && (minute !== undefined && minute !== null)) {
        // 设置定时计划
        const cron = hmToCron(hour, minute)
        const res = await fetch(`/api/sites/${timeSite.id}`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify({ scheduleCron: cron, timezone: 'Asia/Shanghai' })
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || '保存失败')
        }
        setTimeOpen(false); setTimeSite(null); await load(); message.success('检测时间设置成功')
      } else {
        message.error('请输入完整的时间（小时和分钟）或留空取消定时检测')
      }
    } catch (e) {
      message.error(e.message || '保存失败，请重试')
    }
  }

  const openDebugModal = useCallback(async (site) => {
    setDebugOpen(true)
    setDebugLoading(true)
    setDebugData(null)

    try {
      const res = await fetch(`/api/sites/${site.id}/latest-snapshot`, { headers: authHeaders() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '获取快照失败')
      }
      const data = await res.json()
      setDebugData({ ...data, siteName: site.name, siteUrl: site.baseUrl })
    } catch (e) {
      message.error(e.message || '获取请求详情失败')
      setDebugOpen(false)
    } finally {
      setDebugLoading(false)
    }
  }, [])

  const columns = [
    {
      title: <span style={{ fontSize: 15, fontWeight: 600 }}>名称</span>,
      dataIndex: 'name',
      width: 200,
      render: (text, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tooltip title={record.baseUrl} placement="topLeft">
              <Typography.Link
                href={record.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                strong
                style={{ fontSize: 15, color: '#40a9ff' }}
              >
                {text}
              </Typography.Link>
            </Tooltip>
            {record.pinned && (
              <Tooltip title="已置顶">
                <PushpinFilled style={{ color: '#fa8c16', fontSize: 13 }} />
              </Tooltip>
            )}
            {record.excludeFromBatch && (
              <Tooltip title="不参与一键检测">
                <span style={{ fontSize: 14, cursor: 'help' }}>🚫</span>
              </Tooltip>
            )}
          </div>
          {record.extralink && (
            <Typography.Link
              href={record.extralink}
              target="_blank"
              rel="noopener noreferrer"
              type="secondary"
              style={{ fontSize: 11 }}
            >
              {record.extralink}
            </Typography.Link>
          )}
        </div>
      )
    },
    {
      title: <span style={{ fontSize: 15, fontWeight: 600 }}>用量</span>,
      width: 200,
      align: 'center',
      render: (_, record) => {
        const { billingLimit, billingUsage, billingError, unlimitedQuota } = record;

        // 无限余额站点
        if (unlimitedQuota) {
          return <Tooltip title="此站点标记为无限余额">
            <div style={{
              display: 'inline-block',
              padding: '4px 8px',
              borderRadius: 6,
              background: 'linear-gradient(45deg, #ffd700, #ffed4e, #ffd700, #ffed4e)',
              backgroundSize: '200% 200%',
              animation: 'shimmer 2s ease-in-out infinite',
              border: '1px solid #ffd700',
              fontSize: 11,
              fontWeight: 600,
              color: '#b8860b',
              cursor: 'help'
            }}>
              ♾️ 无限余额
            </div>
          </Tooltip>;
        }

        if (billingError) {
          return <Tooltip title={billingError}>
            <Tag color="default" style={{ fontSize: 11, margin: 0, color: '#999', borderColor: '#d9d9d9' }}>无法获取</Tag>
          </Tooltip>;
        }

        if (typeof billingLimit === 'number' && typeof billingUsage === 'number') {
          const remaining = billingLimit - billingUsage;
          const percentage = (billingUsage / billingLimit) * 100;
          let color = '#52c41a';
          let bgColor = '#f6ffed';
          let barColor = '#52c41a';
          if (percentage > 90) {
            color = '#ff4d4f';
            bgColor = '#fff2f0';
            barColor = '#ff4d4f';
          } else if (percentage > 70) {
            color = '#fa8c16';
            bgColor = '#fff7e6';
            barColor = '#fa8c16';
          }

          return <Tooltip title={`总额: $${billingLimit.toFixed(2)} | 已用: $${billingUsage.toFixed(1)} | 剩余: $${remaining.toFixed(2)} (${(100 - percentage).toFixed(1)}%)`}>
            <div style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: bgColor,
              border: `1px solid ${color}20`,
              cursor: 'help'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>剩余</span>
                <span style={{ fontSize: 14, fontWeight: 700, color }}>${remaining.toFixed(2)}</span>
              </div>
              <div style={{
                height: 4,
                backgroundColor: '#f0f0f0',
                borderRadius: 2,
                overflow: 'hidden',
                marginBottom: 4
              }}>
                <div style={{
                  height: '100%',
                  width: `${100 - percentage}%`,
                  backgroundColor: barColor,
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#999' }}>
                <span>已用 ${billingUsage.toFixed(1)}</span>
                <span>总额 ${billingLimit.toFixed(2)}</span>
              </div>
            </div>
          </Tooltip>;
        }

        if (typeof billingLimit === 'number') {
          return <Tooltip title="总额度">
            <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>💳 ${billingLimit.toFixed(2)}</Tag>
          </Tooltip>;
        }

        if (typeof billingUsage === 'number') {
          return <Tooltip title="已使用">
            <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>📈 ${billingUsage.toFixed(1)}</Tag>
          </Tooltip>;
        }

        return <Typography.Text type="secondary" style={{ fontSize: 11 }}>-</Typography.Text>;
      }
    },
    {
      title: <span style={{ fontSize: 15, fontWeight: 600 }}>签到</span>,
      width: 80,
      align: 'center',
      render: (_, record) => {
        const { apiType, enableCheckIn, checkInSuccess, checkInMessage, checkInError } = record;

        // 只有Veloera类型才显示签到状态
        if (apiType !== 'veloera') {
          return <Tooltip title="此站点类型不支持签到">
            <span style={{ fontSize: 32, color: '#d9d9d9', cursor: 'help', fontWeight: 'bold', lineHeight: 1 }}>●</span>
          </Tooltip>;
        }

        // 未启用签到
        if (!enableCheckIn) {
          return <Tooltip title="未启用签到">
            <span style={{ fontSize: 32, color: '#d9d9d9', cursor: 'help', fontWeight: 'bold', lineHeight: 1 }}>●</span>
          </Tooltip>;
        }

        // 签到成功
        if (checkInSuccess === true) {
          return <Tooltip title={`签到成功: ${checkInMessage || '成功'}`}>
            <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a', cursor: 'help' }} />
          </Tooltip>;
        }

        // 签到失败
        if (checkInSuccess === false) {
          return <Tooltip title={`签到失败: ${checkInError || checkInMessage || '失败'}`}>
            <span style={{ fontSize: 32, color: '#ff4d4f', cursor: 'help', fontWeight: 'bold', lineHeight: 1 }}>✖</span>
          </Tooltip>;
        }

        // 已启用但暂无签到记录
        return <Tooltip title="已启用签到，暂无签到记录">
          <span style={{ fontSize: 32, color: '#faad14', cursor: 'help', fontWeight: 'bold', lineHeight: 1 }}>●</span>
        </Tooltip>;
      }
    },
    {
      title: <span style={{ fontSize: 15, fontWeight: 600 }}>定时计划</span>,
      width: 250,
      align: 'center',
      render: (_, r) => {
        // 检查全局是否启用了覆盖模式
        if (scheduleConfig?.enabled && scheduleConfig.overrideIndividual) {
          const h = String(scheduleConfig.hour).padStart(2, '0')
          const m = String(scheduleConfig.minute).padStart(2, '0')
          return <Tooltip title="全局配置已启用覆盖模式，此站点的单独配置被忽略，使用全局配置">
            <Tag color="orange" icon={<ClockCircleOutlined />} style={{ fontSize: 14, cursor: 'help' }}>
              全局覆盖 北京时间 <b>{h}:{m}</b>
            </Tag>
          </Tooltip>
        }

        // 优先显示站点单独配置（单独调度，单独通知）
        if (r.scheduleCron && r.scheduleCron.trim()) {
          if (r.timezone === 'Asia/Shanghai') {
            return <Tooltip title="此站点有单独的定时配置，会单独调度、单独发送邮件通知">
              <Tag color="blue" icon={<ClockCircleOutlined />} style={{ fontSize: 14, cursor: 'help' }}>
                单独 北京时间 <b>{cronToHm(r.scheduleCron)}</b>
              </Tag>
            </Tooltip>
          }
          return <Tooltip title="此站点有单独的定时配置，会单独调度、单独发送邮件通知">
            <Space><Tag color="blue" style={{ fontSize: 13, cursor: 'help' }}>单独配置</Tag><Tag style={{ fontSize: 13 }}>{r.scheduleCron}</Tag><Tag color="default" style={{ fontSize: 13 }}>{r.timezone || 'UTC'}</Tag></Space>
          </Tooltip>
        }
        // 没有单独配置，显示全局配置（聚合通知）
        if (scheduleConfig?.enabled) {
          const h = String(scheduleConfig.hour).padStart(2, '0')
          const m = String(scheduleConfig.minute).padStart(2, '0')
          return <Tooltip title="此站点使用全局定时配置，会与其他站点一起检测、聚合发送邮件通知">
            <Tag color="cyan" icon={<ClockCircleOutlined />} style={{ fontSize: 14, cursor: 'help' }}>
              全局 北京时间 <b>{h}:{m}</b>
            </Tag>
          </Tooltip>
        }
        // 都没有配置
        return <Tag color="default" style={{ fontSize: 13 }}>未配置定时检测</Tag>
      }
    },
    {
      title: <span style={{ fontSize: 15, fontWeight: 600 }}>上次检测</span>,
      dataIndex: 'lastCheckedAt',
      width: 180,
      align: 'center',
      render: v => v
        ? <Typography.Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{new Date(v).toLocaleString('zh-CN')}</Typography.Text>
        : <Typography.Text type="secondary" style={{ fontSize: 13 }}>未检测</Typography.Text>
    },
    {
      title: <span style={{ fontSize: 15, fontWeight: 600 }}>备注</span>,
      dataIndex: 'remark',
      width: 220,
      align: 'center',
      render: (text) => text ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {text}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>-</Typography.Text>
      )
    },
    {
      title: <span style={{ fontSize: 15, fontWeight: 600 }}>操作</span>,
      key: 'actions',
      width: 240,
      align: 'center',
      render: (_, r) => (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3, auto)', gap: '2px 2px' }}>
            <Tooltip title="查看详情">
              <Button
                type="primary"
                className="hover-lift"
                icon={<EyeOutlined />}
                onClick={() => {
                  localStorage.setItem('sitesCurrentPage', currentPage)
                  sessionStorage.setItem('sitesScrollPosition', window.scrollY.toString())
                  sessionStorage.setItem('sitesCollapsedGroups', JSON.stringify([...collapsedGroups]))
                  nav(`/sites/${r.id}`)
                }}
                size="middle"
              />
            </Tooltip>
            <Tooltip title="立即检测">
              <Button
                type="default"
                className="hover-lift"
                icon={<ThunderboltOutlined />}
                onClick={() => onCheck(r.id)}
                size="middle"
                style={{ color: '#52c41a', fontWeight: 600, borderColor: '#52c41a' }}
              />
            </Tooltip>
            <Tooltip title="请求详情">
              <Button
                type="default"
                icon={<BugOutlined />}
                onClick={() => openDebugModal(r)}
                size="middle"
                style={{ color: '#fa8c16', borderColor: '#fa8c16' }}
              />
            </Tooltip>
            <Tooltip title="设置时间">
              <Button
                type="default"
                icon={<ClockCircleOutlined />}
                onClick={() => openTimeModal(r)}
                size="middle"
              />
            </Tooltip>
            <Tooltip title="编辑">
              <Button
                type="default"
                icon={<EditOutlined />}
                onClick={() => openEditModal(r)}
                size="middle"
                style={{ color: '#1890ff', borderColor: '#1890ff' }}
              />
            </Tooltip>
            <Popconfirm
              title="删除站点"
              description={
                <div style={{ maxWidth: 300 }}>
                  <p>确定要删除站点 <strong>{r.name}</strong> 吗？</p>
                  <p style={{ color: '#ff4d4f', marginTop: 8 }}>
                    删除后将清除所有历史检测数据，此操作不可恢复！
                  </p>
                </div>
              }
              onConfirm={() => onDelete(r)}
              okText="确定删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
            >
              <Tooltip title="删除">
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  size="middle"
                />
              </Tooltip>
            </Popconfirm>
          </div>
        </div>
      )
    }
  ]

  return (
    <Card
      title={<Typography.Title level={3} style={{ margin: 0 }}>站点管理</Typography.Title>}
      extra={
        <Space size={10} wrap>
          <Input.Search
            placeholder="搜索站点名称、链接或模型ID..."
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            onSearch={handleSearch}
            onChange={(e) => {
              if (!e.target.value) handleSearch('')
            }}
            style={{ width: 320 }}
          />
          <Button
            icon={<AppstoreAddOutlined />}
            size="large"
            onClick={() => openCategoryModal()}
            style={{
              background: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
              border: 'none',
              height: 40,
              fontSize: 14,
              fontWeight: 600,
              color: 'white'
            }}
          >
            分类管理
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setOpen(true)}
            className="hover-lift"
            style={{
              height: 40,
              fontSize: 14,
              fontWeight: 600
            }}
          >
            新增站点
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            size="large"
            onClick={onCheckAllSites}
            loading={batchChecking}
            disabled={batchChecking || list.length === 0}
            style={{
              background: batchChecking ? '#f0f0f0' : 'linear-gradient(135deg, #fa8c16 0%, #fa541c 100%)',
              border: 'none',
              height: 40,
              fontSize: 14,
              fontWeight: 600,
              color: batchChecking ? '#999' : 'white'
            }}
          >
            {batchChecking ? '检测中...' : '一键检测'}
          </Button>
          {hasLastResult && (
            <Button
              icon={<EyeOutlined />}
              size="large"
              onClick={loadLastBatchResult}
              disabled={batchChecking}
              style={{
                background: '#f0f0f0',
                border: '1px solid #d9d9d9',
                height: 40,
                fontSize: 14,
                fontWeight: 600,
                color: '#666'
              }}
            >
              查看结果
            </Button>
          )}
          <Button
            icon={<MailOutlined />}
            size="large"
            onClick={openEmailConfigModal}
            style={{
              background: emailConfigData?.enabled ? 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)' : '#f0f0f0',
              border: 'none',
              height: 40,
              fontSize: 14,
              fontWeight: 600,
              color: emailConfigData?.enabled ? 'white' : '#666'
            }}
          >
            邮件通知
          </Button>
          <Button
            icon={<ClockCircleOutlined />}
            size="large"
            onClick={() => {
              // 初始化表单
              if (scheduleConfig) {
                scheduleForm.setFieldsValue({
                  enabled: scheduleConfig.enabled || false,
                  time: dayjs().hour(scheduleConfig.hour || 9).minute(scheduleConfig.minute || 0),
                  interval: scheduleConfig.interval || 30,
                  overrideIndividual: scheduleConfig.overrideIndividual || false
                })
              } else {
                scheduleForm.setFieldsValue({
                  enabled: false,
                  time: dayjs().hour(9).minute(0),
                  interval: 30,
                  overrideIndividual: false
                })
              }
              setScheduleOpen(true)
            }}
            style={{
              background: scheduleConfig?.enabled ? 'linear-gradient(135deg, #1890ff 0%, #0050b3 100%)' : '#f0f0f0',
              border: 'none',
              height: 40,
              fontSize: 14,
              fontWeight: 600,
              color: scheduleConfig?.enabled ? 'white' : '#666'
            }}
          >
            定时检测
          </Button>
        </Space>
      }
      style={{
        borderRadius: 16,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        background: '#fff'
      }}
      bodyStyle={{ padding: '24px' }}
    >

      {batchChecking && (
        <div style={{
          marginBottom: 16,
          padding: 16,
          background: '#fff7e6',
          border: '1px solid #ffd591',
          borderRadius: 8
        }}>
          <Typography.Text strong style={{ fontSize: 15, color: '#fa8c16', display: 'block', marginBottom: 12 }}>
            🔄 正在依次检测所有站点（每个站点间隔 5 秒）...
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
            当前进度：{batchProgress.current} / {batchProgress.total}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            正在检测：{batchProgress.currentSite}
          </Typography.Text>
          <Progress
            percent={Math.round((batchProgress.current / batchProgress.total) * 100)}
            status="active"
            strokeColor={{
              '0%': '#fa8c16',
              '100%': '#fa541c',
            }}
          />
        </div>
      )}

      {/* 如果有搜索关键词，显示普通表格 */}
      {searchKeyword ? (
        <>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            搜索结果：找到 {list.length} 个站点
          </Typography.Text>
          <Table
            rowKey="id"
            dataSource={list}
            columns={columns}
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 个站点`
            }}
            style={{ marginTop: 8 }}
          />
        </>
      ) : (
        /* 按分类分组显示 */
        <>
          {/* 置顶站点 */}
          {list.filter(s => s.pinned).length > 0 && (
            <div style={{ marginBottom: 24 }} className="fade-in">
              <div 
                style={{
                  background: 'linear-gradient(135deg, #fa8c16 0%, #fa541c 100%)',
                  padding: '14px 20px',
                  borderRadius: collapsedGroups.has('pinned') ? '12px' : '12px 12px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 16px rgba(250, 140, 22, 0.3)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(250, 140, 22, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(250, 140, 22, 0.3)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-50%',
                  right: '-10%',
                  width: '150px',
                  height: '150px',
                  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%)',
                  borderRadius: '50%',
                  pointerEvents: 'none'
                }} />
                <Space onClick={() => toggleGroupCollapse('pinned')} style={{ cursor: 'pointer', flex: 1 }}>
                  {collapsedGroups.has('pinned') ? 
                    <RightOutlined style={{ color: 'white', fontSize: 12 }} /> : 
                    <DownOutlined style={{ color: 'white', fontSize: 12 }} />
                  }
                  <PushpinFilled style={{ color: 'white', fontSize: 16 }} />
                  <Typography.Text strong style={{ color: 'white', fontSize: 16 }}>
                    置顶站点
                  </Typography.Text>
                  <Tag color="orange" style={{ margin: 0 }}>
                    {list.filter(s => s.pinned).length} 个
                  </Tag>
                </Space>
                <Space onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={categoryCheckingId === 'pinned'}
                    disabled={categoryCheckingId !== null}
                    onClick={(e) => {
                      e.stopPropagation()
                      checkGroup('pinned', '置顶站点')
                    }}
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.2)',
                      color: 'white', 
                      borderColor: 'rgba(255, 255, 255, 0.6)',
                      fontWeight: 600
                    }}
                  >
                    一键检测
                  </Button>
                </Space>
              </div>
              {!collapsedGroups.has('pinned') && (
                <Table
                  rowKey="id"
                  dataSource={list.filter(s => s.pinned)}
                  columns={columns}
                  loading={loading}
                  pagination={false}
                  style={{ borderRadius: '0 0 8px 8px' }}
                />
              )}
            </div>
          )}

          {/* 各分类 */}
          {categories.map((category, index) => {
            const categorySites = list.filter(s => s.categoryId === category.id && !s.pinned)
            if (categorySites.length === 0) return null
            const isCollapsed = collapsedGroups.has(category.id)

            return (
              <div 
                key={category.id} 
                className="fade-in"
                style={{ marginBottom: 24, animationDelay: `${index * 0.1}s` }}
              >
                <div style={{
                  background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                  padding: '14px 20px',
                  borderRadius: isCollapsed ? '12px' : '12px 12px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 16px rgba(24, 144, 255, 0.3)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(24, 144, 255, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(24, 144, 255, 0.3)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-50%',
                  right: '-10%',
                  width: '150px',
                  height: '150px',
                  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%)',
                  borderRadius: '50%',
                  pointerEvents: 'none'
                }} />
                  <Space onClick={() => toggleGroupCollapse(category.id)} style={{ cursor: 'pointer', flex: 1 }}>
                    {isCollapsed ? 
                      <RightOutlined style={{ color: 'white', fontSize: 12 }} /> : 
                      <DownOutlined style={{ color: 'white', fontSize: 12 }} />
                    }
                    <FolderOutlined style={{ color: 'white', fontSize: 16 }} />
                    <Typography.Text strong style={{ color: 'white', fontSize: 16 }}>
                      {category.name}
                    </Typography.Text>
                    <Tag color="cyan" style={{ margin: 0 }}>
                      {categorySites.length} 个
                    </Tag>
                    {category.scheduleCron && (
                      <Tag icon={<ClockCircleOutlined />} color="blue" style={{ margin: 0 }}>
                        {cronToHm(category.scheduleCron)}
                      </Tag>
                    )}
                  </Space>
                  <Space onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={categoryCheckingId === category.id}
                      disabled={categoryCheckingId !== null}
                      onClick={(e) => {
                        e.stopPropagation()
                        checkCategory(category.id, category.name)
                      }}
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: 'white', 
                        borderColor: 'rgba(255, 255, 255, 0.6)',
                        fontWeight: 600
                      }}
                    >
                      一键检测
                    </Button>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        openCategoryModal(category)
                      }}
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: 'white', 
                        borderColor: 'rgba(255, 255, 255, 0.6)',
                        fontWeight: 600
                      }}
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="确定删除该分类吗？"
                      description="该分类下的站点将变为未分类"
                      onConfirm={() => deleteCategory(category.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                        style={{ 
                          background: 'rgba(255, 77, 79, 0.8)',
                          color: 'white', 
                          borderColor: 'rgba(255, 255, 255, 0.6)',
                          fontWeight: 600
                        }}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>
                {!isCollapsed && (
                  <Table
                    rowKey="id"
                    dataSource={categorySites}
                    columns={columns}
                    loading={loading}
                    pagination={false}
                    style={{ borderRadius: '0 0 8px 8px' }}
                  />
                )}
              </div>
            )
          })}

          {/* 未分类站点 */}
          {list.filter(s => !s.categoryId && !s.pinned).length > 0 && (
            <div style={{ marginBottom: 24 }} className="fade-in">
              <div 
                style={{
                  background: 'linear-gradient(135deg, #8c8c8c 0%, #595959 100%)',
                  padding: '14px 20px',
                  borderRadius: collapsedGroups.has('uncategorized') ? '12px' : '12px 12px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 16px rgba(140, 140, 140, 0.3)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(140, 140, 140, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(140, 140, 140, 0.3)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-50%',
                  right: '-10%',
                  width: '150px',
                  height: '150px',
                  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.10) 0%, transparent 70%)',
                  borderRadius: '50%',
                  pointerEvents: 'none'
                }} />
                <Space onClick={() => toggleGroupCollapse('uncategorized')} style={{ cursor: 'pointer', flex: 1 }}>
                  {collapsedGroups.has('uncategorized') ? 
                    <RightOutlined style={{ color: 'white', fontSize: 12 }} /> : 
                    <DownOutlined style={{ color: 'white', fontSize: 12 }} />
                  }
                  <FolderOutlined style={{ color: 'white', fontSize: 16 }} />
                  <Typography.Text strong style={{ color: 'white', fontSize: 16 }}>
                    未分类
                  </Typography.Text>
                  <Tag color="default" style={{ margin: 0 }}>
                    {list.filter(s => !s.categoryId && !s.pinned).length} 个
                  </Tag>
                </Space>
                <Space onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={categoryCheckingId === 'uncategorized'}
                    disabled={categoryCheckingId !== null}
                    onClick={(e) => {
                      e.stopPropagation()
                      checkGroup('uncategorized', '未分类')
                    }}
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.2)',
                      color: 'white', 
                      borderColor: 'rgba(255, 255, 255, 0.6)',
                      fontWeight: 600
                    }}
                  >
                    一键检测
                  </Button>
                  <Popconfirm
                    title={<span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 16 }}>⚠️ 危险操作：删除所有未分类站点</span>}
                    description={
                      <div style={{ maxWidth: 350 }}>
                        <p style={{ marginBottom: 12 }}>
                          你即将删除 <strong style={{ color: '#ff4d4f', fontSize: 16 }}>{list.filter(s => !s.categoryId && !s.pinned).length} 个</strong> 未分类站点
                        </p>
                        <div style={{ 
                          background: '#fff1f0', 
                          border: '1px solid #ffccc7', 
                          borderRadius: 6,
                          padding: 12,
                          marginBottom: 12
                        }}>
                          <p style={{ color: '#cf1322', fontWeight: 600, margin: 0, marginBottom: 8 }}>
                            🚨 重要提示：
                          </p>
                          <ul style={{ margin: 0, paddingLeft: 20, color: '#cf1322' }}>
                            <li>这将<strong>永久删除</strong>所有未分类站点</li>
                            <li>包括站点的<strong>所有历史检测数据</strong></li>
                            <li><strong>此操作不可恢复！</strong></li>
                          </ul>
                        </div>
                        <p style={{ 
                          color: '#8c8c8c', 
                          fontSize: 12,
                          margin: 0,
                          padding: 8,
                          background: '#f5f5f5',
                          borderRadius: 4
                        }}>
                          💡 注意：其他分类的"删除"是删除分类本身，站点会归入未分类。而这里是直接删除站点！
                        </p>
                      </div>
                    }
                    onConfirm={deleteUncategorizedSites}
                    okText="确认删除所有站点"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        background: 'rgba(255, 77, 79, 0.8)',
                        color: 'white', 
                        borderColor: 'rgba(255, 255, 255, 0.6)',
                        fontWeight: 600
                      }}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
              {!collapsedGroups.has('uncategorized') && (
                <Table
                  rowKey="id"
                  dataSource={list.filter(s => !s.categoryId && !s.pinned)}
                  columns={columns}
                  loading={loading}
                  pagination={false}
                  style={{ borderRadius: '0 0 8px 8px' }}
                />
              )}
            </div>
          )}
        </>
      )}

      {open && (
        <Modal
          open={open}
          onCancel={handleModalCancel}
          onOk={handleModalOk}
          title={
            <Typography.Title level={4} style={{ margin: 0 }}>
              {editMode ? '编辑站点' : '新增监控站点'}
            </Typography.Title>
          }
          okText={editMode ? '保存修改' : '创建站点'}
          cancelText="取消"
          width={560}
          destroyOnClose
          okButtonProps={{
            type: 'primary',
            style: {
              height: 40,
              fontSize: 15
            }
          }}
        >
          <Form layout="vertical" form={form} size="large" style={{ marginTop: 24 }}>
            <Form.Item
              name="name"
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>站点名称</span>}
              rules={[{ required: true, message: '请输入站点名称' }]}
            >
              <Input
                placeholder="例如：我的AI中转站"
                style={{ borderRadius: 8, fontSize: 15 }}
              />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>接口地址 (Base URL)</span>}
              rules={[
                { required: true, message: '请输入接口地址' },
                { type: 'url', message: '请输入有效的URL地址' }
              ]}
            >
              <Input
                prefix={<GlobalOutlined style={{ color: '#bbb' }} />}
                placeholder="https://api.yourrelay.com"
                style={{ borderRadius: 8, fontSize: 15 }}
              />
            </Form.Item>
            <Form.Item
              name="apiType"
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>API 类型</span>}
              rules={[{ required: true, message: '请选择API类型' }]}
              initialValue="other"
            >
              <Select
                placeholder="选择API类型"
                style={{ borderRadius: 8, fontSize: 15 }}
                options={[
                  { value: 'newapi', label: 'New API' },
                  { value: 'veloera', label: 'Veloera' },
                  { value: 'donehub', label: 'DoneHub' },
                  { value: 'voapi', label: 'VOAPI' },
                  { value: 'other', label: '其他 (OpenAI标准)' }
                ]}
              />
            </Form.Item>
            <Form.Item
              name="apiKey"
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>API 密钥/系统访问令牌</span>}
              rules={[{ required: !editMode, message: '请输入API密钥' }]}
              extra={editMode ? '留空表示不修改密钥' : ''}
            >
              <Input.Password
                placeholder={editMode ? '留空表示不修改密钥' : '请输入Bearer Token或系统访问令牌'}
                style={{ borderRadius: 8, fontSize: 15 }}
              />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) => prev.apiType !== curr.apiType}
            >
              {({ getFieldValue }) => {
                const apiType = getFieldValue('apiType')
                const needsUserId = apiType === 'newapi' || apiType === 'veloera'
                const needsJwtToken = apiType === 'voapi'
                
                if (needsUserId) {
                  return (
                    <Form.Item
                      name="userId"
                      label={<span style={{ fontSize: 15, fontWeight: 500 }}>用户 ID</span>}
                      rules={[{ required: true, message: '请输入用户ID' }]}
                      extra={`用于 ${apiType === 'newapi' ? 'New API' : 'Veloera'} 鉴权的用户ID`}
                    >
                      <Input
                        placeholder="例如：1"
                        style={{ borderRadius: 8, fontSize: 15 }}
                      />
                    </Form.Item>
                  )
                } else if (needsJwtToken) {
                  return (
                    <Form.Item
                      name="billingAuthValue"
                      label={<span style={{ fontSize: 15, fontWeight: 500 }}>JWT Token</span>}
                      rules={[{ required: true, message: '请输入JWT Token' }]}
                      extra="用于获取VOAPI用量信息的JWT认证令牌"
                    >
                      <Input.Password
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        style={{ borderRadius: 8, fontSize: 15 }}
                      />
                    </Form.Item>
                  )
                }
                return null
              }}
            </Form.Item>

            {/* Billing配置 - 仅对"other"类型显示 */}
            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) => prev.apiType !== curr.apiType}
            >
              {({ getFieldValue }) => {
                const apiType = getFieldValue('apiType')
                const showBillingConfig = apiType === 'other'
                return showBillingConfig ? (
                  <div style={{
                    padding: 16,
                    background: '#f8f9fa',
                    borderRadius: 8,
                    border: '1px solid #e9ecef',
                    marginBottom: 16
                  }}>
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        cursor: 'pointer', 
                        marginBottom: 12 
                      }}
                      onClick={() => setBillingConfigExpanded(!billingConfigExpanded)}
                    >
                      {billingConfigExpanded ? 
                        <DownOutlined style={{ fontSize: 12, color: '#495057', marginRight: 8 }} /> : 
                        <RightOutlined style={{ fontSize: 12, color: '#495057', marginRight: 8 }} />
                      }
                      <Typography.Text strong style={{ fontSize: 15, color: '#495057' }}>
                        自定义用量查询配置（可选）
                      </Typography.Text>
                    </div>
                    {billingConfigExpanded && (
                      <>
                        <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
                          配置自定义的用量查询接口，支持Token或Cookie认证，并可指定JSON字段映射
                        </Typography.Text>

                    <Form.Item
                      name="billingUrl"
                      label={<span style={{ fontSize: 14, fontWeight: 500 }}>用量查询URL</span>}
                      rules={[{ type: 'url', message: '请输入有效的URL地址' }]}
                      style={{ marginBottom: 12 }}
                    >
                      <Input
                        placeholder="https://api.example.com/user/info"
                        style={{ borderRadius: 6, fontSize: 14 }}
                      />
                    </Form.Item>

                    <Form.Item
                      name="billingAuthType"
                      label={<span style={{ fontSize: 14, fontWeight: 500 }}>认证方式</span>}
                      initialValue="token"
                      style={{ marginBottom: 12 }}
                    >
                      <Select
                        style={{ borderRadius: 6, fontSize: 14 }}
                        options={[
                          { value: 'token', label: 'Token 认证' },
                          { value: 'cookie', label: 'Cookie 认证' }
                        ]}
                      />
                    </Form.Item>

                    <Form.Item
                      noStyle
                      shouldUpdate={(prev, curr) => prev.billingAuthType !== curr.billingAuthType}
                    >
                      {({ getFieldValue }) => {
                        const authType = getFieldValue('billingAuthType')
                        return (
                          <Form.Item
                            name="billingAuthValue"
                            label={<span style={{ fontSize: 14, fontWeight: 500 }}>
                              {authType === 'token' ? 'Authentication Token' : 'Cookie Value'}
                            </span>}
                            extra={authType === 'token'
                              ? '输入Bearer token或API key，系统会自动添加Bearer前缀'
                              : '输入完整的Cookie字符串，例如：session=abc123; auth=xyz789'
                            }
                            style={{ marginBottom: 0 }}
                          >
                            <Input.Password
                              placeholder={authType === 'token'
                                ? 'sk-1234567890abcdef...'
                                : 'session=abc123; auth=xyz789'
                              }
                              style={{ borderRadius: 6, fontSize: 14 }}
                            />
                          </Form.Item>
                        )
                      }}
                    </Form.Item>
                    
                    <Typography.Text strong style={{ fontSize: 14, color: '#495057', display: 'block', marginTop: 16, marginBottom: 12 }}>
                      JSON字段映射（可选）
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                      指定响应JSON中的字段名，支持嵌套字段如 "data.balance"
                    </Typography.Text>
                    
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Form.Item
                        name="billingLimitField"
                        label={<span style={{ fontSize: 13, fontWeight: 500 }}>余额字段名</span>}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Input
                          placeholder="data.balance"
                          style={{ borderRadius: 6, fontSize: 13 }}
                        />
                      </Form.Item>
                      
                      <Form.Item
                        name="billingUsageField"
                        label={<span style={{ fontSize: 13, fontWeight: 500 }}>使用量字段名</span>}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Input
                          placeholder="data.used"
                          style={{ borderRadius: 6, fontSize: 13 }}
                        />
                      </Form.Item>
                    </div>
                      </>
                    )}
                  </div>
                ) : null
              }}
            </Form.Item>

            <Form.Item
              name="categoryId"
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>所属分类（可选）</span>}
              extra="将站点归类便于管理，置顶站点不受分类影响"
            >
              <Select
                placeholder="选择分类（不选表示无分类）"
                style={{ borderRadius: 8, fontSize: 15 }}
                allowClear
                options={[
                  ...categories.map(cat => ({ value: cat.id, label: cat.name }))
                ]}
              />
            </Form.Item>

            <Form.Item
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>定时检测（可选）</span>}
              extra="设置每日自动检测的北京时间，不设置则使用系统默认计划"
            >
              <Space size={12} align="center">
                <Form.Item name="cnHour" noStyle>
                  <InputNumber
                    min={0}
                    max={23}
                    placeholder="小时 (0-23)"
                    style={{ width: 140, borderRadius: 8, fontSize: 15 }}
                  />
                </Form.Item>
                <Typography.Text strong style={{ fontSize: 18 }}>:</Typography.Text>
                <Form.Item name="cnMinute" noStyle>
                  <InputNumber
                    min={0}
                    max={59}
                    placeholder="分钟 (0-59)"
                    style={{ width: 140, borderRadius: 8, fontSize: 15 }}
                  />
                </Form.Item>
              </Space>
            </Form.Item>

            <Form.Item
              name="extralink"
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>附加链接（可选）</span>}
              extra="显示在站点名称下方的附加签到站链接"
            >
              <Input
                placeholder="例如：https://extra.example.com"
                style={{ borderRadius: 8, fontSize: 15 }}
              />
            </Form.Item>

            <Form.Item
              name="remark"
              label={<span style={{ fontSize: 15, fontWeight: 500 }}>备注（可选）</span>}
              extra="显示在操作列前方的备注信息"
            >
              <Input
                placeholder="例如：测试站点"
                style={{ borderRadius: 8, fontSize: 15 }}
              />
            </Form.Item>

            <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
              <Form.Item
                name="pinned"
                valuePropName="checked"
                style={{ marginBottom: 0, flex: 1 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>置顶设置</span>
                  <Switch
                    checkedChildren="已置顶"
                    unCheckedChildren="未置顶"
                  />
                </div>
              </Form.Item>
              <Form.Item
                name="excludeFromBatch"
                valuePropName="checked"
                style={{ marginBottom: 0, flex: 1 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>一键检测</span>
                  <Switch
                    checkedChildren="排除"
                    unCheckedChildren="参与"
                  />
                </div>
              </Form.Item>
              <Form.Item
                name="unlimitedQuota"
                valuePropName="checked"
                style={{ marginBottom: 0, flex: 1 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>余额类型</span>
                  <Switch
                    checkedChildren="无限余额"
                    unCheckedChildren="普通余额"
                  />
                </div>
              </Form.Item>
            </div>
            
            {/* 签到配置 - 仅Veloera类型显示 */}
            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) => prev.apiType !== curr.apiType}
            >
              {({ getFieldValue }) => {
                const apiType = getFieldValue('apiType')
                const showCheckIn = apiType === 'veloera'
                return showCheckIn ? (
                  <>
                    <Divider style={{ margin: '16px 0' }}>签到配置</Divider>
                    <Form.Item
                      name="enableCheckIn"
                      label={<span style={{ fontSize: 15, fontWeight: 500 }}>启用自动签到</span>}
                      valuePropName="checked"
                      extra="仅Veloera类型支持自动签到功能"
                    >
                      <Switch
                        checkedChildren="已启用"
                        unCheckedChildren="未启用"
                      />
                    </Form.Item>
                    <Form.Item
                      noStyle
                      shouldUpdate={(prev, curr) => prev.enableCheckIn !== curr.enableCheckIn}
                    >
                      {({ getFieldValue }) => {
                        const enableCheckIn = getFieldValue('enableCheckIn')
                        return enableCheckIn ? (
                          <Form.Item
                            name="checkInMode"
                            label={<span style={{ fontSize: 15, fontWeight: 500 }}>定时检测模式</span>}
                            extra="手动点击立即检测时始终同时执行签到和模型检测"
                            initialValue="both"
                          >
                            <Select
                              style={{ borderRadius: 8, fontSize: 15 }}
                              options={[
                                { value: 'both', label: '两者都检测（推荐）' },
                                { value: 'model', label: '仅检测模型' },
                                { value: 'checkin', label: '仅执行签到' }
                              ]}
                            />
                          </Form.Item>
                        ) : null
                      }}
                    </Form.Item>
                  </>
                ) : null
              }}
            </Form.Item>
          </Form>
        </Modal>
      )}

      {timeOpen && (
        <Modal
          open={timeOpen}
          onCancel={() => setTimeOpen(false)}
          onOk={saveTime}
          title={<Typography.Title level={4} style={{ margin: 0 }}>设置单独检测时间</Typography.Title>}
          okText="保存设置"
          cancelText="取消"
          width={520}
          destroyOnClose
          okButtonProps={{
            type: 'primary',
            style: {
              height: 40,
              fontSize: 15
            }
          }}
        >
          <div style={{ marginTop: 24 }}>
            <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13 }}>
              <p style={{ margin: '0 0 8px 0', color: '#0050b3' }}>👉 <strong>单独配置说明：</strong></p>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#0050b3' }}>
                <li>此站点将在每天指定时间<strong>单独运行</strong>检测</li>
                <li>不受全局定时配置影响，优先级更高</li>
                <li>检测到变更后会<strong>单独发送邮件通知</strong></li>
                <li><strong>留空两个输入框</strong>可取消定时检测</li>
              </ul>
            </div>
            <Form layout="vertical" form={timeForm} size="large">
              <Space size={16} align="center" style={{ width: '100%', justifyContent: 'center' }}>
                <Form.Item
                  name="cnHour"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber
                    min={0}
                    max={23}
                    placeholder="小时（留空取消）"
                    style={{ width: 140, borderRadius: 8, fontSize: 16 }}
                    controls={false}
                    parser={(value) => value === '' ? null : parseInt(value)}
                    formatter={(value) => value === null || value === undefined ? '' : String(value)}
                  />
                </Form.Item>
                <Typography.Text strong style={{ fontSize: 24 }}>:</Typography.Text>
                <Form.Item
                  name="cnMinute"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber
                    min={0}
                    max={59}
                    placeholder="分钟（留空取消）"
                    style={{ width: 140, borderRadius: 8, fontSize: 16 }}
                    controls={false}
                    parser={(value) => value === '' ? null : parseInt(value)}
                    formatter={(value) => value === null || value === undefined ? '' : String(value)}
                  />
                </Form.Item>
              </Space>
            </Form>
          </div>
        </Modal>
      )}

      {debugOpen && (
        <Modal
          open={debugOpen}
          onCancel={() => setDebugOpen(false)}
          footer={[
            <Button key="close" onClick={() => setDebugOpen(false)}>关闭</Button>
          ]}
          title={<Typography.Title level={4} style={{ margin: 0 }}>🐛 请求详情</Typography.Title>}
          width={800}
          destroyOnClose
        >
          {debugLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Typography.Text>加载中...</Typography.Text>
            </div>
          ) : debugData ? (
            <div style={{ marginTop: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <Typography.Title level={5}>站点信息</Typography.Title>
                <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 13 }}>
                  <p style={{ margin: '4px 0' }}><strong>站点名称：</strong>{debugData.siteName}</p>
                  <p style={{ margin: '4px 0' }}><strong>接口地址：</strong>{debugData.siteUrl}</p>
                  <p style={{ margin: '4px 0' }}><strong>检测时间：</strong>{new Date(debugData.fetchedAt).toLocaleString('zh-CN')}</p>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <Typography.Title level={5}>请求状态</Typography.Title>
                <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 13 }}>
                  <p style={{ margin: '4px 0' }}>
                    <strong>HTTP 状态码：</strong>
                    {debugData.statusCode ? (
                      <Tag color={debugData.statusCode === 200 ? 'success' : 'error'}>
                        {debugData.statusCode}
                      </Tag>
                    ) : (
                      <Tag color="default">无数据</Tag>
                    )}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>响应时间：</strong>
                    {debugData.responseTime ? `${debugData.responseTime}ms` : '无数据'}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>模型数量：</strong>
                    {Array.isArray(debugData.modelsJson) ? debugData.modelsJson.length : 0}
                  </p>
                </div>
              </div>

              {/* Billing 信息 - 总是显示 */}
              <div style={{ marginBottom: 20 }}>
                <Typography.Title level={5}>💳 Billing 信息</Typography.Title>
                <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 13 }}>
                  {(typeof debugData.billingLimit === 'number') && (
                    <p style={{ margin: '4px 0' }}>
                      <strong>额度上限：</strong>
                      <Tag color="blue">${debugData.billingLimit.toFixed(2)}</Tag>
                    </p>
                  )}
                  {(typeof debugData.billingUsage === 'number') && (
                    <p style={{ margin: '4px 0' }}>
                      <strong>已使用：</strong>
                      <Tag color="orange">${debugData.billingUsage.toFixed(1)}</Tag>
                    </p>
                  )}
                  {(typeof debugData.billingLimit === 'number' && typeof debugData.billingUsage === 'number') && (
                    <p style={{ margin: '4px 0' }}>
                      <strong>剩余：</strong>
                      <Tag color="green">${(debugData.billingLimit - debugData.billingUsage).toFixed(2)}</Tag>
                    </p>
                  )}
                  {debugData.billingError && (
                    <p style={{ margin: '4px 0', color: '#ff4d4f' }}>
                      <strong>错误：</strong>{debugData.billingError}
                    </p>
                  )}
                  {(typeof debugData.billingLimit !== 'number' && typeof debugData.billingUsage !== 'number' && !debugData.billingError) && (
                    <p style={{ margin: '4px 0', color: '#8c8c8c' }}>
                      未获取到 Billing 信息（可能是该站点不支持此 API）
                    </p>
                  )}
                </div>
              </div>

              {debugData.errorMessage && (
                <div style={{ marginBottom: 20 }}>
                  <Typography.Title level={5} style={{ color: '#ff4d4f' }}>
                    ❌ 错误信息
                  </Typography.Title>
                  <div style={{
                    background: '#fff2f0',
                    border: '1px solid #ffccc7',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#cf1322',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {debugData.errorMessage}
                  </div>
                </div>
              )}

              {debugData.modelsJson && Array.isArray(debugData.modelsJson) && debugData.modelsJson.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <Typography.Title level={5}>✅ 获取到的模型列表 ({debugData.modelsJson.length})</Typography.Title>
                  <div style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 8,
                    maxHeight: 200,
                    overflow: 'auto'
                  }}>
                    {debugData.modelsJson.map((model, idx) => (
                      <Tag key={idx} style={{ margin: 4 }}>{model.id}</Tag>
                    ))}
                  </div>
                </div>
              )}

              {debugData.rawResponse && (
                <div style={{ marginBottom: 20 }}>
                  <Typography.Title level={5}>📄 原始响应</Typography.Title>
                  <Input.TextArea
                    value={debugData.rawResponse}
                    rows={10}
                    readOnly
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      background: '#f5f5f5'
                    }}
                  />
                  <Button
                    size="small"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      navigator.clipboard.writeText(debugData.rawResponse)
                      message.success('已复制到剪贴板')
                    }}
                  >
                    复制原始响应
                  </Button>
                </div>
              )}

              {!debugData.errorMessage && (!debugData.modelsJson || debugData.modelsJson.length === 0) && (
                <div style={{
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#d48806'
                }}>
                  ⚠️ 未获取到任何模型数据，请检查 API 密钥是否正确，或查看原始响应了解详情。
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Typography.Text type="secondary">暂无数据</Typography.Text>
            </div>
          )}
        </Modal>
      )}

      {emailConfigOpen && (
        <Modal
          open={emailConfigOpen}
          onCancel={() => { setEmailConfigOpen(false); emailConfigForm.resetFields() }}
          onOk={saveEmailConfig}
          title={<Typography.Title level={4} style={{ margin: 0 }}>📧 全局邮件通知配置</Typography.Title>}
          okText="保存配置"
          cancelText="取消"
          width={600}
          destroyOnClose
          okButtonProps={{
            style: {
              background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
              border: 'none',
              height: 40,
              fontSize: 15
            }
          }}
        >
          <div style={{ marginTop: 24 }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 20, fontSize: 14 }}>
              配置全局邮件通知，任何站点检测到模型变更时都会自动发送邮件
            </Typography.Paragraph>

            {emailConfigData?.enabled && (
              <div style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                fontSize: 13,
                color: '#389e0d'
              }}>
                ✅ 邮件通知已启用，当前收件人：{emailConfigData.notifyEmails}
              </div>
            )}

            <Form layout="vertical" form={emailConfigForm} size="large">
              <Form.Item
                name="resendApiKey"
                label={<span style={{ fontSize: 15, fontWeight: 500 }}>Resend API Key</span>}
                rules={[{ required: true, message: '请输入 Resend API Key' }]}
                extra="获取密钥：https://resend.com/api-keys"
              >
                <Input.Password
                  placeholder="re_xxxxxxxxx"
                  style={{ borderRadius: 8, fontSize: 15 }}
                  prefix={<MailOutlined style={{ color: '#bbb' }} />}
                />
              </Form.Item>

              <Form.Item
                name="notifyEmails"
                label={<span style={{ fontSize: 15, fontWeight: 500 }}>收件人邮箱</span>}
                rules={[
                  { required: true, message: '请输入至少一个收件人邮箱' },
                  {
                    validator: (_, value) => {
                      if (!value || !value.trim()) {
                        return Promise.reject(new Error('请输入至少一个收件人邮箱'))
                      }
                      const emails = value.split(',').map(e => e.trim()).filter(Boolean)
                      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                      for (const email of emails) {
                        if (!emailRegex.test(email)) {
                          return Promise.reject(new Error(`邮箱格式不正确：${email}`))
                        }
                      }
                      return Promise.resolve()
                    }
                  }
                ]}
                extra="多个邮箱用英文逗号分隔，例如：user1@example.com,user2@example.com"
              >
                <Input.TextArea
                  placeholder="user@example.com,admin@example.com"
                  rows={3}
                  style={{ borderRadius: 8, fontSize: 15 }}
                />
              </Form.Item>
            </Form>

            <div style={{
              background: '#f0f7ff',
              border: '1px solid #91d5ff',
              borderRadius: 8,
              padding: 16,
              marginTop: 20
            }}>
              <Typography.Title level={5} style={{ margin: 0, marginBottom: 8, color: '#0050b3' }}>
                ℹ️ 功能说明
              </Typography.Title>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666' }}>
                <li>全局配置：所有站点共用一个邮件配置</li>
                <li>智能通知：只有当任何站点检测到模型变更时才发送</li>
                <li>详细内容：邮件包含站点名称、变更详情等信息</li>
                <li>团队协作：支持配置多个收件人邮箱</li>
              </ul>
            </div>
          </div>
        </Modal>
      )}

      {scheduleOpen && (
        <Modal
          title="一键定时检测设置"
          open={scheduleOpen}
          destroyOnClose
          onOk={async () => {
            try {
              const v = await scheduleForm.validateFields()
              const time = dayjs(v.time)
              const res = await fetch('/api/schedule-config', {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({
                  enabled: v.enabled,
                  hour: time.hour(),
                  minute: time.minute(),
                  interval: v.interval,
                  overrideIndividual: v.overrideIndividual || false
                })
              })
              const data = await res.json()
              if (data.ok) {
                message.success('定时配置已保存')
                setScheduleConfig(data.config)
                setScheduleOpen(false)
                scheduleForm.resetFields()
                // 重新加载定时配置和站点列表
                await loadScheduleConfig()
                await load()
              } else {
                message.error(data.error || '保存失败')
              }
            } catch (e) {
              message.error(e.message || '保存失败')
            }
          }}
          onCancel={() => {
            setScheduleOpen(false)
            scheduleForm.resetFields()
          }}
          okText="保存"
          cancelText="取消"
          width={500}
        >
          <Form form={scheduleForm} layout="vertical" style={{ marginTop: 24 }}>
            <Form.Item label="启用定时检测" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
            <Form.Item label="检测时间（北京时间）" name="time" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" showSecond={false} placeholder="选择时间" />
            </Form.Item>
            <Form.Item label="站点间隔时间（秒）" name="interval" rules={[{ required: true, type: 'number', min: 5, max: 300 }]} extra="建议10秒以上以避免服务器过载">
              <InputNumber min={5} max={300} addonAfter="秒" style={{ width: '100%' }} placeholder="30" />
            </Form.Item>
            <Form.Item
              label={
                <span>
                  覆盖单独配置
                  <Tooltip title="勾选后，所有站点都使用全局配置，忽略单独设置的时间">
                    <span style={{ marginLeft: 4, color: '#999', cursor: 'help' }}>❓</span>
                  </Tooltip>
                </span>
              }
              name="overrideIndividual"
              valuePropName="checked"
              extra="勾选后，即使站点有单独定时配置也会被忽略，统一使用全局配置"
            >
              <Switch checkedChildren="覆盖" unCheckedChildren="不覆盖" />
            </Form.Item>
          </Form>
          <div style={{ marginTop: 16, padding: 12, background: '#f0f2ff', borderRadius: 4, fontSize: 12, color: '#666' }}>
            <p style={{ margin: '0 0 8px 0' }}>📋 <strong>全局定时检测说明：</strong></p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li><strong>不覆盖模式</strong>：只检测没有单独配置的站点，有单独配置的站点不受影响，会单独发送邮件</li>
              <li><strong>覆盖模式</strong>：检测所有站点，忽略单独配置，统一使用全局时间</li>
              <li>所有站点检测完毕后，会将所有变更<strong>聚合到一封邮件</strong>中发送</li>
              <li>间隔时间用于防止同时请求多个站点，建议30秒以上</li>
            </ul>
          </div>
        </Modal>
      )}

      {/* 一键检测结果展示 */}
      {batchResultOpen && (
        <Modal
          title={
            <div style={{ fontSize: 20, fontWeight: 600, color: '#333' }}>
              📊 一键检测结果
            </div>
          }
          open={batchResultOpen}
          onCancel={() => setBatchResultOpen(false)}
          maskClosable={false}
          destroyOnClose
          footer={[
            <Button key="close" type="primary" onClick={() => setBatchResultOpen(false)}>
              关闭
            </Button>
          ]}
          width={900}
          style={{ top: 20 }}
        >
          <div style={{ marginTop: 20 }}>
            {/* 汇总信息 */}
            <div style={{
              background: '#e6f7ff',
              borderLeft: '4px solid #1890ff',
              padding: 16,
              marginBottom: 20,
              borderRadius: 4
            }}>
              <p style={{ margin: 0, color: '#0050b3', fontSize: 14 }}>
                <strong>📅 检测时间：</strong>
                {batchResults.timestamp ? new Date(batchResults.timestamp).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')}
              </p>
              <p style={{ margin: '8px 0 0 0', color: '#0050b3', fontSize: 14 }}>
                <strong>🎯 检测站点：</strong>{batchResults.totalSites || list.length} 个
              </p>
              {batchResults.changes.length > 0 && (
                <p style={{ margin: '8px 0 0 0', color: '#0050b3', fontSize: 14 }}>
                  <strong>🔄 发生变更：</strong>{batchResults.changes.length} 个站点
                </p>
              )}
              {batchResults.failures.length > 0 && (
                <p style={{ margin: '8px 0 0 0', color: '#cf1322', fontSize: 14 }}>
                  <strong>⚠️ 检测失败：</strong>{batchResults.failures.length} 个站点
                </p>
              )}
            </div>

            {/* 统计卡片 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <div style={{
                flex: 1,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                padding: 16,
                borderRadius: 8,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a' }}>
                  {batchResults.changes.reduce((sum, s) => sum + (s.diff.added?.length || 0), 0)}
                </div>
                <div style={{ color: '#389e0d', marginTop: 8, fontSize: 14, fontWeight: 600 }}>
                  ➕ 新增模型
                </div>
              </div>
              <div style={{
                flex: 1,
                background: '#fff2f0',
                border: '1px solid #ffccc7',
                padding: 16,
                borderRadius: 8,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 32, fontWeight: 'bold', color: '#ff4d4f' }}>
                  {batchResults.changes.reduce((sum, s) => sum + (s.diff.removed?.length || 0), 0)}
                </div>
                <div style={{ color: '#cf1322', marginTop: 8, fontSize: 14, fontWeight: 600 }}>
                  ➖ 移除模型
                </div>
              </div>
            </div>

            {/* 无变更提示 */}
            {batchResults.changes.length === 0 && batchResults.failures.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: 40,
                color: '#999',
                background: '#fafafa',
                borderRadius: 8
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>所有站点均无变更</div>
              </div>
            )}

            {/* 变更详情 */}
            {batchResults.changes.map((siteChange, idx) => {
              const { siteName, diff } = siteChange
              const isExpanded = expandedSites.has(idx)
              const toggleExpand = () => {
                const newExpanded = new Set(expandedSites)
                if (isExpanded) {
                  newExpanded.delete(idx)
                } else {
                  newExpanded.add(idx)
                }
                setExpandedSites(newExpanded)
              }

              return (
                <div key={idx} style={{
                  marginBottom: 16,
                  border: '1px solid #e8e8e8',
                  borderRadius: 8,
                  overflow: 'hidden'
                }}>
                  <div
                    onClick={toggleExpand}
                    style={{
                      background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)',
                      padding: 12,
                      fontWeight: 600,
                      fontSize: 15,
                      cursor: 'pointer',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>
                      <span style={{ marginRight: 8, fontSize: 14 }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      🎯 {siteName}
                    </span>
                    <span style={{
                      background: '#1890ff',
                      color: 'white',
                      padding: '2px 10px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 'normal'
                    }}>
                      {(diff.added?.length || 0) + (diff.removed?.length || 0)} 项变更
                    </span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: 16, background: '#fafafa' }}>
                      {/* 新增模型 */}
                      {diff.added && diff.added.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{
                            color: '#52c41a',
                            fontWeight: 600,
                            marginBottom: 8,
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                background: '#52c41a',
                                color: 'white',
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12
                              }}>➕</span>
                              新增模型 ({diff.added.length})
                            </div>
                            <Button
                              type="text"
                              size="small"
                              style={{ fontSize: 12, color: '#52c41a', padding: '4px 8px' }}
                              onClick={() => {
                                const names = diff.added.map(m => m.id).join(',')
                                navigator.clipboard.writeText(names)
                                message.success(`已复制 ${diff.added.length} 个模型ID`)
                              }}
                            >
                              复制全部
                            </Button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {diff.added.slice(0, 30).map((model, i) => (
                              <Tag
                                key={i}
                                color="success"
                                style={{
                                  margin: 0,
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                  cursor: 'pointer'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigator.clipboard.writeText(model.id)
                                  message.success(`已复制: ${model.id}`)
                                }}
                              >
                                {model.id}
                              </Tag>
                            ))}
                            {diff.added.length > 30 && (
                              <span style={{ color: '#666', fontSize: 12, padding: '0 8px', alignSelf: 'center' }}>
                                ... 还有 {diff.added.length - 30} 个
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 移除模型 */}
                      {diff.removed && diff.removed.length > 0 && (
                        <div>
                          <div style={{
                            color: '#ff4d4f',
                            fontWeight: 600,
                            marginBottom: 8,
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                background: '#ff4d4f',
                                color: 'white',
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12
                              }}>➖</span>
                              移除模型 ({diff.removed.length})
                            </div>
                            <Button
                              type="text"
                              size="small"
                              style={{ fontSize: 12, color: '#ff4d4f', padding: '4px 8px' }}
                              onClick={() => {
                                const names = diff.removed.map(m => m.id).join(',')
                                navigator.clipboard.writeText(names)
                                message.success(`已复制 ${diff.removed.length} 个模型ID`)
                              }}
                            >
                              复制全部
                            </Button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {diff.removed.slice(0, 30).map((model, i) => (
                              <Tag
                                key={i}
                                color="error"
                                style={{
                                  margin: 0,
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                  cursor: 'pointer'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigator.clipboard.writeText(model.id)
                                  message.success(`已复制: ${model.id}`)
                                }}
                              >
                                {model.id}
                              </Tag>
                            ))}
                            {diff.removed.length > 30 && (
                              <span style={{ color: '#666', fontSize: 12, padding: '0 8px', alignSelf: 'center' }}>
                                ... 还有 {diff.removed.length - 30} 个
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* 失败站点 */}
            {batchResults.failures.length > 0 && (
              <div style={{
                marginTop: 20,
                padding: 16,
                background: '#fff2f0',
                border: '2px solid #ffccc7',
                borderRadius: 8
              }}>
                <div style={{
                  color: '#cf1322',
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span style={{ fontSize: 20 }}>⚠️</span>
                  检测失败的站点 ({batchResults.failures.length})
                </div>
                {batchResults.failures.map((failed, idx) => (
                  <div key={idx} style={{
                    background: 'white',
                    borderLeft: '4px solid #ff4d4f',
                    padding: 12,
                    marginBottom: idx < batchResults.failures.length - 1 ? 12 : 0,
                    borderRadius: 4
                  }}>
                    <div style={{ fontWeight: 600, color: '#333', marginBottom: 6, fontSize: 14 }}>
                      {failed.siteName}
                    </div>
                    <div style={{
                      color: '#8c8c8c',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      background: '#f5f5f5',
                      padding: 8,
                      borderRadius: 4,
                      wordBreak: 'break-all'
                    }}>
                      {failed.error}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 分类管理Modal */}
      {categoryModalOpen && (
        <Modal
          title={
            <Typography.Title level={4} style={{ margin: 0 }}>
              {editingCategory ? '编辑分类' : '创建新分类'}
            </Typography.Title>
          }
          open={categoryModalOpen}
          onCancel={() => {
            setCategoryModalOpen(false)
            setEditingCategory(null)
            categoryForm.resetFields()
          }}
          onOk={saveCategoryHandler}
          okText={editingCategory ? '保存修改' : '创建分类'}
          cancelText="取消"
          width={600}
          destroyOnClose
          okButtonProps={{
            type: 'primary',
            style: {
              height: 40,
              fontSize: 15
            }
          }}
        >
          <div style={{ marginTop: 24 }}>
            {!editingCategory && (
              <div style={{
                background: '#e6fffb',
                border: '1px solid #87e8de',
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                fontSize: 13
              }}>
                <p style={{ margin: '0 0 8px 0', color: '#006d75' }}>
                  💡 <strong>分类功能说明：</strong>
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#006d75' }}>
                  <li>创建分类后，可以在站点编辑页面将站点归类</li>
                  <li>同一分类可以配置统一的检测时间</li>
                  <li>支持对分类内的所有站点进行一键检测</li>
                  <li>置顶站点不参与分类，始终显示在最前面</li>
                </ul>
              </div>
            )}

            <Form layout="vertical" form={categoryForm} size="large">
              <Form.Item
                name="name"
                label={<span style={{ fontSize: 15, fontWeight: 500 }}>分类名称</span>}
                rules={[{ required: true, message: '请输入分类名称' }]}
              >
                <Input
                  placeholder="例如：生产环境、测试环境、个人站点"
                  style={{ borderRadius: 8, fontSize: 15 }}
                  prefix={<FolderOutlined style={{ color: '#bbb' }} />}
                />
              </Form.Item>

              <Form.Item
                label={<span style={{ fontSize: 15, fontWeight: 500 }}>定时检测（可选）</span>}
                extra="设置该分类下所有站点的统一检测时间（北京时间）"
              >
                <Space size={12} align="center">
                  <Form.Item name="cnHour" noStyle>
                    <InputNumber
                      min={0}
                      max={23}
                      placeholder="小时 (0-23)"
                      style={{ width: 140, borderRadius: 8, fontSize: 15 }}
                    />
                  </Form.Item>
                  <Typography.Text strong style={{ fontSize: 18 }}>:</Typography.Text>
                  <Form.Item name="cnMinute" noStyle>
                    <InputNumber
                      min={0}
                      max={59}
                      placeholder="分钟 (0-59)"
                      style={{ width: 140, borderRadius: 8, fontSize: 15 }}
                    />
                  </Form.Item>
                </Space>
              </Form.Item>
            </Form>

            {editingCategory && editingCategory.sites && editingCategory.sites.length > 0 && (
              <div style={{
                background: '#f0f7ff',
                border: '1px solid #91d5ff',
                borderRadius: 8,
                padding: 12,
                marginTop: 16
              }}>
                <Typography.Text strong style={{ color: '#0050b3', fontSize: 13 }}>
                  该分类下有 {editingCategory.sites.length} 个站点
                </Typography.Text>
              </div>
            )}
          </div>
        </Modal>
      )}
    </Card>
  )
}

function cronToHm(cron) {
  // m h * * *
  const parts = String(cron).trim().split(/\s+/)
  if (parts.length < 2) return cron
  const m = parts[0], h = parts[1]
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}`
}
function hmToCron(h, m) {
  const hh = Math.max(0, Math.min(23, Number(h)))
  const mm = Math.max(0, Math.min(59, Number(m)))
  return `${mm} ${hh} * * *`
}
