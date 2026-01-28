#!/bin/bash

# NexusGate 一键启动脚本
# 该脚本会自动下载配置文件，设置环境变量并启动服务

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 NexusGate 一键部署脚本${NC}"
echo "===================================="

# 全局变量
DOWNLOAD_SOURCE=""
COMPOSE_URL=""
MONITORING_COMPOSE_URL=""
PROMETHEUS_URL=""
GRAFANA_DATASOURCE_URL=""
GRAFANA_DASHBOARD_PROVIDER_URL=""
GRAFANA_DASHBOARD_URL=""
ENABLE_MONITORING="false"

# 选择下载源
select_download_source() {
    echo -e "${BLUE}🌐 请选择下载源${NC}"
    echo "===================================="
    echo "1) GitHub 官方源 (推荐海外用户)"
    echo "2) 国内镜像源 (推荐国内用户，更快更稳定)"
    echo "===================================="

    while true; do
        read -p "请选择 (1/2): " choice
        case $choice in
            1)
                DOWNLOAD_SOURCE="github"
                COMPOSE_URL="https://raw.githubusercontent.com/EM-GeekLab/NexusGate/main/docker-compose.yaml"
                MONITORING_COMPOSE_URL="https://raw.githubusercontent.com/EM-GeekLab/NexusGate/main/docker-compose.monitoring.yaml"
                PROMETHEUS_URL="https://raw.githubusercontent.com/EM-GeekLab/NexusGate/main/prometheus/prometheus.yml"
                GRAFANA_DATASOURCE_URL="https://raw.githubusercontent.com/EM-GeekLab/NexusGate/main/grafana/provisioning/datasources/prometheus.yml"
                GRAFANA_DASHBOARD_PROVIDER_URL="https://raw.githubusercontent.com/EM-GeekLab/NexusGate/main/grafana/provisioning/dashboards/dashboards.yml"
                GRAFANA_DASHBOARD_URL="https://raw.githubusercontent.com/EM-GeekLab/NexusGate/main/grafana/provisioning/dashboards/json/nexusgate-dashboard.json"
                echo -e "${GREEN}✅ 已选择 GitHub 官方源${NC}"
                break
                ;;
            2)
                DOWNLOAD_SOURCE="china"
                COMPOSE_URL="https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/docker-compose.cn.yaml"
                MONITORING_COMPOSE_URL="https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/docker-compose.monitoring.yaml"
                PROMETHEUS_URL="https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/prometheus/prometheus.yml"
                GRAFANA_DATASOURCE_URL="https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/grafana/provisioning/datasources/prometheus.yml"
                GRAFANA_DASHBOARD_PROVIDER_URL="https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/grafana/provisioning/dashboards/dashboards.yml"
                GRAFANA_DASHBOARD_URL="https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/grafana/provisioning/dashboards/json/nexusgate-dashboard.json"
                echo -e "${GREEN}✅ 已选择国内镜像源${NC}"
                break
                ;;
            *)
                echo -e "${RED}❌ 请输入有效选项 (1 或 2)${NC}"
                ;;
        esac
    done
    echo ""
}

# 询问是否安装监控组件
ask_monitoring() {
    echo -e "${BLUE}📊 监控组件配置${NC}"
    echo "===================================="
    echo "NexusGate 支持 Prometheus + Grafana 监控栈，可以可视化以下指标："
    echo "  - 请求数量和速率"
    echo "  - 延迟分布 (P50/P95/P99)"
    echo "  - Token 使用量"
    echo "  - 错误率和成功率"
    echo "  - 模型和 API 格式分布"
    echo ""
    echo -e "${YELLOW}是否安装 Prometheus + Grafana 监控组件？${NC}"
    echo "1) 是 - 安装完整监控栈 (额外占用约 500MB 内存)"
    echo "2) 否 - 仅安装核心服务 (推荐资源有限的环境)"
    echo "===================================="

    while true; do
        read -p "请选择 (1/2) [默认: 2]: " monitor_choice
        case $monitor_choice in
            1)
                ENABLE_MONITORING="true"
                echo -e "${GREEN}✅ 将安装 Prometheus + Grafana 监控组件${NC}"
                break
                ;;
            2|"")
                ENABLE_MONITORING="false"
                echo -e "${GREEN}✅ 仅安装核心服务${NC}"
                break
                ;;
            *)
                echo -e "${RED}❌ 请输入有效选项 (1 或 2)${NC}"
                ;;
        esac
    done
    echo ""
}

# 检查 Docker 是否安装和权限
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker 未安装，请先安装 Docker！${NC}"
        echo -e "${YELLOW}请参考 README.md 中的 Docker 安装指南${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose 未安装，请先安装 Docker Compose！${NC}"
        echo -e "${YELLOW}请参考 README.md 中的 Docker 安装指南${NC}"
        exit 1
    fi

    # 检查 Docker 权限
    echo -e "${BLUE}🔍 检查 Docker 权限...${NC}"
    if ! docker ps &> /dev/null; then
        echo -e "${RED}❌ Docker 权限不足！${NC}"
        echo ""
        echo "请以 root 用户或 sudo 权限运行脚本:"
        echo -e "   ${BLUE}sudo bash quick-start.sh${NC}"
        echo ""
        exit 1
    fi

    echo -e "${GREEN}✅ Docker 环境和权限检查通过${NC}"
}

# 生成随机密码
generate_password() {
    openssl rand -base64 32 2>/dev/null || dd if=/dev/urandom bs=1 count=32 2>/dev/null | base64 | tr -d "=+/" | cut -c1-25
}

# 下载配置文件
download_configs() {
    echo -e "${BLUE}📥 下载配置文件...${NC}"

    local compose_file="docker-compose.yaml"
    if [ "$DOWNLOAD_SOURCE" = "china" ]; then
        compose_file="docker-compose.cn.yaml"
    fi

    # 下载主配置文件
    if [ ! -f "$compose_file" ]; then
        curl -fsSL "$COMPOSE_URL" -o "$compose_file"
        echo -e "${GREEN}✅ $compose_file 下载完成${NC}"
    else
        echo -e "${YELLOW}⚠️  $compose_file 已存在，跳过下载${NC}"
    fi

    # 下载监控组件配置文件
    if [ "$ENABLE_MONITORING" = "true" ]; then
        echo -e "${BLUE}📥 下载监控组件配置文件...${NC}"

        # 下载 docker-compose.monitoring.yaml
        if [ ! -f "docker-compose.monitoring.yaml" ]; then
            curl -fsSL "$MONITORING_COMPOSE_URL" -o "docker-compose.monitoring.yaml"
            echo -e "${GREEN}✅ docker-compose.monitoring.yaml 下载完成${NC}"
        else
            echo -e "${YELLOW}⚠️  docker-compose.monitoring.yaml 已存在，跳过下载${NC}"
        fi

        # 创建 prometheus 目录并下载配置
        mkdir -p prometheus
        if [ ! -f "prometheus/prometheus.yml" ]; then
            curl -fsSL "$PROMETHEUS_URL" -o "prometheus/prometheus.yml"
            echo -e "${GREEN}✅ prometheus/prometheus.yml 下载完成${NC}"
        else
            echo -e "${YELLOW}⚠️  prometheus/prometheus.yml 已存在，跳过下载${NC}"
        fi

        # 创建 grafana provisioning 目录结构
        mkdir -p grafana/provisioning/datasources
        mkdir -p grafana/provisioning/dashboards/json

        # 下载 Grafana 数据源配置
        if [ ! -f "grafana/provisioning/datasources/prometheus.yml" ]; then
            curl -fsSL "$GRAFANA_DATASOURCE_URL" -o "grafana/provisioning/datasources/prometheus.yml"
            echo -e "${GREEN}✅ grafana/provisioning/datasources/prometheus.yml 下载完成${NC}"
        else
            echo -e "${YELLOW}⚠️  grafana/provisioning/datasources/prometheus.yml 已存在，跳过下载${NC}"
        fi

        # 下载 Grafana Dashboard 提供者配置
        if [ ! -f "grafana/provisioning/dashboards/dashboards.yml" ]; then
            curl -fsSL "$GRAFANA_DASHBOARD_PROVIDER_URL" -o "grafana/provisioning/dashboards/dashboards.yml"
            echo -e "${GREEN}✅ grafana/provisioning/dashboards/dashboards.yml 下载完成${NC}"
        else
            echo -e "${YELLOW}⚠️  grafana/provisioning/dashboards/dashboards.yml 已存在，跳过下载${NC}"
        fi

        # 下载 NexusGate Dashboard
        if [ ! -f "grafana/provisioning/dashboards/json/nexusgate-dashboard.json" ]; then
            curl -fsSL "$GRAFANA_DASHBOARD_URL" -o "grafana/provisioning/dashboards/json/nexusgate-dashboard.json"
            echo -e "${GREEN}✅ NexusGate Grafana Dashboard 下载完成${NC}"
        else
            echo -e "${YELLOW}⚠️  NexusGate Grafana Dashboard 已存在，跳过下载${NC}"
        fi
    fi
}

# 获取用户输入的密码
get_user_passwords() {
    echo -e "${BLUE}⚙️  配置密码设置${NC}"
    echo ""
    echo -e "${YELLOW}💡 提示：为了安全起见，密码输入时不会显示字符${NC}"
    echo ""

    # 数据库密码输入
    echo -e "${YELLOW}请设置数据库密码 (至少8位，直接回车将自动生成随机密码):${NC}"
    while true; do
        read -s -p "数据库密码: " db_input
        echo ""

        if [ -z "$db_input" ]; then
            DB_PASSWORD=$(generate_password)
            echo -e "${GREEN}✅ 已自动生成随机数据库密码（16位强密码）${NC}"
            break
        elif [ ${#db_input} -lt 8 ]; then
            echo -e "${RED}❌ 密码长度至少8位，请重新输入${NC}"
            continue
        else
            DB_PASSWORD="$db_input"
            echo -e "${GREEN}✅ 已设置自定义数据库密码${NC}"
            break
        fi
    done

    echo ""

    # 管理员密钥输入
    echo -e "${YELLOW}请设置管理员密钥 (至少8位，直接回车将自动生成随机密钥):${NC}"
    while true; do
        read -s -p "管理员密钥: " admin_input
        echo ""

        if [ -z "$admin_input" ]; then
            ADMIN_SECRET=$(generate_password)
            echo -e "${GREEN}✅ 已自动生成随机管理员密钥（16位强密钥）${NC}"
            break
        elif [ ${#admin_input} -lt 8 ]; then
            echo -e "${RED}❌ 密钥长度至少8位，请重新输入${NC}"
            continue
        else
            ADMIN_SECRET="$admin_input"
            echo -e "${GREEN}✅ 已设置自定义管理员密钥${NC}"
            break
        fi
    done

    echo ""

    # Web 端口输入
    echo -e "${YELLOW}请设置 Web 服务端口 (1024-65535，默认 8080):${NC}"
    while true; do
        read -p "Web 端口: " port_input

        if [ -z "$port_input" ]; then
            WEB_PORT="8080"
            echo -e "${GREEN}✅ 使用默认端口 8080${NC}"
            break
        elif [[ "$port_input" =~ ^[0-9]+$ ]] && [ "$port_input" -ge 1024 ] && [ "$port_input" -le 65535 ]; then
            WEB_PORT="$port_input"
            echo -e "${GREEN}✅ 已设置端口为 $port_input${NC}"
            break
        else
            echo -e "${RED}❌ 请输入有效的端口号 (1024-65535)${NC}"
        fi
    done

    echo ""

    # 如果启用了监控，配置 Grafana 密码
    if [ "$ENABLE_MONITORING" = "true" ]; then
        echo -e "${CYAN}📊 监控组件配置${NC}"
        echo ""

        # Prometheus 端口
        echo -e "${YELLOW}请设置 Prometheus 端口 (默认 9090):${NC}"
        while true; do
            read -p "Prometheus 端口: " prom_port_input

            if [ -z "$prom_port_input" ]; then
                PROMETHEUS_PORT="9090"
                echo -e "${GREEN}✅ 使用默认端口 9090${NC}"
                break
            elif [[ "$prom_port_input" =~ ^[0-9]+$ ]] && [ "$prom_port_input" -ge 1024 ] && [ "$prom_port_input" -le 65535 ]; then
                PROMETHEUS_PORT="$prom_port_input"
                echo -e "${GREEN}✅ 已设置 Prometheus 端口为 $prom_port_input${NC}"
                break
            else
                echo -e "${RED}❌ 请输入有效的端口号 (1024-65535)${NC}"
            fi
        done

        echo ""

        # Grafana 端口
        echo -e "${YELLOW}请设置 Grafana 端口 (默认 3001):${NC}"
        while true; do
            read -p "Grafana 端口: " grafana_port_input

            if [ -z "$grafana_port_input" ]; then
                GRAFANA_PORT="3001"
                echo -e "${GREEN}✅ 使用默认端口 3001${NC}"
                break
            elif [[ "$grafana_port_input" =~ ^[0-9]+$ ]] && [ "$grafana_port_input" -ge 1024 ] && [ "$grafana_port_input" -le 65535 ]; then
                GRAFANA_PORT="$grafana_port_input"
                echo -e "${GREEN}✅ 已设置 Grafana 端口为 $grafana_port_input${NC}"
                break
            else
                echo -e "${RED}❌ 请输入有效的端口号 (1024-65535)${NC}"
            fi
        done

        echo ""

        # Grafana 密码
        echo -e "${YELLOW}请设置 Grafana 管理员密码 (至少8位，直接回车将使用默认密码 'admin'):${NC}"
        while true; do
            read -s -p "Grafana 密码: " grafana_pass_input
            echo ""

            if [ -z "$grafana_pass_input" ]; then
                GRAFANA_PASSWORD="admin"
                echo -e "${YELLOW}⚠️  使用默认密码 'admin'，建议登录后修改${NC}"
                break
            elif [ ${#grafana_pass_input} -lt 8 ]; then
                echo -e "${RED}❌ 密码长度至少8位，请重新输入${NC}"
                continue
            else
                GRAFANA_PASSWORD="$grafana_pass_input"
                echo -e "${GREEN}✅ 已设置自定义 Grafana 密码${NC}"
                break
            fi
        done

        echo ""
    fi

    # 配置确认
    echo -e "${BLUE}📋 配置摘要${NC}"
    echo "=================================="
    echo -e "数据库密码: ${GREEN}[已设置]${NC}"
    echo -e "管理员密钥: ${GREEN}[已设置]${NC}"
    echo -e "Web 端口: ${GREEN}${WEB_PORT}${NC}"
    if [ "$ENABLE_MONITORING" = "true" ]; then
        echo -e "监控组件: ${CYAN}已启用${NC}"
        echo -e "  - Prometheus 端口: ${GREEN}${PROMETHEUS_PORT}${NC}"
        echo -e "  - Grafana 端口: ${GREEN}${GRAFANA_PORT}${NC}"
        echo -e "  - Grafana 密码: ${GREEN}[已设置]${NC}"
    else
        echo -e "监控组件: ${YELLOW}未启用${NC}"
    fi
    echo "=================================="
    echo ""
    echo -e "${YELLOW}确认以上配置并继续部署？(y/N)${NC}"
    read -p "请输入选择: " confirm

    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}✅ 配置确认，开始创建配置文件${NC}"
    else
        echo -e "${RED}❌ 已取消部署${NC}"
        exit 0
    fi

    echo ""
}

# 创建环境变量文件
create_env_file() {
    if [ ! -f ".env" ]; then
        echo -e "${BLUE}📝 创建环境变量配置文件...${NC}"

        # 获取用户输入
        get_user_passwords

        cat > .env << EOF
# NexusGate 环境配置文件
# 生成时间: $(date)

# ======================
# 数据库配置
# ======================
POSTGRES_PASSWORD=${DB_PASSWORD}

# ======================
# 管理员配置
# ======================
# 用于访问管理界面的密钥
ADMIN_SUPER_SECRET=${ADMIN_SECRET}

# ======================
# 服务配置
# ======================
# Web 服务端口（默认 8080）
WEB_PORT=${WEB_PORT}
EOF

        # 如果启用了监控，添加监控相关配置
        if [ "$ENABLE_MONITORING" = "true" ]; then
            # Build the Grafana dashboard embed URL
            GRAFANA_DASHBOARD_EMBED_URL="http://localhost:${GRAFANA_PORT}/d/nexusgate-overview/nexusgate-llm-gateway?orgId=1&refresh=30s&kiosk"

            cat >> .env << EOF

# ======================
# 监控组件配置
# ======================
# 是否启用监控组件
ENABLE_MONITORING=true

# Prometheus 端口
PROMETHEUS_PORT=${PROMETHEUS_PORT}

# Grafana 配置
GRAFANA_PORT=${GRAFANA_PORT}
GRAFANA_USER=admin
GRAFANA_PASSWORD=${GRAFANA_PASSWORD}

# Grafana 仪表板嵌入配置 (NexusGate Overview 页面中嵌入 Grafana)
GRAFANA_DASHBOARDS=[{"id":"overview","label":"Grafana","url":"${GRAFANA_DASHBOARD_EMBED_URL}"}]
EOF
        else
            cat >> .env << EOF

# ======================
# 监控组件配置
# ======================
# 是否启用监控组件
ENABLE_MONITORING=false
EOF
        fi

        echo -e "${GREEN}✅ .env 文件创建完成${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  重要：请保存好以下配置信息${NC}"
        echo "=================================="
        echo -e "数据库密码: ${GREEN}${DB_PASSWORD}${NC}"
        echo -e "管理员密钥: ${GREEN}${ADMIN_SECRET}${NC}"
        echo -e "访问地址: ${GREEN}http://localhost:${WEB_PORT}${NC}"
        if [ "$ENABLE_MONITORING" = "true" ]; then
            echo -e "Prometheus: ${CYAN}http://localhost:${PROMETHEUS_PORT}${NC}"
            echo -e "Grafana: ${CYAN}http://localhost:${GRAFANA_PORT}${NC}"
            echo -e "Grafana 用户名: ${CYAN}admin${NC}"
            echo -e "Grafana 密码: ${CYAN}${GRAFANA_PASSWORD}${NC}"
        fi
        echo "=================================="
        echo ""
        echo -e "${BLUE}📝 完整配置已保存到 .env 文件中${NC}"

    else
        echo -e "${YELLOW}⚠️  .env 文件已存在，跳过创建${NC}"
        echo -e "${BLUE}💡 如需重新生成，请删除 .env 文件后重新运行脚本${NC}"

        # 从现有 .env 读取监控配置
        if [ -f ".env" ]; then
            ENABLE_MONITORING=$(grep "ENABLE_MONITORING=" .env 2>/dev/null | cut -d '=' -f2 | tr -d ' ' || echo "false")
        fi
    fi
}

# 启动服务
start_services() {
    echo -e "${BLUE}🚀 启动 NexusGate 服务...${NC}"

    local compose_file="docker-compose.yaml"
    if [ "$DOWNLOAD_SOURCE" = "china" ]; then
        compose_file="docker-compose.cn.yaml"
    fi

    # 检查是否使用新版 docker compose 命令
    local compose_cmd="docker compose"
    if ! docker compose version &> /dev/null; then
        compose_cmd="docker-compose"
    fi

    # 启动服务
    if [ "$ENABLE_MONITORING" = "true" ]; then
        echo -e "${CYAN}📊 启动核心服务和监控组件...${NC}"
        $compose_cmd -f "$compose_file" -f "docker-compose.monitoring.yaml" up -d
    else
        echo -e "${GREEN}🚀 启动核心服务...${NC}"
        $compose_cmd -f "$compose_file" up -d
    fi

    echo -e "${GREEN}✅ 服务启动完成！${NC}"
}

# 显示访问信息
show_access_info() {
    echo ""
    echo "===================================="
    echo -e "${GREEN}🎉 NexusGate 部署完成！${NC}"
    echo "===================================="

    # 从 .env 文件读取配置
    if [ -f ".env" ]; then
        WEB_PORT=$(grep "WEB_PORT=" .env | cut -d '=' -f2 | tr -d ' ')
        ADMIN_SECRET=$(grep "ADMIN_SUPER_SECRET=" .env | cut -d '=' -f2 | tr -d ' ')
        ENABLE_MONITORING=$(grep "ENABLE_MONITORING=" .env | cut -d '=' -f2 | tr -d ' ')

        echo -e "🌐 NexusGate 访问地址: ${GREEN}http://localhost:${WEB_PORT:-8080}${NC}"
        echo -e "🔑 管理员密钥: ${GREEN}${ADMIN_SECRET}${NC}"

        if [ "$ENABLE_MONITORING" = "true" ]; then
            PROMETHEUS_PORT=$(grep "PROMETHEUS_PORT=" .env | cut -d '=' -f2 | tr -d ' ')
            GRAFANA_PORT=$(grep "GRAFANA_PORT=" .env | cut -d '=' -f2 | tr -d ' ')
            GRAFANA_PASSWORD=$(grep "GRAFANA_PASSWORD=" .env | cut -d '=' -f2 | tr -d ' ')

            echo ""
            echo -e "${CYAN}📊 监控组件访问信息:${NC}"
            echo -e "  Prometheus: ${CYAN}http://localhost:${PROMETHEUS_PORT:-9090}${NC}"
            echo -e "  Grafana: ${CYAN}http://localhost:${GRAFANA_PORT:-3001}${NC}"
            echo -e "  Grafana 用户名: ${CYAN}admin${NC}"
            echo -e "  Grafana 密码: ${CYAN}${GRAFANA_PASSWORD:-admin}${NC}"
        fi
    else
        echo -e "🌐 访问地址: ${GREEN}http://localhost:8080${NC}"
        echo -e "🔑 管理员密钥: ${YELLOW}请查看 .env 文件${NC}"
    fi

    echo ""
    echo -e "${BLUE}📖 使用说明:${NC}"
    echo "1. 在浏览器中打开上述地址"
    echo "2. 使用管理员密钥登录系统"
    echo "3. 开始配置您的第一个模型和应用，其中 BaseURL 需要设置为 http://localhost:${WEB_PORT:-8080}/v1/"
    echo "后续您也可以通过该服务器的 IP 地址或域名访问 NexusGate，BaseURL 需要设置为 http://<服务器IP或域名>:${WEB_PORT:-8080}/v1/"

    if [ "$ENABLE_MONITORING" = "true" ]; then
        echo ""
        echo -e "${CYAN}📊 监控使用说明:${NC}"
        echo "1. 访问 Grafana 地址并使用上述凭证登录"
        echo "2. 在 Dashboards 中找到 'NexusGate LLM Gateway' 仪表板"
        echo "3. 查看请求量、延迟、Token 使用量等指标"
        echo ""
        echo -e "${YELLOW}💡 提示: NexusGate 的 /metrics 端点可被任何 Prometheus 实例抓取${NC}"
    fi
}

# 主函数
main() {
    select_download_source
    ask_monitoring
    check_docker
    download_configs
    create_env_file
    start_services
    show_access_info
}

# 运行主函数
main
