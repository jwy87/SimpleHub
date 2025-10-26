<div align="center">

# 🤖 API 聚合监控管理系统

<p>统一管理多个 API 站点，支持自动签到、余额监控和智能通知</p>

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/7UP9G9?referralCode=jae233)

![GitHub license](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/node.js-18%2B-green)

</div>

---

## ✨ 核心功能

### 🔍 智能监控
- **多站点管理**：统一管理多个 AI 中转站，支持 NewAPI、Veloera、DoneHub、VOAPI 等主流平台
- **模型变更检测**：自动追踪模型列表的增删改，精确记录每次变化
- **余额监控**：实时显示账户余额、使用量和剩余额度，支持自定义额度配置
- **请求详情**：完整记录 API 响应、错误信息和性能数据，便于问题排查

### ✅ 自动签到（Veloera 专属）
- **智能签到**：支持 Veloera 平台自动签到，每日自动领取奖励
- **灵活模式**：可选择仅签到、仅检测或两者都执行
- **状态追踪**：实时显示签到结果和获得的额度

### 📂 分类管理
- **站点分组**：创建分类对站点进行分组管理
- **独立配置**：每个分类可单独设置定时检测时间
- **一键检测**：支持对整个分类执行批量检测

### 📧 智能通知
- **邮件提醒**：模型变更时自动发送精美的 HTML 邮件通知
- **聚合通知**：定时检测时将多个站点的变更聚合到一封邮件
- **灵活配置**：支持单站点通知和批量通知两种模式

### ⏰ 定时任务
- **全局调度**：设置统一的检测时间，自动管理所有站点
- **独立配置**：单个站点可设置专属的检测时间
- **北京时间**：简化的时间设置，无需理解复杂的 cron 表达式
- **智能间隔**：批量检测时自动控制站点间检测间隔，避免并发过多

### 🎨 现代化界面
- **精美 UI**：基于 Ant Design 的现代化中文界面
- **状态保持**：浏览详情后返回保持滚动位置和分类展开状态
- **全文搜索**：支持按站点名称、链接或模型 ID 快速搜索
- **数据导入导出**：支持站点配置的批量导入导出

---

## 🚀 快速开始

### 🌟 一键部署（推荐）

<div>
  <strong>🎯 推荐使用 Zeabur 一键部署</strong><br>

  
  <br>
  
  [![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/7UP9G9?referralCode=jae233)
</div>

---

### 🐳 Docker 部署

**1. 快速启动（使用默认配置）**

```bash
docker run -d \
  --name api-monitor \
  -p 3000:3000 \
  -v api-monitor-data:/app/data \
  ghcr.io/jwy87/get_models:latest
```

**2. 自定义管理员账号（推荐）**

```bash
docker run -d \
  --name api-monitor \
  -p 3000:3000 \
  -e ADMIN_EMAIL=your-email@example.com \
  -e ADMIN_PASSWORD=your-secure-password \
  -v api-monitor-data:/app/data \
  ghcr.io/jwy87/get_models:latest
```

**3. 访问应用**

打开浏览器访问 `http://localhost:3000`

默认管理员账号（如未自定义）：
- 邮箱：`admin@example.com`
- 密码：`admin123456`

> ⚠️ **重要提示**：
> - 系统暂不支持修改密码功能，请在首次部署时通过环境变量设置好管理员账号

---

### 📋 Docker Compose

**1. 创建 docker-compose.yml**

```yaml
version: '3.8'

services:
  api-monitor:
    image: ghcr.io/jwy87/get_models:latest
    container_name: api-monitor
    ports:
      - "3000:3000"
    environment:
      - ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123456}
    volumes:
      - api-monitor-data:/app/data
    restart: unless-stopped

volumes:
  api-monitor-data:
```

**2. 启动服务**

```bash
# 使用默认配置
docker-compose up -d

# 或自定义管理员账号
ADMIN_EMAIL=your-email@example.com \
ADMIN_PASSWORD=your-secure-password \
docker-compose up -d
```

---

## 📖 使用指南

### 添加站点

1. 点击右上角「添加站点」按钮
2. 填写基本信息：
   - **站点名称**：自定义名称，便于识别
   - **接口地址**：API 的 Base URL（如 `https://api.example.com`）
   - **API 类型**：选择对应的平台类型
   - **API 密钥**：系统访问令牌
   - **用户 ID**：NewAPI 和 Veloera 类型需要填写

3. 可选配置：
   - **定时检测**：设置每日自动检测时间
   - **分类**：将站点归类到指定分类
   - **签到配置**：Veloera 类型可启用自动签到
   - **自定义 Billing**：配置自定义余额查询接口

### 签到功能（Veloera 专属）

1. 编辑 Veloera 类型的站点
2. 启用「自动签到」开关
3. 选择检测模式：
   - **两者都检测**（推荐）：同时执行模型检测和签到
   - **仅检测模型**：只检测模型列表
   - **仅执行签到**：只执行签到
4. 签到状态说明：
   - ✅ 绿色勾号：签到成功
   - ✖ 红色叉号：签到失败
   - ● 橙色圆点：已启用但暂无记录
   - ● 灰色圆点：未启用

### 邮件通知配置

1. 点击右上角「邮件通知」按钮
2. 填写 [Resend](https://resend.com) API Key
3. 填写收件邮箱（支持多个，用逗号分隔）
4. 保存后自动生效

> 💡 **提示**：Resend 免费版每月可发送 3,000 封邮件，足够个人使用

### 定时检测配置

**全局配置**：
1. 点击右上角「定时检测」按钮
2. 设置每日检测时间（北京时间）
3. 设置站点间检测间隔（建议 10-30 秒）
4. 启用后所有站点将按此配置执行

**单站点配置**：
1. 在站点列表点击「设置时间」图标
2. 设置该站点的独立检测时间
3. 单独配置的站点会独立调度

### 分类管理

1. 点击「分类管理」按钮
2. 创建新分类或编辑现有分类
3. 可为每个分类设置独立的定时检测
4. 支持对分类进行「一键检测」

---

## 🎯 API 类型说明

| 类型 | 说明 | 特殊功能 |
|------|------|---------|
| **NewAPI** | New API 中转站 | 自动获取用户余额 |
| **Veloera** | Veloera 中转站 | ✅ 支持自动签到 + 余额监控 |
| **DoneHub** | DoneHub 中转站 | 自动获取用户余额 |
| **VOAPI** | VOAPI 中转站 | 需配置 JWT Token 获取余额 |
| **其他** | OpenAI 标准或自定义 | 支持自定义 Billing 配置 |

---

## ❓ 常见问题

### 模型检测相关

<details>
<summary><b>为什么显示"获取失败"或"站点不存在"？</b></summary>

这通常是由以下原因导致的：

1. **网站防护拦截**（最常见）
   - 部分中转站启用了 Cloudflare 或其他 WAF 防护
   - 防护系统可能会拦截来自服务器的请求
   - **解决方案**：
     - 联系站点管理员将监控服务器 IP 加入白名单
     - 或使用浏览器扩展辅助添加站点（扩展请求不会被拦截）

2. **API 配置错误**
   - 检查 API 地址是否正确（需包含完整的 Base URL）
   - 检查 API 密钥是否有效
   - NewAPI/Veloera 类型需要填写正确的用户 ID

3. **网络问题**
   - 确认服务器能够访问目标站点
   - 检查是否有防火墙限制

4. **站点维护**
   - 目标站点可能正在维护或暂时不可用
   - 可以稍后重试

</details>

<details>
<summary><b>如何查看详细的错误信息？</b></summary>

1. 在站点列表点击「请求详情」按钮（🐛 图标）
2. 查看完整的请求和响应信息
3. 检查错误消息和状态码
4. 根据错误信息调整配置

</details>

<details>
<summary><b>定时检测不工作怎么办？</b></summary>

1. 检查是否启用了全局定时配置或单站点配置
2. 确认时间设置是否正确（使用北京时间）
3. 查看后端日志确认定时任务是否正常运行
4. 注意：全局配置的覆盖模式会忽略单站点配置

</details>

### 签到功能相关

<details>
<summary><b>为什么只有 Veloera 支持签到？</b></summary>

目前仅Veloera支持签到功能。

如果您使用的平台有签到接口，欢迎提交 Issue 或 PR 添加支持。

</details>

<details>
<summary><b>签到失败怎么办？</b></summary>

1. 确认已正确填写用户 ID
2. 检查 API 密钥是否有效
3. 查看「请求详情」中的错误信息
4. 确认站点的签到接口是否正常

</details>

### 通知相关

<details>
<summary><b>如何获取 Resend API Key？</b></summary>

1. 访问 [resend.com](https://resend.com) 并注册账号
2. 进入 Dashboard，创建新的 API Key
3. 复制 API Key 并粘贴到系统的邮件配置中
4. 免费版每月可发送 3,000 封邮件

</details>

<details>
<summary><b>为什么没有收到邮件通知？</b></summary>

1. 检查邮件配置是否正确
2. 确认收件邮箱地址无误
3. 检查垃圾邮件文件夹
4. 确认模型确实发生了变更（首次检测不会发送通知）
5. 查看后端日志确认邮件是否发送成功

</details>

### 数据管理

<details>
<summary><b>如何备份数据？</b></summary>

使用 Docker 部署时，数据存储在 `/app/data` 目录。

```bash
# 备份数据
docker run --rm \
  -v api-monitor-data:/data \
  -v $(pwd):/backup \
  busybox tar czf /backup/api-monitor-backup.tar.gz /data

# 恢复数据
docker run --rm \
  -v api-monitor-data:/data \
  -v $(pwd):/backup \
  busybox tar xzf /backup/api-monitor-backup.tar.gz -C /
```

</details>

<details>
<summary><b>如何导入导出站点配置？</b></summary>

1. **导出**：点击顶部菜单的「导出站点」按钮，下载 JSON 文件
2. **导入**：点击「导入站点」按钮，选择之前导出的 JSON 文件
3. 导入时会自动匹配分类名称，未匹配的站点将归入「未分类」

</details>

### 账号安全

<details>
<summary><b>忘记管理员密码怎么办？</b></summary>

由于系统暂不支持修改密码功能，如果忘记密码，需要：

1. 停止并删除容器
2. 删除数据卷（会清空所有数据）
3. 使用新的管理员账号重新部署

```bash
# 停止并删除容器
docker stop api-monitor && docker rm api-monitor

# 删除数据卷
docker volume rm api-monitor-data

# 重新部署
docker run -d \
  --name api-monitor \
  -p 3000:3000 \
  -e ADMIN_EMAIL=new-email@example.com \
  -e ADMIN_PASSWORD=new-password \
  -v api-monitor-data:/app/data \
  ghcr.io/jwy87/get_models:latest
```

**建议**：部署前请妥善保管管理员账号密码

</details>

---

## 🛠 本地开发

<details>
<summary>点击展开本地开发指南</summary>

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
# 后端
cd server && npm install

# 前端
cd web && npm install
```

### 初始化数据库

```bash
cd server
npx prisma generate
npx prisma db push
```

### 启动开发服务器

```bash
# 后端（端口 3000）
cd server && npm run dev

# 前端（端口 5173）- 新终端
cd web && npm run dev
```

### 访问应用

- 前端开发服务器：`http://localhost:5173`
- 后端 API：`http://localhost:3000`

</details>

---

## 📁 项目结构

```
get_models/
├── server/                 # 后端服务
│   ├── src/
│   │   ├── server.js      # Fastify 服务器
│   │   ├── auth.js        # JWT 认证
│   │   ├── routes.js      # API 路由
│   │   ├── run.js         # 模型检测核心逻辑
│   │   ├── checkin.js     # 签到功能模块
│   │   ├── scheduler.js   # 定时任务调度
│   │   ├── notifier.js    # 邮件通知模块
│   │   ├── crypto.js      # 加密服务
│   │   ├── db.js          # 数据库客户端
│   │   └── config.js      # 配置加载
│   ├── prisma/
│   │   └── schema.prisma  # 数据库模型
│   └── package.json
├── web/                   # 前端应用
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── main.jsx       # 应用入口
│   │   └── index.css      # 全局样式
│   └── package.json
├── browser-extension/     # 浏览器扩展（辅助工具）
├── Dockerfile             # Docker 镜像构建
├── docker-compose.yml     # Docker Compose 配置
└── README.md
```

---

## 🔧 高级功能

### 自定义 Billing 配置（不好用）

对于「其他（OpenAI 标准）」类型的站点：

1. 展开「自定义用量查询配置」
2. 填写配置：
   - **用量查询 URL**：余额查询接口地址
   - **认证方式**：Token 或 Cookie
   - **认证值**：对应的认证信息
   - **JSON 字段映射**：指定响应中的余额和使用量字段名

### 无限余额标记（没用）

对于无限额度的站点，勾选「无限余额」选项，系统将：
- 跳过余额检测
- 显示特殊的金色「无限额」标识

### 排除一键检测

勾选「排除一键检测」后：
- 该站点不会参与「一键检测」操作
- 但仍会执行定时检测

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发计划

- 暂无开发计划

---

## 📄 许可证

MIT License

---

## 🤖 关于本项目

> **特别说明**：本项目全程由 AI 开发完成 😜  
> 作者表示：我什么都不会（真的），有问题别问我（认真的）  
> 如遇 Bug 或需要新功能，请提交 Issue，让 AI 来解决 🤣

---

## 💬 支持

如有问题或建议，欢迎：
- 提交 [Issue](https://github.com/jwy87/get_models/issues)
- 发起 [Discussion](https://github.com/jwy87/get_models/discussions)

<div align="center">
  <sub>⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！</sub>
</div>
