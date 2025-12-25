// API Configuration for Emergency Aid System
// This file contains all API endpoints and configurations

const API_CONFIG = {
  // Base URL - Update for production
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',

  // Endpoints
  ENDPOINTS: {
    // Authentication
    AUTH: {
      LOGIN: '/auth/login',
      REGISTER: '/auth/register',
      LOGOUT: '/auth/logout',
      REFRESH_TOKEN: '/auth/refresh',
    },

    // Patient Endpoints
    PATIENT: {
      TRIGGER_SOS: '/patient/sos',
      GET_STATUS: '/patient/status',
      UPLOAD_DOCS: '/patient/documents',
      GET_ETA: '/patient/eta',
    },

    // Hospital Endpoints
    HOSPITAL: {
      GET_EMERGENCIES: '/hospital/emergencies',
      GET_CASE_DETAILS: '/hospital/case/:id',
      UPDATE_BED_COUNT: '/hospital/beds',
      ACCEPT_CASE: '/hospital/case/:id/accept',
      GET_PATIENT_PDF: '/hospital/patient/:id/pdf',
    },

    // Driver Endpoints
    DRIVER: {
      GET_ASSIGNMENT: '/driver/assignment',
      UPDATE_LOCATION: '/driver/location',
      START_NAVIGATION: '/driver/navigation/start',
      END_NAVIGATION: '/driver/navigation/end',
      HANDOVER_PATIENT: '/driver/handover',
    },
  },

  // Timeout settings (in ms)
  TIMEOUT: 10000,

  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY: 1000,
  },

  // Maps Configuration (Future)
  MAPS: {
    PROVIDER: 'leaflet', // OpenStreetMap tiles
    API_KEY: undefined,
  },

  // Feature Flags
  FEATURES: {
    REAL_TIME_TRACKING: false, // Enable when WebSocket ready
    PDF_VIEWER: false, // Enable when backend ready
    MAPS_INTEGRATION: false, // Enable when API keys ready
    VOICE_INPUT: false, // Enable when speech-to-text ready
  },
};

export default API_CONFIG;
