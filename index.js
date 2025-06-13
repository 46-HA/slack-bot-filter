require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const bodyParser = require('body-parser');

const app = express();
const slack = new WebClient(process.env.TOKEN);
const port = process.env.PORT;

const bannedWords = process.env.BANNED_WORDS
  ? process.env.BANNED_WORDS.split(',').map(w => w.trim().toLowerCase())
  : [];

let botUserId;

(async () => {
  try {
    const authRes = await slack.auth.test();
    botUserId = authRes.user_id;
  } catch (e) {
    console.error('Failed to get bot user ID:', e);
    process.exit(1);
  }
})();

app.use(bodyParser.json());

function verifySlackRequest(req, res, buf) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const sigBaseString = `v0:${timestamp}:${buf.toString()}`;
  const mySignature =
    'v0=' +
    crypto
      .createHmac('sha256', process.env.SIGNING)
      .update(sigBaseString)
      .digest('hex');
  const slackSignature = req.headers['x-slack-signature'];
  if (
    !slackSignature ||
    !crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))
  ) {
    throw new Error('signature failed');
  }
}

app.use((req, res, next) => {
  if (req.headers['x-slack-signature']) {
    try {
      bodyParser.json({ verify: verifySlackRequest })(req, res, next);
    } catch {
      return res.status(400).send('Bad signature');
    }
  } else {
    next();
  }
});

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === 'url_verification') {
    return res.status(200).send({ challenge });
  }
  if (event && event.type === 'message' && !event.subtype) {
    if (event.user === botUserId) return res.sendStatus(200);

    const text = event.text?.toLowerCase();
    if (!text) return res.sendStatus(200);

    const matchedWords = bannedWords.filter(word => text.includes(word));
    if (matchedWords.length === 0) return res.sendStatus(200);

    const uniqueMatchedWords = [...new Set(matchedWords)];

    try {
      const firehouseChannelId = process.env.FIREHOUSE;
      if (!firehouseChannelId) {
        console.error('FIREHOUSE env variable (channel ID) not set');
        return res.sendStatus(200);
      }

      const permalink = await slack.chat.getPermalink({
        channel: event.channel,
        message_ts: event.ts,
      });

      const userInfo = await slack.users.info({ user: event.user });
      const username = userInfo.user?.real_name || userInfo.user?.name || `<@${event.user}>`;

      await slack.chat.postMessage({
        channel: firehouseChannelId,
        text: `@hussein \`${uniqueMatchedWords.join('`, `')}\`\n*user:* <@${event.user}> (${username})\n*message:* >>> ${event.text}\n🔗 <${permalink.permalink}>`
      });
    } catch (err) {
      console.error('error:', err);
    }
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`${port}`);
});
