const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const bodyParser = require('body-parser');
const Airtable = require('airtable');
require('dotenv').config();

const app = express();
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const userSlack = new WebClient(process.env.SLACK_APP_TOKEN);
const port = process.env.PORT;

const bannedWords = fs.readFileSync('./.profanitylist', 'utf-8')
  .split('\n')
  .map(w => w.trim().toLowerCase())
  .filter(w => w.length > 0 && !w.startsWith('#'));

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const airtableTable = process.env.AIRTABLE_TABLE;

let botUserId;

(async () => {
  const authRes = await slack.auth.test();
  botUserId = authRes.user_id;
})();

function verifySlackRequest(req, res, buf) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const sigBaseString = `v0:${timestamp}:${buf.toString()}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET).update(sigBaseString).digest('hex');
  const slackSignature = req.headers['x-slack-signature'];
  if (!slackSignature || !crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
    throw new Error('signature failed');
  }
}

app.use(bodyParser.json({ verify: verifySlackRequest }));

function normalizeChar(char) {
  const substitutions = {
    '@': 'a', '!': 'i', '1': 'i', '$': 's', '0': 'o', '3': 'e', '4': 'a', '*': '', '#': 'h',
    '|': 'i', '+': '', '^': '', '%': '', '&': '', '(': '', ')': '', '_': '', '=': '', '`': '', '~': ''
  };
  return substitutions[char] || char;
}

function normalizeText(text) {
  return text.toLowerCase().split('').map(c => normalizeChar(c)).join('').replace(/[^a-z]/g, '');
}

function buildLooseRegex(word) {
  let pattern = '';
  for (const char of word) {
    pattern += `${char}+[^a-zA-Z0-9]*`;
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
      return regex.test(normalizedText);
    });

    if (matchedWords.length > 0) {
      try {
        const permalink = await slack.chat.getPermalink({
          channel: event.channel,
          message_ts: event.ts,
        });

        const userInfo = await slack.users.info({ user: event.user });
        const username = userInfo.user?.real_name || userInfo.user?.name || `<@${event.user}>`;

        await slack.chat.postMessage({
          channel: 'C091Y7GSQ7J',  //change this to your channel
          text: `:siren-real: Message "${event.text}" auto deleted in <#${event.channel}>. It was sent by: <@${event.user}>. :siren-real: \n 🔗 <${permalink.permalink}> \n Reply with :white_check_mark: once dealt with.`
        });

        await userSlack.chat.delete({
          channel: event.channel,
          ts: event.ts
        });

        await slack.chat.postEphemeral({
          channel: event.channel,
          user: event.user,
          text: ':siren-real: MESSAGE DELETED :siren-real:\nYour message violated <https://hackclub.com/conduct/|Hack Club\'s Code of Conduct>. A Fire Department member should contact you soon. If you believe this was an error, please let us know. Using words that violate our Code of Conduct can result in a *permanent ban* depending on their severity. Please try to keep Hack Club a safe space for everyone. Thank you.'
        });

        await slack.chat.postMessage({
          channel: event.user,
          text: ':siren-real: MESSAGE DELETED :siren-real:\nYour message violated <https://hackclub.com/conduct/|Hack Club\'s Code of Conduct>. A Fire Department member should contact you soon. If you believe this was an error, please let us know. Using words that violate our Code of Conduct can result in a *permanent ban* depending on their severity. Please try to keep Hack Club a safe space for everyone. Thank you.'
        });

        await base(airtableTable).create({
          "Display Name (user)": username,
          "User ID": event.user,
          "Message": event.text
        });

      } catch (err) {
        console.error('error:', err);
      }
    }
  }

  res.sendStatus(200);
});

app.listen(port);
