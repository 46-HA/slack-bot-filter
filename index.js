//remove slash commands
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const bodyParser = require('body-parser');
const Airtable = require('airtable');

const app = express();
const slack = new WebClient(process.env.TOKEN);
const userSlack = new WebClient(process.env.USER_TOKEN);
const port = process.env.PORT || 3001;

const softPhrases = fs.readFileSync('./.profanitylist', 'utf-8')
  .split('\n')
  .map(line => line.trim().toLowerCase())
  .filter(line => line.length > 0 && !line.startsWith('#'));

const hardPhrases = fs.readFileSync('./.slurlist', 'utf-8')
  .split('\n')
  .map(line => line.trim().toLowerCase())
  .filter(line => line.length > 0 && !line.startsWith('#'));

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
  const mySignature = 'v0=' + crypto.createHmac('sha256', process.env.SIGNING).update(sigBaseString).digest('hex');
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

function buildLooseRegex(phrase) {
  const normalized = normalizeText(phrase);
  let pattern = '';
  for (const char of normalized) {
    pattern += `${char}+[^a-zA-Z0-9]*`;
  }
  return new RegExp(`\\b${pattern}\\b`, 'i');
}

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === 'url_verification') {
    return res.status(200).send(challenge);
  }

  if (event && event.type === 'message' && !event.subtype) {
    if (event.user === botUserId) return res.sendStatus(200);

    const rawText = event.text || '';
    const normalizedText = normalizeText(rawText.toLowerCase());

    const hardMatch = hardPhrases.find(phrase => buildLooseRegex(phrase).test(normalizedText));
    const softMatch = softPhrases.find(phrase => buildLooseRegex(phrase).test(normalizedText));

    try {
      const permalink = await slack.chat.getPermalink({
        channel: event.channel,
        message_ts: event.ts,
      });

      const userInfo = await slack.users.info({ user: event.user });
      const username = userInfo.user?.real_name || userInfo.user?.name || `<@${event.user}>`;

      if (hardMatch) {
        // Firehouse alert with Block Kit and button
        await slack.chat.postMessage({
          channel: process.env.FIREHOUSE,
          text: `Message auto-deleted in <#${event.channel}> by <@${event.user}>.`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `:rotating_light: *Auto-Deleted Message Detected* :rotating_light:\n*User:* <@${event.user}> (${username})\n*Channel:* <#${event.channel}>\n*Message:* ${event.text}`
              }
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `🔗 <${permalink.permalink}|View original message>`
                }
              ]
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Mark as Dealt With",
                    emoji: true
                  },
                  value: "mark_dealt_with",
                  action_id: "mark_dealt_with"
                }
              ]
            }
          ]
        });

        await userSlack.chat.delete({
          channel: event.channel,
          ts: event.ts
        });

        await slack.chat.postEphemeral({
          channel: event.channel,
          user: event.user,
          text: 'Message deleted due to Code of Conduct violation.',
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: ":rotating_light: *MESSAGE DELETED*\nYour message violated the Hack Club Code of Conduct. A Fire Department member will contact you soon. Please keep Hack Club a safe space. Repeated violations may result in a ban."
              }
            }
          ]
        });

        await slack.chat.postMessage({
          channel: event.user,
          text: 'Message deleted due to Code of Conduct violation.',
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: ":rotating_light: *MESSAGE DELETED*\nYour message violated the Hack Club Code of Conduct. A Fire Department member will contact you soon. Please keep Hack Club a safe space. Repeated violations may result in a ban."
              }
            }
          ]
        });

      } else if (softMatch) {
        await slack.chat.postMessage({
          channel: process.env.REVIEW,
          text: `Possible flagged message from <@${event.user}> in <#${event.channel}>.`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `:warning: *Potentially Inappropriate Message*\n*User:* <@${event.user}> (${username})\n*Channel:* <#${event.channel}>\n*Message:*\n>>> ${event.text}`
              }
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `🔗 <${permalink.permalink}|View message>`
                }
              ]
            }
          ]
        });

        await base(airtableTable).create({
          "Display Name (user)": username,
          "User ID": event.user,
          "Message": event.text
        });
      }
    } catch (err) {
      console.error('error:', err);
    }
  }

  res.sendStatus(200);
});

app.listen(port,() => {
  console.log(`Server running on port ${port}`);
});