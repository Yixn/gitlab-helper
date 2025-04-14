export function saveToStorage(key, value) {
  try {
    if (typeof value === 'object') {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, value);
    }
    return true;
  } catch (error) {
    console.error(`Error saving to localStorage (${key}):`, error);
    return false;
  }
}
export function loadFromStorage(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) {
      return defaultValue;
    }
    if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn(`Failed to parse value for ${key} as JSON, returning as string instead`);
        return value;
      }
    }
    return value;
  } catch (error) {
    console.error(`Error loading from localStorage (${key}):`, error);
    return defaultValue;
  }
}