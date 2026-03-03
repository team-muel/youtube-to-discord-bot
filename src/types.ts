// shared type definitions used across the server

export interface JwtUser {
  id: string;
  username: string;
  avatar?: string | null;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number; // Unix timestamp in seconds
}

export interface Source {
  id: number;
  name: string;
  url: string;
  user_id: string;
  guild_id: string;
  channel_id: string;
  guild_name?: string;
  channel_name?: string;
  last_post_signature?: string;
  last_check_status?: string;
  last_check_error?: string | null;
  last_check_at?: string;
  created_at?: string;
}

export interface ScrapedYouTubePost {
  content: string;
  imageUrl: string;
  author: string;
}

export interface SettingsRow {
  key: string;
  value: string;
}

export interface LogRow {
  id: number;
  user_id: string;
  message: string;
  type: string;
  created_at?: string;
}

import express from 'express';
export interface AuthenticatedRequest extends express.Request {
  user: JwtUser;
}
