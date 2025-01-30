# 使用官方 Python 镜像
FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

# 复制后端代码到容器中
COPY ./backend /app

# 安装必要的系统依赖
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    fluidsynth \
    portaudio19-dev \
    build-essential && \
    update-ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
# 升级 pip
RUN pip install --upgrade pip
# 安装 Python 依赖
COPY ./backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
# 暴露端口
EXPOSE 8000
# 启动后端服务
CMD ["sh", "-c", "./start_app.sh"]