require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const bodyParser = require('body-parser');

const app = express();
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const port = process.env.PORT;

const bannedWords = process.env.BANNED_WORDS
  ? process.env.BANNED_WORDS.split(',').map(w => w.trim().toLowerCase())
  : [];

let botUserId;

(async () => {
  const authRes = await slack.auth.test();
  botUserId = authRes.user_id;
})();

function verifySlackRequest(req, res, buf) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const sigBaseString = `v0:${timestamp}:${buf.toString()}`;
  const mySignature =
    'v0=' +
    crypto
      .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
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

app.use(bodyParser.json({ verify: verifySlackRequest }));

function normalizeText(text) {
  const substitutions = {
    '@': 'a',
    '!': 'i',
    '1': 'i',
    '$': 's',
    '0': 'o',
    '3': 'e',
    '*': '',
  };
  return text
    .toLowerCase()
    .split('')
    .map(c => substitutions[c] || c)
    .join('')
    .replace(/[^a-z]/g, '');
}

function buildLooseRegex(word) {
  const substitutions = {
    a: 'a@',
    i: 'i!1',
    s: 's$',
    o: 'o0',
    e: 'e3',
    c: 'c(',
    k: 'k',
    h: 'h#',
    n: 'n',
    l: 'l1|!',
  };
  let pattern = '';
  for (const char of word) {
    const chars = substitutions[char] || char;
    pattern += `[${chars}]+\\s*`;
  }
  return new RegExp(pattern, 'i');
}

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;
  if (type === 'url_verification') return res.status(200).send({ challenge });
  if (event && event.type === 'message' && !event.subtype) {
    if (event.user === botUserId) return res.sendStatus(200);

    const rawText = event.text || '';
    const text = rawText.toLowerCase();
    const normalizedText = normalizeText(text);

    const matchedWords = bannedWords.filter(word => {
      const regex = buildLooseRegex(word);
      return regex.test(text) || normalizedText.includes(word);
    });

    if (matchedWords.length > 0) {
      await slack.chat.postMessage({
        channel: event.channel,
        text: 'profanity detected',
      });
    }
  }
  res.sendStatus(200);
});

app.listen(port);
