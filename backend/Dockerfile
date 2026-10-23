FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.lock /app/backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock
COPY backend /app/backend
ENV WATCHTOWER_DATABASE=/data/watchtower.sqlite3
RUN mkdir -p /data
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
