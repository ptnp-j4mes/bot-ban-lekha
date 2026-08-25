import type { MobileConfig } from '../../../shared/src/types';

declare const __DEV__: boolean;

export const config: MobileConfig = {
  apiBaseUrl: __DEV__ ? 'http://localhost:8787' : 'https://REPLACE_WITH_API_HOST',
  lineChannelId: '',
};
