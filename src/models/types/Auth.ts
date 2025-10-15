/**
 * Authentication types for codex-chrome extension
 * Based on the Rust implementation for consistency
 */

/**
 * Authentication modes supported by the extension
 */
export enum AuthMode {
  ChatGPT = 'chatgpt',
  ApiKey = 'api_key',
  Local = 'local'
}

/**
 * Plan types for user accounts
 */
export type KnownPlan = 'free' | 'pro' | 'team' | 'enterprise';

export type PlanType =
  | { type: 'known'; plan: KnownPlan }
  | { type: 'unknown'; plan: string };

/**
 * Authentication information structure
 * Mirrors the Rust CodexAuth struct
 */
export interface CodexAuth {
  mode: AuthMode;
  token?: string;
  refresh_token?: string;
  account_id?: string;
  plan_type?: PlanType;
  expires_at?: number;
}

/**
 * Authentication management interface
 * Provides methods for managing authentication state and tokens
 */
export interface AuthManager {
  /**
   * Get current authentication data
   */
  auth(): CodexAuth | null;

  /**
   * Refresh the authentication token
   */
  refresh_token(): Promise<void>;

  /**
   * Get account ID if available
   */
  get_account_id(): string | null;

  /**
   * Get plan type if available
   */
  get_plan_type(): PlanType | null;
}

/**
 * Token data structure for OAuth flows
 */
export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account_id?: string;
  plan_type?: PlanType;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  mode: AuthMode;
  apiKey?: string;
  oauthClientId?: string;
  oauthRedirectUri?: string;
}

/**
 * Authentication status
 */
export interface AuthStatus {
  isAuthenticated: boolean;
  mode?: AuthMode;
  accountId?: string;
  planType?: PlanType;
  expiresAt?: number;
}