#!/bin/bash

# NexusGate 一键启动脚本
# 该脚本会自动下载配置文件，设置环境变量并启动服务

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 NexusGate 一键部署脚本${NC}"
echo "===================================="

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
                echo -e "${GREEN}✅ 已选择 GitHub 官方源${NC}"
                break
                ;;
            2)
                DOWNLOAD_SOURCE="china"
                COMPOSE_URL="https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/docker-compose.cn.yaml"
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
    
    if [ ! -f "$compose_file" ]; then
        curl -fsSL "$COMPOSE_URL" -o "$compose_file"
        echo -e "${GREEN}✅ $compose_file 下载完成${NC}"
    else
        echo -e "${YELLOW}⚠️  $compose_file 已存在，跳过下载${NC}"
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
    
    # 配置确认
    echo -e "${BLUE}📋 配置摘要${NC}"
    echo "=================================="
    echo -e "数据库密码: ${GREEN}[已设置]${NC}"
    echo -e "管理员密钥: ${GREEN}[已设置]${NC}"  
    echo -e "Web 端口: ${GREEN}${WEB_PORT}${NC}"
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
        
        echo -e "${GREEN}✅ .env 文件创建完成${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  重要：请保存好以下配置信息${NC}"
        echo "=================================="
        echo -e "数据库密码: ${GREEN}${DB_PASSWORD}${NC}"
        echo -e "管理员密钥: ${GREEN}${ADMIN_SECRET}${NC}"
        echo -e "访问地址: ${GREEN}http://localhost:${WEB_PORT}${NC}"
        echo "=================================="
        echo ""
        echo -e "${BLUE}📝 完整配置已保存到 .env 文件中${NC}"
        
    else
        echo -e "${YELLOW}⚠️  .env 文件已存在，跳过创建${NC}"
        echo -e "${BLUE}💡 如需重新生成，请删除 .env 文件后重新运行脚本${NC}"
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
    if docker compose version &> /dev/null; then
        docker compose -f "$compose_file" up -d
    else
        docker-compose -f "$compose_file" up -d
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
        
        echo -e "🌐 访问地址: ${GREEN}http://localhost:${WEB_PORT:-8080}${NC}"
        echo -e "🔑 管理员密钥: ${GREEN}${ADMIN_SECRET}${NC}"
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
}

# 主函数
main() {
    select_download_source
    check_docker
    download_configs
    create_env_file
    start_services
    show_access_info
}

# 运行主函数
main
