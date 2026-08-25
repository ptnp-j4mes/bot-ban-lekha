import { MobileApi } from '../../../shared/src/api';
import { config } from './config';
import { store } from './storage';

export const api = new MobileApi(config, store, 'jwt', () => store.get('org_id'));
