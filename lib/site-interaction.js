/**
 * Site Interaction Layer
 * Provides robust DOM interaction utilities with fallback strategies
 */

class ElementFinder {
  constructor(selectorMap = {}, options = {}) {
    this.selectorMap = selectorMap;
    this.useXPath = options.useXPath !== false;
    this.useFallbacks = options.useFallbacks !== false;
    this.timeout = options.timeout || 3000;
  }

  find(elementType, container = document) {
    const selectors = this.selectorMap[elementType] || [];
    
    if (typeof selectors === 'string') {
      return this._findBySelector(selectors, container);
    }
    
    if (Array.isArray(selectors)) {
      for (const selector of selectors) {
        const element = this._findBySelector(selector, container);
        if (element) return element;
      }
    }
    
    if (this.useFallbacks) {
      return this._findByFallback(elementType, container);
    }
    
    return null;
  }

  _findBySelector(selector, container) {
    if (!selector) return null;
    
    if (selector.startsWith('xpath:') && this.useXPath) {
      return this._findByXPath(selector.substring(6), container);
    }
    
    try {
      return container.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  _findByXPath(xpath, container) {
    try {
      const result = document.evaluate(
        xpath, 
        container, 
        null, 
        XPathResult.FIRST_ORDERED_NODE_TYPE, 
        null
      );
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
  }

  _findByFallback(elementType, container) {
    return null;
  }

  async waitFor(elementType, options = {}) {
    const container = options.container || document;
    const timeout = options.timeout || this.timeout;
    const condition = options.condition || ((el) => true);
    
    const start = Date.now();
    
    return new Promise((resolve, reject) => {
      let observer;
      
      const check = () => {
        const element = this.find(elementType, container);
        if (element && condition(element)) {
          if (observer) observer.disconnect();
          return resolve(element);
        }
        
        if (Date.now() - start >= timeout) {
          if (observer) observer.disconnect();
          return reject(new Error(`Timeout waiting for ${elementType}`));
        }
      };
      
      check();
      
      observer = new MutationObserver(() => {
        try { check(); } catch (e) {}
      });
      
      const observerTarget = container === document ? document.body : container;
      if (observerTarget) {
        observer.observe(observerTarget, {
          childList: true,
          subtree: true,
          attributes: true
        });
      }
      
      setTimeout(() => {
        try { observer.disconnect(); } catch(e) {}
        reject(new Error(`Timeout waiting for ${elementType}`));
      }, timeout);
    });
  }
}

class EventSimulator {
  constructor(options = {}) {
    this.usePointerEvents = options.usePointerEvents !== false;
    this.simulateHover = options.simulateHover !== false;
    this.defaultDelay = options.defaultDelay || 0;
  }

  click(element, options = {}) {
    if (!element) return false;
    
    const delay = options.delay || this.defaultDelay;
    
    try {
      if (options.scrollIntoView !== false) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      
      if (delay > 0) {
        setTimeout(() => this._performClick(element, options), delay);
        return true;
      }
      
      return this._performClick(element, options);
    } catch (e) {
      return false;
    }
  }

  _performClick(element, options = {}) {
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1,
      ...options.eventOptions
    };
    
    try {
      if (this.simulateHover) {
        if (this.usePointerEvents && typeof PointerEvent === 'function') {
          element.dispatchEvent(new PointerEvent('pointerover', eventOptions));
        }
        element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
      }
      
      if (this.usePointerEvents && typeof PointerEvent === 'function') {
        element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
        element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
      }
      
      element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
      element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      element.dispatchEvent(new MouseEvent('click', eventOptions));
      
      return true;
    } catch (e) {
      return false;
    }
  }

  type(element, text, options = {}) {
    if (!element || typeof text !== 'string') return false;
    
    try {
      element.focus();
      
      if (options.clear) {
        element.value = '';
      }
      
      if (options.slowly) {
        return this._typeSlowly(element, text, options);
      }
      
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      if (options.submit) {
        element.dispatchEvent(new KeyboardEvent('keydown', { 
          key: 'Enter', 
          code: 'Enter', 
          bubbles: true 
        }));
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  _typeSlowly(element, text, options = {}) {
    const delay = options.typeDelay || 50;
    let index = 0;
    
    return new Promise((resolve) => {
      const typeChar = () => {
        if (index >= text.length) {
          if (options.submit) {
            element.dispatchEvent(new KeyboardEvent('keydown', { 
              key: 'Enter', 
              code: 'Enter', 
              bubbles: true 
            }));
          }
          return resolve(true);
        }
        
        element.value += text[index];
        element.dispatchEvent(new Event('input', { bubbles: true }));
        index++;
        
        setTimeout(typeChar, delay);
      };
      
      typeChar();
    });
  }
}

class DOMWatcher {
  constructor(options = {}) {
    this.debounceMs = options.debounceMs || 100;
    this.observers = new Map();
    this.callbacks = new Map();
    this.timers = new Map();
  }

  watch(target, callback, options = {}) {
    const id = this._generateId();
    
    const debouncedCallback = this._debounce(
      () => callback(target),
      options.debounce || this.debounceMs
    );
    
    const observer = new MutationObserver((mutations) => {
      debouncedCallback(mutations);
    });
    
    const observerOptions = {
      childList: options.childList !== false,
      subtree: options.subtree !== false,
      attributes: options.attributes !== false,
      characterData: options.characterData,
      attributeFilter: options.attributeFilter
    };
    
    observer.observe(target, observerOptions);
    
    this.observers.set(id, observer);
    this.callbacks.set(id, callback);
    
    return id;
  }

  unwatch(id) {
    const observer = this.observers.get(id);
    if (observer) {
      observer.disconnect();
      this.observers.delete(id);
      this.callbacks.delete(id);
      
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }
    }
  }

  unwatchAll() {
    for (const [id, observer] of this.observers) {
      observer.disconnect();
    }
    
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    
    this.observers.clear();
    this.callbacks.clear();
    this.timers.clear();
  }

  _debounce(func, wait) {
    let timeoutId;
    
    return function debounced(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), wait);
    };
  }

  _generateId() {
    return `watch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

class RetryManager {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.useExponentialBackoff = options.useExponentialBackoff !== false;
  }

  async retry(operation, options = {}) {
    const maxAttempts = options.maxAttempts || this.maxAttempts;
    const shouldRetry = options.shouldRetry || (() => true);
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation(attempt);
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
          throw error;
        }
        
        const delay = this._calculateDelay(attempt, options);
        await this._wait(delay);
      }
    }
    
    throw lastError;
  }

  _calculateDelay(attempt, options = {}) {
    const baseDelay = options.baseDelay || this.baseDelay;
    
    if (!this.useExponentialBackoff) {
      return baseDelay;
    }
    
    const multiplier = options.backoffMultiplier || this.backoffMultiplier;
    const delay = baseDelay * Math.pow(multiplier, attempt - 1);
    
    return Math.min(delay, options.maxDelay || this.maxDelay);
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ConfirmationDetector {
  constructor(patterns = [], options = {}) {
    this.patterns = patterns;
    this.timeout = options.timeout || 5000;
    this.checkInterval = options.checkInterval || 100;
  }

  async detect(options = {}) {
    const timeout = options.timeout || this.timeout;
    const patterns = options.patterns || this.patterns;
    const container = options.container || document;
    
    const start = Date.now();
    
    return new Promise((resolve) => {
      let observer;
      let intervalId;
      let settled = false;
      
      const done = (result) => {
        if (settled) return;
        settled = true;
        
        if (observer) observer.disconnect();
        if (intervalId) clearInterval(intervalId);
        
        resolve(result);
      };
      
      const check = () => {
        for (const pattern of patterns) {
          if (this._checkPattern(pattern, container)) {
            return done({ success: true, pattern });
          }
        }
        
        if (Date.now() - start >= timeout) {
          return done({ success: false, reason: 'timeout' });
        }
      };
      
      check();
      
      observer = new MutationObserver(() => check());
      observer.observe(container === document ? document.body : container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      
      intervalId = setInterval(check, this.checkInterval);
      
      setTimeout(() => done({ success: false, reason: 'timeout' }), timeout);
    });
  }

  _checkPattern(pattern, container) {
    if (typeof pattern === 'string') {
      const element = container.querySelector(pattern);
      return !!element;
    }
    
    if (pattern instanceof RegExp) {
      const text = container.textContent || '';
      return pattern.test(text);
    }
    
    if (typeof pattern === 'function') {
      return pattern(container);
    }
    
    if (pattern.selector && pattern.text) {
      const elements = container.querySelectorAll(pattern.selector);
      for (const el of elements) {
        const text = el.textContent || '';
        if (pattern.text instanceof RegExp) {
          if (pattern.text.test(text)) return true;
        } else if (text.includes(pattern.text)) {
          return true;
        }
      }
    }
    
    return false;
  }

  addPattern(pattern) {
    this.patterns.push(pattern);
  }

  clearPatterns() {
    this.patterns = [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ElementFinder,
    EventSimulator,
    DOMWatcher,
    RetryManager,
    ConfirmationDetector
  };
}