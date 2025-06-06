# Dockerfile
FROM python:3.9-slim

WORKDIR /app

# 安裝必要套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 確保相關的子目錄被包含
COPY cache cache
COPY epubs epubs
COPY modules modules
COPY static static
COPY templates templates
COPY titles titles
COPY app.py .
COPY . .

EXPOSE 5000

CMD ["python", "app.py"]
