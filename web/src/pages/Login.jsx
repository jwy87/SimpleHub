import { useState } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { UserOutlined, LockOutlined, ApiOutlined } from '@ant-design/icons'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const onFinish = async (values) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '登录失败')
      }
      const data = await res.json()
      localStorage.setItem('token', data.token)
      message.success('登录成功，欢迎回来！')
      nav('/')
    } catch (e) {
      message.error(e.message || '登录失败，请检查邮箱和密码')
    } finally { setLoading(false) }
  }
  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--app-bg-gradient)',
      padding: '20px'
    }}>
      <Card 
        style={{ 
          width: 460,
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}
        bodyStyle={{ padding: 48 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <ApiOutlined style={{ 
            fontSize: 56, 
            color: '#1890ff',
            marginBottom: 16
          }} />
          <Typography.Title level={2} style={{ 
            marginBottom: 8,
            background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            API 聚合监控管理系统
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 15 }}>
            登录以管理您的 API 管理系统
          </Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item 
            name="email" 
            label={<span style={{ fontSize: 15, fontWeight: 500 }}>邮箱地址</span>}
            rules={[
              { required: true, message: '请输入邮箱地址' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input 
              prefix={<UserOutlined style={{ color: '#bbb' }} />}
              placeholder="请输入邮箱" 
              style={{ borderRadius: 8, fontSize: 15 }}
            />
          </Form.Item>
          <Form.Item 
            name="password" 
            label={<span style={{ fontSize: 15, fontWeight: 500 }}>登录密码</span>}
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password 
              prefix={<LockOutlined style={{ color: '#bbb' }} />}
              placeholder="请输入密码" 
              style={{ borderRadius: 8, fontSize: 15 }}
            />
          </Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            block 
            loading={loading}
            style={{
              height: 48,
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              marginTop: 12,
              background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
              border: 'none'
            }}
          >
            {loading ? '登录中...' : '立即登录'}
          </Button>
        </Form>
      </Card>
    </div>
  )
}
