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
SIGNING=(signing-secret)
FIREHOUSE=(channel ID to send the logs to)
BANNED_WORDS=(bad words, use this format: bad,word,chicken)
PORT=(port number your server will run on)`

### **Step 4**
On your Slack app settings:

Add the necessary OAuth scopes: 
`channels:history, channels:read, chat:write, chat:write.public, users:read, groups:read`

Allow Event Subscriptions and set the Request URL to your endpoint. I used Ngrok for testing

Subscribe `message.channels` event