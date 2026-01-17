FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE ${PORT:-3050}

RUN chmod +x /app/docker/app/entrypoint.sh

ENTRYPOINT ["./docker/app/entrypoint.sh"]
CMD ["npm", "start"]
