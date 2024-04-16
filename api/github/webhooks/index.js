const { createNodeMiddleware, createProbot } = require("probot");

const app = require("../../../index");
const probot = createProbot({
  id: process.env.APP_ID,
  secret: process.env.WEBHOOK_SECRET,
  privateKey: process.env.PRIVATE_KEY,
});

module.exports = createNodeMiddleware(app, {
  probot,
  webhooksPath: "/api/github/webhooks",
});