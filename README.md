# OpenClaw 定制版

基于 [OpenClaw](https://github.com/openclaw/openclaw) 的定制 fork，新增企业微信通道和模型原生联网搜索。

仓库地址：`github.com/bithcq/openclaw`

| 特性     | 官方版                    | 定制版                                |
| -------- | ------------------------- | ------------------------------------- |
| 安装方式 | `npm install -g openclaw` | 源码构建                              |
| 企业微信 | 无                        | 支持（文字 / 图片 / 语音）            |
| 模型联网 | 需配置搜索 provider       | baseUrl 模式下使用模型原生 web_search |

---

## WSL2 用户：启用 systemd（可选，原生 Linux 跳过）

后续 `openclaw onboard --install-daemon` 会将 Gateway 安装为 systemd 用户服务，WSL2 默认没有开启 systemd，建议提前配好。

```bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true
EOF
```

PowerShell 中重启 WSL：

```powershell
wsl --shutdown
wsl -d Ubuntu-24.04
```

验证：`systemctl --user status`，看到 `State: running` 即可。

---

## 安装

适用于 WSL2 / Ubuntu / Debian。思路：**先配好环境，再拉源码构建。**

### 一键安装

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/bithcq/openclaw/main/scripts/install-custom.sh)
```

脚本自动完成：系统依赖检查 → Node ≥ 22 检查 → pnpm 安装 → 拉取源码 → 构建 → 生成 `.env` 模板。

### 手动安装

#### 1. 系统依赖

**Ubuntu：**

```bash
sudo apt update && sudo apt install -y git curl build-essential python3
```

**Debian：**

```bash
sudo apt update && sudo apt install -y git curl build-essential python3 ca-certificates gnupg
```

> Debian 需要额外装 `ca-certificates` 和 `gnupg`，添加 NodeSource 源时用到。

#### 2. Node.js >= 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 应输出 v22.x.x
```

#### 3. pnpm

```bash
sudo corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

#### 4. 配好命令别名

提前写入，避免构建完成后找不到命令：

```bash
echo 'alias openclaw="node ~/openclaw/dist/index.js"' >> ~/.bashrc
source ~/.bashrc
```

#### 5. 拉取源码并构建

```bash
cd ~
git clone https://github.com/bithcq/openclaw.git
cd openclaw
pnpm install
pnpm build
pnpm ui:build   # 构建浏览器 Control UI 前端资源
```

已有仓库则 `cd ~/openclaw && git pull origin main && pnpm install && pnpm build && pnpm ui:build`。

#### 6. 验证

```bash
openclaw --version
```

---

## 配置

### `.env`

模型 provider 和 API 密钥由 onboarding 向导写入 `openclaw.json`。`.env` 只放向导不管的参数：

```bash
cp ~/openclaw/.env.example ~/openclaw/.env
nano ~/openclaw/.env
```

```bash
# 网关 token（用 openssl rand -hex 32 生成）
OPENCLAW_GATEWAY_TOKEN=change-me

# 企业微信
WECOM_CORP_ID=wwxxxx
WECOM_AGENT_ID=1000002
WECOM_SECRET=xxxxxxxx
WECOM_TOKEN=xxxxxxxx
WECOM_AES_KEY=xxxxxxxxxx...        # 43 位
WECOM_CALLBACK_PATH=/api/wecom/callback

# 可选：出站代理（企微要求调用来源 IP 在可信白名单内，出口 IP 变动时通过固定 IP 代理发送）
# WECOM_PROXY_URL=http://user:pass@host:3128

# 可选：豆包语音识别（企微语音消息转文字）
# WECOM_DOUBAO_ASR_APP_ID=your-app-id
# WECOM_DOUBAO_ASR_TOKEN=your-token
# WECOM_DOUBAO_ASR_CLUSTER=volcengine_streaming_common
```

### 首次启动

```bash
openclaw onboard --install-daemon
```

向导推荐选择：

- **Mode**：`local`
- **Search provider**：`Skip for now`（定制版已内置 web_search）
- **Configure skills / hooks**：`No` / `Skip`
- **Hatch**：`Hatch in TUI`
- **Select channel**：`WeCom (企业微信)` → `Skip for now`（本地插件已启用，不需要从 npm 下载）

`--install-daemon` 会自动创建 systemd 用户服务并启动 Gateway。

### 开放局域网访问

Gateway 默认只监听 `127.0.0.1`（loopback），企业微信回调需要从外部访问，必须改为监听局域网：

```bash
openclaw config set gateway.bind lan
```

设置后重启服务生效：

```bash
systemctl --user restart openclaw-gateway.service
```

### 浏览器访问 Control UI

`bind=lan` 模式下需要 token 认证，浏览器不会弹出输入框。用以下命令生成带 token 的访问链接：

```bash
openclaw dashboard --no-open
```

复制输出的 URL 到浏览器打开即可。

---

## 企业微信回调

**前提**：企微管理后台已创建自建应用，服务器有公网 IP 或反向代理。

在企微后台 → 应用管理 → 你的应用 → API 接收消息，填写：

- **URL**：`http://你的公网IP:18789/api/wecom/callback`
- **Token**：与 `.env` 中 `WECOM_TOKEN` 一致
- **EncodingAESKey**：与 `.env` 中 `WECOM_AES_KEY` 一致

点击保存，Gateway 运行中且配置正确时验证会自动通过。

---

## WSL2 开机自启

两层机制：Windows 开机拉起 WSL → systemd 自动带起 Gateway 服务。

### 开启 linger

```bash
sudo loginctl enable-linger "$(whoami)"
loginctl show-user "$(whoami)" -p Linger   # 应输出 Linger=yes
```

### 创建 Windows 计划任务

**管理员权限 PowerShell** 执行：

```powershell
Unregister-ScheduledTask -TaskName "WSL Boot" -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d Ubuntu-24.04 --exec /bin/true"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "WSL Boot" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
```

### 验证

重启 Windows 后在 PowerShell 执行：

```powershell
wsl -d Ubuntu-24.04 -- systemctl --user is-active openclaw-gateway.service
# 输出 active 即成功
```

---

## 手动配置 systemd 服务

如果 onboarding 时没用 `--install-daemon`，可手动创建：

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/openclaw-gateway.service <<'EOF'
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/openclaw
ExecStart=/usr/bin/node %h/openclaw/dist/index.js gateway run --bind lan --port 18789
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now openclaw-gateway.service
sudo loginctl enable-linger "$(whoami)"
```

验证：

```bash
systemctl --user is-active openclaw-gateway.service   # active
curl -s http://127.0.0.1:18789/healthz                # OK
```

---

## Docker 部署

```bash
cd ~/openclaw
sudo docker build -t openclaw:wecom-$(date +%Y%m%d) .

mkdir -p ~/openclaw_data/config ~/openclaw_data/workspace
# 将 openclaw.json 放到 ~/openclaw_data/config/ 下

OPENCLAW_IMAGE=openclaw:wecom-$(date +%Y%m%d) \
OPENCLAW_CONFIG_DIR=~/openclaw_data/config \
OPENCLAW_WORKSPACE_DIR=~/openclaw_data/workspace \
sudo docker compose up -d
```

验证：

```bash
sudo docker compose ps
curl -s http://127.0.0.1:18789/healthz
```

---

## 更新

### 日常更新（拉最新代码重新构建）

```bash
cd ~/openclaw
git pull origin main
pnpm install && pnpm build && pnpm ui:build
systemctl --user restart openclaw-gateway.service
```

Docker 部署则重新 `docker build` + `docker compose up -d`。

### 同步官方上游

```bash
git fetch upstream
git rebase upstream/main
```

README.md 已配置 `merge=keep-custom`，rebase 时自动保留定制版。

冲突处理：

```bash
git status                    # 查看冲突文件
# 编辑解决后
git add <冲突文件>
git rebase --continue
```

推送（rebase 后通常需要强制推送）：

```bash
git push origin main --force
```

然后重新 `pnpm install && pnpm build` 并重启服务。

#### 冲突风险速查

| 文件                                  | 概率 | 原因                    |
| ------------------------------------- | ---- | ----------------------- |
| `extensions/wecom/*`                  | 无   | 官方无此目录            |
| `native-web-search.ts`                | 无   | 新增文件                |
| `compact.ts` / `attempt.ts`           | 中   | 官方偶尔更新 agent 流程 |
| `.env.example` / `docker-compose.yml` | 低   | 仅追加行                |
| `README.md`                           | 无   | 合并驱动自动保留        |

---

## 验证清单

- [ ] `node -v` → v22.x.x
- [ ] `pnpm -v` → 有版本号
- [ ] `openclaw --version` → 有输出
- [ ] `.env` 已填写企微配置
- [ ] `curl -s http://127.0.0.1:18789/healthz` → OK
- [ ] `systemctl --user is-active openclaw-gateway.service` → active
- [ ] 企微回调验证通过
- [ ] 企微发文字 → 收到 AI 回复
- [ ] 企微发图片 + 文字 → 收到 AI 回复
- [ ] （可选）企微发语音 → 收到 AI 回复

---

## 常见问题

### `openclaw: command not found`

```bash
echo 'alias openclaw="node ~/openclaw/dist/index.js"' >> ~/.bashrc
source ~/.bashrc
```

### `pnpm: command not found`

```bash
sudo corepack enable && corepack prepare pnpm@latest --activate
```

### Node.js 版本低于 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### pnpm install 卡住或报错

```bash
pnpm store prune && rm -rf node_modules && pnpm install
```

### pnpm build 失败

确认 `node -v` >= 22 且已安装 `build-essential` 和 `python3`。

### 企微收不到回复

1. `.env` 中企微配置是否完整
2. Gateway 是否运行：`curl -s http://127.0.0.1:18789/healthz`
3. 查日志：`openclaw gateway logs | grep wecom`
4. 回调 URL 是否可从公网访问

### systemd 服务启动失败

```bash
journalctl --user -u openclaw-gateway.service -n 50 --no-pager
```

### WSL2 重启后服务没启动

```bash
loginctl show-user "$(whoami)" -p Linger               # 应输出 Linger=yes
systemctl --user is-enabled openclaw-gateway.service    # 应输出 enabled
```

同时确认已创建 Windows 计划任务（见"WSL2 开机自启"章节）。

---

## 定制功能说明

### 企业微信通道插件

目录：`extensions/wecom/`

- 回调验证（SHA1 签名 + AES-256-CBC 解密）
- 入站消息：文字 / 图片 / 语音（豆包 ASR 转文字）
- 出站消息：文本（自动分片 ≤500 字）、图片
- 图片暂存：收到图片后等待下一条文字，联合送入模型
- 去重：按 `msgId` 或 `fromUser+createTime+内容`
- 回复净化：默认移除链接，用户要求时保留
- 自动启用：检测到 `WECOM_*` 配置项即启用插件

### 模型联网搜索改造

文件：`src/agents/pi-embedded-runner/native-web-search.ts`

- baseUrl 模式下强制使用模型原生 `web_search`
- 移除本地 function 版搜索工具，避免冲突

### 已知限制

1. 企微手机端不支持发送文件到应用
2. 图片不直接触发回复，先暂存等待文字
3. 语音识别需配置豆包 ASR（`WECOM_DOUBAO_ASR_*`），未配置时提示"暂不支持语音消息"
4. 非 HTTPS 场景下 Control UI 受配对机制约束
