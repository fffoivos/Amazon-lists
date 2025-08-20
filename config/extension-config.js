/**
 * Central Configuration for Amazon List Sidebar Extension
 * All configurable values in one place for easy maintenance
 */

const CONFIG = {
  // Privacy and Security Settings
  PRIVACY: {
    ALLOWED_DOMAINS: [
      'amazon.com',
      'amazon.ca',
      'amazon.co.uk',
      'amazon.de',
      'amazon.fr',
      'amazon.es',
      'amazon.it',
      'amazon.co.jp'
    ],
    REQUIRE_HTTPS: true,
    TOP_FRAME_ONLY: true,
    MESSAGE_TYPES: [
      'UPDATE_LISTS',
      'UPDATE_PRODUCT',
      'GET_STORED_LISTS',
      'ADD_TO_LIST',
      'REQUEST_LISTS',
      'OPEN_SIDEBAR',
      'CREATE_LIST'
    ],
    STRIP_DOM_REFERENCES: true,
    MAX_STRING_LENGTH: 1000
  },

  // Site Interaction Settings
  INTERACTION: {
    // Retry configuration
    RETRY: {
      MAX_ATTEMPTS: 10,
      BASE_DELAY_MS: 200,
      MAX_DELAY_MS: 5000,
      USE_EXPONENTIAL_BACKOFF: false
    },
    
    // Element finding configuration
    SELECTORS: {
      PRODUCT_TITLE: [
        'xpath://*[@id="productTitle"]',
        '#productTitle',
        '[data-feature-name="title"]'
      ],
      PRODUCT_PRICE: [
        '.a-price-whole',
        '.a-price-range',
        '.a-price.a-text-price',
        '.a-price-value'
      ],
      PRODUCT_IMAGE: [
        '#landingImage',
        '#imgBlkFront',
        '.a-dynamic-image'
      ],
      ADD_TO_LIST_BUTTON: [
        '#add-to-wishlist-button',
        'a[data-action="a-dropdown-button"]',
        'span[data-action="a-dropdown-button"]',
        '.a-button-dropdown',
        '[aria-label*="Add to List"] .a-dropdown-button',
        '[data-action="add-to-registry-baby-button"]',
        'span.a-button-dropdown',
        'a.a-button-dropdown'
      ],
      LIST_POPOVER: [
        '.a-popover[aria-hidden="false"]',
        '#atwl-popover-inner',
        '.a-dropdown'
      ],
      LIST_NAME_ELEMENTS: [
        'span[id^="atwl-list-name-"]'
      ],
      LIST_LINK_PREFIX: '#atwl-link-to-list-',
      LIST_PRIVACY_PREFIX: '#atwl-list-privacy-',
      CREATE_LIST_LINK: '#atwl-dd-create-list',
      CREATE_LIST_MODAL: '.a-popover-modal[aria-label*="Create a new list"]',
      LIST_NAME_INPUT: '#list-name',
      CREATE_BUTTON: '#wl-redesigned-create-list .a-button-input',
      CREATE_SUCCESS_MESSAGE: '#wl-huc-post-create-msg'
    },
    
    // Timing configuration
    TIMING: {
      ELEMENT_WAIT_TIMEOUT_MS: 3000,
      POPOVER_WAIT_TIMEOUT_MS: 5000,
      CONFIRMATION_WAIT_TIMEOUT_MS: 1500,
      POPOVER_RENDER_DELAY_MS: 100,
      MUTATION_DEBOUNCE_MS: 100,
      CREATE_MODAL_WAIT_MS: 3000,
      CREATE_CONFIRMATION_WAIT_MS: 5000
    },
    
    // Event simulation
    EVENT_SIMULATION: {
      USE_POINTER_EVENTS: true,
      SIMULATE_HOVER: true,
      SCROLL_INTO_VIEW: true
    }
  },

  // Convenience Features Settings
  CONVENIENCE: {
    // Auto-update configuration
    AUTO_UPDATE: {
      ENABLED: true,
      DELAY_MS: 50,
      URL_POLL_INTERVAL_MS: 100,
      TRIGGERS: ['url', 'visibility', 'focus', 'popstate']
    },
    
    // Caching configuration
    CACHE: {
      TTL_MINUTES: 60,
      AUTO_CLEANUP: true,
      CLEANUP_INTERVAL_MINUTES: 5
    },
    
    // Quick access (recent lists)
    QUICK_ACCESS: {
      MAX_ITEMS: 5,
      STORAGE_KEY: 'recentLists'
    },
    
    // Filter persistence
    FILTER: {
      PERSIST_DROPDOWN_SEARCH: true,
      SESSION_STORAGE_KEY: 'als_list_filter',
      AUTO_RESTORE: true
    },
    
    // User feedback
    FEEDBACK: {
      DEFAULT_DURATION_MS: 3000,
      LOADING_DURATION_MS: 0,
      TYPES: ['info', 'success', 'warning', 'error', 'loading']
    },
    
    // State preservation
    STATE: {
      AUTO_SAVE: true,
      SAVE_DELAY_MS: 500,
      PRESERVE_KEYS: ['searchTerm', 'currentTab', 'scrollPosition']
    }
  },

  // Storage Configuration
  STORAGE: {
    PREFER_SYNC: true,
    SYNC_SIZE_LIMIT_KB: 100,
    NAMESPACE: 'als',
    CACHE_ENABLED: true,
    
    // Storage keys
    KEYS: {
      LISTS: 'storedLists',
      PRODUCT_INFO: 'productInfo',
      RECENT_LISTS: 'recentLists',
      SETTINGS: 'settings',
      PERSIST_DROPDOWN: 'persistDropdownSearch',
      LAST_UPDATED: 'lastUpdated',
      MIGRATION_VERSION: '_migration_version',
      DEVICE_ID: '_device_id'
    }
  },

  // Message passing configuration
  MESSAGING: {
    DEBOUNCE_LIST_UPDATE_MS: 150,
    MAX_MESSAGE_SIZE_KB: 100
  },

  // Product detection patterns
  PRODUCT_DETECTION: {
    URL_PATTERNS: [
      /(?:^|\/)(?:dp\/|gp\/product\/|gp\/aw\/d\/)/i
    ],
    ASIN_PATTERN: /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})/i,
    OG_TYPE_PATTERN: /product/i
  },

  // Confirmation detection patterns
  CONFIRMATION_PATTERNS: [
    { selector: '.huc-atwl-header-main', text: /added|moved|already/i },
    { selector: '[role="alert"]', text: /\b(item|items)\s+(added|moved)\s+to\b/ },
    { selector: '.a-popover', text: /already in|view your list/i }
  ],

  // Development/Debug settings
  DEBUG: {
    LOGGING_ENABLED: false,
    LOG_PREFIX: '[ALS]',
    PERFORMANCE_MONITORING: false
  }
};

// Make configuration immutable in production
if (typeof Object.freeze === 'function') {
  deepFreeze(CONFIG);
}

function deepFreeze(obj) {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach(prop => {
    if (obj[prop] !== null && 
        (typeof obj[prop] === 'object' || typeof obj[prop] === 'function') && 
        !Object.isFrozen(obj[prop])) {
      deepFreeze(obj[prop]);
    }
  });
  return obj;
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}