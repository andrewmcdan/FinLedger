FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run manual:pdf && cp "docs/User Manual/FinLedger_User_Manual.pdf" "web/pages/public/FinLedger_User_Manual.pdf"

EXPOSE ${PORT:-3050}

CMD ["npm", "start"]
