import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// ------------------------------------------------------------
// Persistent session storage (secure session handling)
// supabase-js saves the session JSON so the app can restore a
// logged-in user after a restart. SecureStore keeps it encrypted
// on the device. Values are split into <=1500 character chunks
// because secure storage backends may reject very large values.
// ------------------------------------------------------------
const CHUNK_SIZE = 1500;

function chunkKey(key: string, index: number) {
  return `${key}__chunk__${index}`;
}

async function removeStoredValue(key: string) {
  const head = await SecureStore.getItemAsync(key);
  if (head !== null && head.startsWith('chunks:')) {
    const count = Number.parseInt(head.slice(7), 10);
    if (Number.isFinite(count)) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, i));
      }
    }
  }
  await SecureStore.deleteItemAsync(key);
}

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith('chunks:')) return head;

    const count = Number.parseInt(head.slice(7), 10);
    if (!Number.isFinite(count)) return null;

    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      value += part;
    }
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    await removeStoredValue(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
    await SecureStore.setItemAsync(key, `chunks:${count}`);
  },

  async removeItem(key: string): Promise<void> {
    await removeStoredValue(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
