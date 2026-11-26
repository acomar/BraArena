FROM python:3.12-slim
LABEL org.opencontainers.image.source="https://github.com/acomar/BraArena"
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN useradd -r appuser
USER appuser
EXPOSE 3000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3000"]
