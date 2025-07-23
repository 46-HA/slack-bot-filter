require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const fetch = require('node-fetch');
const FormData = require('form-data');
const bodyParser = require('body-parser');

const app = express();
const slack = new WebClient(process.env.TOKEN);
const userSlack = new WebClient(process.env.USER_TOKEN);
const port = process.env.PORT || 3001;

const bannedWordsByChannel = new Map();

function verifySlackRequest(req, res, buf) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSignature = req.headers['x-slack-signature'];
  if (!timestamp || !slackSignature) throw new Error('Missing Slack signature or timestamp');
  if (Math.abs(Date.now() / 1000 - timestamp) > 60 * 5) throw new Error('Request timestamp too old');
  const baseString = `v0:${timestamp}:${buf.toString()}`;
  const hmac = crypto.createHmac('sha256', process.env.SIGNING);
  hmac.update(baseString);
  const mySignature = 'v0=' + hmac.digest('hex');
  const sigBuffer = Buffer.from(slackSignature, 'utf8');
  const mySigBuffer = Buffer.from(mySignature, 'utf8');
  if (sigBuffer.length !== mySigBuffer.length || !crypto.timingSafeEqual(sigBuffer, mySigBuffer)) {
    throw new Error('Invalid Slack signature');
  }
}

app.use(bodyParser.json({ verify: verifySlackRequest }));
app.use(bodyParser.urlencoded({ extended: true, verify: verifySlackRequest }));

async function getChannelManagers(channelId) {
  const formData = new FormData();
  formData.append('token', process.env.XOXC || '');
  formData.append('entity_id', channelId);
  try {
    const response = await fetch('https://slack.com/api/admin.roles.entity.listAssignments', {
      method: 'POST',
      body: formData,
      headers: { Cookie: `d=${encodeURIComponent(process.env.XOXD || '')}` },
    });
    const json = await response.json();
    if (!json.ok) {
      if (json.error !== 'invalid_auth') {
        console.warn('Enterprise API error:', json.error);
      }
      return [];
    }
    return json.role_assignments[0]?.users || [];
  } catch {
    return [];
  }
}

async function getChannelCreator(channelId) {
  try {
    const channelInfo = await slack.conversations.info({ channel: channelId });
    return channelInfo.channel?.creator || null;
  } catch {
    return null;
  }
}

async function isChannelManager(userId, channelId) {
  const managers = await getChannelManagers(channelId);
  if (managers.length > 0) return managers.includes(userId);
  const creator = await getChannelCreator(channelId);
  return creator === userId;
}

function containsBannedPhrase(channelId, text) {
  if (!bannedWordsByChannel.has(channelId)) return null;
  const bannedSet = bannedWordsByChannel.get(channelId);
  const lowerText = text.toLowerCase();
  for (const phrase of bannedSet) {
    if (lowerText.includes(phrase.toLowerCase())) return phrase;
  }
  return null;
}

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;
  if (type === 'url_verification') return res.status(200).send(challenge);
  if (!event || event.type !== 'message' || event.subtype || !event.text) return res.sendStatus(200);
  if (event.bot_id) return res.sendStatus(200);
  const bannedPhrase = containsBannedPhrase(event.channel, event.text);
  if (bannedPhrase) {
    try {
      await userSlack.chat.delete({ channel: event.channel, ts: event.ts });
      await slack.chat.postEphemeral({
        channel: event.channel,
        user: event.user,
        text: `The phrase *${bannedPhrase}* is banned in this channel. Your message was deleted.`,
      });
    } catch (err) {
      console.error('Error deleting message or sending ephemeral:', err);
    }
  }
  res.sendStatus(200);
});

app.post('/slack/commands', async (req, res) => {
  const { command, channel_id, user_id, text } = req.body;

  if (command === '/add-banned') {
    if (!text || !text.trim()) {
      return res.json({ response_type: 'ephemeral', text: 'Please provide one or more comma-separated phrases to ban.' });
    }
    const allowed = await isChannelManager(user_id, channel_id);
    if (!allowed) {
      return res.json({ response_type: 'ephemeral', text: 'Only channel managers or creators can add banned phrases.' });
    }
    const phrases = text.split(',').map(p => p.trim()).filter(p => p.length > 0);
    if (!bannedWordsByChannel.has(channel_id)) bannedWordsByChannel.set(channel_id, new Set());
    const bannedSet = bannedWordsByChannel.get(channel_id);
    phrases.forEach(p => bannedSet.add(p.toLowerCase()));
    return res.json({ response_type: 'ephemeral', text: `Added banned phrases for this channel: ${phrases.join(', ')}` });
  }

  if (command === '/view-list') {
    const bannedSet = bannedWordsByChannel.get(channel_id);
    if (!bannedSet || bannedSet.size === 0) {
      return res.json({ response_type: 'ephemeral', text: 'No banned phrases set for this channel.' });
    }
    return res.json({ response_type: 'ephemeral', text: `Banned phrases for this channel: ${[...bannedSet].join(', ')}` });
  }

  if (command === '/remove-word') {
    if (!text || !text.trim()) {
      return res.json({ response_type: 'ephemeral', text: 'Please provide one or more comma-separated phrases to remove.' });
    }
    const allowed = await isChannelManager(user_id, channel_id);
    if (!allowed) {
      return res.json({ response_type: 'ephemeral', text: 'Only channel managers or creators can remove banned phrases.' });
    }
    const phrasesToRemove = text.split(',').map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
    if (!bannedWordsByChannel.has(channel_id)) {
      return res.json({ response_type: 'ephemeral', text: 'No banned phrases set for this channel.' });
    }
    const bannedSet = bannedWordsByChannel.get(channel_id);
    let removed = [];
    phrasesToRemove.forEach(phrase => {
      if (bannedSet.delete(phrase)) removed.push(phrase);
    });
    if (removed.length === 0) {
      return res.json({ response_type: 'ephemeral', text: 'None of the specified phrases were found in the banned list.' });
    }
    return res.json({ response_type: 'ephemeral', text: `Removed banned phrases: ${removed.join(', ')}` });
  }

  res.sendStatus(404);
});

app.listen(port, () => {
  console.log(`Slack bot running on port ${port}`);
});
