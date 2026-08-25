import * as Keychain from 'react-native-keychain';
import type { TokenStore } from '../../../shared/src/types';

export const store: TokenStore = {
  async get(key) {
    const value = await Keychain.getGenericPassword({ service: `bot-ban-lekha.customer.${key}` });
    return value ? value.password : null;
  },
  async set(key, value) {
    await Keychain.setGenericPassword('session', value, { service: `bot-ban-lekha.customer.${key}` });
  },
  async remove(key) {
    await Keychain.resetGenericPassword({ service: `bot-ban-lekha.customer.${key}` });
  },
};
