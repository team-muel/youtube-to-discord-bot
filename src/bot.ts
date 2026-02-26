import { Client, GatewayIntentBits, ChannelType, ForumChannel, AttachmentBuilder, TextChannel } from 'discord.js';
import { supabase } from './supabase';

// Create a new client instance
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', () => {
  console.log(`[Discord Bot] Ready! Logged in as ${client.user?.tag}`);
  logEvent('Bot started successfully', 'info');
});

client.on('error', (error) => {
  console.error('[Discord Bot] Error:', error);
  logEvent(`Bot error: ${error.message}`, 'error');
});

// Helper to log events to DB
export async function logEvent(message: string, type: 'info' | 'error' | 'success', user_id?: string) {
  try {
    await supabase.from('logs').insert([{ message, type, user_id }]);
  } catch (err) {
    console.error('Failed to write log to DB:', err);
  }
}

// Function to trigger a new forum post
export async function createForumThread(forumChannelId: string, title: string, content: string, imageBase64?: string, user_id?: string) {
  if (!client.isReady()) {
    throw new Error('Discord bot is not ready or not configured.');
  }

  try {
    const channel = await client.channels.fetch(forumChannelId);

    if (!channel) {
      throw new Error('Channel not found.');
    }

    if (channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      throw new Error('Target channel is not a Forum or Text Channel.');
    }

    const messageOptions: any = { content: content };
    
    // If an image was pasted, convert base64 to a buffer and attach it
    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const attachment = new AttachmentBuilder(buffer, { name: 'uploaded_image.png' });
      messageOptions.files = [attachment];
    }

    let thread;
    if (channel.type === ChannelType.GuildForum) {
      const forumChannel = channel as ForumChannel;
      // Create a thread in the forum channel
      thread = await forumChannel.threads.create({
        name: title.substring(0, 100), // Discord thread names are limited to 100 chars
        message: messageOptions,
      });
    } else {
      const textChannel = channel as TextChannel;
      // Create a thread in the text channel
      thread = await textChannel.threads.create({
        name: title.substring(0, 100),
      });
      // Send the message to the newly created thread
      await thread.send(messageOptions);
    }

    logEvent(`Created new thread: ${title}`, 'success', user_id);
    return thread;
  } catch (error: any) {
    console.error('[Discord Bot] Error creating thread:', error);
    logEvent(`Failed to create thread: ${error.message}`, 'error', user_id);
    throw error;
  }
}

// Start the bot if token is available
export function startBot(token: string) {
  if (!token) {
    console.log('[Discord Bot] No token provided, bot will not start.');
    return;
  }
  
  client.login(token).catch((err) => {
    console.error('[Discord Bot] Failed to login:', err);
    logEvent(`Login failed: ${err.message}`, 'error');
  });
}
