import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30_000,
});

/** ML detect/retrain may run up to 120s on backend. */
export const ML_TIMEOUT_MS = 120_000;

export default api;
