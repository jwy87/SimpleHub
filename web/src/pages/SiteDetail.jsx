import { useEffect, useState, useMemo, useCallback, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Collapse, List, Space, Tag, Typography, message, Button, Row, Col, Statistic, Empty, Modal, Form, Input, Switch, Select, Table, Popconfirm, InputNumber, DatePicker } from 'antd'
import { 
  ThunderboltOutlined, 
  PlusCircleOutlined, 
  MinusCircleOutlined,
  ClockCircleOutlined,
  ApiOutlined,
  ArrowLeftOutlined,
  CopyOutlined,
  UpOutlined,
  DownOutlined,
  KeyOutlined,
  EditOutlined,
  DeleteOutlined,
  GiftOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

function authHeaders(includeJson = false) {
  const t = localStorage.getItem('token');
  const h = { 'Authorization': `Bearer ${t}` };
  if (includeJson) h['Content-Type'] = 'application/json';
  return h;
}

export default function SiteDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [diffs, setDiffs] = useState([])
  const [snapshot, setSnapshot] = useState([])
  const [loading, setLoading] = useState(false)
  const [modelsExpanded, setModelsExpanded] = useState(true)
  
  // 令牌管理相关状态
  const [tokenModalVisible, setTokenModalVisible] = useState(false)
  const [tokens, setTokens] = useState([])
  const [tokenLoading, setTokenLoading] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingToken, setEditingToken] = useState(null)
  const [groups, setGroups] = useState([])
  const [form] = Form.useForm()
  
  // 兑换码相关状态
  const [redeemModalVisible, setRedeemModalVisible] = useState(false)
  const [redeemCodes, setRedeemCodes] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemResults, setRedeemResults] = useState([])

  const copyToClipboard = useCallback((text, successMsg = '复制成功') => {
    navigator.clipboard.writeText(text).then(() => {
      message.success(successMsg)
    }).catch(() => {
      message.error('复制失败，请手动复制')
    })
  }, [])

  const copyAllModels = useCallback((models) => {
    if (!models || models.length === 0) {
      message.warning('没有可复制的模型')
      return
    }
    const names = models.map(m => m.id).join(',')
    copyToClipboard(names, `已复制 ${models.length} 个模型名称`)
  }, [copyToClipboard])
  
  // 获取令牌列表（通过后端代理）
  const loadTokens = async () => {
    setTokenLoading(true)
    try {
      // 不传递分页参数，让后端直接转发到站点API，避免不同站点分页参数不一致的问题
      const res = await fetch(`/api/sites/${id}/tokens`, { 
        headers: authHeaders() 
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || '获取令牌列表失败')
      }
      const data = await res.json()
      if (data.success && data.data) {
        setTokens(data.data.items || data.data || [])
      } else {
        throw new Error(data.message || '获取令牌列表失败')
      }
    } catch (e) {
      message.error(e.message || '获取令牌列表失败')
      setTokens([])
    } finally {
      setTokenLoading(false)
    }
  }
  
  // 获取分组列表（通过后端代理）
  const loadGroups = async () => {
    try {
      const res = await fetch(`/api/sites/${id}/groups`, { 
        headers: authHeaders() 
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || '获取分组列表失败')
      }
      const data = await res.json()
      if (data.success && data.data) {
        // 只显示从API获取的分组，不添加"用户分组"
        const groupList = Object.keys(data.data).map(key => ({
          value: key,
          label: data.data[key].name || data.data[key].desc || key
        }))
        setGroups(groupList)
        console.log('分组列表加载成功:', groupList)
      } else {
        console.warn('获取分组列表响应格式不正确:', data)
        setGroups([])
      }
    } catch (e) {
      console.error('获取分组列表失败:', e)
      message.error('获取分组列表失败: ' + e.message)
      setGroups([])
    }
  }
  
  // 删除令牌（通过后端代理）
  const deleteToken = async (tokenId) => {
    try {
      const res = await fetch(`/api/sites/${id}/tokens/${tokenId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || '删除令牌失败')
      }
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        loadTokens()
      } else {
        throw new Error(data.message || '删除令牌失败')
      }
    } catch (e) {
      message.error(e.message || '删除令牌失败')
    }
  }
  
  // 修改令牌（通过后端代理）
  const updateToken = async (values) => {
    try {
      // 处理过期时间
      let expiredTime = -1
      if (values.neverExpire) {
        expiredTime = -1
      } else if (values.expiredTime) {
        expiredTime = Math.floor(values.expiredTime.valueOf() / 1000)
      }
      
      // 将特殊标识转换回空字符串
      const groupValue = values.group === '__user_group__' ? '' : values.group
      
      const payload = {
        id: editingToken.id,
        name: values.name,
        group: groupValue,
        expired_time: expiredTime,
        unlimited_quota: values.unlimitedQuota,
        remain_quota: values.unlimitedQuota ? 0 : (values.remainQuota || 0),
        model_limits_enabled: values.modelLimitsEnabled || false,
        model_limits: values.modelLimits || '',
        allow_ips: values.allowIps || ''
      }
      
      const res = await fetch(`/api/sites/${id}/tokens`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || '修改令牌失败')
      }
      const data = await res.json()
      if (data.success) {
        message.success('修改成功')
        setEditModalVisible(false)
        setEditingToken(null)
        form.resetFields()
        loadTokens()
      } else {
        throw new Error(data.message || '修改令牌失败')
      }
    } catch (e) {
      message.error(e.message || '修改令牌失败')
    }
  }
  
  // 打开编辑弹窗
  const openEditModal = async (token) => {
    setEditingToken(token)
    // 如果分组列表为空，先加载分组列表
    let currentGroups = groups
    if (currentGroups.length === 0) {
      await loadGroups()
      currentGroups = groups
    }
    
    // 如果当前令牌的分组为空（用户分组），且不在选项列表中，临时添加一个只读选项用于显示
    const tokenGroup = token.group || ''
    if (tokenGroup === '' || !currentGroups.some(g => g.value === tokenGroup)) {
      const displayGroups = [...currentGroups]
      if (tokenGroup === '') {
        // 用户分组，添加一个显示用的选项
        displayGroups.unshift({ 
          value: '__user_group__', 
          label: '用户分组（当前）', 
          disabled: true 
        })
        setGroups(displayGroups)
        // 使用特殊值来显示
        form.setFieldsValue({
          name: token.name,
          group: '__user_group__',
          neverExpire: token.expired_time === -1,
          expiredTime: token.expired_time !== -1 ? dayjs(token.expired_time * 1000) : null,
          unlimitedQuota: token.unlimited_quota,
          remainQuota: token.remain_quota,
          modelLimitsEnabled: token.model_limits_enabled,
          modelLimits: token.model_limits,
          allowIps: token.allow_ips
        })
      } else {
        form.setFieldsValue({
          name: token.name,
          group: tokenGroup,
          neverExpire: token.expired_time === -1,
          expiredTime: token.expired_time !== -1 ? dayjs(token.expired_time * 1000) : null,
          unlimitedQuota: token.unlimited_quota,
          remainQuota: token.remain_quota,
          modelLimitsEnabled: token.model_limits_enabled,
          modelLimits: token.model_limits,
          allowIps: token.allow_ips
        })
      }
    } else {
      form.setFieldsValue({
        name: token.name,
        group: tokenGroup,
        neverExpire: token.expired_time === -1,
        expiredTime: token.expired_time !== -1 ? dayjs(token.expired_time * 1000) : null,
        unlimitedQuota: token.unlimited_quota,
        remainQuota: token.remain_quota,
        modelLimitsEnabled: token.model_limits_enabled,
        modelLimits: token.model_limits,
        allowIps: token.allow_ips
      })
    }
    
    setEditModalVisible(true)
  }
  
  // 打开令牌管理弹窗
  const openTokenModal = () => {
    setTokenModalVisible(true)
    loadGroups()
    loadTokens()
  }
  
  // 打开兑换码弹窗
  const openRedeemModal = () => {
    setRedeemModalVisible(true)
    setRedeemCodes('')
    setRedeemResults([])
  }
  
  // 兑换码
  const handleRedeem = async () => {
    if (!redeemCodes.trim()) {
      message.warning('请输入兑换码')
      return
    }
    
    setRedeemLoading(true)
    const codes = redeemCodes.split('\n').map(code => code.trim()).filter(code => code)
    const results = []
    
    try {
      for (const code of codes) {
        try {
          // 使用后端代理路由，避免跨域问题
          const res = await fetch(`/api/sites/${id}/redeem`, {
            method: 'POST',
            headers: {
              ...authHeaders(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key: code })
          })
          const data = await res.json()
          results.push({
            code,
            success: data.success,
            message: data.message || (data.success ? '兑换成功' : '兑换失败')
          })
        } catch (e) {
          results.push({
            code,
            success: false,
            message: '请求失败: ' + e.message
          })
        }
      }
      
      setRedeemResults(results)
      
      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length
      
      if (successCount > 0 && failCount === 0) {
        message.success(`全部兑换成功！成功 ${successCount} 个`)
      } else if (successCount > 0) {
        message.warning(`部分兑换成功：成功 ${successCount} 个，失败 ${failCount} 个`)
      } else {
        message.error(`全部兑换失败！失败 ${failCount} 个`)
      }
    } catch (e) {
      message.error('兑换失败: ' + e.message)
    } finally {
      setRedeemLoading(false)
    }
  }
  
  const load = async () => {
    try {
      const res = await fetch(`/api/sites/${id}/diffs?limit=50`, { headers: authHeaders() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '加载变更历史失败')
      }
      const data = await res.json()
      setDiffs(data)
    } catch (e) { 
      message.error(e.message || '加载变更历史失败，请稍后重试') 
    }
    try {
      const sres = await fetch(`/api/sites/${id}/snapshots?limit=1`, { headers: authHeaders() })
      if (!sres.ok) {
        const sdata = await sres.json().catch(() => ({}))
        throw new Error(sdata.error || '加载模型列表失败')
      }
      const sdata = await sres.json()
      let items = Array.isArray(sdata) && sdata.length ? (sdata[0].modelsJson || []) : []
      items = items.filter(m => !String(m.id || '').toLowerCase().includes('custom'))
      setSnapshot(items)
    } catch (e) { 
      message.error(e.message || '加载模型列表失败，请稍后重试') 
    }
  }
  
  useEffect(() => { 
    load() 
  }, [id])
  
  const checkNow = async () => {
    setLoading(true)
    try {
      // 手动检测不发送邮件通知
      const res = await fetch(`/api/sites/${id}/check?skipNotification=true`, { method: 'POST', headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || '检测失败')
      await load()
      message.success('检测完成，数据已刷新')
    } catch (e) { 
      message.error(e.message || '检测失败，请检查站点配置') 
    } finally { setLoading(false) }
  }

  const totalAdded = useMemo(() => 
    diffs.reduce((sum, d) => sum + (d.addedJson?.length || 0), 0)
  , [diffs])
  
  const totalRemoved = useMemo(() => 
    diffs.reduce((sum, d) => sum + (d.removedJson?.length || 0), 0)
  , [diffs])
  
  return (
    <div>
      <Button 
        icon={<ArrowLeftOutlined />}
        onClick={() => nav('/')}
        size="large"
        style={{ 
          marginBottom: 20,
          fontSize: 15,
          borderRadius: '10px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateX(-4px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateX(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
        }}
      >
        返回站点列表
      </Button>

      <Card 
        className="fade-in"
        style={{
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          marginBottom: 24,
          background: 'linear-gradient(135deg, #ffffff 0%, #f5f7fa 100%)',
          border: '1px solid rgba(24, 144, 255, 0.1)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(24, 144, 255, 0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          transform: 'translate(50%, -50%)',
          pointerEvents: 'none'
        }} />
        <Row gutter={24} style={{ position: 'relative', zIndex: 1 }}>
          <Col span={8}>
            <div style={{ 
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(24, 144, 255, 0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            className="stat-card"
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(24, 144, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            >
              <Statistic 
                title={<span style={{ fontSize: 15, fontWeight: 600, color: '#666' }}>当前模型数</span>}
                value={snapshot.length}
                prefix={<ApiOutlined style={{ color: '#1890ff' }} />}
                valueStyle={{ color: '#1890ff', fontSize: 36, fontWeight: 800 }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div style={{ 
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(82, 196, 26, 0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(82, 196, 26, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            >
              <Statistic 
                title={<span style={{ fontSize: 15, fontWeight: 600, color: '#666' }}>历史新增</span>}
                value={totalAdded}
                prefix={<PlusCircleOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a', fontSize: 36, fontWeight: 800 }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div style={{ 
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(255, 77, 79, 0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(255, 77, 79, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            >
              <Statistic 
                title={<span style={{ fontSize: 15, fontWeight: 600, color: '#666' }}>历史移除</span>}
                value={totalRemoved}
                prefix={<MinusCircleOutlined style={{ color: '#ff4d4f' }} />}
                valueStyle={{ color: '#ff4d4f', fontSize: 36, fontWeight: 800 }}
              />
            </div>
          </Col>
        </Row>
      </Card>

      {/* 功能气泡区域 */}
      <Row gutter={16} style={{ marginBottom: 24 }} className="slide-in-right">
        <Col span={12}>
          <Card
            hoverable
            onClick={openTokenModal}
            style={{
              borderRadius: 20,
              boxShadow: '0 8px 32px rgba(24, 144, 255, 0.25)',
              background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
              border: 'none',
              cursor: 'pointer',
              minHeight: 140,
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            bodyStyle={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '32px',
              position: 'relative',
              zIndex: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 16px 48px rgba(24, 144, 255, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(24, 144, 255, 0.25)';
            }}
          >
            <div style={{
              position: 'absolute',
              top: '-50%',
              right: '-20%',
              width: '200px',
              height: '200px',
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            <KeyOutlined style={{ 
              fontSize: 56, 
              color: '#fff', 
              marginBottom: 16,
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))',
              animation: 'bounce 2s ease-in-out infinite'
            }} />
            <Typography.Title level={3} style={{ margin: 0, color: '#fff', fontWeight: 700 }}>
              令牌管理
            </Typography.Title>
            <Typography.Text style={{ 
              color: 'rgba(255,255,255,0.95)', 
              marginTop: 12,
              fontSize: 15,
              fontWeight: 500
            }}>
              查看、修改和删除API令牌
            </Typography.Text>
          </Card>
        </Col>
        <Col span={12}>
          <Card
            hoverable
            onClick={openRedeemModal}
            style={{
              borderRadius: 20,
              boxShadow: '0 8px 32px rgba(19, 194, 194, 0.25)',
              background: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
              border: 'none',
              cursor: 'pointer',
              minHeight: 140,
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            bodyStyle={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '32px',
              position: 'relative',
              zIndex: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 16px 48px rgba(19, 194, 194, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(19, 194, 194, 0.25)';
            }}
          >
            <div style={{
              position: 'absolute',
              top: '-50%',
              right: '-20%',
              width: '200px',
              height: '200px',
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            <GiftOutlined style={{ 
              fontSize: 56, 
              color: '#fff', 
              marginBottom: 16,
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))',
              animation: 'pulse 2s ease-in-out infinite'
            }} />
            <Typography.Title level={3} style={{ margin: 0, color: '#fff', fontWeight: 700 }}>
              兑换码
            </Typography.Title>
            <Typography.Text style={{ 
              color: 'rgba(255,255,255,0.95)', 
              marginTop: 12,
              fontSize: 15,
              fontWeight: 500
            }}>
              使用兑换码充值余额
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card 
        className="fade-in-up"
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <ApiOutlined style={{ marginRight: 12, fontSize: 24, color: '#1890ff' }} />
            <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>当前模型列表</Typography.Title>
          </div>
        }
        extra={
          <Space size="middle">
            <Button 
              icon={modelsExpanded ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setModelsExpanded(!modelsExpanded)}
              size="large"
              style={{ 
                fontSize: 15,
                borderRadius: '8px',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {modelsExpanded ? '收起' : '展开'}
            </Button>
            <Button 
              icon={<CopyOutlined />}
              onClick={() => copyAllModels(snapshot)}
              size="large"
              disabled={snapshot.length === 0}
              style={{ 
                fontSize: 15,
                borderRadius: '8px',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (snapshot.length > 0) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              复制全部模型
            </Button>
            <Button 
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              loading={loading}
              onClick={checkNow}
              style={{
                height: 44,
                fontSize: 15,
                fontWeight: 600,
                borderRadius: '10px',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
              }}
            >
              {loading ? '检测中...' : '立即检测并刷新'}
            </Button>
          </Space>
        }
        style={{
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          marginBottom: 24,
          border: '1px solid rgba(24, 144, 255, 0.1)'
        }}
      >
        {modelsExpanded && (
          snapshot.length === 0 ? (
            <Empty 
              description="暂无模型数据，请先执行检测"
              style={{ padding: '40px 0' }}
            />
          ) : (
            <List
              grid={{ gutter: 12, xs: 1, sm: 2, md: 3, lg: 4, xl: 5, xxl: 6 }}
              dataSource={snapshot}
              pagination={snapshot.length > 50 ? {
                pageSize: 50,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 个模型`,
                position: 'bottom',
                style: { marginTop: 16, textAlign: 'center' }
              } : false}
              renderItem={(m) => <ModelCard key={m.id} model={m} onCopy={copyToClipboard} />}
            />
          )
        )}
      </Card>

      <Card 
        title={<Typography.Title level={4} style={{ margin: 0 }}>变更历史记录</Typography.Title>}
        style={{
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
        }}
      >
        {diffs.length === 0 ? (
          <Empty 
            description="暂无变更记录"
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Collapse 
            accordion
            style={{ background: 'transparent', border: 'none' }}
          >
            {diffs.map(d => (
              <Collapse.Panel 
                header={
                  <Space>
                    <ClockCircleOutlined style={{ color: '#1890ff' }} />
                    <Typography.Text strong style={{ fontSize: 15 }}>
                      {new Date(d.diffAt).toLocaleString('zh-CN')}
                    </Typography.Text>
                    <Tag color="green">+{d.addedJson?.length || 0}</Tag>
                    <Tag color="red">-{d.removedJson?.length || 0}</Tag>
                  </Space>
                }
                key={d.id}
                style={{ 
                  marginBottom: 12,
                  border: '1px solid #e8e8e8',
                  borderRadius: 8,
                  overflow: 'hidden'
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Section title="新增模型" items={d.addedJson} type="success" icon={<PlusCircleOutlined />} />
                  <Section title="移除模型" items={d.removedJson} type="error" icon={<MinusCircleOutlined />} />
                </Space>
              </Collapse.Panel>
            ))}
          </Collapse>
        )}
      </Card>

      {/* 令牌管理弹窗 */}
      <Modal
        title={<Typography.Title level={4} style={{ margin: 0 }}>令牌管理</Typography.Title>}
        open={tokenModalVisible}
        onCancel={() => setTokenModalVisible(false)}
        footer={null}
        width={1200}
        style={{ top: 20 }}
      >
        <Table
          dataSource={tokens}
          loading={tokenLoading}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1000 }}
          columns={[
            {
              title: 'ID',
              dataIndex: 'id',
              width: 60,
              fixed: 'left'
            },
            {
              title: '名称',
              dataIndex: 'name',
              width: 120,
              ellipsis: true
            },
            {
              title: '令牌',
              dataIndex: 'key',
              width: 200,
              ellipsis: true,
              render: (key) => (
                <Space>
                  <Typography.Text ellipsis style={{ maxWidth: 150 }}>{key}</Typography.Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(key, '令牌已复制')}
                  />
                </Space>
              )
            },
            {
              title: '分组',
              dataIndex: 'group',
              width: 100,
              render: (group) => {
                if (!group || group === '') {
                  return <Tag color="default">用户分组</Tag>
                }
                return <Tag color="blue">{group}</Tag>
              }
            },
            {
              title: '过期时间',
              dataIndex: 'expired_time',
              width: 150,
              render: (time) => time === -1 ? <Tag color="green">永不过期</Tag> : new Date(time * 1000).toLocaleString('zh-CN')
            },
            {
              title: '额度',
              dataIndex: 'remain_quota',
              width: 120,
              render: (quota, record) => record.unlimited_quota 
                ? <Tag className="tag-unlimited">无限额</Tag> 
                : (quota / 500000).toFixed(2) + ' $'
            },
            {
              title: '已使用',
              dataIndex: 'used_quota',
              width: 120,
              render: (quota) => (quota / 500000).toFixed(2) + ' $'
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 80,
              render: (status) => status === 1 ? <Tag color="success">启用</Tag> : <Tag color="error">禁用</Tag>
            },
            {
              title: '创建时间',
              dataIndex: 'created_time',
              width: 150,
              render: (time) => new Date(time * 1000).toLocaleString('zh-CN')
            },
            {
              title: '最后访问',
              dataIndex: 'accessed_time',
              width: 150,
              render: (time) => time ? new Date(time * 1000).toLocaleString('zh-CN') : '-'
            },
            {
              title: '操作',
              key: 'actions',
              width: 120,
              fixed: 'right',
              render: (_, record) => (
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditModal(record)}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除"
                    description="确定要删除这个令牌吗？"
                    onConfirm={() => deleteToken(record.id)}
                    okText="确认"
                    cancelText="取消"
                  >
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Modal>

      {/* 令牌编辑弹窗 */}
      <Modal
        title={<Typography.Title level={4} style={{ margin: 0 }}>编辑令牌</Typography.Title>}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          setEditingToken(null)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={updateToken}
          style={{ marginTop: 24 }}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入令牌名称' }]}
          >
            <Input placeholder="请输入令牌名称" />
          </Form.Item>

          <Form.Item
            label="分组"
            name="group"
            rules={[{ required: true, message: '请选择分组' }]}
          >
            <Select 
              placeholder="请选择分组"
              showSearch
              optionFilterProp="label"
              options={groups}
            />
          </Form.Item>

          <Form.Item label="过期时间">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item name="neverExpire" valuePropName="checked" noStyle>
                <Switch checkedChildren="永不过期" unCheckedChildren="设置过期时间" />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.neverExpire !== currentValues.neverExpire}
              >
                {({ getFieldValue }) =>
                  !getFieldValue('neverExpire') && (
                    <Form.Item name="expiredTime">
                      <DatePicker
                        showTime
                        format="YYYY-MM-DD HH:mm:ss"
                        placeholder="选择过期时间"
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item label="额度">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item name="unlimitedQuota" valuePropName="checked" noStyle>
                <Switch checkedChildren="无限额" unCheckedChildren="设置额度" />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.unlimitedQuota !== currentValues.unlimitedQuota}
              >
                {({ getFieldValue }) =>
                  !getFieldValue('unlimitedQuota') && (
                    <Form.Item name="remainQuota" label="剩余额度（原始值）">
                      <InputNumber
                        placeholder="请输入剩余额度"
                        style={{ width: '100%' }}
                        min={0}
                      />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item
            label="访问限制"
            name="allowIps"
            extra="多个IP请用逗号分隔，留空表示不限制"
          >
            <Input.TextArea
              placeholder="例如: 192.168.1.1, 10.0.0.1"
              rows={3}
            />
          </Form.Item>

          <Form.Item name="modelLimitsEnabled" valuePropName="checked" label="启用模型限制">
            <Switch />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.modelLimitsEnabled !== currentValues.modelLimitsEnabled}
          >
            {({ getFieldValue }) =>
              getFieldValue('modelLimitsEnabled') && (
                <Form.Item
                  label="模型限制"
                  name="modelLimits"
                  extra="多个模型请用逗号分隔"
                >
                  <Input.TextArea
                    placeholder="例如: gpt-4, gpt-3.5-turbo"
                    rows={3}
                  />
                </Form.Item>
              )
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* 兑换码弹窗 */}
      <Modal
        title={<Typography.Title level={4} style={{ margin: 0 }}>兑换码充值</Typography.Title>}
        open={redeemModalVisible}
        onCancel={() => {
          setRedeemModalVisible(false)
          setRedeemCodes('')
          setRedeemResults([])
        }}
        width={600}
        footer={null}
      >
        <div style={{ marginTop: 24 }}>
          <Typography.Text strong>输入兑换码</Typography.Text>
          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            （每行一个兑换码，支持批量兑换）
          </Typography.Text>
          <Input.TextArea
            value={redeemCodes}
            onChange={(e) => setRedeemCodes(e.target.value)}
            placeholder="请输入兑换码，每行一个&#10;例如：&#10;0e61536d4d50352ef20933448be0d9f1&#10;1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p"
            rows={6}
            style={{ marginTop: 12 }}
          />
          
          <Button
            type="primary"
            size="large"
            loading={redeemLoading}
            onClick={handleRedeem}
            block
            style={{
              marginTop: 16,
              background: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
              border: 'none',
              height: 48,
              fontSize: 16,
              fontWeight: 600
            }}
          >
            {redeemLoading ? '兑换中...' : '立即兑换'}
          </Button>

          {redeemResults.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <Typography.Title level={5}>兑换结果</Typography.Title>
              <List
                size="small"
                dataSource={redeemResults}
                renderItem={(item) => (
                  <List.Item>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Typography.Text 
                        ellipsis 
                        style={{ maxWidth: 300 }}
                        copyable
                      >
                        {item.code}
                      </Typography.Text>
                      <Tag color={item.success ? 'success' : 'error'}>
                        {item.message}
                      </Tag>
                    </Space>
                  </List.Item>
                )}
                style={{
                  maxHeight: 300,
                  overflow: 'auto',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: '8px 0'
                }}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

// 模型卡片组件 - 使用 memo 优化
const ModelCard = memo(({ model, onCopy }) => (
  <List.Item>
    <Card 
      size="small"
      hoverable
      style={{ 
        borderRadius: 8,
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        border: '1px solid #e8e8e8',
        position: 'relative'
      }}
      bodyStyle={{ padding: '12px' }}
    >
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        onClick={() => onCopy(model.id, `已复制: ${model.id}`)}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          fontSize: 12,
          color: '#1890ff'
        }}
      />
      <Typography.Text 
        strong 
        style={{ 
          fontSize: 13,
          display: 'block',
          marginBottom: 6,
          color: '#333',
          paddingRight: 24
        }}
      >
        {model.id}
      </Typography.Text>
      <Typography.Text 
        type="secondary" 
        style={{ 
          fontSize: 12,
          display: 'block'
        }}
      >
        {model.owned_by || model.ownedBy || '未知'}
      </Typography.Text>
    </Card>
  </List.Item>
))

ModelCard.displayName = 'ModelCard'

// 变更项卡片组件 - 使用 memo 优化
const DiffItemCard = memo(({ item, type, onCopy }) => {
  const colorMap = {
    success: '#52c41a',
    error: '#ff4d4f'
  }

  return (
    <List.Item style={{ marginBottom: 8 }}>
      <Card 
        size="small"
        style={{ 
          borderRadius: 6,
          border: `1px solid ${colorMap[type]}`,
          background: '#fff',
          position: 'relative'
        }}
        bodyStyle={{ padding: 12 }}
      >
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={() => onCopy(item.id, `已复制: ${item.id}`)}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            fontSize: 11,
            padding: '2px 4px',
            height: 'auto'
          }}
        />
        <Typography.Text strong style={{ fontSize: 14, color: '#333', display: 'block', marginBottom: 6, paddingRight: 24 }}>
          {item.id}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {item.owned_by || item.ownedBy || '未知提供者'}
        </Typography.Text>
      </Card>
    </List.Item>
  )
})

DiffItemCard.displayName = 'DiffItemCard'

const Section = memo(({ title, items, type, icon }) => {
  if (!items || items.length === 0) {
    return null
  }

  const colorMap = {
    success: '#52c41a',
    error: '#ff4d4f'
  }

  const copyToClipboard = useCallback((text, successMsg = '复制成功') => {
    navigator.clipboard.writeText(text).then(() => {
      message.success(successMsg)
    }).catch(() => {
      message.error('复制失败，请手动复制')
    })
  }, [])

  const copyAllModels = useCallback(() => {
    const names = items.map(m => m.id).join(',')
    copyToClipboard(names, `已复制 ${items.length} 个模型名称`)
  }, [items, copyToClipboard])

  return (
    <div style={{ 
      background: '#fafafa', 
      padding: 16, 
      borderRadius: 8,
      border: '1px solid #e8e8e8'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 12
      }}>
        <Typography.Title 
          level={5} 
          style={{ 
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: colorMap[type]
          }}
        >
          {icon}
          {title} ({items.length})
        </Typography.Title>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={copyAllModels}
          style={{ fontSize: 13 }}
        >
          复制全部
        </Button>
      </div>
      <List
        size="small"
        dataSource={items}
        grid={{ gutter: 8, xs: 1, sm: 1, md: 2, lg: 2, xl: 3 }}
        pagination={items.length > 30 ? {
          pageSize: 30,
          showSizeChanger: false,
          size: 'small',
          showTotal: (total) => `共 ${total} 个`,
        } : false}
        renderItem={(item) => <DiffItemCard key={item.id} item={item} type={type} onCopy={copyToClipboard} />}
      />
    </div>
  )
})

Section.displayName = 'Section'
