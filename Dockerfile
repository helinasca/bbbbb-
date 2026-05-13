FROM node:18-slim

# FFmpeg kur
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3721

CMD ["node", "server.js"]
