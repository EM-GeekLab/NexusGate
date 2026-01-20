@echo off
setlocal EnableDelayedExpansion

REM NexusGate Windows 一键启动脚本
REM 该脚本会自动下载配置文件，设置环境变量并启动服务

title NexusGate 一键部署脚本

echo.
echo ==================================
echo 🚀 NexusGate 一键部署脚本
echo ==================================
echo.

REM 选择下载源
:select_download_source
echo 🌐 请选择下载源
echo ==================================
echo 1^) GitHub 官方源 ^(推荐海外用户^)
echo 2^) 国内镜像源 ^(推荐国内用户，更快更稳定^)
echo ==================================

:input_source_choice
set /p "source_choice=请选择 (1/2): "

if "%source_choice%"=="1" (
    set DOWNLOAD_SOURCE=github
    set COMPOSE_URL=https://raw.githubusercontent.com/EM-GeekLab/NexusGate/main/docker-compose.yaml
    echo ✅ 已选择 GitHub 官方源
    goto :check_docker
) else if "%source_choice%"=="2" (
    set DOWNLOAD_SOURCE=china
    set COMPOSE_URL=https://cnb.cool/EM-GeekLab/NexusGate/-/git/raw/main/docker-compose.cn.yaml
    echo ✅ 已选择国内镜像源
    goto :check_docker
) else (
    echo ❌ 请输入有效选项 ^(1 或 2^)
    goto :input_source_choice
)

echo.

REM 检查 Docker 是否安装
:check_docker
echo 📋 检查 Docker 环境...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker 未安装，请先安装 Docker Desktop！
    echo 💡 请访问 https://www.docker.com/products/docker-desktop/ 下载安装
    echo.
    pause
    exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
    docker-compose --version >nul 2>&1
    if errorlevel 1 (
        echo ❌ Docker Compose 未安装或未启动，请确保 Docker Desktop 正在运行
        echo 💡 请启动 Docker Desktop 后重试
        echo.
        pause
        exit /b 1
    )
)

echo ✅ Docker 环境检查通过
echo.

REM 下载配置文件
:download_configs
echo 📥 下载配置文件...

set "compose_file=docker-compose.yaml"
if "%DOWNLOAD_SOURCE%"=="china" (
    set "compose_file=docker-compose.cn.yaml"
)

if exist "%compose_file%" (
    echo ⚠️  %compose_file% 已存在，跳过下载
) else (
    echo 正在下载 %compose_file%...
    powershell -Command "try { Invoke-WebRequest -Uri '%COMPOSE_URL%' -OutFile '%compose_file%' -ErrorAction Stop } catch { Write-Host 'Error: ' + $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo ❌ 下载配置文件失败，请检查网络连接
        pause
        exit /b 1
    )
    echo ✅ %compose_file% 下载完成
)
echo.

REM 获取用户输入的密码
:get_user_passwords
echo ⚙️  配置密码设置
echo.
echo 💡 提示：建议使用强密码确保系统安全
echo.

REM 数据库密码输入
:input_db_password
echo 💾 数据库密码设置
echo 请输入数据库密码（至少8位，直接回车将自动生成随机密码）:
set /p "db_input=数据库密码: "

if "%db_input%"=="" (
    for /f %%i in ('powershell -Command "[System.Web.Security.Membership]::GeneratePassword(16, 4)"') do set DB_PASSWORD=%%i
    echo ✅ 已自动生成随机数据库密码（16位强密码）
    goto :input_admin_password
)

REM 检查密码长度
set "password_length=0"
set "temp_password=%db_input%"
:count_db_chars
if defined temp_password (
    set /a password_length+=1
    set "temp_password=%temp_password:~1%"
    goto count_db_chars
)

if %password_length% LSS 8 (
    echo ❌ 密码长度至少8位，请重新输入
    echo.
    goto :input_db_password
) else (
    set DB_PASSWORD=%db_input%
    echo ✅ 已设置自定义数据库密码
)
echo.

REM 管理员密钥输入  
:input_admin_password
echo 🔑 管理员密钥设置
echo 请输入管理员密钥（至少8位，直接回车将自动生成随机密钥）:
set /p "admin_input=管理员密钥: "

if "%admin_input%"=="" (
    for /f %%i in ('powershell -Command "[System.Web.Security.Membership]::GeneratePassword(16, 4)"') do set ADMIN_SECRET=%%i
    echo ✅ 已自动生成随机管理员密钥（16位强密钥）
    goto :input_web_port
)

REM 检查密钥长度
set "key_length=0"
set "temp_key=%admin_input%"
:count_admin_chars
if defined temp_key (
    set /a key_length+=1
    set "temp_key=%temp_key:~1%"
    goto count_admin_chars
)

if %key_length% LSS 8 (
    echo ❌ 密钥长度至少8位，请重新输入
    echo.
    goto :input_admin_password
) else (
    set ADMIN_SECRET=%admin_input%
    echo ✅ 已设置自定义管理员密钥
)
echo.

REM Web 端口输入
:input_web_port
echo 🌐 Web 服务端口设置
echo 请输入 Web 服务端口（1024-65535，默认 8080）:
set /p "port_input=Web 端口: "

if "%port_input%"=="" (
    set WEB_PORT=8080
    echo ✅ 使用默认端口 8080
    goto :end_input
)

REM 验证端口号是否为数字且在有效范围内
echo %port_input%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo ❌ 请输入有效的数字端口号
    echo.
    goto :input_web_port
)

if %port_input% LSS 1024 (
    echo ❌ 端口号不能小于 1024
    echo.
    goto :input_web_port
)

if %port_input% GTR 65535 (
    echo ❌ 端口号不能大于 65535
    echo.
    goto :input_web_port
)

set WEB_PORT=%port_input%
echo ✅ 已设置端口为 %port_input%

:end_input
echo.

REM 配置确认
echo 📋 配置摘要
echo ==================================
echo 数据库密码: [已设置]
echo 管理员密钥: [已设置]
echo Web 端口: %WEB_PORT%
echo ==================================
echo.
set /p "confirm=确认以上配置并继续部署？(y/N): "

if /i "%confirm%"=="y" (
    echo ✅ 配置确认，开始创建配置文件
    echo.
) else (
    echo ❌ 已取消部署
    pause
    exit /b 0
)

REM 创建环境变量文件
:create_env_file
if exist ".env" (
    echo ⚠️  .env 文件已存在，跳过创建
    echo 💡 如需重新生成，请删除 .env 文件后重新运行脚本
    echo.
) else (
    echo 📝 创建环境变量配置文件...
    
    REM 获取用户输入
    call :get_user_passwords
    
    REM 创建 .env 文件
    (
        echo # NexusGate 环境配置文件
        echo # 生成时间: %DATE% %TIME%
        echo.
        echo # ======================
        echo # 数据库配置
        echo # ======================
        echo POSTGRES_PASSWORD=!DB_PASSWORD!
        echo.
        echo # ======================
        echo # 管理员配置
        echo # ======================
        echo # 用于访问管理界面的密钥
        echo ADMIN_SUPER_SECRET=!ADMIN_SECRET!
        echo.
        echo # ======================
        echo # 服务配置
        echo # ======================
        echo # Web 服务端口（默认 8080）
        echo WEB_PORT=!WEB_PORT!
    ) > .env
    
    echo ✅ .env 文件创建完成
    echo.
    echo ⚠️  重要：请保存好以下配置信息
    echo ==================================
    echo 数据库密码: !DB_PASSWORD!
    echo 管理员密钥: !ADMIN_SECRET!
    echo 访问地址: http://localhost:!WEB_PORT!
    echo ==================================
    echo.
    echo 📝 完整配置已保存到 .env 文件中
    echo.
)

REM 启动服务
:start_services
echo 🚀 启动 NexusGate 服务...

set "compose_file=docker-compose.yaml"
if "%DOWNLOAD_SOURCE%"=="china" (
    set "compose_file=docker-compose.cn.yaml"
)

REM 检查是否使用新版 docker compose 命令
docker compose version >nul 2>&1
if errorlevel 1 (
    echo 使用 docker-compose 启动服务...
    docker-compose -f "%compose_file%" up -d
) else (
    echo 使用 docker compose 启动服务...
    docker compose -f "%compose_file%" up -d
)

if errorlevel 1 (
    echo ❌ 服务启动失败，请检查 Docker 是否正常运行
    echo 💡 请确保 Docker Desktop 已启动并正常运行
    pause
    exit /b 1
)

echo ✅ 服务启动完成！
echo.

REM 显示访问信息
:show_access_info
echo.
echo ====================================
echo 🎉 NexusGate 部署完成！
echo ====================================

REM 从 .env 文件读取配置
if exist ".env" (
    for /f "tokens=2 delims==" %%a in ('findstr "WEB_PORT=" .env') do set WEB_PORT=%%a
    for /f "tokens=2 delims==" %%a in ('findstr "ADMIN_SUPER_SECRET=" .env') do set ADMIN_SECRET=%%a
    
    if "!WEB_PORT!"=="" set WEB_PORT=8080
    
    echo 🌐 访问地址: http://localhost:!WEB_PORT!
    echo 🔑 管理员密钥: !ADMIN_SECRET!
) else (
    echo 🌐 访问地址: http://localhost:8080
    echo 🔑 管理员密钥: 请查看 .env 文件
)

echo.
echo 📖 使用说明:
echo 1. 在浏览器中打开上述地址
echo 2. 使用管理员密钥登录系统
echo 3. 开始配置您的第一个模型和应用
echo.
echo 🛠️  常用命令:
echo - 查看服务状态: docker compose ps
echo - 查看服务日志: docker compose logs -f
echo - 停止服务: docker compose down
echo - 重启服务: docker compose restart
echo.
echo ⚠️  安全提醒:
echo - 请妥善保管管理员密钥
echo - 生产环境请修改默认配置
echo - 定期备份数据库数据
echo.

pause