#!/usr/bin/env bash
# ============================================================
# OpenClaw 定制版一键安装脚本
# 适用于 Ubuntu / Debian / WSL2
#
# 用法：
#   bash <(curl -fsSL https://raw.githubusercontent.com/bithcq/openclaw/main/scripts/install-custom.sh)
#
# 脚本逻辑：
#   1. 检查 Node.js ≥ 22
#   2. 检查/安装 pnpm
#   3. git clone 源码（已存在则 pull 更新）
#   4. pnpm install && pnpm build
#   5. 生成 .env 模板（如不存在）
#   6. 打印后续配置指引
# ============================================================

set -euo pipefail

# ---- 颜色输出 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ---- 配置 ----
REPO_URL="https://github.com/bithcq/openclaw.git"
INSTALL_DIR="${OPENCLAW_INSTALL_DIR:-$HOME/openclaw}"
REQUIRED_NODE_MAJOR=22

# ============================================================
# 第 0 步：安装系统依赖
# ============================================================
info "检查系统依赖..."

# 检测发行版
DISTRO=""
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO="${ID}"
fi

MISSING_PKGS=()
for cmd_pkg in git:git curl:curl make:build-essential python3:python3; do
    cmd="${cmd_pkg%%:*}"
    pkg="${cmd_pkg##*:}"
    if ! command -v "$cmd" &>/dev/null; then
        MISSING_PKGS+=("$pkg")
    fi
done

# Debian 额外需要 ca-certificates 和 gnupg（添加 NodeSource 源时用）
if [ "$DISTRO" = "debian" ]; then
    for pkg in ca-certificates gnupg; do
        dpkg -s "$pkg" &>/dev/null || MISSING_PKGS+=("$pkg")
    done
fi

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    info "安装缺失的系统包：${MISSING_PKGS[*]}"
    sudo apt update
    sudo apt install -y "${MISSING_PKGS[@]}"
    ok "系统依赖安装完成"
else
    ok "系统依赖已就绪"
fi

# ============================================================
# 第 1 步：检查 Node.js ≥ 22
# ============================================================
info "检查 Node.js 版本..."

if ! command -v node &>/dev/null; then
    fail "未检测到 Node.js，请先安装 Node.js >= ${REQUIRED_NODE_MAJOR}：
    curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo -E bash -
    sudo apt install -y nodejs"
fi

NODE_VERSION=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
    fail "Node.js 版本为 v${NODE_VERSION}，需要 >= ${REQUIRED_NODE_MAJOR}。请升级：
    curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo -E bash -
    sudo apt install -y nodejs"
fi

ok "Node.js v${NODE_VERSION}"

# ============================================================
# 第 2 步：检查/安装 pnpm
# ============================================================
info "检查 pnpm..."

if ! command -v pnpm &>/dev/null; then
    warn "未检测到 pnpm，正在通过 corepack 安装..."

    # 启用 corepack
    if command -v corepack &>/dev/null; then
        corepack enable 2>/dev/null || sudo corepack enable
        corepack prepare pnpm@latest --activate
    else
        fail "corepack 不可用，请手动安装 pnpm：
    npm install -g pnpm"
    fi

    if ! command -v pnpm &>/dev/null; then
        fail "pnpm 安装失败，请手动安装：npm install -g pnpm"
    fi
fi

ok "pnpm $(pnpm -v)"

# ============================================================
# 第 3 步：检查 git
# ============================================================
if ! command -v git &>/dev/null; then
    fail "未检测到 git，请先安装：sudo apt install -y git"
fi

# ============================================================
# 第 4 步：拉取/更新源码
# ============================================================
if [ -d "$INSTALL_DIR/.git" ]; then
    info "检测到已有仓库 ${INSTALL_DIR}，正在更新..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    info "正在克隆仓库到 ${INSTALL_DIR}..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

ok "源码已就绪：${INSTALL_DIR}"

# 配置自定义合并驱动，rebase 时自动保留定制版 README.md
git config merge.keep-custom.name "永远保留定制版 README.md"
git config merge.keep-custom.driver "cp %B %A"

# ============================================================
# 第 5 步：安装依赖
# ============================================================
info "安装依赖（pnpm install）..."
pnpm install

ok "依赖安装完成"

# ============================================================
# 第 6 步：构建
# ============================================================
info "构建项目（pnpm build）..."
pnpm build

ok "构建完成，产物在 ${INSTALL_DIR}/dist/"

# ============================================================
# 第 7 步：生成 .env 模板
# ============================================================
if [ ! -f "${INSTALL_DIR}/.env" ]; then
    if [ -f "${INSTALL_DIR}/.env.example" ]; then
        cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
        ok "已从 .env.example 生成 .env，请编辑填写配置"
    else
        warn ".env.example 不存在，请手动创建 .env"
    fi
else
    info ".env 已存在，跳过"
fi

# ============================================================
# 第 8 步：安装 PATH 入口
# ============================================================
BIN_DIR="$HOME/.local/bin"
BIN_PATH="${BIN_DIR}/openclaw"
NODE_BIN="$(command -v node)"
mkdir -p "$BIN_DIR"
cat > "$BIN_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_ROOT="${INSTALL_DIR}"
OPENCLAW_CLI="\${OPENCLAW_ROOT}/dist/index.js"
PREFERRED_NODE="${NODE_BIN}"

if [ -x "\${PREFERRED_NODE}" ]; then
  exec "\${PREFERRED_NODE}" "\${OPENCLAW_CLI}" "\$@"
fi

for candidate in \
  /usr/bin/node \
  /usr/local/bin/node \
  "\$HOME/.nvm/versions/node"/*/bin/node \
  "\$HOME/.volta/bin/node"
do
  if [ -x "\$candidate" ]; then
    exec "\$candidate" "\${OPENCLAW_CLI}" "\$@"
  fi
done

if command -v node >/dev/null 2>&1; then
  exec "\$(command -v node)" "\${OPENCLAW_CLI}" "\$@"
fi

echo "openclaw: node not found; install Node.js or update ~/.local/bin/openclaw" >&2
exit 127
EOF
chmod +x "$BIN_PATH"
ok "已创建 PATH 入口包装脚本：${BIN_PATH}"

# ============================================================
# 完成，打印后续指引
# ============================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} OpenClaw 定制版安装完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "后续步骤："
echo ""
echo "  1. 确认 ~/.local/bin 在 PATH 中（重新登录或执行 source ~/.profile）"
echo ""
echo "  2. 编辑环境变量配置："
echo "     nano ${INSTALL_DIR}/.env"
echo "     # 至少填写一个模型 API 密钥"
echo "     # 如需企业微信，填写 WECOM_* 相关配置"
echo ""
echo "  3. 运行 onboarding 向导并安装为系统服务："
echo "     openclaw onboard --install-daemon"
echo ""
echo "  4. 或者直接启动 Gateway："
echo "     openclaw gateway run --bind lan --port 18789"
echo ""
echo "详细配置说明请参阅 README.md"
echo ""
