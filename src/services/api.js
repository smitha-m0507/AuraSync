import axios from 'axios';

// Override with VITE_API_URL (e.g. in a .env file) to point the UI at another backend.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const isAuthEndpoint = originalRequest.url?.includes('/auth/');
      if (isAuthEndpoint) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const refreshResponse = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { accessToken } = refreshResponse.data.data;
        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        return api(originalRequest);
      } catch (refreshError) {
        const event = new CustomEvent('auth:logout');
        window.dispatchEvent(event);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export const setAccessToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const authAPI = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  getMe: () => api.get('/auth/me')
};

export const jobsAPI = {
  list: (params) => api.get('/jobs', { params }),
  remove: (jobId) => api.delete(`/jobs/${jobId}`),
  upload: (formData) => api.post('/jobs/upload', formData),
  getStatus: (jobId) => api.get(`/jobs/${jobId}/status`),
  getResult: (jobId) => api.get(`/jobs/${jobId}/result`),
  generateFlowchart: (jobId, force = false) => api.post(`/jobs/${jobId}/flowchart${force ? '?force=true' : ''}`),
  chat: (jobId, question) => api.post(`/jobs/${jobId}/chat`, { question }),
  clearChat: (jobId) => api.delete(`/jobs/${jobId}/chat`)
};

export const reportsAPI = {
  getAll: (params) => api.get('/reports', { params }),
  getOne: (id) => api.get(`/reports/${id}`),
  save: (data) => api.post('/reports', data),
  delete: (id) => api.delete(`/reports/${id}`),
  toggleStar: (id) => api.patch(`/reports/${id}/star`)
};

export const usersAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.patch('/users/profile', data),
  upgrade: () => api.patch('/users/upgrade')
};

export default api;