export function formatHours(seconds) {
  return seconds / 3600;
}
export function generateColorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 75%)`;
}
export function getContrastColor(bgColor) {
  if (bgColor.startsWith('hsl')) {
    const matches = bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
    if (matches && matches[1]) {
      const lightness = parseInt(matches[1], 10);
      return lightness > 60 ? 'black' : 'white';
    }
  }
  let r = 0,
    g = 0,
    b = 0;
  try {
    const elem = document.createElement('div');
    elem.style.backgroundColor = bgColor;
    document.body.appendChild(elem);
    const style = window.getComputedStyle(elem);
    const rgb = style.backgroundColor;
    document.body.removeChild(elem);
    const rgbMatch = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      r = parseInt(rgbMatch[1], 10);
      g = parseInt(rgbMatch[2], 10);
      b = parseInt(rgbMatch[3], 10);
    }
  } catch (e) {
    if (bgColor.startsWith('hsl')) {
      return bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/) ? parseInt(bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/)[1], 10) > 60 ? 'black' : 'white' : 'black';
    }
    return 'black';
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? 'black' : 'white';
}
export function isActiveInputElement(element) {
  if (element.tagName === 'INPUT') {
    const type = element.getAttribute('type');
    const typingInputs = ['text', 'password', 'email', 'search', 'tel', 'url', null, ''];
    return typingInputs.includes(type);
  }
  if (element.tagName === 'TEXTAREA') {
    return true;
  }
  if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') {
    return true;
  }
  return false;
}