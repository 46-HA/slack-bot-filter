require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const bodyParser = require('body-parser');
const Airtable = require('airtable');

const app = express();
const slack = new WebClient(process.env.TOKEN);
const userSlack = new WebClient(process.env.USER_TOKEN);
const port = process.env.PORT;

const bannedWords = process.env.BANNED_WORDS
  ? process.env.BANNED_WORDS.split(',').map(w => w.trim().toLowerCase())
  : [];

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const airtableTable = process.env.AIRTABLE_TABLE;

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

app.use(bodyParser.json({ verify: verifySlackRequest }));

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;
  if (type === 'url_verification') return res.status(200).send({ challenge });

  if (event && event.type === 'message' && !event.subtype) {
    if (event.user === botUserId) return res.sendStatus(200);

    const text = event.text?.toLowerCase();
    if (!text) return res.sendStatus(200);

    const matchedWords = bannedWords.filter(word => text.includes(word));
    if (matchedWords.length === 0) return res.sendStatus(200);

    try {
      const permalink = await slack.chat.getPermalink({
        channel: event.channel,
        message_ts: event.ts,
      });

      const userInfo = await slack.users.info({ user: event.user });
      const username = userInfo.user?.real_name || userInfo.user?.name || `<@${event.user}>`;

      await slack.chat.postMessage({
        channel: process.env.FIREHOUSE,
        text: `:siren-real: <@U062U3SQ2T1> ${matchedWords.join(', ')} :siren-real:\n*user:* <@${event.user}> (${username})\n*message:* >>> ${event.text}\n🔗 <${permalink.permalink}>`
      });

      await userSlack.chat.delete({
        channel: event.channel,
        ts: event.ts
      });

      await slack.chat.postEphemeral({
        channel: event.channel,
        user: event.user,
        text:
          ':siren-real: MESSAGE DELETED :siren-real:\n' +
          "Your message violated <https://hackclub.com/conduct/|Hack Club's Code of Conduct>. " +
          'A Fire Department member should contact you soon. If you believe this was an error, please let us know. ' +
          'Using words that violate our Code of Conduct can result in a *permanent ban* depending on their severity. ' +
          'Please try to keep Hack Club a safe space for everyone. Thank you.'
      });

      await slack.chat.postMessage({
        channel: event.user,
        text:
          ':siren-real: MESSAGE DELETED :siren-real:\n' +
          "Your message violated <https://hackclub.com/conduct/|Hack Club's Code of Conduct>. " +
          'A Fire Department member should contact you soon. If you believe this was an error, please let us know. ' +
          'Using words that violate our Code of Conduct can result in a *permanent ban* depending on their severity. ' +
          'Please try to keep Hack Club a safe space for everyone. Thank you.'
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

  res.sendStatus(200);
});

app.listen(port);
