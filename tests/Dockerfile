FROM node:22-alpine
RUN apk add --no-cache chromium && npm install --prefix /opt/test playwright-core@1.56.1
ENV NODE_PATH=/opt/test/node_modules
WORKDIR /tests
COPY browser.cjs .
CMD ["node","browser.cjs"]
