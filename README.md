![Cat GIF](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTYxbnJkN2ExZ3Z0MnppbDk3OXNuc2VpNTZ3cHprOWVlNzBreTlqNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/VbnUQpnihPSIgIXuZv/giphy.gif)

*GIF by [MOODMAN](https://giphy.com/gifs/computer-cat-wearing-glasses-VbnUQpnihPSIgIXuZv)*

# Filter Bot

This is a simple filter bot for Slack. It includes a list of words for review and another list for automatic deletion. Here is how you can set it up:

## Step 1
Clone the repo
`git clone https://github.com/46-HA/slack-bot-filter.git
`

## Step 2
Install dependencies by running:
```bash
npm install express crypto @slack/web-api body-parser dotenv airtable
```

## Step 3
Create a `.env` file and add the following variables:

```env
TOKEN=(bot-token)
USER_TOKEN=(user-token)
SIGNING=(signing-secret)
FIREHOUSE=(channel logs for automatic deletion)
REVIEW=(channel logs for reviewing. keep same if you want it sent to the same channel)
AIRTABLE_API_KEY=(personal access key)
AIRTABLE_BASE_ID=(base id)
AIRTABLE_TABLE=(name of the table)
PORT=(port number your server will run on)
```

Create a `.profanitylist` for words to be sent for review.
For example: 

Create a `.slurlist` for words to automatically delete.
For example: 
```
slur 1
slur 2
slur 3
```

```
test
chicken
badword
```



## Step 4
On your Slack app settings:

Add the necessary OAuth scopes for the **bot token**:
```
channels:history, channels:read, chat:write, chat:write.public, users:read, im:write, groups:read
```

Add the necessary OAuth scopes for the **user token**:
```
chat:write, im:write, users:read
```

Enable Event Subscriptions and set the Request URL to your endpoint (e.g. your server URL).

Subscribe to: `message.channels`

## Step 5: Airtable

Get a personal access token, link it to your base. Make sure to enable these **Scopes**:

```
data.records:read
data.records:write
schema.bases:read
```

Once created, put the token in your `.env` as `AIRTABLE_API_KEY`.

In your Airtable table, make sure it includes these columns:
- `"Display Name (user)"` (Single line text)
- `"User ID"` (Single line text)
- `"Message"` (Long text)

This logs all messages.
