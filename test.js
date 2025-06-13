require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const token = process.env.TOKEN; // your bot token here
const web = new WebClient(token);

(async () => {
  try {
    const res = await web.auth.test();
    console.log('Bot user ID:', res.user_id);
    console.log('Bot user name:', res.user);
  } catch (error) {
    console.error('Error fetching bot user info:', error);
  }
})();
