![Cat GIF](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTYxbnJkN2ExZ3Z0MnppbDk3OXNuc2VpNTZ3cHprOWVlNzBreTlqNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/VbnUQpnihPSIgIXuZv/giphy.gif)  
*GIF by [MOODMAN](https://giphy.com/gifs/computer-cat-wearing-glasses-VbnUQpnihPSIgIXuZv)*


## **Filter**

Hello! This is a very simple filter bot for Slack. Here is how you can set it up:

### **Step 1**
Clone the repo

### **Step 2**
Install dependencies by running:
`npm install express crypto @slack/web-api body-parser dotenv`

### **Step 3**
Create a `.env` file and add the following variables:

`TOKEN=(bot-token)
USER_TOKEN=(user-token)
SIGNING=(signing-secret)
FIREHOUSE=(channel ID to send the logs to)
BANNED_WORDS=(bad words, use this format: bad,word,chicken)
PORT=(port number your server will run on)`

### **Step 4**
On your Slack app settings:

Add the necessary OAuth scopes for the **bot token**:
`channels:history, channels:read, chat:write, chat:write.public, users:read, im:write, groups:read`

Add the necessary OAuth scopes for the **user token**:
`chat:write, im:write, users:read`

Enable Event Subscriptions and set the Request URL to your endpoint (e.g. your server URL).

Subscribe to: `message.channels`
